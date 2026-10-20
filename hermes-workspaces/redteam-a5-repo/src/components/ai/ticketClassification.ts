export interface ClassifiedTicket {
  contactId: string;
  contactName: string;
  category: string;
  priority: string;
  confidence: number;
  tags: string[];
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
  if (confidence > 0.8 && (lower.includes('bug') || lower.includes('erro'))) return 'high';
  if (confidence > 0.5) return 'medium';
  return 'low';
}

export function getCategoryInfo(name: string) {
  return CATEGORIES.find(c => c.name === name) || CATEGORIES[4];
}

/** Agrupa tags de IA por contato no formato de ticket exibido no painel. */
export function groupTagsIntoTickets(tags: Array<Record<string, unknown>>): ClassifiedTicket[] {
  const grouped = new Map<string, ClassifiedTicket>();
  tags.forEach((tag) => {
    // Linhas malformadas (sem contact_id/tag_name) são ignoradas em vez de quebrar a classificação
    const contactId = typeof tag.contact_id === 'string' && tag.contact_id ? tag.contact_id : null;
    const tagName = typeof tag.tag_name === 'string' ? tag.tag_name : null;
    if (!contactId || !tagName) return;

    const contact = tag.contacts as Record<string, string> | null;
    const confidence = typeof tag.confidence === 'number' && tag.confidence > 0 ? tag.confidence : 0.7;
    if (!grouped.has(contactId)) {
      grouped.set(contactId, {
        contactId,
        contactName: contact?.name || 'Desconhecido',
        category: classifyTag(tagName),
        priority: derivePriority(tagName, typeof tag.confidence === 'number' ? tag.confidence : 0),
        confidence: confidence * 100,
        tags: [tagName],
        lastMessage: '',
      });
    } else {
      const existing = grouped.get(contactId)!;
      existing.tags.push(tagName);
    }
  });
  return Array.from(grouped.values());
}
