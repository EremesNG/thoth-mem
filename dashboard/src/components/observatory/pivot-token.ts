export interface DecodedPivotToken {
  kind: 'pivot';
  scope?: Record<string, unknown>;
  focus_node_id?: string;
  target?: 'map' | 'timeline' | 'ledger' | 'recall';
  exp?: number;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  if (typeof atob === 'function') {
    return decodeURIComponent(Array.from(atob(padded)).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  }
  throw new Error('Base64 decode unavailable');
}

function encodeBase64Url(value: string): string {
  if (typeof btoa === 'function') {
    const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_match, pair) => String.fromCharCode(Number.parseInt(pair, 16)));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  throw new Error('Base64 encode unavailable');
}

export function decodePivotToken(token: string): DecodedPivotToken | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token)) as DecodedPivotToken;
    if (payload.kind !== 'pivot') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isExpiredPivotToken(token: string, nowMs: number = Date.now()): boolean {
  const decoded = decodePivotToken(token);
  if (!decoded || typeof decoded.exp !== 'number') {
    return true;
  }
  return decoded.exp < nowMs;
}

export function encodePivotToken(payload: Omit<DecodedPivotToken, 'kind'>): string {
  return encodeBase64Url(JSON.stringify({ ...payload, kind: 'pivot' }));
}
