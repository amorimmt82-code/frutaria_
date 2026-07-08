import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import Stripe from 'stripe';
import nodemailer, { Transporter } from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile } from 'fs/promises';
import crypto from 'crypto';
import { products as seedProducts } from './src/data/products.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ProductCategory = string;
type PaymentMethod = 'mbway' | 'transferencia' | 'dinheiro' | 'stripe';
type OrderStatus = 'awaiting_payment' | 'awaiting_transfer' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
type PaymentStatus = 'pending' | 'awaiting_payment' | 'awaiting_transfer' | 'paid' | 'cash_on_delivery' | 'failed' | 'cancelled';

interface StoreProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: ProductCategory;
  image: string;
  description: string;
  approxWeightGrams?: number;
  variants?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  productId: string;
  name: string;
  image: string;
  unit: string;
  selectedUnit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  deliveryDay?: 'quinta' | 'sexta';
}

interface OrderRecord {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  customer: CustomerDetails;
  items: OrderItem[];
  subtotal: number;
  total: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentReference?: string;
  notes?: string;
  customerNote?: string;
}

interface PaymentRecord {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  externalReference?: string;
  note?: string;
}

interface AccountRecord {
  id: string;
  name: string;
  /** Telefone normalizado (apenas dígitos) — chave única da conta. */
  phone: string;
  /** Hash PBKDF2 da palavra-passe; ausente quando a conta não tem senha. */
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentSettings {
  stripeEnabled: boolean;
  mbwayEnabled: boolean;
  transferEnabled: boolean;
  cashEnabled: boolean;
  mbwayNumber: string;
  transferRecipient: string;
  transferIban: string;
  transferBank: string;
  transferInstructions: string;
  updatedAt: string;
}

interface StoreState {
  products: StoreProduct[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  accounts: AccountRecord[];
  paymentSettings: PaymentSettings;
  stats: {
    lastOrderSequence: number;
  };
}

interface AdminLoginAttemptState {
  attemptCount: number;
  windowStartedAt: number;
  blockedUntil: number;
}

interface AdminSessionState {
  expiresAt: number;
  csrfToken: string;
  fingerprint: string;
  createdAt: number;
  lastSeenAt: number;
}

interface AccountSessionState {
  accountId: string;
  expiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

const DATA_DIRECTORY = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIRECTORY, 'store.json');
const FAMILY_PHOTO_FILE = path.join(__dirname, 'familia frutaria.jpeg');
const ADMIN_SESSION_COOKIE_NAME = 'frutaria_admin_session';
const ADMIN_CSRF_HEADER_NAME = 'x-admin-csrf-token';
const ORDER_NOTIFICATION_EMAIL = (process.env.ORDER_NOTIFICATION_EMAIL || 'frutariaemcasa2021@gmail.com').trim();
// Email para onde enviamos avisos quando alguém entra no back office.
const ADMIN_NOTIFICATION_EMAIL = (process.env.ADMIN_NOTIFICATION_EMAIL || 'frutariaemcasa2021@gmail.com').trim();
// Sessão curta (2h) para minimizar a janela de exposição em caso de roubo de cookie.
const TOKEN_TTL_MS = 1000 * 60 * 60 * 2;
// Rate-limit agressivo: 3 tentativas em 5min → bloqueio de 30min.
const ADMIN_LOGIN_WINDOW_MS = 1000 * 60 * 5;
const ADMIN_LOGIN_MAX_ATTEMPTS = 3;
const ADMIN_LOGIN_BLOCK_MS = 1000 * 60 * 30;
// Em produção o ADMIN_PASSCODE tem de ter pelo menos 12 caracteres.
const ADMIN_PASSCODE_MIN_LENGTH_PROD = 12;
const PROXIED_IMAGE_HOSTS = new Set(['images.unsplash.com', 'plus.unsplash.com']);
// Map: hashedToken -> session. Guardamos só o hash em memória, para que um
// dump não exponha valores reutilizáveis como cookie.
const adminSessions = new Map<string, AdminSessionState>();
const adminLoginAttempts = new Map<string, AdminLoginAttemptState>();
// ----- Contas de cliente (loja) -----
const ACCOUNT_SESSION_COOKIE_NAME = 'frutaria_account_session';
// Sessão longa (30 dias) para comodidade do cliente.
const ACCOUNT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const ACCOUNT_LOGIN_WINDOW_MS = 1000 * 60 * 15;
const ACCOUNT_LOGIN_MAX_ATTEMPTS = 8;
const ACCOUNT_LOGIN_BLOCK_MS = 1000 * 60 * 15;
const ACCOUNT_PASSWORD_MIN_LENGTH = 4;
const accountSessions = new Map<string, AccountSessionState>();
const accountLoginAttempts = new Map<string, AdminLoginAttemptState>();
const allowedPaymentMethods = new Set<PaymentMethod>(['mbway', 'transferencia', 'dinheiro', 'stripe']);
const allowedOrderStatuses = new Set<OrderStatus>(['awaiting_payment', 'awaiting_transfer', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);
const allowedPaymentStatuses = new Set<PaymentStatus>(['pending', 'awaiting_payment', 'awaiting_transfer', 'paid', 'cash_on_delivery', 'failed', 'cancelled']);

let storeCache: StoreState | null = null;
let storeWriteQueue = Promise.resolve();
let missingAdminPasscodeWarningShown = false;

function nowIso() {
  return new Date().toISOString();
}

function defaultPaymentSettings(): PaymentSettings {
  return {
    stripeEnabled: true,
    mbwayEnabled: true,
    transferEnabled: true,
    cashEnabled: true,
    mbwayNumber: '+351 919 881 410',
    transferRecipient: 'Frutaria em Casa',
    transferIban: 'PT50 0033 0000 4578 6278 628 05',
    transferBank: 'Banco Local',
    transferInstructions: 'Envie o comprovativo por WhatsApp ou confirme connosco após a transferência.',
    updatedAt: nowIso(),
  };
}

function normalizeSeedProduct(product: {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: ProductCategory;
  image: string;
  description: string;
}, index: number): StoreProduct {
  const createdAt = new Date(Date.now() - (seedProducts.length - index) * 60_000).toISOString();
  return {
    ...product,
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
}

function buildInitialStore(): StoreState {
  return {
    products: seedProducts.map(normalizeSeedProduct),
    orders: [],
    payments: [],
    accounts: [],
    paymentSettings: defaultPaymentSettings(),
    stats: {
      lastOrderSequence: 1000,
    },
  };
}

async function ensureStoreFile() {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    await readFile(STORE_FILE, 'utf8');
  } catch {
    await writeFile(STORE_FILE, JSON.stringify(buildInitialStore(), null, 2), 'utf8');
  }
}

async function loadStore(): Promise<StoreState> {
  await ensureStoreFile();
  const content = await readFile(STORE_FILE, 'utf8');
  try {
    const parsed = JSON.parse(content) as Partial<StoreState>;
    return {
      products: Array.isArray(parsed.products) ? parsed.products : buildInitialStore().products,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      paymentSettings: {
        ...defaultPaymentSettings(),
        ...(parsed.paymentSettings || {}),
        updatedAt: parsed.paymentSettings?.updatedAt || nowIso(),
      },
      stats: {
        lastOrderSequence: parsed.stats?.lastOrderSequence || 1000,
      },
    };
  } catch {
    const initialStore = buildInitialStore();
    await writeFile(STORE_FILE, JSON.stringify(initialStore, null, 2), 'utf8');
    return initialStore;
  }
}

async function getStore() {
  if (!storeCache) {
    storeCache = await loadStore();
  }
  return storeCache;
}

async function persistStore(store: StoreState) {
  storeCache = store;
  storeWriteQueue = storeWriteQueue.then(() => writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8'));
  await storeWriteQueue;
}

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production';
}

function getAdminPasscode() {
  const configuredPasscode = process.env.ADMIN_PASSCODE?.trim();
  if (configuredPasscode) {
    if (isProductionEnvironment() && configuredPasscode.length < ADMIN_PASSCODE_MIN_LENGTH_PROD) {
      if (!missingAdminPasscodeWarningShown) {
        console.error(`ADMIN_PASSCODE must be at least ${ADMIN_PASSCODE_MIN_LENGTH_PROD} characters in production. Admin login disabled.`);
        missingAdminPasscodeWarningShown = true;
      }
      return null;
    }
    return configuredPasscode;
  }

  if (!missingAdminPasscodeWarningShown) {
    if (isProductionEnvironment()) {
      console.error('ADMIN_PASSCODE not found in environment; admin login is disabled in production.');
    } else {
      console.warn('ADMIN_PASSCODE not found in environment; using default passcode "frutaria-admin".');
    }
    missingAdminPasscodeWarningShown = true;
  }

  return isProductionEnvironment() ? null : 'frutaria-admin';
}

// Email do administrador (par com ADMIN_PASSCODE). Em produção é obrigatório;
// em dev cai para "admin@frutaria.local".
function getAdminEmail() {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (configured) {
    return configured;
  }
  return isProductionEnvironment() ? null : 'admin@frutaria.local';
}

// Comparação em tempo constante (mitiga timing attacks).
function timingSafeStringEqual(a: string, b: string) {
  const aHash = crypto.createHash('sha256').update(a, 'utf8').digest();
  const bHash = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

function hashSessionToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// Fingerprint da sessão liga-a ao IP + User-Agent. Se mudar (cookie roubado
// e reutilizado noutro lado), a sessão é invalidada.
function computeSessionFingerprint(req: Request) {
  const ip = (req.ip || req.socket.remoteAddress || '').trim();
  const ua = (req.header('user-agent') || '').trim();
  return crypto.createHash('sha256').update(`${ip}|${ua}`, 'utf8').digest('hex');
}

function createAdminSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createAdminCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

function parseCookieHeader(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();

    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }

  return cookies;
}

function getAdminSessionTokenFromRequest(req: Request) {
  return parseCookieHeader(req.header('cookie')).get(ADMIN_SESSION_COOKIE_NAME) || null;
}

function getAdminSessionCookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProductionEnvironment(),
    path: '/api/admin',
  };
}

function getAdminSessionCookieOptions() {
  return {
    ...getAdminSessionCookieBaseOptions(),
    maxAge: TOKEN_TTL_MS,
  };
}

function clearAdminSession(res: Response, sessionToken?: string | null) {
  if (sessionToken) {
    adminSessions.delete(hashSessionToken(sessionToken));
  }

  res.clearCookie(ADMIN_SESSION_COOKIE_NAME, getAdminSessionCookieBaseOptions());
}

function getAdminLoginClientKey(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getAdminLoginAttemptState(clientKey: string) {
  const state = adminLoginAttempts.get(clientKey);
  if (!state) {
    return null;
  }

  const now = Date.now();
  const windowExpired = state.windowStartedAt + ADMIN_LOGIN_WINDOW_MS <= now;
  const blockExpired = state.blockedUntil <= now;

  if (windowExpired && blockExpired) {
    adminLoginAttempts.delete(clientKey);
    return null;
  }

  return state;
}

function registerFailedAdminLogin(clientKey: string) {
  const now = Date.now();
  const currentState = getAdminLoginAttemptState(clientKey);
  const shouldResetWindow = !currentState || currentState.windowStartedAt + ADMIN_LOGIN_WINDOW_MS <= now;

  const nextState: AdminLoginAttemptState = shouldResetWindow
    ? {
        attemptCount: 1,
        windowStartedAt: now,
        blockedUntil: 0,
      }
    : {
        ...currentState,
        attemptCount: currentState.attemptCount + 1,
      };

  if (nextState.attemptCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    nextState.blockedUntil = now + ADMIN_LOGIN_BLOCK_MS;
  }

  adminLoginAttempts.set(clientKey, nextState);
  return nextState;
}

function clearAdminLoginAttempts(clientKey: string) {
  adminLoginAttempts.delete(clientKey);
}

function getAdminLoginRetryAfterSeconds(state: AdminLoginAttemptState) {
  return Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
}

function sendAdminLoginRateLimitedResponse(res: Response, state: AdminLoginAttemptState) {
  const retryAfterSeconds = getAdminLoginRetryAfterSeconds(state);
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    error: `Demasiadas tentativas. Tente novamente em ${retryAfterSeconds} segundos.`,
  });
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [hashed, session] of adminSessions.entries()) {
    if (session.expiresAt <= now) {
      adminSessions.delete(hashed);
    }
  }
}

