import { Badge } from '@/components/ui/badge';
import { Zap, ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNextBestAction } from '@/hooks/chat/useNextBestAction';
import { cn } from '@/lib/utils';

interface NextBestActionProps {
  contactId: string;
  contactName: string;
}

export function NextBestActionEngine({ contactId, contactName }: NextBestActionProps) {
  const { actions, loading } = useNextBestAction(contactId, contactName);
  const prefersReducedMotion = useReducedMotion();

  const priorityColors = {
    high: 'border-destructive/30 bg-destructive/5',
    medium: 'border-warning/30 bg-warning/5',
    low: 'border-primary/30 bg-primary/5',
  };

  const priorityBadge = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-primary/10 text-primary',
  };

  // Só o tipo que tem um ALVO REAL na tela vira botão. O alvo que já existe é a
  // aba Tarefas da conversa, que monta por esse evento (RealtimeInboxView,
  // etapa 74 — o mesmo caminho do atalho Alt+T e do botão "Ver na aba Tarefas").
  // Os outros tipos ('respond', 'escalate', ...) seguem sem destino: ficam
  // informativos, sem aparência de clique. `NextAction.action` continua
  // opcional no hook e nada aqui inventa comportamento.
  const abrirAbaTarefas = () => {
    window.dispatchEvent(new CustomEvent('inbox-open-tasks-tab'));
  };

  const cardHandlers: Record<string, (() => void) | undefined> = {
    complete_tasks: abrirAbaTarefas,
  };

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Carregando próximas ações">
        {[1,2].map(i => <div key={i} className="h-16 bg-muted/20 rounded-xl motion-safe:animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Próxima Melhor Ação</span>
      </div>
      {actions.map((action, idx) => {
        const Icon = action.icon;
        const onActivate = cardHandlers[action.type];
        const cardBody = (
          <div className="flex items-start gap-2">
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{action.label}</span>
                <Badge variant="outline" className={`text-[9px] ${priorityBadge[action.priority]}`}>
                  {action.priority === 'high' ? 'Urgente' : action.priority === 'medium' ? 'Normal' : 'Baixa'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
            </div>
            {onActivate && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </div>
        );

        return (
          <motion.div
            key={action.type}
            initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: prefersReducedMotion ? 0 : idx * 0.1 }}
            className={cn(
              'p-3 rounded-xl border',
              priorityColors[action.priority],
              onActivate && 'cursor-pointer hover:shadow-sm transition-shadow'
            )}
          >
            {onActivate ? (
              <div
                role="button"
                tabIndex={0}
                // role="button" e nao <button>: o conteudo tem <div> e <p>, que
                // nao sao conteudo valido de um <button> nativo.
                aria-label={`${action.label} — ${action.description}`}
                onClick={() => onActivate()}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // Espaco segurado auto-repete; um <button> nativo ignora repeticao.
                  if (e.repeat) return;
                  e.preventDefault();
                  onActivate();
                }}
                className="rounded-lg outline-none text-left focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {cardBody}
              </div>
            ) : (
              cardBody
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
