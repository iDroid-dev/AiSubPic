import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  public async up() {
    // Просто удаляем старую колонку из users, так как мы перешли на новую систему
    this.schema.alterTable('users', (table) => {
      if (process.env.NODE_ENV !== 'test') { // Защита для тестов
          table.dropColumn('credits')
      }
    })
  }

  public async down() {
    // Возвращаем как было (на случай отката)
    this.schema.alterTable('users', (table) => {
      table.integer('credits').defaultTo(0)
    })
  }
}