import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_models'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Цена за 1 генерацию в долларах (храним как float или decimal)
      // precision 8, scale 4 позволяет хранить числа вида 0.0001
      table.decimal('cost_usd', 8, 4).defaultTo(0.01) 
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cost_usd')
    })
  }
}