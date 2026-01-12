import { Bot, InlineKeyboard, Context, session, SessionFlavor } from 'grammy'
import { Update, UserFromGetMe, PreCheckoutQuery, SuccessfulPayment } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation'
import Order from '#models/order' // ✅ Добавлено
import PaymentService from '#services/payment_service'

export interface SessionData {
  isAwaitingPrompt: boolean
}

export type BotContext = Context & SessionFlavor<SessionData> & {
  config: BotModel
}

export default class BotService {
  // 🔥 Хранилище живых ботов
  private static instances = new Map<string, Bot<BotContext>>()

  private bot: Bot<BotContext>
  private config: BotModel
  private paymentService: PaymentService

  constructor(token: string, config: BotModel) {
    this.config = config
    this.paymentService = new PaymentService()

    // 1. ПРОВЕРКА: Если бот уже есть в памяти
    if (BotService.instances.has(token)) {
      this.bot = BotService.instances.get(token)!
      // Обновляем конфиг в памяти, чтобы подхватить новые ссылки/настройки
      this.config = config 
      return
    }

    // 2. СОЗДАНИЕ
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
      ctx.config = this.config 
      await next()
    })
    
    // Перехват ошибок
    this.bot.catch((err) => {
      console.error(`[Grammy Error] Bot ${config.name}:`, err)
    })

    // Регистрируем логику
    this.registerCommands()
    this.registerCallbacks()
    this.registerMessageHandlers()
    this.registerPaymentHandlers() // ✅ Stars: Обработчики платежей

    // Сохраняем в память
    BotService.instances.set(token, this.bot)
  }

  public async init(update: Update) {
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
        { credits: 10 }
      )

      const welcomeText = ctx.config.config?.welcome_text ||
        `👋 <b>Привет! Я AI Художник.</b>\nНажми кнопку ниже, чтобы начать.`

      await ctx.reply(welcomeText, {
        reply_markup: this.getDynamicKeyboard(ctx.config), // ✅ Передаем конфиг
        parse_mode: 'HTML',
      })
    })
  }

  // === ГЕНЕРАЦИЯ ===
