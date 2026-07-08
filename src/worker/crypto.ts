/**
 * Web Crypto helpers para o Worker (sem dependência de Node `crypto`).
 */

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/**
 * Comparação em tempo constante entre duas strings hex.
 * Não aborta cedo, e protege contra timing attacks.
 */
export async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Normaliza comprimentos: se diferirem, ainda fazemos uma comparação completa
  // para não revelar info pelo tempo de execução.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

export function randomTokenHex(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

// ----- Password hashing (PBKDF2-SHA256) -----
// Formato: pbkdf2$<iterations>$<saltHex>$<hashHex>
// Compatível com o server.ts (Node crypto.pbkdf2Sync) para que uma conta criada
// num backend possa ser verificada no outro.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number, keyLen: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    keyLen * 8,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hashHex = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = hexToBytes(parts[2]);
  const expectedHex = parts[3];
  const keyLen = Math.max(1, Math.floor(expectedHex.length / 2));
  const actualHex = await derivePbkdf2(password, salt, iterations, keyLen);
  return timingSafeEqualHex(actualHex, expectedHex);
}

