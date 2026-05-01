/**
 * Prompt Mode Service — BMAD FASE 1: Caveman Mode
 * 
 * Gestisce due modalità di prompt per ottimizzare il consumo di token API:
 * - `caveman`: prompt ultra-compatti per enrichment di routine (~60% risparmio token)
 * - `premium`: prompt espansi per Force Global Sync e re-enrichment di qualità
 * 
 * NON modifica il rateLimitService — lo wrapperà nel flusso di chiamata.
 * 
 * @module promptModeService
 */

/** Modalità di prompt disponibili */
export type PromptMode = 'caveman' | 'premium';

/** Configurazione per la modalità di prompt */
export interface PromptModeConfig {
  /** Istruzione di sistema per il modello AI */
  systemInstruction: string;
  /** Formato output atteso */
  outputFormat: 'json-minimal' | 'json-full';
  /** Limite massimo token di output */
  maxOutputTokens: number;
}

/** Struttura item per la costruzione dei prompt batch */
export interface BatchPromptItem {
  id: string;
  name: string;
  url: string;
  currentDescription?: string;
}

/** Risultato parsato da una risposta AI per un singolo item */
export interface EnrichmentResult {
  category: string;
  description: string;
  tags: string[];
  emoji: string;
  suggestedName?: string;
  confidence?: number;
  // --- ToolCardV2 fields (populated only in premium mode) ---
  shortDescription?: string;
  categoryPath?: string;
  useCases?: string[];
  targetAudience?: string;
  toolLanguage?: string;
  toolStatus?: string;
  conceptFingerprint?: string[];
  enrichedTags?: Array<{ value: string; type: string; weight: number }>;
}

// ============================================================================
// SYSTEM INSTRUCTIONS
// ============================================================================

/**
 * Caveman system instruction — risparmio ~60% token di sistema.
 * Output JSON minimale, niente ragionamento, solo dati strutturati.
 */
const CAVEMAN_SYSTEM = `ROLE: url analyzer. TASK: extract data.
OUTPUT: JSON only. NO explanation. NO preamble.
LANG: italian for user-facing fields only.
SCHEMA per item: {category,description,tags[],emoji,suggestedName,confidence}
RULES: description<80chars italian. tags max5. emoji=single emoji. suggestedName=real project name if input name is generic (Github/Gitlab/etc). confidence=0-1.` as const;

/**
 * Premium system instruction — per Force Global Sync e re-enrichment qualitativo.
 * Output ricco, descrizioni professionali in italiano, formattazione curata.
 */
const PREMIUM_SYSTEM = `Sei un analista esperto di tool tecnici e software di sicurezza informatica.
Il tuo compito è analizzare URL e produrre schede informative di alta qualità in italiano.

REGOLE FONDAMENTALI:
- TUTTE le descrizioni DEVONO essere in ITALIANO professionale e tecnico
- NON iniziare mai la descrizione con il nome del tool
- NON usare frasi generiche come "questo tool", "è uno strumento", "potente", "avanzato"
- Le descrizioni devono rispondere implicitamente a: "Cosa fa? Per chi? In quale scenario?"
- Sii preciso, specifico, orientato all'azione
- Ogni campo deve essere accurato e verificabile

FORMATO OUTPUT: JSON valido, nessun testo aggiuntivo.` as const;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Restituisce la configurazione per la modalità di prompt specificata.
 * 
 * @param mode - Modalità di prompt da usare
 * @returns Configurazione completa con system instruction, formato e token limit
 */
export function getPromptConfig(mode: PromptMode): PromptModeConfig {
  switch (mode) {
    case 'caveman':
      return {
        systemInstruction: CAVEMAN_SYSTEM,
        outputFormat: 'json-minimal',
        maxOutputTokens: 1024,
      };
    case 'premium':
      return {
        systemInstruction: PREMIUM_SYSTEM,
        outputFormat: 'json-full',
        maxOutputTokens: 4096,
      };
  }
}

/**
 * Costruisce il prompt batch per l'enrichment di più URL.
 * 
 * @param items - Array di item da analizzare
 * @param mode - Modalità di prompt ('caveman' | 'premium')
 * @returns Prompt completo per il batch enrichment
 */
