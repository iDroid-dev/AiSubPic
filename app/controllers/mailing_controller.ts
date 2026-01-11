import { HttpContext } from '@adonisjs/core/http'
import Bot from '#models/bot'
import Broadcast from '#models/broadcast'
import BroadcastService from '#services/broadcast_service'

export default class MailingController {
  
  // История рассылок
  public async index({ view }: HttpContext) {
    const broadcasts = await Broadcast.query()
        .preload('bot')
        .orderBy('created_at', 'desc')
        
    return view.render('pages/admin/mailing/index', { broadcasts })
  }

  // Форма создания
  public async create({ view }: HttpContext) {
    const bots = await Bot.query().where('isActive', true)
    return view.render('pages/admin/mailing/create', { bots })
  }

  // Запуск рассылки
  public async store({ request, response, session }: HttpContext) {
    const data = request.only(['bot_id', 'message', 'image_url'])
    
    // 1. Создаем запись
    const broadcast = await Broadcast.create({
        botId: data.bot_id,
        message: data.message,
        imageUrl: data.image_url || null,
        status: 'pending'
    })

    // 2. Запускаем процесс в фоне (без await, чтобы не держать страницу)
    BroadcastService.sendBroadcast(broadcast.id)

    session.flash('success', 'Рассылка запущена! Обновите страницу через минуту.')
    return response.redirect().toRoute('admin.mailing.index')
  }

  // Личное сообщение (вызывается из профиля юзера)
  public async sendPersonal({ request, response, session, params }: HttpContext) {
      const userId = params.id
      const { bot_id, message } = request.only(['bot_id', 'message'])

      try {
          await BroadcastService.sendPersonalMessage(bot_id, userId, message)
          session.flash('success', 'Сообщение отправлено!')
      } catch (e) {
          session.flash('error', `Ошибка отправки: ${e.message}`)
      }
      
      return response.redirect().back()
  }
}