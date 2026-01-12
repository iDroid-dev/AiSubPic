import { HttpContext } from '@adonisjs/core/http'
import AiModel from '#models/ai_model'

export default class AiModelsController {
  
  public async index({ view }: HttpContext) {
    // Сортируем, чтобы активные были сверху
    const models = await AiModel.query().orderBy('is_active', 'desc')
    return view.render('pages/admin/models/index', { models })
  }

  public async create({ view }: HttpContext) {
    return view.render('pages/admin/models/create')
  }

  public async store({ request, response, session }: HttpContext) {
    // 1. Принимаем cost_usd
    const data = request.only(['name', 'slug', 'cost_usd'])
    
    await AiModel.create({
        name: data.name,
        slug: data.slug,
        // Преобразуем в число (важно!) и мапим на поле модели camelCase
        costUsd: Number(data.cost_usd) 
    })

    session.flash('success', 'Модель добавлена')
    return response.redirect().toRoute('admin.models.index')
  }

  public async edit({ view, params }: HttpContext) {
    const model = await AiModel.findOrFail(params.id)
    return view.render('pages/admin/models/edit', { model })
  }

  public async update({ request, response, params, session }: HttpContext) {
    const model = await AiModel.findOrFail(params.id)
    
    // 2. Принимаем cost_usd при обновлении
    const data = request.only(['name', 'slug', 'is_active', 'cost_usd'])
    
    model.merge({
        name: data.name,
        slug: data.slug,
        isActive: !!data.is_active,
        costUsd: Number(data.cost_usd) // Обновляем цену
    })
    await model.save()
    
    session.flash('success', 'Модель обновлена')
    return response.redirect().toRoute('admin.models.index')
  }
  
  public async delete({ params, response, session }: HttpContext) {
    const model = await AiModel.findOrFail(params.id)
    await model.delete()
    session.flash('success', 'Модель удалена')
    return response.redirect().back()
  }
}