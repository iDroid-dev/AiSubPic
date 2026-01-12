import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Order from '#models/order'
import { Bot as GrammyBot } from 'grammy'
import Bot from '#models/bot'
import env from '#start/env'
import Payout from '#models/payout'

export default class AdminController {
  // Главная страница дашборда
public async index({ view }: HttpContext) {
    
    // 1. Статистика пользователей
    const usersCount = await User.query().count('* as total')
    const totalUsers = usersCount[0].$extras.total

    // 2. Статистика заказов
    const ordersCount = await Order.query().where('status', 'paid').count('* as total')
    const totalOrders = ordersCount[0].$extras.total

    // 3. Доход (Грязная выручка)
    // Считаем сумму всех оплаченных заказов
    const incomeResult = await Order.query()
      .where('status', 'paid')
      .sum('amount as total')
    const totalRevenue = incomeResult[0].$extras.total || 0

    // 4. Расходы (Выплаты)
    const payoutsResult = await Payout.query().sum('amount as total')
    const totalPayouts = payoutsResult[0].$extras.total || 0

    // 5. Чистый остаток (Баланс)
    const currentBalance = totalRevenue - totalPayouts

    // Последние юзеры для таблицы
    const latestUsers = await User.query()
      .orderBy('created_at', 'desc')
      .limit(5)

    return view.render('pages/admin/dashboard', { 
      stats: {
        users: totalUsers,
        orders: totalOrders,
        revenue: totalRevenue,   // Всего пришло
        payouts: totalPayouts,   // Всего выведено
        balance: currentBalance  // Доступно сейчас
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