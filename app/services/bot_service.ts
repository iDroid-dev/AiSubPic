// app/services/bot_service.ts
import { Bot, InlineKeyboard, Context } from 'grammy'
import { Update, UserFromGetMe } from 'grammy/types'
import BotModel from '#models/bot'
import User from '#models/user'
import BotUser from '#models/bot_user'
import Plan from '#models/plan'
import Generation from '#models/generation'
import PaymentService from '#services/payment_service'

export type BotContext = Context & { config: BotModel }

export default class BotService {
  private bot: Bot<BotContext>
  private config: BotModel

  constructor(token: string, config: BotModel) {
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
    } as UserFromGetMe // Магия типизации

    this.bot = new Bot<BotContext>(token, { botInfo })
    this.config = config

    // Middleware для прокидывания конфига в контекст
    this.bot.use(async (ctx, next) => {
      ctx.config = this.config
      await next()
    })
  }

  public async init(update: Update) {
    this.registerCommands()
    this.registerCallbacks()
    this.registerMessageHandlers()

    // Запуск обработки
    await this.bot.handleUpdate(update)
  }

  private registerCommands() {
    this.bot.command('start', async (ctx) => {
      // ... логика из твоего старого сервиса (User.updateOrCreate и т.д.)
      await ctx.reply(`👋 Привет! Я ${ctx.me.first_name}`, {
         reply_markup: this.getDynamicKeyboard() 
      })
    })
  }

  private registerMessageHandlers() {
    this.bot.on('message:text', async (ctx) => {
       // ... логика генерации через AiService
    })
  }

  private registerCallbacks() {
    this.bot.callbackQuery('profile', async (ctx) => {
       // ... логика профиля
    })
    // ... остальные колбеки (платежи и т.д.)
  }

  private getDynamicKeyboard() {
    return new InlineKeyboard()
      .text('🎨 Начать', 'start_gen_hint').row()
      .text('👤 Профиль', 'profile').text('💎 Купить', 'buy_subscription')
  }
}