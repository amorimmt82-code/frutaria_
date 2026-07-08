import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { CartItem, Product } from '../types';
import { formatGrams, isKgUnit } from '../lib/pricing';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, selectedUnit?: string, quantity?: number, variant?: string, unitPrice?: number) => void;
  removeFromCart: (productId: string, unit?: string, variant?: string) => void;
  updateQuantity: (productId: string, quantity: number, unit?: string, variant?: string) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function sameLine(item: CartItem, productId: string, unit: string | undefined, variant: string | undefined): boolean {
  if (item.id !== productId) return false;
  if (unit !== undefined && item.selectedUnit !== unit) return false;
  const itemVariant = item.variant ?? '';
  const targetVariant = variant ?? '';
  return itemVariant === targetVariant;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  // Toast de confirmação ("Adicionado ao cesto"). Vive no provider para que
  // qualquer caminho de adição (cartão de produto ou modal) o dispare.
  const [toast, setToast] = useState<{ id: number; detail: string } | null>(null);
  const toastSeq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const addToCart = (product: Product, selectedUnit?: string, quantity: number = 1, variant?: string, unitPrice?: number) => {
    const unitToUse = selectedUnit || product.unit;
    const variantToUse = variant && variant.trim().length > 0 ? variant.trim() : undefined;
    // Quando o produto é vendido à unidade com preço calculado pelo peso médio,
    // o preço da linha (preco_unidade) difere do preço base por kg. Guardamos
    // esse preço calculado em `price` para que o subtotal (price × quantidade)
    // fique correto no carrinho. O servidor volta a calcular para validar.
    const linePrice = typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice >= 0
      ? Math.round(unitPrice * 100) / 100
      : product.price;
    setCart(prev => {
      const existing = prev.find(item => sameLine(item, product.id, unitToUse, variantToUse));
      if (existing) {
        return prev.map(item =>
          sameLine(item, product.id, unitToUse, variantToUse)
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, price: linePrice, quantity, selectedUnit: unitToUse, variant: variantToUse }];
    });

    // Descrição amigável do que foi adicionado para a mensagem de confirmação.
    const qtyLabel = isKgUnit(unitToUse)
      ? (formatGrams(Math.round(quantity * 1000)) || `${quantity} kg`)
      : `${Math.round(quantity)} ${unitToUse}`;
    const detail = `${product.name}${variantToUse ? ` · ${variantToUse}` : ''} · ${qtyLabel}`;
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, detail });
  };

  const removeFromCart = (productId: string, unit?: string, variant?: string) => {
    setCart(prev => prev.filter(item => !sameLine(item, productId, unit, variant)));
  };

  const updateQuantity = (productId: string, quantity: number, unit?: string, variant?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId, unit, variant);
      return;
    }
    setCart(prev => prev.map(item =>
      sameLine(item, productId, unit, variant)
        ? { ...item, quantity }
        : item
    ));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, total }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 28, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-5 left-1/2 z-[80] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-[22px] border border-brand-primary/10 bg-white px-4 py-3 shadow-2xl shadow-brand-primary/20"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
              <Check size={18} strokeWidth={3.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Adicionado ao cesto</p>
              <p className="truncate text-sm font-black italic text-slate-700">{toast.detail}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
