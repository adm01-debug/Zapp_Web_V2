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
