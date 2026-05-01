# 🧠 BMAD PROJECT BRIEF — Personal Tools Hub: Intelligence Upgrade
**Versione:** 1.0  
**Progetto:** Personal Tools Hub — AI Enhancement Suite  
**Framework target:** Google Antigravity  
**Team:** BMAD Multi-Agent System  
**Data:** 2026-05-01  

---

## ⚠️ ISTRUZIONI CRITICHE PER IL TEAM BMAD

Questo documento è il **master brief** per il team di agenti. Ogni agente deve:

1. Leggere l'intero documento PRIMA di iniziare qualsiasi lavoro
2. Rispettare l'ordine di implementazione (FASE 1 → 2 → 3 → 4)
3. Non modificare alcun file esistente senza averlo prima analizzato e capito
4. Mantenere la tipizzazione TypeScript rigorosa su OGNI file modificato o creato
5. Preservare lo stile visuale "cyber/glassmorphism" esistente — NESSUNA regressione UI
6. Testare ogni feature prima di passare alla successiva
7. Usare `writeBatch` di Firestore per tutte le operazioni di migrazione dati

---

## 📋 CONTESTO APPLICAZIONE ESISTENTE

### Stack Tecnico (NON modificare senza accordo esplicito)
- **Frontend:** React 19 + TypeScript (strict mode) + Vite
- **Styling:** CSS Vanilla / Tailwind — estetica Glassmorphism + Matrix
- **Backend:** Firebase Auth + Firestore (real-time persistence)
- **AI Engine:** Google Gemini API via `@google/genai`
- **Servizi esistenti:** `authorizationService`, `rateLimitingService`, `batchEnrichmentEngine`

### Funzionalità esistenti (NON rompere)
- Batch Enrichment Engine con raggruppamento prompt
- Smart Name Extraction da URL GitHub/GitLab
- Semantic Search in linguaggio naturale
- Rate Limiting & Retry automatico (cooldown su errori 429)
- Force Global Sync via `writeBatch` Firestore
- Shared Database basato su email utente
- UI animata con micro-interazioni e firma Matrix

### Struttura dati attuale del documento Firestore (schema "scheda tool")
```typescript
interface ToolCard {
  id: string;
  url: string;
  name: string;
  description: string;       // generata da Gemini
  category: string;          // generata da Gemini
  tags: string[];            // generati da Gemini
  icon: string;              // emoji tematica generata da Gemini
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
}
```

---

## 🗺️ ROADMAP DI IMPLEMENTAZIONE — 4 FASI

---

## FASE 1 — CAVEMAN MODE: Ottimizzazione Token Agent

### 📌 Assegnato a: Architect Agent → Developer Agent

### Contesto
La repository `juliusbrussee/caveman` implementa una tecnica di compressione del linguaggio per agenti AI. L'idea è semplice ma potente: durante le sessioni di sviluppo interno, l'AI non ha bisogno di grammatica completa. Risparmiare il 65% dei token significa più contesto disponibile per il codice, più iterazioni per sessione, costi API ridotti.

### Obiettivo FASE 1
Implementare il "Caveman Protocol" come modalità operativa dell'Enrichment Engine di Gemini, in modo che le risposte **interne** (non mostrate all'utente) usino linguaggio compresso, mentre quelle **esterne** (descrizioni, tag, nomi) rimangano in italiano fluente e professionale.

### Story 1.1 — Architettura Dual-Mode Prompt

**Come** Developer Agent,  
**voglio** creare un `promptModeService.ts` che gestisca due modalità di prompt,  
**così che** le chiamate API Gemini interne risparmino token, quelle esterne siano di qualità premium.

**Acceptance Criteria:**
- [ ] Creare `src/services/promptModeService.ts` con tipizzazione TypeScript strict
- [ ] Definire `PromptMode: 'caveman' | 'premium'`
- [ ] Modalità `caveman`: prompt di sistema compressi, risposta strutturata JSON minimale, niente paragrafi descrittivi nel ragionamento interno
- [ ] Modalità `premium`: prompt espansi, output ricco in italiano, formattazione qualitativa
- [ ] Nessuna modifica al `rateLimitingService` esistente — wrapparlo, non toccarlo

