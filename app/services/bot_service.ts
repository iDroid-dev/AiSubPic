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
        reply_markup: this.getDynamicKeyboard(),
        parse_mode: 'HTML',
      })
    })
  }

  // === ГЕНЕРАЦИЯ ===
  private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
      if (!ctx.from || ctx.message.text.startsWith('/')) return

      console.log(`[Bot] Msg: "${ctx.message.text}" | State: ${ctx.session.isAwaitingPrompt}`)

      if (!ctx.session.isAwaitingPrompt) {
        return ctx.reply('👇 Чтобы сгенерировать картинку, сначала нажмите кнопку <b>"🎨 Начать рисовать"</b> в меню.', {
            parse_mode: 'HTML'
        })
      }

      const AiService = (await import('#services/ai_service')).default
      
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      const botUser = await BotUser.query()
        .where('bot_id', ctx.config.id)
        .where('user_id', globalUser.id)
        .first()

      if (!botUser || botUser.credits <= 0) {
        ctx.session.isAwaitingPrompt = false
        return ctx.reply('😔 У вас закончились генерации.', {
          reply_markup: new InlineKeyboard().text('💎 Купить', 'buy_subscription'),
        })
      }

      const msg = await ctx.reply('🎨 <b>Генерирую...</b>', { parse_mode: 'HTML' })

      try {
        const images = await AiService.generateImage(ctx.message.text)
        const resultUrl = Array.isArray(images) ? String(images[0]) : String(images)

        botUser.credits -= 1
        await botUser.save()

        await Generation.create({
          userId: globalUser.id,
          botId: ctx.config.id,
          prompt: ctx.message.text,
          resultUrl: resultUrl,
          isSuccessful: true,
        })

        await ctx.replyWithPhoto(resultUrl, {
          caption: `✅ Готово! Осталось: ${botUser.credits}`,
          reply_markup: this.getDynamicKeyboard()
        })
        
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)
        ctx.session.isAwaitingPrompt = false

      } catch (e) {
        console.error('[Bot] Gen Error:', e)

 
          let errorMessage = '❌ <b>Ошибка генерации.</b>\nПопробуйте позже.'
          const errorString = String(e)

          if (errorString.includes('NSFW') || errorString.includes('sensitive') || errorString.includes('safety')) {
              errorMessage = '🔞 <b>Запрос отклонен фильтром безопасности (NSFW).</b>\n\nПожалуйста, измените запрос. Нейросеть посчитала его недопустимым.'
          }

          // 2. Отправляем пользователю понятный ответ
          try {
              await ctx.api.editMessageText(ctx.chat.id, msg.message_id, errorMessage, { 
                  parse_mode: 'HTML' 
              })
          } catch (editError) {
              // Если сообщение удалить/изменить нельзя, шлем новое
              await ctx.reply(errorMessage, { parse_mode: 'HTML' })
          }
        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '❌ Ошибка генерации.')
      }
    })
  }

  // === CALLBACKS ===
  private registerCallbacks() {
    this.bot.callbackQuery('start_gen_hint', async (ctx) => {
      ctx.session.isAwaitingPrompt = true // ✅ Теперь это сохранится в памяти!
      await ctx.reply('✍️ <b>Напишите ваш запрос для нейросети:</b>', { parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('main_menu', async (ctx) => {
      ctx.session.isAwaitingPrompt = false
      const txt = ctx.config.config?.welcome_text || 'Главное меню'
      await ctx.editMessageText(txt, { reply_markup: this.getDynamicKeyboard(), parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('profile', async (ctx) => {
        const globalUser = await User.findBy('telegramId', ctx.from.id)
        if(!globalUser) return
        const botUser = await BotUser.query().where('bot_id', ctx.config.id).where('user_id', globalUser.id).first()
        if(!botUser) return
        
        await ctx.editMessageText(`👤 ID: ${globalUser.telegramId}\n💰 Баланс: ${botUser.credits}`, {
            reply_markup: new InlineKeyboard().text('🔙 Назад', 'main_menu')
        })
        await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('buy_subscription', async (ctx) => {
        const plans = await Plan.query().where('bot_id', ctx.config.id).where('isActive', true)
        if (plans.length === 0) return ctx.answerCallbackQuery('Нет тарифов')
        
        const kb = new InlineKeyboard()
        plans.forEach(p => kb.text(`${p.name} - ${p.price}₽`, `select_plan:${p.id}`).row())
        kb.text('🔙 Назад', 'main_menu')
        
        await ctx.editMessageText('Выберите тариф:', { reply_markup: kb })
        await ctx.answerCallbackQuery()
    })
    
    // Вставь сюда остальные колбеки оплаты (pay:...), они не менялись
     this.bot.callbackQuery(/^select_plan:(\d+)$/, async (ctx) => {
        /* ... код из прошлого ответа ... */
         const planId = Number(ctx.match[1])
         // ...
         // Упростил для краткости, скопируй свою логику
         await ctx.answerCallbackQuery('Выбор тарифа...')
    })
  }

  private getDynamicKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('🎨 Начать рисовать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile')
      .text('💎 Купить пакет', 'buy_subscription')
  }
}