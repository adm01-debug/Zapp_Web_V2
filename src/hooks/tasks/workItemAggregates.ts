import { isBefore, startOfDay, addDays, format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { WorkItem, WorkItemStatus } from './workItem.types';
import type { TasksFilters, DueFilter } from './workItemFilters';
import { localDayKey } from '@/lib/localDay';

/** Peso de prioridade (menor = primeiro) — usado na ordenacao por prazo (etapa 49) e por coluna. */
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface BucketsByDue {
  overdue: WorkItem[];
  today: WorkItem[];
  tomorrow: WorkItem[];
  upcoming: WorkItem[];
  noDue: WorkItem[];
  done7d: WorkItem[];
  /** Concluidas entre 8 e 30 dias — reveladas pelo "ver mais (30 dias)" da Lista (etapa 48/B4). */
  doneOlder: WorkItem[];
}

export interface KpiSnapshot {
  overdue: number;
  dueToday: number;
  doingCount: number;
  done7d: number;
  /** Tempo de ciclo (`started_at` → `completed_at`) — mantido para quem já lê hoje. */
  avgCycleTimeDays: number | null;
  /**
   * Etapa 21 / D13: tempo médio **da criação à conclusão** (`created_at` →
   * `completed_at`) das concluídas dos últimos 7 dias, em dias. É o número que
   * o rótulo "Da criação à conclusão" promete (o de ciclo mede outra coisa).
   */
  avgLeadTimeDays: number | null;
}

/**
 * R2-MOD-058 — regra ÚNICA de "prazo vencido" do módulo de Tarefas. O app grava
 * dois tipos de prazo (`temHora`) e cada um vence de um jeito:
 *
 *  - **com hora marcada** (ex.: hoje às 9h): vence no INSTANTE — às 15h do mesmo
 *    dia já está atrasado;
 *  - **de dia inteiro** (23:59 e 00:00 locais, a convenção dos chips
 *    "Hoje/Amanhã/Próx. semana" e do QuickAdd da Agenda): vence quando o dia
 *    LOCAL termina — às 15h do mesmo dia ainda é "Hoje".
 *
 * Antes o badge do menu comparava o prazo com o instante e o módulo (KPI, seções
 * e chip) só com o início do dia: a mesma tarefa acendia o menu e não aparecia em
 * "Atrasadas" na lista que deveria explicá-la. Agora badge, `bucketByDue`
 * (KPI e grupos), `dueLabel` (o chip `DueChip`) e `dayGroupLabel` chamam esta
 * função — um veredito só.
 */
export function isOverdue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (dueDate == null) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;   // data inválida não é atraso
  if (temHora(dueDate)) return due.getTime() < now.getTime();
  return due < startOfDay(now);
}

export function bucketByDue(items: WorkItem[], now: Date = new Date()): BucketsByDue {
  const tomorrowStart  = startOfDay(addDays(now, 1));
  const day2Start      = startOfDay(addDays(now, 2));
  const sevenDaysAgo   = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86_400_000);

  const active = items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const done = items.filter(i => i.status === 'done');
  // Fase F (auditoria): concluída SEM carimbo entra na janela recente — a MESMA
  // regra do `splitDoneByRecency` do Quadro ("tarefa nunca fica escondida por
  // falta de dado"). Antes ela sumia da Lista e aparecia no Quadro.
  const done7d = done.filter(i => i.completed_at == null || new Date(i.completed_at) >= sevenDaysAgo);
  // Etapa 48 (B4): a Lista mostra 7 dias e revela o resto da janela de 30 dias
  // (a query do hook ja traz 30d) no rodape "ver mais (30 dias)". Aqui fica o
  // recorte de 8 a 30 dias — o que a secao recolhida nao mostra.
  const doneOlder = done.filter(i =>
    i.completed_at != null &&
    isBefore(new Date(i.completed_at), sevenDaysAgo) &&
    !isBefore(new Date(i.completed_at), thirtyDaysAgo)
  );

  const overdue: WorkItem[]   = [];
  const today: WorkItem[]     = [];
  const tomorrow: WorkItem[]  = [];
  const upcoming: WorkItem[]  = [];
  const noDue: WorkItem[]     = [];

  for (const item of active) {
    if (!item.due_date) { noDue.push(item); continue; }
    const due = new Date(item.due_date);
    // R2-MOD-058: o mesmo veredito do badge (`isOverdue`), não só o dia anterior.
    if (isOverdue(item.due_date, now)) { overdue.push(item); }
    else if (due < tomorrowStart) { today.push(item); }
    else if (due < day2Start)     { tomorrow.push(item); }
    else                          { upcoming.push(item); }
  }

  return { overdue, today, tomorrow, upcoming, noDue, done7d, doneOlder };
}

