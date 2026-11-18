/**
 * ConversationMemorySection — "Memória da conversa".
 *
 * Paridade com a V3 (ConversationMemoryPanel): o atendente enxerga os fatos que
 * o app lembra do contato em `conversation_memory` — fatos relevantes, objeções
 * tratadas, promessas feitas, pendências e os dois resumos — com a data do
 * registro. Sem exportação e sem copiar payload.
 *
 * A EDIÇÃO entrou no resgate do painel da V3: até então nenhum código do produto
 * escrevia em `conversation_memory`, então o atendente lia o que o app lembra do
 * contato e não conseguia corrigir um fato, registrar uma promessa ou fechar uma
 * pendência. As guardas de escrita ficam em `useSalvarConversationMemory`.
 */
import { useState } from 'react';
import { Brain, AlertCircle, Clock, Handshake, Lightbulb, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';
import { hasMemoryContent, useConversationMemory } from '@/hooks/crm/useConversationMemory';
import type { ConversationMemoryData } from '@/hooks/crm/useConversationMemory';
import { useSalvarConversationMemory } from '@/hooks/crm/useSalvarConversationMemory';
import type { MemoriaEditavel } from '@/hooks/crm/useSalvarConversationMemory';

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
  /** Concordancia do rotulo do campo novo: "Novo fato" x "Nova pendencia". */
  rotuloNovo: string;
  icon: typeof Lightbulb;
  color: string;
}

const GROUPS: MemoryGroup[] = [
  { key: 'facts', label: 'Fatos relevantes', singular: 'fato', rotuloNovo: 'Novo fato', icon: Lightbulb, color: 'text-primary' },
  { key: 'objectionsHandled', label: 'Objeções tratadas', singular: 'objeção', rotuloNovo: 'Nova objeção', icon: AlertCircle, color: 'text-warning' },
  { key: 'promisesMade', label: 'Promessas feitas', singular: 'promessa', rotuloNovo: 'Nova promessa', icon: Handshake, color: 'text-success' },
  { key: 'pendingItems', label: 'Pendências', singular: 'pendência', rotuloNovo: 'Nova pendência', icon: Clock, color: 'text-destructive' },
];

function MemoryGroupList({ group, items }: { group: MemoryGroup; items: string[] }) {
  if (items.length === 0) return null;
  const Icon = group.icon;
  const visible = items.slice(0, LIST_LIMIT);
  const rest = items.length - visible.length;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${group.color}`} aria-hidden="true" />
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

const VAZIA: MemoriaEditavel = {
  facts: [],
  objectionsHandled: [],
  promisesMade: [],
  pendingItems: [],
  commercialSummary: null,
  cumulativeSummary: null,
};

function paraRascunho(memory: ConversationMemoryData | null): MemoriaEditavel {
  if (!memory) return { ...VAZIA };
  return {
    facts: [...memory.facts],
    objectionsHandled: [...memory.objectionsHandled],
    promisesMade: [...memory.promisesMade],
    pendingItems: [...memory.pendingItems],
    commercialSummary: memory.commercialSummary,
    cumulativeSummary: memory.cumulativeSummary,
  };
}

/** Uma das quatro listas, em modo de edicao: remover item e acrescentar item. */
function GrupoEditavel({
  group,
  items,
  onChange,
}: {
  group: MemoryGroup;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [novo, setNovo] = useState('');
  const Icon = group.icon;

  const acrescentar = () => {
    const texto = novo.trim();
    if (!texto) return;
    onChange([...items, texto]);
    setNovo('');
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${group.color}`} aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
        <span className="text-3xs tabular-nums text-muted-foreground/70">{items.length}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li
            key={`${group.key}-${i}`}
            className="flex items-start gap-1 rounded bg-muted/20 px-2 py-1 text-xs text-foreground"
          >
            <span className="min-w-0 flex-1 break-words">{item}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remover ${group.singular}: ${item}`}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              acrescentar();
            }
          }}
          aria-label={group.rotuloNovo}
          placeholder={group.rotuloNovo}
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={acrescentar}
          disabled={novo.trim().length === 0}
          aria-label={`Adicionar ${group.singular}`}
          className="h-7 shrink-0 px-2"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ResumoEditavel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`resumo-${label}`}>
        {label}
      </label>
      <Textarea
        id={`resumo-${label}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        rows={3}
        className="text-xs"
      />
    </div>
  );
}

