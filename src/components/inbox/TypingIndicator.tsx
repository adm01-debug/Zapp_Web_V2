import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  isVisible?: boolean;
  userName?: string;
  className?: string;
  multipleUsers?: string[];
}

export function TypingIndicator({
  isVisible = true,
  userName = 'Contato',
  className,
  multipleUsers = [],
}: TypingIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const displayNames = multipleUsers.length > 0 ? multipleUsers : [userName];

  const getTypingText = () => {
    if (displayNames.length === 1) {
      return `${displayNames[0]} está digitando`;
    } else if (displayNames.length === 2) {
      return `${displayNames[0]} e ${displayNames[1]} estão digitando`;
    } else {
      return `${displayNames.length} pessoas estão digitando`;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 bg-card border border-border/30 rounded-2xl rounded-bl-md w-fit shadow-sm",
            className
          )}
        >
          {/* Bolinhas decorativas: o texto ao lado é quem anuncia o estado */}
          <div className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 bg-primary rounded-full"
                animate={reduceMotion ? { opacity: 0.5 } : {
                  y: [0, -5, 0],
                  opacity: [0.4, 1, 0.4],
                  scale: [0.9, 1.1, 0.9],
                }}
                transition={reduceMotion ? { duration: 0 } : {
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          {/* User name with typing text */}
          <motion.span
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-muted-foreground font-medium"
          >
            {getTypingText()}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Compact version for header
export function TypingIndicatorCompact({
  isVisible = true,
  className
}: {
  isVisible?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn("flex items-center gap-1", className)}
        >
          <motion.span
            className="text-success font-medium text-xs"
            animate={reduceMotion ? { opacity: 1 } : { opacity: [0.7, 1, 0.7] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.5, repeat: Infinity }}
          >
            digitando
          </motion.span>
          <div className="flex items-center gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 bg-success rounded-full"
                animate={reduceMotion ? { opacity: 0.6 } : { opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
