import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Добавляем привязку к боту
      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('bot_id')
    })
  }
}