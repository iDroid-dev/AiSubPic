import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_models'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable() // Например: "Flux Dev (Fast)"
      table.string('slug').notNullable() // Например: "black-forest-labs/flux-dev"
      table.boolean('is_active').defaultTo(true)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    // Добавляем колонку в таблицу BOTS
    this.schema.alterTable('bots', (table) => {
      table.integer('ai_model_id').unsigned().references('ai_models.id').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('bots', (table) => {
      table.dropColumn('ai_model_id')
    })
    this.schema.dropTable(this.tableName)
  }
}