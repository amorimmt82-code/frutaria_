// Mapeamento de palavras-chave do nome do produto para um emoji representativo.
// Usado nos placeholders SVG (cliente e servidor) para garantir que cada produto
// tem uma imagem visualmente identificável mesmo quando o URL remoto falha.

const KEYWORD_EMOJI: ReadonlyArray<readonly [RegExp, string]> = [
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

const CATEGORY_EMOJI: Record<string, string> = {
  fruta: '🍎',
  legume: '🥦',
  sopa: '🍲',
  outros: '✨',
};

export function getProductEmoji(label: string | undefined, category?: string): string {
  const text = (label || '').trim();
  if (text) {
    for (const [pattern, emoji] of KEYWORD_EMOJI) {
      if (pattern.test(text)) {
        return emoji;
      }
    }
  }
  if (category && CATEGORY_EMOJI[category]) {
    return CATEGORY_EMOJI[category];
  }
  return '🧺';
}
