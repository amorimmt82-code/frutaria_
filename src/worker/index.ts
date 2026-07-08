/**
 * Frutaria em Casa — Cloudflare Worker (Hono + D1 + KV).
 *
 * Substitui o server.ts (Express) por código que corre em Cloudflare Workers
 * sem disco local, sem Node SMTP e sem Stripe SDK (vai por HTTP direto).
 *
 * Tabelas D1: ver migrations/0001_init.sql.
 * KV bindings: SESSIONS (também guarda rate-limit de login).
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import type {
  Product,
  Order,
  OrderItem,
  PaymentRecord,
  PaymentSettings,
  PaymentMethod,
  OrderStatus,
  PaymentStatus,
  CustomerDetails,
} from '../types';
import {
  buildImagePlaceholderSvg,
  parseProxiedImageUrl,
  formatOrderDateTime,
  buildOrderEmailParts,
  buildAdminLoginEmailParts,
} from './helpers';
import {
  sha256Hex,
  timingSafeEqualHex,
  randomTokenHex,
  randomUuid,
  hashPassword,
  verifyPassword,
} from './crypto';

// ----- Bindings -----

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSIONS: KVNamespace;
  // Vars
  ADMIN_EMAIL: string;
  ADMIN_NOTIFICATION_EMAIL: string;
  ORDER_NOTIFICATION_EMAIL: string;
  MAIL_FROM: string;
  ALLOWED_IMAGE_HOSTS: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  // Secrets (definidos com wrangler secret put)
  ADMIN_PASSCODE?: string;
  BREVO_API_KEY?: string; // chave xkeysib-... da Brevo (sendinblue)
  STRIPE_SECRET_KEY?: string;
}

// ----- Constantes -----

const ADMIN_SESSION_COOKIE = 'frutaria_admin_session';
const ADMIN_CSRF_HEADER = 'x-admin-csrf-token';
const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2h
const ACCOUNT_SESSION_COOKIE = 'frutaria_account_session';
const ACCOUNT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias
const ACCOUNT_PASSWORD_MIN_LENGTH = 4;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 5; // 5min
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BLOCK_SECONDS = 60 * 30; // 30min
const ADMIN_PASSCODE_MIN_LENGTH = 12;
const MAX_CATEGORY_LENGTH = 40;
const MAX_VARIANTS = 12;
const MAX_VARIANT_LENGTH = 32;
const ALLOWED_PAYMENT_METHODS = new Set<string>(['mbway', 'transferencia', 'dinheiro', 'stripe']);
const ALLOWED_ORDER_STATUSES = new Set<string>([
  'awaiting_payment', 'awaiting_transfer', 'confirmed',
  'preparing', 'shipped', 'delivered', 'cancelled',
]);
const ALLOWED_PAYMENT_STATUSES = new Set<string>([
  'pending', 'awaiting_payment', 'awaiting_transfer',
  'paid', 'cash_on_delivery', 'failed', 'cancelled',
]);

// ----- Tipos internos -----

interface AdminSession {
  expiresAt: number;
  csrfToken: string;
  fingerprint: string;
  createdAt: number;
  lastSeenAt: number;
}

interface AccountSession {
  accountId: string;
  expiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

interface RateLimitState {
  attemptCount: number;
  windowStartedAt: number;
  blockedUntil: number;
}

type AppContextVariables = {
  adminSession?: AdminSession;
  adminSessionToken?: string;
  accountSession?: AccountSession;
  accountSessionToken?: string;
};

// ----- Utilitários -----

function nowIso() { return new Date().toISOString(); }
function nowMs() { return Date.now(); }

function parseStringField(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parsePrice(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid product price.');
  return Math.round(n * 100) / 100;
}

// Peso médio mínimo (gramas) para venda à unidade. Igual ao frontend e ao
// servidor Express para impedir valores absurdos (ex.: 1g).
const MIN_AVG_WEIGHT_GRAMS = 10;

function parseApproxWeightGrams(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const grams = Math.round(n);
  if (grams < MIN_AVG_WEIGHT_GRAMS) {
    throw new Error(`Peso médio demasiado baixo. Mínimo ${MIN_AVG_WEIGHT_GRAMS}g.`);
  }
  return grams;
}

// D1 cell rejeita acima de ~1MB; ficamos abaixo para incluir overhead.
const MAX_PRODUCT_IMAGE_BYTES = 700_000;
function parseProductImage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error(`Imagem demasiado grande (≈${Math.round(trimmed.length / 1024)} KB). Máximo ${Math.round(MAX_PRODUCT_IMAGE_BYTES / 1024)} KB. Use um URL ou comprima a imagem.`);
  }
  return trimmed;
}

function parseCategory(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid product category.');
  const v = value.trim().toLowerCase();
  if (!v) throw new Error('Invalid product category.');
  if (v.length > MAX_CATEGORY_LENGTH) throw new Error('Category too long.');
  return v;
}

function parseVariants(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (!Array.isArray(value)) throw new Error('Invalid variants list.');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (!v) continue;
    if (v.length > MAX_VARIANT_LENGTH) throw new Error('Variant label too long.');
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= MAX_VARIANTS) break;
  }
  return out;
}

function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

async function computeFingerprint(req: Request): Promise<string> {
  const ip = getClientIp(req);
  const ua = (req.headers.get('user-agent') || '').trim();
  return sha256Hex(`${ip}|${ua}`);
}

// ----- D1: row mappers -----

interface ProductRow {
  id: string; name: string; price: number; unit: string;
  category: string; image: string; description: string; active: number;
  variants: string | null;
  approx_weight_grams: number | null;
  created_at: string; updated_at: string;
}
function productFromRow(r: ProductRow): Product {
  let variants: string[] | undefined;
  if (r.variants) {
    try {
      const parsed = JSON.parse(r.variants);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((v) => typeof v === 'string' && v.trim().length > 0);
        if (filtered.length > 0) variants = filtered;
      }
    } catch { /* ignore */ }
  }
  return {
    id: r.id, name: r.name, price: r.price, unit: r.unit,
    category: r.category,
    image: r.image, description: r.description,
    variants,
    approxWeightGrams: typeof r.approx_weight_grams === 'number' && r.approx_weight_grams > 0 ? r.approx_weight_grams : undefined,
    active: r.active === 1,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

interface OrderRow {
  id: string; number: string; created_at: string; updated_at: string;
  customer_name: string; customer_phone: string;
  customer_address: string; customer_postal_code: string;
  delivery_day: string | null;
  items_json: string; subtotal: number; total: number; currency: string;
  payment_method: string; payment_status: string; order_status: string;
  payment_reference: string | null; notes: string | null;
  customer_note: string | null;
}
function orderFromRow(r: OrderRow): Order {
  return {
    id: r.id,
    number: r.number,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    customer: {
      name: r.customer_name,
      phone: r.customer_phone,
      address: r.customer_address,
      postalCode: r.customer_postal_code,
      deliveryDay: (r.delivery_day === 'quinta' || r.delivery_day === 'sexta') ? r.delivery_day : undefined,
    },
    items: JSON.parse(r.items_json) as OrderItem[],
    subtotal: r.subtotal,
    total: r.total,
    currency: r.currency,
    paymentMethod: r.payment_method as PaymentMethod,
    paymentStatus: r.payment_status as PaymentStatus,
    orderStatus: r.order_status as OrderStatus,
    paymentReference: r.payment_reference ?? undefined,
    notes: r.notes ?? undefined,
    customerNote: r.customer_note ?? undefined,
  };
}

interface PaymentRow {
  id: string; order_id: string; method: string; amount: number;
  status: string; created_at: string; updated_at: string;
  external_reference: string | null; note: string | null;
}
function paymentFromRow(r: PaymentRow): PaymentRecord {
  return {
    id: r.id, orderId: r.order_id, method: r.method as PaymentMethod,
    amount: r.amount, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
    externalReference: r.external_reference ?? undefined,
    note: r.note ?? undefined,
  };
}

interface PaymentSettingsRow {
  stripe_enabled: number; mbway_enabled: number;
  transfer_enabled: number; cash_enabled: number;
  mbway_number: string; transfer_recipient: string;
  transfer_iban: string; transfer_bank: string;
  transfer_instructions: string; updated_at: string;
}
function settingsFromRow(r: PaymentSettingsRow): PaymentSettings {
  return {
    stripeEnabled: r.stripe_enabled === 1,
    mbwayEnabled: r.mbway_enabled === 1,
    transferEnabled: r.transfer_enabled === 1,
    cashEnabled: r.cash_enabled === 1,
    mbwayNumber: r.mbway_number,
    transferRecipient: r.transfer_recipient,
    transferIban: r.transfer_iban,
    transferBank: r.transfer_bank,
    transferInstructions: r.transfer_instructions,
    updatedAt: r.updated_at,
  };
}

async function loadPaymentSettings(db: D1Database): Promise<PaymentSettings> {
  const row = await db.prepare('SELECT * FROM payment_settings WHERE id = 1')
    .first<PaymentSettingsRow>();
  if (!row) throw new Error('payment_settings row missing — run migrations.');
  return settingsFromRow(row);
}

function getPublicPaymentSettings(s: PaymentSettings, env: Env) {
  const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY);
  return {
    stripeEnabled: s.stripeEnabled && stripeConfigured,
    stripePublishableKey: stripeConfigured ? env.STRIPE_PUBLISHABLE_KEY : '',
    mbwayEnabled: s.mbwayEnabled,
    transferEnabled: s.transferEnabled,
    cashEnabled: s.cashEnabled,
    mbwayNumber: s.mbwayNumber,
    transferRecipient: s.transferRecipient,
    transferIban: s.transferIban,
    transferBank: s.transferBank,
    transferInstructions: s.transferInstructions,
  };
}

