/**
 * Description Quality Service — BMAD FASE 4: Description Quality & Confidence Scoring
 * 
 * Valuta la qualità semantica e tecnica delle descrizioni generate.
 * 
 * Criteri:
 * - Lunghezza ottimale (80-150 chars)
 * - Densità tecnica (presenza di keyword specifiche del settore)
 * - Assenza di placeholder (es: "nessuna descrizione", "clicca qui")
 * - Lingua (preferenza per italiano tecnico e pulito)
 * 
 * @module descriptionQualityService
 */

import { ToolCardV2 } from '../types/toolCard';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Keyword che indicano un'alta qualità tecnica */
const TECHNICAL_KEYWORDS = new Set([
  'penetration', 'security', 'vulnerability', 'exploit', 'analysis', 
  'scanner', 'audit', 'osint', 'network', 'protocol', 'encryption',
  'bypass', 'framework', 'automation', 'cloud', 'forensics', 'proxy',
  'threat', 'malware', 'detection', 'firewall', 'pentesting', 'burp',
  'nmap', 'metasploit', 'wireshark', 'fuzzing', 'brute', 'injection'
]);

/** Keyword che indicano bassa qualità o placeholder */
const LOW_QUALITY_KEYWORDS = new Set([
  'clicca', 'qui', 'visita', 'sito', 'web', 'nessuna', 'descrizione',
  'disponibile', 'potente', 'fantastico', 'migliore'
]);

/**
 * Prompt specializzati per categoria (BMAD FASE 4)
 */
export const CATEGORY_PROMPTS: Record<string, string> = {
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
  'OSINT': `
    Stai descrivendo un tool di Open Source Intelligence (OSINT).
    Enfatizza: fonti di dati (social, DNS, metadata), tecniche di footprinting, automazione della ricerca.
  `,
  'default': `
    Stai descrivendo un tool tecnico per professionisti IT/Security.
    Sii preciso, tecnico, conciso. In italiano professionale.
  `
};

/**
 * Genera un prompt specializzato basato sulla categoria del tool.
 */
export function getSpecializedPrompt(category: string, name: string, url: string): string {
  const baseCategory = Object.keys(CATEGORY_PROMPTS).find(k => 
    category.toLowerCase().includes(k.toLowerCase())
  ) || 'default';
  
  const instruction = CATEGORY_PROMPTS[baseCategory];
  
  return `
${instruction}

Tool: ${name}
URL: ${url}

Scrivi UNA descrizione in italiano di massimo 180 caratteri.
Deve rispondere implicitamente a: "Cosa fa? Per chi? In quale scenario?"
NON iniziare con il nome del tool. NON usare "questo tool".
Solo la descrizione, nessun testo aggiuntivo.
  `.trim();
}

// ============================================================================
// QUALITY ENGINE
// ============================================================================

/**
 * Valuta la qualità di una card e restituisce un confidence score (0-1).
 * 
 * @param card - La card da valutare
 * @returns Score di qualità (1.0 = perfetto, 0.0 = inutile)
 */
export function evaluateCardQuality(card: Partial<ToolCardV2>): number {
  const desc = (card.description || '').toLowerCase();
  if (desc.length < 10) return 0.1;

  let score = 0.5; // Base score alzato
  
  // 1. Lunghezza (30%)
  // Range ideale BMAD: 80-300 chars
  if (desc.length >= 150) score += 0.3;
  else if (desc.length >= 80) score += 0.2;
  else if (desc.length > 40) score += 0.1;

  // 2. Densità Tecnica (15%)
  const words = desc.split(/\s+/);
  const techMatches = words.filter(w => {
    const cleanWord = w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    return TECHNICAL_KEYWORDS.has(cleanWord);
  }).length;
  score += Math.min(0.15, techMatches * 0.05);

  // 3. Penalità Bassa Qualità (-15%)
  const lowQualityMatches = words.filter(w => LOW_QUALITY_KEYWORDS.has(w)).length;
  score -= Math.min(0.15, lowQualityMatches * 0.05);

  // 4. Presenza Campi V2 (40%) - CRITICO PER PREMIUM MODE
  let v2Score = 0;
  if (card.shortDescription && card.shortDescription.length > 10) v2Score += 0.1;
  if (card.conceptFingerprint && card.conceptFingerprint.length > 0) v2Score += 0.1;
  if (card.categoryPath && card.categoryPath.includes('>')) v2Score += 0.1;
  if (card.useCases && card.useCases.length > 0) v2Score += 0.1;
  score += v2Score;

  // 5. Penalità Inizio Nome (-5%)
  if (card.name && desc.startsWith(card.name.toLowerCase())) {
    score -= 0.05;
  }

  // 6. Bonus Lingua Italiana (Tecnica)
  if (desc.includes('strumento') || desc.includes('permette') || desc.includes('sicurezza')) {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Determina se una card necessita di un re-enrichment qualitativo (Premium).
 * 
 * @param card - La card da verificare
 * @returns true se la qualità è insufficiente
 */
export function needsQualityUpgrade(card: Partial<ToolCardV2>): boolean {
  // Se non è v2, serve sicuramente un upgrade
  if (card.schemaVersion !== 2) return true;

  const quality = evaluateCardQuality(card);
  
  // Se la qualità è < 0.6 e non è stata arricchita recentemente con Premium
  return quality < 0.6;
}

/**
 * Filtra un array di card restituendo quelle che necessitano di upgrade.
 */
export function getLowQualityCards(cards: ToolCardV2[]): ToolCardV2[] {
  return cards.filter(c => needsQualityUpgrade(c));
}
