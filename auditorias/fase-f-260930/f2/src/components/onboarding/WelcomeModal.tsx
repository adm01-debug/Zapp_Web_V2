import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  userName?: string;
}

export const WelcomeModal = forwardRef<HTMLDivElement, WelcomeModalProps>(
  function WelcomeModal({ isOpen, onClose, onStartTour, userName }, ref) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-secondary/20 rounded-full blur-3xl" />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors z-10"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Animated icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Rocket className="w-10 h-10 text-primary-foreground" />
              </motion.div>
            </motion.div>

            {/* Welcome text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                Bem-vindo{userName ? `, ${userName.split(' ')[0]}` : ''}! 🎉
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Estamos felizes em ter você aqui! Quer fazer um tour rápido para conhecer 
                todas as funcionalidades da plataforma?
              </p>
            </motion.div>

            {/* Features preview */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-3 gap-3 mb-8"
            >
              {[
                { icon: '💬', label: 'Chat em tempo real' },
                { icon: '📊', label: 'Dashboard de metas' },
                { icon: '🔔', label: 'Alertas inteligentes' },
              ].map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="p-3 rounded-xl bg-muted/50"
                >
                  <span className="text-2xl mb-1 block">{feature.icon}</span>
                  <span className="text-xs text-muted-foreground">{feature.label}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
              >
                Pular tour
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={onStartTour}
              >
                <Play className="w-4 h-4" />
                Iniciar Tour Guiado
              </Button>
            </motion.div>

            {/* Skip hint */}
            <p className="text-xs text-muted-foreground mt-4">
              Você pode acessar o tour novamente nas configurações
            </p>
          </div>

          {/* Floating particles */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-primary/30"
              style={{
                left: `${20 + i * 15}%`,
                top: `${10 + i * 10}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            />
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
