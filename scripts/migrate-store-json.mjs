/**
 * Gera um ficheiro SQL com INSERTs para a base D1 a partir do data/store.json.
 *
 * Uso:
 *   node scripts/migrate-store-json.mjs            # gera ./migrations/0002_seed.sql
 *   wrangler d1 execute frutaria --remote --file=./migrations/0002_seed.sql
 *
 * Idempotente: faz INSERT OR REPLACE para os produtos e payment_settings,
 * e INSERT OR IGNORE para encomendas/pagamentos (não duplica pelo id).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STORE_FILE = resolve(ROOT, 'data', 'store.json');
const OUT_FILE = resolve(ROOT, 'migrations', '0002_seed.sql');

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const raw = readFileSync(STORE_FILE, 'utf-8');
const store = JSON.parse(raw);

const lines = [
  '-- Seed gerado a partir de data/store.json',
  '',
];

// --- payment_settings (UPSERT singleton)
const s = store.paymentSettings || {};
lines.push('-- payment_settings');
lines.push(`UPDATE payment_settings SET
  stripe_enabled=${q(!!s.stripeEnabled)},
  mbway_enabled=${q(!!s.mbwayEnabled)},
  transfer_enabled=${q(!!s.transferEnabled)},
  cash_enabled=${q(!!s.cashEnabled)},
  mbway_number=${q(s.mbwayNumber || '')},
  transfer_recipient=${q(s.transferRecipient || '')},
  transfer_iban=${q(s.transferIban || '')},
  transfer_bank=${q(s.transferBank || '')},
  transfer_instructions=${q(s.transferInstructions || '')},
  updated_at=${q(s.updatedAt || new Date().toISOString())}
WHERE id=1;`);
lines.push('');

// --- stats (last_order_sequence)
const lastSeq = Number(store.lastOrderSequence || 1000);
lines.push(`UPDATE stats SET last_order_sequence=${lastSeq} WHERE id=1;`);
lines.push('');

// --- produtos
lines.push('-- products');
for (const p of store.products || []) {
  lines.push(`INSERT OR REPLACE INTO products (
    id, name, price, unit, category, image, description, active, created_at, updated_at
  ) VALUES (
    ${q(p.id)}, ${q(p.name)}, ${q(p.price)}, ${q(p.unit)}, ${q(p.category)},
    ${q((p.image || '').startsWith('data:') ? '' : p.image)}, ${q(p.description || '')}, ${q(!!p.active)},
    ${q(p.createdAt || new Date().toISOString())}, ${q(p.updatedAt || new Date().toISOString())}
  );`);
}
lines.push('');

// --- encomendas
lines.push('-- orders');
for (const o of store.orders || []) {
  lines.push(`INSERT OR IGNORE INTO orders (
    id, number, created_at, updated_at,
    customer_name, customer_phone, customer_address, customer_postal_code,
    items_json, subtotal, total, currency,
    payment_method, payment_status, order_status, payment_reference, notes
  ) VALUES (
    ${q(o.id)}, ${q(o.number)}, ${q(o.createdAt)}, ${q(o.updatedAt)},
    ${q(o.customer?.name)}, ${q(o.customer?.phone)}, ${q(o.customer?.address)}, ${q(o.customer?.postalCode)},
    ${q(JSON.stringify(o.items || []))}, ${q(o.subtotal)}, ${q(o.total)}, ${q(o.currency || 'eur')},
    ${q(o.paymentMethod)}, ${q(o.paymentStatus)}, ${q(o.orderStatus)},
    ${q(o.paymentReference || null)}, ${q(o.notes || null)}
  );`);
}
lines.push('');

// --- pagamentos
lines.push('-- payments');
for (const pay of store.payments || []) {
  lines.push(`INSERT OR IGNORE INTO payments (
    id, order_id, method, amount, status, created_at, updated_at, external_reference, note
  ) VALUES (
    ${q(pay.id)}, ${q(pay.orderId)}, ${q(pay.method)}, ${q(pay.amount)},
    ${q(pay.status)}, ${q(pay.createdAt)}, ${q(pay.updatedAt)},
    ${q(pay.externalReference || null)}, ${q(pay.note || null)}
  );`);
}
lines.push('');
// (D1 gere transações automaticamente — não usar BEGIN/COMMIT)

writeFileSync(OUT_FILE, lines.join('\n'), 'utf-8');
console.log(`OK — ${OUT_FILE}`);
console.log(`Produtos: ${store.products?.length || 0}  Encomendas: ${store.orders?.length || 0}  Pagamentos: ${store.payments?.length || 0}`);
console.log('\nPara aplicar no D1 (remoto):');
console.log('  npx wrangler d1 execute frutaria --remote --file=./migrations/0002_seed.sql');
console.log('Para aplicar no D1 local (dev):');
console.log('  npx wrangler d1 execute frutaria --local --file=./migrations/0002_seed.sql');
