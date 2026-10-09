/**
 * Período do Histórico (Journey) — S043/S044 do plano
 * `docs/plans/PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md`, decisão D04.
 *
 * Funções puras (sem React, sem consulta, sem dependência nova): traduzem o seletor do calendário
 * da aba IA — os mesmos atalhos que o dono pediu — no intervalo de instantes que o Journey usa
 * para filtrar, para descrever na tela e para comparar com o período anterior (tendência, S048).
 * "Última interação" fica de fora por decisão D04.
 *
 * Regras:
 * - Tudo no **fuso do aparelho** (`src/lib/localDay.ts`): "últimos 7 dias" são 7 dias de
 *   CALENDÁRIO — hoje e os 6 anteriores —, cada um de 00:00:00.000 a 23:59:59.999 locais. É a
 *   mesma conta que o hook da timeline já fazia (`startOfDay(subDays(new Date(), period - 1))`).
 *   `instante − N × 24 h` e `new Date('yyyy-MM-dd')` (meia-noite UTC) erram o dia em UTC-3.
 * - `any` (e qualquer atalho desconhecido) é intervalo aberto: é melhor não limitar do que
 *   inventar janela.
 * - `custom` recebe `yyyy-MM-dd` (zero à esquerda obrigatório) e pega os dias De e Até INTEIROS,
 *   em qualquer ordem (invertido é normalizado). Só "De" deixa o fim em aberto; só "Até" deixa o
 *   início em aberto. Data ilegível — dia que não existe, como 31/02, ou valor que não é texto —
 *   é tratada como "Qualquer data" e marcada com `invalid: true`, para a tela avisar em vez de
 *   filtrar errado.
 * - `toIsoRange` converte as bordas locais para UTC (`toISOString`): é o formato que as consultas
 *   `gte`/`lte` de `created_at` esperam.
 *
 * O cartão F01 cria `src/lib/filesPeriod.ts` com lógica parecida para a aba Arquivos. Este módulo
 * não o importa nem é importado por ele; a unificação dos dois fica para depois (registrada no
 * relato do J02).
 */
import { localDayKey, parseDayKey } from '@/lib/localDay';

/** Atalhos de período do Journey (D04). */
export type JourneyPeriodPreset = 'any' | 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | 'custom';

/** O que o seletor de período guarda. `from`/`to` só valem em `custom`. */
export interface JourneyPeriod {
  preset: JourneyPeriodPreset;
  /** Dia no fuso do aparelho, `yyyy-MM-dd`. */
  from?: string;
  to?: string;
}

/** Intervalo resolvido: `null` nas pontas sem limite. */
export interface JourneyRange {
  from: Date | null;
  to: Date | null;
  /** `custom` com data ilegível: foi tratado como "Qualquer data". */
  invalid: boolean;
}

