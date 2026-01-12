import { HttpContext } from '@adonisjs/core/http'
import Payout from '#models/payout'

export default class PayoutsController {
  
  // Страница со списком всех выплат
  public async index({ view }: HttpContext) {
    const payouts = await Payout.query().orderBy('created_at', 'desc')
    
    // Считаем общую сумму выплат
    const total = payouts.reduce((sum, p) => sum + Number(p.amount), 0)

    return view.render('pages/admin/payouts/index', { payouts, total })
  }

  // Сохранение новой выплаты
  public async store({ request, response, session }: HttpContext) {
    const data = request.only(['amount', 'description'])
    
    await Payout.create({
      amount: data.amount,
      description: data.description
    })

    session.flash('success', `Выплата ${data.amount} ₽ зафиксирована`)
    return response.redirect().back()
  }
  
  // Удаление (если ошиблись)
  public async delete({ params, response, session }: HttpContext) {
      const payout = await Payout.findOrFail(params.id)
      await payout.delete()
      
      session.flash('success', 'Запись удалена')
      return response.redirect().back()
  }
}