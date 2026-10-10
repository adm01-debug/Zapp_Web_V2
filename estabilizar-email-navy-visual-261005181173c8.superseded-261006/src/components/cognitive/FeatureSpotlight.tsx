import React, { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Info, Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Feature Spotlight ─────────────────────────────────────
interface FeatureSpotlightProps {
  title: string;
  description: string;
  targetRef: React.RefObject<HTMLElement>;
  onDismiss: () => void;
  step?: number;
  totalSteps?: number;
}

export function FeatureSpotlight({ title, description, targetRef, onDismiss, step, totalSteps }: FeatureSpotlightProps) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useState(() => {
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      setPosition({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-background/60" />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ position: 'absolute', top: position.top - 8, left: position.left - 8, width: position.width + 16, height: position.height + 16 }}
        className="rounded-lg ring-4 ring-primary ring-offset-4 ring-offset-background"
      />
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        style={{ position: 'absolute', top: position.top + position.height + 20, left: position.left }}
        className="bg-popover border border-border rounded-lg shadow-xl p-4 max-w-sm"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onDismiss}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        {step && totalSteps && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{step} de {totalSteps}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className={cn("w-2 h-2 rounded-full", i + 1 === step ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Info Banner ───────────────────────────────────────────
interface InfoBannerProps {
  type?: 'info' | 'tip' | 'warning';
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function InfoBanner({ type = 'info', title, children, dismissible = false, onDismiss, className }: InfoBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const styles = {
    info: { bg: 'bg-info/10 border-info/20', icon: <Info className="w-5 h-5 text-info" /> },
    tip: { bg: 'bg-success/10 border-success/20', icon: <Lightbulb className="w-5 h-5 text-success" /> },
    warning: { bg: 'bg-warning/10 border-warning/20', icon: <HelpCircle className="w-5 h-5 text-warning" /> },
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={cn("flex items-start gap-3 p-4 rounded-lg border", styles[type].bg, className)}
    >
      {styles[type].icon}
      <div className="flex-1">
        {title && <h4 className="font-medium mb-1">{title}</h4>}
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
      {dismissible && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsVisible(false); onDismiss?.(); }}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </motion.div>
  );
}
