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

    // Загружаем кошельки пользователя (botUsers) и информацию о самих ботах
    await user.load('botUsers', (query) => {
        query.preload('bot')
        query.orderBy('credits', 'desc')
    })

    return view.render('pages/admin/users/edit', { user })
  }

  // НАЧИСЛЕНИЕ КРЕДИТОВ (Обновленный)
  public async addCredits({ request, response, params, session }: HttpContext) {
    const user = await User.findOrFail(params.id)
    
    // Теперь мы жестко требуем bot_id и amount из формы
    const botId = request.input('bot_id')
    const amount = Number(request.input('amount'))

    if (!botId || isNaN(amount) || amount === 0) {
        session.flash('error', 'Ошибка данных. Выберите бота и введите сумму.')
        return response.redirect().back()
    }

    // Ищем конкретную связку Юзер-Бот
    const botUser = await BotUser.query()
        .where('user_id', user.id)
        .where('bot_id', botId)
        .first()

    if (!botUser) {
        session.flash('error', 'Кошелек не найден. Возможно, пользователь заблокировал бота.')
        return response.redirect().back()
    }

    // Обновляем баланс
    botUser.credits += amount
    await botUser.save()

    // Подгружаем имя для красивого уведомления
    await botUser.load('bot')

    const action = amount > 0 ? 'Начислено' : 'Списано'
    session.flash('success', `${action} ${Math.abs(amount)} шт. для бота "${botUser.bot.name}". Новый баланс: ${botUser.credits}`)
    
    return response.redirect().back()
  }
}