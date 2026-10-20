/**
 * useWorkItemDraft — rascunho do painel "Detalhes da tarefa" (etapas 148 e 149).
 *
 * Roda em cima das mutations que JÁ existem (`update` e `move` de
 * `useMyWorkItems`). Nada aqui escreve no banco por conta própria, nem cria
 * tabela/coluna nova: o hook só mantém o estado de edição, calcula o patch
 * MÍNIMO e delega a escrita.
 *
 * O que ele resolve:
 *  - **Controle de alterações (148):** `draft` nasce dos campos do item e a
 *    limpeza de um campo volta a valer como "sem alteração" (o rascunho é
 *    comparado com a BASE, não com "o usuário tocou no campo").
 *  - **Patch mínimo (149):** `save()` envia SÓ os campos que mudaram; campo
 *    igual é omitido do `update`, e a troca de estado vai pelo `move`.
 *  - **Aviso "Esta tarefa mudou" (148):** se o item do cache/realtime mudar
 *    ENQUANTO há alterações locais pendentes, o hook levanta `remoteChanged`
 *    sem descartar o rascunho; com o rascunho limpo ele só adota a versão nova.
 *  - **Limite e motivo (149):** a troca de estado é pré-validada por
 *    `canTransition` (WIP de Fazendo = 3 e motivo obrigatório em Aguardando)
 *    ANTES de qualquer escrita — bloqueado, o estado anterior fica intacto e
 *    sai toast; nada de escrita parcial.
 *
 * Coerência prazo × lembrete (etapa 162) é exposta em `coherence` para a tela
 * avisar (etapa 138); não bloqueia o save — quem barra o lembrete no passado é
 * o `assertRemindNotInPast` do próprio `update`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { canTransition, countDoing } from './workItemMachine';
import type {
  Priority,
  TransitionBlockReason,
  WorkItem,
  WorkItemStatus,
} from './workItem.types';
import type { MoveOpts, WorkItemInput } from './useMyWorkItems';

/** Texto único do aviso de atualização remota durante a edição (etapa 148). */
export const REMOTE_CHANGE_MESSAGE = 'Esta tarefa mudou';

type RemindCoherenceState = 'ok' | 'in_past' | 'after_due' | 'no_due';

interface RemindCoherence {
  state: RemindCoherenceState;
  message: string;
}

const REMIND_COHERENCE_MESSAGES: Record<RemindCoherenceState, string> = {
  ok: 'Lembrete programado para antes do prazo.',
  in_past: 'O lembrete precisa estar no futuro.',
  after_due: 'O lembrete precisa ser antes do prazo.',
  no_due: 'Sem prazo definido — não há como comparar o lembrete com o prazo.',
};

function toInstant(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(t) ? null : t;
}

function checkRemindCoherence(
  remindAt: string | Date | null | undefined,
  dueDate: string | Date | null | undefined,
  now: Date = new Date(),
): RemindCoherence {
  const lembrete = toInstant(remindAt);
  if (lembrete === null) return { state: 'ok', message: '' };

  if (lembrete <= now.getTime()) return { state: 'in_past', message: REMIND_COHERENCE_MESSAGES.in_past };

  const prazo = toInstant(dueDate);
  if (prazo === null) return { state: 'no_due', message: REMIND_COHERENCE_MESSAGES.no_due };

  if (lembrete >= prazo) return { state: 'after_due', message: REMIND_COHERENCE_MESSAGES.after_due };

  return { state: 'ok', message: REMIND_COHERENCE_MESSAGES.ok };
}

/** Mensagens dos bloqueios de transição, iguais às que o módulo já mostra. */
export const DRAFT_BLOCK_MESSAGES: Record<TransitionBlockReason, string> = {
  wip_full: 'Limite de Fazendo atingido (max. 3). Conclua ou mova um item antes.',
  waiting_reason_required: 'Escreva o motivo da espera antes de mover.',
  invalid_transition: 'Esse estado não pode ser alcançado a partir do atual.',
};

