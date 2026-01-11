// app/services/bot_service.ts
import { Bot, InlineKeyboard, Context, session, SessionFlavor } from 'grammy'
import { Update, UserFromGetMe } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation'
import PaymentService from '#services/payment_service'

export interface SessionData {
  isAwaitingPrompt: boolean
}

export type BotContext = Context & SessionFlavor<SessionData> & {
  config: BotModel
}

export default class BotService {
  // 🔥 Хранилище живых ботов (чтобы не терять память)
  private static instances = new Map<string, Bot<BotContext>>()

  private bot: Bot<BotContext>
  private config: BotModel
  private paymentService: PaymentService

  constructor(token: string, config: BotModel) {
    this.config = config
    this.paymentService = new PaymentService()

    // 1. ПРОВЕРКА: Если бот уже есть в памяти — берем его!
    if (BotService.instances.has(token)) {
      this.bot = BotService.instances.get(token)!
      
      // Обновляем конфиг в middleware "на лету", если он изменился в БД
      // (Это хак, чтобы не пересоздавать бота при смене названия/настроек)
      return
    }

    // 2. СОЗДАНИЕ: Если бота нет — создаем с нуля
    const botId = Number(token.split(':')[0])
    const botInfo = {
      id: botId,
      is_bot: true,
      first_name: config.name,
      username: config.username || `Bot_${botId}`,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as UserFromGetMe

    this.bot = new Bot<BotContext>(token, { botInfo })

    // Подключаем сессии
    this.bot.use(session({
      initial: (): SessionData => ({ isAwaitingPrompt: false }),
    }))

    // Прокидываем конфиг
    this.bot.use(async (ctx, next) => {
      // Всегда берем актуальный конфиг, переданный в конструктор
      ctx.config = this.config 
      await next()
    })
    
    // Перехват ошибок
    this.bot.catch((err) => {
      console.error(`[Grammy Error] Bot ${config.name}:`, err)
    })

    // Регистрируем логику (ТОЛЬКО ОДИН РАЗ при создании)
    this.registerCommands()
    this.registerCallbacks()
    this.registerMessageHandlers()

    // Сохраняем в память
    BotService.instances.set(token, this.bot)
  }

  /**
   * Теперь этот метод просто передает апдейт живому боту
   */
  public async init(update: Update) {
    // Мы больше не регистрируем команды здесь, чтобы не дублировать их
    await this.bot.handleUpdate(update)
  }

  // === КОМАНДЫ ===
  private registerCommands() {
    this.bot.command('start', async (ctx) => {
      if (!ctx.from) return
      ctx.session.isAwaitingPrompt = false

      const user = await User.updateOrCreate(
        { telegramId: ctx.from.id },
        {
          username: ctx.from.username,
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        }
      )

      await BotUser.firstOrCreate(
        { botId: ctx.config.id, userId: user.id },
        { credits: 1 }
      )

      const welcomeText = ctx.config.config?.welcome_text ||
        `👋 <b>Привет! Я AI Художник.</b>\nНажми кнопку ниже, чтобы начать.`

      await ctx.reply(welcomeText, {
        reply_markup: this.getDynamicKeyboard(ctx.config),
        parse_mode: 'HTML',
      })
    })
  }

  // === ГЕНЕРАЦИЯ ===
// === ГЕНЕРАЦИЯ ===
  private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
      // 0. Отсекаем лишнее
      if (!ctx.from || ctx.message.text.startsWith('/')) return

      console.log(`[Bot] Msg: "${ctx.message.text}" | State: ${ctx.session.isAwaitingPrompt}`)

      // 1. Проверяем состояние сессии
      if (!ctx.session.isAwaitingPrompt) {
        return ctx.reply('👇 Чтобы сгенерировать картинку, сначала нажмите кнопку <b>"🎨 Начать рисовать"</b> в меню.', {
            parse_mode: 'HTML'
        })
      }

      // Динамический импорт сервиса
      const AiService = (await import('#services/ai_service')).default
      
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      // 2. Получаем настройки бота и ВЫБРАННУЮ МОДЕЛЬ
      // Нам нужно загрузить связь aiModel, чтобы получить slug
      const currentBot = await BotModel.query()
        .where('id', ctx.config.id)
        .preload('aiModel')
        .first()
      
      const botUser = await BotUser.query()
        .where('bot_id', ctx.config.id)
        .where('user_id', globalUser.id)
        .first()

      // 3. Проверка баланса
      if (!botUser || botUser.credits <= 0) {
        ctx.session.isAwaitingPrompt = false
        return ctx.reply('😔 У вас закончились генерации.', {
          reply_markup: new InlineKeyboard().text('💎 Купить', 'buy_subscription'),
        })
      }

      // Определяем, какую модель использовать
      // Если в админке не выбрана модель (null), используем Flux Dev по умолчанию
      const modelSlug = currentBot?.aiModel?.slug || 'black-forest-labs/flux-dev'

      const msg = await ctx.reply(`🎨 <b>Генерирую...</b>\n<i>Модель: ${currentBot?.aiModel?.name || 'Flux Dev'}</i>`, { parse_mode: 'HTML' })

      try {
        // 4. Запуск генерации (передаем промпт и SLUG модели)
        const images = await AiService.generateImage(ctx.message.text, modelSlug)
        
        const resultUrl = Array.isArray(images) ? String(images[0]) : String(images)

        // Списываем баланс
        botUser.credits -= 1
        await botUser.save()

        // Сохраняем успех
        await Generation.create({
          userId: globalUser.id,
          botId: ctx.config.id,
          prompt: ctx.message.text,
          resultUrl: resultUrl,
          isSuccessful: true,
        })

        // Отправляем результат
        await ctx.replyWithPhoto(resultUrl, {
          caption: `✅ Готово! Осталось: ${botUser.credits}`,
          reply_markup: this.getDynamicKeyboard(ctx.config)
        })
        
        // Удаляем сообщение "Генерирую..."
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)
        
        // Сбрасываем ожидание
        ctx.session.isAwaitingPrompt = false

      } catch (e) {
        console.error('[Bot] Gen Error:', e)

        // Логируем неудачу в БД
        await Generation.create({
            userId: globalUser.id,
            botId: ctx.config.id,
            prompt: ctx.message.text,
            isSuccessful: false,
        })

        // Формируем текст ошибки
        let errorMessage = '❌ <b>Ошибка генерации.</b>\nПопробуйте позже.'
        const errorString = String(e)

        if (errorString.includes('NSFW') || errorString.includes('sensitive') || errorString.includes('safety')) {
            errorMessage = '🔞 <b>Запрос отклонен фильтром безопасности (NSFW).</b>\n\nПожалуйста, измените запрос.'
        } else if (errorString.includes('422')) {
            errorMessage = '❌ <b>Ошибка параметров модели.</b>\nАдминистратор неверно настроил модель.'
        }

        // Пытаемся изменить сообщение "Генерирую..." на ошибку
        try {
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, errorMessage, { 
                parse_mode: 'HTML' 
            })
        } catch (editError) {
            // Если изменить нельзя (например, удалено), шлем новое
            await ctx.reply(errorMessage, { parse_mode: 'HTML' })
        }
        
