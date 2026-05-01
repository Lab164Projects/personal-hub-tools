/**
 * Semantic Search Service — BMAD FASE 3: Semantic Comprehension
 * 
 * Implementa la ricerca semantica multi-campo con scoring pesato.
 * 
 * Flusso:
 * 1. Query utente → Gemini (caveman mode) → SearchIntent
 * 2. Per ogni card: calcolo SearchScore con pesi multi-campo
 * 3. Ordinamento per totalScore, esclusione sotto soglia
 * 
 * Le card v1 (senza campi semantici) partecipano con score limitato (solo name/tags).
 * Algoritmo O(n) client-side, target < 100ms per 500 card.
 * 
 * @module semanticSearchService
 */

import { LinkItem } from '../types';
import { ToolCardV2, isToolCardV2 } from '../types/toolCard';
import {
  SearchScore,
  SearchScoreBreakdown,
  SearchIntent,
  SEARCH_WEIGHTS,
  SEARCH_SCORE_THRESHOLD,
} from '../types/search';

// ============================================================================
// INTENT EXTRACTION (AI-powered)
// ============================================================================

/**
 * Estrae l'intento di ricerca dalla query utente.
 * Usa un prompt caveman per parsare la query in concetti strutturati.
 * 
 * Se l'AI non è disponibile, fallback su parsing locale.
 * 
 * @param query - Query in linguaggio naturale
 * @param aiExtractFn - Funzione opzionale per l'estrazione AI
 * @returns SearchIntent con concetti, keyword e dominio
 */
export async function extractSearchIntent(
  query: string,
  aiExtractFn?: (prompt: string) => Promise<string>
): Promise<SearchIntent> {
  // Se AI non disponibile, fallback su parsing locale
  if (!aiExtractFn) {
    return localIntentParsing(query);
  }

  const prompt = `TASK: parse search query into structured intent. NO explanation. JSON only.
INPUT: "${query}"
OUTPUT: {"intent":"<main goal>","concepts":["<key concept 1>","<key concept 2>"],"useCaseKeywords":["<use case 1>"],"domain":"<area>"}`;

  try {
    const response = await aiExtractFn(prompt);
    const parsed: SearchIntent = JSON.parse(response);
    return {
      intent: parsed.intent || query,
      concepts: parsed.concepts || [],
      useCaseKeywords: parsed.useCaseKeywords || [],
      domain: parsed.domain || '',
    };
  } catch {
    return localIntentParsing(query);
  }
}

/**
 * Parsing locale dell'intento di ricerca (fallback senza AI).
 * Estrae parole chiave significative dalla query.
 */
function localIntentParsing(query: string): SearchIntent {
  const words = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));

  return {
    intent: query,
    concepts: words.slice(0, 5),
    useCaseKeywords: words.slice(0, 3),
    domain: words[0] || '',
  };
}

/** Parole da escludere nella tokenizzazione locale */
const STOP_WORDS = new Set([
  'che', 'per', 'con', 'una', 'uno', 'del', 'della', 'dei',
  'gli', 'the', 'and', 'for', 'with', 'tool', 'strumento',
  'cerco', 'voglio', 'trovare', 'find', 'search', 'cerca',
  'come', 'fare', 'how', 'quale', 'which',
]);

// ============================================================================
// MULTI-FIELD SCORING
// ============================================================================

/**
 * Calcola il punteggio di ricerca multi-campo per una singola card.
 * 
 * @param card - Card da valutare (LinkItem o ToolCardV2)
 * @param intent - Intento di ricerca estratto
 * @returns SearchScore con breakdown dettagliato
 */
