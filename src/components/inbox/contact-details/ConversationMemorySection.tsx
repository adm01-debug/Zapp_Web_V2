/**
 * ConversationMemorySection — "Memória da conversa".
 *
 * Paridade com a V3 (ConversationMemoryPanel): o atendente enxerga os fatos que
 * o app lembra do contato em `conversation_memory` — fatos relevantes, objeções
 * tratadas, promessas feitas, pendências e os dois resumos — com a data do
 * registro.
 *
 * Além da leitura, o atendente pode EDITAR À MÃO o resumo comercial, as
 * pendências e as promessas (um item por linha): são os campos que ele
 * realmente corrige no dia a dia. A gravação é manual por contato (upsert via
 * `useSaveConversationMemory`) e, ao terminar, a seção relê o banco. Sem
 * exportação, sem baixar/copiar payload e sem etiqueta de canal ou origem.
 */
import { useCallback, useState } from 'react';
import { Brain, AlertCircle, Clock, Handshake, Lightbulb, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';
import { hasMemoryContent, useConversationMemory } from '@/hooks/crm/useConversationMemory';
import type { ConversationMemoryData } from '@/hooks/crm/useConversationMemory';
import {
  MEMORY_FIELD_MAX,
  useSaveConversationMemory,
} from '@/hooks/crm/useSaveConversationMemory';
import type { ConversationMemoryDraft } from '@/hooks/crm/useSaveConversationMemory';

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

/** Rascunho do formulário: os campos de lista são texto, uma linha por item. */
interface MemoryFormDraft {
  commercialSummary: string;
  pendingItems: string;
  promisesMade: string;
}

const EMPTY_FORM_DRAFT: MemoryFormDraft = {
  commercialSummary: '',
  pendingItems: '',
  promisesMade: '',
};

/** Texto → lista: uma linha por item, sem vazios e sem espaços nas pontas. */
function parseMemoryLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function draftFromMemory(memory: ConversationMemoryData | null): MemoryFormDraft {
  if (!memory) return { ...EMPTY_FORM_DRAFT };
  return {
    commercialSummary: memory.commercialSummary ?? '',
    pendingItems: memory.pendingItems.join('\n'),
    promisesMade: memory.promisesMade.join('\n'),
  };
}

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

interface MemoryFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}

function MemoryField({ id, label, hint, value, rows, onChange }: MemoryFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="font-normal text-muted-foreground/70"> {hint}</span> : null}
      </label>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={MEMORY_FIELD_MAX}
        onChange={(event) => onChange(event.target.value.slice(0, MEMORY_FIELD_MAX))}
        className="text-xs min-h-0"
      />
      <p className="text-3xs tabular-nums text-muted-foreground/70" data-testid={`memoria-limite-${id}`}>
        {value.length}/{MEMORY_FIELD_MAX}
      </p>
    </div>
  );
}

export function ConversationMemorySection({ contactId, index = 3 }: ConversationMemorySectionProps) {
  const { memory, status, loading, reload } = useConversationMemory(contactId);
  const { save, saving, error: saveError, clearError } = useSaveConversationMemory(contactId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MemoryFormDraft>(EMPTY_FORM_DRAFT);

  const startEditing = useCallback(() => {
    clearError();
    setDraft(draftFromMemory(memory));
    setEditing(true);
  }, [memory, clearError]);

  const cancelEditing = useCallback(() => {
    clearError();
    setDraft(EMPTY_FORM_DRAFT);
    setEditing(false);
  }, [clearError]);

  const handleSave = useCallback(async () => {
    // Envio já em curso (o botão desabilita, mas um segundo submit pode
    // chegar antes da próxima renderização): ignora em silêncio, sem erro.
    if (saving) return;

    const payload: ConversationMemoryDraft = {
      commercialSummary: draft.commercialSummary,
      pendingItems: parseMemoryLines(draft.pendingItems),
      promisesMade: parseMemoryLines(draft.promisesMade),
    };

    const ok = await save(payload);
    if (!ok) {
      toast.error('Não foi possível salvar a memória da conversa.');
      return;
    }

    toast.success('Memória da conversa atualizada.');
    setDraft(EMPTY_FORM_DRAFT);
    setEditing(false);
    // Invalida a consulta do painel: a lista relê o banco e mostra o salvo.
    reload();
  }, [draft, save, reload, saving]);

  const canEdit = !loading && status !== 'error';

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
      ) : editing ? (
        <form
          className="space-y-3"
          data-testid="memoria-formulario"
          onSubmit={(event) => { event.preventDefault(); void handleSave(); }}
        >
          <MemoryField
            id="resumo"
            label="Resumo comercial"
            value={draft.commercialSummary}
            rows={3}
            onChange={(value) => setDraft((d) => ({ ...d, commercialSummary: value }))}
          />
          <MemoryField
            id="pendencias"
            label="Pendências"
            hint="(uma por linha)"
            value={draft.pendingItems}
            rows={3}
            onChange={(value) => setDraft((d) => ({ ...d, pendingItems: value }))}
          />
          <MemoryField
            id="promessas"
            label="Promessas feitas"
            hint="(uma por linha)"
            value={draft.promisesMade}
            rows={3}
            onChange={(value) => setDraft((d) => ({ ...d, promisesMade: value }))}
          />

          {saveError && (
            <p role="alert" data-testid="memoria-erro-salvar" className="text-xs text-destructive leading-relaxed">
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving} data-testid="memoria-salvar">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              data-testid="memoria-descartar"
              onClick={cancelEditing}
            >
              Descartar
            </Button>
          </div>
        </form>
      ) : !memory || !hasMemoryContent(memory) ? (
        <div className="space-y-2">
          <SidebarEmpty
            cause="memoria-vazia"
            icon={<Brain />}
            message="Nenhuma memória registrada para este contato. Os fatos aparecem aqui conforme o atendimento registra."
          />
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              data-testid="memoria-editar"
              onClick={startEditing}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Registrar memória
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <MemoryDate updatedAt={memory.updatedAt} />
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                data-testid="memoria-editar"
                onClick={startEditing}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Editar
              </Button>
            )}
          </div>
          {GROUPS.map((group) => (
            <MemoryGroupList key={group.key} group={group} items={memory[group.key]} />
          ))}
          {memory.commercialSummary && <SummaryBlock label="Resumo comercial" text={memory.commercialSummary} />}
          {memory.cumulativeSummary && <SummaryBlock label="Resumo cumulativo" text={memory.cumulativeSummary} />}
        </div>
      )}
    </SidebarSection>
  );
}
