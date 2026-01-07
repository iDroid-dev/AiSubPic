import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user' // Обычно класс называется User
import Plan from '#models/plan'
import Bot from '#models/bot'

export default class Order extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  // === СВЯЗИ ===
  
  // В базе колонка 'user_id', в модели свойство 'userId'
  @column({ columnName: 'user_id' })
  declare userId: number

  @column({ columnName: 'bot_id' })
  declare botId: number

  @column({ columnName: 'plan_id' })
  declare planId: number

  // === ДАННЫЕ ===

  @column()
  declare amount: number

  @column()
  declare currency: string

  // В базе 'provider', в коде 'paymentProvider' (как в PaymentService)
  @column({ columnName: 'provider' })
  declare paymentProvider: string

  @column()
  declare status: string // 'pending' | 'paid' | 'canceled'

  @column({ columnName: 'external_id' })
  declare externalId: string | null

  // === JSON RESPONSE ===
  // Ваша логика отличная, оставляем её, но убедитесь, 
  // что в миграции есть table.json('provider_response')
  @column({
    columnName: 'provider_response', // Явно указываем имя в базе
    prepare: (value: any) => {
      if (!value) return null
      return JSON.stringify(value) // Adonis сам экранирует, но так надежнее для text полей
    },
    consume: (value: any) => {
      if (!value) return null
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return value 
        }
      }
      return value // Если драйвер БД (pg) уже вернул объект
    }
  })
  declare providerResponse: any | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // === ОТНОШЕНИЯ (RELATIONS) ===

  @belongsTo(() => User, {
    foreignKey: 'userId', // Поле в этой модели (Order.userId)
  })
  declare user: BelongsTo<typeof User>
  
  // Если вам нужно часто обращаться именно как order.tgUser, можно оставить алиас:
  // declare tgUser: BelongsTo<typeof User> (но лучше называть просто user)

  @belongsTo(() => Plan)
  declare plan: BelongsTo<typeof Plan>
  
  @belongsTo(() => Bot)
  declare bot: BelongsTo<typeof Bot>
}