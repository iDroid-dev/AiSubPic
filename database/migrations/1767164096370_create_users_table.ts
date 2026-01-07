import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Поля для Web Admin (почта/пароль)
      table.string('email', 254).nullable().unique()
      table.string('password').nullable()

      // Поля для Telegram
      table.bigInteger('telegram_id').unsigned().nullable().unique().index()
      table.string('username').nullable()
      table.string('full_name').nullable()
      table.string('avatar_url').nullable()

      // Баланс и Роль
      table.integer('credits').defaultTo(0).notNullable() // Кол-во генераций
      table.enum('role', ['user', 'admin']).defaultTo('user')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}