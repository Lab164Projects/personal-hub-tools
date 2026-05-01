import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import { PromptMode } from '../services/promptModeService';

/**
 * AiModeBadge — BMAD Story 1.3
 * 
 * Badge animato che mostra la modalità AI attiva durante le operazioni di enrichment.
 * - ⚡ Fast Mode (caveman): badge emerald/ciano con animazione pulse rapida
 * - 🧠 Premium Mode (premium): badge viola/oro con glow effect
 * 
 * Visibile SOLO quando isActive è true. Si nasconde al completamento.
 * 
 * @param mode - Modalità AI attiva
 * @param isActive - Se il badge deve essere visibile
 * @param itemsCount - Numero di item in elaborazione (opzionale)
 */
interface AiModeBadgeProps {
  mode: PromptMode;
  isActive: boolean;
  itemsCount?: number;
}

const AiModeBadge: React.FC<AiModeBadgeProps> = ({ mode, isActive, itemsCount }) => {
  if (!isActive) return null;

  const isCaveman = mode === 'caveman';

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
        border backdrop-blur-sm transition-all duration-300 animate-pulse
        ${isCaveman
          ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
          : 'bg-purple-900/30 text-purple-300 border-purple-700/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
        }
      `}
    >
      {isCaveman ? (
        <Zap className="w-3.5 h-3.5" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      <span>{isCaveman ? 'Fast Mode' : 'Premium Mode'}</span>
      {itemsCount !== undefined && itemsCount > 0 && (
        <span className={`
          px-1.5 py-0.5 rounded-full text-[10px] font-bold
          ${isCaveman ? 'bg-cyan-800/50' : 'bg-purple-800/50'}
        `}>
          {itemsCount}
        </span>
      )}
    </div>
  );
};

export default AiModeBadge;
