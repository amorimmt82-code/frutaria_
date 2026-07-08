import { motion } from 'motion/react';

export default function LoadingScreen() {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] bg-pale-bg flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="relative">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 10, -10, 0]
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 1.5,
            ease: "easeInOut" 
          }}
          className="text-9xl mb-8 select-none"
        >
          🍎
        </motion.div>
        
        <motion.div
           animate={{ 
             opacity: [0, 1, 0],
             y: [0, -40, -80],
             scale: [0.5, 1, 0.5]
           }}
           transition={{ 
             repeat: Infinity, 
             duration: 1,
             ease: "easeOut"
           }}
           className="absolute top-0 right-0 text-4xl pointer-events-none"
        >
          💧
        </motion.div>
      </div>

      <div className="text-center space-y-4 px-6">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-5xl md:text-7xl font-black text-brand-primary italic leading-none tracking-tighter"
        >
          Frutaria<br/>
          <span className="text-brand-secondary not-italic">em Casa</span>
        </motion.h1>
        
        <div className="relative w-48 h-2 bg-brand-primary/10 rounded-full mx-auto overflow-hidden">
          <motion.div 
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="absolute h-full bg-gradient-fruit rounded-full"
          />
        </div>
        
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400"
        >
          A colher o melhor para si...
        </motion.p>
      </div>
      
      {/* Decorative blobs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          x: [0, 30, 0],
          y: [0, -20, 0]
        }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="absolute -top-24 -left-24 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -z-10"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          x: [0, -40, 0],
          y: [0, 30, 0]
        }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
        className="absolute -bottom-32 -right-32 w-96 h-96 bg-brand-secondary/5 rounded-full blur-3xl -z-10"
      />
    </motion.div>
  );
}
