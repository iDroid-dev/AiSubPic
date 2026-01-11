import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'personal_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')

      table.text('text').notNullable()

      // is_incoming: false = мы написали юзеру, true = юзер написал нам (на будущее)
      table.boolean('is_incoming').defaultTo(false) 

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}