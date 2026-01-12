import { HttpContext } from '@adonisjs/core/http'
import Bot from '#models/bot'
import BotPaymentConfig from '#models/bot_payment_config'
import env from '#start/env'
import { Bot as GrammyBot } from 'grammy'
import AiModel from '#models/ai_model'  

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
        isActive: false,
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
    const aiModels = await AiModel.query().where('isActive', true)
    
    // Преобразуем массив конфигов в удобный объект для view: { lava_ru: { ... }, wata: { ... } }
    const paymentMap: any = {}
    bot.paymentConfigs.forEach(pc => {
        paymentMap[pc.provider] = { ...pc.credentials, is_enabled: pc.isEnabled }
    })

    return view.render('pages/admin/bots/edit', { bot, paymentMap, aiModels })
  }

  // Обновление бота и настроек оплаты
  public async update({ request, response, params, session }: HttpContext) {
    const bot = await Bot.findOrFail(params.id)
    
    // 1. Обновляем основные поля
    const mainData = request.only(['name', 'token', 'welcome_text', 'is_active', 'ai_model_id','offer_url','support_url'])
    bot.name = mainData.name
    bot.token = mainData.token
    bot.isActive = !!mainData.is_active // checkbox возвращает 'on' или undefined
    bot.aiModelId = mainData.ai_model_id ? Number(mainData.ai_model_id) : null // 👈 Сохраняем ID модели
    bot.offerUrl = mainData.offer_url || null
    bot.supportUrl = mainData.support_url || null
    
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

async toggleStatus({ params, response, session }: HttpContext) {
    const bot = await Bot.findOrFail(params.id)
    // Берем домен из конфига или env. Если нет - используй свой прямой адрес
    const DOMAIN = env.get('APP_URL') || 'https://aisubpic.ru' 

    if (bot.isActive) {
      // --- ОСТАНОВКА БОТА ---
      try {
        const res = await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`)
        const data = await res.json() as any
        
        if (!data.ok) {
          session.flash('error', `Ошибка удаления Webhook: ${data.description}`)
          // Мы не прерываем, так как в базе статус всё равно надо сменить
        }
      } catch (e) {
        console.error('Telegram API Error', e)
      }
      
      bot.isActive = false
      await bot.save()
      session.flash('success', 'Бот остановлен (Webhook удален)')

    } else {
      // --- ЗАПУСК БОТА ---
      const webhookUrl = `${DOMAIN}/webhooks/telegram/${bot.token}`
      
      try {
        const res = await fetch(`https://api.telegram.org/bot${bot.token}/setWebhook?url=${webhookUrl}`)
        const data = await res.json() as any

        if (!data.ok) {
          session.flash('error', `Telegram API Error: ${data.description}`)
          return response.redirect().back()
        }

        bot.isActive = true
        await bot.save()
        session.flash('success', 'Бот успешно запущен!')
      } catch (e) {
        session.flash('error', 'Не удалось связаться с серверами Telegram')
        return response.redirect().back()
      }
    }

    return response.redirect().back()
  }

  async delete({ params, response, session }: HttpContext) {
  const bot = await Bot.findOrFail(params.id)

  try {
    // 1. Пытаемся удалить вебхук в Telegram перед удалением из базы
    await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`)
  } catch (e) {
    console.error('Не удалось удалить вебхук при удалении бота', e)
  }

  // 2. Удаляем из базы
  await bot.delete()

  session.flash('success', `Бот ${bot.name} полностью удален`)
  return response.redirect().back()
}


}