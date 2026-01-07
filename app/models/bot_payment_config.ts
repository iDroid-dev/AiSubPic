import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bot from '#models/bot'

export default class BotPaymentConfig extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare botId: number

  @column()
  declare provider: string // 'cryptomus', 'lava', etc.

  @column()
  declare isEnabled: boolean

  // Автоматическая сериализация JSON (важно для Adonis 6)
  @column({
    prepare: (value: object) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare credentials: any

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Bot)
  declare bot: BelongsTo<typeof Bot>
}