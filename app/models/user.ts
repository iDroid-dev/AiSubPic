import { DateTime } from 'luxon'
import { BaseModel, column, hasMany} from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Order from '#models/order'
import Generation from '#models/generation'
import hash from '@adonisjs/core/services/hash'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'

import BotUser from '#models/bot_user'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder){
  @column({ isPrimary: true })
  declare id: number

  // Auth fields
  @column()
  declare email: string | null
  @column({ serializeAs: null })
  declare password: string | null

  // Telegram fields
  @column()
  declare telegramId: number | null
  @column()
  declare username: string | null
  @column()
  declare fullName: string | null

 

  @column()
  declare role: 'user' | 'admin'

  // Связи
  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>

  @hasMany(() => Generation)
  declare generations: HasMany<typeof Generation>

  @hasMany(() => BotUser)
  declare botUsers: HasMany<typeof BotUser>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  
  
}