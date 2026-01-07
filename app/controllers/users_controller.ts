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

  // Метод для ручного начисления кредитов
  public async addCredits({ request, response, params, session }: HttpContext) {
    const user = await User.findOrFail(params.id)
    const amount = Number(request.input('amount'))
    
    // Пытаемся получить ID бота из формы (если он там есть)
    const botId = request.input('bot_id')

    if (isNaN(amount)) {
        session.flash('error', 'Введите корректное число')
        return response.redirect().back()
    }

    let botUser: BotUser | null = null

    if (botId) {
        // Если указан конкретный бот — ищем кошелек в нем
        botUser = await BotUser.query()
            .where('user_id', user.id)
            .where('bot_id', botId)
            .first()
    } else {
        // Если бот не указан — берем ПЕРВЫЙ попавшийся активный кошелек (fallback)
        // Или последний, который обновлялся
        botUser = await BotUser.query()
            .where('user_id', user.id)
            .orderBy('updated_at', 'desc')
            .first()
    }

    if (!botUser) {
        session.flash('error', 'У пользователя нет активных ботов для начисления. Сначала он должен запустить бота.')
        return response.redirect().back()
    }

    // Начисляем
    botUser.credits += amount
    await botUser.save()
    
    // Подгружаем бота, чтобы вывести его имя в сообщении
    await botUser.load('bot')

    session.flash('success', `Баланс в боте "${botUser.bot.name}" обновлен! Текущий: ${botUser.credits}`)
    return response.redirect().back()
  }
}