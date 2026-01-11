// app/services/ai_service.ts
import Replicate from 'replicate'
import env from '#start/env'

export class AiService {
  private replicate: Replicate

  constructor() {
    this.replicate = new Replicate({
      auth: env.get('REPLICATE_API_TOKEN'),
    })
  }

  /**
   * Генерация картинки через Flux Schnell
   */
  async generateImage(prompt: string) {
    try {
      const output = await this.replicate.run(
        "black-forest-labs/flux-dev",
        {
          input: {
            prompt: prompt,
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "webp",
            output_quality: 90
          }
        }
      )
      // Replicate возвращает массив URL (или поток)
      return output as string[]
    } catch (error) {
      console.error('Replicate error:', error)
      throw error
    }
  }
}

export default new AiService()