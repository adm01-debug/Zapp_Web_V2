import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTour } from './OnboardingTour';
import { alvoDeTourNoDom } from './defaultTourSteps';

/** Focáveis de dentro do cartão — usados para prender o foco (SHELL-06). */
const FOCO_NO_CARTAO =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function TourOverlay() {
  const { isActive, currentStep, steps, nextStep, prevStep, endTour, goToStep } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);

  // SHELL-05: só valem os passos cujo alvo existe no DOM agora — o casco do celular
  // não monta o Sidebar do desktop, não tem `[data-tour]` nenhum, e o tour não pode
  // parar num passo vazio (antes eram 10 tentativas de 200 ms por passo e o overlay
  // terminava o tour sem mostrar um cartão sequer).
  const indicesDisponiveis = useMemo(
    () =>
      isActive
        ? steps.map((_, indice) => indice).filter((indice) => alvoDeTourNoDom(steps[indice].target))
        : [],
    [isActive, steps],
  );
  const passoAtualDisponivel = indicesDisponiveis.includes(currentStep);
  const currentStepData = steps[currentStep];
  const temProximo = indicesDisponiveis.some((indice) => indice > currentStep);
  const temAnterior = indicesDisponiveis.some((indice) => indice < currentStep);
  const cartaoVisivel = isActive && passoAtualDisponivel && targetRect !== null;

  const irParaProximo = useCallback(() => {
    // Sem passo com alvo o cartão não existe; preserva a navegação do provider.
    if (indicesDisponiveis.length === 0) {
      nextStep();
      return;
    }
    const proximo = indicesDisponiveis.find((indice) => indice > currentStep);
    if (proximo === undefined) endTour();
    else goToStep(proximo);
  }, [indicesDisponiveis, currentStep, nextStep, endTour, goToStep]);

  const irParaAnterior = useCallback(() => {
    if (indicesDisponiveis.length === 0) {
      prevStep();
      return;
    }
    const anterior = [...indicesDisponiveis].reverse().find((indice) => indice < currentStep);
    if (anterior !== undefined) goToStep(anterior);
  }, [indicesDisponiveis, currentStep, prevStep, goToStep]);

  // SHELL-06: o foco não escapa para o menu atrás do overlay.
  const prenderFocoNoCartao = useCallback((evento: KeyboardEvent) => {
    const cartao = cardRef.current;
    if (!cartao) return;
    const focaveis = Array.from(cartao.querySelectorAll<HTMLElement>(FOCO_NO_CARTAO));
    if (focaveis.length === 0) {
      evento.preventDefault();
      cartao.focus();
      return;
    }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const atual = document.activeElement;
    const foraDoCartao = !(atual instanceof Node) || !cartao.contains(atual);
    if (evento.shiftKey) {
      if (foraDoCartao || atual === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      }
    } else if (foraDoCartao || atual === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }, []);

  // Passo do contexto sem alvo (item escondido por papel/hierarquia): usa o primeiro que tem.
  useEffect(() => {
    if (!isActive || indicesDisponiveis.length === 0) return;
    if (indicesDisponiveis.includes(currentStep)) return;
    goToStep(indicesDisponiveis[0]);
  }, [isActive, indicesDisponiveis, currentStep, goToStep]);

  useEffect(() => {
    if (!isActive || !currentStepData || !passoAtualDisponivel) return;

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
          irParaProximo();
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        irParaProximo();
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
  }, [isActive, currentStep, currentStepData, passoAtualDisponivel, irParaProximo]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': endTour(); break;
        case 'ArrowRight':
        case 'Enter': irParaProximo(); break;
        case 'ArrowLeft': irParaAnterior(); break;
        case 'Tab': prenderFocoNoCartao(e); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, irParaProximo, irParaAnterior, endTour, prenderFocoNoCartao]);

  // SHELL-06: guarda de onde o foco veio e devolve ao fechar; com o cartão na tela o
  // foco entra nele em cada passo.
  useEffect(() => {
    if (!isActive) return;
    const atual = document.activeElement;
    focoAnteriorRef.current = atual instanceof HTMLElement && atual !== document.body ? atual : null;
    return () => focoAnteriorRef.current?.focus();
  }, [isActive]);

  useEffect(() => {
    if (!cartaoVisivel) return;
    cardRef.current?.focus();
  }, [cartaoVisivel, currentStep]);

  if (!isActive || !passoAtualDisponivel || !targetRect) return null;

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
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-passo-titulo"
          tabIndex={-1}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
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
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={endTour} aria-label="Fechar tour">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-4">
            <h3 id="tour-passo-titulo" className="font-display font-semibold text-lg text-foreground mb-2">{currentStepData.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{currentStepData.description}</p>
          </div>

          <div className="flex justify-center gap-1.5 pb-3">
            {indicesDisponiveis.map((indice) => (
              <motion.button
                key={indice}
                type="button"
                aria-label={`Ir ao passo ${indice + 1}`}
                aria-current={indice === currentStep ? 'step' : undefined}
                className={cn(
                  'w-2 h-2 rounded-full transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
                  indice === currentStep ? 'bg-primary w-4' : indice < currentStep ? 'bg-primary/50' : 'bg-muted-foreground/30'
                )}
                whileHover={{ scale: 1.2 }}
                onClick={() => goToStep(indice)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between p-4 pt-2 border-t border-border/50">
            <Button variant="ghost" size="sm" onClick={irParaAnterior} disabled={!temAnterior} className="gap-1">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button size="sm" onClick={irParaProximo} className="gap-1">
              {temProximo ? 'Próximo' : 'Concluir'}
              {temProximo && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
