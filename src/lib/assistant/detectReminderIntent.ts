/**
 * Fase 2 do plano do assistente pessoal: quando o cliente diz "me liga na
 * quinta", o assistente OFERECE criar o lembrete. Detectar a data é
 * determinístico (não depende do modelo), então vive aqui — puro e testável —
 * em vez de sair do prompt da IA. A IA pode sugerir o texto; a data quem
 * resolve é esta função.
 */

export type ReminderIntent = {
  /** Quando o lembrete deve tocar (ISO, fuso local do navegador). */
  remindAt: string;
  /** Trecho da mensagem que originou a oferta (auditável na UI). */
  matchedText: string;
  /** Como a data foi resolvida — mostrado ao usuário para ele conferir. */
  label: string;
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

/** Remove acentos para casar "quinta-feira", "sábado", "Terça". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function atHour(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const WEEKDAY_LABEL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Resolve a próxima ocorrência de um dia da semana. "Na quinta" dito numa
 * quinta significa a PRÓXIMA quinta (7 dias), não hoje: um lembrete para hoje
 * à noite seria ruído.
 */
function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from);
  const delta = ((weekday - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

const DEFAULT_HOUR = 9;

/**
 * Extrai uma intenção de lembrete de uma mensagem em português.
 * Devolve `null` quando não há data reconhecível — sem data não há oferta.
 */
export function detectReminderIntent(message: string, now: Date = new Date()): ReminderIntent | null {
  if (!message || !message.trim()) return null;
  const text = normalize(message.trim());

  // Horário explícito: "às 14h", "as 14:30", "15 horas".
  const hourMatch = text.match(/\b(?:as|a|pelas|para as)\s+(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|horas?)?\b/);
  const hour = hourMatch ? Math.min(23, Number(hourMatch[1])) : DEFAULT_HOUR;
  const minute = hourMatch && hourMatch[2] ? Math.min(59, Number(hourMatch[2])) : 0;
  const withTime = (d: Date) => {
    const out = new Date(d);
    out.setHours(hour, minute, 0, 0);
    return out;
  };

  // 1. Hoje / amanhã / depois de amanhã.
  const relMatch = text.match(/\b(hoje|amanha|depois de amanha)\b/);
  if (relMatch) {
    const base = new Date(now);
    if (relMatch[1] === 'amanha') base.setDate(base.getDate() + 1);
    if (relMatch[1] === 'depois de amanha') base.setDate(base.getDate() + 2);
    const remindAt = withTime(base);
    // "Hoje" sem hora explícita e já passou do horário: empurra para amanhã.
    if (!hourMatch && remindAt.getTime() <= now.getTime()) {
      base.setDate(base.getDate() + 1);
      return {
        remindAt: withTime(base).toISOString(),
        matchedText: relMatch[0],
        label: relMatch[1] === 'hoje' ? 'amanhã (horário de hoje já passou)' : relMatch[1],
      };
    }
    return { remindAt: remindAt.toISOString(), matchedText: relMatch[0], label: relMatch[1] };
  }

  // 2. Dia da semana ("quinta", "sexta-feira", "segunda").
  const weekdayMatch = text.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/);
  if (weekdayMatch) {
    const weekday = WEEKDAYS[weekdayMatch[1]];
    const target = withTime(nextWeekday(now, weekday));
    return {
      remindAt: target.toISOString(),
      matchedText: weekdayMatch[0],
      label: `${WEEKDAY_LABEL[weekday]}, ${target.toLocaleDateString('pt-BR')}`,
    };
  }

  // 3. Data numérica: 25/12, 25/12/2026, 25-12.
  const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    let year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      let target = new Date(year, month, day);
      // Data sem ano que já passou é do ano seguinte ("dia 5/1" em dezembro).
      if (!dateMatch[3] && target.getTime() < new Date(now).setHours(0, 0, 0, 0)) {
        target = new Date(year + 1, month, day);
      }
      const withHour = withTime(target);
      if (!Number.isNaN(withHour.getTime())) {
        return {
          remindAt: withHour.toISOString(),
          matchedText: dateMatch[0],
          label: withHour.toLocaleDateString('pt-BR'),
        };
      }
    }
  }

  // 4. Verbo de contato sem data ("me liga", "me chama") → amanhã 9h.
  if (/\b(me liga|me chama|me retorna|ligar|chamar|retornar|avisar)\b/.test(text)) {
    const amanha = new Date(now);
    amanha.setDate(amanha.getDate() + 1);
    return {
      remindAt: atHour(amanha, DEFAULT_HOUR).toISOString(),
      matchedText: 'pedido de contato',
      label: `amanhã, ${DEFAULT_HOUR}h`,
    };
  }

  return null;
}