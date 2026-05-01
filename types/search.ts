/**
 * Search Types — BMAD FASE 3: Semantic Comprehension
 * 
 * Tipi per il sistema di ricerca semantica multi-campo.
 * 
 * @module types/search
 */

// ============================================================================
// SEARCH SCORE
// ============================================================================

/** Breakdown del punteggio di ricerca per campo */
export interface SearchScoreBreakdown {
  /** Score dal matching dei concept fingerprint (peso: 0.35) */
  concept: number;
  /** Score dal matching dei casi d'uso (peso: 0.30) */
  useCase: number;
  /** Score dal matching dei tag (peso: 0.20) */
  tag: number;
  /** Score dal matching del nome (peso: 0.10) */
  name: number;
  /** Score dal matching della categoria (peso: 0.05) */
  category: number;
}

/** Risultato di scoring per una singola card */
export interface SearchScore {
  /** ID della card */
  cardId: string;
  /** Punteggio totale pesato (0-1) */
  totalScore: number;
  /** Breakdown per campo */
  breakdown: SearchScoreBreakdown;
  /** Etichetta di rilevanza calcolata */
  relevanceLabel: 'high' | 'medium' | 'low';
}

// ============================================================================
// SEARCH INTENT
// ============================================================================

/** Intent estratto dalla query utente tramite AI */
export interface SearchIntent {
  /** L'intento principale della ricerca */
  intent: string;
  /** Concetti chiave estratti */
  concepts: string[];
  /** Keyword relative a casi d'uso */
  useCaseKeywords: string[];
  /** Dominio/area di pertinenza */
  domain: string;
}

// ============================================================================
// CONSTANTS — FIELD WEIGHTS
// ============================================================================

/** Pesi per il calcolo del punteggio multi-campo */
export const SEARCH_WEIGHTS = {
  concept: 0.35,
  useCase: 0.30,
  tag: 0.20,
  name: 0.10,
  category: 0.05,
} as const;

/** Soglia minima per includere un risultato */
export const SEARCH_SCORE_THRESHOLD = 0.15;