**Implementazione tecnica richiesta:**

```typescript
// src/services/promptModeService.ts

export type PromptMode = 'caveman' | 'premium';

export interface CavemanConfig {
  systemInstruction: string;
  outputFormat: 'json-minimal' | 'json-full';
  maxOutputTokens: number;
}

// Caveman system instruction (risparmio ~60% token di sistema)
const CAVEMAN_SYSTEM = `
ROLE: url analyzer. TASK: extract data. 
OUTPUT: JSON only. NO explanation. NO preamble.
LANG: italian for user-facing fields only.
SCHEMA: {name,desc,category,tags[],icon,confidence}
RULES: desc<80chars. tags max5. icon=single emoji.
`;

// Premium system instruction (per Force Global Sync e re-enrichment)
const PREMIUM_SYSTEM = `
Sei un analista esperto di tool tecnici e software di sicurezza informatica.
Il tuo compito è analizzare URL e produrre schede informative di alta qualità in italiano.
// ... (istruzione completa esistente)
`;

export const promptModeService = {
  getConfig(mode: PromptMode): CavemanConfig { ... },
  buildBatchPrompt(urls: string[], mode: PromptMode): string { ... },
  parseResponse(raw: string, mode: PromptMode): Partial<ToolCard>[] { ... }
};
```

### Story 1.2 — Integrazione con Batch Enrichment Engine

**Come** Developer Agent,  
**voglio** modificare il `batchEnrichmentEngine` per accettare il `PromptMode`,  
**così che** il normale enrichment usi `caveman` e il Force Global Sync usi `premium`.

**Acceptance Criteria:**
- [ ] `batchEnrichmentEngine.enrich(urls, mode?: PromptMode)` — `mode` opzionale, default `'caveman'`
- [ ] Force Global Sync passa esplicitamente `mode: 'premium'`
- [ ] I log mostrano quale modalità è attiva (solo in development)
- [ ] TypeScript: nessun `any`, tutto tipato

### Story 1.3 — UI: Indicatore Modalità AI

**Come** utente,  
**voglio** vedere nell'interfaccia quale modalità AI è attiva durante l'enrichment,  
**così da** capire la qualità dell'operazione in corso.

**Acceptance Criteria:**
- [ ] Badge animato: `⚡ Fast Mode` (caveman) o `🧠 Premium Mode` (force sync) — stile cyber esistente
- [ ] Badge visibile solo durante operazioni AI attive, sparisce a completamento
- [ ] Nessuna regressione nelle micro-animazioni esistenti

---

## FASE 2 — SMART CARD INDEXING: Sistema di Indicizzazione Avanzata

### 📌 Assegnato a: Architect Agent → Developer Agent → QA Agent

### Contesto
La repository `supermemoryai/supermemory` implementa un engine di memoria semantica per AI basato su: chunking strutturato dei contenuti, metadata ricchi per il retrieval, e ricerca vettoriale. **Non integreremo Supermemory come servizio esterno** (complessità infrastrutturale eccessiva), ma applicheremo le sue **architetture e principi** direttamente in Firestore + Gemini, creando un sistema di indicizzazione proprietario ispirato ai suoi pattern.

### Principi da Supermemory applicati al nostro sistema
1. **Chunking Semantico**: ogni scheda tool non è un blob ma un documento strutturato con campi semanticamente separati
2. **Metadata Embedding**: campo `semanticIndex` con vettori di concetti, non solo keywords
3. **Confidence Score**: ogni campo generato ha uno score di confidenza
4. **Relational Tagging**: tag in tassonomia gerarchica, non flat list
5. **Use Case Tagging**: cosa fa il tool, non solo cosa è

### Story 2.1 — Evoluzione Schema ToolCard v2

