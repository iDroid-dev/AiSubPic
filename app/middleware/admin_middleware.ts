import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    
    // Если не залогинен или роль не admin -> ошибка 403
    if (!user || user.role !== 'admin') {
      return ctx.response.forbidden('Access denied. Admins only.')
    }
    
    return next()
  }
}