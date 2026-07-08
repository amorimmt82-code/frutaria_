import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Header from '../components/Header';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import LoadingScreen from '../components/LoadingScreen';
import AboutModal from '../components/AboutModal';
import AccountDrawer from '../components/AccountDrawer';
import { CartProvider } from '../context/CartContext';
import { AccountProvider } from '../context/AccountContext';
import { getCatalog } from '../lib/api';
import { Product } from '../types';

const CATEGORY_EMOJI: Record<string, string> = {
  fruta: '🍎',
  frutas: '🍎',
  legume: '🥦',
  legumes: '🥦',
  sopa: '🥣',
  sopas: '🥣',
  outros: '✨',
};

function categoryLabel(id: string) {
  const emoji = CATEGORY_EMOJI[id.toLowerCase()] ?? '🌿';
  const text = id.charAt(0).toUpperCase() + id.slice(1);
  return `${text} ${emoji}`;
}

export default function StorefrontPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [filter, setFilter] = useState<string>('Tudo');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  async function loadCatalog() {
    setIsLoading(true);
    try {
      const [catalog] = await Promise.all([
        getCatalog(),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
      setProducts(catalog.products);
      setCatalogError(null);
    } catch (error: unknown) {
      setCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar os produtos.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const timer = setTimeout(() => {
        scrollToProducts();
      }, 100);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [searchQuery]);

  const filteredProducts = products.filter((product) => {
    const matchesFilter = filter === 'Tudo' || product.category === filter;
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort();
  }, [products]);

  useEffect(() => {
    if (filter !== 'Tudo' && !availableCategories.includes(filter)) {
      setFilter('Tudo');
    }
  }, [availableCategories, filter]);

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <AccountProvider>
    <CartProvider>
      <AnimatePresence mode="wait">
        {isLoading && <LoadingScreen key="loading" />}
      </AnimatePresence>

      <div className="min-h-screen flex flex-col">
        <Header
          onOpenCart={() => setIsCartOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenAbout={() => setIsAboutOpen(true)}
          onOpenAccount={() => setIsAccountOpen(true)}
        />

        <main className="flex-1">
          <section className="relative py-12 lg:py-32 overflow-hidden bg-pale-bg">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,107,0,0.08),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(46,204,113,0.12),_transparent_28%)]" />
            <div className="container mx-auto px-6 lg:px-10 relative z-10 flex flex-col items-center text-center">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-brand-primary/10 text-brand-primary px-4 py-1.5 sm:px-6 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] mb-8 sm:mb-10 border-2 border-brand-primary/20 shadow-sm"
              >
                Colheita Fresca e Sumarenta 🍊
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-4xl sm:text-6xl md:text-9xl font-black text-brand-primary italic leading-[1] md:leading-[0.9] max-w-5xl mb-8 sm:mb-10 tracking-tighter"
              >
                O sabor da natureza, <span className="text-brand-secondary not-italic drop-shadow-sm">vivo</span> no seu prato.
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-lg md:text-2xl text-slate-500 max-w-3xl mb-10 sm:mb-12 leading-relaxed font-semibold px-4 sm:px-0"
              >
                Frutas e legumes que <span className="text-brand-primary">estalam</span> de frescura. Entrega direta do campo para sua casa em tempo recorde.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap justify-center gap-6"
              >
                <button
                  onClick={scrollToProducts}
                  className="bg-gradient-fruit text-white font-black h-16 sm:h-20 px-10 sm:px-16 rounded-[28px] sm:rounded-[32px] text-lg sm:text-xl hover:shadow-[0_20px_40px_rgba(255,107,0,0.3)] transition-all active:scale-95"
                >
                  Fazer Encomenda
                </button>
              </motion.div>
            </div>
          </section>

          <section className="bg-white py-12 sm:py-20 border-y-4 border-brand-primary/5">
            <div className="container mx-auto px-6 lg:px-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-16">
                {[
                  ['🚚', 'Entrega Expresso', 'Colhido de manhã, na mesa ao almoço.'],
                  ['🌿', 'Pureza Total', 'Sem químicos. Apenas a terra e o sol.'],
                  ['💖', 'Cuidado Humano', 'Cada fruta é escolhida a dedo para si.'],
                ].map(([emoji, title, description], index) => (
                  <motion.div key={title} whileHover={{ y: -5 }} className={`flex flex-col items-center text-center gap-4 sm:gap-6 ${index === 1 ? 'md:border-x-2 md:border-brand-primary/5 md:px-10' : ''}`}>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-primary/10 rounded-[28px] sm:rounded-[32px] flex items-center justify-center text-3xl sm:text-4xl shadow-inner border-2 border-brand-primary/10">
                      {emoji}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 uppercase text-xs sm:text-sm tracking-widest mb-1 sm:mb-2 italic">{title}</h4>
                      <p className="text-slate-400 font-bold text-sm sm:text-base px-10 sm:px-0">{description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-12 sm:py-32 bg-pale-bg" id="products">
            <div className="container mx-auto px-6 lg:px-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 sm:mb-20 gap-8">
                <div className="max-w-xl">
                  <h2 className="text-4xl sm:text-6xl md:text-8xl font-black text-brand-primary mb-4 sm:mb-6 italic leading-none">O Pomar de Hoje</h2>
                  <p className="text-slate-400 font-bold text-sm sm:text-xl uppercase tracking-tighter">Escolha a sua dose de saúde diária.</p>
                </div>
                <div className="overflow-x-auto pb-4 -mx-6 px-6 sm:mx-0 sm:px-0 scrollbar-hide">
                  <div className="flex gap-3 sm:gap-4 p-2 bg-white rounded-[28px] sm:rounded-[32px] shadow-xl border-2 border-brand-primary/5 inline-flex whitespace-nowrap">
                    {[
                      { id: 'Tudo', label: 'Todos' },
                      ...availableCategories.map((cat) => ({ id: cat, label: categoryLabel(cat) })),
                    ].map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setFilter(category.id)}
                        className={`px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${
                          filter === category.id
                            ? 'bg-gradient-fruit text-white shadow-lg shadow-brand-primary/30 scale-105'
                            : 'text-slate-300 hover:text-brand-primary'
                        }`}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {catalogError ? (
                <div className="bg-white border-2 border-brand-accent/10 rounded-[40px] p-8 sm:p-12 text-center shadow-xl">
                  <p className="text-5xl mb-4">🥕</p>
                  <h3 className="text-3xl font-black text-brand-primary italic mb-3">Não foi possível abrir o catálogo</h3>
                  <p className="text-slate-500 font-bold mb-8">{catalogError}</p>
                  <button
                    onClick={() => void loadCatalog()}
                    className="bg-gradient-fruit text-white font-black px-8 py-4 rounded-[24px] hover:shadow-[0_20px_40px_rgba(255,107,0,0.25)] transition-all"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <motion.div layout className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-12">
                  <AnimatePresence mode="popLayout">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((product) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          key={product.id}
                        >
                          <ProductCard product={product} />
                        </motion.div>
                      ))
                    ) : (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-20 text-center">
                        <p className="text-4xl mb-4">🔍</p>
                        <h3 className="text-2xl font-black text-brand-primary italic">Não encontramos nada...</h3>
                        <p className="text-slate-400 font-bold">Tente pesquisar por outro nome ou mudar de categoria.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </section>
        </main>

        <Footer />

        <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

        <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

        <AccountDrawer isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
      </div>
    </CartProvider>
    </AccountProvider>
  );
}