**Come** Architect Agent,  
**voglio** progettare il nuovo schema `ToolCardV2` esteso,  
**così che** ogni scheda contenga abbastanza informazioni semantiche per un retrieval accurato.

**Schema target `ToolCardV2`:**

```typescript
// src/types/toolCard.ts

export interface ToolCardV2 extends ToolCard {
  // === CAMPI ESISTENTI (v1) — non rimuovere ===
  // id, url, name, description, category, tags, icon, createdAt, updatedAt, userId

  // === NUOVI CAMPI SEMANTICI (v2) ===
  
  /** Versione schema per migration management */
  schemaVersion: 2;

  /** 
   * Descrizione breve (max 80 chars) — per anteprime e UI compatta 
   * Diversa da description che è dettagliata
   */
  shortDescription: string;

  /**
   * Tassonomia gerarchica: ["Security > Web > Scanner", "Recon > Passive"]
   * Non flat, ma path categoriali per navigazione strutturata
   */
  categoryPath: string[];

  /**
   * Tag arricchiti con tipo semantico
   */
  enrichedTags: SemanticTag[];

  /**
   * Casi d'uso rilevati dall'AI — COSA si fa col tool, non cosa è
   * Es: ["test penetrazione web", "bug bounty reconnaissance", "audit SSL"]
   */
  useCases: string[];

  /**
   * Target di utenza rilevato
   */
  targetAudience: ('beginner' | 'intermediate' | 'expert' | 'professional')[];

  /**
   * Tool correlati (per URL/nome) — per "vedi anche" e clustering
   */
  relatedTools: string[];

  /**
   * Lingua rilevata del tool (documentazione, UI)
   */
  toolLanguage: string;

  /**
   * Stato del tool rilevato dall'AI (se deducibile dall'URL/dominio)
   */
  toolStatus: 'active' | 'deprecated' | 'archived' | 'unknown';

  /**
   * Score di confidenza del Batch Enrichment (0-1)
   */
  enrichmentConfidence: number;

  /**
   * Fingerprint semantico — array di concetti chiave estratti per similarity search
   * Generato da Gemini, usato per la Semantic Search avanzata
   */
  conceptFingerprint: string[];

  /** Timestamp dell'ultimo enrichment AI */
  lastEnrichedAt: Timestamp;
  
  /** Versione del prompt usato per l'enrichment (per re-enrichment selettivo) */
  enrichmentPromptVersion: string;
}

export interface SemanticTag {
  value: string;
  type: 'technology' | 'action' | 'domain' | 'platform' | 'language' | 'generic';
  weight: number; // 0-1, rilevanza del tag per la scheda
}
```

**Acceptance Criteria:**
- [ ] Schema `ToolCardV2` tipato in `src/types/toolCard.ts`
- [ ] Backward compatibility: `ToolCard` (v1) rimane importabile — le funzioni accettano `ToolCard | ToolCardV2`
- [ ] Type guard: `isToolCardV2(card: ToolCard | ToolCardV2): card is ToolCardV2`
- [ ] Documentazione JSDoc completa su ogni campo

### Story 2.2 — Migration Engine: da v1 a v2

**Come** Developer Agent,  
**voglio** un servizio di migrazione che upgrdi le schede esistenti a ToolCardV2,  
**così che** tutti i dati storici vengano preservati e arricchiti senza perdita.

**Acceptance Criteria:**
- [ ] `src/services/migrationService.ts` — funzione `migrateV1ToV2(cards: ToolCard[]): Promise<void>`
- [ ] Usa `writeBatch` Firestore — massimo 500 documenti per batch
- [ ] Campi non generabili senza AI (es. `useCases`, `conceptFingerprint`) impostati a `[]` o default — verranno popolati dal re-enrichment
- [ ] Campi deducibili senza AI (es. `schemaVersion: 2`, `toolStatus: 'unknown'`, `enrichmentConfidence: 0`) impostati immediatamente
- [ ] Logga il progresso in console (development only)
- [ ] Funzione idempotente: se una scheda è già v2 non viene ri-processata
- [ ] UI: progress bar durante la migrazione, con contatore "X / N schede migrate"