export function scoreCard(card: LinkItem, intent: SearchIntent): SearchScore {
  const breakdown: SearchScoreBreakdown = {
    concept: 0,
    useCase: 0,
    tag: 0,
    name: 0,
    category: 0,
  };

  const allQueryTerms = [
    ...intent.concepts,
    ...intent.useCaseKeywords,
    intent.domain,
  ].filter(Boolean).map(t => t.toLowerCase());

  if (allQueryTerms.length === 0) {
    return { cardId: card.id, totalScore: 0, breakdown, relevanceLabel: 'low' };
  }

  // --- NAME SCORE ---
  const cardNameLower = card.name.toLowerCase();
  const nameMatchCount = allQueryTerms.filter(t => cardNameLower.includes(t)).length;
  breakdown.name = Math.min(1, nameMatchCount / allQueryTerms.length);

  // --- CATEGORY SCORE ---
  const catLower = (card.category || '').toLowerCase();
  const catMatchCount = allQueryTerms.filter(t => catLower.includes(t)).length;
  breakdown.category = Math.min(1, catMatchCount / allQueryTerms.length);

  // --- TAG SCORE ---
  const tagsLower = (card.tags || []).map(t => t.toLowerCase());
  const tagMatchCount = allQueryTerms.filter(qt =>
    tagsLower.some(tl => tl.includes(qt) || qt.includes(tl))
  ).length;
  breakdown.tag = Math.min(1, tagMatchCount / allQueryTerms.length);

  // --- V2-ONLY FIELDS ---
  if (isToolCardV2(card)) {
    const v2Card = card as ToolCardV2;

    // CONCEPT FINGERPRINT SCORE
    const fingerprint = (v2Card.conceptFingerprint || []).map(f => f.toLowerCase());
    if (fingerprint.length > 0) {
      const fpMatchCount = allQueryTerms.filter(qt =>
        fingerprint.some(fp => fp.includes(qt) || qt.includes(fp))
      ).length;
      breakdown.concept = Math.min(1, fpMatchCount / allQueryTerms.length);
    }

    // USE CASE SCORE
    const useCases = (v2Card.useCases || []).map(uc => uc.toLowerCase());
    if (useCases.length > 0) {
      const useCaseTerms = intent.useCaseKeywords.length > 0
        ? intent.useCaseKeywords.map(k => k.toLowerCase())
        : allQueryTerms;

      const ucMatchCount = useCaseTerms.filter(uqt =>
        useCases.some(uc => uc.includes(uqt) || uqt.includes(uc))
      ).length;
      breakdown.useCase = Math.min(1, ucMatchCount / useCaseTerms.length);
    }

    // ENRICHED TAGS BOOST (weighted tags boost the tag score)
    if (v2Card.enrichedTags && v2Card.enrichedTags.length > 0) {
      const enrichedMatchWeight = v2Card.enrichedTags
        .filter(et => allQueryTerms.some(qt =>
          et.value.toLowerCase().includes(qt) || qt.includes(et.value.toLowerCase())
        ))
        .reduce((sum, et) => sum + et.weight, 0);

      // Blend enriched tag score with basic tag score
      const enrichedScore = Math.min(1, enrichedMatchWeight);
      breakdown.tag = Math.max(breakdown.tag, enrichedScore);
    }

    // DESCRIPTION BOOST (search in shortDescription + description)
    const descText = [v2Card.shortDescription, v2Card.description].filter(Boolean).join(' ').toLowerCase();
    const descMatchCount = allQueryTerms.filter(t => descText.includes(t)).length;
    if (descMatchCount > 0) {
      // Add a small boost to concept score from description matching
      const descBoost = Math.min(0.3, (descMatchCount / allQueryTerms.length) * 0.3);
      breakdown.concept = Math.min(1, breakdown.concept + descBoost);
    }
  } else {
    // V1 cards: use description as fallback for concept matching
    const descLower = (card.description || '').toLowerCase();
    const descMatchCount = allQueryTerms.filter(t => descLower.includes(t)).length;
    breakdown.concept = Math.min(1, (descMatchCount / allQueryTerms.length) * 0.5); // Capped lower for v1
  }

  // --- TOTAL SCORE ---
  const totalScore =
    breakdown.concept * SEARCH_WEIGHTS.concept +
    breakdown.useCase * SEARCH_WEIGHTS.useCase +
    breakdown.tag * SEARCH_WEIGHTS.tag +
    breakdown.name * SEARCH_WEIGHTS.name +
    breakdown.category * SEARCH_WEIGHTS.category;

  // --- RELEVANCE LABEL ---
  let relevanceLabel: 'high' | 'medium' | 'low';
  if (totalScore >= 0.6) {
    relevanceLabel = 'high';
  } else if (totalScore >= 0.35) {
    relevanceLabel = 'medium';
  } else {
    relevanceLabel = 'low';
  }

  return { cardId: card.id, totalScore, breakdown, relevanceLabel };
}

// ============================================================================
// SEARCH ENGINE
// ============================================================================

/**
 * Esegue la ricerca semantica completa su un array di card.
 * 
 * Flusso:
 * 1. Estrae l'intento dalla query
 * 2. Calcola lo score per ogni card
 * 3. Filtra sotto soglia e ordina per score decrescente
 * 
 * @param query - Query in linguaggio naturale dell'utente
 * @param cards - Tutte le card disponibili
 * @param aiExtractFn - Funzione opzionale per l'estrazione AI dell'intento
 * @returns Array di risultati ordinati per rilevanza
 */
export async function semanticSearchV2(
  query: string,
  cards: LinkItem[],
  aiExtractFn?: (prompt: string) => Promise<string>
): Promise<{
  results: SearchScore[];
  intent: SearchIntent;
  matchedIds: string[];
}> {
  if (!query.trim() || cards.length === 0) {
    return { results: [], intent: { intent: '', concepts: [], useCaseKeywords: [], domain: '' }, matchedIds: [] };
  }

  // Step 1: Extract intent
  const intent = await extractSearchIntent(query, aiExtractFn);

  if (import.meta.env.DEV) {
    console.log('[SemanticSearch] Intent:', intent);
  }

  // Step 2: Score all cards
  const scores = cards.map(card => scoreCard(card, intent));

  // Step 3: Filter and sort
  const filtered = scores
    .filter(s => s.totalScore >= SEARCH_SCORE_THRESHOLD)
    .sort((a, b) => b.totalScore - a.totalScore);

  if (import.meta.env.DEV) {
    console.log(`[SemanticSearch] ${filtered.length}/${cards.length} results above threshold`);
    filtered.slice(0, 5).forEach(s => {
      const card = cards.find(c => c.id === s.cardId);
      console.log(`  ${card?.name}: ${(s.totalScore * 100).toFixed(1)}% [${s.relevanceLabel}]`, s.breakdown);
    });
  }

  return {
    results: filtered,
    intent,
    matchedIds: filtered.map(s => s.cardId),
  };
}

/**
 * Utility: restituisce l'emoji del badge di rilevanza.
 */
export function getRelevanceBadge(label: 'high' | 'medium' | 'low'): { emoji: string; text: string; colorClass: string } {
  switch (label) {
    case 'high':
      return { emoji: '🎯', text: 'Alta', colorClass: 'text-emerald-400 bg-emerald-900/30 border-emerald-800/50' };
    case 'medium':
      return { emoji: '⚡', text: 'Media', colorClass: 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50' };
    case 'low':
      return { emoji: '🔍', text: 'Bassa', colorClass: 'text-gray-400 bg-gray-800/30 border-gray-700/50' };
  }
}