/** Campos editáveis do painel, no vocabulário do front. */
export interface WorkItemDraftFields {
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  remindAt: string | null;
  waitingReason: string | null;
  status: WorkItemStatus;
}

export interface DraftSaveOutcome {
  ok: boolean;
  /** Patch mínimo enviado ao `update` (vazio quando não havia o que salvar). */
  patch: Partial<WorkItemInput>;
  /** `true` quando o estado também mudou (o `move` foi chamado). */
  moved: boolean;
  /** `true` quando o `update` gravou campos, mas o `move` falhou depois. */
  partialSaved: boolean;
  /** Bloqueio de transição, erro da escrita, ou `null` no sucesso. */
  reason: TransitionBlockReason | 'error' | null;
}

export interface UseWorkItemDraftOpts {
  /** Item em edição (o que a tela acabou de selecionar). */
  item: WorkItem | null;
  /** Lista atual do módulo — só para contar o WIP de Fazendo antes de gravar. */
  items?: WorkItem[];
  update: (id: string, patch: Partial<WorkItemInput>) => Promise<unknown>;
  move: (item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) => Promise<unknown>;
  /** Relógio injetável (testes da coerência do lembrete). */
  now?: () => Date;
}

export interface UseWorkItemDraft {
  draft: WorkItemDraftFields | null;
  isDirty: boolean;
  /** Nomes dos campos alterados (inclui `status`), para o rodapé do painel. */
  changedFields: string[];
  remoteChanged: boolean;
  remoteMessage: string;
  isSaving: boolean;
  saveError: TransitionBlockReason | 'error' | null;
  coherence: RemindCoherence;
  setField: <K extends keyof WorkItemDraftFields>(
    field: K,
    value: WorkItemDraftFields[K],
  ) => void;
  /** Desfaz as alterações locais (volta à base). */
  reset: () => void;
  /** Adota a versão remota, descartando o rascunho. */
  acceptRemote: () => void;
  /** Mantém o rascunho e silencia o aviso até a próxima mudança remota. */
  dismissRemote: () => void;
  save: () => Promise<DraftSaveOutcome>;
}

// ---------------------------------------------------------------------------
// Helpers puros (testáveis sem React)
// ---------------------------------------------------------------------------
/** `''`/espaços contam como "sem valor" nos campos de texto anuláveis. */
function normNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const texto = value.trim();
  return texto === '' ? null : texto;
}

/** Rascunho inicial a partir do item do cache. */
export function fieldsFromItem(item: WorkItem): WorkItemDraftFields {
  return {
    title: item.title,
    description: item.description,
    priority: item.priority,
    dueDate: item.due_date,
    remindAt: item.remind_at,
    waitingReason: item.waiting_reason,
    status: item.status,
  };
}

/** Impressão digital do rascunho — é o que decide "mudou ou não". */
export function signatureOf(fields: WorkItemDraftFields): string {
  return JSON.stringify([
    fields.title,
    normNullableText(fields.description),
    fields.priority,
    fields.dueDate ?? null,
    fields.remindAt ?? null,
    normNullableText(fields.waitingReason),
    fields.status,
  ]);
}

/**
 * Patch MÍNIMO (etapa 149): só entra no `update` o campo que difere do item.
 * O estado NÃO vai no patch — quem move é o `move` (com limite e motivo).
 * Quando o estado mudou, `waiting_reason` sai do patch: o `move` já o grava
 * (ou o limpa, se o destino não é Aguardando).
 */
