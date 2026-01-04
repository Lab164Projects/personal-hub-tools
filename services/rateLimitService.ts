/**
 * Rate Limit Service
 * Manages API quota tracking and cooldown periods for Gemini API
 */

const STORAGE_KEY = 'gemini_rate_limit_state';
const MAX_REQUESTS_PER_MINUTE = 15;
const COOLDOWN_DURATION_MS = 1 * 60 * 1000; // 1 minute (reduced from 5)
const CHECK_INTERVAL_MS = 1 * 60 * 1000; // 1 minute

export interface RateLimitState {
    requestsThisMinute: number;
    lastMinuteReset: number;
    isInCooldown: boolean;
    cooldownUntil: number;
    consecutiveErrors: number;
    lastCheckTime: number;
}

const getDefaultState = (): RateLimitState => ({
    requestsThisMinute: 0,
    lastMinuteReset: Date.now(),
    isInCooldown: false,
    cooldownUntil: 0,
    consecutiveErrors: 0,
    lastCheckTime: Date.now(),
});

export const loadRateLimitState = (): RateLimitState => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved) as RateLimitState;
            // Reset minute counter if a minute has passed
            if (Date.now() - state.lastMinuteReset > 60000) {
                state.requestsThisMinute = 0;
                state.lastMinuteReset = Date.now();
            }
            // Check if cooldown has expired
            if (state.isInCooldown && Date.now() > state.cooldownUntil) {
                state.isInCooldown = false;
                state.consecutiveErrors = 0;
            }
            return state;
        }
    } catch (e) {
        console.error('Error loading rate limit state:', e);
    }
    return getDefaultState();
};

export const saveRateLimitState = (state: RateLimitState): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Error saving rate limit state:', e);
    }
};

export const canMakeRequest = (state: RateLimitState): boolean => {
    // Check cooldown
    if (state.isInCooldown) {
        if (Date.now() < state.cooldownUntil) {
            return false;
        }
        // Cooldown expired
        state.isInCooldown = false;
        state.consecutiveErrors = 0;
    }

    // Reset minute counter if needed
    if (Date.now() - state.lastMinuteReset > 60000) {
        state.requestsThisMinute = 0;
        state.lastMinuteReset = Date.now();
    }

    return state.requestsThisMinute < MAX_REQUESTS_PER_MINUTE;
};

export const recordRequest = (state: RateLimitState): RateLimitState => {
    const newState = { ...state };

    // Reset minute counter if needed
    if (Date.now() - newState.lastMinuteReset > 60000) {
        newState.requestsThisMinute = 0;
        newState.lastMinuteReset = Date.now();
    }

    newState.requestsThisMinute++;
    saveRateLimitState(newState);
    return newState;
};

export const recordError = (state: RateLimitState, isRateLimitError: boolean): RateLimitState => {
    const newState = { ...state };
    newState.consecutiveErrors++;

    // Enter cooldown if rate limit error or too many consecutive errors
    // Enter cooldown ONLY if explicit rate limit error (429) or high consecutive errors
    if (isRateLimitError || newState.consecutiveErrors >= 5) {
        newState.isInCooldown = true;
        newState.cooldownUntil = Date.now() + COOLDOWN_DURATION_MS;
        console.log(`Rate limit cooldown activated until ${new Date(newState.cooldownUntil).toLocaleTimeString()}`);
    }

    saveRateLimitState(newState);
    return newState;
};

export const recordSuccess = (state: RateLimitState): RateLimitState => {
    const newState = { ...state };
    newState.consecutiveErrors = 0;
    saveRateLimitState(newState);
    return newState;
};

export const getCooldownRemainingMs = (state: RateLimitState): number => {
    if (!state.isInCooldown) return 0;
    return Math.max(0, state.cooldownUntil - Date.now());
};

export const formatCooldownTime = (ms: number): string => {
    if (ms <= 0) return '';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
};

export const shouldCheckApiAvailability = (state: RateLimitState): boolean => {
    return state.isInCooldown && (Date.now() - state.lastCheckTime > CHECK_INTERVAL_MS);
};

export const updateLastCheckTime = (state: RateLimitState): RateLimitState => {
    const newState = { ...state, lastCheckTime: Date.now() };
    saveRateLimitState(newState);
    return newState;
};
