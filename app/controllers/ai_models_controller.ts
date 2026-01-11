import { HttpContext } from '@adonisjs/core/http'
import AiModel from '#models/ai_model'

export default class AiModelsController {
  
  public async index({ view }: HttpContext) {
    const models = await AiModel.all()
    return view.render('pages/admin/models/index', { models })
  }

  public async create({ view }: HttpContext) {
    return view.render('pages/admin/models/create')
  }

  public async store({ request, response, session }: HttpContext) {
    const data = request.only(['name', 'slug'])
    await AiModel.create(data)
    session.flash('success', 'Модель добавлена')
    return response.redirect().toRoute('admin.models.index')
  }

  public async edit({ view, params }: HttpContext) {
    const model = await AiModel.findOrFail(params.id)
    return view.render('pages/admin/models/edit', { model })
  }

  public async update({ request, response, params, session }: HttpContext) {
    const model = await AiModel.findOrFail(params.id)
    const data = request.only(['name', 'slug', 'is_active'])
    
    model.merge({
        name: data.name,
        slug: data.slug,
        isActive: !!data.is_active
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