// ----- Stripe REST client (sem SDK; usa fetch direto) -----

interface StripePaymentIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
}

async function stripeRequest<T>(env: Env, method: string, path: string, params?: Record<string, string>): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured on the server.');
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (params) {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    init.body = form.toString();
  }
  const res = await fetch(`https://api.stripe.com${path}`, init);
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe API ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

async function stripeCreatePaymentIntent(env: Env, amountCents: number, currency: string, metadata: Record<string, string>): Promise<StripePaymentIntent> {
  const params: Record<string, string> = {
    amount: String(amountCents),
    currency,
    'automatic_payment_methods[enabled]': 'true',
  };
  for (const [k, v] of Object.entries(metadata)) params[`metadata[${k}]`] = v;
  return stripeRequest<StripePaymentIntent>(env, 'POST', '/v1/payment_intents', params);
}

async function stripeRetrievePaymentIntent(env: Env, id: string): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(env, 'GET', `/v1/payment_intents/${encodeURIComponent(id)}`);
}

// ----- Email via Brevo (ex-Sendinblue) -----
//
// Brevo permite usar um endereço gmail.com como remetente sem precisar de
// domínio próprio: basta verificar o email em Senders & IP > Senders.
// 300 emails/dia grátis.
//
// Requer:
//   1) Conta em https://www.brevo.com (gratuita)
//   2) Senders > Add a sender > notificacaofrutaria@gmail.com > clicar no link de confirmação
//   3) SMTP & API > API Keys > Generate a new API key (começa por "xkeysib-")
//   4) Secret BREVO_API_KEY com essa chave
//   5) MAIL_FROM com o endereço verificado, ex.: "Frutaria em Casa <notificacaofrutaria@gmail.com>"

function parseMailFrom(raw: string): { address: string; name?: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) {
    const name = m[1].replace(/^"|"$/g, '').trim();
    return { address: m[2].trim(), name: name || undefined };
  }
  return { address: raw.trim() };
}

