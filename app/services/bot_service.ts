// app/services/bot_service.ts
import { Bot, InlineKeyboard, Context } from 'grammy'
import { Update, UserFromGetMe } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation'
import PaymentService from '#services/payment_service'

export type BotContext = Context & {
  config: BotModel
}

export default class BotService {
  private bot: Bot<BotContext>
  private config: BotModel
  private paymentService: PaymentService

  constructor(token: string, config: BotModel) {
    const botId = Number(token.split(':')[0])
    this.paymentService = new PaymentService()

    // Предопределяем информацию о боте, чтобы Grammy не запрашивал её каждый раз
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
    this.config = config

    // Middleware для проброса конфига в контекст всех обработчиков
    this.bot.use(async (ctx, next) => {
      ctx.config = this.config
      await next()
    })
  }

  /**
   * Инициализация и запуск обработки апдейта
   */
  public async init(update: Update) {
    this.registerCommands()
    this.registerCallbacks()
    this.registerMessageHandlers()

    // Глобальный перехватчик ошибок внутри Grammy
    this.bot.catch((err) => {
      console.error(`[Grammy Error] Bot: ${this.config.name}:`, err)
    })

    await this.bot.handleUpdate(update)
  }

  // === РЕГИСТРАЦИЯ КОМАНД ===
  private registerCommands() {
    this.bot.command('start', async (ctx) => {
      if (!ctx.from) return

      // 1. Создаем/обновляем глобального пользователя
      const user = await User.updateOrCreate(
        { telegramId: ctx.from.id },
        {
          username: ctx.from.username,
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        }
      )

      // 2. Привязываем юзера к конкретному боту
      await BotUser.firstOrCreate(
        {
          botId: this.config.id,
          userId: user.id,
        },
        {
          credits: 1, // Подарочная генерация
        }
      )

      const welcomeText = this.config.config?.welcome_text ||
        `👋 <b>Привет! Я AI Художник.</b>\nЯ могу превратить твой текст в шедевр.\n\nПросто напиши мне, что нарисовать!`

      await ctx.reply(welcomeText, {
        reply_markup: this.getDynamicKeyboard(),
        parse_mode: 'HTML',
      })
    })
  }

  // === ОБРАБОТКА СООБЩЕНИЙ (Генерация) ===
private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
      if (!ctx.from || ctx.message.text.startsWith('/')) return

      // Динамический импорт AI сервиса для ESM
      const AiService = (await import('#services/ai_service')).default



      const globalUser = await User.findBy('telegramId', ctx.from.id)

      // Проверка: если юзер не найден, выходим
      if (!globalUser) {
        return console.error('Пользователь не найден в базе данных')
      }

      const botUser = await BotUser.query()
        .where('bot_id', this.config.id)
        .where('user_id', globalUser.id)
        .first()

      // Проверка баланса
      if (!botUser || botUser.credits <= 0) {
        return ctx.reply('😔 У вас закончились генерации.\nКупите пакет, чтобы продолжить творчество!', {
          reply_markup: new InlineKeyboard().text('💎 Купить пакет', 'buy_subscription'),
        })
      }

      const msg = await ctx.reply('🎨 <b>Рисую...</b>\n<i>Это займет около 5-10 секунд</i>', { parse_mode: 'HTML' })

