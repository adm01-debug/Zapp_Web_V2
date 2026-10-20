import type { KeyboardEventHandler } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { focusSibling } from './roving-focus';
import type { ThemePreset } from './presets';

interface PresetCardProps {
  preset: ThemePreset;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function PresetCard({ preset, isActive, onSelect }: PresetCardProps) {
  const reducedMotion = useReducedMotion();
  const { id, name, description, emoji, swatches } = preset;

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === 'ArrowRight') {
      focusSibling(e, 1);
    } else if (e.key === 'ArrowLeft') {
      focusSibling(e, -1);
    } else if (e.key === 'Home') {
      focusSibling(e, 'home');
    } else if (e.key === 'End') {
      focusSibling(e, 'end');
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            role="radio"
            aria-checked={isActive}
            aria-label={`Skin ${name}: ${description}`}
            tabIndex={0}
            data-testid={`preset-card-${id}`}
            onClick={() => onSelect(id)}
            onKeyDown={handleKeyDown}
            whileHover={reducedMotion ? undefined : { scale: 1.04, y: -2 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            className={`relative cursor-pointer rounded-xl border-2 p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'border-primary shadow-lg shadow-primary/20'
                : 'border-border/40 hover:border-primary/40'
            }`}
          >
            {isActive && (
              <div
                className="pointer-events-none absolute inset-0 rounded-xl"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${swatches[0]}15 0%, transparent 70%)` }}
              />
            )}

            <div className="relative flex h-8 gap-0.5 overflow-hidden rounded-lg">
              {swatches.map((swatch, i) => (
                <motion.div
                  key={i}
                  className="relative flex-1 overflow-hidden"
                  style={{ backgroundColor: swatch }}
                  initial={{ height: '32px', opacity: 0.9 }}
                  whileHover={reducedMotion ? undefined : { height: '36px', opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                </motion.div>
              ))}
            </div>

            <div className="relative mt-2.5 flex items-center justify-between gap-1">
              <div className="min-w-0">
                <h3 className="truncate font-display text-xs font-bold text-foreground">
                  {emoji} {name}
                </h3>
                <p className="truncate text-2xs italic text-muted-foreground">{description}</p>
              </div>
              <AnimatePresence mode="wait">
                {isActive ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary"
                  >
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </motion.div>
                ) : (
                  <Eye className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {isActive && <p className="text-xs text-primary">✓ Skin ativa</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
