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

  async generateImage(prompt: string, modelSlug: string) {
    try {
      console.log(`[AI] Translating: "${prompt}"...`)
      const { text: translatedPrompt } = await translate(prompt, { to: 'en' })
      console.log(`[AI] Translated to: "${translatedPrompt}"`)
      
      console.log(`[AI] Using model: ${modelSlug}`)
      const output = await this.replicate.run(
       modelSlug as any,
        {
          input: {
            prompt: translatedPrompt,  
            go_fast: true,   
            guidance_scale: 3.5,
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "webp",
            output_quality: 90
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
 