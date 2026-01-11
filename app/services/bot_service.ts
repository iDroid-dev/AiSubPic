// app/services/bot_service.ts
import { Bot, InlineKeyboard, Context, session, SessionFlavor } from 'grammy'
import { Update, UserFromGetMe } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation'
import PaymentService from '#services/payment_service'

// 1. Экспортируем интерфейс данных сессии
export interface SessionData {
  isAwaitingPrompt: boolean
}

// 2. Типизация контекста
export type BotContext = Context & SessionFlavor<SessionData> & {
  config: BotModel
}

export default class BotService {
  private bot: Bot<BotContext>
  private config: BotModel
  private paymentService: PaymentService

  constructor(token: string, config: BotModel) {
    const botId = Number(token.split(':')[0])
    this.paymentService = new PaymentService()

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

    // === ИСПРАВЛЕНО: Явное указание типа <SessionData> ===
    this.bot.use(session({
          initial: (): SessionData => ({ isAwaitingPrompt: false }),
        }))

    this.bot.use(async (ctx, next) => {
      ctx.config = this.config
      await next()
    })
  }

  public async init(update: Update) {
    this.registerCommands()
    this.registerCallbacks()
    this.registerMessageHandlers()

    this.bot.catch((err) => {
      console.error(`[Grammy Error] Bot: ${this.config.name}:`, err)
    })

    await this.bot.handleUpdate(update)
  }

  // === КОМАНДЫ ===
  private registerCommands() {
    this.bot.command('start', async (ctx) => {
      if (!ctx.from) return

      // Сбрасываем флаг при старте
      ctx.session.isAwaitingPrompt = false

      const user = await User.updateOrCreate(
        { telegramId: ctx.from.id },
        {
          username: ctx.from.username,
          fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        }
      )

      await BotUser.firstOrCreate(
        { botId: this.config.id, userId: user.id },
        { credits: 1 }
      )

      const welcomeText = this.config.config?.welcome_text ||
        `👋 <b>Привет! Я AI Художник.</b>\nНажми кнопку ниже, чтобы начать.`

      await ctx.reply(welcomeText, {
        reply_markup: this.getDynamicKeyboard(),
        parse_mode: 'HTML',
      })
    })
  }

  // === ГЕНЕРАЦИЯ ===
// === ГЕНЕРАЦИЯ ===
  private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
      // 0. Отсекаем команды и системные сообщения
      if (!ctx.from || ctx.message.text.startsWith('/')) return

      // ЛОГ ДЛЯ ОТЛАДКИ: Видим, что сообщение вообще пришло
      console.log(`[Bot] Message from ${ctx.from.id}: "${ctx.message.text}". State: ${ctx.session.isAwaitingPrompt}`)

      // 1. ПРОВЕРКА СОСТОЯНИЯ
      // Если юзер пишет текст, но не нажал кнопку — подсказываем ему
      if (!ctx.session.isAwaitingPrompt) {
        return ctx.reply('👇 Чтобы сгенерировать картинку, сначала нажмите кнопку <b>"🎨 Начать рисовать"</b> в меню.', {
            parse_mode: 'HTML'
        })
      }

      // 2. Логика генерации
      try {
          // Динамический импорт
          const AiService = (await import('#services/ai_service')).default
          console.log('[Bot] AI Service imported')

          const globalUser = await User.findBy('telegramId', ctx.from.id)
          if (!globalUser) {
              console.error('[Bot] User not found in DB')
              return
          }

          const botUser = await BotUser.query()
            .where('bot_id', this.config.id)
            .where('user_id', globalUser.id)
            .first()

          if (!botUser || botUser.credits <= 0) {
            ctx.session.isAwaitingPrompt = false
            return ctx.reply('😔 У вас закончились генерации.', {
              reply_markup: new InlineKeyboard().text('💎 Купить', 'buy_subscription'),
            })
          }

          const msg = await ctx.reply('🎨 <b>Отправляю запрос нейросети...</b>', { parse_mode: 'HTML' })

          // Вызов Replicate
          console.log('[Bot] Calling Replicate...')
          const images = await AiService.generateImage(ctx.message.text)
          console.log('[Bot] Replicate result:', images)

          const resultUrl = Array.isArray(images) ? String(images[0]) : String(images)

          botUser.credits -= 1
          await botUser.save()

          await Generation.create({
            userId: globalUser.id,
            botId: this.config.id,
            prompt: ctx.message.text,
            resultUrl: resultUrl,
            isSuccessful: true,
          })

          await ctx.replyWithPhoto(resultUrl, {
            caption: `✅ Готово! Осталось: ${botUser.credits}`,
            reply_markup: this.getDynamicKeyboard()
          })
          
          await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)
          ctx.session.isAwaitingPrompt = false // Сбрасываем ожидание

      } catch (e) {
        console.error('[Bot] Generation Error:', e) // ВОТ ЗДЕСЬ БУДЕТ ОШИБКА В КОНСОЛИ
        
        // Получаем ID пользователя, если удалось
        const uId = await User.findBy('telegramId', ctx.from.id)
        
        if (uId) {
            await Generation.create({
                userId: uId.id,
                botId: this.config.id,
                prompt: ctx.message.text,
                isSuccessful: false,
            })
        }

        await ctx.reply('❌ Ошибка генерации. Попробуйте позже.')
      }
    })
  }

  // === CALLBACKS ===
  private registerCallbacks() {
    this.bot.callbackQuery('start_gen_hint', async (ctx) => {
      ctx.session.isAwaitingPrompt = true // Включаем режим ожидания
      await ctx.reply('✍️ <b>Напишите ваш запрос для нейросети:</b>', { parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('main_menu', async (ctx) => {
      ctx.session.isAwaitingPrompt = false
      await ctx.editMessageText('Главное меню', { reply_markup: this.getDynamicKeyboard() })
      await ctx.answerCallbackQuery()
    })

    // ... тут твои остальные колбеки (profile, buy_subscription) ...
    // Вставь их из прошлого кода, чтобы не потерять логику оплаты
    this.bot.callbackQuery('profile', async (ctx) => {
        const globalUser = await User.findBy('telegramId', ctx.from.id)
        if(!globalUser) return
        const botUser = await BotUser.query().where('bot_id', this.config.id).where('user_id', globalUser.id).first()
        if(!botUser) return
        
        await ctx.editMessageText(`👤 ID: ${globalUser.telegramId}\n💰 Баланс: ${botUser.credits}`, {
            reply_markup: new InlineKeyboard().text('🔙 Назад', 'main_menu')
        })
        await ctx.answerCallbackQuery()
    })

    this.bot.callbackQuery('buy_subscription', async (ctx) => {
        const plans = await Plan.query().where('bot_id', this.config.id).where('isActive', true)
        if (plans.length === 0) return ctx.answerCallbackQuery('Нет тарифов')
        
        const kb = new InlineKeyboard()
        plans.forEach(p => kb.text(`${p.name} - ${p.price}₽`, `select_plan:${p.id}`).row())
        kb.text('🔙 Назад', 'main_menu')
        
        await ctx.editMessageText('Выберите тариф:', { reply_markup: kb })
        await ctx.answerCallbackQuery()
    })
  }

  private getDynamicKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('🎨 Начать рисовать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile')
      .text('💎 Купить пакет', 'buy_subscription')
  }
}