// ----- Contas de cliente: helpers -----

function normalizePhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

// Hash PBKDF2-SHA256 (formato pbkdf2$iter$saltHex$hashHex), compatível com o Worker.
function hashAccountPassword(password: string): string {
  const iterations = 100_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyAccountPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2], 'hex');
    expected = Buffer.from(parts[3], 'hex');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function toPublicAccount(account: AccountRecord) {
  return {
    id: account.id,
    name: account.name,
    phone: account.phone,
    hasPassword: Boolean(account.passwordHash),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function getAccountSessionTokenFromRequest(req: Request) {
  return parseCookieHeader(req.header('cookie')).get(ACCOUNT_SESSION_COOKIE_NAME) || null;
}

function getAccountSessionCookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProductionEnvironment(),
    path: '/api/account',
  };
}

function getAccountSessionCookieOptions() {
  return {
    ...getAccountSessionCookieBaseOptions(),
    maxAge: ACCOUNT_TOKEN_TTL_MS,
  };
}

function clearAccountSession(res: Response, token?: string | null) {
  if (token) {
    accountSessions.delete(hashSessionToken(token));
  }
  res.clearCookie(ACCOUNT_SESSION_COOKIE_NAME, getAccountSessionCookieBaseOptions());
}

function cleanupExpiredAccountSessions() {
  const now = Date.now();
  for (const [hashed, session] of accountSessions.entries()) {
    if (session.expiresAt <= now) {
      accountSessions.delete(hashed);
    }
  }
}

