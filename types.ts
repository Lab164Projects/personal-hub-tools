export interface LinkItem {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
  tags: string[];
  addedAt: number;
  aiProcessingStatus?: 'pending' | 'processing' | 'done' | 'error' | 'queued';
  lastErrorAt?: number; // Track when last error occurred for retry logic
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
  passwordHash: string; // SHA-256 hash
  passwordSalt?: string; // Salt for secure hashing
  googleClientId?: string; // ID Client per Google Drive API
}

export interface DriveFileContent {
  lastUpdated: number;
  links: LinkItem[];
  userConfig: Partial<UserConfig>; // Backup configurazione (esclusa auth sensibile)
}