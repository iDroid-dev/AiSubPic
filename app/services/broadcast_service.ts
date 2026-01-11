import { Bot } from 'grammy'
import Broadcast from '#models/broadcast'
import BotUser from '#models/bot_user'
import BotModel from '#models/bot'
import User from '#models/user'

class BroadcastService {
  
  /**
   * Запуск массовой рассылки
   */
  public async sendBroadcast(broadcastId: number) {
    const broadcast = await Broadcast.find(broadcastId)
    if (!broadcast) return

    // Меняем статус
    broadcast.status = 'processing'
    await broadcast.save()

    try {
      const botConfig = await BotModel.find(broadcast.botId)
      if (!botConfig) throw new Error('Бот удален')

      // Инициализируем бота
      const bot = new Bot(botConfig.token)

      // Получаем ВСЕХ пользователей этого бота
      // preload('user') нужен, чтобы взять telegramId
      const recipients = await BotUser.query()
        .where('bot_id', botConfig.id)
        .preload('user')

      broadcast.totalUsers = recipients.length
      await broadcast.save()

      // --- ЦИКЛ ОТПРАВКИ ---
      for (const recipient of recipients) {
        if (!recipient.user || !recipient.user.telegramId) continue

        try {
            // Отправляем
            if (broadcast.imageUrl) {
                await bot.api.sendPhoto(recipient.user.telegramId, broadcast.imageUrl, {
                    caption: broadcast.message,
                    parse_mode: 'HTML'
                })
            } else {
                await bot.api.sendMessage(recipient.user.telegramId, broadcast.message, {
                    parse_mode: 'HTML'
                })
            }
            
            broadcast.successCount++

        } catch (e) {
            console.error(`Failed to send to ${recipient.user.telegramId}:`, e.message)
            // Часто ошибка "Forbidden: bot was blocked by the user"
            // Можно добавить логику пометки юзера как "неактивного"
            broadcast.failCount++
        }

        // 💤 ВАЖНО: Пауза 50мс между сообщениями (20 в секунду)
        // Чтобы не словить 429 Too Many Requests
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Каждые 10 сообщений сохраняем прогресс в базу
        if ((broadcast.successCount + broadcast.failCount) % 10 === 0) {
            await broadcast.save()
        }
      }

      broadcast.status = 'completed'
      await broadcast.save()

    } catch (e) {
      console.error('Broadcast Fatal Error:', e)
      broadcast.status = 'failed'
      await broadcast.save()
    }
  }

  /**
   * Отправка одного сообщения (для админки юзера)
   */
  public async sendPersonalMessage(botId: number, userId: number, text: string) {
      const botConfig = await BotModel.findOrFail(botId)
      const user = await User.findOrFail(userId)
      
      const bot = new Bot(botConfig.token)
      
      await bot.api.sendMessage(user.telegramId!, text, { parse_mode: 'HTML' })
  }
}

export default new BroadcastService()