function issueAccountSession(res: Response, accountId: string) {
  cleanupExpiredAccountSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  accountSessions.set(hashSessionToken(token), {
    accountId,
    expiresAt: now + ACCOUNT_TOKEN_TTL_MS,
    createdAt: now,
    lastSeenAt: now,
  });
  res.cookie(ACCOUNT_SESSION_COOKIE_NAME, token, getAccountSessionCookieOptions());
}

function getAccountLoginAttemptState(clientKey: string) {
  const state = accountLoginAttempts.get(clientKey);
  if (!state) return null;
  const now = Date.now();
  const windowExpired = state.windowStartedAt + ACCOUNT_LOGIN_WINDOW_MS <= now;
  const blockExpired = state.blockedUntil <= now;
  if (windowExpired && blockExpired) {
    accountLoginAttempts.delete(clientKey);
    return null;
  }
  return state;
}

function registerFailedAccountLogin(clientKey: string) {
  const now = Date.now();
  const current = getAccountLoginAttemptState(clientKey);
  const resetWindow = !current || current.windowStartedAt + ACCOUNT_LOGIN_WINDOW_MS <= now;
  const next: AdminLoginAttemptState = resetWindow
    ? { attemptCount: 1, windowStartedAt: now, blockedUntil: 0 }
    : { ...current, attemptCount: current.attemptCount + 1 };
  if (next.attemptCount >= ACCOUNT_LOGIN_MAX_ATTEMPTS) {
    next.blockedUntil = now + ACCOUNT_LOGIN_BLOCK_MS;
  }
  accountLoginAttempts.set(clientKey, next);
  return next;
}

function clearAccountLoginAttempts(clientKey: string) {
  accountLoginAttempts.delete(clientKey);
}

function requireAccount(req: Request, res: Response, next: NextFunction) {
  cleanupExpiredAccountSessions();
  const token = getAccountSessionTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Inicie sessão para ver a sua conta.' });
  }
  const session = accountSessions.get(hashSessionToken(token));
  if (!session || session.expiresAt <= Date.now()) {
    clearAccountSession(res, token);
    return res.status(401).json({ error: 'Sessão expirada. Inicie sessão novamente.' });
  }
  session.lastSeenAt = Date.now();
  (res.locals as { accountSession?: AccountSessionState; accountSessionToken?: string }).accountSession = session;
  (res.locals as { accountSession?: AccountSessionState; accountSessionToken?: string }).accountSessionToken = token;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  cleanupExpiredSessions();
  const token = getAdminSessionTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Autenticação de administrador necessária.' });
  }

  const hashedToken = hashSessionToken(token);
  const session = adminSessions.get(hashedToken);
  if (!session || session.expiresAt <= Date.now()) {
    clearAdminSession(res, token);
    return res.status(401).json({ error: 'Sessão de administrador expirada.' });
  }

  // Verificação de fingerprint: se o IP ou User-Agent mudou, fora.
  const currentFingerprint = computeSessionFingerprint(req);
  if (!timingSafeStringEqual(currentFingerprint, session.fingerprint)) {
    clearAdminSession(res, token);
    return res.status(401).json({ error: 'Sessão inválida (origem alterada).' });
  }

  session.lastSeenAt = Date.now();
  (res.locals as { adminSession?: AdminSessionState; adminSessionToken?: string }).adminSession = session;
  (res.locals as { adminSession?: AdminSessionState; adminSessionToken?: string }).adminSessionToken = token;

  next();
}

function requireAdminCsrf(_req: Request, res: Response, next: NextFunction) {
  const { adminSession } = res.locals as { adminSession?: AdminSessionState };
  const csrfToken = _req.header(ADMIN_CSRF_HEADER_NAME);

  if (!adminSession || typeof csrfToken !== 'string' || !timingSafeStringEqual(csrfToken, adminSession.csrfToken)) {
    return res.status(403).json({ error: 'Token CSRF de administrador inválido.' });
  }

  next();
}

function parseStringField(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanField(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function parsePrice(value: unknown) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error('Invalid product price.');
  }
  return Math.round(numericValue * 100) / 100;
}

// Peso médio mínimo (gramas) para venda à unidade. Mantém-se igual ao
// frontend e ao worker para evitar valores absurdos (ex.: 1g).
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

const MAX_VARIANTS = 12;
const MAX_VARIANT_LENGTH = 32;

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

// A imagem é opcional: quando vazia, a loja mostra um placeholder SVG com o
// emoji do produto. Limite de tamanho alinhado com o worker (D1) para evitar
// payloads enormes e manter o comportamento consistente entre back-ends.
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

function parseCategory(value: unknown): ProductCategory {
  if (typeof value !== 'string') {
    throw new Error('Invalid product category.');
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Invalid product category.');
  }
  if (trimmed.length > 40) {
    throw new Error('Category too long.');
  }
  return trimmed;
}

