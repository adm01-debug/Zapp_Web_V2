import { useState, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Re-export extracted components
export { FeatureSpotlight, InfoBanner } from './FeatureSpotlight';

// Progressive Disclosure Context
interface DisclosureContextType {
  level: 'basic' | 'intermediate' | 'advanced';
  setLevel: (level: 'basic' | 'intermediate' | 'advanced') => void;
}

const DisclosureContext = createContext<DisclosureContextType>({ level: 'basic', setLevel: () => {} });

export function useDisclosureLevel() { return useContext(DisclosureContext); }

export function DisclosureProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<'basic' | 'intermediate' | 'advanced'>('basic');
  return <DisclosureContext.Provider value={{ level, setLevel }}>{children}</DisclosureContext.Provider>;
}

// Expandable Section
interface ExpandableSectionProps {
  title: string; children: ReactNode; defaultOpen?: boolean;
  level?: 'basic' | 'intermediate' | 'advanced'; badge?: string; className?: string;
}

export function ExpandableSection({ title, children, defaultOpen = false, level = 'basic', badge, className }: ExpandableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { level: currentLevel } = useDisclosureLevel();
  const levelOrder = { basic: 0, intermediate: 1, advanced: 2 };
  if (levelOrder[level] > levelOrder[currentLevel]) return null;

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden", className)}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}><ChevronRight className="w-4 h-4 text-muted-foreground" /></motion.div>
          <span className="font-medium">{title}</span>
          {badge && <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">{badge}</span>}
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="p-4 border-t border-border">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Show More
interface ShowMoreProps { children: ReactNode; previewLines?: number; showLabel?: string; hideLabel?: string; }

export function ShowMore({ children, previewLines = 3, showLabel = "Mostrar mais", hideLabel = "Mostrar menos" }: ShowMoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="relative">
      <motion.div animate={{ maxHeight: isExpanded ? 1000 : previewLines * 24 }} className="overflow-hidden">{children}</motion.div>
      {!isExpanded && <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />}
      <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="mt-2 w-full">
        <ChevronDown className={cn("w-4 h-4 mr-2 transition-transform", isExpanded && "rotate-180")} />
        {isExpanded ? hideLabel : showLabel}
      </Button>
    </div>
  );
}

// Contextual Tooltip
interface ContextualTooltipProps { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; }

export function ContextualTooltip({ content, children, side = 'top' }: ContextualTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2', right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-block" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className={cn("absolute z-50 px-3 py-2 text-sm bg-popover border border-border rounded-lg shadow-lg max-w-xs", positions[side])}>{content}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Level Selector
export function DisclosureLevelSelector() {
  const { level, setLevel } = useDisclosureLevel();
  const levels = [
    { value: 'basic', label: 'Básico', description: 'Funções essenciais' },
    { value: 'intermediate', label: 'Intermediário', description: 'Mais opções' },
    { value: 'advanced', label: 'Avançado', description: 'Todas as funções' },
  ] as const;

  return (
    <div className="flex gap-2 p-1 bg-muted rounded-lg">
      {levels.map((l) => (
        <button key={l.value} onClick={() => setLevel(l.value)}
          className={cn("flex-1 px-4 py-2 rounded-md text-sm transition-all", level === l.value ? "bg-background shadow-sm" : "hover:bg-background/50")}>
          <div className="font-medium">{l.label}</div>
          <div className="text-xs text-muted-foreground">{l.description}</div>
        </button>
      ))}
    </div>
  );
}
