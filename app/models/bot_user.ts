import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bot from '#models/bot'
import User from '#models/user'

export default class BotUser extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare botId: number

  @column()
  declare userId: number

  
  @column()
  declare credits: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Bot)
  declare bot: BelongsTo<typeof Bot>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}