function parseProductInput(input: unknown, currentProduct?: StoreProduct): StoreProduct {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid product payload.');
  }

  const payload = input as Record<string, unknown>;
  const timestamp = nowIso();
  const variantsList = parseVariants(payload.variants);

  return {
    id: currentProduct?.id || crypto.randomUUID(),
    name: parseStringField(payload.name, 'product name'),
    price: parsePrice(payload.price),
    unit: parseStringField(payload.unit, 'product unit'),
    category: parseCategory(payload.category),
    image: parseProductImage(payload.image),
    description: parseOptionalString(payload.description),
    approxWeightGrams: parseApproxWeightGrams(payload.approxWeightGrams),
    variants: variantsList.length > 0 ? variantsList : undefined,
    active: parseBooleanField(payload.active, currentProduct?.active ?? true),
    createdAt: currentProduct?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function nextOrderNumber(store: StoreState) {
  store.stats.lastOrderSequence += 1;
  return `FEC-${String(store.stats.lastOrderSequence).padStart(5, '0')}`;
}

function buildDashboard(store: StoreState) {
  const activeProducts = store.products.filter((product) => product.active).length;
  const paidRevenue = store.orders
    .filter((order) => order.paymentStatus === 'paid')
    .reduce((total, order) => total + order.total, 0);

  return {
    counts: {
      products: store.products.length,
      activeProducts,
      orders: store.orders.length,
      payments: store.payments.length,
    },
    revenue: Math.round(paidRevenue * 100) / 100,
    recentOrders: [...store.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  };
}

function isStripeKeyConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function getPublicPaymentSettings(paymentSettings: PaymentSettings) {
  return {
    // Mesmo que o admin tenha o Stripe ligado, escondemos a opção quando o
    // servidor não tem a chave secreta configurada. Evita que o cliente
    // selecione "Cartão" e receba um erro 500 ao tentar pagar.
    stripeEnabled: paymentSettings.stripeEnabled && isStripeKeyConfigured(),
    mbwayEnabled: paymentSettings.mbwayEnabled,
    transferEnabled: paymentSettings.transferEnabled,
    cashEnabled: paymentSettings.cashEnabled,
    mbwayNumber: paymentSettings.mbwayNumber,
    transferRecipient: paymentSettings.transferRecipient,
    transferIban: paymentSettings.transferIban,
    transferBank: paymentSettings.transferBank,
    transferInstructions: paymentSettings.transferInstructions,
  };
}

function sanitizeProducts(products: StoreProduct[]) {
  return [...products].sort((first, second) => first.name.localeCompare(second.name, 'pt'));
}

function calculateOrderItems(items: unknown, catalog: StoreProduct[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty.');
  }

  const normalizedItems = items.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid order item.');
    }

    const payload = item as Record<string, unknown>;
    const productId = parseStringField(payload.productId, 'order item productId');
    const quantityValue = typeof payload.quantity === 'number' ? payload.quantity : Number(payload.quantity);

    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      throw new Error('Invalid order item quantity.');
    }

    const product = catalog.find((catalogItem) => catalogItem.id === productId && catalogItem.active);
    if (!product) {
      throw new Error(`Product ${productId} is unavailable.`);
    }

    const quantity = Math.round(quantityValue * 1000) / 1000;
    const selectedUnit = typeof payload.selectedUnit === 'string' && payload.selectedUnit.trim().length > 0
      ? payload.selectedUnit.trim()
      : product.unit;

    // Venda à unidade com preço calculado pelo peso médio: quando um produto a
    // kg é comprado à unidade (selectedUnit === 'un') e tem peso médio definido,
    // o preço por unidade é price_kg × (peso_medio_gramas / 1000). O servidor é
    // a fonte de verdade do preço — ignora qualquer valor enviado pelo cliente.
    const soldByUnit = product.unit.trim().toLowerCase() === 'kg'
      && selectedUnit.trim().toLowerCase() === 'un'
      && typeof product.approxWeightGrams === 'number'
      && product.approxWeightGrams > 0;
    const unitPrice = soldByUnit
      ? Math.round(product.price * (product.approxWeightGrams! / 1000) * 100) / 100
      : product.price;
    const lineTotal = Math.round(unitPrice * quantity * 100) / 100;

    let name = product.name;
    if (typeof payload.variant === 'string') {
      const variant = payload.variant.trim();
      if (variant && variant.length <= MAX_VARIANT_LENGTH) {
        const match = (product.variants ?? []).find((cand) => cand.toLowerCase() === variant.toLowerCase());
        if (match) name = `${product.name} (${match})`;
      }
    }

    const orderItem: OrderItem = {
      productId: product.id,
      name,
      image: product.image,
      unit: product.unit,
      selectedUnit,
      quantity,
      unitPrice,
      lineTotal,
    };

    return orderItem;
  });

  const subtotal = normalizedItems.reduce((total, item) => total + item.lineTotal, 0);

  return {
    items: normalizedItems,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}

function parseCustomer(input: unknown): CustomerDetails {
  if (!input || typeof input !== 'object') {
    throw new Error('Customer details are required.');
  }

  const payload = input as Record<string, unknown>;
  const deliveryDayRaw = typeof payload.deliveryDay === 'string' ? payload.deliveryDay.toLowerCase().trim() : '';
  const deliveryDay = deliveryDayRaw === 'quinta' || deliveryDayRaw === 'sexta' ? deliveryDayRaw : undefined;
  return {
    name: parseStringField(payload.name, 'customer name'),
    phone: parseStringField(payload.phone, 'customer phone'),
    address: parseStringField(payload.address, 'customer address'),
    postalCode: parseStringField(payload.postalCode, 'customer postal code'),
    deliveryDay,
  };
}

function resolveCheckoutStatuses(paymentMethod: PaymentMethod): { orderStatus: OrderStatus; paymentStatus: PaymentStatus } {
  switch (paymentMethod) {
    case 'stripe':
      return { orderStatus: 'awaiting_payment', paymentStatus: 'awaiting_payment' };
    case 'transferencia':
      return { orderStatus: 'awaiting_transfer', paymentStatus: 'awaiting_transfer' };
    case 'dinheiro':
      return { orderStatus: 'confirmed', paymentStatus: 'cash_on_delivery' };
    case 'mbway':
    default:
      return { orderStatus: 'awaiting_payment', paymentStatus: 'pending' };
  }
}

function ensurePaymentMethodEnabled(paymentMethod: PaymentMethod, settings: PaymentSettings) {
  if (paymentMethod === 'stripe' && !settings.stripeEnabled) {
    throw new Error('Card payments are disabled.');
  }
  if (paymentMethod === 'mbway' && !settings.mbwayEnabled) {
    throw new Error('MBWay is disabled.');
  }
  if (paymentMethod === 'transferencia' && !settings.transferEnabled) {
    throw new Error('Bank transfer is disabled.');
  }
  if (paymentMethod === 'dinheiro' && !settings.cashEnabled) {
    throw new Error('Cash payments are disabled.');
  }
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PLACEHOLDER_KEYWORD_EMOJI: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(alface|rúcula|rucula|espinafre|grelo|nabiça|nabica|lombardo|coração|coracao|couve(?!\s*flor)|aromática|aromatica|salsa|coentro|hortelã|hortela)\b/i, '🥬'],
  [/\bcouve\s*flor\b/i, '🥦'],
  [/\bbatata\s*doce\b/i, '🍠'],
  [/\bbatat/i, '🥔'],
  [/\bbrócol|brocol/i, '🥦'],
  [/\bcebola\b/i, '🧅'],
  [/\bcenoura/i, '🥕'],
  [/\b(alho|nabo)\b/i, '🧄'],
  [/\b(curgete|pepino|xuxu|chuchu)\b/i, '🥒'],
  [/\b(feijão|feijao|ervilha|fava|grão|grao)\b/i, '🫘'],
  [/\blimão|limao\b/i, '🍋'],
  [/\b(pimento|pimentão|pimentao)\b/i, '🫑'],
  [/\btomate/i, '🍅'],
  [/\b(azeitona|tremoço|tremoco|azeite)\b/i, '🫒'],
  [/\babacate/i, '🥑'],
  [/\b(abacaxi|ananás|ananas)\b/i, '🍍'],
  [/\bbanana/i, '🍌'],
  [/\b(clementina|laranja|tangerina)\b/i, '🍊'],
  [/\bkiwi\b/i, '🥝'],
  [/\b(manga|maracujá|maracuja)\b/i, '🥭'],
  [/\buva/i, '🍇'],
  [/\bmaçã|maca\b/i, '🍎'],
  [/\bpêra|pera\b/i, '🍐'],
  [/\bmorango/i, '🍓'],
  [/\b(framboesa|mirtilo|amora)\b/i, '🫐'],
  [/\bmelancia/i, '🍉'],
  [/\b(meloa|melão|melao)\b/i, '🍈'],
  [/\bnêspera|nespera|pêssego|pessego/i, '🍑'],
  [/\bcereja/i, '🍒'],
  [/\bfigo/i, '🍑'],
  [/\bsopa/i, '🍲'],
];

const PLACEHOLDER_CATEGORY_EMOJI: Record<string, string> = {
  fruta: '🍎',
  legume: '🥦',
  sopa: '🍲',
  outros: '✨',
};