/** Pontas de um intervalo, como o resto das funções aceita. */
export interface RangeBounds {
  from: Date | null;
  to: Date | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const TEXTO_QUALQUER_DATA = 'Qualquer data';
const APENAS_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Dias de calendário que cada atalho cobre (1 = só hoje). */
const DIAS_POR_ATALHO: Partial<Record<JourneyPeriodPreset, number>> = {
  today: 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

/** Rótulo de cada atalho, igual ao do seletor da aba IA. */
const ROTULO_POR_ATALHO: Partial<Record<JourneyPeriodPreset, string>> = {
  any: TEXTO_QUALQUER_DATA,
  today: 'Hoje',
  '3d': 'Últimos 3 dias',
  '7d': 'Últimos 7 dias',
  '14d': 'Últimos 14 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
};

/** Intervalo sem limites. */
function aberto(invalid = false): JourneyRange {
  return { from: null, to: null, invalid };
}

/** 00:00:00.000 do dia do aparelho em que o instante cai. */
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** 23:59:59.999 do dia do aparelho em que o instante cai. */
function fimDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Desloca dias de CALENDÁRIO (mês, ano e virada por horário de verão corretos — o `Date` normaliza
 * o estouro de 31, então "hoje − 89" funciona em qualquer mês). Não é `instante − n × 24 h`.
 */
function deslocarDia(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, 0, 0, 0, 0);
}

/** `yyyy-MM-dd` de verdade: formato exato E dia existente no calendário. */
function diaValido(key: string | null | undefined): Date | null {
  const parsed = parseDayKey(key);
  // `parseDayKey` monta `new Date(ano, mês - 1, dia)` e o JS ROLA 31/02 para 03/03: o dia só vale
  // se voltar igual ao que foi pedido.
  if (!parsed || localDayKey(parsed) !== key) return null;
  return parsed;
}

/** Campo de data do `custom`: diz se veio preenchido e o texto limpo (campo vazio = ausente). */
function campoDeData(valor: unknown): { presente: boolean; valor: string } {
  if (valor === null || valor === undefined) return { presente: false, valor: '' };
  // Tipo errado (número, objeto) não é campo vazio: é dado ilegível, e a tela precisa saber.
  if (typeof valor !== 'string') return { presente: true, valor: String(valor) };
  const limpo = valor.trim();
  return { presente: limpo !== '', valor: limpo };
}

/** Descarta `Date` inválida (`Invalid Date`) — ela viraria `NaN` no intervalo e estouraria no `toISOString`. */
function dataOuNula(d: Date | null | undefined): Date | null {
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Ordena as pontas para que intervalo invertido não vire consulta vazia (e joga fora data inválida). */
function ordenar(from: Date | null, to: Date | null): RangeBounds {
  const a = dataOuNula(from);
  const b = dataOuNula(to);
  if (a && b && a.getTime() > b.getTime()) return { from: b, to: a };
  return { from: a, to: b };
}

/** Fecha as pontas no dia inteiro: início 00:00, fim 23:59:59.999. */
function intervalDePontas(from: Date | null, to: Date | null): JourneyRange {
  const ordenado = ordenar(from, to);
  return {
    from: ordenado.from ? inicioDoDia(ordenado.from) : null,
    to: ordenado.to ? fimDoDia(ordenado.to) : null,
    invalid: false,
  };
}

function resolverCustom(period: JourneyPeriod): JourneyRange {
  const de = campoDeData(period.from);
  const ate = campoDeData(period.to);
  const inicio = de.valor ? diaValido(de.valor) : null;
  const fim = ate.valor ? diaValido(ate.valor) : null;
  if ((de.presente && !inicio) || (ate.presente && !fim)) return aberto(true);
  if (!inicio && !fim) return aberto();
  // Só "De" deixa o fim em aberto (o histórico vai até agora); só "Até" varre desde o começo.
  return intervalDePontas(inicio, fim);
}

/**
 * Intervalo do período escolhido. `now` é injetado para os testes e para quem precisa do mesmo
 * "hoje" em várias chamadas da mesma renderização.
 */
export function resolveRange(period: JourneyPeriod | null | undefined, now: Date = new Date()): JourneyRange {
  const preset = period?.preset;
  if (preset === 'custom') return resolverCustom(period as JourneyPeriod);
  const dias = preset ? DIAS_POR_ATALHO[preset] : undefined;
  if (!dias) return aberto();
  const hoje = dataOuNula(inicioDoDia(now));
  // Sem "hoje" confiável é melhor não limitar do que montar um intervalo inválido.
  if (!hoje) return aberto();
  // "Últimos N dias" inclui hoje: o primeiro dia é hoje − (N − 1).
  return intervalDePontas(deslocarDia(hoje, -(dias - 1)), hoje);
}

/**
 * O período IMEDIATAMENTE anterior, de mesma duração em dias (S048 — tendência das estatísticas).
 * Fica colado no intervalo atual (termina 1 ms antes do início dele) e não se sobrepõe a ele.
 * Intervalo aberto em qualquer ponta não tem anterior: devolve `null`.
 */
export function previousRange(range: RangeBounds | null | undefined): { from: Date; to: Date } | null {
  const ordenado = ordenar(range?.from ?? null, range?.to ?? null);
  if (!ordenado.from || !ordenado.to) return null;
  const inicio = ordenado.from;
  const fim = ordenado.to;
  // Duração em dias de calendário (as bordas já vêm inteiras de `resolveRange`).
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime() + 1) / DIA_MS));
  return { from: deslocarDia(inicio, -dias), to: new Date(inicio.getTime() - 1) };
}

