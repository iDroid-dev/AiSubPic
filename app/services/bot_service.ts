import { Bot, InlineKeyboard, Context } from 'grammy'
import { Update, UserFromGetMe } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation' // 👈 Добавили импорт
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

    const botInfo: UserFromGetMe = {
      id: botId,
      is_bot: true,
      first_name: config.name,
      username: config.username || `Bot_${botId}`,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false, 
    }

    this.bot = new Bot<BotContext>(token, { botInfo })
    this.config = config
    
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
        console.error(`Error in bot ${this.config.name}:`, err)
    })

    await this.bot.handleUpdate(update)
  }

  // === КОМАНДЫ ===
  private registerCommands() {
    this.bot.command('start', async (ctx) => {
      if (!ctx.from) return

      // 1. Создаем или обновляем Глобального Юзера
      const user = await User.updateOrCreate(
        { telegramId: ctx.from.id }, 
        {
          username: ctx.from.username,
          fullName: [ctx.from.first_name, ctx.from.last_name].join(' '),
        }
      )

      // 2. Привязываем юзера к текущему боту
      await BotUser.firstOrCreate(
        { 
            botId: this.config.id,
            userId: user.id 
        },
        {
            credits: 1 // 🎁 Даем 1 бесплатную генерацию при старте!
        }
      )

      const welcomeText = ctx.config.config?.welcome_text || 
        `👋 <b>Привет! Я AI Художник.</b>\nВыбери действие в меню.`
      
      await ctx.reply(welcomeText, {
        reply_markup: this.getDynamicKeyboard(),
        parse_mode: 'HTML'
      })
    })
  }

  // === СООБЩЕНИЯ (Генерация) ===
  private registerMessageHandlers() {
    // Динамический импорт сервиса AI
    const AiService = require('#services/ai_service').default 

    this.bot.on('message:text', async (ctx) => {
      // 1. Находим глобального юзера
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      // 2. Ищем кошелек в ЭТОМ боте
      const botUser = await BotUser.query()
        .where('bot_id', this.config.id)
        .where('user_id', globalUser.id)
        .first()

      // Если записи нет или кредитов <= 0
      if (!botUser || botUser.credits <= 0) {
          return ctx.reply('😔 У вас закончились генерации.\nКупите пакет в меню: "💎 Купить пакет"', {
              reply_markup: new InlineKeyboard().text('💎 Купить пакет', 'buy_subscription')
          })
      }

      const msg = await ctx.reply('🎨 <b>Рисую...</b>\n<i>(Это займет пару секунд)</i>', { parse_mode: 'HTML' })
      
      try {
        const images = await AiService.generateImage(ctx.message.text)
        
        // 3. Списание
        botUser.credits -= 1
        await botUser.save()

        // 4. ✅ Сохраняем УСПЕШНУЮ генерацию в историю
        await Generation.create({
            userId: globalUser.id,
            botId: this.config.id,
            prompt: ctx.message.text,
            resultUrl: images[0],
            isSuccessful: true
        })

        await ctx.replyWithPhoto(images[0], {
            caption: `✅ Готово! Осталось: ${botUser.credits}`
        })
        await ctx.api.deleteMessage(ctx.chat.id, msg.message_id)

      } catch (e) {
        console.error(e)

        // 5. ❌ Сохраняем ОШИБКУ в историю (чтобы видеть в админке, что были сбои)
        await Generation.create({
            userId: globalUser.id,
            botId: this.config.id,
            prompt: ctx.message.text,
            resultUrl: null,
            isSuccessful: false
        })

        await ctx.api.editMessageText(ctx.chat.id, msg.message_id, '❌ Ошибка генерации. Попробуйте другой запрос.')
      }
    })
  }

  // === CALLBACKS (Логика меню) ===
  private registerCallbacks() {
    
    // 1. ПРОФИЛЬ
    this.bot.callbackQuery('profile', async (ctx) => {
      const globalUser = await User.findBy('telegramId', ctx.from.id)
      if (!globalUser) return

      const botUser = await BotUser.query()
        .where('bot_id', this.config.id)
        .where('user_id', globalUser.id)
        .first()
      
      if (!botUser) return

      const text = `👤 <b>Личный кабинет</b>\n\n🆔 ID: <code>${globalUser.telegramId}</code>\n🎨 Осталось генераций: <b>${botUser.credits}</b>`

      const keyboard = new InlineKeyboard()
         .text('💎 Пополнить баланс', 'buy_subscription').row()
         .text('🔙 В главное меню', 'main_menu')

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' })
      await ctx.answerCallbackQuery()
    })

    // 2. ВЫБОР ПЛАНА
    this.bot.callbackQuery('buy_subscription', async (ctx) => {
        const plans = await Plan.query()
            .where('bot_id', this.config.id) 
            .where('is_active', true)
            .orderBy('sort_order', 'asc')

        if (plans.length === 0) {
            await ctx.answerCallbackQuery({ text: 'Тарифы пока не настроены', show_alert: true })
            return
        }

        const keyboard = new InlineKeyboard()
        plans.forEach(plan => {
            keyboard.text(
                `💎 ${plan.name} (${plan.credits} шт) — ${plan.price}₽`, 
                `select_plan:${plan.id}`
            ).row()
        })
        keyboard.text('🔙 Назад', 'main_menu')

        await ctx.editMessageText('👇 <b>Выберите подходящий пакет:</b>', {
            reply_markup: keyboard,
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })

    // 3. ВЫБОР ПЛАТЕЖКИ
    this.bot.callbackQuery(/^select_plan:(\d+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const plan = await Plan.find(planId)
        if (!plan) return ctx.answerCallbackQuery('План не найден')

        const configs = await this.config.related('paymentConfigs').query().where('isEnabled', true)

        if (configs.length === 0) {
           return ctx.answerCallbackQuery({ 
             text: 'Методы оплаты не настроены администратором', 
             show_alert: true 
           })
        }

        const keyboard = new InlineKeyboard()
        
        configs.forEach(conf => {
            const btnName = conf.provider === 'lava_ru' ? 'Lava (Карты РФ)' : 
                            conf.provider === 'wata_pro' ? 'Wata (Карты)' : 
                            conf.provider === 'heleket' ? 'Heleket (Crypto/USD)' : conf.provider
            
            keyboard.text(btnName, `pay:${plan.id}:${conf.provider}`).row()
        })
        
        keyboard.text('🔙 Назад', 'buy_subscription')

        await ctx.editMessageText(`💳 Тариф: <b>${plan.name}</b>\nК оплате: <b>${plan.price}₽</b>\n\nВыберите способ оплаты:`, {
            reply_markup: keyboard,
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })

    // 4. СОЗДАНИЕ ССЫЛКИ
    this.bot.callbackQuery(/^pay:(\d+):(.+)$/, async (ctx) => {
        const planId = Number(ctx.match[1])
        const provider = ctx.match[2]
        
        const user = await User.findBy('telegramId', ctx.from.id)
        if (!user) return

        await ctx.answerCallbackQuery({ text: '⏳ Формируем счет...' })
        await ctx.editMessageText('⏳ <b>Связываюсь с платежной системой...</b>', { parse_mode: 'HTML' })

        try {
            const paymentUrl = await this.paymentService.createPayment(
                this.config.id, 
                user.id,        
                planId,         
                provider        
            )

            const keyboard = new InlineKeyboard()
                .url('🔗 Оплатить', paymentUrl).row()
                .text('🔙 Отмена', 'buy_subscription')

            await ctx.editMessageText(
                `✅ <b>Счет сформирован!</b>\n\n` +
                `Нажмите кнопку ниже, чтобы оплатить.\n` +
                `<i>Генерации начислятся автоматически после оплаты.</i>`, 
                {
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            )
        } catch (error) {
            console.error('Payment create error:', error)
            await ctx.editMessageText(
                `❌ <b>Ошибка при создании платежа.</b>\nВозможно, неверные настройки API.\nПопробуйте позже.`,
                {
                    reply_markup: new InlineKeyboard().text('🔙 Назад', `select_plan:${planId}`),
                    parse_mode: 'HTML'
                }
            )
        }
    })

    // 5. ГЛАВНОЕ МЕНЮ
    this.bot.callbackQuery('main_menu', async (ctx) => {
        const welcomeText = this.config.config?.welcome_text || 'Главное меню'
        await ctx.editMessageText(welcomeText, {
            reply_markup: this.getDynamicKeyboard(),
            parse_mode: 'HTML'
        })
        await ctx.answerCallbackQuery()
    })
  }

  private getDynamicKeyboard(): InlineKeyboard {
      return new InlineKeyboard()
        .text('🎨 Начать генерацию', 'start_gen_hint') 
        .text('👤 Профиль', 'profile').row()
        .text('💎 Купить пакет', 'buy_subscription').row()
  }
}