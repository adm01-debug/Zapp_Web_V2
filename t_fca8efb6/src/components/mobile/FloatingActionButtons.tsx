import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { haptics } from './SwipeGestures';

// Floating Action Button
interface FABProps {
  icon: React.ReactNode;
  onClick: () => void;
  label?: string;
  variant?: 'primary' | 'secondary' | 'whatsapp';
  size?: 'sm' | 'md' | 'lg';
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  className?: string;
  badge?: number;
  extended?: boolean;
}

const fabVariants = {
  primary: 'bg-primary text-primary-foreground hover:shadow-glow-primary-lg',
  secondary: 'bg-secondary text-secondary-foreground hover:shadow-glow-secondary-lg',
  whatsapp: 'bg-whatsapp text-primary-foreground hover:shadow-glow-whatsapp-lg',
};

const fabSizes = { sm: 'w-12 h-12', md: 'w-14 h-14', lg: 'w-16 h-16' };
const fabPositions = {
  'bottom-right': 'bottom-6 right-6',
  'bottom-left': 'bottom-6 left-6',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
};

export function FloatingActionButton({
  icon, onClick, label, variant = 'primary', size = 'md',
  position = 'bottom-right', className, badge, extended = false,
}: FABProps) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
      onClick={() => { haptics.medium(); onClick(); }}
      className={cn('fixed z-40 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center gap-2',
        fabVariants[variant], extended ? 'px-6' : fabSizes[size], fabPositions[position], 'safe-area-bottom', className)}>
      {icon}
      {extended && label && <span className="font-medium whitespace-nowrap">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}
    </motion.button>
  );
}

// Speed Dial FAB
interface SpeedDialAction { icon: React.ReactNode; label: string; onClick: () => void; color?: string; }
interface SpeedDialFABProps {
  mainIcon: React.ReactNode; openIcon?: React.ReactNode; actions: SpeedDialAction[];
  variant?: 'primary' | 'secondary' | 'whatsapp'; position?: 'bottom-right' | 'bottom-left'; className?: string;
}

export function SpeedDialFAB({ mainIcon, openIcon, actions, variant = 'primary', position = 'bottom-right', className }: SpeedDialFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const handleAction = (action: SpeedDialAction) => { haptics.selection(); action.onClick(); setIsOpen(false); };

  return (
    <div className={cn('fixed z-40', fabPositions[position], 'safe-area-bottom', className)}>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute bottom-16 flex flex-col-reverse gap-3">
            {actions.map((action, index) => (
              <motion.div key={index} initial={{ scale: 0, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0, y: 20, opacity: 0 }} transition={{ delay: index * 0.05 }} className="flex items-center gap-3">
                <span className="bg-card px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap">{action.label}</span>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleAction(action)}
                  className={cn('w-12 h-12 rounded-full shadow-lg flex items-center justify-center', action.color || 'bg-card text-foreground')}>
                  {action.icon}
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 bg-background/20 -z-10" />}
      </AnimatePresence>
      <motion.button animate={{ rotate: isOpen ? 45 : 0 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        onClick={() => { haptics.medium(); setIsOpen(!isOpen); }}
        className={cn('w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300', fabVariants[variant])}>
        {isOpen && openIcon ? openIcon : mainIcon}
      </motion.button>
    </div>
  );
}

// Keyboard Aware Container
export function KeyboardAwareContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setKeyboardHeight(Math.max(0, window.innerHeight - window.visualViewport.height));
      }
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return (
    <div ref={containerRef} className={cn('transition-all duration-200', className)} style={{ paddingBottom: keyboardHeight }}>
      {children}
    </div>
  );
}