/**
 * Bordas em UTC para as consultas (`gte` em `created_at` usa `sinceIso`, `lte` usa `untilIso`).
 * `null` significa "sem limite deste lado".
 */
export function toIsoRange(
  range: RangeBounds | null | undefined,
): { sinceIso: string | null; untilIso: string | null } {
  const ordenado = ordenar(range?.from ?? null, range?.to ?? null);
  return {
    sinceIso: ordenado.from ? ordenado.from.toISOString() : null,
    untilIso: ordenado.to ? ordenado.to.toISOString() : null,
  };
}

/** Instante em ms; `null` para valor ausente ou ilegível. */
function instanteMs(valor: string | Date | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.getTime();
  const bruto = valor.trim();
  if (!bruto) return null;
  if (APENAS_DIA.test(bruto)) {
    // Dia puro é o dia do APARELHO (meia-noite local), não meia-noite UTC; e 31/02 não vira 03/03.
    const dia = diaValido(bruto);
    return dia ? dia.getTime() : null;
  }
  const ms = Date.parse(bruto);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * O instante cai no intervalo? Bordas INCLUSIVE (as duas pontas pertencem ao período).
 * Intervalo sem limites aceita qualquer instante válido; valor ausente ou ilegível nunca entra.
 */
export function isWithin(
  dateIso: string | Date | null | undefined,
  range: RangeBounds | null | undefined,
): boolean {
  const ms = instanteMs(dateIso);
  if (ms === null) return false;
  const ordenado = ordenar(range?.from ?? null, range?.to ?? null);
  if (ordenado.from && ms < ordenado.from.getTime()) return false;
  if (ordenado.to && ms > ordenado.to.getTime()) return false;
  return true;
}

function comDoisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** `dd/MM` no fuso do aparelho. */
function dataCurta(d: Date): string {
  return `${comDoisDigitos(d.getDate())}/${comDoisDigitos(d.getMonth() + 1)}`;
}

/** `dd/MM/aaaa` no fuso do aparelho. */
function dataLonga(d: Date): string {
  return `${dataCurta(d)}/${d.getFullYear()}`;
}

/** `01/10 a 07/10/2026`, `01/10/2026` (mesmo dia) ou os dois anos quando mudam. */
function descreverIntervalo(from: Date, to: Date): string {
  const mesmoAno = from.getFullYear() === to.getFullYear();
  const mesmoDia = mesmoAno && from.getMonth() === to.getMonth() && from.getDate() === to.getDate();
  if (mesmoDia) return dataLonga(from);
  return `${mesmoAno ? dataCurta(from) : dataLonga(from)} a ${dataLonga(to)}`;
}

/**
 * Rótulo do período para a tela: "Últimos 7 dias", "01/10 a 07/10/2026", "Qualquer data".
 * Descreve exatamente o intervalo que `resolveRange` aplica (inclusive normalizado).
 */
export function describePeriod(period: JourneyPeriod | null | undefined, now: Date = new Date()): string {
  const preset = period?.preset;
  if (preset === 'custom') {
    const { from, to, invalid } = resolveRange(period, now);
    if (invalid) return TEXTO_QUALQUER_DATA;
    if (from && to) return descreverIntervalo(from, to);
    if (from) return `A partir de ${dataLonga(from)}`;
    if (to) return `Até ${dataLonga(to)}`;
    return TEXTO_QUALQUER_DATA;
  }
  return (preset ? ROTULO_POR_ATALHO[preset] : undefined) ?? TEXTO_QUALQUER_DATA;
}
