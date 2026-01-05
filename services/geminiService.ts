import { GoogleGenAI, Type } from "@google/genai";
import { LinkItem } from "../types";
import { getCachedData, setCachedData, getEnrichmentKey, getSearchKey } from "./cacheService";

// Accesso alla chiave e modello configurati (pressione GEMINI_ in vite.config.ts)
const RAW_API_KEY = import.meta.env.GEMINI_API_KEY || "";
const RAW_MODEL_NAME = import.meta.env.GEMINI_MODEL || "gemini-1.5-flash";

// Sanificazione: Rimuove eventuali apici o spazi bianchi che possono finire nelle variabili Vercel/Env
const API_KEY = RAW_API_KEY.replace(/['"]+/g, '').trim();

// Supporto per rotazione modelli se specificati come lista separata da virgola
const MODEL_LIST = RAW_MODEL_NAME.split(',').map(m => m.replace(/['"]+/g, '').trim());

console.log(`AI Service Init - Models: ${MODEL_LIST.join(', ')}`);
console.log(`AI Service Init - Key Info: Len=${API_KEY.length}, Prefix=${API_KEY.substring(0, 5)}..., Suffix=...${API_KEY.substring(API_KEY.length - 4)}`);

const getAiClient = () => new GoogleGenAI({ apiKey: API_KEY });

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
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      if (response.text) return response;
    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || error.status === 429;
      if (isRateLimit) {
        console.warn(`Modello ${model} esaurito (Quota). Provo il prossimo...`);
        lastError = error;
        continue;
      }
      throw error; // Altri tipi di errore bloccano l'esecuzione
    }
  }
  throw lastError || new Error("Nessun modello disponibile");
}

export const enrichLinkData = async (name: string, url: string): Promise<Partial<LinkItem>> => {
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

  const ai = getAiClient();
  const prompt = `Analizza questo tool di sicurezza/pentesting: Nome="${name}", URL="${url}".
  Fornisci una descrizione concisa in ITALIANO (max 25 parole), una categoria specifica (es: Threat Intelligence, OSINT, Vulnerability Scanning, Dorks, Ricerca Codice) e 3-5 tag rilevanti.
  Rispondi esclusivamente in formato JSON.`;

  try {
    const response = await callWithModelRotation(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["category", "description", "tags"],
      },
    });

    const text = response.text;
    if (!text) throw new Error("Nessuna risposta dall'IA");
    const result = JSON.parse(text);

    // 3. Save to Cache
    setCachedData(cacheKey, result);
    return result;

  } catch (error: any) {
    console.error("Errore Gemini:", error);
    throw error;
  }
};

/**
 * BATCH ENRICHMENT
 * Processes up to 5 links in a single API call to save quota.
 */
export const enrichLinksBatch = async (items: { id: string, name: string, url: string, currentDescription?: string }[]): Promise<Record<string, Partial<LinkItem>>> => {
  if (items.length === 0) return {};

  const ai = getAiClient();

  // Construct a batch prompt
  const itemsText = items.map((item, index) =>
    `Item ${index}: ID="${item.id}", Name="${item.name}", URL="${item.url}", CurrentDescription="${item.currentDescription || ''}"`
  ).join('\n\n');

  const prompt = `Sei un esperto di Cyber Security. Il tuo compito è analizzare, classificare e migliorare le descrizioni di questi strumenti.
  
  INPUT DATA:
  ${itemsText}

  REQURIEMENTS PER OGNI ITEM:
  1. Analizza l'URL e il nome.
  2. Se "CurrentDescription" è presente e valida, RIELABORALA per renderla più professionale e concisa (max 25 parole).
  3. Se "CurrentDescription" è vuota o inutile (es. "fallback", "error"), GENERALA da zero basandoti sul tool.
  4. Assegna una Categoria precisa (Security, Network, Dev, OSINT, etc.).
  5. Genera 3-5 tag tecnici.

  OUTPUT:
  Restituisci un UNICO oggetto JSON dove le chiavi sono gli ID degli item e i valori sono oggetti con { category, description, tags }.
  Esempio:
  {
    "id_1": { "category": "...", "description": "...", "tags": [...] },
    "id_2": { ... }
  }`;

  try {
    const response = await callWithModelRotation(prompt, {
      responseMimeType: "application/json"
    });

    const text = response.text;
    console.log("Raw Batch AI Response:", text);
    if (!text) {
      console.warn("AI returned empty text. This might be a quota block or safety filter.");
      throw new Error("Risposta Batch Vuota");
    }

    // Parse and handle potential casing issues with IDs from AI
    let rawResult;
    try {
      rawResult = JSON.parse(text);
    } catch (pe) {
      console.error("JSON Parse Error on AI response:", text);
      throw new Error("Errore nel formato dei dati IA");
    }

    const normalizedResult: Record<string, Partial<LinkItem>> = {};

    // Ensure we match the original IDs correctly even if AI changed them
    for (const key in rawResult) {
      const originalItem = items.find(it => it.id.toLowerCase() === key.toLowerCase());
      if (originalItem) {
        normalizedResult[originalItem.id] = rawResult[key];
      }
    }

    return normalizedResult;

  } catch (error: any) {
    const isQuota = error.message?.includes('429') || error.status === 429;
    console.error("Errore Dettagliato Gemini:", {
      message: error.message,
      isQuota: isQuota,
      status: error.status,
      details: error.details
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

  // Inviamo una versione semplificata per risparmiare token
  // Optimize context size: limit descriptions length
  const context = items.map(item => ({
    id: item.id,
    txt: `${item.name} (${item.category}): ${item.description.substring(0, 100)}`
  }));

  const prompt = `Query Utente: "${query}"
  
  Task: Seleziona gli ID degli strumenti dalla lista fornita che sono più rilevanti per la Query Utente.
  Comprendi l'intento in lingua italiana (es: "wifi" dovrebbe matchare "wireless", "password" dovrebbe matchare "credentials" o "dork").
  Restituisci SOLO un oggetto JSON con una proprietà "matchedIds" contenente un array di stringhe.
  
  Lista: ${JSON.stringify(context)}`;

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