function getPlaceholderEmoji(label: string, category?: string) {
  const text = (label || '').trim();
  if (text) {
    for (const [pattern, emoji] of PLACEHOLDER_KEYWORD_EMOJI) {
      if (pattern.test(text)) {
        return emoji;
      }
    }
  }
  if (category && PLACEHOLDER_CATEGORY_EMOJI[category]) {
    return PLACEHOLDER_CATEGORY_EMOJI[category];
  }
  return '🧺';
}

function buildImagePlaceholderSvg(label: string, category?: string) {
  const safeLabel = escapeSvgText(label.trim().slice(0, 28) || 'Frutaria em Casa');
  const emoji = escapeSvgText(getPlaceholderEmoji(label, category));

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff2d8"/>
          <stop offset="100%" stop-color="#ffe3bf"/>
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="36" fill="url(#bg)"/>
      <circle cx="85" cy="86" r="42" fill="#ff6b00" opacity="0.16"/>
      <circle cx="264" cy="248" r="58" fill="#2ecc71" opacity="0.14"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="140">${emoji}</text>
      <text x="50%" y="82%" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="22" font-weight="700" fill="#7a3d00">${safeLabel}</text>
      <text x="50%" y="92%" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="3" fill="#ff6b00">FRUTARIA EM CASA</text>
    </svg>
  `.trim();
}

function sendPlaceholderImage(res: Response, label: string, category?: string) {
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(buildImagePlaceholderSvg(label, category));
}

function parseProxiedImageUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Missing image URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid image URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Invalid image URL protocol.');
  }

  if (!PROXIED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Image host is not allowed.');
  }

  return parsed.toString();
}

let mailTransporter: Transporter | null = null;
let mailTransporterInitialised = false;
let mailTransporterWarningShown = false;

function getMailTransporter(): Transporter | null {
  if (mailTransporterInitialised) {
    return mailTransporter;
  }
  mailTransporterInitialised = true;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass) {
    if (!mailTransporterWarningShown) {
      console.warn('[mail] SMTP_HOST/SMTP_USER/SMTP_PASS não configurados; notificações de pedidos por email desativadas.');
      mailTransporterWarningShown = true;
    }
    return null;
  }

  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return mailTransporter;
}

function formatEur(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatOrderDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Lisbon',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function paymentMethodLabel(method: PaymentMethod) {
  switch (method) {
    case 'mbway': return 'MBWay';
    case 'transferencia': return 'Transferência bancária';
    case 'dinheiro': return 'Dinheiro à entrega';
    case 'stripe': return 'Cartão (Stripe)';
    default: return method;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOrderEmail(order: OrderRecord) {
  const createdAtLabel = formatOrderDateTime(order.createdAt);
  const itemsText = order.items
    .map((item) => `- ${item.name} — ${item.quantity} ${item.selectedUnit || item.unit} × ${formatEur(item.unitPrice)} = ${formatEur(item.lineTotal)}`)
    .join('\n');

  const itemsHtml = order.items
    .map((item) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${item.quantity} ${escapeHtml(item.selectedUnit || item.unit)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatEur(item.unitPrice)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatEur(item.lineTotal)}</td>
      </tr>
    `)
    .join('');

  const subject = `Novo pedido ${order.number} — ${order.customer.name} (${formatEur(order.total)})`;

  const text = [
    `Novo pedido recebido em ${createdAtLabel}.`,
    '',
    `Número: ${order.number}`,
    `Data/hora: ${createdAtLabel}`,
    `Pagamento: ${paymentMethodLabel(order.paymentMethod)} (${order.paymentStatus})`,
    `Estado: ${order.orderStatus}`,
    '',
    'Cliente:',
    `  Nome: ${order.customer.name}`,
    `  Telefone: ${order.customer.phone}`,
    `  Morada: ${order.customer.address}`,
    `  Código postal: ${order.customer.postalCode}`,
    '',
    'Itens:',
    itemsText,
    '',
    `Subtotal: ${formatEur(order.subtotal)}`,
    `Total: ${formatEur(order.total)}`,
    order.customerNote ? `\nObservação do cliente: ${order.customerNote}` : '',
    order.notes ? `\nNotas: ${order.notes}` : '',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;">
      <h2 style="color:#ff6b00;margin-bottom:4px;">Novo pedido ${escapeHtml(order.number)}</h2>
      <p style="margin-top:0;color:#555;">${escapeHtml(createdAtLabel)}</p>

      <h3 style="margin-bottom:4px;">Cliente</h3>
      <p style="margin:0;">
        <strong>${escapeHtml(order.customer.name)}</strong><br>
        Telefone: ${escapeHtml(order.customer.phone)}<br>
        Morada: ${escapeHtml(order.customer.address)}<br>
        Código postal: ${escapeHtml(order.customer.postalCode)}
      </p>

      <h3 style="margin-bottom:4px;">Pagamento</h3>
      <p style="margin:0;">
        Método: ${escapeHtml(paymentMethodLabel(order.paymentMethod))}<br>
        Estado de pagamento: ${escapeHtml(order.paymentStatus)}<br>
        Estado do pedido: ${escapeHtml(order.orderStatus)}
      </p>

      <h3 style="margin-bottom:4px;">Itens</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#fff2d8;">
            <th style="padding:6px 8px;text-align:left;">Produto</th>
            <th style="padding:6px 8px;text-align:right;">Qtd.</th>
            <th style="padding:6px 8px;text-align:right;">Preço</th>
            <th style="padding:6px 8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:6px 8px;text-align:right;"><strong>Subtotal</strong></td>
            <td style="padding:6px 8px;text-align:right;">${formatEur(order.subtotal)}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:6px 8px;text-align:right;"><strong>Total</strong></td>
            <td style="padding:6px 8px;text-align:right;"><strong>${formatEur(order.total)}</strong></td>
          </tr>
        </tfoot>
      </table>

      ${order.customerNote ? `<h3 style="margin-bottom:4px;">Observação do cliente</h3><p style="margin:0;padding:12px 14px;background:#fff7ec;border-radius:12px;border-left:4px solid #ff6b00;">${escapeHtml(order.customerNote)}</p>` : ''}
      ${order.notes ? `<h3 style="margin-bottom:4px;">Notas</h3><p style="margin:0;">${escapeHtml(order.notes)}</p>` : ''}
    </div>
  `;

  return { subject, text, html };
}

async function sendAdminLoginNotificationEmail(req: Request) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return;
  }

  try {
    const ip = (req.ip || req.socket.remoteAddress || 'desconhecido').toString();
    const ua = (req.header('user-agent') || 'desconhecido').toString();
    const when = formatOrderDateTime(nowIso());
    const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || ADMIN_NOTIFICATION_EMAIL;
    const subject = `\u26a0\ufe0f Voc\u00ea entrou no back office \u2014 ${when}`;
    const text = [
      'Olá!',
      '',
      'Acabou de ser iniciada uma sessão de back office na Frutaria em Casa.',
      '',
      `Data/hora: ${when}`,
      `Endereço IP: ${ip}`,
      `Navegador: ${ua}`,
      '',
      'Se foi você, pode ignorar esta mensagem.',
      'Se NÃO foi você, mude já a senha do back office (variável ADMIN_PASSCODE) e a App Password do Gmail.',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;">
        <h2 style="color:#ff6b00;margin-bottom:4px;">Você entrou no back office</h2>
        <p style="margin-top:0;color:#555;">${escapeHtml(when)}</p>
        <p>Foi iniciada uma sessão administrativa na Frutaria em Casa.</p>
        <table style="border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:4px 8px;color:#888;">IP</td><td style="padding:4px 8px;"><strong>${escapeHtml(ip)}</strong></td></tr>
          <tr><td style="padding:4px 8px;color:#888;">Navegador</td><td style="padding:4px 8px;">${escapeHtml(ua)}</td></tr>
        </table>
        <p style="margin-top:16px;">Se foi você, pode ignorar esta mensagem.<br>Se <strong>não foi você</strong>, mude imediatamente a senha do back office.</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error('[mail] Falha ao enviar aviso de login admin:', error instanceof Error ? error.message : error);
  }
}

async function sendOrderNotificationEmail(order: OrderRecord, context: 'created' | 'updated' = 'created') {
  const transporter = getMailTransporter();
  if (!transporter) {
    return;
  }

  try {
    const { subject, text, html } = buildOrderEmail(order);
    const prefix = context === 'updated' ? '[Atualização] ' : '';
    const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || ORDER_NOTIFICATION_EMAIL;

    await transporter.sendMail({
      from,
      to: ORDER_NOTIFICATION_EMAIL,
      subject: prefix + subject,
      text,
      html,
    });
  } catch (error) {
    console.error('[mail] Falha ao enviar notificação de pedido:', error instanceof Error ? error.message : error);
  }
}

function isInvalidJsonBodyError(error: unknown): error is SyntaxError & { status: number; body: unknown } {
  return error instanceof SyntaxError
    && typeof error === 'object'
    && error !== null
    && 'status' in error
    && (error as { status?: unknown }).status === 400
    && 'body' in error;
}

function normalizeHost(value: string | undefined | null) {
  return (value || '').trim().toLowerCase().replace(/:\d+$/, '');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Suporte opcional a 2 domínios: PUBLIC_HOST (loja) e ADMIN_HOST (back-office).
  // Quando ambos estiverem definidos, o back-office só responde no ADMIN_HOST.
  const PUBLIC_HOST = normalizeHost(process.env.PUBLIC_HOST);
  const ADMIN_HOST = normalizeHost(process.env.ADMIN_HOST);
  const dualDomainEnabled = Boolean(PUBLIC_HOST && ADMIN_HOST && PUBLIC_HOST !== ADMIN_HOST);

  if (dualDomainEnabled) {
    console.log(`[hosts] dual-domain mode active — public=${PUBLIC_HOST} admin=${ADMIN_HOST}`);
    app.use((req, res, next) => {
      const hostname = normalizeHost(req.hostname);
      const isAdminPath = req.path === '/admin' || req.path.startsWith('/admin/') || req.path.startsWith('/api/admin');

      if (isAdminPath && hostname !== ADMIN_HOST) {
        // Esconder por completo o back-office em qualquer outro host.
        return res.status(404).send('Not Found');
      }

      if (!isAdminPath && hostname === ADMIN_HOST) {
        // No domínio admin só existe back-office; loja redireciona para o domínio público.
        const protocol = isProductionEnvironment() ? 'https' : req.protocol;
        return res.redirect(301, `${protocol}://${PUBLIC_HOST}${req.originalUrl}`);
      }

      return next();
    });
  }

  // CSP estrita para as rotas /admin e /api/admin (mitiga XSS e clickjacking).
  app.use((req, res, next) => {
    if (req.path === '/admin' || req.path.startsWith('/admin/') || req.path.startsWith('/api/admin')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });

  let stripeClient: Stripe | null = null;
  function getStripe() {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        console.warn('STRIPE_SECRET_KEY not found in environment');
        return null;
      }
      stripeClient = new Stripe(key);
    }
    return stripeClient;
  }

  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (isProductionEnvironment()) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use('/api/admin', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (isInvalidJsonBodyError(error)) {
      return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    return next(error);
  });

  app.post('/api/admin/login', async (req, res) => {
    try {
      const clientKey = getAdminLoginClientKey(req);
      const currentAttemptState = getAdminLoginAttemptState(clientKey);

      if (currentAttemptState && currentAttemptState.blockedUntil > Date.now()) {
        return sendAdminLoginRateLimitedResponse(res, currentAttemptState);
      }

      const email = parseStringField(req.body?.email, 'admin email').toLowerCase();
      const passcode = parseStringField(req.body?.passcode, 'admin passcode');
      const adminPasscode = getAdminPasscode();
      const adminEmail = getAdminEmail();

      if (!adminPasscode || !adminEmail) {
        return res.status(503).json({ error: 'Login de administrador não está configurado.' });
      }

      // Comparações em tempo constante para ambos os campos (mitiga timing attacks
      // que possam revelar se o email existe).
      const emailOk = timingSafeStringEqual(email, adminEmail);
      const passOk = timingSafeStringEqual(passcode, adminPasscode);

      if (!emailOk || !passOk) {
        const failedAttemptState = registerFailedAdminLogin(clientKey);
        if (failedAttemptState.blockedUntil > Date.now()) {
          return sendAdminLoginRateLimitedResponse(res, failedAttemptState);
        }
        return res.status(401).json({ error: 'Email ou senha de administrador inválidos.' });
      }

      clearAdminLoginAttempts(clientKey);
      cleanupExpiredSessions();
      const token = createAdminSessionToken();
      const now = Date.now();
      const expiresAt = now + TOKEN_TTL_MS;
      const csrfToken = createAdminCsrfToken();
      const fingerprint = computeSessionFingerprint(req);
      adminSessions.set(hashSessionToken(token), {
        expiresAt,
        csrfToken,
        fingerprint,
        createdAt: now,
        lastSeenAt: now,
      });

      res.cookie(ADMIN_SESSION_COOKIE_NAME, token, getAdminSessionCookieOptions());

      // Notificar por email que alguém entrou no back office (assíncrono).
      void sendAdminLoginNotificationEmail(req);

      res.json({ csrfToken, expiresAt });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível autenticar.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/logout', requireAdmin, requireAdminCsrf, (_req, res) => {
    const { adminSessionToken } = res.locals as { adminSessionToken?: string };
    clearAdminSession(res, adminSessionToken);
    res.json({ loggedOut: true });
  });

  // ----- Contas de cliente (loja) -----

  app.post('/api/account/register', async (req, res) => {
    try {
      const name = parseStringField(req.body?.name, 'account name');
      if (name.length > 80) {
        return res.status(400).json({ error: 'Nome demasiado longo.' });
      }
      const phone = normalizePhone(req.body?.phone);
      if (phone.length < 6 || phone.length > 20) {
        return res.status(400).json({ error: 'Indique um número de telemóvel válido.' });
      }
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
      if (rawPassword && rawPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
        return res.status(400).json({ error: `A palavra-passe deve ter pelo menos ${ACCOUNT_PASSWORD_MIN_LENGTH} caracteres.` });
      }
      if (rawPassword.length > 200) {
        return res.status(400).json({ error: 'Palavra-passe demasiado longa.' });
      }

      const store = await getStore();
      if (store.accounts.some((account) => account.phone === phone)) {
        return res.status(409).json({ error: 'Já existe uma conta com este telemóvel. Inicie sessão.' });
      }

      const now = nowIso();
      const account: AccountRecord = {
        id: crypto.randomUUID(),
        name,
        phone,
        passwordHash: rawPassword ? hashAccountPassword(rawPassword) : undefined,
        createdAt: now,
        updatedAt: now,
      };
      store.accounts.push(account);
      await persistStore(store);

      issueAccountSession(res, account.id);
      res.json({ account: toPublicAccount(account) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível criar a conta.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/account/login', async (req, res) => {
    try {
      const clientKey = getAdminLoginClientKey(req);
      const currentAttemptState = getAccountLoginAttemptState(clientKey);
      if (currentAttemptState && currentAttemptState.blockedUntil > Date.now()) {
        const retryAfterSeconds = Math.max(1, Math.ceil((currentAttemptState.blockedUntil - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ error: `Demasiadas tentativas. Tente novamente em ${retryAfterSeconds} segundos.` });
      }

      const phone = normalizePhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({ error: 'Indique o seu telemóvel.' });
      }
      const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

      const store = await getStore();
      const account = store.accounts.find((candidate) => candidate.phone === phone);

      const rejectInvalid = () => {
        const failedState = registerFailedAccountLogin(clientKey);
        if (failedState.blockedUntil > Date.now()) {
          const retryAfterSeconds = Math.max(1, Math.ceil((failedState.blockedUntil - Date.now()) / 1000));
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return res.status(429).json({ error: `Demasiadas tentativas. Tente novamente em ${retryAfterSeconds} segundos.` });
        }
        return res.status(401).json({ error: 'Telemóvel ou palavra-passe inválidos.' });
      };

      if (!account) {
        return rejectInvalid();
      }
      if (account.passwordHash) {
        if (!rawPassword || !verifyAccountPassword(rawPassword, account.passwordHash)) {
          return rejectInvalid();
        }
      }

      clearAccountLoginAttempts(clientKey);
      issueAccountSession(res, account.id);
      res.json({ account: toPublicAccount(account) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar sessão.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/account/logout', (req, res) => {
    const token = getAccountSessionTokenFromRequest(req);
    clearAccountSession(res, token);
    res.json({ loggedOut: true });
  });

  app.get('/api/account/me', requireAccount, async (_req, res) => {
    const { accountSession, accountSessionToken } = res.locals as { accountSession?: AccountSessionState; accountSessionToken?: string };
    const store = await getStore();
    const account = store.accounts.find((candidate) => candidate.id === accountSession?.accountId);
    if (!account) {
      clearAccountSession(res, accountSessionToken);
      return res.status(401).json({ error: 'Conta não encontrada.' });
    }
    const orders = store.orders
      .filter((order) => normalizePhone(order.customer.phone) === account.phone)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json({ account: toPublicAccount(account), orders });
  });

  app.get('/api/catalog', async (_req, res) => {
    const store = await getStore();
    res.json({ products: sanitizeProducts(store.products.filter((product) => product.active)) });
  });

  app.get('/api/storefront-config', async (_req, res) => {
    const store = await getStore();
    res.json({ paymentSettings: getPublicPaymentSettings(store.paymentSettings) });
  });

  app.get('/api/image-proxy', async (req, res) => {
    const fallbackLabel = typeof req.query.label === 'string' ? req.query.label : 'Frutaria em Casa';
    const fallbackCategory = typeof req.query.category === 'string' ? req.query.category : undefined;

    try {
      const imageUrl = parseProxiedImageUrl(req.query.url);
      const upstreamResponse = await fetch(imageUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!upstreamResponse.ok) {
        return sendPlaceholderImage(res, fallbackLabel, fallbackCategory);
      }

      const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return sendPlaceholderImage(res, fallbackLabel, fallbackCategory);
      }

      const contentLength = upstreamResponse.headers.get('content-length');
      const cacheControl = upstreamResponse.headers.get('cache-control');
      const etag = upstreamResponse.headers.get('etag');
      const lastModified = upstreamResponse.headers.get('last-modified');
      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', cacheControl || 'public, max-age=86400');

      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      if (etag) {
        res.setHeader('ETag', etag);
      }
      if (lastModified) {
        res.setHeader('Last-Modified', lastModified);
      }

      return res.send(buffer);
    } catch {
      return sendPlaceholderImage(res, fallbackLabel, fallbackCategory);
    }
  });

  app.post('/api/checkout', async (req, res) => {
    try {
      const paymentMethod = req.body?.paymentMethod;
      if (typeof paymentMethod !== 'string' || !allowedPaymentMethods.has(paymentMethod as PaymentMethod)) {
        return res.status(400).json({ error: 'Invalid payment method.' });
      }

      const store = await getStore();
      ensurePaymentMethodEnabled(paymentMethod as PaymentMethod, store.paymentSettings);

      const customer = parseCustomer(req.body?.customer);
      const { items, subtotal } = calculateOrderItems(req.body?.items, store.products);
      const { orderStatus, paymentStatus } = resolveCheckoutStatuses(paymentMethod as PaymentMethod);
      const createdAt = nowIso();
      const order: OrderRecord = {
        id: crypto.randomUUID(),
        number: nextOrderNumber(store),
        createdAt,
        updatedAt: createdAt,
        customer,
        items,
        subtotal,
        total: subtotal,
        currency: 'eur',
        paymentMethod: paymentMethod as PaymentMethod,
        paymentStatus,
        orderStatus,
        notes: parseOptionalString(req.body?.notes),
        customerNote: parseOptionalString(req.body?.customerNote) || undefined,
      };

      store.orders.unshift(order);

      if (paymentMethod === 'stripe') {
        const stripe = getStripe();

        if (!stripe) {
          return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }

        // Stripe rejeita PaymentIntents abaixo de 0,50€ em EUR. Validamos
        // antes da chamada para devolver uma mensagem clara em português.
        if (order.total < 0.5) {
          return res.status(400).json({
            error: 'O pagamento por cartão exige um valor mínimo de 0,50€. Escolha MBWay, transferência ou dinheiro para totais inferiores.',
          });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(order.total * 100),
          currency: order.currency,
          automatic_payment_methods: { enabled: true },
          metadata: {
            orderId: order.id,
            orderNumber: order.number,
            customerName: order.customer.name,
          },
        });

        order.paymentReference = paymentIntent.id;
        order.updatedAt = nowIso();
        store.payments.unshift({
          id: crypto.randomUUID(),
          orderId: order.id,
          method: 'stripe',
          amount: order.total,
          status: paymentIntent.status,
          createdAt,
          updatedAt: nowIso(),
          externalReference: paymentIntent.id,
        });

        await persistStore(store);
        void sendOrderNotificationEmail(order, 'created');

        return res.json({
          order,
          clientSecret: paymentIntent.client_secret,
          paymentSettings: getPublicPaymentSettings(store.paymentSettings),
        });
      }

      store.payments.unshift({
        id: crypto.randomUUID(),
        orderId: order.id,
        method: paymentMethod as PaymentMethod,
        amount: order.total,
        status: paymentStatus,
        createdAt,
        updatedAt: createdAt,
        externalReference: paymentMethod === 'mbway' ? store.paymentSettings.mbwayNumber : undefined,
      });

      await persistStore(store);
      void sendOrderNotificationEmail(order, 'created');

      res.json({
        order,
        paymentSettings: getPublicPaymentSettings(store.paymentSettings),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to process checkout.';
      console.error('Checkout Error:', message);
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/checkout/stripe/confirm', async (req, res) => {
    try {
      const orderId = parseStringField(req.body?.orderId, 'orderId');
      const paymentIntentId = parseStringField(req.body?.paymentIntentId, 'paymentIntentId');
      const stripe = getStripe();

      if (!stripe) {
        return res.status(500).json({ error: 'Stripe is not configured on the server.' });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const store = await getStore();
      const order = store.orders.find((item) => item.id === orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const paymentRecord = store.payments.find((payment) => payment.externalReference === paymentIntentId);
      const updatedAt = nowIso();

      if (paymentIntent.status === 'succeeded') {
        order.paymentStatus = 'paid';
        order.orderStatus = order.orderStatus === 'cancelled' ? 'cancelled' : 'confirmed';
      } else if (paymentIntent.status === 'processing') {
        order.paymentStatus = 'pending';
      } else if (paymentIntent.status === 'canceled') {
        order.paymentStatus = 'cancelled';
        order.orderStatus = 'cancelled';
      } else {
        order.paymentStatus = 'failed';
      }

      order.paymentReference = paymentIntent.id;
      order.updatedAt = updatedAt;

      if (paymentRecord) {
        paymentRecord.status = paymentIntent.status;
        paymentRecord.updatedAt = updatedAt;
      }

      await persistStore(store);
      void sendOrderNotificationEmail(order, 'updated');
      res.json({ order, paymentStatus: paymentIntent.status });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to confirm Stripe payment.';
      console.error('Stripe confirm error:', message);
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/admin/bootstrap', requireAdmin, async (_req, res) => {
    const { adminSession } = res.locals as { adminSession: AdminSessionState };
    const store = await getStore();
    res.json({
      csrfToken: adminSession.csrfToken,
      dashboard: buildDashboard(store),
      products: sanitizeProducts(store.products),
      orders: [...store.orders].sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      payments: [...store.payments].sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      paymentSettings: store.paymentSettings,
    });
  });

  app.post('/api/admin/products', requireAdmin, requireAdminCsrf, async (req, res) => {
    try {
      const store = await getStore();
      const product = parseProductInput(req.body);
      store.products.unshift(product);
      await persistStore(store);
      res.status(201).json({ product });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to create product.';
      res.status(400).json({ error: message });
    }
  });

  app.put('/api/admin/products/:id', requireAdmin, requireAdminCsrf, async (req, res) => {
    try {
      const store = await getStore();
      const productIndex = store.products.findIndex((product) => product.id === req.params.id);

      if (productIndex === -1) {
        return res.status(404).json({ error: 'Product not found.' });
      }

      const updatedProduct = parseProductInput(req.body, store.products[productIndex]);
      store.products[productIndex] = updatedProduct;
      await persistStore(store);

      res.json({ product: updatedProduct });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update product.';
      res.status(400).json({ error: message });
    }
  });

  app.delete('/api/admin/products/:id', requireAdmin, requireAdminCsrf, async (req, res) => {
    const store = await getStore();
    const product = store.products.find((item) => item.id === req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const isReferenced = store.orders.some((order) => order.items.some((item) => item.productId === product.id));

    if (isReferenced) {
      product.active = false;
      product.updatedAt = nowIso();
      await persistStore(store);
      return res.json({ product, archived: true });
    }

    store.products = store.products.filter((item) => item.id !== product.id);
    await persistStore(store);
    res.json({ deleted: true });
  });

  app.patch('/api/admin/orders/:id', requireAdmin, requireAdminCsrf, async (req, res) => {
    try {
      const store = await getStore();
      const order = store.orders.find((item) => item.id === req.params.id);

      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const { orderStatus, paymentStatus, notes } = req.body || {};

      if (typeof orderStatus === 'string') {
        if (!allowedOrderStatuses.has(orderStatus as OrderStatus)) {
          return res.status(400).json({ error: 'Invalid order status.' });
        }
        order.orderStatus = orderStatus as OrderStatus;
      }

      if (typeof paymentStatus === 'string') {
        if (!allowedPaymentStatuses.has(paymentStatus as PaymentStatus)) {
          return res.status(400).json({ error: 'Invalid payment status.' });
        }
        order.paymentStatus = paymentStatus as PaymentStatus;
      }

      if (typeof notes === 'string') {
        order.notes = notes.trim();
      }

      order.updatedAt = nowIso();

      const paymentRecord = store.payments.find((item) => item.orderId === order.id);
      if (paymentRecord) {
        paymentRecord.status = order.paymentStatus;
        paymentRecord.updatedAt = order.updatedAt;
        if (typeof notes === 'string') {
          paymentRecord.note = order.notes;
        }
      }

      await persistStore(store);
      res.json({ order });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update order.';
      res.status(400).json({ error: message });
    }
  });

  app.put('/api/admin/payment-settings', requireAdmin, requireAdminCsrf, async (req, res) => {
    try {
      const store = await getStore();
      const payload = req.body || {};
      store.paymentSettings = {
        stripeEnabled: parseBooleanField(payload.stripeEnabled, store.paymentSettings.stripeEnabled),
        mbwayEnabled: parseBooleanField(payload.mbwayEnabled, store.paymentSettings.mbwayEnabled),
        transferEnabled: parseBooleanField(payload.transferEnabled, store.paymentSettings.transferEnabled),
        cashEnabled: parseBooleanField(payload.cashEnabled, store.paymentSettings.cashEnabled),
        mbwayNumber: parseStringField(payload.mbwayNumber, 'MBWay number'),
        transferRecipient: parseStringField(payload.transferRecipient, 'transfer recipient'),
        transferIban: parseStringField(payload.transferIban, 'transfer IBAN'),
        transferBank: parseStringField(payload.transferBank, 'transfer bank'),
        transferInstructions: parseStringField(payload.transferInstructions, 'transfer instructions'),
        updatedAt: nowIso(),
      };

      await persistStore(store);
      res.json({ paymentSettings: store.paymentSettings });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update payment settings.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', now: nowIso() });
  });

  app.get('/media/familia-frutaria.jpeg', (_req, res) => {
    res.sendFile(FAMILY_PHOTO_FILE);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
