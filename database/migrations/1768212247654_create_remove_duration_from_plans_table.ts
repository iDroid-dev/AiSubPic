import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Удаляем колонку duration (или duration_days, как она у вас называлась)
      table.dropColumn('duration_days') 
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Если нужно откатить, возвращаем
      table.integer('duration_days').defaultTo(30)
    })
  }
}