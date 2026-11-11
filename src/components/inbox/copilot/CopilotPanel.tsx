/**
 * Painel central do Copiloto B·R·I·N·D·E.
 *
 * Agrega os principais detectores (objeção, perda, âncora de preço,
 * termômetro de lead) e os exibe em seções compactas com fallback local
 * + botão de análise AI para cada dimensão.
 */
import React from 'react';
import { AlertTriangle, Flame, TrendingDown, DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useObjectionHandler } from '@/hooks/copilot/useObjectionHandler';
import { useLossRiskDetector } from '@/hooks/copilot/useLossRiskDetector';
import { usePriceAnchoring } from '@/hooks/copilot/usePriceAnchoring';
import { useLeadThermometer } from '@/hooks/copilot/useLeadThermometer';
import type { Conversation, Message } from '@/types/chat';

interface CopilotPanelProps {
  conversation: Conversation;
  messages: Message[];
}

export function CopilotPanel({ conversation: _conversation, messages }: CopilotPanelProps) {
  const clientMessages = messages.filter((m) => m.sender === 'contact');
  const lastClientText = clientMessages[clientMessages.length - 1]?.content ?? '';
  const hookMessages = messages.map((m) => ({
    content: m.content,
    sender: m.sender,
    created_at: m.created_at,
  }));

  const objection = useObjectionHandler({ clientText: lastClientText, messages: hookMessages });
  const lossRisk = useLossRiskDetector({ clientText: lastClientText, messages: hookMessages });
  const priceAnchoring = usePriceAnchoring({ clientText: lastClientText, messages: hookMessages });
  const thermometer = useLeadThermometer({ messages: hookMessages });

  const tempColors: Record<string, string> = {
    hot: 'text-red-500 bg-red-500/10',
    warm: 'text-amber-500 bg-amber-500/10',
    cold: 'text-blue-500 bg-blue-500/10',
  };
  const tempLabels: Record<string, string> = { hot: 'Quente', warm: 'Morno', cold: 'Frio' };
  const riskColors = { high: 'text-red-500', medium: 'text-amber-500', low: 'text-green-500' };
  const riskLabels = { high: 'Alto', medium: 'Médio', low: 'Baixo' };

  if (!lastClientText && messages.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Aguardando mensagens do cliente para ativar o Copiloto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Termômetro de lead */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Lead</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge className={cn('text-[10px] px-1.5 py-0', tempColors[thermometer.temperature] ?? '')}>
            {tempLabels[thermometer.temperature] ?? thermometer.temperature}
          </Badge>
          {!thermometer.aiResult && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              disabled={thermometer.aiLoading}
              onClick={() => void thermometer.analyze()}
            >
              {thermometer.aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'AI'}
            </Button>
          )}
        </div>
      </div>
      {thermometer.recommendedAction && (
        <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
          {thermometer.recommendedAction}
        </p>
      )}

      {/* Risco de perda */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Risco de perda</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-semibold', riskColors[lossRisk.level])}>
            {riskLabels[lossRisk.level]}
          </span>
          {!lossRisk.aiResult && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              disabled={lossRisk.aiLoading}
              onClick={() => void lossRisk.analyze()}
            >
              {lossRisk.aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'AI'}
            </Button>
          )}
        </div>
      </div>
      {lossRisk.level !== 'low' && lossRisk.recoveryAction && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 -mt-1">
          <p className="text-[11px] leading-relaxed">{lossRisk.recoveryAction}</p>
          {lossRisk.script && (
            <p className="mt-1 text-[11px] text-muted-foreground italic">"{lossRisk.script}"</p>
          )}
        </div>
      )}

      {/* Objeção */}
      {objection.detected && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium">
              Objeção detectada
              {objection.type && (
                <span className="ml-1 text-[10px] text-muted-foreground">({objection.type})</span>
              )}
            </span>
            {!objection.aiResult && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2 text-[10px]"
                disabled={objection.aiLoading}
                onClick={() => void objection.analyze()}
              >
                {objection.aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'AI'}
              </Button>
            )}
          </div>
          {objection.suggestedReply && (
            <p className="text-[11px] text-muted-foreground leading-relaxed italic">
              "{objection.suggestedReply}"
            </p>
          )}
        </div>
      )}

      {/* Âncora de preço */}
      {priceAnchoring.triggered && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-medium">Âncora de preço</span>
            {!priceAnchoring.aiResult && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2 text-[10px]"
                disabled={priceAnchoring.aiLoading}
                onClick={() => void priceAnchoring.analyze()}
              >
                {priceAnchoring.aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'AI'}
              </Button>
            )}
          </div>
          {priceAnchoring.anchorScript && (
            <p className="text-[11px] text-muted-foreground leading-relaxed italic">
              "{priceAnchoring.anchorScript}"
            </p>
          )}
        </div>
      )}

      {/* Nenhum sinal */}
      {!objection.detected && !priceAnchoring.triggered && lossRisk.level === 'low' && (
        <p className="text-[11px] text-muted-foreground">Nenhum sinal de alerta detectado.</p>
      )}
    </div>
  );
}
