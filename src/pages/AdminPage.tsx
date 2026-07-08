import { ChangeEvent, FormEvent, startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Landmark,
  LayoutDashboard,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShoppingCart,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  adminLogin,
  adminLogout,
  createProduct,
  deleteProduct,
  getAdminBootstrap,
  updateOrder,
  updatePaymentSettings,
  updateProduct,
} from '../lib/api';
import {
  AdminBootstrap,
  OrderStatus,
  PaymentSettings,
  PaymentStatus,
  Product,
} from '../types';
import SmartImage from '../components/SmartImage';
import { MIN_AVG_WEIGHT_GRAMS } from '../lib/pricing';

const emptyProductForm = {
  name: '',
  price: '0.00',
  unit: 'kg',
  approxWeightGrams: '',
  category: 'fruta',
  image: '',
  description: '',
  variants: '',
  active: true,
};

const unitOptions: Array<{ value: string; label: string; hint: string }> = [
  { value: 'kg', label: 'Quilograma (kg)', hint: 'Preço cobrado por kg. Defina o peso médio para também vender à unidade com preço calculado.' },
  { value: 'un', label: 'Unidade (un)', hint: 'Preço cobrado por unidade vendida.' },
  { value: 'estimado', label: 'Estimado (peso aproximado)', hint: 'Preço por unidade, mas mostra ao cliente o peso médio.' },
];

const orderStatusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'awaiting_payment', label: 'A aguardar pagamento' },
  { value: 'awaiting_transfer', label: 'A aguardar transferência' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'preparing', label: 'Em preparação' },
  { value: 'shipped', label: 'Em distribuição' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
];

