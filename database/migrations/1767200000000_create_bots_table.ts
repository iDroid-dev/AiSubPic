import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Название бота для админки (например: "Основной бот", "Бот для тестов")
      table.string('name').notNullable()

      // Токен от BotFather. Делаем unique, чтобы не добавить одного бота дважды
      table.string('token').notNullable().unique()

      // Юзернейм (например, "my_cool_ai_bot"), заполняется автоматически
      table.string('username').nullable()

      // Флаг активности. Если false — вебхук будет отвечать 200 OK, но ничего не делать
      table.boolean('is_active').defaultTo(true)

      // JSON поле для гибких настроек (текст приветствия, структура меню, ключи платежек для конкретного бота)
      // В PostgreSQL это будет jsonb, в MySQL — json
      table.json('config').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}