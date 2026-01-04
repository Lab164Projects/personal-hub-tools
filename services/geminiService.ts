import { GoogleGenAI, Type } from "@google/genai";
import { LinkItem } from "../types";
import { getCachedData, setCachedData, getEnrichmentKey, getSearchKey } from "./cacheService";

const API_KEY = process.env.API_KEY || '';

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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
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
      },
    });

    const text = response.text;
    if (!text) throw new Error("Nessuna risposta dall'IA");
    const result = JSON.parse(text);

    // 3. Save to Cache
    setCachedData(cacheKey, result);
    return result;

  } catch (error) {
    console.error("Errore Arricchimento IA:", error);
    // Fallback se l'IA fallisce
    return {
      category: "Non categorizzato (Errore IA)",
      description: "Descrizione non disponibile al momento.",
      tags: ["error"],
    };
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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedIds: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
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
      model: "gemini-3-flash-preview",
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
    console.error("Errore Riparazione IA:", error);
    throw new Error("Impossibile riparare i dati JSON.");
  }
};
