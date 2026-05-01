/**
 * Migration Service — BMAD FASE 2: Smart Card Indexing
 * 
 * Migra le card v1 (LinkItem) allo schema v2 (ToolCardV2).
 * 
 * Caratteristiche:
 * - Idempotente: se schemaVersion === 2, skip
 * - Usa writeBatch per operazioni atomiche (max 500 per batch Firestore)
 * - Progress callback per feedback UI
 * - Non richiede AI: imposta solo valori strutturali e default
 * 
 * @module migrationService
 */

import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { LinkItem } from '../types';
import {
  ToolCardV2,
  CURRENT_SCHEMA_VERSION,
  isToolCardV2,
  getV2Defaults
} from '../types/toolCard';

// ============================================================================
// TYPES
// ============================================================================

/** Risultato della migrazione */
export interface MigrationResult {
  /** Numero totale di card analizzate */
  totalCards: number;
  /** Card effettivamente migrate (v1 → v2) */
  migratedCount: number;
  /** Card già v2, skippate */
  skippedCount: number;
  /** Errori incontrati (non bloccanti) */
  errors: MigrationError[];
  /** Durata in ms */
  durationMs: number;
}

/** Errore non bloccante durante la migrazione */
export interface MigrationError {
  cardId: string;
  cardName: string;
  message: string;
}

/** Callback per il progresso della migrazione */
export type MigrationProgressCallback = (progress: {
  current: number;
  total: number;
  phase: 'analyzing' | 'migrating' | 'complete';
  currentCardName?: string;
}) => void;

// ============================================================================
// CONSTANTS
// ============================================================================

/** Limite Firestore per batch write */
const FIRESTORE_BATCH_LIMIT = 500;

// ============================================================================
// MIGRATION ENGINE
// ============================================================================

/**
 * Migra un array di card da schema v1 a schema v2.
 * 
 * Operazione idempotente: le card già v2 vengono skippate.
 * I nuovi campi vengono impostati con valori default (senza AI).
 * L'enrichment AI verrà eseguito successivamente dal batch processor.
 * 
 * @param userId - UID dell'utente proprietario dei dati
 * @param cards - Array di LinkItem da migrare
 * @param onProgress - Callback opzionale per il progresso
 * @returns Risultato della migrazione
 */
export async function migrateV1ToV2(
  userId: string,
  cards: LinkItem[],
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult> {
  const startTime = Date.now();
  const result: MigrationResult = {
    totalCards: cards.length,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    durationMs: 0,
  };

  if (cards.length === 0) {
    result.durationMs = Date.now() - startTime;
    onProgress?.({ current: 0, total: 0, phase: 'complete' });
    return result;
  }

  // Phase 1: Analyze which cards need migration
  onProgress?.({ current: 0, total: cards.length, phase: 'analyzing' });

  const cardsToMigrate: LinkItem[] = [];

  for (const card of cards) {
    if (isToolCardV2(card)) {
      result.skippedCount++;
    } else {
      cardsToMigrate.push(card);
    }
  }

  if (cardsToMigrate.length === 0) {
    result.durationMs = Date.now() - startTime;
    onProgress?.({ current: cards.length, total: cards.length, phase: 'complete' });
    console.log(`[Migration] All ${cards.length} cards already at schema v${CURRENT_SCHEMA_VERSION}. Nothing to do.`);
    return result;
  }

  console.log(`[Migration] Migrating ${cardsToMigrate.length}/${cards.length} cards to schema v${CURRENT_SCHEMA_VERSION}`);

  // Phase 2: Migrate in batches of FIRESTORE_BATCH_LIMIT
  onProgress?.({ current: 0, total: cardsToMigrate.length, phase: 'migrating' });

  for (let i = 0; i < cardsToMigrate.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = cardsToMigrate.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const card of chunk) {
      try {
        const v2Defaults = getV2Defaults(card);
        const docRef = doc(db, `users/${userId}/links`, card.id);
        
        // Merge v2 defaults into existing document
        batch.update(docRef, v2Defaults as Record<string, unknown>);
        result.migratedCount++;
      } catch (e) {
        result.errors.push({
          cardId: card.id,
          cardName: card.name,
          message: e instanceof Error ? e.message : String(e),
        });
      }

      onProgress?.({
        current: i + chunk.indexOf(card) + 1,
        total: cardsToMigrate.length,
        phase: 'migrating',
        currentCardName: card.name,
      });
    }

    // Commit this batch
    try {
      await batch.commit();
      console.log(`[Migration] Batch ${Math.floor(i / FIRESTORE_BATCH_LIMIT) + 1} committed (${chunk.length} docs)`);
    } catch (batchError) {
      console.error(`[Migration] Batch commit failed:`, batchError);
      // Mark all items in this batch as errors
      for (const card of chunk) {
        if (!result.errors.find(e => e.cardId === card.id)) {
          result.errors.push({
            cardId: card.id,
            cardName: card.name,
            message: `Batch commit failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`,
          });
          // Reduce migrated count for failed items
          result.migratedCount = Math.max(0, result.migratedCount - 1);
        }
      }
    }
  }

  result.durationMs = Date.now() - startTime;

  onProgress?.({
    current: cardsToMigrate.length,
    total: cardsToMigrate.length,
    phase: 'complete',
  });

  console.log(`[Migration] Complete in ${result.durationMs}ms:`, {
    migrated: result.migratedCount,
    skipped: result.skippedCount,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Verifica lo stato di migrazione di un set di card.
 * 
 * @param cards - Array di LinkItem da verificare
 * @returns Statistiche sulla versione dello schema
 */
export function getMigrationStatus(cards: LinkItem[]): {
  total: number;
  v1Count: number;
  v2Count: number;
  migrationNeeded: boolean;
  percentComplete: number;
} {
  const v2Count = cards.filter(c => isToolCardV2(c)).length;
  const v1Count = cards.length - v2Count;

  return {
    total: cards.length,
    v1Count,
    v2Count,
    migrationNeeded: v1Count > 0,
    percentComplete: cards.length > 0 ? Math.round((v2Count / cards.length) * 100) : 100,
  };
}
