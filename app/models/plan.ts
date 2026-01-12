import { DateTime } from 'luxon'
import { BaseModel, column,belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bot from '#models/bot'  

export default class Plan extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare botId: number

  @column()
  declare name: string 

  @column()
  declare price: number 

  
  @column()
  declare starsPrice: number | null

  @column()
  declare currency: string

  @column()
  declare durationDays: number

  @column()
  declare sortOrder: number
  
  @column()
  declare isActive: boolean

  // === ИСПРАВЛЕНИЕ ===
  // Связываем свойство credits с колонкой generations_count
  @column({ columnName: 'generations_count' })
  declare credits: number 

  @column()
  declare description: string | null

  @belongsTo(() => Bot)
  declare bot: BelongsTo<typeof Bot>
  
  // Теперь это поле должно быть и в миграции (я добавил его выше)
  @column({ columnName: 'external_id' })
  declare externalId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}