### Story 2.3 — Enhanced Batch Enrichment per ToolCardV2

**Come** Developer Agent,  
**voglio** aggiornare il `batchEnrichmentEngine` per popolare tutti i campi v2,  
**così che** ogni nuovo tool salvato riceva un profilo semantico completo.

**Prompt AI per enrichment v2 (modalità `premium`):**

```
Analizza il seguente URL di un tool tecnico/software:
URL: {url}
Nome rilevato: {extractedName}

Genera un JSON con questa struttura esatta:
{
  "name": "nome del tool (max 40 chars, titolo case, italiano se possibile)",
  "shortDescription": "descrizione ultra-breve max 80 chars, azione principale",
  "description": "descrizione professionale 2-3 frasi in italiano, tecnica ma chiara",
  "categoryPath": ["Categoria Principale > Sotto-categoria", "Categoria Alternativa"],
  "enrichedTags": [
    {"value": "tag1", "type": "technology|action|domain|platform|language|generic", "weight": 0.9}
  ],
  "useCases": ["caso d'uso 1 in italiano", "caso d'uso 2"],
  "targetAudience": ["expert"],
  "toolLanguage": "en|it|multi",
  "toolStatus": "active|deprecated|archived|unknown",
  "conceptFingerprint": ["concetto1", "concetto2", "concetto3", "concetto4", "concetto5"],
  "icon": "🔍",
  "confidence": 0.85
}

REGOLE CRITICHE:
- Tutti i testi descrittivi DEVONO essere in ITALIANO professionale
- categoryPath usa tassonomia Security: [Recon, Web, Network, Exploit, Forensics, OSINT, Crypto, Malware, DevSec, Utility]
- enrichedTags: massimo 7 tag, ordinati per weight decrescente
- useCases: max 4, formulati come azioni concrete ("testare vulnerabilità XSS su webapp")  
- conceptFingerprint: 5-8 concetti chiave estratti, in inglese tecnico (per similarity search)
- confidence: stima onesta 0-1 di quante informazioni hai potuto estrarre
- SOLO JSON valido, nessun testo extra
```

**Acceptance Criteria:**
- [ ] Prompt v2 integrato nel `batchEnrichmentEngine`
- [ ] Parsing robusto del JSON con fallback ai valori di default v2
- [ ] `enrichmentPromptVersion` impostato a `"v2.0"` (costante configurabile)
- [ ] `lastEnrichedAt` aggiornato ad ogni enrichment
- [ ] TypeScript: nessun cast unsafe, validazione schema al parse

---

## FASE 3 — SEMANTIC COMPREHENSION: Motore di Ricerca Potenziato

### 📌 Assegnato a: Developer Agent → QA Agent

### Contesto
Con i nuovi campi v2 (`conceptFingerprint`, `useCases`, `enrichedTags`, `categoryPath`), la Semantic Search esistente può essere trasformata da semplice keyword matching a vera comprensione dell'intento. Il modello ora capisce che "voglio trovare qualcosa per testare i form web" deve restituire tool con `useCases` contenenti "XSS", "form fuzzing", "web testing".

### Story 3.1 — Multi-Field Semantic Scoring

**Come** Developer Agent,  
**voglio** sostituire la ricerca semantica esistente con un sistema di scoring multi-campo,  
**così che** la ricerca sia significativamente più precisa e contestuale.

**Algoritmo di scoring (implementare in `semanticSearchService.ts`):**

```typescript
interface SearchScore {
  cardId: string;
  totalScore: number;
  breakdown: {
    conceptMatch: number;    // peso: 0.35 — match su conceptFingerprint
    useCaseMatch: number;    // peso: 0.30 — match su useCases
    tagMatch: number;        // peso: 0.20 — match su enrichedTags (pesato per weight)
    nameMatch: number;       // peso: 0.10 — match su name/shortDescription
    categoryMatch: number;   // peso: 0.05 — match su categoryPath
  }
}
```

