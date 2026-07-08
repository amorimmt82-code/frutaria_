/**
 * Helpers puros (sem dependências de runtime) usados pelo Worker.
 * Mantém o SVG placeholder, o whitelist do image-proxy e os
 * templates de email idênticos aos do server.ts original.
 */

import type { Order, PaymentMethod } from '../types';

// ----- Image placeholder (idêntico ao server.ts) -----

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
      if (pattern.test(text)) return emoji;
    }
  }
  if (category && PLACEHOLDER_CATEGORY_EMOJI[category]) return PLACEHOLDER_CATEGORY_EMOJI[category];
  return '🧺';
}

export function buildImagePlaceholderSvg(label: string, category?: string) {
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

export function parseProxiedImageUrl(value: unknown, allowedHosts: Set<string>): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Missing image URL.');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Invalid image URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid image URL protocol.');
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) throw new Error('Image host is not allowed.');
  return parsed.toString();
}

// ----- Email helpers -----

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatEur(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function formatOrderDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon',
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

export function buildOrderEmailParts(order: Order, siteUrl = 'https://frutaria-em-casa.frutaria.workers.dev') {
  const createdAtLabel = formatOrderDateTime(order.createdAt);
  const deliveryDayLabel = order.customer.deliveryDay === 'quinta' ? 'Quinta-feira'
    : order.customer.deliveryDay === 'sexta' ? 'Sexta-feira' : 'A combinar';
  const itemsText = order.items
    .map((it) => `- ${it.name} — ${it.quantity} ${it.selectedUnit || it.unit} × ${formatEur(it.unitPrice)} = ${formatEur(it.lineTotal)}`)
    .join('\n');
  const itemsHtml = order.items
    .map((it) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #fde9d6;color:#3a2a1a;font-size:14px;font-weight:600;">${escapeHtml(it.name)}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #fde9d6;text-align:center;color:#6b7280;font-size:13px;">${it.quantity} ${escapeHtml(it.selectedUnit || it.unit)}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #fde9d6;text-align:right;color:#6b7280;font-size:13px;">${formatEur(it.unitPrice)}</td>
        <td style="padding:14px 16px;border-bottom:1px solid #fde9d6;text-align:right;color:#ff6b00;font-size:14px;font-weight:800;">${formatEur(it.lineTotal)}</td>
      </tr>`).join('');
  const subject = `🍎 Novo pedido ${order.number} — ${order.customer.name} (${formatEur(order.total)})`;
  const text = [
    `Novo pedido recebido em ${createdAtLabel}.`, '',
    `Número: ${order.number}`,
    `Data/hora: ${createdAtLabel}`,
    `Dia de entrega: ${deliveryDayLabel}`,
    `Pagamento: ${paymentMethodLabel(order.paymentMethod)} (${order.paymentStatus})`,
    `Estado: ${order.orderStatus}`, '',
    'Cliente:',
    `  Nome: ${order.customer.name}`,
    `  Telefone: ${order.customer.phone}`,
    `  Morada: ${order.customer.address}`,
    `  Código postal: ${order.customer.postalCode}`, '',
    'Itens:', itemsText, '',
    `Subtotal: ${formatEur(order.subtotal)}`,
    `Total: ${formatEur(order.total)}`,
    order.customerNote ? `\nObservação do cliente: ${order.customerNote}` : '',
    order.notes ? `\nNotas internas: ${order.notes}` : '',
  ].join('\n');
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff7ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fff7ec;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 24px rgba(255,107,0,0.08);">

        <!-- Header com logo e título -->
        <tr><td style="background:linear-gradient(135deg,#ff6b00 0%,#ff8c42 100%);padding:32px 32px 28px;text-align:center;">
          <img src="${siteUrl}/media/logo.png" alt="Frutaria em Casa" width="80" height="80" style="display:block;margin:0 auto 12px;border-radius:16px;background:#fff;padding:6px;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;font-style:italic;letter-spacing:-0.5px;">Frutaria em Casa</h1>
          <p style="margin:6px 0 0;color:#fff6e8;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Novo pedido recebido</p>
        </td></tr>

        <!-- Número de pedido grande -->
        <tr><td style="padding:32px 32px 8px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Pedido</p>
          <h2 style="margin:8px 0 4px;color:#ff6b00;font-size:36px;font-weight:900;font-style:italic;letter-spacing:-1px;">${escapeHtml(order.number)}</h2>
          <p style="margin:0;color:#6b7280;font-size:13px;font-weight:600;">${escapeHtml(createdAtLabel)}</p>
        </td></tr>

        <!-- Total em destaque -->
        <tr><td style="padding:8px 32px 24px;text-align:center;">
          <div style="display:inline-block;background:linear-gradient(135deg,#fff2d8 0%,#ffe4b8 100%);border-radius:20px;padding:16px 32px;">
            <p style="margin:0;color:#9a5b00;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Total a receber</p>
            <p style="margin:4px 0 0;color:#ff6b00;font-size:32px;font-weight:900;font-style:italic;">${formatEur(order.total)}</p>
          </div>
        </td></tr>

        <!-- Dia de entrega destacado -->
        <tr><td style="padding:0 32px 24px;">
          <div style="background:#e8f7ed;border-left:4px solid #1ea344;border-radius:12px;padding:16px 20px;">
            <p style="margin:0;color:#1ea344;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">📅 Dia de entrega</p>
            <p style="margin:4px 0 0;color:#0d5a26;font-size:18px;font-weight:900;">${escapeHtml(deliveryDayLabel)}</p>
          </div>
        </td></tr>

        <!-- Dados do cliente -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;color:#ff6b00;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">👤 Cliente</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fff7ec;border-radius:16px;padding:4px;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Nome</p>
              <p style="margin:0;color:#3a2a1a;font-size:16px;font-weight:800;">${escapeHtml(order.customer.name)}</p>
            </td></tr>
            <tr><td style="padding:14px 18px;border-top:1px solid #fde9d6;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Telemóvel</p>
              <p style="margin:0;color:#3a2a1a;font-size:15px;font-weight:700;"><a href="tel:${escapeHtml(order.customer.phone)}" style="color:#ff6b00;text-decoration:none;">${escapeHtml(order.customer.phone)}</a></p>
            </td></tr>
            <tr><td style="padding:14px 18px;border-top:1px solid #fde9d6;">
              <p style="margin:0 0 4px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">📍 Morada</p>
              <p style="margin:0;color:#3a2a1a;font-size:15px;font-weight:700;line-height:1.5;">${escapeHtml(order.customer.address)}<br><span style="color:#6b7280;font-size:13px;">${escapeHtml(order.customer.postalCode)}</span></p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Itens -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;color:#ff6b00;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">🧺 Itens do pedido</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background:#fff;border:1px solid #fde9d6;border-radius:16px;overflow:hidden;">
            <thead><tr style="background:#fff2d8;">
              <th style="padding:12px 16px;text-align:left;color:#9a5b00;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Produto</th>
              <th style="padding:12px 16px;text-align:center;color:#9a5b00;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Qtd.</th>
              <th style="padding:12px 16px;text-align:right;color:#9a5b00;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Unit.</th>
              <th style="padding:12px 16px;text-align:right;color:#9a5b00;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Total</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="background:#fff7ec;"><td colspan="3" style="padding:12px 16px;text-align:right;color:#6b7280;font-size:13px;font-weight:700;">Subtotal</td>
                <td style="padding:12px 16px;text-align:right;color:#3a2a1a;font-size:14px;font-weight:800;">${formatEur(order.subtotal)}</td></tr>
              <tr style="background:#ff6b00;"><td colspan="3" style="padding:14px 16px;text-align:right;color:#fff6e8;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Total</td>
                <td style="padding:14px 16px;text-align:right;color:#ffffff;font-size:18px;font-weight:900;">${formatEur(order.total)}</td></tr>
            </tfoot>
          </table>
        </td></tr>

        <!-- Pagamento -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;color:#ff6b00;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">💳 Pagamento</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fff7ec;border-radius:16px;">
            <tr>
              <td style="padding:14px 18px;width:50%;">
                <p style="margin:0 0 4px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Método</p>
                <p style="margin:0;color:#3a2a1a;font-size:15px;font-weight:800;">${escapeHtml(paymentMethodLabel(order.paymentMethod))}</p>
              </td>
              <td style="padding:14px 18px;width:50%;border-left:1px solid #fde9d6;">
                <p style="margin:0 0 4px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Estado</p>
                <p style="margin:0;color:#3a2a1a;font-size:15px;font-weight:800;">${escapeHtml(order.paymentStatus)}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${order.customerNote ? `<tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;color:#ff6b00;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">📝 Observação do cliente</h3>
          <div style="background:#fff7ec;border-radius:16px;padding:16px 18px;color:#3a2a1a;font-size:14px;font-weight:600;line-height:1.5;border-left:4px solid #ff6b00;">${escapeHtml(order.customerNote)}</div>
        </td></tr>` : ''}

        ${order.notes ? `<tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 12px;color:#ff6b00;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">🗂️ Notas internas</h3>
          <div style="background:#fff7ec;border-radius:16px;padding:16px 18px;color:#3a2a1a;font-size:14px;font-weight:600;line-height:1.5;">${escapeHtml(order.notes)}</div>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="background:#fff7ec;padding:24px 32px;text-align:center;border-top:1px solid #fde9d6;">
          <p style="margin:0;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Feito com 🧡 em Óbidos</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:11px;font-weight:600;">Frutaria em Casa — frescos e saborosos, diretos à sua porta</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

export function buildAdminLoginEmailParts(when: string, ip: string, ua: string) {
  const subject = `\u26a0\ufe0f Voc\u00ea entrou no back office \u2014 ${when}`;
  const text = [
    'Olá!', '',
    'Acabou de ser iniciada uma sessão de back office na Frutaria em Casa.', '',
    `Data/hora: ${when}`,
    `Endereço IP: ${ip}`,
    `Navegador: ${ua}`, '',
    'Se foi você, pode ignorar esta mensagem.',
    'Se NÃO foi você, mude já a senha do back office (ADMIN_PASSCODE) no Cloudflare.',
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
    </div>`;
  return { subject, text, html };
}