/** Fase F (auditoria): busca que ignora acento e caixa — "cafe" acha "Café". */
function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Casa o prazo de um item com o recorte escolhido (etapa 024/037).
 * `today` segue o veredito de `bucketByDue`: é o prazo de hoje SEM contar o que
 * já venceu. `week` é a janela dos próximos 7 dias (do começo de hoje até +7);
 * em nenhum dos dois o atrasado entra.
 */
function casaPrazo(item: WorkItem, filtro: DueFilter, now: Date): boolean {
  if (filtro === 'none') return item.due_date == null;
  if (item.due_date == null) return false;
  if (filtro === 'overdue') return isOverdue(item.due_date, now);
  if (isOverdue(item.due_date, now)) return false;
  const due = new Date(item.due_date);
  if (filtro === 'today') return due < startOfDay(addDays(now, 1));
  return due < startOfDay(addDays(now, 7)); // filtro === 'week'
}

/**
 * Etapa 45/46: o recorte da barra de filtros, aplicado nos três modos (Lista,
 * Quadro e Agenda). Função pura: recebe os itens que a query única já carregou e
 * devolve o subconjunto — nenhum modo, e nenhum filtro, gera request novo.
 *
 * `done` é o filtro que olha o estado terminal do item. `q` casa só o título
 * (o mesmo recorte que a busca sempre fez, agora sem acento).
 *
 * @param now âncora do recorte de prazo (injetável para o teste).
 */
export function applyFilters(items: WorkItem[], f: TasksFilters, now: Date = new Date()): WorkItem[] {
  const termo = normalizarBusca(f.q).trim();
  const base  = items ?? [];
  const dueFiltro = f.due ?? 'all';

  return base.filter(item => {
    if (!f.done && item.status === 'done') return false;
    if (dueFiltro !== 'all' && !casaPrazo(item, dueFiltro, now)) return false;
    if (f.prio !== 'all' && item.priority !== f.prio) return false;
    if (f.contact !== null && item.contact?.id !== f.contact) return false;
    if (f.alarm && item.remind_at === null) return false;
    if (termo !== '' && !normalizarBusca(item.title).includes(termo)) return false;
    return true;
  });
}

/**
 * `due_date` gravado como dia inteiro não tem hora marcada. O app grava **23:59
 * local** nos chips "Hoje/Amanhã/Próx. semana" e no QuickAdd da Agenda — então
 * fim do dia conta como dia inteiro; `00:00` idem, pela convenção oposta.
 * (Fase F2/auditoria: sem isso o grupo "Sem hora" da etapa 55 era inalcançável —
 * toda tarefa criada na interface caía em "Prazos".)
 */
export function temHora(iso: string | null): boolean {
  if (iso === null) return false;
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const fimDoDia = h === 23 && m >= 59;
  const meiaNoite = h === 0 && m === 0;
  return !fimDoDia && !meiaNoite;
}

/**
 * Até 3 pontos do dia na faixa da Agenda (etapa 55), na ordem do plano:
 * prazo (`primary`), alarme (`warning`) e atrasada (`destructive`).
 */
export function agendaDayDots(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas: number,
): string[] {
  const dots: string[] = [];
  if (day.dueTasks.length > 0) dots.push('bg-primary');
  if (day.reminders.length > 0) dots.push('bg-warning');
  if (atrasadas > 0) dots.push('bg-destructive');
  return dots.slice(0, 3);
}

export interface AgendaDayGroups {
  /** por `remind_at`, com a hora à esquerda na tela. */
  alarmes: WorkItem[];
  /** prazo com hora marcada. */
  prazos: WorkItem[];
  /** prazo de dia inteiro (sem hora). */
  semHora: WorkItem[];
}

/**
 * Os três grupos do dia selecionado (etapa 55). Um item com prazo **e** alarme no
 * mesmo dia aparece nos dois grupos — é o DoD da etapa, então nada é deduplicado.
 */
