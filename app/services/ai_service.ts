import { translate } from 'bing-translate-api' 
import Replicate from 'replicate'
import env from '#start/env'

export default class AiService {
  private static replicate = new Replicate({
    auth: env.get('REPLICATE_API_TOKEN'),
  })

  // 👇 1. Добавили аргумент aspectRatio (по умолчанию "1:1")
  public static async generateImage(prompt: string, model: string, aspectRatio: string = "1:1") {
    let finalPrompt = prompt

    try {
      if (/[а-яА-ЯёЁ]/.test(prompt)) {
        const res = await translate(prompt, null, 'en')
        if (res && res.translation) finalPrompt = res.translation
      }
    } catch (e) {
      console.error('[Translation Error]', e)
      finalPrompt = prompt 
    }

    console.log(`[AI] Generating ${model} (${aspectRatio}): "${finalPrompt}"`)

    const input = {
      prompt: finalPrompt,
      go_fast: true,
      megapixels: "1",
      num_outputs: 1,
      aspect_ratio: aspectRatio, // 👇 2. Передаем формат в модель
      output_format: "webp",
      output_quality: 80,
    }

    // Некоторые старые модели могут не поддерживать aspect_ratio текстом,
    // но Flux, Ideogram и Recraft поддерживают именно такие строки ("16:9", "9:16").
    const output = await this.replicate.run(model as any, { input })
    return output
  }
}