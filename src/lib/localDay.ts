/**
 * Regra de data do produto (30/09/2026): **datas exibidas e agrupadas usam o fuso local do
 * navegador**. Fatiar o ISO em UTC (`toISOString().slice(0, 10)`) joga 22:30 em São Paulo
 * (UTC-3) para o dia seguinte — foi o defeito encontrado na Agenda, na timeline do Histórico
 * e nas Notas do contato.
 *
 * Este módulo só LÊ e agrupa: nada aqui altera o que está gravado nas tabelas.
 */

/**
 * Dia no fuso local, como `yyyy-MM-dd`.
 * Devolve `null` para valor ausente ou inválido, em vez de estourar dentro de um filtro.
 */
export function localDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * `yyyy-MM-dd` -> `Date` na meia-noite **local**.
 * Não use `new Date('2026-09-30')`: o padrão da linguagem interpreta a chave como meia-noite
 * UTC e, em UTC-3, o rótulo sai com o dia anterior.
 */
export function parseDayKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Dia-calendário de um timestamp gravado **sem hora**: o `<input type="date">` do app grava
 * `new Date('yyyy-MM-dd').toISOString()`, que é meia-noite **UTC** — o dia escolhido é a data
 * UTC do instante. Formatar esse valor em hora local mostraria o dia anterior (em UTC-3,
 * 30/09 vira 29/09). Qualquer outro instante é tratado como instante (dia local).
 *
 * Não muda o que está gravado: só decide como ler.
 */
export function calendarDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const semHora =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  if (!semHora) return localDayKey(d);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/**
 * `yyyy-MM-dd` + `HH:mm` -> instante no **fuso local** (o que o usuário escolheu no relógio dele).
 *
 * É o caminho inverso do `parseDayKey` e existe porque `new Date('2026-10-03')` é meia-noite UTC:
 * em UTC-3, `setHours(9)` sobre ele agenda para 02/10 09:00 — **um dia antes** do escolhido — e
 * uma data futura válida chega a ser recusada como passada.
 *
 * Devolve `null` para data/hora ausente ou inválida. Não altera nada do que está gravado: só
 * monta o instante a ser enviado.
 */
export function localInstantFromDayAndTime(
  dayKey: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  const d = parseDayKey(dayKey);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? '').trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  d.setHours(horas, minutos, 0, 0);
  return d;
}

/**
 * Deslocamento do fuso (ms) no instante informado, lido do proprio `Intl` — sem dependencia nova.
 * Só serve a `zonedDayStartISO`; nao exportado.
 */
function timeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const naParede = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return naParede - at.getTime();
}

/**
 * Início (00:00) do dia de calendário `key` em um fuso IANA, como `Date`.
 *
 * O deslocamento é lido em duas passadas para acertar mudança de horário (DST) de qualquer fuso.
 * Só serve aos helpers de recorte por dia de calendário deste módulo.
 */
function zonedDayStartFromKey(timeZone: string, key: string): Date {
  const meiaNoiteUtc = Date.parse(`${key}T00:00:00.000Z`);
  const primeira = meiaNoiteUtc - timeZoneOffsetMs(timeZone, new Date(meiaNoiteUtc));
  return new Date(meiaNoiteUtc - timeZoneOffsetMs(timeZone, new Date(primeira)));
}

/**
 * Início (00:00) do dia de calendário **em um fuso IANA**, N dias atrás, como instante ISO.
 *
 * Os helpers acima resolvem exibição e agrupamento no fuso do **navegador**. Este resolve o caso
 * oposto: um recorte que **não pode** depender de quem está olhando (filtro gravado e reusado por
 * qualquer usuário, contagem feita no servidor), então "nos últimos 7 dias" tem de significar os
 * mesmos 7 dias de calendário para todos.
 *
 * Existe porque `Date.now() - d * 86_400_000` é uma janela de d*24h: as 22h30 em São Paulo (UTC-3)
 * os "7 dias" alcançavam o 8º dia de calendário — o mesmo defeito corrigido no R3-06 (timeline do
 * Histórico), aqui num filtro de audiência.
 *
 * Para os recortes do app use os atalhos `appDayStart`/`appDayEnd`/`appWeekStart`/`appMonthStart`,
 * que já fixam `APP_TIMEZONE` — não repita a string do fuso nas telas.
 */
