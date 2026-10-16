/**
 * CV-036 — Calendário comercial de brindes da Promo Brindes.
 * Datas sazonais com antecedência ideal de pedido por tipo de produto.
 */

export interface CommercialEvent {
  /** Chave canônica usada em copilot_sessions.occasion */
  key: string;
  label: string;
  /** Mês (1-12) e dia aproximado */
  month: number;
  day: number;
  /** Dias de antecedência para pedido com gravação */
  leadDaysWithPrint: number;
  /** Dias de antecedência para pedido simples (sem gravação) */
  leadDaysSimple: number;
  /** Categorias de produto que mais vendem nessa ocasião */
  topCategories: string[];
  /** Aviso exibido no painel RADAR */
  urgencyNote: (daysLeft: number) => string;
}

export const COMMERCIAL_CALENDAR: CommercialEvent[] = [
  {
    key: 'dia_das_maes',
    label: 'Dia das Mães',
    month: 5, day: 11,
    leadDaysWithPrint: 30, leadDaysSimple: 15,
    topCategories: ['kits_cosmeticos', 'sacolas', 'canecas_personalizadas'],
    urgencyNote: (d) => d <= 0 ? 'Dia das Mães passou.' : `Dia das Mães em ${d} dias — pedidos com gravação fecham em ${Math.max(0, d - 30)} dias.`,
  },
  {
    key: 'dia_dos_namorados',
    label: 'Dia dos Namorados',
    month: 6, day: 12,
    leadDaysWithPrint: 25, leadDaysSimple: 12,
    topCategories: ['kits_premium', 'chocolates', 'velas'],
    urgencyNote: (d) => `Dia dos Namorados em ${d} dias.`,
  },
  {
    key: 'dia_dos_pais',
    label: 'Dia dos Pais',
    month: 8, day: 11,
    leadDaysWithPrint: 30, leadDaysSimple: 15,
    topCategories: ['kits_masculinos', 'canecas', 'squeezes'],
    urgencyNote: (d) => `Dia dos Pais em ${d} dias — prazo com gravação: ${Math.max(0, d - 30)} dias.`,
  },
  {
    key: 'outubro_rosa',
    label: 'Outubro Rosa',
    month: 10, day: 1,
    leadDaysWithPrint: 45, leadDaysSimple: 20,
    topCategories: ['produtos_rosas', 'lacos', 'kits_conscientizacao'],
    urgencyNote: (d) => d <= 0 ? 'Outubro Rosa em andamento!' : `Outubro Rosa começa em ${d} dias.`,
  },
  {
    key: 'novembro_azul',
    label: 'Novembro Azul',
    month: 11, day: 1,
    leadDaysWithPrint: 45, leadDaysSimple: 20,
    topCategories: ['produtos_azuis', 'brindes_masculinos'],
    urgencyNote: (d) => d <= 0 ? 'Novembro Azul em andamento!' : `Novembro Azul começa em ${d} dias.`,
  },
  {
    key: 'sipat',
    label: 'SIPAT',
    month: 0, day: 0,
    leadDaysWithPrint: 30, leadDaysSimple: 15,
    topCategories: ['epi_personalizado', 'kits_seguranca', 'squeezes'],
    urgencyNote: (_d) => 'SIPAT detectada — pedidos com gravação precisam de ao menos 30 dias.',
  },
  {
    key: 'natal',
    label: 'Natal / Fim de Ano',
    month: 12, day: 25,
    leadDaysWithPrint: 60, leadDaysSimple: 30,
    topCategories: ['kits_natal', 'vinhos', 'cestas', 'brindes_premium'],
    urgencyNote: (d) => d <= 0 ? 'Natal passou.' : `Natal em ${d} dias — pedidos com gravação: fechar até ${Math.max(0, d - 60)} dias.`,
  },
  {
    key: 'ano_novo',
    label: 'Ano Novo',
    month: 1, day: 1,
    leadDaysWithPrint: 45, leadDaysSimple: 20,
    topCategories: ['agendas', 'calendarios', 'kits_boas_vindas'],
    urgencyNote: (d) => `Ano Novo em ${d} dias — agendas e calendários: pedir até ${Math.max(0, d - 45)} dias.`,
  },
  {
    key: 'dia_do_cliente',
    label: 'Dia do Cliente',
    month: 9, day: 15,
    leadDaysWithPrint: 30, leadDaysSimple: 15,
    topCategories: ['brindes_fidelizacao', 'kits_personalizados'],
    urgencyNote: (d) => `Dia do Cliente em ${d} dias.`,
  },
  {
    key: 'convencao',
    label: 'Convenção / Evento Corporativo',
    month: 0, day: 0,
    leadDaysWithPrint: 35, leadDaysSimple: 20,
    topCategories: ['mochilas', 'crachas', 'kits_evento'],
    urgencyNote: (_d) => 'Evento corporativo detectado — brindes com gravação: mínimo 35 dias.',
  },
];

/** Dias restantes até uma data sazonal (ano corrente ou próximo). */
export function daysUntil(month: number, day: number, from = new Date()): number {
  if (month === 0) return 999;
  let target = new Date(from.getFullYear(), month - 1, day);
  if (target < from) target = new Date(from.getFullYear() + 1, month - 1, day);
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
}

/** Retorna os eventos relevantes dado uma occasion key ou texto livre. */
export function getOccasionEvent(key: string): CommercialEvent | undefined {
  return COMMERCIAL_CALENDAR.find(e => e.key === key);
}
