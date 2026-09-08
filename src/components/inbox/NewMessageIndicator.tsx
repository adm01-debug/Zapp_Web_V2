import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NewMessageIndicatorProps {
  show: boolean;
  contactName: string;
  contactAvatar?: string | null;
  message: string;
  onView: () => void;
  onDismiss: () => void;
}

export function NewMessageIndicator({
  show,
  contactName,
  contactAvatar,
  message,
  onView,
  onDismiss,
}: NewMessageIndicatorProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-20 right-4 z-[100] max-w-sm"
        >
          <motion.div
            className={cn(
              'relative overflow-hidden rounded-xl border border-primary/30',
              'bg-card/95 backdrop-blur-md shadow-2xl',
              'shadow-primary/20'
            )}
            whileHover={{ scale: 1.02 }}
          >
            {/* Animated background glow */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20"
              animate={{
                x: ['-100%', '100%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />

            {/* Pulsing border effect */}
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-primary/50"
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            <div className="relative p-4">
              <div className="flex items-start gap-3">
                {/* Avatar with pulse animation */}
                <div className="relative">
                  <motion.div
                    className="absolute -inset-1 rounded-full bg-primary/30"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                  />
                  <Avatar className="w-12 h-12 ring-2 ring-primary/50">
                    <AvatarImage src={contactAvatar || undefined} alt="Avatar do contato" />
                    <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                      {contactName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {/* New message badge */}
                  <motion.div
                    className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <MessageSquare className="w-3 h-3 text-primary-foreground" />
                  </motion.div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <motion.p
                      className="font-semibold text-foreground"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      {contactName}
                    </motion.p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 hover:bg-muted/50"
                      onClick={onDismiss}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <motion.p
                    className="text-sm text-muted-foreground truncate"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {message}
                  </motion.p>
                </div>
              </div>

              {/* Action buttons */}
              <motion.div
                className="flex gap-2 mt-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Button
                  size="sm"
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={onView}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ver mensagem
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border/50"
                  onClick={onDismiss}
                >
                  Depois
                </Button>
              </motion.div>
            </div>

            {/* Auto-dismiss progress bar */}
            <motion.div
              className="h-1 bg-primary/50"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 8, ease: 'linear' }}
              onAnimationComplete={onDismiss}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