async function sendEmail(env: Env, to: string, subject: string, text: string, html: string) {
  if (!env.BREVO_API_KEY) {
    console.warn('[mail] BREVO_API_KEY não configurado; email descartado.');
    return;
  }
  if (!env.MAIL_FROM) {
    console.warn('[mail] MAIL_FROM não configurado; email descartado.');
    return;
  }
  const from = parseMailFrom(env.MAIL_FROM);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: from.address, name: from.name || 'Frutaria em Casa' },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[mail] Brevo falhou:', res.status, errBody);
    }
  } catch (e) {
    console.error('[mail] Falha ao enviar email:', e instanceof Error ? e.message : e);
  }
}

// ----- Auth helpers (KV) -----

const sessionKey = (hash: string) => `session:${hash}`;
const rateLimitKey = (ip: string) => `ratelimit:${ip}`;

async function getRateLimit(env: Env, ip: string): Promise<RateLimitState | null> {
  const raw = await env.SESSIONS.get(rateLimitKey(ip));
  return raw ? JSON.parse(raw) as RateLimitState : null;
}

async function registerFailedLogin(env: Env, ip: string): Promise<RateLimitState> {
  const now = nowMs();
  const current = await getRateLimit(env, ip);
  const windowExpired = !current || current.windowStartedAt + RATE_LIMIT_WINDOW_SECONDS * 1000 <= now;
  const next: RateLimitState = windowExpired
    ? { attemptCount: 1, windowStartedAt: now, blockedUntil: 0 }
    : { ...current, attemptCount: current.attemptCount + 1 };
  if (next.attemptCount >= RATE_LIMIT_MAX_ATTEMPTS) {
    next.blockedUntil = now + RATE_LIMIT_BLOCK_SECONDS * 1000;
  }
  const ttl = Math.max(60, Math.ceil((next.blockedUntil > 0
    ? next.blockedUntil - now
    : RATE_LIMIT_WINDOW_SECONDS * 1000) / 1000));
  await env.SESSIONS.put(rateLimitKey(ip), JSON.stringify(next), { expirationTtl: ttl });
  return next;
}

async function clearRateLimit(env: Env, ip: string) {
  await env.SESSIONS.delete(rateLimitKey(ip));
}

async function loadSession(env: Env, token: string): Promise<AdminSession | null> {
  const hash = await sha256Hex(token);
  const raw = await env.SESSIONS.get(sessionKey(hash));
  return raw ? JSON.parse(raw) as AdminSession : null;
}

async function saveSession(env: Env, token: string, session: AdminSession) {
  const hash = await sha256Hex(token);
  const ttl = Math.max(60, Math.ceil((session.expiresAt - nowMs()) / 1000));
  await env.SESSIONS.put(sessionKey(hash), JSON.stringify(session), { expirationTtl: ttl });
}

async function deleteSession(env: Env, token: string) {
  const hash = await sha256Hex(token);
  await env.SESSIONS.delete(sessionKey(hash));
}

// ----- Contas de cliente: helpers (KV + D1) -----

const accountSessionKey = (hash: string) => `account_session:${hash}`;

interface AccountRow {
  id: string; name: string; phone: string;
  password_hash: string | null;
  created_at: string; updated_at: string;
}

function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function toPublicAccount(r: AccountRow) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    hasPassword: Boolean(r.password_hash),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function loadAccountSession(env: Env, token: string): Promise<AccountSession | null> {
  const hash = await sha256Hex(token);
  const raw = await env.SESSIONS.get(accountSessionKey(hash));
  return raw ? JSON.parse(raw) as AccountSession : null;
}

async function saveAccountSession(env: Env, token: string, session: AccountSession) {
  const hash = await sha256Hex(token);
  const ttl = Math.max(60, Math.ceil((session.expiresAt - nowMs()) / 1000));
  await env.SESSIONS.put(accountSessionKey(hash), JSON.stringify(session), { expirationTtl: ttl });
}

async function deleteAccountSession(env: Env, token: string) {
  const hash = await sha256Hex(token);
  await env.SESSIONS.delete(accountSessionKey(hash));
}

async function issueAccountSession(env: Env, accountId: string): Promise<string> {
  const token = randomTokenHex(24);
  const now = nowMs();
  await saveAccountSession(env, token, {
    accountId,
    expiresAt: now + ACCOUNT_SESSION_TTL_SECONDS * 1000,
    createdAt: now,
    lastSeenAt: now,
  });
  return token;
}

function accountCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'Strict' as const,
    secure: true,
    path: '/api/account',
    maxAge: ACCOUNT_SESSION_TTL_SECONDS,
  };
}

// ----- Hono app -----

const app = new Hono<{ Bindings: Env; Variables: AppContextVariables }>();

app.use('*', secureHeaders({
  contentSecurityPolicy: false, // SPA precisa de inline; mantemos defaults relaxados.
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  referrerPolicy: 'no-referrer',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
}));

app.use('/api/admin/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  await next();
});

// ----- Middleware: requireAdmin / requireAdminCsrf -----

async function requireAdmin(c: any, next: any) {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) return c.json({ error: 'Autenticação de administrador necessária.' }, 401);
  const session = await loadSession(c.env, token);
  if (!session || session.expiresAt <= nowMs()) {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/api/admin' });
    await deleteSession(c.env, token);
    return c.json({ error: 'Sessão de administrador expirada.' }, 401);
  }
  const fp = await computeFingerprint(c.req.raw);
  if (!(await timingSafeEqualHex(fp, session.fingerprint))) {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/api/admin' });
    await deleteSession(c.env, token);
    return c.json({ error: 'Sessão inválida (origem alterada).' }, 401);
  }
  session.lastSeenAt = nowMs();
  await saveSession(c.env, token, session);
  c.set('adminSession', session);
  c.set('adminSessionToken', token);
  await next();
}

async function requireAdminCsrf(c: any, next: any) {
  const session = c.get('adminSession') as AdminSession | undefined;
  const csrf = c.req.header(ADMIN_CSRF_HEADER);
  if (!session || typeof csrf !== 'string' || !(await timingSafeEqualHex(csrf, session.csrfToken))) {
    return c.json({ error: 'Token CSRF de administrador inválido.' }, 403);
  }
  await next();
}

