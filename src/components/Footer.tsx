import { Mail, Phone, MapPin } from 'lucide-react';
import { motion } from 'motion/react';

export default function Footer() {
  const images = [
    'https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400&auto=format&fit=crop&q=60',
  ];

  return (
    <footer className="bg-slate-900 text-white/80 px-6 sm:px-10 py-16 sm:py-24">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16">
          <div className="space-y-6 sm:space-y-8">
            <h2 className="text-3xl sm:text-4xl font-black italic text-brand-primary leading-none">Frutaria<br/><span className="text-white">em Casa</span></h2>
            <p className="text-slate-400 text-sm font-bold leading-relaxed max-w-xs">
              Levamos a frescura máxima do campo para a sua mesa, com o sabor autêntico da nossa terra.
            </p>
          </div>

          <div className="space-y-6 sm:space-y-8">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-brand-primary italic text-center md:text-left">Contactos</h4>
            <ul className="space-y-4 font-bold text-slate-300 flex flex-col items-center md:items-start">
              <li className="flex items-center gap-3"><Phone size={16} className="text-brand-primary" /> +351 919 881 410</li>
              <li className="flex items-center gap-3"><Mail size={16} className="text-brand-primary" /> frutariaemcasa2021@gmail.com</li>
              <li className="flex items-center gap-3 text-center md:text-left"><MapPin size={16} className="text-brand-primary" /> Óbidos, Portugal</li>
            </ul>
          </div>

          <div className="space-y-6 sm:space-y-8">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-brand-primary italic text-center md:text-left">Vida Fresh</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 md:grid-cols-2 gap-3">
              {images.map((img, i) => (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  key={i}
                  className="aspect-square rounded-xl sm:rounded-2xl overflow-hidden border-2 border-white/5"
                >
                  <img src={img} alt="Fruta" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
