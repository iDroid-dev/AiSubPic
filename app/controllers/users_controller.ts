import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import BotUser from '#models/bot_user' // 👈 Обязательно импортируем

export default class UsersController {
  
  // Список пользователей с пагинацией
  public async index({ view, request }: HttpContext) {
    const page = request.input('page', 1)
    const limit = 20

    // Сортируем от новых к старым и подгружаем балансы
    const users = await User.query()
      .preload('botUsers', (query) => {
          query.preload('bot') // Чтобы видеть названия ботов
      })
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    // Важно для корректных ссылок пагинации
    users.baseUrl('/admin/users')

    return view.render('pages/admin/users/index', { users })
  }

public async edit({ view, params }: HttpContext) {
    const user = await User.findOrFail(params.id)

    // 1. Загружаем кошельки (как было)
    await user.load('botUsers', (query) => {
        query.preload('bot')
        query.orderBy('credits', 'desc')
    })

    // 2. Загружаем историю сообщений (НОВОЕ)
    await user.load('messages', (query) => {
        query.preload('bot')
        query.orderBy('created_at', 'desc')
    })

    return view.render('pages/admin/users/edit', { user })
  }

  // НАЧИСЛЕНИЕ КРЕДИТОВ (Обновленный)
 
  public async addCredits({ request, response, params, session }: HttpContext) {
    const user = await User.findOrFail(params.id)
    
    const botId = request.input('bot_id')
    const amount = Number(request.input('amount'))

    if (!botId || isNaN(amount) || amount === 0) {
        session.flash('error', 'Ошибка данных. Выберите бота и введите сумму.')
        return response.redirect().back()
    }

    const botUser = await BotUser.query()
        .where('user_id', user.id)
        .where('bot_id', botId)
        .first()

    if (!botUser) {
        session.flash('error', 'Кошелек не найден. Возможно, пользователь заблокировал бота.')
        return response.redirect().back()
    }

    // 1. Обновляем баланс
    botUser.credits += amount
    await botUser.save()

    // 2. Подгружаем бота (нужен токен для отправки)
    await botUser.load('bot')

    // =========================================================
    // 🔔 УВЕДОМЛЕНИЕ В TELEGRAM
    // =========================================================
    if (user.telegramId && botUser.bot.token) {
        try {
            // Импортируем grammy динамически (или используйте import в начале файла)
            const { Bot } = await import('grammy')
            const telegramBot = new Bot(botUser.bot.token)
            
            // Формируем текст в зависимости от того, дали или забрали
            let messageText = ''
            
            if (amount > 0) {
                messageText = 
                    `🎁 <b>Бонус от администратора!</b>\n\n` +
                    `Вам начислено: <b>${amount}</b> кредитов.\n` +
                    `Текущий баланс: <b>${botUser.credits}</b>`
            } else {
                messageText = 
                    `⚠️ <b>Корректировка баланса</b>\n\n` +
                    `Списано: <b>${Math.abs(amount)}</b> кредитов.\n` +
                    `Текущий баланс: <b>${botUser.credits}</b>`
            }

            await telegramBot.api.sendMessage(user.telegramId, messageText, {
                parse_mode: 'HTML'
            })

        } catch (error) {
            console.error(`[Admin] Не удалось отправить уведомление юзеру ${user.id}:`, error)
            // Мы НЕ прерываем работу, если сообщение не ушло (например, бот в бане)
        }
    }
    // =========================================================

    const action = amount > 0 ? 'Начислено' : 'Списано'
    session.flash('success', `${action} ${Math.abs(amount)} шт. для бота "${botUser.bot.name}". Уведомление отправлено.`)
    
    return response.redirect().back()
  }
}