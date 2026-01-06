/**
 * Authorization Service
 * - Checks if user email is in the whitelist
 * - Returns the shared database owner UID for data operations
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

interface AuthConfig {
    emails: string[];
    sharedDatabaseOwner: string;
}

// Cache to avoid repeated Firestore reads
let cachedConfig: AuthConfig | null = null;
let lastDebugStatus = "Not checked yet";

export function getAuthDebugInfo() {
    return lastDebugStatus;
}

/**
 * Fetches the authorization config from Firestore
 */
async function getAuthConfig(): Promise<AuthConfig | null> {
    if (cachedConfig) return cachedConfig;

    try {
        const configDoc = await getDoc(doc(db, 'config', 'authorized_users'));
        if (configDoc.exists()) {
            cachedConfig = configDoc.data() as AuthConfig;
            console.log("Auth Config Loaded:", {
                emailCount: cachedConfig.emails?.length || 0,
                owner: cachedConfig.sharedDatabaseOwner?.substring(0, 8) + '...'
            });
            return cachedConfig;
        }
    } catch (error: any) {
        console.error("Error loading auth config:", error);
        lastDebugStatus = `Error loading config: ${error.message || error}`;
    }
    return null;
}

/**
 * Checks if the given email is in the authorized whitelist
 */
export async function isUserAuthorized(email: string | null): Promise<boolean> {
    if (!email) return false;

    const config = await getAuthConfig();
    if (!config || !config.emails) {
        console.error("Auth Config NOT FOUND or invalid. STRICT MODE: Access Denied.");
        lastDebugStatus = "Config document not found or empty (Strict Mode)";
        // STRICT MODE: If we can't verify the whitelist, we DENY everyone.
        return false;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const isAllowed = config.emails.map(e => e.toLowerCase().trim()).includes(normalizedEmail);

    lastDebugStatus = isAllowed
        ? `Authorized (${normalizedEmail})`
        : `Denied: '${normalizedEmail}' not found. \nDB Whitelist: [${config.emails.join(", ")}]`;

    console.log(`Authorization check for ${normalizedEmail}: ${isAllowed ? 'ALLOWED' : 'DENIED'}`);
    return isAllowed;
}

/**
 * Returns the UID of the shared database owner
 * All authorized users will read/write to this user's data
 */
export async function getSharedDatabaseOwner(): Promise<string | null> {
    const config = await getAuthConfig();
    return config?.sharedDatabaseOwner || null;
}

/**
 * Clears the cached config (useful for testing or manual refresh)
 */
export function clearAuthCache(): void {
    cachedConfig = null;
}
