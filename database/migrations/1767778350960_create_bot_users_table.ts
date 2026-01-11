import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_users'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Связь: Какой Бот <-> Какой Юзер
      table.integer('bot_id').unsigned().references('id').inTable('bots').onDelete('CASCADE')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      
      // Кредиты сразу здесь
      table.integer('credits').defaultTo(0).notNullable()
      
      // Уникальная пара
      table.unique(['bot_id', 'user_id'])

      // Таймстампы (исправлено)
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}