private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
      // 1. Базовые проверки
      if (!ctx.from || ctx.message.text.startsWith('/')) return

      if (!ctx.session.isAwaitingPrompt) {
        return ctx.reply('👇 Чтобы сгенерировать картинку, сначала нажмите кнопку <b>"🎨 Начать рисовать"</b> в меню.', {
            parse_mode: 'HTML'
        })
      }

      const AiService = (await import('#services/ai_service')).default
      
      // 2. Загружаем данные
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      const currentBot = await BotModel.query()
        .where('id', ctx.config.id)
        .preload('aiModel') // 👈 Важно: подгружаем модель, чтобы узнать цену
        .first()
      
      const botUser = await BotUser.query()
        .where('bot_id', ctx.config.id)
        .where('user_id', globalUser.id)
        .first()

      // ==============================================================
      // 💰 РАСЧЕТ СТОИМОСТИ ГЕНЕРАЦИИ
      // ==============================================================
      
      // Базовая цена 1 кредита = $0.01
      const BASE_CREDIT_PRICE = 0.01 
      
      // Получаем цену модели из базы (если модели нет, считаем по минимуму 0.01)
      // costUsd мы добавили в миграции на прошлом шаге
      const modelCostUsd = currentBot?.aiModel?.costUsd ? Number(currentBot.aiModel.costUsd) : 0.01
      
      // Считаем сколько кредитов списать: Цена модели / 0.01
      // Пример: Flux ($0.01) -> 1 кредит
      // Пример: Recraft ($0.04) -> 4 кредита
      // Пример: Ideogram ($0.09) -> 9 кредитов
      const creditsToDeduct = Math.ceil(modelCostUsd / BASE_CREDIT_PRICE)

      // ==============================================================

      // 3. Проверка баланса с учетом цены модели
      if (!botUser || botUser.credits < creditsToDeduct) {
        ctx.session.isAwaitingPrompt = false
        return ctx.reply(
            `😔 <b>Недостаточно кредитов!</b>\n\n` +
            `Эта модель требует: <b>${creditsToDeduct} 💎</b>\n` +
            `У вас на балансе: <b>${botUser?.credits || 0} 💎</b>`, 
            {
                parse_mode: 'HTML',
                reply_markup: new InlineKeyboard().text('💎 Купить', 'buy_subscription'),
            }
        )
      }

      const modelSlug = currentBot?.aiModel?.slug || 'black-forest-labs/flux-dev'
      const msg = await ctx.reply(`🎨 <b>Генерирую...</b>\nСпишется кредитов: ${creditsToDeduct}`, { parse_mode: 'HTML' })

      try {
        const images = await AiService.generateImage(ctx.message.text, modelSlug)
        const resultUrl = Array.isArray(images) ? String(images[0]) : String(images)

        // 4. Списание кредитов (динамическое)
        botUser.credits -= creditsToDeduct
        await botUser.save()

        await Generation.create({
          userId: globalUser.id,
          botId: ctx.config.id,
          prompt: ctx.message.text,
          resultUrl: resultUrl,
          isSuccessful: true,
          // Можно добавить поле cost: creditsToDeduct, если хочешь вести статистику трат
        })

        await ctx.replyWithPhoto(resultUrl, {
          caption: `✅ Готово! Осталось: ${botUser.credits} генераций`,
          reply_markup: this.getDynamicKeyboard(ctx.config)
        })
        
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)
        ctx.session.isAwaitingPrompt = false

      } catch (e) {
        console.error('[Bot] Gen Error:', e)
        
        // При ошибке деньги НЕ списываем (botUser.save вызывается только в try)
        
        await Generation.create({
            userId: globalUser.id,
            botId: ctx.config.id,
            prompt: ctx.message.text,
            isSuccessful: false,
        })

        let errorMessage = '❌ <b>Ошибка генерации.</b>\nПопробуйте позже.'
        const errorString = String(e)

        if (errorString.includes('NSFW') || errorString.includes('sensitive') || errorString.includes('safety')) {
            errorMessage = '🔞 <b>Запрос отклонен фильтром безопасности.</b>\n\nПожалуйста, измените запрос.'
        } else if (errorString.includes('422')) {
            errorMessage = '❌ <b>Ошибка параметров модели.</b>'
        }

        try {
            await ctx.api.editMessageText(ctx.chat.id, msg.message_id, errorMessage, { parse_mode: 'HTML' })
        } catch {
            await ctx.reply(errorMessage, { parse_mode: 'HTML' })
        }
      }
    })
  }

  // === ОБРАБОТЧИКИ STARS (Платежи) ===
  private registerPaymentHandlers() {
    // 1. Pre-Checkout (Обязательно отвечать < 10 сек)
    this.bot.on('pre_checkout_query', async (ctx) => {
        try {
            await ctx.answerPreCheckoutQuery(true)
        } catch (e) {
            console.error('PreCheckout Error:', e)
        }
    })

    // 2. Успешная оплата
    this.bot.on('message:successful_payment', async (ctx) => {
        const payment: SuccessfulPayment = ctx.message.successful_payment
        const orderId = Number(payment.invoice_payload)

        const order = await Order.query()
            .where('id', orderId)
            .preload('user')
            .preload('bot')
            .preload('plan')
            .first()

        // Если заказ найден и еще не оплачен
        if (order && order.status !== 'paid') {
            const botUser = await BotUser.query()
                .where('bot_id', order.botId)
                .where('user_id', order.userId)
                .first()

            if (botUser) {
                // Начисляем
                botUser.credits += order.plan.credits
                await botUser.save()

                // Обновляем статус
                order.status = 'paid'
                order.providerResponse = payment
                await order.save()

                await ctx.reply(`⭐️ <b>Оплата принята!</b>\nНачислено: <b>${order.plan.credits}</b> кр.`, {
                    parse_mode: 'HTML'
                })
            }
        }
    })
  }

  // === CALLBACKS (Кнопки) ===
  private registerCallbacks() {
    
    this.bot.callbackQuery('start_gen_hint', async (ctx) => {
      ctx.session.isAwaitingPrompt = true 
      await ctx.reply('✍️ <b>Напишите ваш запрос:</b>', { parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('main_menu', async (ctx) => {
      ctx.session.isAwaitingPrompt = false
      const txt = ctx.config.config?.welcome_text || 'Главное меню'
      try {
        await ctx.editMessageText(txt, { reply_markup: this.getDynamicKeyboard(ctx.config), parse_mode: 'HTML' })
      } catch {}
      await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('profile', async (ctx) => {
        const globalUser = await User.findBy('telegramId', ctx.from.id)
        if(!globalUser) return
        
        const botUser = await BotUser.query()
            .where('bot_id', ctx.config.id)
            .where('user_id', globalUser.id)
            .first()
        if(!botUser) return
        
        const text = `👤 <b>Личный кабинет</b>\n\n🆔 ID: <code>${globalUser.telegramId}</code>\n💰 Доступно: <b>${botUser.credits}</b>`
        
        await ctx.editMessageText(text, {
            reply_markup: new InlineKeyboard().text('💎 Пополнить', 'buy_subscription').row().text('🔙 Меню', 'main_menu'),
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('buy_subscription', async (ctx) => {
        const plans = await Plan.query()
            .where('bot_id', ctx.config.id)
            .where('isActive', true)
            .orderBy('price', 'asc')

        if (plans.length === 0) return ctx.answerCallbackQuery({ text: 'Тарифы не настроены', show_alert: true })
        
        const kb = new InlineKeyboard()
        plans.forEach(p => {
            kb.text(`💎 ${p.name} (${p.credits} шт) — ${p.price}₽`, `select_plan:${p.id}`).row()
        })
        kb.text('🔙 Назад', 'main_menu')
        
        await ctx.editMessageText('👇 <b>Выберите пакет:</b>', { reply_markup: kb, parse_mode: 'HTML' })
        await ctx.answerCallbackQuery()
    })
    
    // ВЫБОР МЕТОДА ОПЛАТЫ
    this.bot.callbackQuery(/^select_plan:(\d+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const plan = await Plan.find(planId)
        if (!plan) return ctx.answerCallbackQuery('Тариф не найден')

        // Загружаем конфиги
        const currentBot = await BotModel.findOrFail(ctx.config.id)
        await currentBot.load('paymentConfigs')
        
        const configs = currentBot.paymentConfigs.filter(c => c.isEnabled)

        if (configs.length === 0) return ctx.answerCallbackQuery({ text: 'Нет методов оплаты', show_alert: true })

        const keyboard = new InlineKeyboard()
        
        configs.forEach(conf => {
            const btnName = this.getProviderName(conf.provider)
            // Если это Stars — отдельный обработчик, иначе общий через сервис
            const callbackData = conf.provider === 'telegram_stars' 
                ? `pay:${plan.id}:telegram_stars`
                : `pay:${plan.id}:${conf.provider}`
            
            keyboard.text(btnName, callbackData).row()
        })
        keyboard.text('🔙 Назад', 'buy_subscription')

        const text = `💳 Тариф: <b>${plan.name}</b>\n💰 Цена: <b>${plan.price}₽</b>` + (plan.starsPrice ? ` / <b>${plan.starsPrice} ⭐️</b>` : '')
        
        await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' })
        await ctx.answerCallbackQuery()
    })

    // ✅ ОПЛАТА ЧЕРЕЗ STARS
    this.bot.callbackQuery(/^pay:(\d+):telegram_stars$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const plan = await Plan.findOrFail(planId)
        const user = await User.findBy('telegramId', ctx.from.id)

        if (!user || !plan.starsPrice) {
            return ctx.answerCallbackQuery({ text: 'Оплата звездами недоступна', show_alert: true })
        }

        const order = await Order.create({
            userId: user.id,
            botId: ctx.config.id,
            planId: plan.id,
            amount: plan.starsPrice, // Важно: цена в звездах
            currency: 'XTR',
            paymentProvider: 'telegram_stars',
            status: 'pending'
        })

        await ctx.answerCallbackQuery()
        await ctx.replyWithInvoice(
            plan.name,
            `Пополнение баланса на ${plan.credits} шт.`,
            String(order.id),
            'XTR',
            [{ label: plan.name, amount: plan.starsPrice }]
        )
    })

    // Обычная оплата (ссылки)
    this.bot.callbackQuery(/^pay:(\d+):(.+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const provider = ctx.match[2]
        
        // Stars мы обработали выше, тут только внешние ссылки
        if (provider === 'telegram_stars') return

        const user = await User.findBy('telegramId', ctx.from.id)
        if (!user) return

        await ctx.answerCallbackQuery({ text: '⏳ Создаем счет...' })
        
        try {
            const paymentUrl = await this.paymentService.createPayment(ctx.config.id, user.id, planId, provider)
            const kb = new InlineKeyboard().url('🔗 Оплатить', paymentUrl).row().text('🔙 Отмена', `select_plan:${planId}`)
            
            await ctx.editMessageText(`✅ <b>Счет готов!</b>\nНажмите кнопку для оплаты.`, { reply_markup: kb, parse_mode: 'HTML' })
        } catch (e) {
            console.error('Payment Error:', e)
            await ctx.editMessageText(`❌ Ошибка создания платежа.`, { reply_markup: new InlineKeyboard().text('🔙 Назад', `select_plan:${planId}`) })
        }
    })
  }
  
  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      lava_ru: '💳 Банковская карта (Lava)',
      heleket: '🪙 Криптовалюта / USD',
      telegram_stars: '⭐️ Telegram Stars',
    }
    return names[provider] || provider.toUpperCase()
  }
  
  // ✅ Принимаем конфиг аргументом
  private getDynamicKeyboard(config: BotModel): InlineKeyboard {
    const kb = new InlineKeyboard()
      .text('🎨 Начать рисовать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile')
      .text('💎 Купить пакет', 'buy_subscription').row()

    if (config.supportUrl) kb.url('🆘 Поддержка', config.supportUrl)
    if (config.offerUrl) kb.url('📄 Оферта', config.offerUrl)

    return kb
  }
}