export function groupAgendaDay(day: { reminders: WorkItem[]; dueTasks: WorkItem[] }): AgendaDayGroups {
  const porAlarme = (a: WorkItem, b: WorkItem) => (a.remind_at ?? '').localeCompare(b.remind_at ?? '');
  // Fase F2 (auditoria): dentro de "Prazos" a ordem é por `due_date` (ISO ordena
  // cronologicamente) — antes vinha a ordem bruta da query e a lista do dia
  // aparecia embaralhada.
  const porPrazo  = (a: WorkItem, b: WorkItem) => (a.due_date ?? '').localeCompare(b.due_date ?? '');
  return {
    alarmes: [...day.reminders].sort(porAlarme),
    prazos:  day.dueTasks.filter(t => temHora(t.due_date)).sort(porPrazo),
    semHora: day.dueTasks.filter(t => !temHora(t.due_date)),
  };
}

export interface AgendaDayCounts {
  /** Prazos do dia (`due_date` no dia) — com hora marcada e de dia inteiro. */
  prazos: number;
  /** Lembretes do dia (`remind_at` no dia). */
  lembretes: number;
  /** Atrasadas anteriores ao dia — o bloco vermelho do topo. */
  atrasadas: number;
  /** Prazos de dia inteiro: a seção "Sem hora". */
  semHora: number;
  /** Linhas do dia: a tarefa com prazo E alarme conta UMA vez. */
  total: number;
}

/**
 * Etapa 112: as CONTAGENS do dia, por tipo. A faixa só desenha até 3 pontos
 * (`agendaDayDots`), então o `aria-label` e o resumo do dia ("N tarefas com
 * prazo · M lembretes") não podem sair do número de pontos — saem daqui.
 */
export function agendaDayCounts(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas = 0,
): AgendaDayCounts {
  const grupos = groupAgendaDay(day);
  const total = new Set([...grupos.alarmes, ...grupos.prazos, ...grupos.semHora].map(i => i.id)).size;
  return {
    prazos: day.dueTasks.length,
    lembretes: day.reminders.length,
    atrasadas,
    semHora: grupos.semHora.length,
    total,
  };
}

/**
 * Etapa 112: `aria-label` do cartão do dia com as contagens por tipo —
 * "2 lembretes, 1 prazo" (a ordem e o texto da etapa 111). Sem nada no dia,
 * "Nenhum compromisso".
 */
export function agendaDayAriaLabel(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas = 0,
): string {
  const { prazos, lembretes, atrasadas: atras } = agendaDayCounts(day, atrasadas);
  const partes: string[] = [];
  if (atras > 0) partes.push(`${atras} atrasada${atras === 1 ? '' : 's'}`);
  if (lembretes > 0) partes.push(`${lembretes} lembrete${lembretes === 1 ? '' : 's'}`);
  if (prazos > 0) partes.push(`${prazos} prazo${prazos === 1 ? '' : 's'}`);
  return partes.length > 0 ? partes.join(', ') : 'Nenhum compromisso';
}

export function bucketByStatus(items: WorkItem[]): Record<WorkItemStatus, WorkItem[]> {
  const out: Record<WorkItemStatus, WorkItem[]> = {
    backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
  };
  for (const item of items) out[item.status].push(item);
  for (const col of Object.values(out)) {
    col.sort((a, b) =>
      a.position - b.position ||
      (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2) ||
      a.created_at.localeCompare(b.created_at)
    );
  }
  return out;
}

export function kpis(items: WorkItem[], now: Date = new Date()): KpiSnapshot {
  const { overdue, today, done7d } = bucketByDue(items, now);
  const doing = items.filter(i => i.status === 'doing');
  const cycleTimes = done7d
    .filter(i => i.started_at && i.completed_at)
    .map(i => (new Date(i.completed_at!).getTime() - new Date(i.started_at!).getTime()) / 86_400_000);
  // Etapa 21 (D13): toda concluída de 7 dias entra — inclusive a que nasceu já
  // concluída e a que nunca passou por "Fazendo" (`started_at` nulo). Só fica de
  // fora a concluída sem carimbo (sem `completed_at` não há intervalo a medir).
  const leadTimes = done7d
    .filter(i => i.completed_at)
    .map(i => (new Date(i.completed_at!).getTime() - new Date(i.created_at).getTime()) / 86_400_000);
  return {
    overdue: overdue.length,
    dueToday: today.length,
    doingCount: doing.length,
    done7d: done7d.length,
    avgCycleTimeDays: cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : null,
    avgLeadTimeDays: leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : null,
  };
}

