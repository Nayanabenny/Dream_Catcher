
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const FALLBACK_MODEL = 'gemini-3.8-flash';
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 503 (model overloaded) and 429 (rate limited) are temporary, so worth retrying
function isTemporaryError(error) {
  return error?.status === 503 || error?.status === 429 ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(error?.message || '');
}

async function generate(model, dreamText) {
  const response = await ai.models.generateContent({
    model: model,

    contents: `Dream: ${dreamText}`,

    config: {
      systemInstruction:
        'You are a thoughtful dream interpreter. Be insightful but gentle, and consider common dream symbolism. Keep your interpretation to 2-3 paragraphs.'
    }
  });

  if (!response.text) {
    throw new Error(`Empty response (finish reason: ${response.candidates?.[0]?.finishReason})`);
  }

  return response.text.trim();
}

// Call Gemini API for dream interpretation
export async function getDreamInterpretation(dreamText) {

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Server misconfigured: GEMINI_API_KEY is missing');
  }

  const model = process.env.GEMINI_MODEL || FALLBACK_MODEL;
  const models = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];

  let lastError;

  for (const currentModel of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await generate(currentModel, dreamText);
      } catch (error) {
        lastError = error;
        console.error(`Gemini API error (${currentModel}, attempt ${attempt}):`, error.message);

        if (!isTemporaryError(error)) {
          throw new Error(`API error: ${error.message}`);
        }

        // Back off 1s, 2s before retrying the same model
        if (attempt < MAX_ATTEMPTS) {
          await sleep(1000 * attempt);
        }
      }
    }
  }

  throw new Error(`API error: ${lastError.message}`);
}
