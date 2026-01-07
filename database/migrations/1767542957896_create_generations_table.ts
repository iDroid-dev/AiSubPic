import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'generations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Связь с юзером
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')
      
      // === ДОБАВЛЕНО: Связь с ботом ===
      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      
      table.text('prompt').notNullable()
      table.string('aspect_ratio').defaultTo('1:1')
      table.text('result_url').nullable() // Ссылка на картинку
      table.string('replicate_id').nullable() // ID задачи в Replicate
      
      table.decimal('cost_usd', 8, 5).nullable() // Реальная стоимость генерации
      table.boolean('is_successful').defaultTo(false)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}