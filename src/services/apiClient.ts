export type AccountState = {
  user: { email: string };
  subscription: {
    active: boolean;
    plan: string;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SESSION_STORAGE = 'mscsl.v2.sessionToken';

export function getSessionToken() {
  return localStorage.getItem(SESSION_STORAGE) ?? '';
}

export function saveSessionToken(token: string) {
  localStorage.setItem(SESSION_STORAGE, token);
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_STORAGE);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? '서버 요청에 실패했습니다.');
  }
  return data as T;
}

export async function startSession(email: string) {
  const data = await request<AccountState & { token: string }>('/api/auth/start', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  saveSessionToken(data.token);
  return data;
}

export async function getAccount() {
  return request<AccountState>('/api/me');
}

export async function createCheckout() {
  return request<{ url: string }>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function aiRespond(system: string, prompt: string) {
  const data = await request<{ text: string }>('/api/ai/respond', {
    method: 'POST',
    body: JSON.stringify({ system, prompt }),
  });
  return data.text.trim();
}
