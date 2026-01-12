/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'

const TelegramWebhookController= () => import('#controllers/telegram_controller')
const SessionController = () => import('#controllers/session_controller')
const AdminController = () => import('#controllers/admin_controller')
const PlansController = () => import('#controllers/plans_controller')
const BotsController = () => import('#controllers/bots_controller')
const UsersController = () => import('#controllers/users_controller')
const AiModelsController = () => import('#controllers/ai_models_controller')
const MailingController = () => import('#controllers/mailing_controller')
const PaymentsController = () => import('#controllers/payment_controller')
const PayoutsController = () => import('#controllers/payouts_controller')


router.on('/').render('pages/home')
router.get('/login', [SessionController, 'showLogin']).as('login.show')
router.post('/login', [SessionController, 'login']).as('login.action')
router.get('/logout', [SessionController, 'logout'])

// Admin
router.group(() => {
  router.get('/', [AdminController, 'index']).as('admin.dashboard')
   

  // === ПОЛЬЗОВАТЕЛИ ===
  router.get('/users', [UsersController, 'index']).as('admin.users.index')
  router.get('/users/:id/edit', [UsersController, 'edit']).as('admin.users.edit')
  router.post('/users/:id/credits', [UsersController, 'addCredits']).as('admin.users.credits')

  // === БОТЫ ===
  router.get('/bots', [BotsController, 'index']).as('admin.bots.index')
  router.get('/bots/create', [BotsController, 'create']).as('admin.bots.create')
  router.post('/bots', [BotsController, 'store']).as('admin.bots.store')
  router.get('/bots/:id', [BotsController, 'edit']).as('admin.bots.edit')
  router.post('/bots/:id', [BotsController, 'update']).as('admin.bots.update')
  router.post('/bots/:id/toggle', [BotsController, 'toggleStatus']).as('admin.bots.toggle')
  router.delete('/bots/:id', [BotsController, 'delete']).as('admin.bots.delete')
  // === ТАРИФЫ ===
  router.get('/plans/:id/edit', [PlansController, 'edit']).as('admin.plans.edit')
  router.post('/plans/:id/edit', [PlansController, 'update']).as('admin.plans.update')
  router.get('/plans', [PlansController, 'index']).as('admin.plans.index')
  router.get('/plans/create', [PlansController, 'create']).as('admin.plans.create')
  router.post('/plans', [PlansController, 'store']).as('admin.plans.store')
  router.get('/plans/:id/delete', [PlansController, 'delete']).as('admin.plans.delete')

  // === МОДЕЛИ ===
  router.get('/models', [AiModelsController, 'index']).as('admin.models.index')
  router.get('/models/create', [AiModelsController, 'create']).as('admin.models.create')
  router.post('/models', [AiModelsController, 'store']).as('admin.models.store')
  router.get('/models/:id', [AiModelsController, 'edit']).as('admin.models.edit')
  router.post('/models/:id', [AiModelsController, 'update']).as('admin.models.update')
  router.delete('/models/:id', [AiModelsController, 'delete']).as('admin.models.delete')

// === ПЛАТЕЖИ ===
  router.get('/payments', [PaymentsController, 'index']).as('admin.payments.index')
  router.post('/payments/:id/approve', [PaymentsController, 'approve']).as('admin.payments.approve')
  // === РАССЫЛКИ ===
  router.get('/mailing', [MailingController, 'index']).as('admin.mailing.index')
  router.get('/mailing/create', [MailingController, 'create']).as('admin.mailing.create')
  router.post('/mailing', [MailingController, 'store']).as('admin.mailing.store')

  // Выплаты
  router.get('/payouts', [PayoutsController, 'index']).as('admin.payouts.index')
  router.post('/payouts', [PayoutsController, 'store']).as('admin.payouts.store')
  router.get('/payouts/:id/delete', [PayoutsController, 'delete']).as('admin.payouts.delete')
  
  // Личное сообщение
  router.post('/users/:id/message', [MailingController, 'sendPersonal']).as('admin.users.message')


})
.prefix('/admin')
.use(middleware.auth())
.use(middleware.admin())
 



// 1. Прием вебхуков от Telegram (и платежек)
// Важно: Эти роуты должны быть доступны из интернета без логина
router.group(() => {
    // Важно: :token теперь доступен в params
    router.post('/telegram/:token', [TelegramWebhookController, 'handle'])
    
    // Для платежек (например, Cryptomus тоже шлет вебхуки)
    // router.post('/payment/cryptomus', [PaymentWebhookController, 'handle'])
}).prefix('webhooks')