// ============================================================
// ROTAS PÚBLICAS
// ============================================================

app.get('/api/health', (c) => c.json({ status: 'ok', now: nowIso() }));

app.get('/api/catalog', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE'
  ).all<ProductRow>();
  return c.json({ products: (rows.results ?? []).map(productFromRow) });
});

app.get('/api/storefront-config', async (c) => {
  const settings = await loadPaymentSettings(c.env.DB);
  return c.json({ paymentSettings: getPublicPaymentSettings(settings, c.env) });
});

// ----- Contas de cliente (loja) -----

async function requireAccount(c: any, next: any) {
  const token = getCookie(c, ACCOUNT_SESSION_COOKIE);
  if (!token) return c.json({ error: 'Inicie sessão para ver a sua conta.' }, 401);
  const session = await loadAccountSession(c.env, token);
  if (!session || session.expiresAt <= nowMs()) {
    deleteCookie(c, ACCOUNT_SESSION_COOKIE, { path: '/api/account' });
    await deleteAccountSession(c.env, token);
    return c.json({ error: 'Sessão expirada. Inicie sessão novamente.' }, 401);
  }
  session.lastSeenAt = nowMs();
  await saveAccountSession(c.env, token, session);
  c.set('accountSession', session);
  c.set('accountSessionToken', token);
  await next();
}

app.post('/api/account/register', async (c) => {
  try {
    const body = await c.req.json();
    const name = parseStringField(body?.name, 'account name');
    if (name.length > 80) return c.json({ error: 'Nome demasiado longo.' }, 400);
    const phone = normalizePhone(body?.phone);
    if (phone.length < 6 || phone.length > 20) return c.json({ error: 'Indique um número de telemóvel válido.' }, 400);
    const rawPassword = typeof body?.password === 'string' ? body.password : '';
    if (rawPassword && rawPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      return c.json({ error: `A palavra-passe deve ter pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.` }, 400);
    }
    if (rawPassword.length > 200) return c.json({ error: 'Palavra-passe demasiado longa.' }, 400);

    const existing = await c.env.DB.prepare('SELECT id FROM accounts WHERE phone = ?').bind(phone).first();
    if (existing) return c.json({ error: 'Já existe uma conta com este telemóvel. Inicie sessão.' }, 409);

    const now = nowIso();
    const id = randomUuid();
    const passwordHash = rawPassword ? await hashPassword(rawPassword) : null;
    await c.env.DB.prepare(
      'INSERT INTO accounts (id, name, phone, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)'
    ).bind(id, name, phone, passwordHash, now, now).run();

    const token = await issueAccountSession(c.env, id);
    setCookie(c, ACCOUNT_SESSION_COOKIE, token, accountCookieOptions());
    return c.json({ account: { id, name, phone, hasPassword: Boolean(passwordHash), createdAt: now, updatedAt: now } });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Não foi possível criar a conta.' }, 400);
  }
});

app.post('/api/account/login', async (c) => {
  try {
    const rlKey = `account:${getClientIp(c.req.raw)}`;
    const rl = await getRateLimit(c.env, rlKey);
    if (rl && rl.blockedUntil > nowMs()) {
      const retry = Math.max(1, Math.ceil((rl.blockedUntil - nowMs()) / 1000));
      c.header('Retry-After', String(retry));
      return c.json({ error: `Demasiadas tentativas. Tente novamente em ${retry} segundos.` }, 429);
    }
    const body = await c.req.json();
    const phone = normalizePhone(body?.phone);
    if (!phone) return c.json({ error: 'Indique o seu telemóvel.' }, 400);
    const rawPassword = typeof body?.password === 'string' ? body.password : '';
    const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE phone = ?').bind(phone).first<AccountRow>();

    const invalid = async () => {
      const failed = await registerFailedLogin(c.env, rlKey);
      if (failed.blockedUntil > nowMs()) {
        const retry = Math.max(1, Math.ceil((failed.blockedUntil - nowMs()) / 1000));
        c.header('Retry-After', String(retry));
        return c.json({ error: `Demasiadas tentativas. Tente novamente em ${retry} segundos.` }, 429);
      }
      return c.json({ error: 'Telemóvel ou palavra-passe inválidos.' }, 401);
    };

    if (!row) return invalid();
    if (row.password_hash) {
      if (!rawPassword || !(await verifyPassword(rawPassword, row.password_hash))) {
        return invalid();
      }
    }
    await clearRateLimit(c.env, rlKey);
    const token = await issueAccountSession(c.env, row.id);
    setCookie(c, ACCOUNT_SESSION_COOKIE, token, accountCookieOptions());
    return c.json({ account: toPublicAccount(row) });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Não foi possível iniciar sessão.' }, 400);
  }
});

app.post('/api/account/logout', async (c) => {
  const token = getCookie(c, ACCOUNT_SESSION_COOKIE);
  if (token) await deleteAccountSession(c.env, token);
  deleteCookie(c, ACCOUNT_SESSION_COOKIE, { path: '/api/account' });
  return c.json({ loggedOut: true });
});

app.get('/api/account/me', requireAccount, async (c) => {
  const session = c.get('accountSession') as AccountSession | undefined;
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(session?.accountId).first<AccountRow>();
  if (!row) {
    const token = c.get('accountSessionToken') as string | undefined;
    if (token) await deleteAccountSession(c.env, token);
    deleteCookie(c, ACCOUNT_SESSION_COOKIE, { path: '/api/account' });
    return c.json({ error: 'Conta não encontrada.' }, 401);
  }
  const orderRows = await c.env.DB.prepare(
    'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC'
  ).bind(row.phone).all<OrderRow>();
  const orders = (orderRows.results ?? []).map(orderFromRow);
  return c.json({ account: toPublicAccount(row), orders });
});