**Flusso di ricerca:**
1. La query utente in linguaggio naturale viene inviata a Gemini (modalità `caveman`)
2. Gemini restituisce: `{ intent: string, concepts: string[], useCaseKeywords: string[], domain: string }`
3. Il sistema calcola `SearchScore` per ogni `ToolCardV2` in locale (client-side, nessuna chiamata Firestore extra)
4. Risultati ordinati per `totalScore` decrescente
5. Cards con `totalScore < 0.15` escluse dai risultati

**Prompt Gemini per parsing query (modalità `caveman`):**
```
Q: "{query}"
OUT JSON: {intent,concepts[],useCaseKW[],domain,lang}
NO EXTRA TEXT.
```

**Acceptance Criteria:**
- [ ] `semanticSearchService.ts` aggiornato con il nuovo algoritmo
- [ ] Fallback a ricerca per keyword se Gemini non disponibile (rate limit)
- [ ] TypeScript: `SearchScore` e tipi correlati nel file `/src/types/search.ts`
- [ ] Performance: scoring di 500 card < 100ms (client-side, algoritmo O(n) semplice)
- [ ] Backward compatible: le card v1 partecipano alla ricerca ma con score limitato (solo name/tags)

### Story 3.2 — Search UI Enhancement

**Come** utente,  
**voglio** vedere perché un tool è stato trovato,  
**così da** capire quanto è rilevante per la mia ricerca.