export function buildBatchPrompt(items: ReadonlyArray<BatchPromptItem>, mode: PromptMode): string {
  const config = getPromptConfig(mode);

  if (mode === 'caveman') {
    // Prompt compatto — solo dati essenziali, minimo verboso
    const itemsList = items.map((item, i) =>
      `${i}:ID="${item.id}",N="${item.name}",U="${item.url}"`
    ).join('\n');

    return `${config.systemInstruction}

ITEMS:
${itemsList}

OUTPUT: single JSON object. Keys=item IDs. Values={category,description,tags[],emoji,suggestedName,confidence}.
If name is generic platform name (Github/Gitlab/Bitbucket/Sourceforge), extract REAL project name from URL path as suggestedName.`;
  }

  // Premium — prompt espanso con istruzioni dettagliate
  const itemsText = items.map((item, index) =>
    `Item ${index}: ID="${item.id}", Nome="${item.name}", URL="${item.url}", Descrizione attuale="${item.currentDescription || ''}"`
  ).join('\n\n');

  return `${config.systemInstruction}

ANALIZZA I SEGUENTI TOOL:

${itemsText}

PER OGNI ITEM GENERA UN OGGETTO JSON CON TUTTI QUESTI CAMPI:
1. "category": categoria specifica IN ITALIANO (Sicurezza Web, Analisi Rete, OSINT, Sviluppo, Analisi Vulnerabilità, Threat Intelligence, Crittografia, Forensics, DevSecOps, Utility)
2. "description": descrizione professionale in italiano, 2-3 frasi, max 120 caratteri. Tecnica ma chiara. NON iniziare col nome del tool.
3. "shortDescription": versione ultra-breve della descrizione (max 60 chars), azione principale del tool
4. "categoryPath": percorso gerarchico (es: "Security > Web > Scanner", "OSINT > Social Media")
5. "tags": 3-5 tag tecnici pertinenti (stringhe semplici)
6. "enrichedTags": array di oggetti {"value":"tag","type":"technique|domain|target|language|protocol|platform","weight":0.0-1.0}
7. "useCases": 2-3 casi d'uso specifici (es: ["penetration testing webapp", "vulnerability assessment"])
8. "targetAudience": pubblico target (es: "pentesters", "sysadmin", "sviluppatori")
9. "toolLanguage": linguaggio principale del tool se noto (es: "Python", "Go", "Rust", "JavaScript")
10. "toolStatus": uno tra "active", "deprecated", "development", "unknown"
11. "conceptFingerprint": 5-8 keyword normalizzate per matching veloce (es: ["scanner","web","vulnerability","owasp"])
12. "emoji": singola emoji tematica (🔍 ricerca, 🛡️ sicurezza, 📡 networking, 🕵️ OSINT, 💻 sviluppo, 🔒 crittografia, 🧪 testing, 📊 analisi)
13. "suggestedName": se il nome corrente è generico (Github, Gitlab, Bitbucket, Sourceforge), analizza l'URL ed estrai il VERO nome del progetto
14. "confidence": stima 0-1 della qualità complessiva dei dati estratti

FORMATO: Un UNICO oggetto JSON dove le chiavi sono gli ID degli item.
Esempio: { "id_1": { "category": "...", "description": "...", "shortDescription": "...", "categoryPath": "...", "tags": [...], "enrichedTags": [{"value":"sql-injection","type":"technique","weight":0.9}], "useCases": [...], "targetAudience": "...", "toolLanguage": "Python", "toolStatus": "active", "conceptFingerprint": [...], "emoji": "🔍", "suggestedName": "NomeTool", "confidence": 0.85 } }`;
}

/**
 * Costruisce il prompt per l'enrichment di un singolo URL.
 * 
 * @param name - Nome del tool
 * @param url - URL del tool
 * @param mode - Modalità di prompt ('caveman' | 'premium')
 * @returns Prompt completo per il singolo enrichment
 */
export function buildSinglePrompt(name: string, url: string, mode: PromptMode): string {
  const config = getPromptConfig(mode);

  if (mode === 'caveman') {
    return `${config.systemInstruction}
N="${name}" U="${url}"
OUT JSON: {category,description,tags[],emoji,suggestedName,confidence}`;
  }

  return `${config.systemInstruction}

Tool: Nome="${name}", URL="${url}"

Genera un oggetto JSON con:
- "category": categoria specifica in italiano
- "description": descrizione professionale in italiano (max 120 chars), NON iniziare col nome del tool
- "shortDescription": versione ultra-breve (max 60 chars)
- "categoryPath": percorso gerarchico (es: "Security > Web > Scanner")
- "tags": 3-5 tag tecnici
- "enrichedTags": array di oggetti {"value":"tag","type":"technique|domain|target|language|protocol|platform","weight":0.0-1.0}
- "useCases": 2-3 casi d'uso specifici
- "targetAudience": pubblico target
- "toolLanguage": linguaggio principale se noto
- "toolStatus": "active"|"deprecated"|"development"|"unknown"
- "conceptFingerprint": 5-8 keyword normalizzate
- "emoji": singola emoji tematica
- "suggestedName": nome reale del progetto se il nome fornito è generico
- "confidence": stima 0-1 della qualità

SOLO JSON valido, nessun testo extra.`;
}

/**
 * Parsa e valida la risposta AI per un batch di item.
 * Normalizza gli ID per gestire possibili discrepanze di case.
 * 
 * @param rawText - Testo grezzo dalla risposta AI
 * @param originalItems - Item originali per la normalizzazione degli ID
 * @param _mode - Modalità usata (per future estensioni di parsing)
 * @returns Record con ID originali come chiave e risultati parziali come valore
 * @throws Error se il JSON non è parsabile
 */
export function parseBatchResponse(
  rawText: string,
  originalItems: ReadonlyArray<BatchPromptItem>,
  _mode: PromptMode
): Record<string, Partial<EnrichmentResult>> {
  const rawResult: Record<string, Partial<EnrichmentResult>> = JSON.parse(rawText);
  const normalizedResult: Record<string, Partial<EnrichmentResult>> = {};

  for (const key in rawResult) {
    const originalItem = originalItems.find(
      it => it.id.toLowerCase() === key.toLowerCase()
    );
    if (originalItem) {
      normalizedResult[originalItem.id] = rawResult[key];
    }
  }

  return normalizedResult;
}

/**
 * Utility: restituisce il nome leggibile della modalità per i log.
 * 
 * @param mode - Modalità di prompt
 * @returns Etichetta leggibile
 */
export function getModeLabel(mode: PromptMode): string {
  return mode === 'caveman' ? '⚡ Fast Mode' : '🧠 Premium Mode';
}
