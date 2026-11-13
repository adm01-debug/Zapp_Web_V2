/**
 * ContactFirstResponseSLA — selo de SLA da 1ª resposta no painel do contato.
 *
 * Restaurado (2026-11-12) da parte "SLA" do `SLAAndAITagsSection`, que saiu
 * como órfão na #1886. A outra metade daquele bloco ("Tags geradas por IA",
 * tabela `ai_conversation_tags`) NÃO volta: a função de tags foi removida por
 * decisão do dono (12/10).
 */
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useContactFirstResponseSLA } from '@/hooks/sla/useContactFirstResponseSLA';
import type { FirstResponseOutcome } from '@/hooks/sla/slaFirstResponse';

const OUTCOME: Record<FirstResponseOutcome, { label: string; className: string; icon: typeof CheckCircle }> = {
  breached: { label: 'Violado', className: 'bg-destructive/15 text-destructive border-destructive/30', icon: AlertTriangle },
  on_time: { label: 'No prazo', className: 'bg-success/15 text-success border-success/30', icon: CheckCircle },
  pending: { label: 'Pendente', className: 'bg-warning/15 text-warning border-warning/30', icon: Clock },
};

export function ContactFirstResponseSLA({ contactId }: { contactId: string }) {
  const { data, isLoading, isError } = useContactFirstResponseSLA(contactId);

  if (isLoading) return <Skeleton data-testid="sla-loading" className="h-10 w-full" />;

  if (isError) {
    return (
      <p role="alert" data-testid="sla-error" className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Não foi possível ler o SLA deste contato.
      </p>
    );
  }

  if (!data) {
    return (
      <p data-testid="sla-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Sem medição de SLA para este contato.
      </p>
    );
  }

  const cfg = OUTCOME[data.outcome];
  const Icon = cfg.icon;

  return (
    <div data-testid="sla-first-response" className="flex items-center justify-between text-xs bg-muted/20 rounded-lg p-2.5">
      <div className="flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        <span className="text-muted-foreground">1ª resposta</span>
      </div>
      <Badge variant="outline" className={`text-3xs ${cfg.className}`}>
        <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
        {cfg.label}
      </Badge>
    </div>
  );
}
