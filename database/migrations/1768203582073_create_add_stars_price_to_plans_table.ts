import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Stars всегда целые числа, поэтому использурум integer
      table.integer('stars_price').unsigned().nullable().after('price')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('stars_price')
    })
  }
}