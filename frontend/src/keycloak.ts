import Keycloak from 'keycloak-js';

export interface KeycloakConfig {
  enabled: boolean;
  url: string;
  realm: string;
  client_id: string;
}

let keycloakInstance: Keycloak | null = null;
let initialized = false;
let initPromise: Promise<boolean> | null = null;

export async function initKeycloak(config: KeycloakConfig): Promise<boolean> {
  if (!config.enabled) {
    return false;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const isReturningFromAuth = window.location.search.includes('code=') || window.location.search.includes('state=');
    try {
      keycloakInstance = new Keycloak({
        url: config.url,
        realm: config.realm,
        clientId: config.client_id,
      });

      const timeoutMs = isReturningFromAuth ? 15000 : 4000;
      const initTimeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));

      const authenticated = await Promise.race([
        keycloakInstance.init({
          onLoad: 'check-sso',
          silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
          pkceMethod: 'S256',
          checkLoginIframe: false,
          redirectUri: window.location.origin,
        }),
        initTimeout,
      ]);

      if (authenticated && keycloakInstance.token) {
        localStorage.setItem('license_tracker_token', keycloakInstance.token);
        if (isReturningFromAuth) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else if (isReturningFromAuth && !authenticated) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      initialized = true;
      return authenticated;
    } catch (error) {
      console.error('Keycloak initialization error:', error);
      if (isReturningFromAuth) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      initialized = false;
      return false;
    }
  })();

  return initPromise;
}

export function getKeycloakInstance(): Keycloak | null {
  return keycloakInstance;
}

export function isKeycloakAuthenticated(): boolean {
  return keycloakInstance?.authenticated ?? false;
}

export async function loginWithKeycloak(idpHint?: string): Promise<void> {
  if (!keycloakInstance) {
    throw new Error('Keycloak is not initialized');
  }

  const options: Record<string, any> = {
    redirectUri: window.location.origin,
  };

  if (idpHint) {
    options.idpHint = idpHint;
  }

  await keycloakInstance.login(options);
}

export async function logoutKeycloak(): Promise<void> {
  const idToken = keycloakInstance?.idToken;

  // 1. Purge all local tokens and state immediately
  localStorage.removeItem('license_tracker_token');
  sessionStorage.clear();

  if (keycloakInstance) {
    try {
      keycloakInstance.clearToken();
    } catch {
      // ignore
    }
  }

  // 2. Terminate Keycloak server SSO session in background if idToken exists
  if (idToken && keycloakInstance) {
    try {
      const url = `${keycloakInstance.authServerUrl}/realms/${keycloakInstance.realm}/protocol/openid-connect/logout?client_id=${encodeURIComponent(keycloakInstance.clientId ?? 'vertowave')}&id_token_hint=${encodeURIComponent(idToken)}`;
      await fetch(url, { mode: 'no-cors', credentials: 'include' }).catch(() => {});
    } catch {
      // ignore
    }
  }

  // 3. Reset application to login screen cleanly
  window.location.href = window.location.origin;
}

export async function getValidKeycloakToken(): Promise<string | null> {
  if (!keycloakInstance || !keycloakInstance.authenticated) {
    return null;
  }

  try {
    const refreshed = await keycloakInstance.updateToken(30);
    if (refreshed && keycloakInstance.token) {
      localStorage.setItem('license_tracker_token', keycloakInstance.token);
    }
    return keycloakInstance.token ?? null;
  } catch (error) {
    console.error('Failed to refresh Keycloak token:', error);
    return null;
  }
}
