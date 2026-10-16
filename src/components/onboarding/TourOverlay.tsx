import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTour } from './OnboardingTour';

export function TourOverlay() {
  const { isActive, currentStep, steps, nextStep, prevStep, endTour, goToStep } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const currentStepData = steps[currentStep];

  useEffect(() => {
    if (!isActive || !currentStepData) return;

    let retries = 0;
    const maxRetries = 10;
    let rafId: number;
    let retryTimeout: NodeJS.Timeout;

    const updatePosition = () => {
      const element = document.querySelector(currentStepData.target);
      if (!element) {
        retries++;
        if (retries < maxRetries) {
          retryTimeout = setTimeout(updatePosition, 200);
        } else {
          nextStep();
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        nextStep();
        return;
      }
      setTargetRect(rect);

      const padding = currentStepData.spotlightPadding || 8;
      const tooltipWidth = 320;
      const tooltipHeight = 200;
      const position = currentStepData.position || 'bottom';

      let x = rect.left + rect.width / 2 - tooltipWidth / 2;
      let y = rect.bottom + padding + 12;

      switch (position) {
        case 'top':
          y = rect.top - tooltipHeight - padding - 12;
          break;
        case 'left':
          x = rect.left - tooltipWidth - padding - 12;
          y = rect.top + rect.height / 2 - tooltipHeight / 2;
          break;
        case 'right':
          x = rect.right + padding + 12;
          y = rect.top + rect.height / 2 - tooltipHeight / 2;
          break;
      }

      x = Math.max(16, Math.min(x, window.innerWidth - tooltipWidth - 16));
      y = Math.max(16, Math.min(y, window.innerHeight - tooltipHeight - 16));

      setTooltipPosition({ x, y });
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    };

    retryTimeout = setTimeout(updatePosition, 100);

    const handleResize = () => {
      rafId = requestAnimationFrame(updatePosition);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(retryTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [isActive, currentStep, currentStepData, nextStep]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': endTour(); break;
        case 'ArrowRight':
        case 'Enter': nextStep(); break;
        case 'ArrowLeft': prevStep(); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nextStep, prevStep, endTour]);

  if (!isActive || !currentStepData || !targetRect) return null;

  const padding = currentStepData.spotlightPadding || 8;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000]"
      >
        {/* Dark overlay with spotlight cutout */}
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <motion.rect
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="12"
                fill="black"
              />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0, 0, 0, 0.75)" mask="url(#spotlight-mask)" />
        </svg>

        {/* Spotlight border/glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute rounded-xl pointer-events-none"
          style={{
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            boxShadow: '0 0 0 3px hsl(var(--primary)), 0 0 30px hsl(var(--primary) / 0.4)',
          }}
        />

        {/* Pulsing ring */}
        <motion.div
          className="absolute rounded-xl pointer-events-none border-2 border-primary/50"
          style={{
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
          }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ left: tooltipPosition.x, top: tooltipPosition.y, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
        >
          <div className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/20">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Passo {currentStep + 1} de {steps.length}
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={endTour}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-4">
            <h3 className="font-display font-semibold text-lg text-foreground mb-2">{currentStepData.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{currentStepData.description}</p>
          </div>

          <div className="flex justify-center gap-1.5 pb-3">
            {steps.map((_, index) => (
              <motion.div
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-all cursor-pointer',
                  index === currentStep ? 'bg-primary w-4' : index < currentStep ? 'bg-primary/50' : 'bg-muted-foreground/30'
                )}
                whileHover={{ scale: 1.2 }}
                onClick={() => goToStep(index)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between p-4 pt-2 border-t border-border/50">
            <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentStep === 0} className="gap-1">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button size="sm" onClick={nextStep} className="gap-1">
              {currentStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
              {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
