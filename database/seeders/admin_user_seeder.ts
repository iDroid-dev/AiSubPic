import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

export default class extends BaseSeeder {
  async run() {
    // Проверяем, есть ли уже админ, чтобы не дублировать
    const existingAdmin = await User.findBy('email', 'admin@example.com')
    if (!existingAdmin) {
      await User.create({
        email: 'admin@example.com',
        password: 'password123', // Поменяй на сложный!
        role: 'admin',
        fullName: 'Super Admin',
    
      })
    }
  }
}