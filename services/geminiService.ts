import { GoogleGenAI, Type } from "@google/genai";
import { LinkItem } from "../types";
import { getCachedData, setCachedData, getEnrichmentKey, getSearchKey } from "./cacheService";
import {
  PromptMode,
  getPromptConfig,
  buildBatchPrompt,
  buildSinglePrompt,
  parseBatchResponse,
  getModeLabel,
  type BatchPromptItem,
  type EnrichmentResult
} from "./promptModeService";

// Accesso alla chiave e modello configurati (pressione GEMINI_ in vite.config.ts)
const RAW_API_KEY = import.meta.env.GEMINI_API_KEY || "";
const RAW_MODEL_NAME = import.meta.env.GEMINI_MODEL || "gemini-1.5-flash";

// Sanificazione: Rimuove eventuali apici o spazi bianchi che possono finire nelle variabili Vercel/Env
const API_KEY = RAW_API_KEY.replace(/['"]+/g, '').trim();

// Supporto per rotazione modelli se specificati come lista separata da virgola
const MODEL_LIST = RAW_MODEL_NAME.split(',').map(m => m.replace(/['"]+/g, '').trim());

console.log(`AI Service Init - Models: ${MODEL_LIST.join(', ')}`);
console.log(`AI Service Init - Key Info: Len=${API_KEY.length}, Prefix=${API_KEY.substring(0, 5)}..., Suffix=...${API_KEY.substring(API_KEY.length - 4)}`);

/**
 * Token limits per model (TPM - Tokens Per Minute)
 * Estimated tokens per item: ~400 (input + output combined)
 * We use 70% of the limit for safety margin
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gemini-3-flash': 250000,
  'gemini-2.5-flash-lite': 250000,
  'gemini-2.5-flash': 250000,
  'gemini-2.5-flash-tts': 10000,
  'gemini-1.5-flash': 250000,
  'default': 100000
};

const TOKENS_PER_ITEM = 400; // Conservative estimate
const SAFETY_MARGIN = 0.7;   // Use only 70% of limit
const MAX_PRACTICAL_BATCH = 50; // Cap for practical processing

/**
 * Calculate max batch size based on the first model in the rotation list
 */
export function getMaxBatchSize(): number {
  const primaryModel = MODEL_LIST[0] || 'default';
  const tokenLimit = MODEL_TOKEN_LIMITS[primaryModel] || MODEL_TOKEN_LIMITS['default'];
  const theoreticalMax = Math.floor((tokenLimit * SAFETY_MARGIN) / TOKENS_PER_ITEM);
  const finalBatchSize = Math.min(theoreticalMax, MAX_PRACTICAL_BATCH);
  console.log(`Batch Size Calculated: ${finalBatchSize} items (Model: ${primaryModel}, Limit: ${tokenLimit} TPM)`);
  return finalBatchSize;
}

/**
 * HELPER per rimuovere config avanzate che causano 400 su modelli vecchi/lite
 */
function sanitizeConfigForModel(model: string, config: any) {
  const sanitized = { ...config };
  // Alcuni modelli lite/flash-lite non supportano responseMimeType o responseSchema
  if (model.includes('lite') || model.includes('pro')) {
    // Mantieni la config base se necessario, ma rimuovi schema se sospetto
    // Per ora proviamo a rimuovere solo se fallisce
  }
  return sanitized;
}

export const getAiClient = () => new GoogleGenAI({ apiKey: API_KEY });

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
 * HELPER per rotazione modelli in caso di quota esaurita (429)
 */
async function callWithModelRotation(contents: string, config: any): Promise<any> {
  const ai = getAiClient();
  let lastError = null;

  for (const model of MODEL_LIST) {
    try {
      console.log(`Tentativo con modello: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: contents,
        config: sanitizeConfigForModel(model, config)
      });
      if (response.text) {
        console.log(`Modello ${model} ha risposto con successo.`);
        return response;
      }
    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || error.status === 429;
      const isBadRequest = error.message?.includes('400') || error.status === 400;

      if (isRateLimit) {
        console.warn(`Modello ${model} esaurito (Quota). Provo il prossimo...`);
        lastError = error;
        continue;
      }

      if (isBadRequest && model.includes('lite')) {
        console.warn(`Modello ${model} ha rifiutato la config (400). Riprovo con config semplificata...`);
        try {
          const simpleResponse = await ai.models.generateContent({
            model,
            contents: contents,
            config: {} // Riprova senza JSON schema o altro
          });
          if (simpleResponse.text) return simpleResponse;
        } catch (e2) {
          console.error(`Fallimento anche con config semplificata su ${model}`);
        }
      }

      console.error(`Errore critico su modello ${model}:`, error.message);
      lastError = error;
      continue; // Passa comunque al prossimo modello invece di bloccarsi
    }
  }
  throw lastError || new Error("Nessun modello disponibile");
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
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          emoji: { type: Type.STRING },
          suggestedName: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ["category", "description", "tags"],
      },
      maxOutputTokens: config.maxOutputTokens,
    });

    const text = response.text;
    if (!text) throw new Error("Nessuna risposta dall'IA");
    const result: Partial<EnrichmentResult> = JSON.parse(text);

    // 3. Save to Cache
    setCachedData(cacheKey, result);
    return result;

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
      maxOutputTokens: config.maxOutputTokens,
    });

    const text = response.text;
    if (import.meta.env.DEV) {
      console.log("Raw Batch AI Response:", text);
    }
    if (!text) {
      console.warn("AI returned empty text. This might be a quota block or safety filter.");
      throw new Error("Risposta Batch Vuota");
    }

    // Parse and normalize using promptModeService
    try {
      return parseBatchResponse(text, items, mode);
    } catch (pe) {
      console.error("JSON Parse Error on AI response:", text);
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
        type: Type.OBJECT,
        properties: {
          matchedIds: { type: Type.ARRAY, items: { type: Type.STRING } }
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
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

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
