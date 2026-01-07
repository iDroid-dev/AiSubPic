import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  public async up() {
    // 1. Добавляем кредиты в таблицу связей
    this.schema.alterTable('bot_users', (table) => {
      table.integer('credits').defaultTo(0).notNullable()
    })

    // 2. Удаляем кредиты из общей таблицы юзеров
    this.schema.alterTable('users', (table) => {
      table.dropColumn('credits')
    })
  }

  public async down() {
    this.schema.alterTable('bot_users', (table) => {
      table.dropColumn('credits')
    })
    this.schema.alterTable('users', (table) => {
      table.integer('credits').defaultTo(0)
    })
  }
}