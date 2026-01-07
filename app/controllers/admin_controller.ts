import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Order from '#models/order'
import { Bot as GrammyBot } from 'grammy'
import Bot from '#models/bot'
import env from '#start/env'

export default class AdminController {
  // Главная страница дашборда
  async index({ view }: HttpContext) {
    const usersCount = await User.query().count('* as total')
    const ordersCount = await Order.query().where('status', 'paid').count('* as total')
    // Доход
    const income = await Order.query().where('status', 'paid').sum('amount as total')
    
    // Последние 10 юзеров
    const latestUsers = await User.query().orderBy('created_at', 'desc').limit(10)

    return view.render('pages/admin/dashboard', {
      stats: {
        users: usersCount[0].$extras.total,
        orders: ordersCount[0].$extras.total,
        income: income[0].$extras.total || 0
      },
      latestUsers
    })
  }

 
  async setWebhook({ params, response, session }: HttpContext) {
    const botModel = await Bot.findOrFail(params.id)
    
    // Формируем URL: https://твои-сайт.com/webhooks/telegram/:token
    const webhookUrl = `${env.get('APP_URL')}/webhooks/telegram/${botModel.token}`
    
    try {
      const bot = new GrammyBot(botModel.token)
      await bot.api.setWebhook(webhookUrl)
      
      session.flash('success', `Вебхук установлен: ${webhookUrl}`)
    } catch (error) {
      console.error(error)
      session.flash('error', `Ошибка Telegram: ${error.message}`)
    }
    
    return response.redirect().back()
  }

}