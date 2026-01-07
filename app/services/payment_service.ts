import crypto from 'node:crypto'
import axios from 'axios' // Используем axios, как в твоих контроллерах
import { DateTime } from 'luxon'
import Order from '#models/order'
import Plan from '#models/plan'
import env from '#start/env'
import BotPaymentConfig from '#models/bot_payment_config' 
export default class PaymentService {
  
  public async createPayment(
    botId: number, 
    userId: number, 
    planId: number, 
    provider: string
  ): Promise<string> {
    
    // 1. Получаем данные
    const plan = await Plan.findOrFail(planId)
    const config = await BotPaymentConfig.query()
        .where('bot_id', botId)
        .where('provider', provider)
        .first()

    if (!config || !config.isEnabled) {
        throw new Error(`Provider ${provider} is disabled or not configured`)
    }

    // 2. Создаем Order в статусе pending
    const order = await Order.create({
        botId,
        userId,
        planId,
        amount: plan.price,
        currency: plan.currency,
        paymentProvider: provider,
        status: 'pending'
    })

    // 3. Выбираем провайдера
    switch (provider) {
        case 'lava_ru':
            return await this._createLavaRu(order, config.credentials)
        case 'wata_pro':
            return await this._createWata(order, config.credentials)
        case 'heleket':
            return await this._createHeleket(order, config.credentials)
        default:
            throw new Error(`Unknown provider: ${provider}`)
    }
  }

  // ==========================================
  // 🟢 LAVA.RU (Legacy / Business API)
  // ==========================================
  private async _createLavaRu(order: Order, creds: any): Promise<string> {
      const url = 'https://api.lava.ru/business/invoice/create'
      
      const payload = {
          shopId: creds.shop_id,
          sum: Number(order.amount),
          orderId: String(order.id),
          hookUrl: `${env.get('APP_URL')}/webhooks/payment/lava_ru`,
          customFields: JSON.stringify({ bot_id: order.botId, tg_user_id: order.userId }),
          comment: `VPN Subscription #${order.id}`
      }

      const signature = crypto
          .createHmac('sha256', creds.secret_key)
          .update(JSON.stringify(payload))
          .digest('hex')

      try {
          const response = await axios.post(url, payload, {
              headers: {
                  'Content-Type': 'application/json',
                  'Signature': signature,
                  'Accept': 'application/json'
              }
          })
          
          const data = response.data
          const paymentUrl = data.url || data.data?.url
          
          if (paymentUrl) {
              order.externalId = data.id || data.data?.id
              await order.save()
              return paymentUrl
          }
          throw new Error('No URL in Lava RU response')
      } catch (e) {
          console.error('[Lava RU] Error:', e.response?.data || e.message)
          throw new Error('Lava RU creation failed')
      }
  }

 

  // ==========================================
  // 🔵 WATA.PRO
  // ==========================================
  private async _createWata(order: Order, creds: any): Promise<string> {
      // Используем тот же URL, что и в контроллере
      const url = 'https://api.wata.pro/api/h2h/links'
      const apiKey = creds.api_key // Bearer Token

      const payload = {
          amount: Number(order.amount),
          currency: "RUB", // Wata работает с RUB
          description: `VPN #${order.id}`,
          orderId: String(order.id),
          // Для бота редиректы менее важны, но API требует. Указываем заглушки или страницы сайта.
          successRedirectUrl: `${env.get('APP_URL')}/cabinet`, 
          failRedirectUrl: `${env.get('APP_URL')}/payment/fail`,
          expirationDateTime: DateTime.now().plus({ hours: 1 }).toISO(),
      }

      console.log('[Wata Bot] Request:', payload)

      try {
          const response = await axios.post(url, payload, {
              headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
              },
              timeout: 10000
          })

          const data = response.data
          if (data.url) {
              order.externalId = data.id
              await order.save()
              return data.url
          }
          throw new Error('No URL in Wata response')
      } catch (e) {
          console.error('[Wata Bot] Error:', e.response?.data || e.message)
          throw new Error('Wata creation failed')
      }
  }

  // ==========================================
  // 🟣 HELEKET
  // ==========================================
  private async _createHeleket(order: Order, creds: any): Promise<string> {
      const url = 'https://api.heleket.com/v1/payment'
      const merchantId = creds.merchant_id
      const secretKey = creds.secret_key

      // Формируем payload как в HeleketPaymentsController
      // Payer email необязателен в API, но если есть - хорошо. У бота может не быть.
      // Посылаем пустую строку или заглушку, если email нет.
      const payload = {
          amount: Number(order.amount).toFixed(2),
          currency: 'USD', // Heleket работает с USD
          order_id: String(order.id),
          payer_email: 'bot_user@uhuruvpn.com', // Заглушка, т.к. у TG юзера может не быть email
          url_success: `${env.get('APP_URL')}/cabinet`,
          url_return: `${env.get('APP_URL')}/cabinet`,
          url_callback: `${env.get('APP_URL')}/webhooks/payment/heleket`, // Наш вебхук для бота
          lifetime: 3600
      }

      // Генерация подписи: MD5(base64(json) + secret)
      const jsonPayload = JSON.stringify(payload)
      const base64Data = Buffer.from(jsonPayload).toString('base64')
      const sign = crypto.createHash('md5').update(base64Data + secretKey).digest('hex')

      try {
          const response = await axios.post(url, jsonPayload, {
              headers: {
                  'merchant': merchantId,
                  'sign': sign,
                  'Content-Type': 'application/json'
              }
          })

          const data = response.data

          // Проверяем state === 0
          if (data.state === 0 && data.result && data.result.url) {
              order.externalId = data.result.uuid
              await order.save()
              return data.result.url
          }
          
          console.error('[Heleket Bot] API Response:', data)
          throw new Error(data.message || 'Heleket error')
      } catch (e) {
          console.error('[Heleket Bot] Error:', e.response?.data || e.message)
          throw new Error('Heleket creation failed')
      }
  }
}