// Teste rápido de envio de email pela Brevo (ex-Sendinblue).
//
// Como usar (PowerShell):
//   $env:BREVO_API_KEY = "cole-aqui-a-api-key-xkeysib-..."
//   node scripts/test-zeptomail.mjs
//
// Opcional:
//   $env:MAIL_FROM_ADDRESS = "notificacaofrutaria@gmail.com"
//   $env:MAIL_FROM_NAME = "Frutaria em Casa"
//   $env:MAIL_TO = "frutariaemcasa2021@gmail.com"

const apiKey = process.env.BREVO_API_KEY;
if (!apiKey) {
  console.error('❌ Falta a variável BREVO_API_KEY. Defina antes de correr o script.');
  process.exit(1);
}

const fromAddress = process.env.MAIL_FROM_ADDRESS || 'notificacaofrutaria@gmail.com';
const fromName = process.env.MAIL_FROM_NAME || 'Frutaria em Casa';
const toAddress = process.env.MAIL_TO || 'frutariaemcasa2021@gmail.com';

const body = {
  sender: { email: fromAddress, name: fromName },
  to: [{ email: toAddress, name: 'Frutaria em Casa' }],
  subject: '✅ Teste Brevo — Frutaria em Casa',
  textContent: 'Se está a ler isto, o envio de email pela Brevo está a funcionar.',
  htmlContent: '<div style="font-family:sans-serif;padding:24px;background:#fff7ec;border-radius:16px;"><h2 style="color:#ff6b00;margin:0 0 12px;">✅ Brevo OK</h2><p>Se está a ler isto, o envio de email pela Brevo está a funcionar.</p><p style="color:#6b7280;font-size:12px;margin-top:16px;">Remetente: ' + fromAddress + '<br>Destinatário: ' + toAddress + '</p></div>',
};

console.log('→ POST https://api.brevo.com/v3/smtp/email');
console.log(`   from: ${fromName} <${fromAddress}>`);
console.log(`   to:   ${toAddress}`);

try {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`\n← HTTP ${res.status} ${res.statusText}`);
  console.log(text);

  if (res.ok) {
    console.log('\n✅ Pedido aceite pela Brevo. Verifique a caixa de entrada (e Spam) de:', toAddress);
  } else {
    console.log('\n❌ Brevo rejeitou o pedido. Causas comuns:');
    console.log('   • API key inválida (gere outra em SMTP & API > API Keys).');
    console.log('   • Sender não verificado: confirme notificacaofrutaria@gmail.com em Senders & IP > Senders.');
    console.log('   • Limite diário (300/dia no plano gratuito) atingido.');
  }
} catch (e) {
  console.error('\n❌ Erro de rede:', e?.message || e);
}
