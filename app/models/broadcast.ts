import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bot from '#models/bot'

export default class Broadcast extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare botId: number

  @column()
  declare message: string

  @column()
  declare imageUrl: string | null

  @column()
  declare status: 'pending' | 'processing' | 'completed' | 'failed'

  @column()
  declare totalUsers: number

  @column()
  declare successCount: number

  @column()
  declare failCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Bot)
  declare bot: BelongsTo<typeof Bot>
}