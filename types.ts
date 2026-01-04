export interface LinkItem {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string;
  tags: string[];
  addedAt: number;
  aiProcessingStatus?: 'pending' | 'processing' | 'done' | 'error';
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
}

export interface UserConfig {
  isSetup: boolean;
  email: string;
  passwordHash: string; // Simple hash/obfuscation for client-side demo
  googleClientId?: string; // ID Client per Google Drive API
}

export interface DriveFileContent {
  lastUpdated: number;
  links: LinkItem[];
  userConfig: Partial<UserConfig>; // Backup configurazione (esclusa auth sensibile)
}