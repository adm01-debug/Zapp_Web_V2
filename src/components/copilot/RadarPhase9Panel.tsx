/**
 * CV-081-090 — RadarPhase9Panel
 *
 * Painel RADAR da Fase 9: catálogo, prazo reverso, orçamento, frete, upsell, kits, mockup.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useOccasionKits } from '@/hooks/copilot/useOccasionKits';
import { useMockupTrigger } from '@/hooks/copilot/useMockupTrigger';
import { useUpsellSuggestion } from '@/hooks/copilot/useUpsellSuggestion';
import { Gift, Image, TrendingUp } from 'lucide-react';

export interface RadarPhase9PanelProps {
  lastClientMessage: string;
  messages: Array<{ content: string; sender: string }>;
  onDraftText: (text: string) => void;
  className?: string;
}

export function RadarPhase9Panel({
  lastClientMessage,
  messages,
  onDraftText,
  className,
}: RadarPhase9PanelProps) {
  const [kitDismissed, setKitDismissed] = useState(false);
  const [mockupDismissed, setMockupDismissed] = useState(false);
  const [upsellDismissed, setUpsellDismissed] = useState(false);

  const conversationText = messages.map((m) => m.content).join(' ');
  const occasionKit = useOccasionKits({ conversationText });
  const mockupTrigger = useMockupTrigger({ clientText: lastClientMessage });
  const upsells = useUpsellSuggestion({ productMentioned: lastClientMessage || null });

  const hasContent =
    (!kitDismissed && occasionKit) ||
    (!mockupDismissed && mockupTrigger.shouldTrigger) ||
    (!upsellDismissed && upsells.length > 0);

  if (!hasContent) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Kit por ocasião */}
      {!kitDismissed && occasionKit && (
        <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-2.5 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <Gift className="w-3.5 h-3.5 text-green-500" />
              <span>{occasionKit.kitName}</span>
            </div>
            <button type="button" onClick={() => setKitDismissed(true)} className="text-muted-foreground text-3xs">✕</button>
          </div>
          <p className="text-muted-foreground mb-1">{occasionKit.items.join(', ')}</p>
          <button
            type="button"
            onClick={() => onDraftText(occasionKit.script)}
            className="text-3xs text-primary font-medium hover:underline"
          >
            Sugerir kit →
          </button>
        </div>
      )}

      {/* Mockup trigger */}
      {!mockupDismissed && mockupTrigger.shouldTrigger && (
        <div className="flex items-start gap-2 rounded-lg border border-violet-500/50 bg-violet-50 dark:bg-violet-950/20 p-2.5 text-xs">
          <Image className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
          <div className="flex-1">
            <p className="font-medium">Momento ideal para mockup</p>
            <button
              type="button"
              onClick={() => onDraftText(mockupTrigger.script)}
              className="mt-1 text-3xs text-primary font-medium hover:underline"
            >
              Oferecer mockup →
            </button>
          </div>
          <button type="button" onClick={() => setMockupDismissed(true)} className="text-muted-foreground text-3xs">✕</button>
        </div>
      )}

      {/* Upsell */}
      {!upsellDismissed && upsells.length > 0 && (
        <div className="rounded-lg border border-teal-500/50 bg-teal-50 dark:bg-teal-950/20 p-2.5 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-teal-500" />
              <span>Oportunidade de upsell</span>
            </div>
            <button type="button" onClick={() => setUpsellDismissed(true)} className="text-muted-foreground text-3xs">✕</button>
          </div>
          {upsells.slice(0, 1).map((item) => (
            <div key={item.productSuggestion}>
              <p className="text-muted-foreground mb-1">{item.productSuggestion} · {item.reason}</p>
              <button
                type="button"
                onClick={() => onDraftText(item.script)}
                className="text-3xs text-primary font-medium hover:underline"
              >
                Sugerir complemento →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
