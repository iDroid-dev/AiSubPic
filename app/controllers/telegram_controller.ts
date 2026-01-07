import { HttpContext } from '@adonisjs/core/http'
import { Update } from 'grammy/types'
import { Bot as GrammyBot, Context} from 'grammy' // Добавляем Context
import BotModel from '#models/bot'

// 1. Описываем свой контекст
interface BotConfig {
  botId: number
  [key: string]: any // Для остальных полей из JSON
}

// Расширяем стандартный Context
type BotContext = Context & {
  config: BotConfig
}

export default class TelegramWebhookController {
  
  public async handle(ctx: HttpContext) {
    const { request, response, params } = ctx
    const token = params.token

    if (!token) {
        return response.badRequest('Missing token')
    }

    const botModel = await BotModel.query().where('token', token).first()
    
    if (!botModel || !botModel.isActive) {
      return response.ok('Bot not found or inactive') 
    }

    const body = request.body() as Update
    if (!body || typeof body !== 'object') {
        return response.ok('Invalid body') 
    }

    try {
        // 2. Указываем свой тип контекста при создании бота
        const bot = new GrammyBot<BotContext>(token)
        
        // Теперь TypeScript знает про ctx.config
        bot.use(async (ctx, next) => {
            ctx.config = { 
              botId: botModel.id, 
              ...botModel.config 
            }
            await next()
        })

        // Ваша логика (или вызов сервиса)
        bot.command('start', (ctx) => {
           // Здесь ctx.config тоже доступен и типизирован!
           console.log(`Bot ID: ${ctx.config.botId}`)
           return ctx.reply('Привет! Я работаю.')
        })

        await bot.handleUpdate(body) 

    } catch (err) {
        console.error(`Error processing webhook for bot ${botModel.id}:`, err)
    }

    return response.ok('OK')
  }
}