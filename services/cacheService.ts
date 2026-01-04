/**
 * Cache Service
 * Optimizes API usage by caching responses
 */

const CACHE_PREFIX = 'gemini_cache_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheItem<T> {
    data: T;
    timestamp: number;
}

export const getCachedData = <T>(key: string): T | null => {
    try {
        const itemStr = localStorage.getItem(CACHE_PREFIX + key);
        if (!itemStr) return null;

        const item: CacheItem<T> = JSON.parse(itemStr);

        // Check expiry
        if (Date.now() - item.timestamp > CACHE_EXPIRY_MS) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }

        return item.data;
    } catch (e) {
        console.error('Cache get error', e);
        return null;
    }
};

export const setCachedData = <T>(key: string, data: T): void => {
    try {
        const item: CacheItem<T> = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
    } catch (e) {
        // Handle quota exceeded
        if (e instanceof Error && e.name === 'QuotaExceededError') {
            pruneCache();
            try {
                localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
            } catch (retryErr) {
                console.error('Cache set error after prune', retryErr);
            }
        } else {
            console.error('Cache set error', e);
        }
    }
};

/**
 * Remove oldest items to free up space
 */
const pruneCache = () => {
    const items: { key: string, timestamp: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
            try {
                const item = JSON.parse(localStorage.getItem(key) || '{}');
                items.push({ key, timestamp: item.timestamp || 0 });
            } catch (e) {
                // Corrupt item
                localStorage.removeItem(key);
            }
        }
    }

    // Sort by timestamp asc (oldest first)
    items.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest 20%
    const toRemove = Math.ceil(items.length * 0.2);
    items.slice(0, toRemove).forEach(item => localStorage.removeItem(item.key));
};

/**
 * Generate a cache key for enrichment
 */
export const getEnrichmentKey = (url: string): string => {
    return `enrich_${btoa(url)}`; // Base64 url to avoid invalid chars
};

/**
 * Generate a cache key for semantic search
 */
export const getSearchKey = (query: string): string => {
    return `search_${btoa(query)}`;
};
