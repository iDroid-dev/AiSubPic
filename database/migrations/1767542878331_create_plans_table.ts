import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable() // "Start", "Pro"
      table.text('description').nullable()
      table.decimal('price', 10, 2).notNullable()
      table.string('currency', 3).defaultTo('RUB')
      table.integer('duration_days').notNullable()
      
      table.integer('sort_order').defaultTo(0)
      
      // Количество генераций (кредитов)
      table.integer('generations_count').notNullable() 
      
      table.boolean('is_active').defaultTo(true)

      // ДОБАВИЛ, так как это поле есть в модели
      table.string('external_id').nullable().index() 
      
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}