app.get('/api/image-proxy', async (c) => {
  const fallbackLabel = c.req.query('label') || 'Frutaria em Casa';
  const fallbackCategory = c.req.query('category');
  const allowedHosts = new Set(env(c).ALLOWED_IMAGE_HOSTS.split(',').map((h) => h.trim().toLowerCase()));

  function placeholder() {
    return new Response(buildImagePlaceholderSvg(fallbackLabel, fallbackCategory), {
      status: 200,
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }

  try {
    const target = parseProxiedImageUrl(c.req.query('url'), allowedHosts);
    const up = await fetch(target, { headers: { accept: 'image/*' } });
    if (!up.ok) return placeholder();
    const ct = up.headers.get('content-type') || '';
    if (!ct.toLowerCase().startsWith('image/')) return placeholder();
    const headers = new Headers();
    headers.set('content-type', ct);
    headers.set('cache-control', up.headers.get('cache-control') || 'public, max-age=86400');
    const etag = up.headers.get('etag'); if (etag) headers.set('etag', etag);
    const lm = up.headers.get('last-modified'); if (lm) headers.set('last-modified', lm);
    return new Response(up.body, { status: 200, headers });
  } catch {
    return placeholder();
  }
});

function env<T extends { env: Env }>(c: T): Env { return c.env; }

// ----- Checkout -----

interface CartItemInput { productId: string; quantity: number; selectedUnit?: string }

function parseCustomer(input: unknown): CustomerDetails {
  if (!input || typeof input !== 'object') throw new Error('Customer details are required.');
  const p = input as Record<string, unknown>;
  const deliveryDayRaw = typeof p.deliveryDay === 'string' ? p.deliveryDay.toLowerCase().trim() : '';
  const deliveryDay = (deliveryDayRaw === 'quinta' || deliveryDayRaw === 'sexta') ? deliveryDayRaw : undefined;
  return {
    name: parseStringField(p.name, 'customer name'),
    phone: parseStringField(p.phone, 'customer phone'),
    address: parseStringField(p.address, 'customer address'),
    postalCode: parseStringField(p.postalCode, 'customer postal code'),
    deliveryDay,
  };
}

async function calculateOrderItems(items: unknown, db: D1Database) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Cart is empty.');
  const ids = items.map((it: any) => parseStringField(it?.productId, 'order item productId'));
  const placeholders = ids.map(() => '?').join(',');
  const catalog = await db.prepare(
    `SELECT * FROM products WHERE active = 1 AND id IN (${placeholders})`
  ).bind(...ids).all<ProductRow>();
  const catalogMap = new Map((catalog.results ?? []).map((r) => [r.id, productFromRow(r)]));

  const normalized: OrderItem[] = items.map((item: any) => {
    const productId = parseStringField(item?.productId, 'order item productId');
    const qv = typeof item?.quantity === 'number' ? item.quantity : Number(item?.quantity);
    if (!Number.isFinite(qv) || qv <= 0) throw new Error('Invalid order item quantity.');
    const product = catalogMap.get(productId);
    if (!product) throw new Error(`Product ${productId} is unavailable.`);
    const quantity = Math.round(qv * 1000) / 1000;
    const selectedUnit = typeof item?.selectedUnit === 'string' && item.selectedUnit.trim().length > 0
      ? item.selectedUnit.trim() : product.unit;
    // Venda à unidade com preço calculado pelo peso médio: produto a kg comprado
    // à unidade (selectedUnit === 'un') com peso médio definido → preço por
    // unidade = price_kg × (peso_medio_gramas / 1000). O servidor recalcula
    // sempre o preço; nunca confia no valor enviado pelo cliente.
    const soldByUnit = product.unit.trim().toLowerCase() === 'kg'
      && selectedUnit.trim().toLowerCase() === 'un'
      && typeof product.approxWeightGrams === 'number'
      && product.approxWeightGrams > 0;
    const unitPrice = soldByUnit
      ? Math.round(product.price * (product.approxWeightGrams! / 1000) * 100) / 100
      : product.price;
    const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
    let name = product.name;
    if (typeof item?.variant === 'string') {
      const v = item.variant.trim();
      if (v && v.length <= MAX_VARIANT_LENGTH) {
        // valida contra a lista de variantes do produto (case-insensitive)
        const match = (product.variants ?? []).find((cand) => cand.toLowerCase() === v.toLowerCase());
        if (match) name = `${product.name} (${match})`;
      }
    }
    return {
      productId: product.id, name, image: product.image,
      unit: product.unit, selectedUnit, quantity,
      unitPrice, lineTotal,
    };
  });
  const subtotal = normalized.reduce((t, i) => t + i.lineTotal, 0);
  return { items: normalized, subtotal: Math.round(subtotal * 100) / 100 };
}

function resolveCheckoutStatuses(method: PaymentMethod): { orderStatus: OrderStatus; paymentStatus: PaymentStatus } {
  switch (method) {
    case 'stripe': return { orderStatus: 'awaiting_payment', paymentStatus: 'awaiting_payment' };
    case 'transferencia': return { orderStatus: 'awaiting_transfer', paymentStatus: 'awaiting_transfer' };
    case 'dinheiro': return { orderStatus: 'confirmed', paymentStatus: 'cash_on_delivery' };
    case 'mbway':
    default: return { orderStatus: 'awaiting_payment', paymentStatus: 'pending' };
  }
}

function ensurePaymentMethodEnabled(method: PaymentMethod, s: PaymentSettings) {
  if (method === 'stripe' && !s.stripeEnabled) throw new Error('Card payments are disabled.');
  if (method === 'mbway' && !s.mbwayEnabled) throw new Error('MBWay is disabled.');
  if (method === 'transferencia' && !s.transferEnabled) throw new Error('Bank transfer is disabled.');
  if (method === 'dinheiro' && !s.cashEnabled) throw new Error('Cash payments are disabled.');
}

async function nextOrderNumber(db: D1Database): Promise<string> {
  // Robust against stats counter being out of sync with existing orders
  // (e.g. after re-running seed migrations). Re-aligns to the highest
  // existing FEC-##### number and retries on the unlikely event of a race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const maxRow = await db.prepare(
      "SELECT COALESCE(MAX(CAST(SUBSTR(number, 5) AS INTEGER)), 1000) AS maxNum FROM orders WHERE number LIKE 'FEC-%'"
    ).first<{ maxNum: number }>();
    const baseline = Number(maxRow?.maxNum ?? 1000);
    const row = await db.prepare(
      'UPDATE stats SET last_order_sequence = MAX(last_order_sequence, ?) + 1 WHERE id = 1 RETURNING last_order_sequence AS seq'
    ).bind(baseline).first<{ seq: number }>();
    const seq = Number(row?.seq ?? baseline + 1);
    const candidate = `FEC-${String(seq).padStart(5, '0')}`;
    const exists = await db.prepare('SELECT 1 FROM orders WHERE number = ? LIMIT 1').bind(candidate).first();
    if (!exists) return candidate;
  }
  throw new Error('Unable to allocate a unique order number.');
}

