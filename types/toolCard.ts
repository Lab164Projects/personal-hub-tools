/**
 * ToolCardV2 Schema — BMAD FASE 2: Smart Card Indexing
 * 
 * Estende il LinkItem originale con campi semantici arricchiti per:
 * - Ricerca multi-campo avanzata (FASE 3)
 * - Quality scoring delle descrizioni (FASE 4)
 * - Tracciamento versione schema e prompt
 * 
 * @module types/toolCard
 */

import { LinkItem } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Versione corrente dello schema dati. Usata per migrazioni. */
export const CURRENT_SCHEMA_VERSION = 2;

/** Versione corrente del prompt di enrichment. */
export const ENRICHMENT_PROMPT_VERSION = 'v2.0';

// ============================================================================
// SEMANTIC TAG
// ============================================================================

/** Tipo di tag semantico per classificazione fine */
export type SemanticTagType = 'technique' | 'domain' | 'target' | 'language' | 'protocol' | 'platform';

/**
 * Tag semantico pesato.
 * A differenza dei semplici string[], ogni tag ha un tipo e un peso
 * che influenza il ranking nella ricerca semantica.
 */
export interface SemanticTag {
  /** Valore del tag (es: "sql-injection", "web-app", "python") */
  value: string;
  /** Tipo classificativo del tag */
  type: SemanticTagType;
  /** Peso relativo 0-1, usato nel scoring della ricerca */
  weight: number;
}

// ============================================================================
// TOOL CARD V2
// ============================================================================

/** Stato del tool (attivo, deprecato, in sviluppo, sconosciuto) */
export type ToolStatus = 'active' | 'deprecated' | 'development' | 'unknown';

/**
 * ToolCardV2 — schema arricchito che estende LinkItem.
 * 
 * I campi aggiuntivi sono TUTTI opzionali per backward compatibility.
 * Il campo `schemaVersion` distingue le card v1 (assente o 1) dalle v2.
 * 
 * Campi v2 vengono popolati progressivamente:
 * - migrationService (FASE 2): imposta schemaVersion, valori default
 * - enrichLinksBatch premium (FASE 2-3): popola semantics, useCases, conceptFingerprint
 * - descriptionQualityService (FASE 4): aggiorna confidence, enrichmentPromptVersion
 */
export interface ToolCardV2 extends LinkItem {
  /** Versione dello schema dati (1 = legacy, 2 = current) */
  schemaVersion?: number;

  // --- Campi Semantici ---

  /** Descrizione breve (< 80 chars) per card preview */
  shortDescription?: string;

  /** Percorso di categoria gerarchico (es: "Security > Web > Scanner") */
  categoryPath?: string;

  /** Tag semantici pesati per ricerca multi-campo */
  enrichedTags?: SemanticTag[];

  /** Casi d'uso testuali (es: ["penetration testing webapp", "vulnerability assessment"]) */
  useCases?: string[];

  /** Pubblico target (es: "pentesters", "sysadmin", "developers") */
  targetAudience?: string;

  /** Linguaggio principale del tool (es: "Python", "Go", "Rust") */
  toolLanguage?: string;

  /** Stato del tool */
  toolStatus?: ToolStatus;

  // --- Campi di Indexing ---

  /** Fingerprint concettuale: vettore di keyword normalizzate per matching veloce */
  conceptFingerprint?: string[];

  /** Confidence dell'enrichment (0-1). Abbassato per ogni retry. */
  enrichmentConfidence?: number;

  /** Versione del prompt usato per l'ultimo enrichment */
  enrichmentPromptVersion?: string;

  /** Timestamp dell'ultimo enrichment */
  lastEnrichedAt?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: verifica se una card è ToolCardV2 (schemaVersion >= 2).
 * Le card v1 partecipano alla ricerca con score ridotto.
 */
export function isToolCardV2(card: LinkItem): card is ToolCardV2 {
  return (card as ToolCardV2).schemaVersion === CURRENT_SCHEMA_VERSION;
}

/**
 * Verifica se una card ha campi semantici popolati (non solo struttura v2).
 * Utile per determinare se servono ancora enrichment.
 */
export function hasSemanticData(card: ToolCardV2): boolean {
  return !!(
    card.enrichedTags && card.enrichedTags.length > 0 &&
    card.useCases && card.useCases.length > 0 &&
    card.conceptFingerprint && card.conceptFingerprint.length > 0
  );
}

/**
 * Restituisce i valori di default per un ToolCardV2 a partire da un LinkItem.
 * Usato dalla migrazione v1→v2.
 */
export function getV2Defaults(card: LinkItem): Partial<ToolCardV2> {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    shortDescription: card.description?.substring(0, 80) || '',
    categoryPath: card.category || '',
    enrichedTags: [],
    useCases: [],
    targetAudience: '',
    toolLanguage: '',
    toolStatus: 'unknown' as ToolStatus,
    conceptFingerprint: [],
    enrichmentConfidence: 0,
    enrichmentPromptVersion: '',
    lastEnrichedAt: 0,
  };
}
