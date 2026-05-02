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
  
  // 1. Lunghezza (40%)
  // Range ideale BMAD: 80-300 chars
  if (desc.length >= 100) score += 0.4;
  else if (desc.length >= 80) score += 0.3;
  else if (desc.length > 40) score += 0.15;

  // 2. Densità Tecnica (10%)
  const words = desc.split(/\s+/);
  const techMatches = words.filter(w => TECHNICAL_KEYWORDS.has(w)).length;
  score += Math.min(0.1, techMatches * 0.05);

  // 3. Penalità Bassa Qualità (-20%)
  const lowQualityMatches = words.filter(w => LOW_QUALITY_KEYWORDS.has(w)).length;
  score -= Math.min(0.2, lowQualityMatches * 0.1);

  // 4. Presenza Campi V2 (20%)
  if (card.shortDescription && card.shortDescription.length > 5) score += 0.1;
  if (card.conceptFingerprint && card.conceptFingerprint.length > 0) score += 0.1;

  // 5. Penalità Inizio Nome (-5%)
  if (card.name && desc.startsWith(card.name.toLowerCase())) {
    score -= 0.05;
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
