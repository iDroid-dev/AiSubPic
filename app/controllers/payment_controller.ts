import { HttpContext } from '@adonisjs/core/http'
import Order from '#models/order'
import User from '#models/user' // Исправили импорт
import Bot from '#models/bot'
import BotUser from '#models/bot_user'
import { Bot as GrammyBot } from 'grammy'
import Plan from '#models/plan'
// import { DateTime } from 'luxon' // Если нужно продлевать дату, раскомментируй

export default class BotPaymentWebhookController {

    public async index({ view }: HttpContext) {
    const orders = await Order.query()
      .preload('user')
      .preload('bot')
      .preload('plan')
      .orderBy('created_at', 'desc')

    return view.render('pages/admin/payments/index', { orders })
  }

 public async approve({ params, response, session }: HttpContext) {
    // 1. Загружаем заказ вместе с пользователем и ботом
    const order = await Order.query()
      .where('id', params.id)
      .preload('user')
      .preload('bot')
      .firstOrFail()

    if (order.status === 'paid') {
      session.flash('error', 'Заказ уже оплачен')
      return response.redirect().back()
    }

    const plan = await Plan.findOrFail(order.planId)
    const botUser = await BotUser.query()
      .where('bot_id', order.botId)
      .where('user_id', order.userId)
      .first()

    if (botUser) {
      // 2. Начисляем кредиты
      botUser.credits += plan.credits
      await botUser.save()

      // 3. Обновляем статус заказа
      order.status = 'paid'
      order.providerResponse = { manual_approve_by: 'admin', date: new Date().toISOString() }
      await order.save()

      // 4. ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ В ТЕЛЕГРАМ
      try {
        const { Bot } = await import('grammy')
        const bot = new Bot(order.bot.token)
        
        const notificationText = 
          `✅ <b>Оплата подтверждена!</b>\n\n` +
          `Вам начислено: <b>${plan.credits}</b> генераций.\n` +
          `Спасибо, что пользуетесь нашим сервисом!`

        await bot.api.sendMessage(order.user.telegramId!, notificationText, {
          parse_mode: 'HTML'
        })
      } catch (telegramError) {
        console.error('[Approve Notification Error]:', telegramError)
        // Мы не прерываем процесс, если уведомление не ушло (например, бот заблокирован)
      }

      session.flash('success', `Заказ #${order.id} подтвержден. Начислено ${plan.credits} кр. Юзер уведомлен.`)
    } else {
      session.flash('error', 'Связь пользователя с ботом не найдена.')
    }

    return response.redirect().back()
  }

  /**
   * 🟢 LAVA RU WEBHOOK
   */
  public async handleLavaRu({ request, response }: HttpContext) {
    // 🛡 СПИСОК РАЗРЕШЕННЫХ IP (LAVA)
    const allowedIps = ['62.122.173.38', '91.227.144.73', '31.133.222.20']
    const clientIp = request.ip()

    // ⛔️ ПРОВЕРКА IP
    if (!allowedIps.includes(clientIp)) {
        console.warn(`[Webhook Lava RU] 🚨 BLOCKED IP: ${clientIp}`)
        return response.forbidden('Access denied')
    }

    const body = request.body()
    
    // Lava шлет 'order_id' или 'orderId'
    const internalId = body.order_id || body.orderId
    const externalId = body.invoice_id || body.invoiceId
    const status = body.status

    if (!internalId && !externalId) return response.ok('No ID provided')

    // Ищем заказ
    const order = await Order.query()
        .where((query) => {
            if (internalId) query.where('id', internalId)
            // Используем externalId (так названо свойство в модели)
            if (externalId) query.orWhere('externalId', externalId)
        })
        .preload('plan')
        .preload('user') // Подгружаем юзера сразу
        .first()

    if (!order) return response.ok('Order not found')

    // Проверяем статус платежа и статус заказа
    if ((status === 'success' || status === 'completed') && order.status === 'pending') {
        await this._activateSubscription(order, externalId, body)
    }

    return response.ok('OK')
  }

