import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'broadcasts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      
      table.text('message').notNullable()
      table.string('image_url').nullable() // Опционально: картинка
      
      table.string('status').defaultTo('pending') // pending, processing, completed, failed
      table.integer('total_users').defaultTo(0)
      table.integer('success_count').defaultTo(0)
      table.integer('fail_count').defaultTo(0)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}