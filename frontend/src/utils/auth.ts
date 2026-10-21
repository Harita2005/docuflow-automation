/**
 * DocuFlow Authentication & Token Management Utilities
 */

export const AUTH_TOKEN_KEY = "authToken";
export const LEGACY_AUTH_TOKEN_KEY = "token";

/**
 * Initializes and migrates legacy "token" to "authToken" on application startup.
 */
export function initAuthTokenMigration(): string | null {
  try {
    const legacyToken = localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
    const modernToken = localStorage.getItem(AUTH_TOKEN_KEY);

    if (legacyToken && !modernToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, legacyToken);
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      return legacyToken;
    } else if (legacyToken && modernToken) {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      return modernToken;
    }
    return modernToken;
  } catch (err) {
    console.debug("Failed to migrate auth token:", err);
    return null;
  }
}

/**
 * Retrieves the current active JWT authorization token.
 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Persists the JWT authorization token.
 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch (err) {
    console.debug("Failed to store auth token:", err);
  }
}

/**
 * Removes both modern and legacy auth tokens from storage on logout.
 */
export function removeAuthTokens(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    localStorage.removeItem("currentUser");
    localStorage.removeItem("user_id");
    localStorage.removeItem("userRole");
  } catch (err) {
    console.debug("Failed to clear auth tokens:", err);
  }
}
