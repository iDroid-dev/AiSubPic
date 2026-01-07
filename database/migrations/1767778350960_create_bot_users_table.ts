import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_users'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Связь: Какой Бот <-> Какой Юзер
      table.integer('bot_id').unsigned().references('bots.id').onDelete('CASCADE')
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE')
      
      // Важно: Уникальная пара. Один юзер не может быть добавлен в одного бота дважды.
      table.unique(['bot_id', 'user_id'])

      table.timestamp('created_at') // Дата первого запуска
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}