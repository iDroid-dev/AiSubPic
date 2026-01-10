// app/controllers/telegram_webhooks_controller.ts
import { HttpContext } from '@adonisjs/core/http'
import { Update } from 'grammy/types'
import BotModel from '#models/bot'
import BotService from '#services/bot_service'

export default class TelegramWebhooksController {
  public async handle({ request, response, params }: HttpContext) {
    const token = params.token

    // 1. Ищем конфиг бота
    const botConfig = await BotModel.query()
      .where('token', token)
      .where('isActive', true)
      .first()

    if (!botConfig) {
      return response.status(200).send('Bot not found or inactive')
    }

    const body = request.body() as Update

    try {
      // 2. Делегируем всё сервису
      const botService = new BotService(token, botConfig)
      await botService.init(body)
    } catch (err) {
      console.error(`[Webhook Error] Bot: ${botConfig.name}:`, err)
    }

    return response.status(200).send('OK')
  }
}