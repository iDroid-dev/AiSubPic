import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payouts'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.decimal('amount', 12, 2).notNullable() // Сумма вывода
      table.string('description').nullable() // На что: "Себе на карту", "Оплата Replicate"
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}