/**
 * Etapa 21 (D13): formata o tempo médio da criação à conclusão em pt-BR, com
 * uma casa decimal e vírgula: "1,4 dias", "1 dia", "2 dias" e "—" quando não há
 * concluídas com os dois carimbos (null).
 */
export function formatLeadTime(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return '—';
  const arredondado = Math.round(days * 10) / 10;
  if (arredondado === 1) return '1 dia';
  const texto = Number.isInteger(arredondado) ? String(arredondado) : arredondado.toFixed(1);
  return texto.replace('.', ',') + ' dias';
}

export function dueLabel(
  dueDate: string,
  now: Date = new Date()
): { label: string; overdue: boolean } {
  const due          = new Date(dueDate);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start    = startOfDay(addDays(now, 2));

  // R2-MOD-058: mesmo veredito do badge e do KPI (`isOverdue`) — prazo com hora
  // marcada que já passou é atraso mesmo sendo hoje.
  if (isOverdue(dueDate, now)) {
    const dist = formatDistanceToNowStrict(due, { locale: ptBR, addSuffix: false });
    return { label: 'Atrasada ' + dist, overdue: true };
  }
  if (due < tomorrowStart) return { label: 'Hoje', overdue: false };
  if (due < day2Start)     return { label: 'Amanha', overdue: false };

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return { label: dayName.replace('.', '') + ' ' + dayMonth, overdue: false };
}

