import { GoogleGenAI, Type } from "@google/genai";
import { LinkItem } from "../types";

const API_KEY = process.env.API_KEY || '';

const getAiClient = () => new GoogleGenAI({ apiKey: API_KEY });

export const enrichLinkData = async (name: string, url: string): Promise<Partial<LinkItem>> => {
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
    return JSON.parse(text);
  } catch (error) {
    console.error("Errore Arricchimento IA:", error);
    // Fallback se l'IA fallisce
    return {
      category: "Non categorizzato",
      description: "Descrizione non disponibile.",
      tags: ["tool"],
    };
  }
};

export const semanticSearch = async (query: string, items: LinkItem[]): Promise<string[]> => {
  const ai = getAiClient();
  
  // Inviamo una versione semplificata per risparmiare token
  const context = items.map(item => ({
    id: item.id,
    txt: `${item.name} (${item.category}): ${item.description}`
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
    return result.matchedIds || [];
  } catch (error) {
    console.error("Errore Ricerca IA:", error);
    return [];
  }
};

export const repairAndParseJson = async (rawInput: string): Promise<any[]> => {
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