const paymentStatusOptions: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'pending', label: 'Pendente' },
  { value: 'awaiting_payment', label: 'Aguardando pagamento' },
  { value: 'awaiting_transfer', label: 'Aguardando transferência' },
  { value: 'paid', label: 'Pago' },
  { value: 'cash_on_delivery', label: 'Dinheiro na entrega' },
  { value: 'failed', label: 'Falhou' },
  { value: 'cancelled', label: 'Cancelado' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function paymentMethodLabel(method: string) {
  switch (method) {
    case 'stripe':
      return 'Cartão';
    case 'mbway':
      return 'MBWay';
    case 'transferencia':
      return 'Transferência';
    case 'dinheiro':
      return 'Dinheiro';
    default:
      return method;
  }
}

export default function AdminPage() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<AdminBootstrap | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [email, setEmail] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'payments'>('overview');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [paymentForm, setPaymentForm] = useState<PaymentSettings | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, { orderStatus: OrderStatus; paymentStatus: PaymentStatus; notes: string }>>({});
  const [productSearch, setProductSearch] = useState('');
  const deferredProductSearch = useDeferredValue(productSearch);

  function resetAdminSession() {
    setBootstrap(null);
    setCsrfToken(null);
    setPaymentForm(null);
    setOrderDrafts({});
    setEditingProductId(null);
  }

  function isAdminSessionError(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes('authentication')
      || normalized.includes('expired')
      || normalized.includes('csrf')
      || normalized.includes('forbidden');
  }

  async function loadBootstrap(options: { silentAuthErrors?: boolean } = {}) {
    const { silentAuthErrors = false } = options;

    setIsRefreshing(true);
    if (!silentAuthErrors) {
      setErrorMessage(null);
    }

    try {
      const data = await getAdminBootstrap();
      startTransition(() => {
        setCsrfToken(data.csrfToken);
        setBootstrap(data);
        setPaymentForm(data.paymentSettings);
        setOrderDrafts(
          Object.fromEntries(
            data.orders.map((order) => [
              order.id,
              {
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus,
                notes: order.notes || '',
              },
            ]),
          ),
        );
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o back office.';
      const sessionError = isAdminSessionError(message);

      if (sessionError) {
        resetAdminSession();
      }

      if (!(silentAuthErrors && sessionError)) {
        setErrorMessage(message);
      }
    } finally {
      setIsRefreshing(false);
      setAuthResolved(true);
    }
  }

  useEffect(() => {
    void loadBootstrap({ silentAuthErrors: true });
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = setTimeout(() => setSuccessMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await adminLogin(email.trim(), passcode);
      setCsrfToken(response.csrfToken);
      setPasscode('');
      setEmail('');
      await loadBootstrap();
      setSuccessMessage('Sessão de back office iniciada.');
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível autenticar.');
    } finally {
      setIsBusy(false);
    }
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
  }

  function startEditingProduct(product: Product) {
    setActiveTab('products');
    setEditingProductId(product.id);
    const isEstimated = (product.unit || '').trim().toLowerCase() === 'un' && typeof product.approxWeightGrams === 'number' && product.approxWeightGrams > 0;
    setProductForm({
      name: product.name,
      price: product.price.toFixed(2),
      unit: isEstimated ? 'estimado' : product.unit,
      approxWeightGrams: product.approxWeightGrams ? String(product.approxWeightGrams) : '',
      category: product.category,
      image: product.image,
      description: product.description,
      variants: (product.variants ?? []).join(', '),
      active: product.active ?? true,
    });
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const variantsList = productForm.variants
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const normalizedPrice = Number(String(productForm.price).replace(',', '.').trim());
      if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        setErrorMessage('Preço inválido. Use um número como 2.30 ou 2,30.');
        setIsBusy(false);
        return;
      }
      const isEstimated = productForm.unit === 'estimado';
      const persistedUnit = isEstimated ? 'un' : productForm.unit.trim();
      let approxWeightGrams: number | undefined;
      if (isEstimated) {
        const grams = Number(String(productForm.approxWeightGrams).replace(',', '.').trim());
        if (!Number.isFinite(grams) || grams < MIN_AVG_WEIGHT_GRAMS) {
          setErrorMessage(`Indique o peso aproximado em gramas (mínimo ${MIN_AVG_WEIGHT_GRAMS}g, ex.: 190).`);
          setIsBusy(false);
          return;
        }
        approxWeightGrams = Math.round(grams);
      } else if (persistedUnit.toLowerCase() === 'kg') {
        // Peso médio é opcional para produtos a kg. Quando definido (>0),
        // habilita a venda à unidade com preço calculado automaticamente.
        const raw = String(productForm.approxWeightGrams).replace(',', '.').trim();
        if (raw) {
          const grams = Number(raw);
          if (!Number.isFinite(grams) || grams < MIN_AVG_WEIGHT_GRAMS) {
            setErrorMessage(`Peso médio inválido. Use no mínimo ${MIN_AVG_WEIGHT_GRAMS}g (ex.: 190) ou deixe vazio.`);
            setIsBusy(false);
            return;
          }
          approxWeightGrams = Math.round(grams);
        }
      }
      const payload = {
        ...productForm,
        unit: persistedUnit,
        category: productForm.category.trim().toLowerCase(),
        variants: variantsList,
        price: normalizedPrice,
        approxWeightGrams,
      };

      if (editingProductId) {
        const { product: updated } = await updateProduct(csrfToken, editingProductId, payload);
        setBootstrap((prev) => prev ? { ...prev, products: prev.products.map((p) => p.id === updated.id ? updated : p) } : prev);
        setSuccessMessage('Produto atualizado com sucesso.');
      } else {
        const { product: created } = await createProduct(csrfToken, payload);
        setBootstrap((prev) => prev ? { ...prev, products: [...prev.products, created].sort((a, b) => a.name.localeCompare(b.name)) } : prev);
        setSuccessMessage('Produto criado com sucesso.');
      }

      resetProductForm();
      void loadBootstrap({ silentAuthErrors: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível guardar o produto.';
      if (isAdminSessionError(message)) {
        resetAdminSession();
      }
      setErrorMessage(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleProductDelete(product: Product) {
    if (!csrfToken) {
      return;
    }

    const confirmed = window.confirm(`Remover ou arquivar ${product.name}?`);
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await deleteProduct(csrfToken, product.id);
      setBootstrap((prev) => {
        if (!prev) return prev;
        if (response.archived && response.product) {
          return { ...prev, products: prev.products.map((p) => p.id === product.id ? response.product : p) };
        }
        return { ...prev, products: prev.products.filter((p) => p.id !== product.id) };
      });
      setSuccessMessage(response.archived ? 'Produto arquivado para preservar histórico de encomendas.' : 'Produto removido com sucesso.');
      void loadBootstrap({ silentAuthErrors: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível remover o produto.';
      if (isAdminSessionError(message)) {
        resetAdminSession();
      }
      setErrorMessage(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOrderSave(orderId: string) {
    if (!csrfToken) {
      return;
    }

    const draft = orderDrafts[orderId];
    if (!draft) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await updateOrder(csrfToken, orderId, draft);
      setSuccessMessage('Pedido atualizado com sucesso.');
      await loadBootstrap();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar o pedido.';
      if (isAdminSessionError(message)) {
        resetAdminSession();
      }
      setErrorMessage(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePaymentSettingsSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !paymentForm) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await updatePaymentSettings(csrfToken, paymentForm);
      setSuccessMessage('Configurações de pagamento guardadas.');
      await loadBootstrap();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível guardar as configurações de pagamento.';
      if (isAdminSessionError(message)) {
        resetAdminSession();
      }
      setErrorMessage(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProductForm((current) => ({
        ...current,
        image: typeof reader.result === 'string' ? reader.result : current.image,
      }));
    };
    reader.readAsDataURL(file);
  }

  const filteredProducts = (bootstrap?.products || []).filter((product) => {
    const query = deferredProductSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [product.name, product.category, product.unit].some((field) => field.toLowerCase().includes(query));
  });

  if (!authResolved || (isRefreshing && !bootstrap)) {
    return (
      <div className="min-h-screen bg-pale-bg px-6 py-10 sm:px-10">
        <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center rounded-[40px] border-2 border-brand-primary/10 bg-white shadow-[0_30px_70px_rgba(255,107,0,0.12)]">
          <div className="flex items-center gap-3 text-brand-primary">
            <Loader2 className="animate-spin" />
            <span className="text-lg font-black uppercase tracking-[0.2em]">A validar sessão</span>
          </div>
        </div>
      </div>
    );
  }

  if (!csrfToken || !bootstrap) {
    return (
      <div className="min-h-screen bg-pale-bg px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl rounded-[40px] border-2 border-brand-primary/10 bg-white shadow-[0_30px_70px_rgba(255,107,0,0.12)] overflow-hidden">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-8 sm:p-12 bg-[radial-gradient(circle_at_top_left,_rgba(255,107,0,0.14),_transparent_34%),linear-gradient(135deg,_#FFF6E8_0%,_#FFFDF0_100%)]">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary/10 bg-white px-5 py-2 text-[11px] font-black uppercase tracking-[0.25em] text-brand-primary">
                <Shield size={16} />
                Back Office
              </div>
              <h1 className="mt-8 text-5xl sm:text-7xl font-black italic text-brand-primary leading-[0.95]">Controle total<br />da frutaria.</h1>
              <p className="mt-6 max-w-xl text-lg font-semibold leading-relaxed text-slate-500">
                Gerir catálogo, imagens, preços, estados de encomenda e transferências a partir do mesmo universo visual da loja pública.
              </p>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ['Produtos', 'Criar, editar, arquivar e trocar imagens.'],
                  ['Pagamentos', 'Ligar ou desligar cartão, MBWay, transferência e dinheiro.'],
                  ['Pedidos', 'Acompanhar estados e confirmar transferências.'],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-[28px] border border-brand-primary/10 bg-white/80 p-5 shadow-lg">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-primary/60">{title}</p>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-slate-500">{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 sm:p-12 bg-white">
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-slate-400 hover:text-brand-primary transition-colors">
                <ArrowLeft size={16} />
                Voltar à loja
              </Link>

              <form onSubmit={handleLogin} className="mt-10 space-y-6">
                <div>
                  <h2 className="text-3xl font-black italic text-brand-primary">Entrar</h2>
                  <p className="mt-2 text-sm font-bold text-slate-400 uppercase tracking-[0.18em]">Acesso administrativo</p>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Email</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-14 w-full rounded-[24px] border border-brand-primary/10 bg-pale-bg px-5 text-sm font-bold text-slate-700 outline-none transition-all focus:border-brand-primary/30 focus:bg-white"
                    placeholder="Email"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Senha</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={passcode}
                    onChange={(event) => setPasscode(event.target.value)}
                    className="h-14 w-full rounded-[24px] border border-brand-primary/10 bg-pale-bg px-5 text-sm font-bold text-slate-700 outline-none transition-all focus:border-brand-primary/30 focus:bg-white"
                    placeholder="Introduza a senha do back office"
                  />
                </label>

                {errorMessage && (
                  <div className="rounded-[24px] border border-brand-accent/10 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex h-16 w-full items-center justify-center gap-3 rounded-[28px] bg-gradient-fruit text-lg font-black text-white shadow-[0_20px_45px_rgba(255,107,0,0.25)] transition-all hover:translate-y-[-2px] disabled:opacity-60"
                >
                  {isBusy && <Loader2 className="animate-spin" />}
                  Abrir back office
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pale-bg">
      <div className="border-b-2 border-brand-primary/5 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-brand-primary">
              <Shield size={14} />
              Painel Administrativo
            </div>
            <h1 className="mt-4 text-4xl sm:text-5xl font-black italic text-brand-primary">Frutaria em Casa</h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Produtos, pagamentos, pedidos e controlo operacional.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void loadBootstrap()}
              className="inline-flex h-12 items-center gap-2 rounded-[20px] border border-brand-primary/10 bg-white px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-500 transition-colors hover:border-brand-primary/30 hover:text-brand-primary"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <Link to="/" className="inline-flex h-12 items-center gap-2 rounded-[20px] bg-slate-900 px-5 text-sm font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-primary">
              <ArrowLeft size={16} />
              Ver loja
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-10 sm:py-10">
        <AnimatePresence>
          {errorMessage && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">
              {errorMessage}
            </motion.div>
          )}
          {successMessage && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-6 rounded-[24px] border border-brand-secondary/20 bg-brand-secondary/10 px-5 py-4 text-sm font-bold text-emerald-700">
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {!bootstrap ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-[40px] border-2 border-brand-primary/10 bg-white shadow-xl">
            <div className="flex items-center gap-3 text-brand-primary">
              <Loader2 className="animate-spin" />
              <span className="text-lg font-black uppercase tracking-[0.2em]">A carregar dados</span>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-4 shadow-xl h-fit">
              {[
                ['overview', 'Resumo', LayoutDashboard],
                ['products', 'Produtos', Package],
                ['orders', 'Pedidos', ShoppingCart],
                ['payments', 'Pagamentos', CreditCard],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  onClick={() => setActiveTab(value as 'overview' | 'products' | 'orders' | 'payments')}
                  className={`mb-2 flex w-full items-center gap-3 rounded-[24px] px-4 py-4 text-left text-sm font-black uppercase tracking-[0.16em] transition-all ${
                    activeTab === value ? 'bg-gradient-fruit text-white shadow-lg' : 'text-slate-500 hover:bg-brand-primary/5 hover:text-brand-primary'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  void (async () => {
                    try {
                      if (csrfToken) {
                        await adminLogout(csrfToken);
                      }
                    } catch {
                      // Clear local admin state even if the server-side logout request fails.
                    } finally {
                      resetAdminSession();
                      setSuccessMessage(null);
                    }
                  })();
                }}
                className="mt-6 flex w-full items-center justify-center rounded-[24px] border border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400 transition-colors hover:border-brand-primary/20 hover:text-brand-primary"
              >
                Terminar sessão
              </button>
            </aside>

            <div className="space-y-8">
              {activeTab === 'overview' && (
                <section className="space-y-8">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['Produtos', bootstrap.dashboard.counts.products, Package],
                      ['Ativos', bootstrap.dashboard.counts.activeProducts, Plus],
                      ['Pedidos', bootstrap.dashboard.counts.orders, ShoppingCart],
                      ['Receita paga', formatCurrency(bootstrap.dashboard.revenue), CreditCard],
                    ].map(([label, value, Icon]) => (
                      <div key={label} className="rounded-[32px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between text-brand-primary">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
                          <Icon size={18} />
                        </div>
                        <p className="mt-6 text-4xl font-black italic text-brand-primary">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                      <h2 className="text-2xl font-black italic text-brand-primary">Pedidos recentes</h2>
                      <div className="mt-6 space-y-4">
                        {bootstrap.dashboard.recentOrders.map((order) => (
                          <div key={order.id} className="rounded-[28px] border border-brand-primary/10 bg-pale-bg p-5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-lg font-black italic text-brand-primary">{order.number}</p>
                                <p className="text-sm font-bold text-slate-500">{order.customer.name} · {formatDate(order.createdAt)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">{paymentMethodLabel(order.paymentMethod)}</p>
                                <p className="text-xl font-black text-slate-800">{formatCurrency(order.total)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                      <h2 className="text-2xl font-black italic text-brand-primary">Canais ativos</h2>
                      <div className="mt-6 grid gap-4">
                        {[
                          ['Cartão', bootstrap.paymentSettings.stripeEnabled, CreditCard],
                          ['MBWay', bootstrap.paymentSettings.mbwayEnabled, Smartphone],
                          ['Transferência', bootstrap.paymentSettings.transferEnabled, Landmark],
                          ['Dinheiro', bootstrap.paymentSettings.cashEnabled, Banknote],
                        ].map(([label, enabled, Icon]) => (
                          <div key={label} className="flex items-center justify-between rounded-[24px] bg-pale-bg px-5 py-4">
                            <div className="flex items-center gap-3 text-brand-primary">
                              <Icon size={18} />
                              <span className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">{label}</span>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${enabled ? 'bg-brand-secondary/15 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                              {enabled ? 'Ativo' : 'Desligado'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'products' && (
                <section className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
                  <form onSubmit={handleProductSubmit} autoComplete="off" className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl space-y-5 h-fit">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black italic text-brand-primary">{editingProductId ? 'Editar produto' : 'Novo produto'}</h2>
                        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Imagem, preço, categoria e visibilidade.</p>
                      </div>
                      {editingProductId && (
                        <button type="button" onClick={resetProductForm} className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 hover:text-brand-primary">
                          Novo registo
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Nome</span>
                        <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} autoComplete="off" spellCheck={false} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Preço (€)</span>
                        <input
                          value={productForm.price}
                          onChange={(event) => {
                            // Aceita "0,25" e "0.25"; remove tudo o que não é dígito ou separador
                            // decimal e garante apenas um separador. Mantém o input como texto
                            // para evitar problemas de locale do type="number".
                            let v = event.target.value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                            const firstDot = v.indexOf('.');
                            if (firstDot !== -1) {
                              v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
                            }
                            // limita a 2 casas decimais para evitar 0.200 (cêntimos só)
                            if (firstDot !== -1) {
                              const [intPart, decPart = ''] = v.split('.');
                              v = `${intPart}.${decPart.slice(0, 2)}`;
                            }
                            setProductForm((current) => ({ ...current, price: v }));
                          }}
                          type="text"
                          inputMode="decimal"
                          placeholder="ex.: 0,25 ou 1.90"
                          autoComplete="off"
                          className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white"
                        />
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Para produtos por kg, este valor é o preço por 1 quilo. Para "Estimado", é o preço da embalagem.
                        </p>
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Unidade base</span>
                        <select
                          value={unitOptions.some((o) => o.value === productForm.unit) ? productForm.unit : 'kg'}
                          onChange={(event) => setProductForm((current) => ({
                            ...current,
                            unit: event.target.value,
                            approxWeightGrams: (event.target.value === 'estimado' || event.target.value === 'kg') ? current.approxWeightGrams : '',
                          }))}
                          className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white"
                        >
                          {unitOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {unitOptions.find((o) => o.value === (unitOptions.some((u) => u.value === productForm.unit) ? productForm.unit : 'kg'))?.hint}
                        </p>
                      </label>
                      {(productForm.unit === 'estimado' || productForm.unit === 'kg') && (
                        <label className="block sm:col-span-2">
                          <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                            {productForm.unit === 'kg' ? `Peso médio por unidade (g) — opcional, mín. ${MIN_AVG_WEIGHT_GRAMS}g` : `Peso aproximado por unidade (g) — mín. ${MIN_AVG_WEIGHT_GRAMS}g`}
                          </span>
                          <input
                            value={productForm.approxWeightGrams}
                            onChange={(event) => setProductForm((current) => ({ ...current, approxWeightGrams: event.target.value.replace(/[^0-9]/g, '') }))}
                            onWheel={(event) => (event.currentTarget as HTMLInputElement).blur()}
                            inputMode="numeric"
                            placeholder="ex: 190"
                            autoComplete="off"
                            className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white"
                          />
                          {productForm.unit === 'kg' ? (() => {
                            const grams = Number(String(productForm.approxWeightGrams).replace(',', '.').trim());
                            const priceKg = Number(String(productForm.price).replace(',', '.').trim());
                            const hasGrams = Number.isFinite(grams) && grams > 0;
                            const tooLow = hasGrams && grams < MIN_AVG_WEIGHT_GRAMS;
                            const valid = hasGrams && !tooLow && Number.isFinite(priceKg) && priceKg > 0;
                            const unitPrice = valid ? Math.round(priceKg * (grams / 1000) * 100) / 100 : 0;
                            return (
                              <p className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${tooLow ? 'text-red-500' : 'text-slate-400'}`}>
                                {tooLow
                                  ? `Peso médio demasiado baixo. Mínimo ${MIN_AVG_WEIGHT_GRAMS}g.`
                                  : valid
                                    ? `À unidade ≈ ${unitPrice.toFixed(2).replace('.', ',')}€ (${grams}g). Deixe vazio para vender só a kg.`
                                    : `Opcional. Define o peso médio de 1 unidade (mín. ${MIN_AVG_WEIGHT_GRAMS}g) para permitir a venda à unidade com preço calculado.`}
                              </p>
                            );
                          })() : (
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Será mostrado ao cliente como "≈ {productForm.approxWeightGrams || 'XXX'}g".</p>
                          )}
                        </label>
                      )}
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Categoria</span>
                        {(() => {
                          const existingCategories = Array.from(new Set(
                            [...(bootstrap?.products ?? []).map((p) => p.category), 'fruta', 'legume', 'sopa', 'outros']
                              .filter((c) => c && c.trim().length > 0)
                              .map((c) => c.trim().toLowerCase()),
                          )).sort();
                          const currentCategory = productForm.category.trim().toLowerCase();
                          const isCustom = currentCategory.length > 0 && !existingCategories.includes(currentCategory);
                          const selectValue = isCustom ? '__new__' : currentCategory;
                          return (
                            <div className="flex gap-2">
                              <select
                                value={selectValue}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === '__new__') {
                                    const created = window.prompt('Nome da nova categoria:')?.trim().toLowerCase();
                                    if (created) {
                                      setProductForm((current) => ({ ...current, category: created }));
                                    }
                                    return;
                                  }
                                  setProductForm((current) => ({ ...current, category: value }));
                                }}
                                className="h-13 flex-1 rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white"
                              >
                                {existingCategories.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                                {isCustom && (
                                  <option value={currentCategory}>{currentCategory}</option>
                                )}
                                <option value="__new__">＋ Criar nova categoria…</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const created = window.prompt('Nome da nova categoria:')?.trim().toLowerCase();
                                  if (created) {
                                    setProductForm((current) => ({ ...current, category: created }));
                                  }
                                }}
                                className="h-13 w-13 shrink-0 rounded-[22px] border-2 border-brand-primary/20 bg-brand-primary/5 text-brand-primary text-xl font-black hover:bg-brand-primary/10"
                                title="Criar nova categoria"
                              >
                                +
                              </button>
                            </div>
                          );
                        })()}
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Escolha uma existente ou clique no "+" para criar uma nova.</p>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">URL ou imagem incorporada</span>
                        <input value={productForm.image} onChange={(event) => setProductForm((current) => ({ ...current, image: event.target.value }))} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" placeholder="https://... ou carregue um ficheiro" />
                      </label>
                      <label className="sm:col-span-2 flex items-center justify-center gap-3 rounded-[24px] border border-dashed border-brand-primary/20 bg-brand-primary/5 px-4 py-4 text-sm font-black uppercase tracking-[0.16em] text-brand-primary cursor-pointer hover:bg-brand-primary/10">
                        <Upload size={16} />
                        Carregar imagem
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Descrição</span>
                        <textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 py-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Variantes (opcional)</span>
                        <input
                          value={productForm.variants}
                          onChange={(event) => setProductForm((current) => ({ ...current, variants: event.target.value }))}
                          placeholder="ex: verde, vermelho, amarelo"
                          className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white"
                        />
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Separe por vírgulas. O cliente clica para alternar.</p>
                      </label>
                    </div>

                    <label className="flex items-center gap-3 rounded-[22px] bg-pale-bg px-4 py-4 text-sm font-bold text-slate-600">
                      <input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 rounded border-brand-primary/20 text-brand-primary focus:ring-brand-primary" />
                      Produto visível na loja pública
                    </label>

                    {productForm.image && (
                      <div className="rounded-[28px] border border-brand-primary/10 bg-pale-bg p-4">
                        <SmartImage src={productForm.image} alt={productForm.name || 'Pre-visualizacao'} fallbackLabel={productForm.name || 'Produto'} className="h-48 w-full rounded-[24px] object-cover" />
                      </div>
                    )}

                    <button type="submit" disabled={isBusy} className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] bg-gradient-fruit text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-brand-primary/20">
                      {isBusy && <Loader2 className="animate-spin" />}
                      <Save size={16} />
                      {editingProductId ? 'Guardar alterações' : 'Criar produto'}
                    </button>
                  </form>

                  <div className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-2xl font-black italic text-brand-primary">Catálogo</h2>
                        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">{bootstrap.products.length} produtos registados</p>
                      </div>
                      <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Pesquisar no catálogo" className="h-12 rounded-[20px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </div>

                    <div className="mt-6 space-y-4 max-h-[980px] overflow-y-auto pr-2">
                      {filteredProducts.map((product) => (
                        <div key={product.id} className="grid gap-4 rounded-[28px] border border-brand-primary/10 bg-pale-bg p-4 md:grid-cols-[92px_minmax(0,1fr)_auto] md:items-center">
                          <SmartImage src={product.image} alt={product.name} fallbackLabel={product.name} className="h-24 w-24 rounded-[22px] object-cover" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-black italic text-brand-primary">{product.name}</h3>
                              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${product.active === false ? 'bg-slate-200 text-slate-500' : 'bg-brand-secondary/15 text-emerald-700'}`}>
                                {product.active === false ? 'Oculto' : 'Ativo'}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-500">{product.description}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                              <span>{product.category}</span>
                              <span>{formatCurrency(product.price)} / {product.unit}</span>
                              {(product.unit || '').trim().toLowerCase() === 'kg' && typeof product.approxWeightGrams === 'number' && product.approxWeightGrams > 0 && (
                                <span className="text-emerald-600">À un. ≈ {product.approxWeightGrams}g · {formatCurrency(Math.round(product.price * product.approxWeightGrams / 1000 * 100) / 100)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 md:flex-col">
                            <button onClick={() => startEditingProduct(product)} className="inline-flex items-center justify-center rounded-[18px] border border-brand-primary/10 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500 hover:text-brand-primary">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => void handleProductDelete(product)} className="inline-flex items-center justify-center rounded-[18px] border border-red-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-500 hover:bg-red-50">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'orders' && (
                <section className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                  <div>
                    <h2 className="text-2xl font-black italic text-brand-primary">Pedidos</h2>
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Controle manual de produção, entrega e confirmação de pagamento.</p>
                  </div>

                  <div className="mt-6 space-y-5">
                    {bootstrap.orders.map((order) => (
                      <div key={order.id} className="rounded-[32px] border border-brand-primary/10 bg-pale-bg p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-2xl font-black italic text-brand-primary">{order.number}</h3>
                              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{paymentMethodLabel(order.paymentMethod)}</span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-500">{order.customer.name} · {order.customer.phone}</p>
                            <p className="mt-1 text-sm font-bold text-slate-400">{order.customer.address} · {order.customer.postalCode}</p>
                            {order.customer.deliveryDay && (
                              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-secondary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-secondary">
                                🚚 Entrega: {order.customer.deliveryDay === 'quinta' ? 'Quinta-feira' : 'Sexta-feira'}
                              </p>
                            )}
                            <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{formatDate(order.createdAt)}</p>
                          </div>
                          <div className="text-left lg:text-right">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Valor</p>
                            <p className="text-3xl font-black text-slate-800">{formatCurrency(order.total)}</p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                          <div className="rounded-[24px] bg-white p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Itens</p>
                            <div className="mt-3 space-y-3">
                              {order.items.map((item) => (
                                <div key={`${order.id}-${item.productId}-${item.selectedUnit}`} className="flex items-center justify-between gap-4 text-sm font-bold text-slate-600">
                                  <span>{item.name} · {item.quantity} {item.selectedUnit}</span>
                                  <span className="text-brand-primary">{formatCurrency(item.lineTotal)}</span>
                                </div>
                              ))}
                            </div>
                            {order.customerNote && (
                              <div className="mt-4 rounded-[20px] border-2 border-brand-primary/20 bg-brand-primary/5 p-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-primary">📝 Observação do cliente</p>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold text-slate-700">{order.customerNote}</p>
                              </div>
                            )}
                          </div>

                          <div className="grid gap-3 rounded-[24px] bg-white p-4">
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Estado do pedido</span>
                              <select value={orderDrafts[order.id]?.orderStatus || order.orderStatus} onChange={(event) => setOrderDrafts((current) => ({ ...current, [order.id]: { ...(current[order.id] || { notes: order.notes || '', paymentStatus: order.paymentStatus, orderStatus: order.orderStatus }), orderStatus: event.target.value as OrderStatus } }))} className="h-12 w-full rounded-[18px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white">
                                {orderStatusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Estado do pagamento</span>
                              <select value={orderDrafts[order.id]?.paymentStatus || order.paymentStatus} onChange={(event) => setOrderDrafts((current) => ({ ...current, [order.id]: { ...(current[order.id] || { notes: order.notes || '', paymentStatus: order.paymentStatus, orderStatus: order.orderStatus }), paymentStatus: event.target.value as PaymentStatus } }))} className="h-12 w-full rounded-[18px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white">
                                {paymentStatusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Notas internas</span>
                              <textarea value={orderDrafts[order.id]?.notes || ''} onChange={(event) => setOrderDrafts((current) => ({ ...current, [order.id]: { ...(current[order.id] || { paymentStatus: order.paymentStatus, orderStatus: order.orderStatus, notes: '' }), notes: event.target.value } }))} rows={3} className="w-full rounded-[18px] border border-brand-primary/10 bg-pale-bg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                            </label>
                            <button onClick={() => void handleOrderSave(order.id)} disabled={isBusy} className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-gradient-fruit px-4 text-xs font-black uppercase tracking-[0.18em] text-white">
                              {isBusy && <Loader2 className="animate-spin" />}
                              Guardar pedido
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'payments' && paymentForm && (
                <section className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
                  <form onSubmit={handlePaymentSettingsSave} className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl space-y-5">
                    <div>
                      <h2 className="text-2xl font-black italic text-brand-primary">Configurar pagamentos</h2>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Ative métodos e atualize dados de transferência e MBWay.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['stripeEnabled', 'Cartão', CreditCard],
                        ['mbwayEnabled', 'MBWay', Smartphone],
                        ['transferEnabled', 'Transferência', Landmark],
                        ['cashEnabled', 'Dinheiro', Banknote],
                      ].map(([field, label, Icon]) => (
                        <label key={field} className="flex items-center justify-between rounded-[24px] bg-pale-bg px-4 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-600">
                          <span className="flex items-center gap-2 text-brand-primary"><Icon size={16} /> {label}</span>
                          <input type="checkbox" checked={Boolean(paymentForm[field as keyof PaymentSettings])} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, [field]: event.target.checked }) : current)} className="h-4 w-4 rounded border-brand-primary/20 text-brand-primary focus:ring-brand-primary" />
                        </label>
                      ))}
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Número MBWay</span>
                      <input value={paymentForm.mbwayNumber} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, mbwayNumber: event.target.value }) : current)} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Titular / destinatário</span>
                      <input value={paymentForm.transferRecipient} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, transferRecipient: event.target.value }) : current)} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">IBAN</span>
                      <input value={paymentForm.transferIban} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, transferIban: event.target.value }) : current)} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Banco</span>
                      <input value={paymentForm.transferBank} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, transferBank: event.target.value }) : current)} className="h-13 w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Instruções para transferência</span>
                      <textarea value={paymentForm.transferInstructions} onChange={(event) => setPaymentForm((current) => current ? ({ ...current, transferInstructions: event.target.value }) : current)} rows={5} className="w-full rounded-[22px] border border-brand-primary/10 bg-pale-bg px-4 py-4 text-sm font-bold text-slate-700 outline-none focus:border-brand-primary/30 focus:bg-white" />
                    </label>

                    <button type="submit" disabled={isBusy} className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] bg-gradient-fruit text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-brand-primary/20">
                      {isBusy && <Loader2 className="animate-spin" />}
                      <Save size={16} />
                      Guardar pagamentos
                    </button>
                  </form>

                  <div className="rounded-[36px] border-2 border-brand-primary/10 bg-white p-6 shadow-xl">
                    <h2 className="text-2xl font-black italic text-brand-primary">Transferências e movimentos</h2>
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Registos de checkout e referências de pagamento criadas pelo sistema.</p>

                    <div className="mt-6 space-y-4 max-h-[980px] overflow-y-auto pr-2">
                      {bootstrap.payments.map((payment) => (
                        <div key={payment.id} className="rounded-[28px] border border-brand-primary/10 bg-pale-bg p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-lg font-black italic text-brand-primary">{paymentMethodLabel(payment.method)}</p>
                              <p className="text-sm font-bold text-slate-500">Encomenda {bootstrap.orders.find((order) => order.id === payment.orderId)?.number || payment.orderId}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xl font-black text-slate-800">{formatCurrency(payment.amount)}</p>
                              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{payment.status}</p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2 text-sm font-bold text-slate-500">
                            <p><span className="text-slate-400">Criado:</span> {formatDate(payment.createdAt)}</p>
                            {payment.externalReference && <p><span className="text-slate-400">Referência:</span> {payment.externalReference}</p>}
                            {payment.note && <p><span className="text-slate-400">Nota:</span> {payment.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}