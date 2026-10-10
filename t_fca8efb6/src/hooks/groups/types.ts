export interface WhatsAppGroup {
  id: string;
  whatsapp_connection_id: string | null;
  group_id: string;
  name: string;
  description: string | null;
  participant_count: number;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  category: string | null;
}

export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  instance_id: string;
}

export const GROUP_CATEGORIES = [
  { value: 'orcamentos', label: 'Orçamentos | Fornecedores', color: 'text-info', icon: '📋' },
  { value: 'aprovacao', label: 'Aprovação | Fornecedores', color: 'text-success', icon: '✅' },
  { value: 'os', label: 'O.S. | Fornecedores', color: 'text-warning', icon: '🔧' },
  { value: 'acerto', label: 'Acerto | Fornecedores', color: 'text-secondary', icon: '🤝' },
] as const;
