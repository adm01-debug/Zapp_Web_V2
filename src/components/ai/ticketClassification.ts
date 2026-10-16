import { normalizeScore } from '@/lib/ai-values';

export interface ClassifiedTicket {
  contactId: string;
  contactName: string;
  category: string;
  priority: string;
  /** Percentual 0..100 medido; `null` quando a confiança falta ou é inválida. */
  confidence: number | null;
  lastMessage: string;
}

export const CATEGORIES = [
  { name: 'Suporte Técnico', color: 'bg-info/10 text-info', icon: '🔧' },
  { name: 'Vendas', color: 'bg-success/10 text-success', icon: '💰' },
  { name: 'Financeiro', color: 'bg-warning/10 text-warning', icon: '💳' },
  { name: 'Reclamação', color: 'bg-destructive/10 text-destructive', icon: '⚠️' },
  { name: 'Informação', color: 'bg-secondary/10 text-secondary', icon: 'ℹ️' },
  { name: 'Agendamento', color: 'bg-accent/10 text-accent-foreground', icon: '📅' },
];

export const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent: { label: 'Urgente', color: 'bg-destructive text-destructive-foreground' },
  high: { label: 'Alta', color: 'bg-warning text-warning-foreground' },
  medium: { label: 'Média', color: 'bg-accent text-accent-foreground' },
  low: { label: 'Baixa', color: 'bg-success text-success-foreground' },
};

export function classifyTag(tagName: string): string {
  const lower = tagName.toLowerCase();
  if (lower.includes('suporte') || lower.includes('bug') || lower.includes('erro')) return 'Suporte Técnico';
  if (lower.includes('vend') || lower.includes('preço') || lower.includes('compra')) return 'Vendas';
  if (lower.includes('pag') || lower.includes('boleto') || lower.includes('fatura')) return 'Financeiro';
  if (lower.includes('reclam') || lower.includes('insatisf')) return 'Reclamação';
  if (lower.includes('agend') || lower.includes('horário')) return 'Agendamento';
  return 'Informação';
}

export function derivePriority(tagName: string, confidence: number): string {
  const lower = tagName.toLowerCase();
  if (lower.includes('urgent') || lower.includes('reclam')) return 'urgent';
  // IA-023: a confiança passa pelo normalizador em vez de um valor arbitrário.
  // Em escala ratio o normalizado é o próprio número; fora de escala mantém a
  // comparação legada para não alterar nenhuma prioridade existente.
  const score = normalizeScore(confidence, { min: 0, max: 1, scale: 'ratio' }).value ?? confidence;
  if (score > 0.8 && (lower.includes('bug') || lower.includes('erro'))) return 'high';
  if (score > 0.5) return 'medium';
  return 'low';
}

export function getCategoryInfo(name: string) {
  return CATEGORIES.find(c => c.name === name) || CATEGORIES[4];
}
