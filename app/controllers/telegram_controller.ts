import { HttpContext } from '@adonisjs/core/http'
import { Update } from 'grammy/types'
import BotModel from '#models/bot'
import BotService from '../services/bot_service.js' // Импортируем наш новый сервис

export default class TelegramWebhookController {
  
  public async handle(ctx: HttpContext) {
    const { request, response, params } = ctx
    const token = params.token

    // 1. Проверяем бота
    const botConfig = await BotModel.findBy('token', token)
    if (!botConfig || !botConfig.isActive) {
      return response.status(200).send('Bot inactive')
    }

    // 2. Получаем тело запроса
    const body = request.body()
    if (!body || typeof body !== 'object') {
        return response.status(400).send('Invalid body')
    }

    try {
        // 3. ЗАПУСКАЕМ СЕРВИС
        // Создаем экземпляр сервиса и передаем управление
        const botService = new BotService(token, botConfig)
        
        // Передаем update (приводим тип для TS)
        await botService.init(body as Update)
        
    } catch (err) {
        console.error(`Error in bot ${botConfig.name}:`, err)
    }

    return response.status(200).send('OK')
  }
}