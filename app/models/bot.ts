import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import BotPaymentConfig from '#models/bot_payment_config'
import AiModel from '#models/ai_model'


export default class Bot extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @column() declare name: string
  @column() declare token: string
  @column() declare username: string | null
  @column() declare isActive: boolean
  @column() declare aiModelId: number | null
  
  // Улучшенная версия для JSON поля (гарантирует, что это всегда будет объект)
  @column({
    prepare: (value: object) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare config: any 

  @column.dateTime({ autoCreate: true }) declare createdAt: DateTime
  @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime

  // Ваша связь — все верно!
  @hasMany(() => BotPaymentConfig)
  declare paymentConfigs: HasMany<typeof BotPaymentConfig>

  @belongsTo(() => AiModel)
  declare aiModel: BelongsTo<typeof AiModel>
}