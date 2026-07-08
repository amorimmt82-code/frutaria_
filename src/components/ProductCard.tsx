import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { motion } from 'motion/react';
import { useState } from 'react';
import SmartImage from './SmartImage';
import UnitSelectModal from './UnitSelectModal';
import { effectiveUnitPrice, formatEuro, formatGrams, supportsUnitSale } from '../lib/pricing';

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const [weight, setWeight] = useState<string>('500');
  // Para produtos vendidos a kg sem peso médio, o cliente pode optar por
  // comprar "por unidade" (1 peça) com preço a confirmar à entrega. Quando há
  // peso médio configurado, a venda à unidade passa a ter preço calculado e é
  // feita através do modal de seleção (UnitSelectModal).
  const [mode, setMode] = useState<'kg' | 'un'>('kg');
  const [unitCount, setUnitCount] = useState<string>('1');
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);

  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;

  const isWeightBased = product.unit.trim().toLowerCase() === 'kg';
  const canSellByUnit = supportsUnitSale(product); // kg + peso médio definido
  const computedUnitPrice = effectiveUnitPrice(product);

  // O modal de seleção à unidade abre quando há variantes ou quando o produto
  // a kg pode ser vendido à unidade (preço calculado pelo peso médio).
  const showUnitModal = hasVariants || canSellByUnit;
  // Botão secundário ("À unidade") só para produtos a kg — os não-kg com
  // variantes usam o próprio botão "+" para abrir o modal.
  const showSecondaryModalButton = isWeightBased && showUnitModal;
  // Para não-kg com variantes, o "+" abre o modal (é preciso escolher variante).
  const plusOpensModal = !isWeightBased && hasVariants;

  // Toggle legado kg/un (preço a confirmar) só para produtos kg SEM peso médio.
  const allowLegacyUnToggle = isWeightBased && !canSellByUnit;
  const isUnitMode = allowLegacyUnToggle && mode === 'un';

  const hasApproxWeight = !isWeightBased && typeof product.approxWeightGrams === 'number' && product.approxWeightGrams > 0;
  const numericWeight = parseFloat(weight) || 0;
  const numericUnits = Math.max(1, parseInt(unitCount, 10) || 0);
  const quantity = isWeightBased
    ? (isUnitMode ? numericUnits : numericWeight / 1000)
    : 1;
  const displayWeight = numericWeight >= 1000
    ? `${(numericWeight / 1000).toFixed(numericWeight % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '')}kg`
    : `${weight || '0'}g`;
  const totalPrice = isWeightBased ? product.price * quantity : product.price;
  const approxWeightLabel = hasApproxWeight ? formatGrams(product.approxWeightGrams!) : '';
  const unitWeightLabel = canSellByUnit ? formatGrams(product.approxWeightGrams!) : '';

  return (
    <>
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white p-3 sm:p-6 juice-card relative group flex flex-col h-full"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl sm:rounded-[32px] mb-3 sm:mb-6 shadow-inner bg-pale-bg">
        <SmartImage
          src={product.image} 
          alt={product.name}
          fallbackLabel={product.name}
          fallbackCategory={product.category}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4">
          <span className="bg-white/90 backdrop-blur-md text-brand-primary text-[8px] sm:text-[10px] px-1.5 py-0.5 sm:px-3 sm:py-1.5 rounded-full font-black uppercase tracking-widest shadow-lg">
            {product.category}
          </span>
        </div>

        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col items-end gap-1">
          <div className="flex bg-white/90 backdrop-blur-md rounded-full px-2 py-1 sm:px-3 sm:py-2 shadow-lg overflow-hidden border border-brand-primary/10">
            <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-brand-primary">
              {isWeightBased
                ? (isUnitMode ? 'Preço por un.' : 'Preço por kg')
                : (hasApproxWeight ? `Embalagem ≈ ${approxWeightLabel}` : `Unidade ${product.unit}`)}
            </span>
          </div>
          {!isWeightBased && hasApproxWeight && (
            <div className="flex bg-emerald-50/95 backdrop-blur-md rounded-full px-2 py-0.5 sm:px-3 sm:py-1 shadow border border-emerald-200">
              <span className="text-[8px] sm:text-[10px] font-black tracking-wider text-emerald-700">
                {product.price.toFixed(2)}€ / {approxWeightLabel}
              </span>
            </div>
          )}
          {canSellByUnit && (
            <div className="flex bg-emerald-50/95 backdrop-blur-md rounded-full px-2 py-0.5 sm:px-3 sm:py-1 shadow border border-emerald-200">
              <span className="text-[8px] sm:text-[10px] font-black tracking-wider text-emerald-700">
                {formatEuro(computedUnitPrice)} / un · ≈ {unitWeightLabel}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="space-y-1.5 sm:space-y-3 flex-1 flex flex-col">
        <div className="flex justify-between items-start">
          <h3 className="text-sm sm:text-2xl font-black text-slate-800 leading-tight group-hover:text-brand-primary transition-colors italic line-clamp-1">{product.name}</h3>
        </div>

        {allowLegacyUnToggle && (
          <div className="flex gap-1 bg-pale-bg rounded-full p-0.5 self-start">
            <button
              type="button"
              onClick={() => setMode('kg')}
              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wider transition-all ${
                mode === 'kg' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-400 hover:text-brand-primary'
              }`}
            >
              Kg
            </button>
            <button
              type="button"
              onClick={() => setMode('un')}
              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-wider transition-all ${
                mode === 'un' ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-400 hover:text-brand-primary'
              }`}
            >
              Unidade
            </button>
          </div>
        )}

        <p className="text-[8px] sm:text-xs font-bold text-slate-400 mb-0.5 sm:mb-2 uppercase tracking-wide truncate">
          {isWeightBased
            ? (isUnitMode ? `${numericUnits} unidade${numericUnits > 1 ? 's' : ''} · preço a confirmar` : displayWeight)
            : (hasApproxWeight ? `Embalagem de ${approxWeightLabel}` : `Preço por ${product.unit}`)}
        </p>
        
        <div className="mt-auto pt-2 sm:pt-4 space-y-2">
          <div className="flex justify-between items-center gap-1">
            <div className="flex flex-col">
              <span className="text-[7px] sm:text-[10px] font-black uppercase text-brand-primary tracking-tighter">
                {isWeightBased ? 'Total' : 'Preço'}
              </span>
              <motion.span 
                key={isWeightBased ? `${product.id}-${weight}` : product.id}
                initial={{ scale: 1.1, color: '#FF6B00' }}
                animate={{ scale: 1, color: '#FF6B00' }}
                className="font-black text-brand-primary text-sm sm:text-2xl leading-none italic block"
              >
                {totalPrice.toFixed(2)}€
              </motion.span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {isWeightBased && !isUnitMode && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center bg-natural-bg rounded-lg px-1 sm:px-3 h-8 sm:h-12 border border-brand-primary/10 shadow-inner"
                >
                  <input 
                    type="text"
                    inputMode="numeric"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value.replace(/\D/g, ''))}
                    className="w-8 sm:w-14 bg-transparent text-center font-black text-brand-primary outline-none text-[10px] sm:text-sm"
                    placeholder="500"
                  />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase ml-0.5 w-5 sm:w-8">g</span>
                </motion.div>
              )}
              {isWeightBased && isUnitMode && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center bg-natural-bg rounded-lg px-1 sm:px-3 h-8 sm:h-12 border border-brand-primary/10 shadow-inner"
                >
                  <input 
                    type="text"
                    inputMode="numeric"
                    value={unitCount}
                    onChange={(e) => setUnitCount(e.target.value.replace(/\D/g, '') || '1')}
                    className="w-8 sm:w-14 bg-transparent text-center font-black text-brand-primary outline-none text-[10px] sm:text-sm"
                    placeholder="1"
                  />
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase ml-0.5 w-5 sm:w-8">un</span>
                </motion.div>
              )}
              <motion.button 
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  if (plusOpensModal) {
                    setIsUnitModalOpen(true);
                    return;
                  }
                  if (isWeightBased && isUnitMode) {
                    if (numericUnits <= 0) return;
                    addToCart(product, 'un', numericUnits);
                    return;
                  }
                  const qty = isWeightBased ? (parseFloat(weight) || 0) / 1000 : 1;
                  if (qty <= 0) {
                    return;
                  }
                  addToCart(product, product.unit, qty);
                }}
                className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-fruit text-white rounded-lg sm:rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40 transition-all font-black text-base sm:text-xl"
              >
                +
              </motion.button>
            </div>
          </div>

          {showSecondaryModalButton && (
            <button
              type="button"
              onClick={() => setIsUnitModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl border-2 border-brand-primary/20 bg-brand-primary/5 px-2 py-2 sm:py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-wider text-brand-primary transition-all hover:bg-brand-primary/10 active:scale-95"
            >
              🧺 {hasVariants ? 'Escolher variantes' : 'Comprar à unidade'}
              {canSellByUnit && <span className="opacity-70">· {formatEuro(computedUnitPrice)}/un</span>}
            </button>
          )}
        </div>
      </div>
    </motion.div>
    {showUnitModal && (
      <UnitSelectModal
        product={product}
        isOpen={isUnitModalOpen}
        onClose={() => setIsUnitModalOpen(false)}
      />
    )}
    </>
  );
}
