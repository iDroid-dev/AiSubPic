import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'orders'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // 1. Привязка к пользователю
      // Обычно ссылаемся на users.id. Если в таблице users ключ 'id', то пишем так:
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')
      
      // ИЛИ, если вы хотите хранить именно Telegram ID (BigInt) без связи FK c таблицей users:
      // table.bigInteger('tg_user_id').unsigned().index()

      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      table.integer('plan_id').unsigned().references('plans.id').onDelete('CASCADE')
      
      table.decimal('amount', 12, 2).notNullable()
      table.string('currency', 3).defaultTo('RUB')
      
      // Поле называется 'provider', а в модели будет 'paymentProvider'
      table.string('provider').notNullable() 
      
      table.string('status').defaultTo('pending') // pending, paid, canceled
      table.string('external_id').nullable().index()

      // 2. ВАЖНО: Добавляем поле для JSON ответа, которое мы используем в модели
      table.json('provider_response').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}