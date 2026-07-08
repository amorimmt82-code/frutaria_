import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, Star, Users } from 'lucide-react';

export default function AboutModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl bg-white rounded-[40px] shadow-2xl z-[70] overflow-hidden flex flex-col md:flex-row"
          >
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-400 hover:text-brand-primary transition-colors z-10"
            >
              <X size={20} />
            </button>

            <div className="md:w-1/2 relative h-64 md:h-auto group-about">
              <img 
                src="/media/familia-frutaria.jpeg"
                alt="Frutaria em Casa - Alexandra, Paulo, Letícia e Vitória"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1974";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-60" />
              <div className="absolute bottom-6 left-6 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest bg-brand-primary px-3 py-1 rounded-full inline-block shadow-lg">
                  Óbidos, Portugal 🇵🇹
                </p>
              </div>
            </div>

            <div className="md:w-1/2 p-8 md:p-12 overflow-y-auto max-h-[60vh] md:max-h-auto">
              <div className="flex items-center gap-2 text-brand-primary mb-6">
                <Users size={20} className="fill-brand-primary/20" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Quem somos nós</span>
              </div>
              
              <h2 className="text-3xl font-black text-slate-800 italic leading-tight mb-8">
                Família Frutaria <br/>
                <span className="text-brand-primary">em Casa</span> 🌱
              </h2>

              <div className="space-y-6 text-slate-500 font-bold leading-relaxed text-sm">
                <p>
                  Para quem é novo por aqui, somos a <span className="text-brand-primary font-black">Frutaria em Casa</span> — uma equipa familiar composta pela Alexandra, Paulo e Letícia, responsáveis pela produção e gestão das vossas encomendas, e pela pequena Vitória, a nossa produtora mais jovem! 🌱
                </p>
                <p>
                  Somos uma família honesta e trabalhadora, dedicada a levar até vós produtos frescos e de qualidade, sempre com o maior cuidado e carinho.
                </p>
              </div>

              <div className="mt-12 pt-8 border-t-2 border-slate-50 flex items-center gap-6">
                <div className="flex -space-x-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center">
                      <Heart size={14} className="text-brand-primary fill-brand-primary/10" />
                    </div>
                  ))}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Feito com Amor em Óbidos
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
