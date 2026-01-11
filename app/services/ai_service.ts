// app/services/ai_service.ts
import Replicate from 'replicate'
import env from '#start/env'
import { translate } from '@vitalets/google-translate-api' // 👈 Импортируем переводчик

export class AiService {
  private replicate: Replicate

  constructor() {
    this.replicate = new Replicate({
      auth: env.get('REPLICATE_API_TOKEN'),
    })
  }

  async generateImage(prompt: string) {
    try {
      // 1. АВТО-ПЕРЕВОД НА АНГЛИЙСКИЙ
      // Flux понимает только английский. Переводим любой входящий текст.
      console.log(`[AI] Translating: "${prompt}"...`)
      
      const { text: translatedPrompt } = await translate(prompt, { to: 'en' })
      
      console.log(`[AI] Translated to: "${translatedPrompt}"`)

      // 2. ОТПРАВЛЯЕМ ВО FLUX (Используем Flux Dev для качества)
      const output = await this.replicate.run(
        "black-forest-labs/flux-dev", 
        {
          input: {
            prompt: translatedPrompt,
            
            // 👇 1. ГЛАВНАЯ ЭКОНОМИЯ: Снижаем шаги (Default ~28-50)
            // 20 — это минимум для хорошего качества у Dev версии.
            num_inference_steps: 20, 

            // 👇 2. УСКОРЕНИЕ: Отключаем пост-проверку (экономит ~1 сек)
            disable_safety_checker: true,

            // Оставляем быстрый режим
            go_fast: true,
            
            // Сила следования промпту (3.5 оптимально для Dev)
            guidance_scale: 3.5,
            
            // Качество файла (не влияет на цену генерации, только на размер файла)
            output_quality: 80, 
            output_format: "webp",
            
            // Размер: "1" = 1024x1024. 
            // Если нужно СУПЕР ДЕШЕВО, поставьте "0.25" (512x512)
            megapixels: "1", 
            
            aspect_ratio: "1:1",
            num_outputs: 1,
          }
        }
      )
      
      return output as string[]
    } catch (error) {
      console.error('AI Service Error:', error)
      // Если переводчик упал (бывает редко), пробуем отправить оригинал
      // или выбрасываем ошибку дальше
      throw error
    }
  }
}

export default new AiService()