      try {
        const images = await AiService.generateImage(ctx.message.text)

        // Списание баланса
        botUser.credits -= 1
        await botUser.save()

        // Логируем успех
        await Generation.create({
          userId: globalUser.id,
          botId: this.config.id,
          prompt: ctx.message.text,
          resultUrl: images[0],
          isSuccessful: true,
        })

        await ctx.replyWithPhoto(images[0], {
          caption: `✅ Готово! Осталось генераций: ${botUser.credits}`,
        })
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)

      } catch (e) {
        console.error('Generation error:', e)

        // Логируем провал
        await Generation.create({
          userId: globalUser.id,
          botId: this.config.id,
          prompt: ctx.message.text,
          isSuccessful: false,
        })

        await ctx.api.editMessageText(
          ctx.chat.id,
          msg.message_id,
          '❌ <b>Ошибка генерации.</b>\nПопробуйте изменить запрос или повторите позже.',
          { parse_mode: 'HTML' }
        )
      }
    })
  }

  // === ОБРАБОТКА КНОПОК (Callbacks) ===
  private registerCallbacks() {
    // Главное меню
    this.bot.callbackQuery('main_menu', async (ctx) => {
      const welcomeText = this.config.config?.welcome_text || 'Главное меню'
      await ctx.editMessageText(welcomeText, {
        reply_markup: this.getDynamicKeyboard(),
        parse_mode: 'HTML',
      })
      await ctx.answerCallbackQuery()
    })

    // Личный кабинет
    this.bot.callbackQuery('profile', async (ctx) => {
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      const botUser = await BotUser.query()
        .where('bot_id', this.config.id)
        .where('user_id', globalUser.id)
        .first()

      if (!botUser) return

      const text = `👤 <b>Личный кабинет</b>\n\n🆔 Твой ID: <code>${globalUser.telegramId}</code>\n🎨 Остаток генераций: <b>${botUser.credits}</b>`

      const keyboard = new InlineKeyboard()
        .text('💎 Пополнить баланс', 'buy_subscription').row()
        .text('🔙 Назад', 'main_menu')

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    // Выбор пакета
    this.bot.callbackQuery('buy_subscription', async (ctx) => {
      const plans = await Plan.query()
        .where('bot_id', this.config.id)
        .where('isActive', true)
        .orderBy('price', 'asc')

      if (plans.length === 0) {
        return ctx.answerCallbackQuery({ text: 'Тарифы временно недоступны', show_alert: true })
      }

      const keyboard = new InlineKeyboard()
      plans.forEach((plan) => {
        keyboard.text(`💎 ${plan.name} (${plan.credits} шт) — ${plan.price}₽`, `select_plan:${plan.id}`).row()
      })
      keyboard.text('🔙 Назад', 'main_menu')

      await ctx.editMessageText('👇 <b>Выберите подходящий пакет генераций:</b>', {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      })
      await ctx.answerCallbackQuery()
    })

    // Выбор платежного метода
    this.bot.callbackQuery(/^select_plan:(\d+)$/, async (ctx) => {
      const planId = Number(ctx.match[1])
      const plan = await Plan.find(planId)
      if (!plan) return ctx.answerCallbackQuery('План не найден')

      const configs = await this.config.related('paymentConfigs').query().where('isEnabled', true)

      if (configs.length === 0) {
        return ctx.answerCallbackQuery({ text: 'Методы оплаты не настроены', show_alert: true })
      }

      const keyboard = new InlineKeyboard()
      configs.forEach((conf) => {
        const btnName = this.getProviderName(conf.provider)
        keyboard.text(btnName, `pay:${plan.id}:${conf.provider}`).row()
      })
      keyboard.text('🔙 Назад', 'buy_subscription')

      await ctx.editMessageText(`💳 Пакет: <b>${plan.name}</b>\nСтоимость: <b>${plan.price}₽</b>\n\nВыберите способ оплаты:`, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      })
      await ctx.answerCallbackQuery()
    })

    // Создание платежа
    this.bot.callbackQuery(/^pay:(\d+):(.+)$/, async (ctx) => {
      const planId = Number(ctx.match[1])
      const provider = ctx.match[2]
      const user = await User.findBy('telegramId', ctx.from.id)

      if (!user) return

      await ctx.answerCallbackQuery({ text: '⏳ Генерируем счет...' })

      try {
        const paymentUrl = await this.paymentService.createPayment(this.config.id, user.id, planId, provider)

        const keyboard = new InlineKeyboard()
          .url('🔗 Перейти к оплате', paymentUrl).row()
          .text('🔙 Отмена', 'buy_subscription')

        await ctx.editMessageText(
          `✅ <b>Счет успешно создан!</b>\n\nПосле оплаты генерации будут начислены автоматически в течение нескольких минут.`,
          { reply_markup: keyboard, parse_mode: 'HTML' }
        )
      } catch (e) {
        console.error('Payment Error:', e)
        await ctx.editMessageText('❌ <b>Ошибка платежной системы.</b>\nПопробуйте позже или выберите другой метод.', {
          reply_markup: new InlineKeyboard().text('🔙 Назад', 'buy_subscription'),
          parse_mode: 'HTML',
        })
      }
    })
  }

  // Вспомогательный метод для имен провайдеров
  private getProviderName(provider: string): string {
    const names: Record<string, string> = {
      lava_ru: 'Карты РФ (Lava)',
      wata_pro: 'Банковские карты (Wata)',
      heleket: 'Криптовалюта (Heleket)',
    }
    return names[provider] || provider
  }

  // Главное меню кнопок
  private getDynamicKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('🎨 Начать рисовать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile')
      .text('💎 Купить пакет', 'buy_subscription').row()
  }
}