const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

let accessToken = null;
const expiredListeners = new Set();

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const setAccessToken = (t) => (accessToken = t);
export const clearAccessToken = () => (accessToken = null);

export function onSessionExpired(fn) {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}
const notifyExpired = (err) => expiredListeners.forEach((fn) => fn(err));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function networkError() {
  return new ApiError(
    0,
    'NETWORK_ERROR',
    navigator.onLine ? "Can't reach the server. It may be restarting — please try again in a moment." : "You're offline. Check your internet connection."
  );
}

let refreshPromise = null;
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        let res;
        try {
          res = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          });
        } catch {
          throw networkError();
        }
        if (res.status === 409) {
          await sleep(400);
          continue;
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new ApiError(res.status, body.error?.code ?? 'SESSION_EXPIRED', body.error?.message ?? 'Your session has expired. Please log in again.');
        }
        accessToken = body.accessToken;
        return body;
      }
      throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function expiresSoon(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 - Date.now() < 30_000;
  } catch {
    return true;
  }
}

export async function getFreshToken() {
  if (!accessToken || expiresSoon(accessToken)) {
    try {
      await refreshSession();
    } catch (err) {
      if (err.status === 401) notifyExpired(err);
      throw err;
    }
  }
  return accessToken;
}

function buildUrl(path, query) {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  return url;
}

export async function api(path, { method = 'GET', body, query, signal, auth = true, retry = true, headers: extra } = {}) {
  const headers = { ...extra };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw networkError();
  }

  if (res.status === 401 && auth && retry) {
    const data = await res.clone().json().catch(() => ({}));
    if (['TOKEN_EXPIRED', 'INVALID_TOKEN', 'AUTH_REQUIRED'].includes(data.error?.code)) {
      try {
        await refreshSession();
      } catch (err) {
        if (err.status === 401) notifyExpired(err);
        throw err;
      }
      return api(path, { method, body, query, signal, auth, retry: false, headers: extra });
    }
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Request failed (HTTP ${res.status}).`, data?.error?.details);
  }
  return data;
}

export async function uploadWithProgress(path, formData, { method = 'POST', onProgress, signal } = {}) {
  const send = (token) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, buildUrl(path));
      xhr.withCredentials = true;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* empty */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(xhr.status, data?.error?.code ?? 'UPLOAD_FAILED', data?.error?.message ?? `Upload failed (HTTP ${xhr.status}).`, data?.error?.details));
      };
      xhr.onerror = () => reject(new ApiError(0, 'UPLOAD_FAILED', 'The upload was interrupted. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new ApiError(0, 'UPLOAD_TIMEOUT', 'The upload timed out. Try again on a faster connection.'));
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(formData);
    });

  try {
    return await send(await getFreshToken());
  } catch (err) {
    if (err.status === 401 && err.code === 'TOKEN_EXPIRED') {
      await refreshSession();
      return send(accessToken);
    }
    throw err;
  }
}

export function wsUrl(path, params) {
  const base = API_URL ? API_URL.replace(/^http/, 'ws') : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

export const absoluteApiUrl = (relative) => `${API_URL}${relative}`;