  /**
   * 🔵 WATA.PRO WEBHOOK
   */
  public async handleWata({ request, response }: HttpContext) {
    const body = request.body()
    
    const internalId = body.orderId
    const externalId = body.transactionId
    const status = body.transactionStatus

    if (!internalId && !externalId) return response.ok('Missing data')

    const order = await Order.query()
        .where((query) => {
            if (internalId) query.where('id', internalId)
            if (externalId) query.orWhere('externalId', externalId)
        })
        .preload('plan')
        .preload('user')
        .first()
    
    if (!order) return response.ok('Order not found')

    if (status === 'Paid' && order.status === 'pending') {
        await this._activateSubscription(order, externalId, body)
    }

    return response.ok('OK')
  }

  /**
   * 🟣 HELEKET WEBHOOK
   */
  public async handleHeleket({ request, response }: HttpContext) {
    const body = request.body()

    const internalId = body.order_id
    const externalId = body.uuid
    const status = body.status 

    if (!internalId && !externalId) return response.ok('No order ID')

    const order = await Order.query()
        .where((query) => {
            if (internalId) query.where('id', internalId)
            if (externalId) query.orWhere('externalId', externalId)
        })
        .preload('plan')
        .preload('user')
        .first()

    if (!order) return response.ok('Order not found')

    const isPaid = status === 'paid' || body.payment_status === 'success'
    
    if (isPaid && order.status === 'pending') {
         await this._activateSubscription(order, externalId || 'heleket_id', body)
    }

    return response.json({ state: 0 })
  }


  // =============================================
  // ⚡️ ЛОГИКА АКТИВАЦИИ (Начисление генераций)
  // =============================================
private async _activateSubscription(order: Order, externalPaymentId: string, payload: any) {
    
    // 1. Обновляем статус заказа
    order.status = 'paid'
    if (externalPaymentId) {
        order.externalId = externalPaymentId
    }
    // Сохраняем ответ провайдера (JSON) для истории
    order.providerResponse = payload 
    await order.save()

    // 2. Начисляем кредиты в BotUser (Локальный баланс в конкретном боте)
    // Используем updateOrCreate, чтобы найти связь или создать новую, если её вдруг нет
    const botUser = await BotUser.updateOrCreate(
        { 
            botId: order.botId, 
            userId: order.userId 
        },
        { 
            // Если запись создается впервые, остальные поля будут дефолтными,
            // а кредиты мы начислим ниже.
        }
    )

    // Добавляем кредиты из плана
    const creditsToAdd = order.plan.credits || 0
    botUser.credits += creditsToAdd
    
    await botUser.save()
    
    console.log(`✅ Order #${order.id}: Charged User ${order.userId} in Bot ${order.botId} with ${creditsToAdd} credits. Total: ${botUser.credits}`)

    // 3. Уведомляем пользователя через бота
    // Передаем botUser.credits, чтобы показать правильный остаток именно в этом боте
    await this._notifyUser(order, order.user, creditsToAdd, botUser.credits)
  }

  // Обнови сигнатуру метода _notifyUser, чтобы принимать актуальный баланс
  private async _notifyUser(order: Order, user: User, creditsAdded: number, currentBalance: number) {
      try {
          const botConfig = await Bot.find(order.botId)
          if (!botConfig) return

          const bot = new GrammyBot(botConfig.token)
          
          await bot.api.sendMessage(
            Number(user.telegramId), 
            `🚀 <b>Оплата прошла успешно!</b>\n\n` +
            `Вам начислено: <b>${creditsAdded} генераций</b>\n` +
            `Текущий баланс: <b>${currentBalance}</b>\n\n` +
            `Приятного использования!`, 
            { parse_mode: 'HTML' }
          )
      } catch (e) {
          console.error('Notify Error:', e)
      }
  }
}