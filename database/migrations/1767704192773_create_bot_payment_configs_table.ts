import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_payment_configs'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // ⚠️ ПРОВЕРЬ ЭТУ СТРОКУ. Должно быть 'bot_id', а не 'botId'
      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      
      table.string('provider').notNullable()
      table.boolean('is_enabled').defaultTo(true)
      table.json('credentials').notNullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}