export function weekBuckets(
  items: WorkItem[],
  startDate: Date
): Array<{ date: Date; reminders: WorkItem[]; dueTasks: WorkItem[] }> {
  return Array.from({ length: 7 }, (_, i) => {
    const day    = addDays(startDate, i);
    const dayStr = localDayKey(day);
    return {
      date: day,
      reminders: items.filter(it =>
        it.remind_at &&
        localDayKey(it.remind_at) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
      dueTasks: items.filter(it =>
        it.due_date &&
        localDayKey(it.due_date) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
    };
  });
}

export interface DayGroup {
  label: string;
  items: WorkItem[];
  /** Etapa 52: o dia do grupo em pt-BR — "Domingo, 11 de outubro". */
  subtitle: string;
  /** `localDayKey` do dia do grupo (`yyyy-MM-dd`) — chave estável para seleção/URL. */
  dateKey: string | null;
}

/**
 * Etapa 52: subtítulo de data do grupo, em pt-BR e hora LOCAL —
 * "Domingo, 11 de outubro". Data inválida devolve '' (o grupo fica só com o
 * rótulo curto, sem derrubar a tela).
 */
export function daySubtitle(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const texto = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Etapa 49: rotulo do subcabecalho de dia da secao "Proximas" — "Hoje", "Amanhã",
 * "Qua 01/10" (dentro de 7 dias) ou "Semana que vem" (mais de 7 dias).
 */
export function dayGroupLabel(dueDate: string, now: Date = new Date()): string {
  const due           = new Date(dueDate);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start     = startOfDay(addDays(now, 2));
  const sevenDayLimit = startOfDay(addDays(now, 7));

  if (isOverdue(dueDate, now)) return 'Atrasada';   // R2-MOD-058: mesma regra
  if (due < tomorrowStart) return 'Hoje';
  if (due < day2Start)     return 'Amanhã';

  const dueDay = startOfDay(due);
  if (isBefore(sevenDayLimit, dueDay)) return 'Semana que vem';

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' ' + dayMonth;
}

/** Etapa 49: agrupa as "Proximas" por dia, na ordem prazo → prioridade.
 *  Etapa 52: cada grupo leva o subtítulo do dia (`subtitle`) e a chave local
 *  (`dateKey`). Um grupo "Semana que vem" reúne mais de um dia no MESMO rótulo
 *  (comportamento da etapa 49, mantido): nesse caso os dois campos apontam para
 *  o dia mais cedo do grupo — a lista só separa por dia dentro dos 7 dias. */
export function groupUpcomingByDay(items: WorkItem[], now: Date = new Date()): DayGroup[] {
  const ordered = items
    .filter(i => i.due_date != null)
    .slice()
    .sort((a, b) =>
      a.due_date!.localeCompare(b.due_date!) ||
      (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2)
    );

  const groups: DayGroup[] = [];
  for (const item of ordered) {
    const label = dayGroupLabel(item.due_date!, now);
    const last  = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({
      label,
      items: [item],
      subtitle: daySubtitle(item.due_date!),
      dateKey: localDayKey(item.due_date!),
    });
  }
  return groups;
}

/**
 * Etapa 51 (B5): separa as concluidas da coluna Concluido do Quadro — os 7 dias
 * na frente (ordem `completed_at desc`) e o resto da janela de 30 dias atras do
 * rodape "Ver mais antigas (30 dias)". Concluida sem carimbo entra na janela
 * recente: tarefa nunca fica escondida por falta de dado.
 */
export function splitDoneByRecency(
  items: WorkItem[],
  now: Date = new Date()
): { recent: WorkItem[]; older: WorkItem[] } {
  const sevenDaysAgo  = now.getTime() - 7 * 86_400_000;
  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
  const stamp = (i: WorkItem) => (i.completed_at ? new Date(i.completed_at).getTime() : null);

  const done = items.filter(i => i.status === 'done');
  const recent = done.filter(i => {
    const t = stamp(i);
    return t == null || t >= sevenDaysAgo;
  });
  const older = done.filter(i => {
    const t = stamp(i);
    return t != null && t >= thirtyDaysAgo && t < sevenDaysAgo;
  });

  const desc = (a: WorkItem, b: WorkItem) => (stamp(b) ?? 0) - (stamp(a) ?? 0);
  return { recent: recent.sort(desc), older: older.sort(desc) };
}

// ---------------------------------------------------------------------------
// Etapa 185 — memoização dos selectors (referências estáveis)
// ---------------------------------------------------------------------------
// Os selectors são puros, mas a tela os chama a CADA render e cada chamada
// devolvia arrays/objetos NOVOS — mesmo sem nada ter mudado. Isso invalidava o
// `useMemo` dos filhos e refazia o recorte + os baldes na troca de modo. O
// `useMyWorkItems` já protege os derivados dele com `useMemo(…, [items])`
// (`byDue`/`byStatus`/`kpis`); abaixo a MESMA garantia vale para quem chama o
// selector fora de um componente (o `TasksModule` recorta a lista uma vez e
// reusa o resultado nos três modos).
//
// A chave é a IDENTIDADE da entrada (a lista de itens — e, no recorte, também o
// objeto de filtros): a query só troca a referência quando há dado novo e os
// filtros só trocam quando mudam, então o memo acerta exatamente quando deve.
// Entrada nova recalcula e troca a entrada.

/**
 * Guarda o ÚLTIMO resultado com a chave que o produziu, comparada por
 * identidade (elemento a elemento). Uma entrada só: memória constante, nada de
 * segurar listas antigas. `now` continua opcional como no selector puro; como a
 * tela não o passa, o primeiro cálculo é reaproveitado — o mesmo contrato do
 * `useMemo(…, [items])`.
 */
function memoLast<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let cache: { args: A; result: R } | null = null;
  return (...args: A): R => {
    if (cache && cache.args.length === args.length && cache.args.every((a, i) => Object.is(a, args[i]))) {
      return cache.result;
    }
    const result = fn(...args);
    cache = { args, result };
    return result;
  };
}

/** Etapa 185: `applyFilters` estável — mesma lista + mesmos filtros = mesmo recorte. */
export const memoizedApplyFilters = memoLast(
  (items: WorkItem[], f: TasksFilters): WorkItem[] => applyFilters(items, f),
);

/** Etapa 185: `bucketByDue` estável — a Lista reusa os baldes entre renders. */
export const memoizedBucketByDue = memoLast(
  (items: WorkItem[], now?: Date): BucketsByDue => bucketByDue(items, now),
);

/** Etapa 185: `bucketByStatus` estável — as colunas do Quadro não são recriadas à toa. */
export const memoizedBucketByStatus = memoLast(
  (items: WorkItem[]): Record<WorkItemStatus, WorkItem[]> => bucketByStatus(items),
);

/** Etapa 185: `kpis` estável — a faixa de KPIs não recalcula na troca de modo. */
export const memoizedKpis = memoLast(
  (items: WorkItem[], now?: Date): KpiSnapshot => kpis(items, now),
);