        // Не сбрасываем isAwaitingPrompt, чтобы юзер мог сразу повторить попытку
      }
    })
  }
  // === CALLBACKS ===
// === CALLBACKS (Обработка кнопок) ===
  private registerCallbacks() {
    
    // 1. Нажатие "Начать рисовать"
    this.bot.callbackQuery('start_gen_hint', async (ctx) => {
      ctx.session.isAwaitingPrompt = true // ✅ Включаем режим ожидания
      await ctx.reply('✍️ <b>Напишите ваш запрос для нейросети:</b>\n\n<i>Например: Девушка в футуристичном городе, киберпанк, неон.</i>', { parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    // 2. Кнопка "Главное меню"
    this.bot.callbackQuery('main_menu', async (ctx) => {
      ctx.session.isAwaitingPrompt = false // Сбрасываем ожидание
      const txt = ctx.config.config?.welcome_text || 'Главное меню'
      
      // try-catch нужен на случай, если сообщение не изменилось (Telegram выдаст ошибку)
      try {
        await ctx.editMessageText(txt, { reply_markup: this.getDynamicKeyboard(ctx.config), parse_mode: 'HTML' })
      } catch (e) {}
      
      await ctx.answerCallbackQuery()
    })

    // 3. Кнопка "Профиль"
    this.bot.callbackQuery('profile', async (ctx) => {
        const globalUser = await User.findBy('telegramId', ctx.from.id)
        if(!globalUser) return
        
        const botUser = await BotUser.query()
            .where('bot_id', ctx.config.id)
            .where('user_id', globalUser.id)
            .first()
            
        if(!botUser) return
        
        const text = `👤 <b>Личный кабинет</b>\n\n🆔 ID: <code>${globalUser.telegramId}</code>\n💰 Доступно генераций: <b>${botUser.credits}</b>`
        
        await ctx.editMessageText(text, {
            reply_markup: new InlineKeyboard()
                .text('💎 Пополнить баланс', 'buy_subscription').row()
                .text('🔙 В меню', 'main_menu'),
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })

    // 4. Кнопка "Купить пакет" (Список тарифов)
    this.bot.callbackQuery('buy_subscription', async (ctx) => {
        const plans = await Plan.query()
            .where('bot_id', ctx.config.id)
            .where('isActive', true)
            .orderBy('price', 'asc') // Сортируем по цене

        if (plans.length === 0) {
            return ctx.answerCallbackQuery({ text: 'Тарифы пока не настроены', show_alert: true })
        }
        
        const kb = new InlineKeyboard()
        plans.forEach(p => {
            // Кнопка вида: "💎 Start (10 шт) — 100₽"
            kb.text(`💎 ${p.name} (${p.credits} шт) — ${p.price}₽`, `select_plan:${p.id}`).row()
        })
        kb.text('🔙 Назад', 'main_menu')
        
        await ctx.editMessageText('👇 <b>Выберите подходящий пакет:</b>', { 
            reply_markup: kb, 
            parse_mode: 'HTML' 
        })
        await ctx.answerCallbackQuery()
    })
    
    // 5. Выбор метода оплаты (После выбора тарифа)
    this.bot.callbackQuery(/^select_plan:(\d+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const plan = await Plan.find(planId)
        
        if (!plan) return ctx.answerCallbackQuery('Тариф не найден')

        // Загружаем активные методы оплаты для ЭТОГО бота
        // Используем связь через модель Bot
        const currentBot = await BotModel.findOrFail(ctx.config.id)
        await currentBot.load('paymentConfigs')
        
        const configs = currentBot.paymentConfigs.filter(c => c.isEnabled)

        if (configs.length === 0) {
            return ctx.answerCallbackQuery({ 
                text: 'Методы оплаты не настроены администратором', 
                show_alert: true 
            })
        }

        const keyboard = new InlineKeyboard()
        configs.forEach(conf => {
            const btnName = this.getProviderName(conf.provider)
            // Формат callback: pay:ID_ПЛАНА:ПРОВАЙДЕР
            keyboard.text(btnName, `pay:${plan.id}:${conf.provider}`).row()
        })
        keyboard.text('🔙 Назад', 'buy_subscription')

        const text = `💳 Вы выбрали тариф: <b>${plan.name}</b>\n` +
                     `💰 К оплате: <b>${plan.price}₽</b>\n\n` +
                     `Выберите удобный способ оплаты:`

        await ctx.editMessageText(text, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })

    // 6. Генерация ссылки на оплату
    this.bot.callbackQuery(/^pay:(\d+):(.+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const provider = ctx.match[2]
        
        const user = await User.findBy('telegramId', ctx.from.id)
        if (!user) return

        await ctx.answerCallbackQuery({ text: '⏳ Создаем счет...' })
        
        try {
            // Обращаемся к PaymentService для создания ссылки
            const paymentUrl = await this.paymentService.createPayment(
                ctx.config.id, 
                user.id,        
                planId,         
                provider        
            )

            const keyboard = new InlineKeyboard()
                .url('🔗 Оплатить сейчас', paymentUrl).row()
                .text('🔙 Отмена', `select_plan:${planId}`)

            await ctx.editMessageText(
                `✅ <b>Счет сформирован!</b>\n\n` +
                `Нажмите кнопку ниже для оплаты.\n` +
                `<i>Генерации начислятся автоматически в течение 1-2 минут после оплаты.</i>`, 
                {
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            )
        } catch (error) {
            console.error('Payment Create Error:', error)
            await ctx.editMessageText(
                `❌ <b>Ошибка при создании платежа.</b>\nПопробуйте позже или выберите другой способ.`,
                {
                    reply_markup: new InlineKeyboard().text('🔙 Назад', `select_plan:${planId}`),
                    parse_mode: 'HTML'
                }
            )
        }
    })
  }
  
  // Вспомогательный метод для названий кнопок
  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      lava_ru: '💳 Банковская карта (Lava)',
      heleket: '🪙 Криптовалюта / USD',
    }
    return names[provider] || provider.toUpperCase()
  }
  
// app/services/bot_service.ts

  // 👇 Добавляем "config: BotModel" в скобки
  private getDynamicKeyboard(config: BotModel): InlineKeyboard {
    const kb = new InlineKeyboard()
      .text('🎨 Начать рисовать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile')
      .text('💎 Купить пакет', 'buy_subscription').row()

    // Теперь мы используем переданный config
    if (config.supportUrl) {
        kb.url('🆘 Поддержка', config.supportUrl)
    }

    if (config.offerUrl) {
        kb.url('📄 Оферта', config.offerUrl)
    }

    return kb
  }
}