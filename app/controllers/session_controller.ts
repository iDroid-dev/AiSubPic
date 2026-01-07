import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
export default class SessionController {
  
  // Показать форму входа
  async showLogin({ view }: HttpContext) {
    return view.render('pages/auth/login')
  }

  // Обработка входа
async login({ request, response, auth, session }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    console.log('--- LOGIN DEBUG ---')
    console.log(`Email: ${email}`)
    console.log(`Password (input): ${password}`)

    try {
      // 1. Сначала просто найдем юзера
      const user = await User.findBy('email', email)
      console.log(`User found: ${user ? 'YES' : 'NO'}`)
      
      if (!user) {
        throw new Error('User not found')
      }

      console.log(`Hash in DB: ${user.password}`)

      // 2. Попробуем проверить пароль вручную (это покажет реальную ошибку, если verifyCredentials молчит)
      const isValid = await hash.verify(user.password!, password)
      console.log(`Password Valid: ${isValid}`)

      // 3. Если все ок, используем стандартный метод
      const verifiedUser = await User.verifyCredentials(email, password)
      
      if (verifiedUser.role !== 'admin') {
         console.log('Role mismatch')
         session.flash('error', 'Доступ только для администраторов')
         return response.redirect().back()
      }

      await auth.use('web').login(verifiedUser)
      console.log('Login successful -> Redirecting')
      return response.redirect('/admin')

    } catch (error) {
      console.error('LOGIN ERROR:', error)
      session.flash('error', `Ошибка входа: ${error.message}`)
      return response.redirect().back()
    }
  }

  // Выход
  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect('/login')
  }
}