import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { enrichWithPollinations } from "./aiFallbackService";
import { LinkItem } from "../types";
import { getCachedData, setCachedData, getEnrichmentKey, getSearchKey } from "./cacheService";
import {
  PromptMode,
  getPromptConfig,
  buildBatchPrompt,
  buildSinglePrompt,
  parseBatchResponse,
  getModeLabel,
  buildRefinementPrompt,
  type BatchPromptItem,
  type EnrichmentResult
} from "./promptModeService";
import { 
  evaluateCardQuality, 
  getSpecializedPrompt 
} from "./descriptionQualityService";

// Accesso alla chiave e modello configurati (pressione GEMINI_ in vite.config.ts)
const RAW_API_KEY = import.meta.env.GEMINI_API_KEY || "";
const RAW_MODEL_NAME = import.meta.env.GEMINI_MODEL || "gemini-1.5-flash";

// Supporto per rotazione CHIAVI se specificate come lista separata da virgola
const API_KEYS = RAW_API_KEY.split(',')
  .map(k => k.replace(/['"]+/g, '').trim())
  .filter(k => k.length > 0);

// Supporto per rotazione MODELLI se specificati come lista separata da virgola
// MODELLI FREE TIER VALIDI (Maggio 2026):
//   - gemini-2.5-flash: modello Flash più recente, free tier attivo
//   - gemini-1.5-flash: stabile, free tier con 1500 RPD
//   - gemini-1.5-flash-8b: leggero, free tier con limiti generosi
// RIMOSSI: gemini-2.0-flash-exp (deprecato giu 2026), gemini-1.5-pro (solo paid apr 2026)
const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

// Filtra automaticamente modelli noti come non-free-tier o deprecati
const BLOCKED_MODELS = ['gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-1.0-pro'];

const MODEL_LIST = (RAW_MODEL_NAME 
  ? RAW_MODEL_NAME.split(',').map(m => m.replace(/['"]+/g, '').trim()).filter(m => m.length > 0)
  : DEFAULT_MODELS
).filter(m => !BLOCKED_MODELS.includes(m));

// Stato interno per la rotazione
let currentKeyIndex = 0;

console.log(`AI Service Init - Keys: ${API_KEYS.length}, Models: ${MODEL_LIST.join(', ')}`);
if (API_KEYS.length > 0) {
  const k = API_KEYS[0];
  console.log(`AI Service Init - Primary Key Info: Len=${k.length}, Prefix=${k.substring(0, 5)}..., Suffix=...${k.substring(k.length - 4)}`);
}

/**
 * Token limits per model (TPM - Tokens Per Minute)
 * Free-tier limits (Maggio 2026):
 *   gemini-2.5-flash:      15 req/min, 1500 req/day (Flash standard)
 *   gemini-1.5-flash:      15 req/min, 1500 req/day
 *   gemini-1.5-flash-8b:   15 req/min, 1500 req/day (leggero)
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gemini-2.5-flash': 250000,
  'gemini-1.5-flash': 250000,
  'gemini-1.5-flash-8b': 250000,
  'default': 100000
};

const TOKENS_PER_ITEM = 600;  // Premium prompt is larger — conservative estimate
const SAFETY_MARGIN = 0.6;    // 60% of TPM to stay well within limits
// With 20 req/day (Gemini 2.5 limit), we need a larger batch to process the 600+ card library.
// Premium mode generates ~200 output tokens per item. 8192 max output limit / 200 = ~40 items max.
// We set batch to 25 to be safe from JSON truncation, allowing 25 * 18 = 450 cards per day.
const MAX_PRACTICAL_BATCH = 5;

/**
 * Calculate max batch size based on the primary model's token limits.
 * Respects both TPM and the practical daily request budget.
 */
export function getMaxBatchSize(mode: PromptMode = 'caveman'): number {
  // Bug #2 Fix Refined: Per caveman mode (compresso) usiamo batch da 3 per risparmiare quota giornaliera.
  // Per premium mode (dettagliato) restiamo a 1 per evitare troncamenti JSON.
  return mode === 'caveman' ? 3 : 1;
}

/**
 * HELPER per rimuovere config avanzate che causano 400 su modelli vecchi/lite
 * Alcuni modelli (specialmente -8b o versioni vecchie) non supportano responseSchema
 */
function sanitizeConfigForModel(model: string, config: any) {
  const sanitized = { ...config };
  
  // Lista di modelli noti per avere problemi con JSON Schema strutturato
  const isLimitedModel = 
    model.includes('8b') || 
    model.includes('lite') || 
    (model.includes('1.5') && !model.includes('flash') && !model.includes('pro')) ||
    model.includes('1.0');

  if (isLimitedModel) {
    console.warn(`[AI] Modello ${model} limitato rilevato. Rimuovo responseSchema per stabilità.`);
    delete sanitized.responseSchema;
  }
  
  return sanitized;
}

export const getAiClient = (keyOverride?: string) => {
  const key = keyOverride || API_KEYS[currentKeyIndex] || "";
  return new GoogleGenerativeAI(key);
};

const isValidUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isLocalUrl = (url: string): boolean => {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
};

/**
 * HELPER per rotazione modelli e CHIAVI in caso di quota esaurita (429)
 */
async function callWithModelRotation(contents: string, config: any): Promise<any> {
  let lastError = null;
  let allRateLimited = true; // Track se TUTTI i fallimenti sono 429/quota

  for (let k = 0; k < API_KEYS.length; k++) {
    const keyIndex = (currentKeyIndex + k) % API_KEYS.length;
    const genAI = getAiClient(API_KEYS[keyIndex]);

    for (const modelName of MODEL_LIST) {
      try {
        console.log(`[AI] Tentativo con Chiave #${keyIndex} - Modello: ${modelName}...`);
        
        const modelConfig = sanitizeConfigForModel(modelName, config);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            responseMimeType: modelConfig.responseMimeType,
            responseSchema: modelConfig.responseSchema,
            maxOutputTokens: modelConfig.maxOutputTokens || 2048,
            temperature: modelConfig.temperature || 0.2,
          }
        });

        const result = await model.generateContent(contents);
        const response = await result.response;
        const text = response.text();

        if (text) {
          currentKeyIndex = keyIndex;
          return { response, text };
        }
      } catch (error: any) {
        // Estrazione errore robusta (alcuni errori SDK v1.x sono nidificati)
        const status = error.status || error.response?.status || 
          error.errorDetails?.[0]?.httpStatusCode || 0;
        const errorMsg = (error.message || "").toLowerCase();
        
        const isRateLimit = status === 429 || 
          errorMsg.includes('429') || 
          errorMsg.includes('quota') || 
          errorMsg.includes('resource has been exhausted') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('too many requests');
        const isModelNotFound = status === 404 || errorMsg.includes('not found') || errorMsg.includes('is not found');
        const isBadRequest = status === 400 || errorMsg.includes('invalid');
        const isSafety = errorMsg.includes('safety') || errorMsg.includes('blocked');

        if (isModelNotFound) {
          console.warn(`[AI] Modello ${modelName} non trovato (404). Passo al prossimo.`);
          lastError = error;
          continue;
        }

        if (isRateLimit) {
          console.warn(`[AI] Quota/Rate Limit su Chiave #${keyIndex} / Modello ${modelName}.`);
          lastError = error;
          continue; // Prova prossimo modello/chiave
        }

        // Se arrivi qui, non è un rate limit → non tutti sono rate-limited
        allRateLimited = false;

        if (isSafety) {
          console.error(`[AI] Contenuto bloccato dai filtri di sicurezza su ${modelName}. Non riprovo.`);
          throw new Error("Contenuto bloccato dai filtri di sicurezza Google");
        }

        if (isBadRequest) {
          console.warn(`[AI] Modello ${modelName} rifiuta config (400). Provo senza schema...`);
          try {
            const fallbackModel = genAI.getGenerativeModel({ model: modelName });
            const fbResult = await fallbackModel.generateContent(contents);
            const fbText = (await fbResult.response).text();
            if (fbText) {
              console.log(`[AI] Fallback senza schema riuscito su ${modelName}`);
              return { text: fbText };
            }
          } catch (e2: any) {
            console.error(`[AI] Fallimento totale fallback su ${modelName}:`, e2.message);
          }
        }

        console.error(`[AI] Errore su ${modelName}:`, error.message);
        lastError = error;
        continue;
      }
    }
    console.warn(`[AI] Chiave #${keyIndex} esaurita o modelli non rispondenti.`);
  }

  // === FALLBACK POLLINATIONS.AI ===
  // Se tutti i modelli Gemini hanno fallito (soprattutto per quota), 
  // proviamo il servizio gratuito Pollinations.ai come ultima risorsa.
  if (allRateLimited) {
    console.warn(`[AI] TUTTI i modelli Gemini esauriti. Attivando fallback Pollinations.ai...`);
    try {
      // Estraiamo un testo di ricerca dal contenuto del prompt
      const searchTermExtract = contents.substring(0, 500);
      const pollinationsResult = await enrichWithPollinations(searchTermExtract);
      if (pollinationsResult) {
        console.log(`[AI] ✅ Pollinations fallback riuscito!`);
        // Convertiamo il risultato nel formato atteso
        const text = JSON.stringify(pollinationsResult);
        return { text, isFallback: true };
      }
    } catch (fbError: any) {
      console.error(`[AI] ❌ Anche Pollinations fallback fallito:`, fbError.message);
    }
  }
  
  throw lastError || new Error("Nessuna risorsa AI disponibile (Gemini + Pollinations esauriti)");
}

/**
 * Enrichment singolo di un link tramite AI.
 * 
 * @param name - Nome del tool
 * @param url - URL del tool
 * @param mode - Modalità di prompt (default: 'caveman')
 * @returns Dati arricchiti parziali
 */
export const enrichLinkData = async (
  name: string,
  url: string,
  mode: PromptMode = 'caveman'
): Promise<Partial<LinkItem>> => {
  // 1. Validation to prevent wasted calls
  if (!name || !url) return {};
  if (!isValidUrl(url) || isLocalUrl(url)) {
    console.log("Skipping AI enrichment for invalid/local URL:", url);
    return {
      category: "Locale / Privato",
      description: "Risorsa locale o URL non valido.",
      tags: ["local"]
    };
  }

  // 2. Check Cache
  const cacheKey = getEnrichmentKey(url);
  const cached = getCachedData<Partial<LinkItem>>(cacheKey);
  if (cached) {
    console.log("Restored from cache:", name);
    return cached;
  }

  if (import.meta.env.DEV) {
    console.log(`[AI] Single enrichment: ${getModeLabel(mode)} — ${name}`);
  }

  const prompt = buildSinglePrompt(name, url, mode);
  const config = getPromptConfig(mode);

  try {
    const response = await callWithModelRotation(prompt, {
      responseMimeType: "application/json",
      responseSchema: mode === 'premium' ? {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          shortDescription: { type: SchemaType.STRING },
          categoryPath: { type: SchemaType.STRING },
          tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          useCases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          targetAudience: { type: SchemaType.STRING },
          toolLanguage: { type: SchemaType.STRING },
          toolStatus: { type: SchemaType.STRING },
          conceptFingerprint: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          emoji: { type: SchemaType.STRING },
          suggestedName: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ["category", "description", "tags"]
      } : {
        type: SchemaType.OBJECT,
        properties: {
          category: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          emoji: { type: SchemaType.STRING },
          suggestedName: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ["category", "description", "tags"]
      },
      maxOutputTokens: config.maxOutputTokens,
    });
    const text = response.text;
    if (!text) throw new Error("Risposta IA vuota");

    // Pulizia e Parsing
    const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
    try {
      const parsedData = JSON.parse(cleanedText);
      
      // Se è premium e mancano campi, logghiamo ma restituiamo quello che abbiamo
      if (mode === 'premium' && !parsedData.shortDescription && import.meta.env.DEV) {
        console.warn("[AI] Premium response missing shortDescription field", parsedData);
      }
      
      return parsedData;
    } catch (pe) {
      console.error("Errore parsing JSON singolo:", cleanedText);
      throw new Error("Formato risposta IA non valido");
    }
  } catch (error: unknown) {
    console.error("Errore Gemini:", error);
    throw error;
  }
};

/**
 * BATCH ENRICHMENT
 * Processes up to 5 links in a single API call to save quota.
 */
/**
 * BATCH ENRICHMENT — processa più link in una singola chiamata API.
 * Usa il promptModeService per generare il prompt e parsare la risposta.
 * 
 * @param items - Array di item da arricchire
 * @param mode - Modalità di prompt (default: 'caveman' per enrichment automatico)
 * @returns Record con ID come chiave e dati arricchiti come valore
 */
export const enrichLinksBatch = async (
  items: BatchPromptItem[],
  mode: PromptMode = 'caveman'
): Promise<Record<string, Partial<EnrichmentResult>>> => {
  if (items.length === 0) return {};

  if (import.meta.env.DEV) {
    console.log(`[AI] Batch enrichment: ${getModeLabel(mode)} — ${items.length} items`);
  }

  const prompt = buildBatchPrompt(items, mode);
  const config = getPromptConfig(mode);

  try {
    const response = await callWithModelRotation(prompt, {
      responseMimeType: "application/json",
      responseSchema: mode === 'premium' ? {
        type: SchemaType.OBJECT,
        additionalProperties: {
          type: SchemaType.OBJECT,
          properties: {
            category: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            shortDescription: { type: SchemaType.STRING },
            categoryPath: { type: SchemaType.STRING },
            tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            enrichedTags: { 
              type: SchemaType.ARRAY, 
              items: { 
                type: SchemaType.OBJECT,
                properties: {
                  value: { type: SchemaType.STRING },
                  type: { type: SchemaType.STRING },
                  weight: { type: SchemaType.NUMBER }
                },
                required: ["value", "type", "weight"]
              } 
            },
            useCases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            targetAudience: { type: SchemaType.STRING },
            toolLanguage: { type: SchemaType.STRING },
            toolStatus: { type: SchemaType.STRING },
            conceptFingerprint: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            emoji: { type: SchemaType.STRING },
            suggestedName: { type: SchemaType.STRING },
            confidence: { type: SchemaType.NUMBER },
          },
          required: ["category", "description", "tags"]
        }
      } : undefined,
      maxOutputTokens: config.maxOutputTokens,
    });

    const text = response.text || "";
    
    if (import.meta.env.DEV) {
      console.log(`[AI] Response length: ${text.length} chars. Mode: ${mode}`);
    }

    if (!text || text.length < 5) {
      console.error("[AI] Empty or too short response:", text);
      throw new Error("Risposta IA vuota o malformata");
    }

    // Parse and normalize using promptModeService
    try {
      const results = parseBatchResponse(text, items, mode);
      
      if (Object.keys(results).length === 0) {
        console.warn("[AI] No items were parsed from response. Text was:", text.substring(0, 500));
        return {};
      }

      // Return results directly — quality scoring happens client-side in App.tsx
      // NOTE: Per-item refinement calls removed (was causing double quota consumption)
      const finalResults: Record<string, Partial<EnrichmentResult>> = {};
      for (const item of items) {
        if (results[item.id]) finalResults[item.id] = results[item.id];
      }
      return finalResults;

    } catch (pe) {
      console.error("[AI] JSON Parse Error. First 200 chars:", text.substring(0, 200));
      throw new Error("Errore nel formato dei dati IA");
    }

  } catch (error: unknown) {
    const err = error as { message?: string; status?: number; details?: unknown };
    const isQuota = err.message?.includes('429') || err.status === 429;
    console.error("Errore Dettagliato Gemini:", {
      message: err.message,
      isQuota: isQuota,
      status: err.status,
      details: err.details
    });
    throw error;
  }
};

export const semanticSearch = async (query: string, items: LinkItem[]): Promise<string[]> => {
  if (!query.trim()) return [];

  // Check Cache for identical queries
  const cacheKey = getSearchKey(query);
  const cached = getCachedData<string[]>(cacheKey);
  if (cached) {
    console.log("Search restored from cache:", query);
    return cached;
  }

  const ai = getAiClient();

  // PSEUDO-RAG: Pre-filtraggio locale per gestire grandi dataset (400+ tool)
  // Seleziona i top 50 candidati basandosi su sovrapposizione di parole chiave
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scoredItems = items.map(item => {
    let score = 0;
    const content = `${item.name} ${item.category} ${item.description} ${item.tags?.join(' ')}`.toLowerCase();

    queryTerms.forEach(term => {
      if (content.includes(term)) score += 1;
    });

    return { item, score };
  });

  // Ordina per punteggio e prendi i primi 50 (o tutti se < 50)
  const candidates = scoredItems
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(si => si.item);

  console.log(`Pseudo-RAG: Ridotto contesto da ${items.length} a ${candidates.length} candidati.`);

  // Inviamo una versione semplificata per risparmiare token
  // Optimize context size: limit descriptions length
  const context = candidates.map(item => ({
    id: item.id,
    txt: `${item.name} (${item.category}): ${item.description.substring(0, 300)} ${item.tags?.length ? `[Tags: ${item.tags.join(', ')}]` : ''}`
  }));

  const prompt = `Sei un motore di ricerca semantico esperto in Cyber Security e Tool Productivity.
  Query Utente: "${query}"
  
  Task: Identifica gli strumenti dalla lista fornita che soddisfano la richiesta dell'utente.
  REGOLE DI MATCHING:
  - Comprendi i sinonimi (es: "audio" -> "speech", "tts", "voce", "monitoraggio" -> "sniffing", "scanning").
  - Identifica l'INTENTO funzionale: se l'utente chiede "cosa serve per X", trova i tool che fanno X.
  - Sii inclusivo se la query è vaga, ma preciso se è specifica.
  - Considera il Nome, la Categoria, la Descrizione e i Tags forniti.

  Restituisci esclusivamente un oggetto JSON con una proprietà "matchedIds" (array di stringhe).
  
  Lista Strumenti: ${JSON.stringify(context)}`;

  try {
    const response = await callWithModelRotation(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          matchedIds: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    const result = JSON.parse(text);
    const ids = result.matchedIds || [];

    // Save to Cache
    setCachedData(cacheKey, ids);
    return ids;

  } catch (error) {
    console.error("Errore Ricerca IA:", error);
    return [];
  }
};

export const repairAndParseJson = async (rawInput: string): Promise<any[]> => {
  // No caching needed effectively for one-off repairs
  const ai = getAiClient();
  const prompt = `L'utente sta cercando di importare una lista di siti web/tool ma il JSON o il testo è disordinato.
  Estrai gli elementi validi. Ogni elemento deve avere 'name', 'url' e opzionalmente 'category'.
  Correggi errori di battitura nelle chiavi. Ignora testo spazzatura.
  Restituisci un array JSON di oggetti.
  
  Input Data:
  ${rawInput.substring(0, 10000)} // Limit input size
  `;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;

    const text = response.text;
    if (!text) throw new Error("Risposta vuota");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Errore Dettagliato Gemini:", {
      message: error.message,
      status: error.status,
      details: error.details,
      stack: error.stack
    });
    throw error;
  }
};
