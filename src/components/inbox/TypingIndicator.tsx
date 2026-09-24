import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  isVisible?: boolean;
  userName?: string;
  className?: string;
  variant?: 'default' | 'bubble' | 'minimal' | 'avatar';
  avatarUrl?: string;
  multipleUsers?: string[];
}

export function TypingIndicator({ 
  isVisible = true, 
  userName = 'Contato',
  className,
  variant = 'default',
  avatarUrl,
  multipleUsers = [],
}: TypingIndicatorProps) {
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

  if (variant === 'bubble') {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              "relative flex items-center gap-3 px-4 py-3 bg-muted border border-border/40 rounded-2xl rounded-bl-md w-fit shadow-lg",
              className
            )}
          >
            {/* Glow effect */}
            <motion.div
              className="absolute inset-0 rounded-2xl rounded-bl-md bg-primary/5"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            
            {/* Avatar */}
            {avatarUrl && (
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="relative z-10"
              >
                <img 
                  src={avatarUrl} 
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20"
                />
                <motion.div
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              </motion.div>
            )}

            {/* Animated typing dots */}
            <div className="relative z-10 flex items-center gap-1.5 p-1.5 rounded-full bg-background/60">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-2.5 h-2.5 bg-gradient-to-t from-primary to-primary/60 rounded-full shadow-sm"
                  animate={{
                    y: [0, -6, 0],
                    scale: [0.85, 1.15, 0.85],
                  }}
                  transition={{
                    duration: 0.7,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            
            {/* User name */}
            <motion.span
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative z-10 text-sm text-foreground/80 font-medium"
            >
              {getTypingText()}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (variant === 'minimal') {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("flex items-center gap-2", className)}
          >
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 bg-primary/70 rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground italic">
              {getTypingText()}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (variant === 'avatar') {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn("flex items-center gap-2", className)}
          >
            {/* Multiple avatars stacked */}
            <div className="flex -space-x-2">
              {displayNames.slice(0, 3).map((name, i) => (
                <motion.div
                  key={name}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-3xs font-bold text-primary-foreground border-2 border-background">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <motion.div
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border border-background"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                  />
                </motion.div>
              ))}
            </div>
            
            {/* Typing dots bubble */}
            <motion.div
              animate={{ x: [0, 2, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-muted/80 border border-border/50"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 bg-primary rounded-full"
                  animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Default variant
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 bg-card border border-border/30 rounded-2xl rounded-bl-md w-fit shadow-sm",
            className
          )}
        >
          {/* Typing dots */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 bg-primary rounded-full"
                animate={{
                  y: [0, -5, 0],
                  opacity: [0.4, 1, 0.4],
                  scale: [0.9, 1.1, 0.9],
                }}
                transition={{
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
            initial={{ opacity: 0 }}
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
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn("flex items-center gap-1", className)}
        >
          <motion.span 
            className="text-success font-medium text-xs"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            digitando
          </motion.span>
          <div className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 bg-success rounded-full"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Inline version for chat header
export function TypingIndicatorInline({
  isVisible = true,
  userName = 'Contato',
  className,
}: {
  isVisible?: boolean;
  userName?: string;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key="typing"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={cn("overflow-hidden", className)}
        >
          <div className="flex items-center gap-2 text-sm text-success">
            <motion.span
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {userName} está digitando
            </motion.span>
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 bg-success rounded-full"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
