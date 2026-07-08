import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, LogOut, Loader2, Package, ShoppingBag, Lock, Phone, ShieldCheck, CalendarClock } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { Order, OrderStatus, PaymentMethod } from '../types';

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguarda pagamento',
  awaiting_transfer: 'Aguarda transferência',
  confirmed: 'Confirmado',
  preparing: 'Em preparação',
  shipped: 'A caminho',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  awaiting_payment: 'bg-amber-100 text-amber-700',
  awaiting_transfer: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  preparing: 'bg-sky-100 text-sky-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  mbway: 'MBWay',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  stripe: 'Cartão',
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-[24px] border-2 border-brand-primary/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-black italic text-brand-primary leading-none">{order.number}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">{formatDate(order.createdAt)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${ORDER_STATUS_STYLE[order.orderStatus] || 'bg-slate-100 text-slate-500'}`}>
          {ORDER_STATUS_LABEL[order.orderStatus] || order.orderStatus}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {order.items.map((item, index) => (
          <div key={`${order.id}-${item.productId}-${item.selectedUnit}-${index}`} className="flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
            <span className="truncate">{item.name} · {item.quantity} {item.selectedUnit || item.unit}</span>
            <span className="flex-shrink-0 text-brand-primary">{item.lineTotal.toFixed(2)}€</span>
          </div>
        ))}
      </div>

      {order.customerNote && (
        <div className="mt-3 rounded-2xl bg-pale-bg px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">A sua observação</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-semibold text-slate-600">{order.customerNote}</p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-brand-primary/5 pt-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</span>
        <span className="text-xl font-black italic text-brand-primary">{order.total.toFixed(2)}€</span>
      </div>
    </div>
  );
}

export default function AccountDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { account, orders, isLoading, login, register, logout } = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setPhone('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (mode === 'register') {
        if (!name.trim()) {
          setError('Indique o seu nome.');
          return;
        }
        if (phone.length < 6) {
          setError('Indique um número de telemóvel válido.');
          return;
        }
        await register(name.trim(), phone, password || undefined);
      } else {
        if (phone.length < 6) {
          setError('Indique um número de telemóvel válido.');
          return;
        }
        await login(phone, password || undefined);
      }
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.');
    }
  };

  const handleLogout = async () => {
    await logout();
    resetForm();
    setMode('login');
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
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b bg-pale-bg p-8">
              <h2 className="flex items-center gap-2 text-3xl font-black italic text-brand-primary">
                {account ? 'A Minha Conta' : 'Entrar'} <User className="text-brand-secondary" />
              </h2>
              <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-100">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {account ? (
                <div className="space-y-6">
                  <div className="rounded-[28px] border-2 border-brand-primary/10 bg-gradient-to-br from-brand-primary/5 to-brand-secondary/5 p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-fruit text-white shadow-lg">
                        <User size={26} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xl font-black italic text-slate-800">{account.name}</p>
                        <p className="flex items-center gap-1 text-sm font-bold text-slate-500">
                          <Phone size={13} /> {account.phone}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                      <ShieldCheck size={14} className={account.hasPassword ? 'text-emerald-500' : 'text-slate-300'} />
                      {account.hasPassword ? 'Conta protegida por palavra-passe' : 'Conta sem palavra-passe'}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-brand-primary">
                      <Package size={16} className="text-brand-secondary" />
                      Os Meus Pedidos
                      {orders.length > 0 && (
                        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] text-brand-primary">{orders.length}</span>
                      )}
                    </h3>

                    {orders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed border-brand-primary/15 py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/5 text-brand-primary/30">
                          <ShoppingBag size={32} />
                        </div>
                        <p className="px-8 font-bold text-slate-400">Ainda não tem pedidos.<br />Os seus pedidos aparecerão aqui.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {orders.map((order) => (
                          <OrderCard key={order.id} order={order} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="flex rounded-[20px] bg-pale-bg p-1.5">
                    {([
                      { id: 'login' as const, label: 'Entrar' },
                      { id: 'register' as const, label: 'Criar conta' },
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => { setMode(tab.id); setError(null); }}
                        className={`flex-1 rounded-2xl py-3 text-xs font-black uppercase tracking-widest transition-all ${
                          mode === tab.id ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400 hover:text-brand-primary'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <p className="text-sm font-bold leading-relaxed text-slate-500">
                    {mode === 'register'
                      ? 'Crie a sua conta para acompanhar o histórico dos seus pedidos. A palavra-passe é opcional.'
                      : 'Entre com o seu telemóvel para ver o histórico dos seus pedidos.'}
                  </p>

                  {mode === 'register' && (
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-brand-primary">
                        <User size={13} /> Nome
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="O seu nome"
                        className="w-full rounded-2xl border-2 border-transparent bg-natural-bg/60 p-4 text-sm font-semibold text-slate-700 shadow-inner outline-none transition-all focus:border-brand-primary/20 focus:bg-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-brand-primary">
                      <Phone size={13} /> Telemóvel
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="912 345 678"
                      className="w-full rounded-2xl border-2 border-transparent bg-natural-bg/60 p-4 text-sm font-semibold text-slate-700 shadow-inner outline-none transition-all focus:border-brand-primary/20 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-brand-primary">
                      <Lock size={13} /> Palavra-passe <span className="text-slate-300">(opcional)</span>
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'Deixe em branco para não usar' : 'Só se tiver definido uma'}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      className="w-full rounded-2xl border-2 border-transparent bg-natural-bg/60 p-4 text-sm font-semibold text-slate-700 shadow-inner outline-none transition-all focus:border-brand-primary/20 focus:bg-white"
                    />
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex h-16 w-full items-center justify-center gap-2 rounded-[28px] bg-gradient-fruit text-lg font-black text-white transition-all hover:shadow-[0_15px_30px_rgba(255,107,0,0.3)] active:scale-[0.98] disabled:opacity-40"
                  >
                    {isLoading && <Loader2 className="animate-spin" />}
                    {mode === 'register' ? 'Criar conta ✨' : 'Entrar 🍊'}
                  </button>

                  <div className="flex items-start gap-3 rounded-2xl border-2 border-brand-primary/10 bg-brand-primary/5 px-4 py-3">
                    <CalendarClock size={18} className="mt-0.5 flex-shrink-0 text-brand-primary" />
                    <p className="text-xs font-bold leading-snug text-slate-500">
                      A conta é <span className="text-brand-primary">opcional</span>: pode encomendar sem iniciar sessão. Serve apenas para guardar o seu histórico.
                    </p>
                  </div>
                </form>
              )}
            </div>

            {account && (
              <div className="flex-shrink-0 border-t-4 border-brand-primary/5 bg-pale-bg p-6">
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] border-2 border-brand-primary/10 text-sm font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : <LogOut size={18} />}
                  Terminar sessão
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
