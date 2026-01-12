import { HttpContext } from '@adonisjs/core/http'
import Plan from '#models/plan'
import Bot from '#models/bot' // 👈 Импортируем

export default class PlansController {
  
public async index({ view }: HttpContext) {
    const plans = await Plan.query()
      .preload('bot') // 👈 ЗАГРУЖАЕМ СВЯЗЬ С БОТОМ
      .orderBy('sort_order', 'asc')
      
    return view.render('pages/admin/plans/index', { plans })
  }

    public async create({ view }: HttpContext) {
        // 👇 Загружаем список ботов для выпадающего списка
        const bots = await Bot.all()
        return view.render('pages/admin/plans/create', { bots })
      }

      public async store({ request, response, session }: HttpContext) {
        // Добавляем bot_id в запрос
        const data = request.only([
          'name', 'price', 'generations_count', 
          'currency', 'sort_order', 'description', 
          'bot_id', 'stars_price'  
        ])
        
        await Plan.create({
            name: data.name,
            price: data.price,
            credits: data.generations_count,
            starsPrice: data.stars_price ? Number(data.stars_price) : null,
            currency: data.currency || 'RUB',
            sortOrder: data.sort_order || 0,
            description: data.description,
            botId: data.bot_id, // 👈 Сохраняем ID бота
            isActive: true
        })

        session.flash('success', 'Тариф успешно создан!')
        return response.redirect().toRoute('admin.plans.index')
      }


  public async edit({ view, params }: HttpContext) {
    const plan = await Plan.findOrFail(params.id)
    const bots = await Bot.all() // Нужны для выпадающего списка
    return view.render('pages/admin/plans/edit', { plan, bots })
  }

  // Обновление тарифа
  public async update({ request, response, params, session }: HttpContext) {
    const plan = await Plan.findOrFail(params.id)
    
    const data = request.only([
      'name', 'price', 'generations_count', 
     'currency', 'sort_order', 'description', 
      'bot_id', 'is_active', 'stars_price'
    ])

    plan.merge({
        name: data.name,
        price: data.price,
        credits: data.generations_count,
        starsPrice: data.stars_price ? Number(data.stars_price) : null,
        currency: data.currency,
        sortOrder: data.sort_order,
        description: data.description,
        botId: data.bot_id,
        isActive: !!data.is_active // Чекбокс возвращает "on" или undefined
    })

    await plan.save()

    session.flash('success', 'Тариф успешно обновлен')
    return response.redirect().toRoute('admin.plans.index')
  }

  public async delete({ params, response }: HttpContext) {
      const plan = await Plan.find(params.id)
      if (plan) await plan.delete()
      return response.redirect().back()
  }
}