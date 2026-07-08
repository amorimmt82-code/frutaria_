/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { X, Plus, Minus, ShoppingBasket, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import SmartImage from './SmartImage';
import {
  UNIT_SALE_UNIT,
  effectiveUnitPrice,
  formatEuro,
  formatGrams,
  isKgUnit,
  supportsUnitSale,
} from '../lib/pricing';

interface UnitLine {
  key: string;
  label: string;
  variant?: string;
}

export default function UnitSelectModal({
  product,
  isOpen,
  onClose,
}: {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { addToCart } = useCart();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;

  const lines: UnitLine[] = useMemo(() => {
    if (hasVariants) {
      return variants.map((variant) => ({ key: variant, label: variant, variant }));
    }
    return [{ key: '__default__', label: product.name, variant: undefined }];
  }, [hasVariants, variants, product.name]);

  // Mesmo peso médio para todas as variantes do produto (uma média por produto).
  const unitPrice = effectiveUnitPrice(product);
  const sellUnit = supportsUnitSale(product) ? UNIT_SALE_UNIT : product.unit;
  const weightLabel = formatGrams(product.approxWeightGrams ?? 0);
  // Produto a kg com variantes mas sem peso médio: não dá para calcular o
  // preço por unidade, fica a confirmar pela balança.
  const priceToConfirm = isKgUnit(product.unit) && !supportsUnitSale(product);

  // Repor as quantidades sempre que o modal abre.
  useEffect(() => {
    if (isOpen) {
      setQuantities({});
    }
  }, [isOpen]);

  const totalUnits = lines.reduce((sum, line) => sum + (quantities[line.key] ?? 0), 0);
  const totalPrice = totalUnits * unitPrice;

  const setQty = (key: string, next: number) => {
    setQuantities((current) => {
      const value = Math.max(0, Math.min(99, Math.round(next)));
      const updated = { ...current, [key]: value };
      if (value === 0) delete updated[key];
      return updated;
    });
  };

  const handleAdd = () => {
    let added = false;
    for (const line of lines) {
      const qty = quantities[line.key] ?? 0;
      if (qty > 0) {
        addToCart(product, sellUnit, qty, line.variant, unitPrice);
        added = true;
      }
    }
    if (added) {
      setQuantities({});
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Escolher ${product.name}`}
            className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] bg-white shadow-2xl flex flex-col max-h-[88vh]"
          >
            <div className="relative p-5 sm:p-6 border-b bg-pale-bg flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-brand-primary/10 flex-shrink-0 border-2 border-brand-primary/5">
                <SmartImage src={product.image} alt={product.name} fallbackLabel={product.name} fallbackCategory={product.category} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-black text-brand-primary italic leading-tight truncate">{product.name}</h2>
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400">
                  {priceToConfirm
                    ? 'Preço a confirmar pela balança'
                    : `${formatEuro(unitPrice)} / un${weightLabel ? ` · ≈ ${weightLabel}` : ''}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white rounded-full transition-colors text-slate-500"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {lines.map((line) => {
                const qty = quantities[line.key] ?? 0;
                const selected = qty > 0;
                return (
                  <div
                    key={line.key}
                    className={`flex items-center gap-3 rounded-[24px] border-2 p-3 sm:p-4 transition-all ${
                      selected ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent bg-pale-bg'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                      selected ? 'bg-brand-primary border-brand-primary text-white' : 'border-slate-300 text-transparent'
                    }`}>
                      <Check size={14} strokeWidth={4} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-800 italic truncate">{line.label}</p>
                      <p className="text-[11px] font-bold text-slate-400">
                        {priceToConfirm ? 'a confirmar' : `${formatEuro(unitPrice)} / un`}
                        {weightLabel ? <span className="text-emerald-600"> · ≈ {weightLabel}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center bg-white rounded-xl border border-brand-primary/10 shadow-inner overflow-hidden flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty(line.key, qty - 1)}
                        disabled={qty <= 0}
                        className="w-9 h-9 flex items-center justify-center text-brand-primary hover:bg-pale-bg disabled:opacity-30 transition-colors"
                        aria-label={`Reduzir ${line.label}`}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-8 text-center font-black text-brand-primary text-sm tabular-nums">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.key, qty + 1)}
                        className="w-9 h-9 flex items-center justify-center text-brand-primary hover:bg-pale-bg transition-colors"
                        aria-label={`Aumentar ${line.label}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t p-4 sm:p-5 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {totalUnits} unidade{totalUnits === 1 ? '' : 's'}
                </span>
                {!priceToConfirm && (
                  <span className="text-2xl font-black text-brand-primary italic">{formatEuro(totalPrice)}</span>
                )}
              </div>
              <button
                onClick={handleAdd}
                disabled={totalUnits <= 0}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] bg-gradient-fruit text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-brand-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                <ShoppingBasket size={18} />
                Adicionar ao cesto
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