/** Corpo da seção: só monta (e só lê o banco) quando o accordion está aberto. */
function ConversationMemoryBody({ contactId }: { contactId: string }) {
  const { memory, status, loading, rowId, recarregar } = useConversationMemory(contactId);
  const { salvar, salvando, erroAoSalvar } = useSalvarConversationMemory();
  const [rascunho, setRascunho] = useState<MemoriaEditavel | null>(null);

  const editando = rascunho !== null;
  const abrirEdicao = () => setRascunho(paraRascunho(memory));

  const confirmar = async () => {
    if (!rascunho) return;
    const ok = await salvar(contactId, rowId, rascunho);
    if (!ok) return;
    setRascunho(null);
    recarregar();
  };

  if (loading) {
    return (
      <div className="space-y-2" data-testid="memoria-carregando">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    );
  }

  // Falha de leitura NAO abre edicao: gravar por cima do que nao foi lido
  // apagaria o que ja' estava registrado.
  if (status === 'error') {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5" data-testid="memoria-erro">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-destructive leading-relaxed">
            Não foi possível ler a memória deste contato. Não trate como "sem pendências" sem confirmar manualmente.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={recarregar} className="h-7 gap-1 text-xs">
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (editando && rascunho) {
    return (
      <div className="space-y-3">
        {GROUPS.map((group) => (
          <GrupoEditavel
            key={group.key}
            group={group}
            items={rascunho[group.key]}
            onChange={(items) => setRascunho({ ...rascunho, [group.key]: items })}
          />
        ))}
        <ResumoEditavel
          label="Resumo comercial"
          value={rascunho.commercialSummary}
          onChange={(v) => setRascunho({ ...rascunho, commercialSummary: v })}
        />
        <ResumoEditavel
          label="Resumo cumulativo"
          value={rascunho.cumulativeSummary}
          onChange={(v) => setRascunho({ ...rascunho, cumulativeSummary: v })}
        />
        {erroAoSalvar && (
          <p role="alert" className="text-xs text-destructive" data-testid="memoria-erro-salvar">
            Não foi possível salvar. O que você escreveu segue aqui — tente de novo.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={confirmar} disabled={salvando} className="h-7 text-xs">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRascunho(null)}
            disabled={salvando}
            className="h-7 text-xs"
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (!memory || !hasMemoryContent(memory)) {
    return (
      <div className="space-y-2">
        <SidebarEmpty
          cause="memoria-vazia"
          icon={<Brain />}
          message="Nenhuma memória registrada para este contato. Os fatos aparecem aqui conforme o atendimento registra."
        />
        <Button type="button" size="sm" variant="outline" onClick={abrirEdicao} className="h-7 gap-1 text-xs">
          <Pencil className="w-3 h-3" aria-hidden="true" />
          Registrar memória
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <MemoryGroupList key={group.key} group={group} items={memory[group.key]} />
      ))}
      {memory.commercialSummary && <SummaryBlock label="Resumo comercial" text={memory.commercialSummary} />}
      {memory.cumulativeSummary && <SummaryBlock label="Resumo cumulativo" text={memory.cumulativeSummary} />}
      <MemoryDate updatedAt={memory.updatedAt} />
      <Button type="button" size="sm" variant="outline" onClick={abrirEdicao} className="h-7 gap-1 text-xs">
        <Pencil className="w-3 h-3" aria-hidden="true" />
        Editar memória
      </Button>
    </div>
  );
}

export function ConversationMemorySection({ contactId, index = 3 }: ConversationMemorySectionProps) {
  return (
    <SidebarSection
      index={index}
      value="memoria"
      tone="purple"
      icon={<Brain />}
      title="Memória da conversa"
      subtitle="O que o atendimento lembra deste contato"
    >
      {/* key: troca de contato remonta o corpo, sem reaproveitar estado do anterior. */}
      <ConversationMemoryBody key={contactId} contactId={contactId} />
    </SidebarSection>
  );
}