export function zonedDayStartISO(timeZone: string, daysAgo = 0, now: Date = new Date()): string {
  const diaLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA devolve yyyy-MM-dd
  return zonedDayStartFromKey(timeZone, appShiftDayKey(diaLocal, -daysAgo)).toISOString();
}

/**
 * Fuso dos recortes do produto que **não podem** depender de quem está olhando: filtros de
 * período, janelas de consulta e qualquer número que tenha de bater com o que o servidor conta.
 * É o mesmo fuso usado por `in_last_days`/`not_in_last_days` e por `conversation_closure_day`
 * no banco (America/Sao_Paulo).
 */
export const APP_TIMEZONE = 'America/Sao_Paulo';

/**
 * Deslocamento de dias sobre uma chave `yyyy-MM-dd`, por **aritmética de calendário** (em UTC,
 * sem horas envolvidas) — o mesmo caminho que `zonedDayStartISO` já usava.
 */
export function appShiftDayKey(key: string, delta: number): string {
  const [ano, mes, dia] = key.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia) + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Dia de calendário de um instante **no fuso do app** (`yyyy-MM-dd`). */
export function appDayKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Hora (0-23) do relógio **no fuso do app** para um instante.
 *
 * Existe para o mesmo motivo do `appDayKey`: a RPC `dashboard_hourly_volume` já devolve os
 * buckets com `day`/`hour` derivados em America/Sao_Paulo, então "hora atual" tem de ser lida
 * no mesmo fuso — `Date#getHours` usa o fuso do dispositivo e desloca o bucket corrente.
 */
export function appHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour12: false,
    hourCycle: 'h23',
    hour: '2-digit',
  }).formatToParts(now);
  const hora = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return hora % 24;
}

/** Início (00:00) do dia de calendário `key` no fuso do app. */
export function appDayStartOfKey(key: string): Date {
  return zonedDayStartFromKey(APP_TIMEZONE, key);
}

/** `dd/MM` a partir de uma chave `yyyy-MM-dd`, sem depender do fuso do processo. */
export function appDayKeyLabel(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Fim (23:59:59.999) do dia de calendário `key` no fuso do app. */
export function appDayEndOfKey(key: string): Date {
  return new Date(appDayStartOfKey(appShiftDayKey(key, 1)).getTime() - 1);
}

/** Início (00:00) do dia de calendário no fuso do app, `daysAgo` dias atrás (0 = hoje). */
export function appDayStart(daysAgo = 0, now: Date = new Date()): Date {
  return appDayStartOfKey(appShiftDayKey(appDayKey(now), -daysAgo));
}

/** Fim (23:59:59.999) do dia de calendário no fuso do app, `daysAgo` dias atrás (0 = hoje). */
export function appDayEnd(daysAgo = 0, now: Date = new Date()): Date {
  return new Date(appDayStart(daysAgo - 1, now).getTime() - 1);
}

/**
 * Início/fim do dia escolhido no calendário da tela: o dia é o do **relógio do usuário**
 * (o que ele viu no seletor), mas o recorte é aplicado no fuso do app.
 */
export function appDayStartOfLocalDate(date: Date): Date {
  return appDayStartOfKey(localDayKey(date) ?? appDayKey(date));
}

/** Ver `appDayStartOfLocalDate`. */
export function appDayEndOfLocalDate(date: Date): Date {
  return appDayEndOfKey(localDayKey(date) ?? appDayKey(date));
}

/**
 * Domingo 00:00 da semana corrente no fuso do app — mesmo começo de semana que o `startOfWeek`
 * do date-fns com o locale ptBR (`weekStartsOn: 0`), só que ancorado no fuso do app.
 */
export function appWeekStart(now: Date = new Date()): Date {
  const key = appDayKey(now);
  const diaDaSemana = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return appDayStartOfKey(appShiftDayKey(key, -diaDaSemana));
}

/** Sábado 23:59:59.999 da semana corrente no fuso do app. */
export function appWeekEnd(now: Date = new Date()): Date {
  const key = appShiftDayKey(appDayKey(appWeekStart(now)), 6);
  return appDayEndOfKey(key);
}

/** Dia 1 do mês corrente, 00:00, no fuso do app. */
export function appMonthStart(now: Date = new Date()): Date {
  return appDayStartOfKey(`${appDayKey(now).slice(0, 7)}-01`);
}

/** Último dia do mês corrente, 23:59:59.999, no fuso do app. */
export function appMonthEnd(now: Date = new Date()): Date {
  const [ano, mes] = appDayKey(now).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return appDayEndOfKey(`${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`);
}
