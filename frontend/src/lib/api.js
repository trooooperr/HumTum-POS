const rawBase = import.meta.env.VITE_API_URL || '';

// SAFETY: If VITE_API_URL is accidentally set to localhost BUT we are on a real domain (like Render),
// ignore the localhost setting and use the current window origin instead.
const useLocationOrigin = !rawBase || 
  (rawBase.includes('localhost') && !window.location.hostname.includes('localhost'));

export const API_BASE = (useLocationOrigin ? window.location.origin : rawBase).replace(/\/$/, '');

export function apiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${API_BASE}${path}`;
}

/**
 * Authenticated fetch — automatically includes JWT token
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem('humtum_token_v2');
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set Content-Type for JSON bodies if not already set
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  // Auto-logout on 401 (token expired)
  if (res.status === 401) {
    localStorage.removeItem('humtum_token_v2');
    localStorage.removeItem('humtum_auth_v2');
    // Don't reload if we're already on the login page
    if (window.location.pathname !== '/login') {
      window.location.reload();
    }
    throw new Error('Session expired');
  }

  return res;
}