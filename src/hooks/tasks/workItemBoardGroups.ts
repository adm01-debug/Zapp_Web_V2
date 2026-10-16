import { bucketByDue, splitDoneByRecency } from './workItemAggregates';
import type { WorkItem } from './workItem.types';

/** Chave das colunas do agrupamento por prazo (etapa 101 / decisão D1). */
export type BoardDueColumnKey = 'atrasadas' | 'paraHoje' | 'fazendo' | 'concluidas';

export interface BoardDueColumn {
  key: BoardDueColumnKey;
  label: string;
  items: WorkItem[];
}

/**
 * Etapa 101 (D1) — as quatro colunas do agrupamento **por prazo** da imagem 03,
 * na ordem em que aparecem: Atrasadas, Para hoje, Fazendo, Concluídas.
 *
 * Ordem e rótulos ficam aqui (como o `KANBAN_COLUMNS` do agrupamento por estado
 * fica em `workItem.types.ts`), para o componente só renderizar — nenhum texto
 * de coluna solto na tela. A `policy` é a legenda curta de cada coluna.
 */
export const BOARD_DUE_COLUMNS: ReadonlyArray<{
  key: BoardDueColumnKey;
  label: string;
  policy: string;
}> = [
  { key: 'atrasadas',  label: 'Atrasadas',  policy: 'Passou do prazo e continua aberta.' },
  { key: 'paraHoje',   label: 'Para hoje',  policy: 'Vence hoje e ainda não passou.' },
  { key: 'fazendo',    label: 'Fazendo',    policy: 'Aberta, sem prazo vencido nem de hoje.' },
  { key: 'concluidas', label: 'Concluídas', policy: 'Feito nos últimos 7 dias.' },
];

/** O recorte por coluna, para quem precisa do número/label sem montar a lista. */
export interface BoardDueColumns {
  atrasadas: WorkItem[];
  paraHoje: WorkItem[];
  fazendo: WorkItem[];
  concluidas: WorkItem[];
}

/** Peso de prioridade (menor = primeiro) — mesma ordem do resto do módulo. */
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Instante do prazo; `null`/inválido vai para o fim da coluna. */
function when(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Ordem determinística dentro de cada coluna: prazo mais cedo primeiro (sem
 * prazo por último), depois prioridade, depois criação e, por fim, o `id`.
 * O desempate final por `id` garante ordem estável mesmo com prazo e criação
 * iguais — sem ele a lista mudaria de ordem a cada render.
 */
function porPrazo(a: WorkItem, b: WorkItem): number {
  return (
    when(a.due_date) - when(b.due_date) ||
    (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Etapa 101 (D1) — monta as colunas **por prazo** da imagem 03. Função pura e
 * somente leitura: não arrasta, não grava e não muda a ordem da lista recebida
 * (devolve arrays novos, com os mesmos objetos).
 *
 * Cada item cai em **uma** coluna:
 *  - `concluidas`: `status === 'done'` dentro dos 7 dias (sem carimbo também
 *    entra — tarefa não some por falta de dado), na ordem da coluna Concluído
 *    do Quadro (etapa 51);
 *  - `atrasadas`: aberta com prazo vencido — o MESMO veredito do badge e do KPI
 *    (`isOverdue`): prazo com hora marcada que já passou conta como atraso
 *    mesmo sendo hoje;
 *  - `paraHoje`: aberta que vence hoje e ainda não passou;
 *  - `fazendo`: o resto do que está aberto (prazo futuro ou sem prazo). É o
 *    agrupamento por **prazo**, não o estado `doing` — a coluna do meio da
 *    imagem 03 reúne o que já está em andamento e ainda não venceu.
 *
 * Cancela e concluída com mais de 7 dias **não** aparecem em coluna nenhuma:
 * cancelada já é escondida no módulo inteiro e a concluída antiga é o recorte
 * do "ver mais (30 dias)"; contá-las aqui seria inventar card na tela.
 */
export function boardByDue(items: WorkItem[], now: Date = new Date()): BoardDueColumns {
  const base = items ?? [];
  const { overdue, today, tomorrow, upcoming, noDue } = bucketByDue(base, now);
  const { recent: concluidas } = splitDoneByRecency(base, now);

  return {
    atrasadas: overdue.slice().sort(porPrazo),
    paraHoje: today.slice().sort(porPrazo),
    // `bucketByDue` já separa o restante aberto em amanhã/próximas/sem prazo;
    // a coluna do meio recebe os três, na ordem por prazo (sem prazo por último).
    fazendo: [...tomorrow, ...upcoming, ...noDue].sort(porPrazo),
    // A ordem das concluídas vem do `splitDoneByRecency` (etapa 51, mais recente
    // primeiro) — a mesma da coluna Concluído do Quadro; não reordenamos aqui.
    concluidas,
  };
}

/**
 * As colunas já na ordem de render (imagem 03), cada uma com rótulo e itens.
 * É o recorte que o componente consome; `boardByDue` fica para quem só quer os
 * arrays por chave.
 */
export function boardDueColumns(items: WorkItem[], now: Date = new Date()): BoardDueColumn[] {
  const porColuna = boardByDue(items, now);
  return BOARD_DUE_COLUMNS.map(col => ({ key: col.key, label: col.label, items: porColuna[col.key] }));
}
