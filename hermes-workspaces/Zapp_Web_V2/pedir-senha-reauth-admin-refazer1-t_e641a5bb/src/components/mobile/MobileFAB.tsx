import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquarePlus, Users, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface FABAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface MobileFABProps {
  onNewConversation?: () => void;
  onNewContact?: () => void;
  onNewCampaign?: () => void;
  className?: string;
}

export function MobileFAB({ onNewConversation, onNewContact, onNewCampaign, className }: MobileFABProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions: FABAction[] = [
    ...(onNewConversation ? [{
      id: 'conversation',
      icon: <MessageSquarePlus className="w-5 h-5" />,
      label: 'Nova conversa',
      onClick: () => { onNewConversation(); setIsOpen(false); },
    }] : []),
    ...(onNewContact ? [{
      id: 'contact',
      icon: <Users className="w-5 h-5" />,
      label: 'Novo contato',
      onClick: () => { onNewContact(); setIsOpen(false); },
    }] : []),
    ...(onNewCampaign ? [{
      id: 'campaign',
      icon: <Megaphone className="w-5 h-5" />,
      label: 'Nova campanha',
      onClick: () => { onNewCampaign(); setIsOpen(false); },
    }] : []),
  ];

  return (
    <div className={cn('fixed right-4 bottom-[76px] z-40', className)}>
      {/* Action items */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 z-30"
              onClick={() => setIsOpen(false)}
            />
            
            <div className="absolute bottom-14 right-0 z-40 flex flex-col-reverse gap-3 items-end mb-2">
              {actions.map((action, i) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 16, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs font-medium text-foreground bg-card px-3 py-1.5 rounded-lg shadow-md border border-border/40 whitespace-nowrap">
                    {action.label}
                  </span>
                  <button
                    onClick={action.onClick}
                    className="w-11 h-11 rounded-full bg-card shadow-lg border border-border/40 flex items-center justify-center text-foreground hover:bg-accent active:scale-95 transition-transform touch-manipulation"
                  >
                    {action.icon}
                  </button>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Main FAB with contextual icon */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (navigator.vibrate) navigator.vibrate(5);
          setIsOpen(!isOpen);
        }}
        className="relative z-40 h-14 rounded-full shadow-xl flex items-center justify-center text-primary-foreground touch-manipulation gap-2 px-5"
        style={{ background: 'var(--gradient-primary)' }}
        aria-label="Ações rápidas"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {isOpen ? <Plus className="w-6 h-6" /> : <MessageSquarePlus className="w-5 h-5" />}
        </motion.div>
        <AnimatePresence>
          {!isOpen && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="text-sm font-semibold whitespace-nowrap overflow-hidden"
            >
              Novo
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