app.post('/api/checkout', async (c) => {
  try {
    const body = await c.req.json();
    const method = body?.paymentMethod;
    if (typeof method !== 'string' || !ALLOWED_PAYMENT_METHODS.has(method)) {
      return c.json({ error: 'Invalid payment method.' }, 400);
    }
    const settings = await loadPaymentSettings(c.env.DB);
    if (method === 'stripe' && !c.env.STRIPE_SECRET_KEY) {
      return c.json({ error: 'Stripe is not configured on the server.' }, 503);
    }
    ensurePaymentMethodEnabled(method as PaymentMethod, settings);
    const customer = parseCustomer(body?.customer);
    const { items, subtotal } = await calculateOrderItems(body?.items, c.env.DB);
    const { orderStatus, paymentStatus } = resolveCheckoutStatuses(method as PaymentMethod);
    const createdAt = nowIso();
    const order: Order = {
      id: randomUuid(),
      number: await nextOrderNumber(c.env.DB),
      createdAt, updatedAt: createdAt,
      customer, items, subtotal, total: subtotal,
      currency: 'eur',
      paymentMethod: method as PaymentMethod,
      paymentStatus, orderStatus,
      notes: parseOptionalString(body?.notes),
      customerNote: parseOptionalString(body?.customerNote) || undefined,
    };

    let clientSecret: string | undefined;
    let stripeStatus: string | undefined;

    if (method === 'stripe') {
      // Stripe rejeita PaymentIntents abaixo de 0,50€ em EUR.
      if (order.total < 0.5) {
        return c.json({
          error: 'O pagamento por cartão exige um valor mínimo de 0,50€. Escolha MBWay, transferência ou dinheiro para totais inferiores.',
        }, 400);
      }
      const intent = await stripeCreatePaymentIntent(
        c.env,
        Math.round(order.total * 100),
        order.currency,
        {
          orderId: order.id,
          orderNumber: order.number,
          customerName: order.customer.name,
        },
      );
      order.paymentReference = intent.id;
      order.updatedAt = nowIso();
      clientSecret = intent.client_secret;
      stripeStatus = intent.status;
    }

    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO orders (
        id, number, created_at, updated_at,
        customer_name, customer_phone, customer_address, customer_postal_code, delivery_day,
        items_json, subtotal, total, currency,
        payment_method, payment_status, order_status, payment_reference, notes, customer_note
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        order.id, order.number, order.createdAt, order.updatedAt,
        order.customer.name, order.customer.phone, order.customer.address, order.customer.postalCode,
        order.customer.deliveryDay || null,
        JSON.stringify(order.items), order.subtotal, order.total, order.currency,
        order.paymentMethod, order.paymentStatus, order.orderStatus,
        order.paymentReference || null, order.notes || null, order.customerNote || null
      ),
      c.env.DB.prepare(`INSERT INTO payments (
        id, order_id, method, amount, status, created_at, updated_at, external_reference
      ) VALUES (?,?,?,?,?,?,?,?)`).bind(
        randomUuid(), order.id, order.paymentMethod, order.total,
        stripeStatus || order.paymentStatus,
        createdAt, order.updatedAt,
        method === 'stripe' ? order.paymentReference || null
          : method === 'mbway' ? settings.mbwayNumber : null
      ),
    ]);

    c.executionCtx.waitUntil((async () => {
      const { subject, text, html } = buildOrderEmailParts(order);
      await sendEmail(c.env, c.env.ORDER_NOTIFICATION_EMAIL, subject, text, html);
    })());

    return c.json({
      order,
      clientSecret,
      paymentSettings: getPublicPaymentSettings(settings, c.env),
    });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to process checkout.' }, 400);
  }
});

