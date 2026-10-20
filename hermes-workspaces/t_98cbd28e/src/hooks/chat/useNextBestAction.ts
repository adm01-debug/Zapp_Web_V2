import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WorkItemStatus } from '@/hooks/tasks/workItem.types';
import {
  Zap,
  MessageSquare,
  Calendar,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export interface NextAction {
  type: string;
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: typeof Zap;
  action?: () => void;
}

/**
 * Estados ABERTOS de `conversation_tasks`, no mesmo domínio do quadro de tarefas.
 *
 * A coluna usa o enum de 6 valores desde a migração
 * `20260928140000_tasks_unify_reminders_kanban.sql` (backfill `pending`→`todo`,
 * `completed`→`done` + CHECK com 6 valores). O valor literal `'pending'` deixou de
 * existir: filtrá-lo faz a leitura nunca casar nada (falso "nenhuma tarefa pendente").
 */
export const OPEN_TASK_STATUSES: WorkItemStatus[] = ['backlog', 'todo', 'doing', 'waiting'];

/** Motor de sugestão da "Próxima melhor ação" — extraído de NextBestActionEngine
 * para ser reutilizável na aba IA (§2.7) e na aba CRM 360° (§2.5) sem duplicar a lógica. */
export function useNextBestAction(contactId: string, contactName: string) {
  const [actions, setActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const analyzeAndSuggest = async () => {
      setLoading(true);
      const suggestedActions: NextAction[] = [];
      // Leituras que falharam: ausência de dado não pode ser lida como ausência de urgência.
      const readFailures: string[] = [];

      const { data: lastMsg, error: lastMsgError } = await supabase
        .from('messages')
        .select('created_at, sender')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsgError) readFailures.push('mensagens');

      if (lastMsg) {
        const hoursSinceLastMsg = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60);

        if (lastMsg.sender === 'contact' && hoursSinceLastMsg > 1) {
          suggestedActions.push({
            type: 'respond',
            label: 'Responder agora',
            description: `${contactName} aguarda resposta há ${Math.round(hoursSinceLastMsg)}h`,
            priority: hoursSinceLastMsg > 4 ? 'high' : 'medium',
            icon: MessageSquare,
          });
        }

        if (lastMsg.sender === 'agent' && hoursSinceLastMsg > 24) {
          suggestedActions.push({
            type: 'follow_up',
            label: 'Enviar follow-up',
            description: 'Sem resposta do cliente há mais de 24h',
            priority: 'medium',
            icon: Calendar,
          });
        }
      }

      const { count: openTasks, error: tasksError } = await supabase
        .from('conversation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .in('status', OPEN_TASK_STATUSES);

      if (tasksError) readFailures.push('tarefas');
      else if (openTasks && openTasks > 0) {
        suggestedActions.push({
          type: 'complete_tasks',
          label: `Completar ${openTasks} tarefa(s)`,
          description: 'Tarefas pendentes neste contato',
          priority: 'medium',
          icon: CheckCircle2,
        });
      }

      const { data: slaData, error: slaError } = await supabase
        .from('conversation_sla')
        .select('first_response_breached')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (slaError) readFailures.push('SLA');

      if (slaData?.first_response_breached) {
        suggestedActions.push({
          type: 'escalate',
          label: 'Escalar para supervisor',
          description: 'SLA estourado - requer atenção imediata',
          priority: 'high',
          icon: AlertTriangle,
        });
      }

      const { data: memory, error: memoryError } = await supabase
        .from('conversation_memory')
        .select('pending_items, promises_made')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (memoryError) readFailures.push('memória da conversa');

      if (memory) {
        const pending = Array.isArray(memory.pending_items) ? memory.pending_items : [];
        const promises = Array.isArray(memory.promises_made) ? memory.promises_made : [];
        if (pending.length > 0) {
          suggestedActions.push({
            type: 'resolve_pending',
            label: `Resolver ${pending.length} pendência(s)`,
            description: String(pending[0] || 'Itens pendentes registrados'),
            priority: 'medium',
            icon: Clock,
          });
        }
        if (promises.length > 0) {
          suggestedActions.push({
            type: 'fulfill_promise',
            label: 'Cumprir promessa feita',
            description: String(promises[0] || 'Promessa registrada ao cliente'),
            priority: 'high',
            icon: UserCheck,
          });
        }
      }

      // Falha de leitura entra como ação explícita: sem isso o cartão de "sem urgências"
      // (upsell) era exibido mesmo quando nenhuma das fontes respondeu.
      if (readFailures.length > 0) {
        suggestedActions.push({
          type: 'data_unavailable',
          label: 'Pendências não verificadas',
          description: `Não foi possível ler ${readFailures.join(', ')} deste contato. Confirme manualmente antes de concluir que não há urgências.`,
          priority: 'high',
          icon: AlertTriangle,
        });
      }

      if (suggestedActions.length === 0) {
        suggestedActions.push({
          type: 'upsell',
          label: 'Explorar oportunidade',
          description: 'Sem ações urgentes. Considere oferecer novos produtos/serviços.',
          priority: 'low',
          icon: TrendingUp,
        });
      }

      const priorityOrder = { high: 0, medium: 1, low: 2 };
      suggestedActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      if (!cancelled) {
        setActions(suggestedActions);
        setLoading(false);
      }
    };

    void analyzeAndSuggest();
    return () => { cancelled = true; };
  }, [contactId, contactName]);

  return { actions, loading };
}
