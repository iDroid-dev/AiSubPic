import { translate } from 'bing-translate-api' // 👈 Используем Bing
// Остальные импорты (Replicate и т.д.) оставь как были
import Replicate from 'replicate'
import env from '#start/env'

export default class AiService {
  private static replicate = new Replicate({
    auth: env.get('REPLICATE_API_TOKEN'),
  })

  /**
   * Генерация изображения
   */
  public static async generateImage(prompt: string, model: string) {
    let finalPrompt = prompt

    // 1. Пытаемся перевести на английский (Bing)
    try {
      // Проверяем, есть ли кириллица (русские буквы)
      if (/[а-яА-ЯёЁ]/.test(prompt)) {
        console.log(`[AI] Translating via Bing: "${prompt}"...`)
        
        // null - автоопределение языка, 'en' - куда переводим
        const res = await translate(prompt, null, 'en')
        
        if (res && res.translation) {
          finalPrompt = res.translation
          console.log(`[AI] Translated: "${finalPrompt}"`)
        }
      }
    } catch (e) {
      console.error('[Translation Error] Bing failed, using original prompt:', e)
      // ВАЖНО: Не выбрасываем ошибку, а просто используем оригинальный текст.
      // Flux/Midjourney иногда понимают русский, это лучше чем краш.
      finalPrompt = prompt 
    }

    // 2. Генерируем (Твой старый код Replicate)
    console.log(`[AI] Generating with model ${model}: "${finalPrompt}"`)

    const input = {
      prompt: finalPrompt,
      go_fast: true,
      megapixels: "1",
      num_outputs: 1,
      aspect_ratio: "1:1",
      output_format: "webp",
      output_quality: 80,
    }

    const output = await this.replicate.run(model as any, { input })
    return output
  }
}