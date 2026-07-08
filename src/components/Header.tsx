import { ShoppingBasket, Search, X, User } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAccount } from '../context/AccountContext';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

export default function Header({ 
  onOpenCart, 
  searchQuery, 
  onSearchChange,
  onOpenAbout,
  onOpenAccount
}: { 
  onOpenCart: () => void, 
  searchQuery: string,
  onSearchChange: (value: string) => void,
  onOpenAbout: () => void,
  onOpenAccount: () => void
}) {
  const { cart } = useCart();
  const { account } = useAccount();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const itemCount = cart.length;

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-xl border-b-2 border-brand-primary/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-10 h-20 sm:h-24 flex items-center justify-between gap-4">
        <AnimatePresence>
          {!isMobileSearchOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ 
                opacity: 1, 
                x: 0,
                y: isLogoHovered ? 8 : 0,
                scale: isLogoHovered ? 0.98 : 1
              }}
              exit={{ opacity: 0, x: -20 }}
              onHoverStart={() => setIsLogoHovered(true)}
              onHoverEnd={() => setIsLogoHovered(false)}
              className="flex items-center gap-3 cursor-pointer group flex-shrink-0 relative h-full transition-all duration-300"
            >
              <div 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center gap-3"
              >
                <div className="relative">
                  <img
                    src="/media/logo.png"
                    alt="Frutaria em Casa"
                    className="w-12 h-12 md:w-14 md:h-14 rounded-2xl object-contain group-hover:rotate-12 transition-transform duration-300"
                  />
                </div>
                <div>
                  <h1 className="text-xl md:text-3xl font-black text-brand-primary italic leading-none">Frutaria</h1>
                  <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-brand-secondary">em casa — fresca e vivo</p>
                </div>
              </div>

              {/* Who are we button */}
              <AnimatePresence>
                {isLogoHovered && (
                  <motion.button
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: 1, y: 25 }}
                    exit={{ opacity: 0, y: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAbout();
                    }}
                    className="absolute top-full left-1/2 -translate-x-1/2 bg-brand-primary text-white text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-full shadow-[0_10px_20px_rgba(255,107,0,0.4)] z-50 whitespace-nowrap border-2 border-white hover:bg-brand-secondary transition-all hover:scale-105 active:scale-95"
                  >
                    Quem somos nós? 🤔
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Search */}
        <div className="flex-1 max-w-md relative hidden md:block">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-brand-primary/40">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar frutas, legumes..."
            className="w-full h-12 bg-pale-bg border-2 border-transparent focus:border-brand-primary/20 rounded-2xl pl-12 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none transition-all shadow-inner"
          />
        </div>

        {/* Mobile Search Toggle */}
        <AnimatePresence>
          {isMobileSearchOpen && (
            <motion.div 
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: '100%' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex-1 md:hidden relative flex items-center"
            >
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full h-12 bg-pale-bg border-2 border-brand-primary/20 rounded-2xl pl-4 pr-12 text-sm font-bold text-slate-800 focus:outline-none shadow-inner"
              />
              <button 
                onClick={() => { setIsMobileSearchOpen(false); onSearchChange(''); }}
                className="absolute right-2 p-2 text-brand-primary"
              >
                <X size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 md:gap-4">
          {!isMobileSearchOpen && (
            <button 
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-3 hover:bg-brand-primary/5 rounded-full transition-colors text-brand-primary"
            >
              <Search size={22} />
            </button>
          )}

          <button
            onClick={onOpenAccount}
            aria-label="A minha conta"
            title={account ? account.name : 'A minha conta'}
            className="group relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary text-white transition-all duration-300 hover:shadow-lg active:scale-95"
          >
            <User size={20} />
            {account && (
              <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </button>
          
          <button 
            onClick={onOpenCart}
            className="group relative p-3 bg-brand-primary text-white rounded-2xl md:rounded-full hover:shadow-lg transition-all duration-300 active:scale-95 flex items-center gap-2"
          >
            <ShoppingBasket size={20} />
            <span className="hidden md:inline font-black uppercase text-xs tracking-widest pl-1">Cesto</span>
            {itemCount > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-brand-secondary text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white"
              >
                {itemCount}
              </motion.span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