export function buildMinimalPatch(
  draft: WorkItemDraftFields,
  base: WorkItemDraftFields,
): { fields: Partial<WorkItemInput>; statusChanged: boolean } {
  const fields: Partial<WorkItemInput> = {};

  if (draft.title !== base.title) fields.title = draft.title;

  const description = normNullableText(draft.description);
  if (description !== normNullableText(base.description)) fields.description = description;

  if (draft.priority !== base.priority) fields.priority = draft.priority;

  const dueDate = draft.dueDate ?? null;
  if (dueDate !== (base.dueDate ?? null)) fields.dueDate = dueDate;

  const remindAt = draft.remindAt ?? null;
  if (remindAt !== (base.remindAt ?? null)) fields.remindAt = remindAt;

  const waitingReason = normNullableText(draft.waitingReason);
  if (waitingReason !== normNullableText(base.waitingReason)) fields.waitingReason = waitingReason;

  const statusChanged = draft.status !== base.status;
  if (statusChanged) delete fields.waitingReason;

  return { fields, statusChanged };
}

function applySavedFields(
  item: WorkItem,
  patch: Partial<WorkItemInput>,
  status: WorkItemStatus,
  waitingReason: string | null,
): WorkItemDraftFields {
  return {
    ...fieldsFromItem(item),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.remindAt !== undefined ? { remindAt: patch.remindAt } : {}),
    ...(patch.waitingReason !== undefined ? { waitingReason: patch.waitingReason } : {}),
    status,
    ...(status === 'waiting' ? { waitingReason } : {}),
    ...(status !== 'waiting' ? { waitingReason: null } : {}),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
const defaultNow = () => new Date();

export function useWorkItemDraft(opts: UseWorkItemDraftOpts): UseWorkItemDraft {
  const { item, items, update, move } = opts;

  // Relógio do render: `defaultNow` é estável, então o memo só recalcula quando
  // o chamador troca de relógio (testes) ou muda prazo/lembrete.
  const now = opts.now ?? defaultNow;

  const [draft, setDraft] = useState<WorkItemDraftFields | null>(() =>
    item ? fieldsFromItem(item) : null,
  );
  const [base, setBase] = useState<WorkItemDraftFields | null>(() =>
    item ? fieldsFromItem(item) : null,
  );
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<TransitionBlockReason | 'error' | null>(null);

  const itemIdRef = useRef<string | null>(item?.id ?? null);
  const lastSigRef = useRef<string | null>(item ? signatureOf(fieldsFromItem(item)) : null);
  const savingRef = useRef(false);
  // Espelho do estado: o efeito de realtime precisa ler o rascunho atual sem
  // virar dependência (senão ele roda a cada tecla digitada).
  const mirror = useRef({ draft, base, saving: false });

  useEffect(() => {
    mirror.current = { draft, base, saving: savingRef.current };
  });

  useEffect(() => {
    if (!item) {
      itemIdRef.current = null;
      lastSigRef.current = null;
      return;
    }
    const fields = fieldsFromItem(item);
    const sig = signatureOf(fields);

    // Trocou a tarefa no painel: o rascunho recomeça limpo.
    if (item.id !== itemIdRef.current) {
      itemIdRef.current = item.id;
      lastSigRef.current = sig;
      setDraft(fields);
      setBase(fields);
      setRemoteChanged(false);
      setSaveError(null);
      return;
    }

    // Mesma tarefa: só age quando a versão remota realmente mudou.
    if (lastSigRef.current === sig) return;
    lastSigRef.current = sig;

    const { draft: atual, base: baseAtual } = mirror.current;
    const sujo =
      atual !== null && baseAtual !== null && signatureOf(atual) !== signatureOf(baseAtual);

    if (sujo) {
      // Alterações locais NÃO são descartadas: o painel avisa "Esta tarefa
      // mudou" e deixa o usuário escolher (aceitar remoto ou continuar).
      if (!mirror.current.saving) setRemoteChanged(true);
    } else {
      // Rascunho limpo: adota a versão nova sem avisar nada.
      setDraft(fields);
      setBase(fields);
    }
  }, [item]);

  const isDirty = useMemo(
    () =>
      draft !== null && base !== null && signatureOf(draft) !== signatureOf(base),
    [draft, base],
  );

  const changedFields = useMemo(() => {
    if (!base || !draft) return [];
    const { fields, statusChanged } = buildMinimalPatch(draft, base);
    const nomes = Object.keys(fields);
    if (statusChanged) nomes.push('status');
    return nomes;
  }, [draft, base]);

  const coherence = useMemo(
    () => checkRemindCoherence(draft?.remindAt, draft?.dueDate, now()),
    [draft?.remindAt, draft?.dueDate, now],
  );

  const setField = useCallback(
    <K extends keyof WorkItemDraftFields>(field: K, value: WorkItemDraftFields[K]) => {
      setDraft((atual) => (atual ? { ...atual, [field]: value } : atual));
    },
    [],
  );

  const reset = useCallback(() => {
    setDraft(base);
    setRemoteChanged(false);
    setSaveError(null);
  }, [base]);

  const acceptRemote = useCallback(() => {
    if (!item) return;
    const fields = fieldsFromItem(item);
    setDraft(fields);
    setBase(fields);
    setRemoteChanged(false);
    setSaveError(null);
  }, [item]);

  const dismissRemote = useCallback(() => setRemoteChanged(false), []);

  const save = useCallback(async (): Promise<DraftSaveOutcome> => {
    if (!item || !draft || !base) {
      return { ok: true, patch: {}, moved: false, partialSaved: false, reason: null };
    }

    const { fields, statusChanged } = buildMinimalPatch(draft, base);
    const patch = { ...fields };
    if (!statusChanged && Object.keys(fields).length === 0) {
      return { ok: true, patch: {}, moved: false, partialSaved: false, reason: null };
    }
    const waitingReason = normNullableText(draft.waitingReason);

    // Limite e motivo (etapa 149) são conferidos ANTES de qualquer escrita: o
    // bloqueio não deixa o item pela metade — "estado anterior" intacto.
    if (statusChanged) {
      const result = canTransition(item.status, draft.status, {
        doingCount: countDoing(items ?? []),
        waitingReason: waitingReason ?? undefined,
      });
      if (!result.ok) {
        toast.error(DRAFT_BLOCK_MESSAGES[result.reason]);
        setSaveError(result.reason);
        return { ok: false, patch, moved: false, partialSaved: false, reason: result.reason };
      }
    }

    setSaveError(null);
    setIsSaving(true);
    savingRef.current = true;
    let updateSaved = false;
    try {
      // Patch mínimo primeiro; a transição de estado por último (o `move` grava
      // status/completed_at e cuida do `waiting_reason`).
      if (Object.keys(fields).length > 0) {
        await update(item.id, fields);
        updateSaved = true;
      }
      if (statusChanged) {
        await move(item, draft.status, {
          waitingReason: waitingReason ?? undefined,
        });
      }
      // Salvo: a base passa a ser o rascunho e a assinatura remota esperada
      // também, para que a nossa PRÓPRIA escrita não seja lida como "mudou".
      const saved = applySavedFields(item, patch, statusChanged ? draft.status : item.status, waitingReason);
      setDraft(saved);
      setBase(saved);
      lastSigRef.current = signatureOf(saved);
      setRemoteChanged(false);
      return { ok: true, patch, moved: statusChanged, partialSaved: false, reason: null };
    } catch (err) {
      // Falha na escrita: a base NÃO avança, então o rascunho continua sujo e
      // pode ser reenviado; o item volta ao valor anterior pelo rollback
      // otimista das mutations do módulo (que também mostram o toast).
      const reason = (err as { blocked?: TransitionBlockReason })?.blocked ?? 'error';
      if (updateSaved) {
        const saved = applySavedFields(item, patch, item.status, normNullableText(item.waiting_reason));
        setBase(saved);
      }
      setSaveError(reason);
      return { ok: false, patch, moved: false, partialSaved: updateSaved, reason };
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [item, items, draft, base, update, move]);

  return {
    draft,
    isDirty,
    changedFields,
    remoteChanged,
    remoteMessage: REMOTE_CHANGE_MESSAGE,
    isSaving,
    saveError,
    coherence,
    setField,
    reset,
    acceptRemote,
    dismissRemote,
    save,
  };
}
