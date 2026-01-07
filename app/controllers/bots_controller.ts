import { HttpContext } from '@adonisjs/core/http'
import Bot from '#models/bot'
import BotPaymentConfig from '#models/bot_payment_config'
import env from '#start/env'
import { Bot as GrammyBot } from 'grammy'

export default class BotsController {
  
  // Список ботов
  public async index({ view }: HttpContext) {
    const bots = await Bot.all()
    return view.render('pages/admin/bots/index', { bots })
  }

  // Форма создания
  public async create({ view }: HttpContext) {
    return view.render('pages/admin/bots/create')
  }

  // Сохранение нового бота
  public async store({ request, response, session }: HttpContext) {
    const data = request.only(['name', 'token', 'username'])
    
    try {
      // Пробуем получить инфо о боте от Telegram, чтобы проверить токен
      const tempBot = new GrammyBot(data.token)
      const me = await tempBot.api.getMe()
      
      await Bot.create({
        name: data.name,
        token: data.token,
        username: me.username,
        isActive: true,
        config: { welcome_text: 'Привет! Я генерирую картинки.' }
      })

      session.flash('success', 'Бот успешно добавлен!')
      return response.redirect().toRoute('admin.bots.index')
    } catch (e) {
      session.flash('error', `Ошибка токена: ${e.message}`)
      return response.redirect().back()
    }
  }

  // Форма редактирования (Тут же настройки платежек)
  public async edit({ view, params }: HttpContext) {
    const bot = await Bot.findOrFail(params.id)
    
    // Загружаем настройки оплаты
    await bot.load('paymentConfigs')
    
    // Преобразуем массив конфигов в удобный объект для view: { lava_ru: { ... }, wata: { ... } }
    const paymentMap: any = {}
    bot.paymentConfigs.forEach(pc => {
        paymentMap[pc.provider] = { ...pc.credentials, is_enabled: pc.isEnabled }
    })

    return view.render('pages/admin/bots/edit', { bot, paymentMap })
  }

  // Обновление бота и настроек оплаты
  public async update({ request, response, params, session }: HttpContext) {
    const bot = await Bot.findOrFail(params.id)
    
    // 1. Обновляем основные поля
    const mainData = request.only(['name', 'token', 'welcome_text', 'is_active'])
    bot.name = mainData.name
    bot.token = mainData.token
    bot.isActive = !!mainData.is_active // checkbox возвращает 'on' или undefined
    
    // Обновляем текст приветствия в JSON конфиге
    const currentConfig = bot.config || {}
    bot.config = { ...currentConfig, welcome_text: mainData.welcome_text }
    
    await bot.save()

    // 2. Обновляем платежки (Lava)
    const lavaData = request.input('lava') // { shop_id, secret_key, is_enabled }
    if (lavaData) {
        await BotPaymentConfig.updateOrCreate(
            { botId: bot.id, provider: 'lava_ru' },
            { 
                isEnabled: !!lavaData.is_enabled,
                credentials: { shop_id: lavaData.shop_id, secret_key: lavaData.secret_key }
            }
        )
    }

    // 3. Обновляем платежки (Heleket)
    const heleketData = request.input('heleket')
    if (heleketData) {
        await BotPaymentConfig.updateOrCreate(
            { botId: bot.id, provider: 'heleket' },
            { 
                isEnabled: !!heleketData.is_enabled,
                credentials: { merchant_id: heleketData.merchant_id, secret_key: heleketData.secret_key }
            }
        )
    }

    session.flash('success', 'Настройки сохранены')
    return response.redirect().back()
  }

  // Установка Вебхука (волшебная кнопка)
  public async setWebhook({ params, response, session }: HttpContext) {
    const bot = await Bot.findOrFail(params.id)
    const webhookUrl = `${env.get('APP_URL')}/webhooks/telegram/${bot.token}`
    
    try {
      const tg = new GrammyBot(bot.token)
      await tg.api.setWebhook(webhookUrl)
      session.flash('success', `Вебхук установлен: ${webhookUrl}`)
    } catch (error) {
      session.flash('error', `Ошибка Telegram API: ${error.message}`)
    }
    return response.redirect().back()
  }
}