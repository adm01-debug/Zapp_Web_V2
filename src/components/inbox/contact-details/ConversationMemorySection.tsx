/**
 * ConversationMemorySection — "Memória da conversa" (somente leitura).
 *
 * Paridade com a V3 (ConversationMemoryPanel): o atendente enxerga os fatos que
 * o app lembra do contato em `conversation_memory` — fatos relevantes, objeções
 * tratadas, promessas feitas, pendências e os dois resumos — com a data do
 * registro. Sem edição, sem exportação e sem copiar payload: é leitura de tela.
 */
import { Brain, AlertCircle, Clock, Handshake, Lightbulb } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';
import { hasMemoryContent, useConversationMemory } from '@/hooks/crm/useConversationMemory';
import type { ConversationMemoryData } from '@/hooks/crm/useConversationMemory';

interface ConversationMemorySectionProps {
  contactId: string;
  /** posição no stagger de entrada do accordion */
  index?: number;
}

/** Cada grupo é renderizado em no máximo 5 linhas (o resto é contado). */
const LIST_LIMIT = 5;

interface MemoryGroup {
  key: keyof Pick<ConversationMemoryData, 'facts' | 'objectionsHandled' | 'promisesMade' | 'pendingItems'>;
  label: string;
  singular: string;
  icon: typeof Lightbulb;
  color: string;
}

const GROUPS: MemoryGroup[] = [
  { key: 'facts', label: 'Fatos relevantes', singular: 'fato', icon: Lightbulb, color: 'text-primary' },
  { key: 'objectionsHandled', label: 'Objeções tratadas', singular: 'objeção', icon: AlertCircle, color: 'text-warning' },
  { key: 'promisesMade', label: 'Promessas feitas', singular: 'promessa', icon: Handshake, color: 'text-success' },
  { key: 'pendingItems', label: 'Pendências', singular: 'pendência', icon: Clock, color: 'text-destructive' },
];

function MemoryGroupList({ group, items }: { group: MemoryGroup; items: string[] }) {
  if (items.length === 0) return null;
  const Icon = group.icon;
  const visible = items.slice(0, LIST_LIMIT);
  const rest = items.length - visible.length;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${group.color}`} />
        <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
        <span className="text-3xs tabular-nums text-muted-foreground/70">{items.length}</span>
      </div>
      <ul className="space-y-1">
        {visible.map((item, i) => (
          <li key={`${group.key}-${i}`} className="rounded bg-muted/20 px-2 py-1 text-xs text-foreground break-words">
            {item}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="text-3xs text-muted-foreground pl-5">
          +{rest} {rest === 1 ? group.singular : `${group.singular}s`}
        </p>
      )}
    </div>
  );
}

function SummaryBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className="rounded bg-muted/20 px-2 py-1 text-xs text-foreground leading-relaxed break-words">{text}</p>
    </div>
  );
}

function MemoryDate({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;

  return (
    <p className="text-3xs text-muted-foreground/80" data-testid="memoria-atualizado-em">
      Atualizado em {format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
    </p>
  );
}

export function ConversationMemorySection({ contactId, index = 3 }: ConversationMemorySectionProps) {
  const { memory, status, loading } = useConversationMemory(contactId);

  return (
    <SidebarSection
      index={index}
      value="memoria"
      tone="purple"
      icon={<Brain />}
      title="Memória da conversa"
      subtitle="O que o atendimento lembra deste contato"
    >
      {loading ? (
        <div className="space-y-2" data-testid="memoria-carregando">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : status === 'error' ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5" data-testid="memoria-erro">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive leading-relaxed">
            Não foi possível ler a memória deste contato. Não trate como "sem pendências" sem confirmar manualmente.
          </p>
        </div>
      ) : !memory || !hasMemoryContent(memory) ? (
        <SidebarEmpty
          cause="memoria-vazia"
          icon={<Brain />}
          message="Nenhuma memória registrada para este contato. Os fatos aparecem aqui conforme o atendimento registra."
        />
      ) : (
        <div className="space-y-3">
          {GROUPS.map((group) => (
            <MemoryGroupList key={group.key} group={group} items={memory[group.key]} />
          ))}
          {memory.commercialSummary && <SummaryBlock label="Resumo comercial" text={memory.commercialSummary} />}
          {memory.cumulativeSummary && <SummaryBlock label="Resumo cumulativo" text={memory.cumulativeSummary} />}
          <MemoryDate updatedAt={memory.updatedAt} />
        </div>
      )}
    </SidebarSection>
  );
}
