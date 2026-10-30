/**
 * Etapas da venda do RADAR — os valores de `copilot_sessions.sale_stage`
 * (CHECK da migration 20261030100000). Fonte única para rótulo, cor e fase.
 */
export const SALE_STAGES = [
  'novo_contato', 'qualificando', 'apresentando', 'negociando', 'fechando', 'pos_venda', 'perdido',
] as const;
export type SaleStage = (typeof SALE_STAGES)[number];

/** Fase da conversa, usada para escolher o tom das perguntas B·R·I·N·D·E. */
export type FaseVenda = 'inicio' | 'meio' | 'fim';

export const SALE_STAGE_META: Record<SaleStage, { label: string; dot: string; chip: string; fase: FaseVenda }> = {
  novo_contato: { label: 'Novo contato', dot: 'bg-slate-400', chip: 'bg-sky-500/20 text-sky-700 dark:text-sky-300', fase: 'inicio' },
  qualificando: { label: 'Qualificando', dot: 'bg-blue-400', chip: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300', fase: 'inicio' },
  apresentando: { label: 'Apresentando', dot: 'bg-indigo-400', chip: 'bg-violet-500/20 text-violet-700 dark:text-violet-300', fase: 'meio' },
  negociando: { label: 'Negociando', dot: 'bg-amber-400', chip: 'bg-orange-500/20 text-orange-700 dark:text-orange-300', fase: 'meio' },
  fechando: { label: 'Fechando', dot: 'bg-green-400', chip: 'bg-green-500/20 text-green-700 dark:text-green-300', fase: 'fim' },
  pos_venda: { label: 'Pós-venda', dot: 'bg-emerald-500', chip: 'bg-teal-500/20 text-teal-700 dark:text-teal-300', fase: 'fim' },
  perdido: { label: 'Perdido', dot: 'bg-red-400', chip: 'bg-red-500/20 text-red-700 dark:text-red-300', fase: 'fim' },
};

export function isSaleStage(v: unknown): v is SaleStage {
  return typeof v === 'string' && (SALE_STAGES as readonly string[]).includes(v);
}
