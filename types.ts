
export interface LinkItem {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
  tags: string[];
  addedAt: number;
  emoji?: string; // Thematic emoji icon for the card
  aiProcessingStatus?: 'pending' | 'processing' | 'done' | 'error' | 'queued';
  lastErrorAt?: number; // Track when last error occurred for retry logic
  
  // BMAD FASE 2 & 4: V2 Enrichment Fields (Aligned with ToolCardV2)
  shortDescription?: string;
  categoryPath?: string;
  useCases?: string[];
  targetAudience?: string;
  toolLanguage?: string;
  toolStatus?: string;
  conceptFingerprint?: string[];
  enrichedTags?: any[]; // SemanticTag[] in ToolCardV2
  enrichmentConfidence?: number;
  enrichmentPromptVersion?: string;
  lastEnrichedAt?: number;
  schemaVersion?: number;
}

export interface ImportStats {
  total: number;
  added: number;
  duplicates: number;
  errors: number;
}

export enum AiStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
  RATE_LIMITED = 'rate_limited', // New status for rate limit
}

export interface UserConfig {
  isSetup: boolean;
  email: string;
}

export interface DriveFileContent {
  lastUpdated: number;
  links: LinkItem[];
  userConfig: {
    email: string;
    isSetup: boolean;
  };
}