// Confirma o estado de um PaymentIntent depois do cliente o confirmar no browser.
app.post('/api/checkout/stripe/confirm', async (c) => {
  try {
    const body = await c.req.json();
    const orderId = parseStringField(body?.orderId, 'orderId');
    const paymentIntentId = parseStringField(body?.paymentIntentId, 'paymentIntentId');
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ error: 'Stripe is not configured on the server.' }, 503);
    }
    const intent = await stripeRetrievePaymentIntent(c.env, paymentIntentId);
    const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
    if (!row) return c.json({ error: 'Order not found.' }, 404);
    const order = orderFromRow(row);

    let newOrderStatus: OrderStatus = order.orderStatus;
    let newPaymentStatus: PaymentStatus = order.paymentStatus;
    if (intent.status === 'succeeded') {
      newPaymentStatus = 'paid';
      newOrderStatus = order.orderStatus === 'cancelled' ? 'cancelled' : 'confirmed';
    } else if (intent.status === 'processing') {
      newPaymentStatus = 'pending';
    } else if (intent.status === 'canceled') {
      newPaymentStatus = 'cancelled';
      newOrderStatus = 'cancelled';
    } else {
      newPaymentStatus = 'failed';
    }
    const updatedAt = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE orders SET order_status=?, payment_status=?, payment_reference=?, updated_at=? WHERE id=?`)
        .bind(newOrderStatus, newPaymentStatus, intent.id, updatedAt, orderId),
      c.env.DB.prepare(`UPDATE payments SET status=?, updated_at=?, external_reference=? WHERE order_id=?`)
        .bind(intent.status, updatedAt, intent.id, orderId),
    ]);
    order.orderStatus = newOrderStatus;
    order.paymentStatus = newPaymentStatus;
    order.paymentReference = intent.id;
    order.updatedAt = updatedAt;

    c.executionCtx.waitUntil((async () => {
      const { subject, text, html } = buildOrderEmailParts(order);
      await sendEmail(c.env, c.env.ORDER_NOTIFICATION_EMAIL, `[Atualização] ${subject}`, text, html);
    })());

    return c.json({ order, paymentStatus: intent.status });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to confirm Stripe payment.' }, 400);
  }
});

// ============================================================
// ROTAS ADMIN
// ============================================================

app.post('/api/admin/login', async (c) => {
  try {
    const ip = getClientIp(c.req.raw);
    const current = await getRateLimit(c.env, ip);
    if (current && current.blockedUntil > nowMs()) {
      const retry = Math.ceil((current.blockedUntil - nowMs()) / 1000);
      c.header('Retry-After', String(retry));
      return c.json({ error: `Demasiadas tentativas. Tente novamente em ${retry} segundos.` }, 429);
    }
    const body = await c.req.json();
    const email = parseStringField(body?.email, 'admin email').toLowerCase();
    const passcode = parseStringField(body?.passcode, 'admin passcode');
    const adminPasscode = c.env.ADMIN_PASSCODE?.trim();
    const adminEmail = c.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!adminPasscode || adminPasscode.length < ADMIN_PASSCODE_MIN_LENGTH || !adminEmail) {
      return c.json({ error: 'Login de administrador não está configurado.' }, 503);
    }
    const emailOk = await timingSafeEqualHex(await sha256Hex(email), await sha256Hex(adminEmail));
    const passOk = await timingSafeEqualHex(await sha256Hex(passcode), await sha256Hex(adminPasscode));
    if (!emailOk || !passOk) {
      const next = await registerFailedLogin(c.env, ip);
      if (next.blockedUntil > nowMs()) {
        const retry = Math.ceil((next.blockedUntil - nowMs()) / 1000);
        c.header('Retry-After', String(retry));
        return c.json({ error: `Demasiadas tentativas. Tente novamente em ${retry} segundos.` }, 429);
      }
      return c.json({ error: 'Email ou senha de administrador inválidos.' }, 401);
    }
    await clearRateLimit(c.env, ip);
    const token = randomTokenHex(24);
    const csrfToken = randomTokenHex(24);
    const now = nowMs();
    const session: AdminSession = {
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
      csrfToken,
      fingerprint: await computeFingerprint(c.req.raw),
      createdAt: now, lastSeenAt: now,
    };
    await saveSession(c.env, token, session);
    setCookie(c, ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: true,
      path: '/api/admin',
      maxAge: SESSION_TTL_SECONDS,
    });

    c.executionCtx.waitUntil((async () => {
      const when = formatOrderDateTime(nowIso());
      const ua = c.req.header('user-agent') || 'desconhecido';
      const { subject, text, html } = buildAdminLoginEmailParts(when, ip, ua);
      await sendEmail(c.env, c.env.ADMIN_NOTIFICATION_EMAIL, subject, text, html);
    })());

    return c.json({ csrfToken, expiresAt: session.expiresAt });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Não foi possível autenticar.' }, 400);
  }
});

app.post('/api/admin/logout', requireAdmin, requireAdminCsrf, async (c) => {
  const token = c.get('adminSessionToken');
  if (token) await deleteSession(c.env, token);
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/api/admin' });
  return c.json({ loggedOut: true });
});

app.get('/api/admin/bootstrap', requireAdmin, async (c) => {
  const session = c.get('adminSession') as AdminSession;
  const [products, orders, payments, settings] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all<ProductRow>(),
    c.env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC').all<OrderRow>(),
    c.env.DB.prepare('SELECT * FROM payments ORDER BY created_at DESC').all<PaymentRow>(),
    loadPaymentSettings(c.env.DB),
  ]);
  const productsArr = (products.results ?? []).map(productFromRow);
  const ordersArr = (orders.results ?? []).map(orderFromRow);
  const paymentsArr = (payments.results ?? []).map(paymentFromRow);
  const activeProducts = productsArr.filter((p) => p.active).length;
  const paidRevenue = ordersArr.filter((o) => o.paymentStatus === 'paid').reduce((t, o) => t + o.total, 0);
  return c.json({
    csrfToken: session.csrfToken,
    dashboard: {
      counts: {
        products: productsArr.length,
        activeProducts,
        orders: ordersArr.length,
        payments: paymentsArr.length,
      },
      revenue: Math.round(paidRevenue * 100) / 100,
      recentOrders: ordersArr.slice(0, 5),
    },
    products: productsArr,
    orders: ordersArr,
    payments: paymentsArr,
    paymentSettings: settings,
  });
});

function parseProductInput(input: unknown, current?: Product): Product {
  if (!input || typeof input !== 'object') throw new Error('Invalid product payload.');
  const p = input as Record<string, unknown>;
  const ts = nowIso();
  const variants = parseVariants(p.variants);
  return {
    id: current?.id || randomUuid(),
    name: parseStringField(p.name, 'product name'),
    price: parsePrice(p.price),
    unit: parseStringField(p.unit, 'product unit'),
    category: parseCategory(p.category),
    image: parseProductImage(p.image),
    description: parseOptionalString(p.description),
    variants: variants.length > 0 ? variants : undefined,
    approxWeightGrams: parseApproxWeightGrams(p.approxWeightGrams),
    active: parseBooleanField(p.active, current?.active ?? true),
    createdAt: current?.createdAt || ts,
    updatedAt: ts,
  };
}

app.post('/api/admin/products', requireAdmin, requireAdminCsrf, async (c) => {
  try {
    const body = await c.req.json();
    const product = parseProductInput(body);
    await c.env.DB.prepare(`INSERT INTO products (
      id, name, price, unit, category, image, description, variants, approx_weight_grams, active, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      product.id, product.name, product.price, product.unit, product.category,
      product.image, product.description,
      product.variants && product.variants.length > 0 ? JSON.stringify(product.variants) : null,
      product.approxWeightGrams ?? null,
      product.active ? 1 : 0,
      product.createdAt, product.updatedAt
    ).run();
    return c.json({ product }, 201);
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to create product.' }, 400);
  }
});