**Acceptance Criteria:**
- [ ] Highlight dei termini matchati nella card (già nell'UI se possibile, altrimenti tooltip)
- [ ] Badge di rilevanza: `🎯 Alta` / `⚡ Media` / `🔍 Bassa` — stile cyber già presente
- [ ] "Searched by: intent" — mostra l'intent estratto da Gemini sotto la search bar
- [ ] Se nessun risultato: suggerimento AI "Prova a cercare: ..." (generato da Gemini in modalità caveman)

---

## FASE 4 — DESCRIPTION QUALITY ENGINE: Descrizioni di Livello Premium

### 📌 Assegnato a: Developer Agent (+ revisione PM Agent)

### Contesto
Le descrizioni attuali sono generate con prompt generici. Possiamo migliorare drasticamente la qualità specializzando il prompt per il dominio Security/Pentesting e aggiungendo contesto dall'URL stesso, dal nome del progetto, e dai tag già generati.

### Story 4.1 — Prompt Engineering Specializzato per Security Tools

**Come** Developer Agent,  
**voglio** creare prompt specializzati per categoria di tool,  
**così che** le descrizioni siano esperte, specifiche e utili per un professionista security.

**Sistema di prompt per categoria:**

```typescript
// src/services/descriptionQualityService.ts

const CATEGORY_PROMPTS: Record<string, string> = {
  'Recon': `
    Stai descrivendo un tool di reconnaissance/OSINT per professionisti security.
    Enfatizza: target di ricognizione, tipologia di dati raccolti, metodologia OSINT applicabile.
    Evita: ovvietà generiche, termini marketing, "potente" o "avanzato" senza contesto.
  `,
  'Web': `
    Stai descrivendo un tool per web application security testing.
    Enfatizza: vulnerabilità rilevabili (XSS, SQLi, CSRF, etc.), protocolli supportati, tipo di scansione.
    Evita: descrizioni da landing page, promesse vaghe.
  `,
  'Network': `
    Stai descrivendo un tool di network security/analysis.
    Enfatizza: layer di rete, protocolli analizzabili, capacità di detection/capture.
  `,
  'Exploit': `
    Stai descrivendo un tool di exploitation/post-exploitation.
    Enfatizza: tipologia di exploit, target systems, framework di riferimento (Metasploit, etc.).
    Nota: descrizione tecnica neutrale, orientata a uso legittimo (pentest, CTF, research).
  `,
  // ... altre categorie
  'default': `
    Stai descrivendo un tool tecnico per professionisti IT/Security.
    Sii preciso, tecnico, conciso. In italiano professionale.
  `
};
```

**Prompt finale composito per descrizione premium:**
```
{CATEGORY_PROMPT}

Tool: {name}
URL: {url}
Tags già identificati: {tags.join(', ')}
Use cases già identificati: {useCases.join(', ')}

Scrivi UNA descrizione in italiano di massimo 120 caratteri.
Deve rispondere implicitamente a: "Cosa fa? Per chi? In quale scenario?"
NON iniziare con il nome del tool. NON usare "questo tool".
Solo la descrizione, nessun testo aggiuntivo.
```

**Acceptance Criteria:**
- [ ] `descriptionQualityService.ts` con mappa categorie → prompt specializzato
- [ ] Integrato nel flusso di enrichment v2 DOPO la generazione di `categoryPath`
- [ ] La descrizione viene usata come `description` (campo esistente), non in un campo separato
- [ ] Se la categoria non è nella mappa: usa il prompt `default`
- [ ] Fallback: se `descriptionQualityService` fallisce, usa la descrizione generata dal batch enrichment normale
- [ ] TypeScript: nessun `any`, interfacce chiare per ogni configurazione

### Story 4.2 — Description Quality Scoring & Auto-Retry

**Come** Developer Agent,  
**voglio** un sistema che valuti la qualità delle descrizioni generate e faccia retry se sotto soglia,  
**così che** le schede abbiano sempre descrizioni di livello accettabile.

**Regole di qualità (validazione client-side, NO chiamata AI extra):**

```typescript
interface DescriptionQualityCheck {
  passed: boolean;
  issues: string[];
  score: number; // 0-100
}

function checkDescriptionQuality(desc: string, toolName: string): DescriptionQualityCheck {
  const issues: string[] = [];
  // FAIL conditions:
  if (desc.length < 20) issues.push('TOO_SHORT');
  if (desc.length > 130) issues.push('TOO_LONG');
  if (desc.toLowerCase().startsWith(toolName.toLowerCase())) issues.push('STARTS_WITH_NAME');
  if (/questo tool|this tool|è uno strumento/i.test(desc)) issues.push('GENERIC_OPENER');
  if (/potente|avanzato|powerful|advanced/i.test(desc)) issues.push('MARKETING_SPEAK');
  if (!/[a-zàèìòù]/i.test(desc)) issues.push('NO_ITALIAN');
  
  const score = Math.max(0, 100 - (issues.length * 20));
  return { passed: issues.length === 0, issues, score };
}
```

**Acceptance Criteria:**
- [ ] Funzione `checkDescriptionQuality` in `descriptionQualityService.ts`
- [ ] Se quality score < 60: retry automatico con prompt leggermente variato (max 2 retry)
- [ ] Se dopo 2 retry ancora < 60: mantieni la migliore descrizione dei 3 tentativi
- [ ] `enrichmentConfidence` nella scheda viene abbassato di 0.1 per ogni retry necessario
- [ ] Log in development per monitorare le descrizioni che richiedono retry

---

## 📐 REGOLE TRASVERSALI PER TUTTO IL TEAM BMAD

### TypeScript
- Strict mode SEMPRE. Nessun `@ts-ignore` senza commento esplicativo
- Ogni funzione pubblica ha JSDoc con `@param`, `@returns`, `@throws`
- Nessun `any` — usare `unknown` con type guard se necessario
- Usare `const assertions` dove appropriato

### Firebase / Firestore
- MAI fare operazioni Firestore in loop — usare `writeBatch` (max 500 ops per batch)
- MAI esporre regole di sicurezza Firestore nel client
- Gestire sempre `onError` nelle subscription real-time
- Usare `serverTimestamp()` per tutti i timestamp scritti

### Gemini API
- SEMPRE passare attraverso `rateLimitingService` esistente
- Usare sempre `response_mime_type: 'application/json'` quando si aspetta JSON
- Validare sempre il JSON ricevuto prima di scrivere su Firestore
- MAI includere dati utente sensibili nel prompt (solo URL e metadati pubblici)

### UI/UX
- Preservare TUTTI gli effetti visivi esistenti (glassmorphism, glow, animazioni matrix)
- Nuovi componenti seguono la stessa palette: colori `var(--cyber-*)`
- Loading states su OGNI operazione asincrona
- Error states visibili ma non intrusivi (toast cyber-styled)
- Mobile-first: ogni nuovo componente responsivo

### Ordine di implementazione (CRITICO)
```
FASE 1 (Caveman Mode)
  → Story 1.1: promptModeService.ts
  → Story 1.2: integrazione batchEnrichmentEngine  
  → Story 1.3: UI badge
  → ✅ TEST: enrichment normale funziona, force sync funziona

FASE 2 (Smart Card Indexing)
  → Story 2.1: schema ToolCardV2
  → Story 2.2: migrationService
  → Story 2.3: enhanced batch enrichment
  → ✅ TEST: migrazione idempotente, nuove schede hanno tutti i campi v2

FASE 3 (Semantic Comprehension)
  → Story 3.1: multi-field semantic scoring
  → Story 3.2: search UI enhancement
  → ✅ TEST: ricerca "voglio trovare uno scanner web" restituisce tool corretti

FASE 4 (Description Quality Engine)
  → Story 4.1: category-specialized prompts
  → Story 4.2: quality scoring e retry
  → ✅ TEST: force sync su 10 schede produce descrizioni migliorate verificabili
```

---

## 🧪 CRITERI DI SUCCESSO GLOBALI

Al termine delle 4 fasi, il sistema deve soddisfare:

| Metrica | Before | Target After |
|--------|--------|-------------|
| Token per enrichment batch (10 url) | baseline | -40% o più |
| Campi informativi per scheda | 7 | 16+ |
| Precisione ricerca semantica (test soggettivo) | ~60% | ~85% |
| Qualità descrizione (score medio) | n/a | ≥ 75/100 |
| Regressioni UI | 0 | 0 (invariato) |
| Build TypeScript errors | 0 | 0 (invariato) |

---

## 📁 FILE DA CREARE (nuovi)
```
src/
├── types/
│   ├── toolCard.ts          (ToolCard v1 + ToolCardV2 + type guards)
│   └── search.ts            (SearchScore, SearchIntent)
├── services/
│   ├── promptModeService.ts (Story 1.1)
│   ├── migrationService.ts  (Story 2.2)
│   ├── descriptionQualityService.ts (Story 4.1 + 4.2)
│   └── semanticSearchService.ts (Story 3.1 — aggiornamento del file esistente)
└── components/
    └── AiModeBadge.tsx      (Story 1.3)
```

## 📁 FILE DA MODIFICARE (esistenti)
```
batchEnrichmentEngine.ts    → accetta PromptMode, usa prompt v2
semanticSearchService.ts    → nuovo algoritmo multi-field scoring
[componente search UI]      → nuovi badge e intent display
```

---

## 🚫 COSE CHE IL TEAM BMAD NON DEVE FARE

- Non installare Supermemory come dipendenza esterna — **ne applichiamo solo i principi architetturali**
- Non modificare la struttura Firebase/Auth esistente
- Non cambiare il sistema di autorizzazione (`authorizationService`)
- Non toccare il sistema Force Global Sync esistente (solo estenderlo con PromptMode)
- Non introdurre nuove dipendenze npm senza discuterne prima con il PM Agent
- Non cambiare il colore, font, o layout principale dell'app
- Non rimuovere la firma Matrix dell'autore
- Non esporre API keys nel client code

---

*Documento generato per il team BMAD di Personal Tools Hub. Ogni agente deve confermare la lettura di questo brief prima di iniziare la propria storia assegnata. Usare i commenti BMAD standard per comunicare blocchi, dipendenze e completion.*

**Status iniziale:** 🔴 Not Started  
**Prossimo step:** PM Agent valida il brief → Architect Agent inizia Story 2.1 (schema) in parallelo con Developer Agent su Story 1.1 (promptModeService)
