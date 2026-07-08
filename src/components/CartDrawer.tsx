/// <reference types="vite/client" />
import { X, Trash2, Minus, Plus, CreditCard, Banknote, Smartphone, ShoppingBasket, Check, Landmark, MapPin, Loader2, MessageSquare, CalendarClock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import StripePayment from './StripePayment';
import SmartImage from './SmartImage';
import { checkout, getStorefrontConfig } from '../lib/api';
import { useAccount } from '../context/AccountContext';
import { Order, PaymentMethod, PaymentSettings } from '../types';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

// Stripe exige um valor mínimo por transação em EUR (0,50€).
// Abaixo deste valor a API rejeita a criação do PaymentIntent.
const STRIPE_MIN_EUR = 0.5;

const paymentMethodConfig = [
  { id: 'stripe', label: 'Cartão 💳', icon: CreditCard, desc: 'Visa, Mastercard, etc' },
  { id: 'mbway', label: 'MBWay 📱', icon: Smartphone, desc: 'Confirmação no telemóvel' },
  { id: 'transferencia', label: 'Transferência 🏦', icon: Landmark, desc: 'IBAN e instruções configuráveis' },
  { id: 'dinheiro', label: 'Dinheiro 💵', icon: Banknote, desc: 'Pagar em Dinheiro' },
] as const;

function isWeightUnit(unit?: string) {
  return (unit || '').trim().toLowerCase() === 'kg';
}

function formatQuantity(quantity: number, unit: string) {
  if (isWeightUnit(unit)) {
    if (quantity >= 1) {
      return `${quantity.toFixed(quantity % 1 === 0 ? 0 : 1)}kg`;
    }
    return `${Math.round(quantity * 1000)}g`;
  }
  return `${quantity} ${unit}`;
}

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { cart, removeFromCart, updateQuantity, total, clearCart } = useCart();
  const { account } = useAccount();
  const [step, setStep] = useState<'cart' | 'checkout' | 'mbway_waiting' | 'stripe_payment' | 'success'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mbway');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [deliveryDay, setDeliveryDay] = useState<'quinta' | 'sexta'>('quinta');
  const [customerNote, setCustomerNote] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    async function loadStorefrontConfig() {
      try {
        const response = await getStorefrontConfig();
        setPaymentSettings(response.paymentSettings);
        setCheckoutError(null);
      } catch (error: unknown) {
        setCheckoutError(error instanceof Error ? error.message : 'Não foi possível carregar os métodos de pagamento.');
      }
    }

    void loadStorefrontConfig();
  }, [isOpen]);

  // Preenche automaticamente nome/telemóvel a partir da conta com sessão iniciada.
  useEffect(() => {
    if (isOpen && account) {
      setName((prev) => prev || account.name);
      setPhoneNumber((prev) => prev || account.phone);
    }
  }, [isOpen, account]);

  useEffect(() => {
    if (!paymentSettings) {
      return;
    }

    const availableMethods = paymentMethodConfig.filter((method) => {
      if (method.id === 'stripe') {
        return paymentSettings.stripeEnabled && total >= STRIPE_MIN_EUR;
      }
      if (method.id === 'mbway') {
        return paymentSettings.mbwayEnabled;
      }
      if (method.id === 'transferencia') {
        return paymentSettings.transferEnabled;
      }
      return paymentSettings.cashEnabled;
    });

    if (availableMethods.length > 0 && !availableMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod(availableMethods[0].id);
    }
  }, [paymentMethod, paymentSettings, total]);

  const availablePaymentMethods = paymentMethodConfig.filter((method) => {
    if (!paymentSettings) {
      return true;
    }
    if (method.id === 'stripe') {
      return paymentSettings.stripeEnabled && total >= STRIPE_MIN_EUR;
    }
    if (method.id === 'mbway') {
      return paymentSettings.mbwayEnabled;
    }
    if (method.id === 'transferencia') {
      return paymentSettings.transferEnabled;
    }
    return paymentSettings.cashEnabled;
  });

  const validateCustomerDetails = () => {
    if (!name.trim() || !phoneNumber.trim() || !address.trim() || !postalCode.trim()) {
      setCheckoutError('Preencha nome, telemóvel, morada e código postal para concluir a encomenda.');
      return false;
    }
    return true;
  };

  const handleCheckout = async () => {
    if (!validateCustomerDetails()) {
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      const response = await checkout({
        customer: {
          name: name.trim(),
          phone: phoneNumber.trim(),
          address: address.trim(),
          postalCode: postalCode.trim(),
          deliveryDay,
        },
        paymentMethod,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          selectedUnit: item.selectedUnit || item.unit,
          variant: item.variant,
        })),
        customerNote: customerNote.trim() || undefined,
      });

      setCurrentOrder(response.order);
      setPaymentSettings(response.paymentSettings);

      if (paymentMethod === 'stripe') {
        if (!response.clientSecret) {
          throw new Error('Não foi possível iniciar o pagamento por cartão.');
        }
        setClientSecret(response.clientSecret);
        setStep('stripe_payment');
        return;
      }

      if (paymentMethod === 'mbway') {
        // Não temos integração automática com MBWay (IfthenPay/SIBS).
        // O pedido fica registado com paymentStatus 'pending' e a
        // equipa confirma manualmente após receber a notificação
        // bancária. Mostramos um ecrã informativo em vez de marcar
        // sucesso de forma falsa.
        setStep('mbway_waiting');
        return;
      }

      setStep('success');
    } catch (error: unknown) {
      setCheckoutError(error instanceof Error ? error.message : 'Não foi possível concluir a encomenda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep('cart');
      setName('');
      setPhoneNumber('');
      setAddress('');
      setPostalCode('');
      setDeliveryDay('quinta');
      setCustomerNote('');
      setClientSecret(null);
      setCheckoutError(null);
      setCurrentOrder(null);
    }, 300);
  };

  const handleFinalize = () => {
    clearCart();
    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
          >
            <div className="p-8 border-b flex items-center justify-between bg-pale-bg">
              <h2 className="text-3xl font-black text-brand-primary italic">
                {step === 'cart' && 'O Seu Cesto 🧺'}
                {step === 'checkout' && 'Finalizar ✨'}
                {step === 'mbway_waiting' && 'Aguarda Confirmação 📱'}
                {step === 'stripe_payment' && 'Pagamento 💳'}
                {step === 'success' && 'Tudo Pronto! 🎉'}
              </h2>
              <button 
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {step === 'cart' && (
                <div className="space-y-6">
                  {cart.length === 0 ? (
                    <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-20 h-20 bg-natural-bg rounded-full flex items-center justify-center text-brand-primary/20">
                        <ShoppingBasket size={40} />
                      </div>
                      <p className="text-gray-400 font-medium">O seu carrinho está vazio.<br/>Que tal umas maçãs frescas?</p>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={`${item.id}-${item.selectedUnit}-${item.variant || ''}`} className="flex gap-4 group items-center">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-brand-primary/10 flex-shrink-0 border-2 border-brand-primary/5">
                          <SmartImage src={item.image} alt={item.name} fallbackLabel={item.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between">
                            <h4 className="font-black text-slate-800 truncate italic">
                              {item.name}
                              {item.variant && <span className="ml-1 text-brand-primary not-italic font-bold">({item.variant})</span>}
                            </h4>
                            <button 
                              onClick={() => removeFromCart(item.id, item.selectedUnit, item.variant)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <p className="text-sm text-gray-500 mb-2">{item.price.toFixed(2)}€ / {item.selectedUnit || item.unit}</p>
                          <div className="flex items-center gap-3">
                           <div className="flex items-center gap-2 bg-natural-bg px-2 py-1 rounded-lg">
                              <button 
                                onClick={() => {
                                  const itemUnit = item.selectedUnit || item.unit;
                                  const quantityStep = isWeightUnit(itemUnit) ? (item.quantity > 1 ? 1 : 0.1) : 1;
                                  updateQuantity(item.id, item.quantity - quantityStep, item.selectedUnit, item.variant);
                                }}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm text-brand-primary"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="min-w-[40px] text-center font-bold text-sm">
                                {formatQuantity(item.quantity, item.selectedUnit || item.unit)}
                              </span>
                              <button 
                                onClick={() => {
                                  const itemUnit = item.selectedUnit || item.unit;
                                  const quantityStep = isWeightUnit(itemUnit) ? (item.quantity >= 1 ? 1 : 0.1) : 1;
                                  updateQuantity(item.id, item.quantity + quantityStep, item.selectedUnit, item.variant);
                                }}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm text-brand-primary"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <p className="font-bold text-brand-primary">{(item.price * item.quantity).toFixed(2)}€</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {cart.length > 0 && (
                    <div className="pt-2">
                      <label className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-brand-primary">
                        <MessageSquare size={14} className="text-brand-secondary" />
                        Observação (opcional)
                      </label>
                      <textarea
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value.slice(0, 500))}
                        rows={3}
                        placeholder="Escreva aqui um recado para nós: preferências, ponto de referência da morada, horário ideal..."
                        className="w-full resize-none rounded-2xl border-2 border-transparent bg-natural-bg/60 p-4 text-sm font-semibold text-slate-700 placeholder:text-slate-400 shadow-inner outline-none transition-all focus:border-brand-primary/20 focus:bg-white"
                      />
                      <p className="mt-1 text-right text-[10px] font-bold uppercase tracking-widest text-slate-300">{customerNote.length}/500</p>
                    </div>
                  )}
                </div>
              )}

              {step === 'checkout' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="font-bold text-brand-primary mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
                      <MapPin size={16} className="text-brand-secondary" />
                      Dados de Entrega
                    </h3>
                    <div className="space-y-3">
                      <input type="text" placeholder="Nome Completo" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-natural-bg/50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all" />
                      <input type="text" placeholder="Morada" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-natural-bg/50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="Código Postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value.toUpperCase())} className="bg-natural-bg/50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all" />
                        <input 
                          type="tel" 
                          placeholder="Telemóvel" 
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                          className="bg-natural-bg/50 border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all" 
                        />
                      </div>
                    </div>
                    <div className="mt-5">
                      <p className="text-xs font-bold text-brand-primary uppercase tracking-widest mb-3">Qual seria o dia da entrega?</p>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { id: 'quinta' as const, label: 'Quinta-feira' },
                          { id: 'sexta' as const, label: 'Sexta-feira' },
                        ]).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDeliveryDay(opt.id)}
                            className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all ${
                              deliveryDay === opt.id
                                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                : 'border-transparent bg-natural-bg/50 text-slate-600 hover:border-brand-primary/20'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-brand-primary mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
                      <CreditCard size={16} className="text-brand-secondary" />
                      Método de Pagamento
                    </h3>
                    <div className="grid gap-3">
                      {availablePaymentMethods.map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id)}
                          className={`flex items-center gap-4 p-4 rounded-[24px] border-2 transition-all ${
                            paymentMethod === method.id 
                            ? 'border-brand-primary bg-brand-primary/5' 
                            : 'border-transparent bg-pale-bg hover:border-brand-primary/10'
                          }`}
                        >
                          <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === method.id ? 'bg-gradient-fruit text-white' : 'bg-white text-brand-primary shadow-sm'}`}>
                            <method.icon size={20} />
                          </div>
                          <div className="text-left min-w-0">
                            <p className="font-black text-slate-800 text-sm uppercase italic truncate">{method.label}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest truncate">{method.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {paymentSettings?.stripeEnabled && total > 0 && total < STRIPE_MIN_EUR && (
                      <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700">
                        💳 Pagamento por cartão disponível apenas para encomendas a partir de {STRIPE_MIN_EUR.toFixed(2).replace('.', ',')}€. Use MBWay, transferência ou dinheiro para valores mais baixos.
                      </div>
                    )}
                    {paymentSettings && paymentMethod === 'transferencia' && (
                      <div className="mt-4 rounded-[24px] border border-brand-primary/10 bg-white p-4 text-sm font-bold text-slate-500">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">IBAN</p>
                        <p className="mt-2 text-brand-primary break-all">{paymentSettings.transferIban}</p>
                        <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Titular</p>
                        <p className="mt-2">{paymentSettings.transferRecipient}</p>
                      </div>
                    )}
                  </div>

                  {checkoutError && (
                    <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm font-bold text-red-600">
                      {checkoutError}
                    </div>
                  )}

                  <div className="rounded-[24px] border-2 border-dashed border-brand-secondary/40 bg-gradient-to-br from-brand-secondary/10 to-brand-primary/5 px-5 py-4 flex items-start gap-3">
                    <span className="text-2xl leading-none">🚚</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary mb-1">Taxa de entrega</p>
                      <p className="text-sm font-black text-slate-700 leading-snug">
                        Encomendas abaixo de <span className="text-brand-primary">10€</span> pagam <span className="text-brand-primary">3,50€</span> de taxa de entrega.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[24px] border-2 border-brand-primary/15 bg-brand-primary/5 px-5 py-4 flex items-start gap-3">
                    <CalendarClock size={22} className="text-brand-primary flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary mb-1">Prazos de encomenda</p>
                      <p className="text-sm font-black text-slate-700 leading-snug">
                        Encomendas até <span className="text-brand-primary">quarta-feira às 13h00</span>. Entregas à <span className="text-brand-primary">quinta e sexta-feira</span>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {step === 'mbway_waiting' && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 px-4">
                  <div className="relative">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.1, 1],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-40 h-40 bg-brand-primary/10 rounded-full flex items-center justify-center"
                    >
                      <Smartphone size={80} className="text-brand-primary" />
                    </motion.div>
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      className="absolute -top-4 -right-4 w-12 h-12 bg-brand-secondary rounded-full flex items-center justify-center text-white"
                    >
                      <Check size={24} strokeWidth={3} />
                    </motion.div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-3xl font-black text-brand-primary italic">Pedido registado!</h3>
                    <p className="text-slate-500 font-bold leading-relaxed">
                      O pedido <span className="text-brand-primary font-black">{currentOrder?.number || 'em processamento'}</span> ficou registado e aguarda o pagamento por MBWay.<br/>
                      Faça a transferência MBWay para o número <span className="text-brand-primary font-black">{paymentSettings?.mbwayNumber || 'indicado'}</span> no valor de <span className="text-brand-primary font-black">{total.toFixed(2)}€</span>.<br/>
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest block mt-3">Confirmaremos manualmente assim que recebermos o pagamento.</span>
                    </p>
                  </div>
                  <button
                    onClick={handleFinalize}
                    className="px-8 py-4 rounded-[24px] bg-gradient-fruit text-white font-black uppercase tracking-widest text-sm shadow-lg hover:scale-105 transition-transform"
                  >
                    Concluir
                  </button>
                </div>
              )}

               {step === 'stripe_payment' && clientSecret && (
                <div className="space-y-6">
                  <div className="bg-pale-bg p-6 rounded-3xl border-2 border-brand-primary/5">
                    <p className="text-xs font-black text-brand-primary uppercase tracking-[0.2em] mb-2 opacity-40">Valor a Pagar</p>
                    <p className="text-4xl font-black text-brand-primary italic">{total.toFixed(2)}€</p>
                  </div>
                  {currentOrder && (
                    <div className="rounded-3xl border border-brand-primary/10 bg-white p-5 text-sm font-bold text-slate-500">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Pedido</p>
                      <p className="mt-2 text-xl font-black italic text-brand-primary">{currentOrder.number}</p>
                    </div>
                  )}
                  <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'flat', variables: { colorPrimary: '#FF6B00' } } }}>
                    <StripePayment 
                      amount={total} 
                      clientSecret={clientSecret}
                      orderId={currentOrder?.id || ''}
                      onComplete={(paymentIntentId) => {
                        setCurrentOrder((order) => order ? ({ ...order, paymentReference: paymentIntentId, paymentStatus: 'paid', orderStatus: 'confirmed' }) : order);
                        setStep('success');
                      }} 
                    />
                  </Elements>
                  <button 
                    onClick={() => setStep('checkout')}
                    className="w-full text-sm font-black text-slate-400 uppercase tracking-widest hover:text-brand-primary transition-colors"
                  >
                    Cancelar e Voltar
                  </button>
                </div>
              )}

              {step === 'success' && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 px-4">
                  <motion.div 
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 12 }}
                    className="relative"
                  >
                    <div className="w-32 h-32 bg-brand-secondary/20 text-brand-secondary rounded-full flex items-center justify-center shadow-xl shadow-brand-secondary/10">
                      <Check size={64} strokeWidth={4} />
                    </div>
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute -top-4 -right-4 text-4xl"
                    >
                      🍓
                    </motion.div>
                  </motion.div>
                  
                  <div className="space-y-4">
                    <h3 className="text-4xl font-black text-brand-primary italic leading-none">Encomenda Feita com Amor!</h3>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Prepare o cesto, estamos a caminho. 🚀</p>
                  </div>
                  
                  <div className="w-full bg-pale-bg p-8 rounded-[40px] border-4 border-brand-primary/5 text-left space-y-6">
                    {currentOrder && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] italic">Pedido</span>
                        <span className="font-black text-brand-primary uppercase italic text-lg">{currentOrder.number}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] italic">Método</span>
                      <span className="font-black text-brand-primary uppercase italic text-lg">
                        {paymentMethod === 'mbway' && 'MBWay 📱'}
                        {paymentMethod === 'stripe' && 'Cartão 💳'}
                        {paymentMethod === 'transferencia' && 'Transferência 🏦'}
                        {paymentMethod === 'dinheiro' && 'Dinheiro 💵'}
                      </span>
                    </div>
                    {paymentMethod === 'transferencia' && (
                      <div className="pt-6 border-t-2 border-brand-primary/5">
                        <p className="text-[10px] text-slate-400 uppercase font-black mb-2 tracking-widest">IBAN para Pagamento</p>
                        <p className="font-black text-sm text-slate-800 tracking-wider bg-white p-4 rounded-2xl shadow-sm border border-brand-primary/5 break-all">{paymentSettings?.transferIban}</p>
                        <p className="mt-4 text-[10px] text-slate-400 uppercase font-black mb-2 tracking-widest">Titular</p>
                        <p className="font-black text-sm text-slate-800 tracking-wider bg-white p-4 rounded-2xl shadow-sm border border-brand-primary/5">{paymentSettings?.transferRecipient}</p>
                        <p className="mt-4 text-sm font-bold text-slate-500 leading-relaxed">{paymentSettings?.transferInstructions}</p>
                      </div>
                    )}
                    {paymentMethod === 'mbway' && paymentSettings?.mbwayNumber && (
                      <div className="pt-6 border-t-2 border-brand-primary/5">
                        <p className="text-[10px] text-slate-400 uppercase font-black mb-2 tracking-widest">Número MBWay</p>
                        <p className="font-black text-sm text-slate-800 tracking-wider bg-white p-4 rounded-2xl shadow-sm border border-brand-primary/5">{paymentSettings.mbwayNumber}</p>
                      </div>
                    )}
                  </div>
                  
                  <button 
                    onClick={handleFinalize}
                    className="w-full h-16 bg-slate-900 text-white rounded-[32px] font-black text-xl hover:bg-brand-primary transition-all shadow-xl shadow-slate-900/10"
                  >
                    Voltar à Frutaria 🏠
                  </button>
                </div>
              )}
            </div>

            {step !== 'success' && step !== 'mbway_waiting' && step !== 'stripe_payment' && (
              <div className="p-8 bg-pale-bg border-t-4 border-brand-primary/5 space-y-6 flex-shrink-0">
                {step === 'cart' && (
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="Nome Completo" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-white border border-brand-primary/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all shadow-sm" 
                    />
                    <input 
                      type="tel" 
                      placeholder="Telemóvel" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white border border-brand-primary/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all shadow-sm" 
                    />
                    {checkoutError && (
                      <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                        {checkoutError}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-end">
                  <span className="text-slate-400 font-black uppercase text-xs tracking-widest italic">Total a Pagar</span>
                  <span className="text-4xl font-black text-brand-primary italic">{total.toFixed(2)}€</span>
                </div>
                
                {step === 'cart' ? (
                  <button 
                    disabled={cart.length === 0}
                    onClick={() => setStep('checkout')}
                    className="w-full h-16 bg-gradient-fruit text-white rounded-[32px] font-black text-xl hover:shadow-[0_15px_30px_rgba(255,107,0,0.3)] disabled:opacity-20 transition-all active:scale-[0.98]"
                  >
                    Seguir para Pagamento ✨
                  </button>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setStep('cart')}
                      className="flex-1 h-16 border-4 border-brand-primary/10 text-slate-400 rounded-[32px] font-black hover:bg-brand-primary/5 transition-all text-sm uppercase tracking-widest"
                    >
                      Voltar
                    </button>
                    <button 
                      disabled={isSubmitting || availablePaymentMethods.length === 0}
                      onClick={handleCheckout}
                      className="flex-[2] h-16 bg-gradient-fruit text-white rounded-[32px] font-black text-xl hover:shadow-[0_15px_30px_rgba(255,107,0,0.3)] shadow-brand-primary/20 flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="animate-spin" />}
                      Confirmar Compra
                    </button>
                  </div>
                )}
                
                <div className="flex justify-center gap-4 text-[10px] uppercase font-bold text-gray-400 tracking-tighter">
                  <span className="flex items-center gap-1"><CreditCard size={12} /> Cartão</span>
                  <span className="flex items-center gap-1"><Smartphone size={12} /> MBWay</span>
                  <span className="flex items-center gap-1"><Landmark size={12} /> Transf.</span>
                  <span className="flex items-center gap-1"><Banknote size={12} /> Dinheiro</span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