app.put('/api/admin/products/:id', requireAdmin, requireAdminCsrf, async (c) => {
  try {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
    if (!row) return c.json({ error: 'Product not found.' }, 404);
    const current = productFromRow(row);
    const body = await c.req.json();
    const updated = parseProductInput(body, current);
    await c.env.DB.prepare(`UPDATE products SET
      name=?, price=?, unit=?, category=?, image=?, description=?, variants=?, approx_weight_grams=?, active=?, updated_at=?
      WHERE id=?`).bind(
      updated.name, updated.price, updated.unit, updated.category, updated.image,
      updated.description,
      updated.variants && updated.variants.length > 0 ? JSON.stringify(updated.variants) : null,
      updated.approxWeightGrams ?? null,
      updated.active ? 1 : 0, updated.updatedAt, id
    ).run();
    return c.json({ product: updated });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to update product.' }, 400);
  }
});

app.delete('/api/admin/products/:id', requireAdmin, requireAdminCsrf, async (c) => {
  try {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
    if (!row) return c.json({ error: 'Product not found.' }, 404);
    const referenced = await c.env.DB.prepare(
      "SELECT 1 AS one FROM orders WHERE EXISTS (SELECT 1 FROM json_each(orders.items_json) WHERE json_extract(value, '$.productId') = ?) LIMIT 1"
    ).bind(id).first<{ one: number }>();
    if (referenced) {
      const ts = nowIso();
      await c.env.DB.prepare('UPDATE products SET active=0, updated_at=? WHERE id=?').bind(ts, id).run();
      return c.json({ product: { ...productFromRow(row), active: false, updatedAt: ts }, archived: true });
    }
    await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    return c.json({ deleted: true });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to delete product.' }, 400);
  }
});

app.patch('/api/admin/orders/:id', requireAdmin, requireAdminCsrf, async (c) => {
  try {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
    if (!row) return c.json({ error: 'Order not found.' }, 404);
    const order = orderFromRow(row);
    const body = await c.req.json();
    if (typeof body?.orderStatus === 'string') {
      if (!ALLOWED_ORDER_STATUSES.has(body.orderStatus)) return c.json({ error: 'Invalid order status.' }, 400);
      order.orderStatus = body.orderStatus;
    }
    if (typeof body?.paymentStatus === 'string') {
      if (!ALLOWED_PAYMENT_STATUSES.has(body.paymentStatus)) return c.json({ error: 'Invalid payment status.' }, 400);
      order.paymentStatus = body.paymentStatus;
    }
    if (typeof body?.notes === 'string') order.notes = body.notes.trim();
    order.updatedAt = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE orders SET order_status=?, payment_status=?, notes=?, updated_at=? WHERE id=?`)
        .bind(order.orderStatus, order.paymentStatus, order.notes || null, order.updatedAt, id),
      c.env.DB.prepare(`UPDATE payments SET status=?, updated_at=?, note=COALESCE(?, note) WHERE order_id=?`)
        .bind(order.paymentStatus, order.updatedAt, typeof body?.notes === 'string' ? order.notes || null : null, id),
    ]);
    return c.json({ order });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to update order.' }, 400);
  }
});

app.put('/api/admin/payment-settings', requireAdmin, requireAdminCsrf, async (c) => {
  try {
    const body = await c.req.json();
    const current = await loadPaymentSettings(c.env.DB);
    const updated: PaymentSettings = {
      stripeEnabled: parseBooleanField(body?.stripeEnabled, current.stripeEnabled),
      mbwayEnabled: parseBooleanField(body?.mbwayEnabled, current.mbwayEnabled),
      transferEnabled: parseBooleanField(body?.transferEnabled, current.transferEnabled),
      cashEnabled: parseBooleanField(body?.cashEnabled, current.cashEnabled),
      mbwayNumber: parseStringField(body?.mbwayNumber, 'MBWay number'),
      transferRecipient: parseStringField(body?.transferRecipient, 'transfer recipient'),
      transferIban: parseStringField(body?.transferIban, 'transfer IBAN'),
      transferBank: parseStringField(body?.transferBank, 'transfer bank'),
      transferInstructions: parseStringField(body?.transferInstructions, 'transfer instructions'),
      updatedAt: nowIso(),
    };
    await c.env.DB.prepare(`UPDATE payment_settings SET
      stripe_enabled=?, mbway_enabled=?, transfer_enabled=?, cash_enabled=?,
      mbway_number=?, transfer_recipient=?, transfer_iban=?, transfer_bank=?,
      transfer_instructions=?, updated_at=?
      WHERE id=1`).bind(
      updated.stripeEnabled ? 1 : 0, updated.mbwayEnabled ? 1 : 0,
      updated.transferEnabled ? 1 : 0, updated.cashEnabled ? 1 : 0,
      updated.mbwayNumber, updated.transferRecipient, updated.transferIban,
      updated.transferBank, updated.transferInstructions, updated.updatedAt
    ).run();
    return c.json({ paymentSettings: updated });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unable to update payment settings.' }, 400);
  }
});

// ----- Fallback: tudo o resto vai para os assets estáticos do SPA -----

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    // Tudo o resto: serve o SPA estático (com SPA fallback automático).
    return env.ASSETS.fetch(request);
  },
};
