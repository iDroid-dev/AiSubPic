import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bots'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('offer_url').nullable()   
      table.string('support_url').nullable()  
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('offer_url')
      table.dropColumn('support_url')
    })
  }
}