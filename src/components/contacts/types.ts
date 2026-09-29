export interface Contact {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  company: string | null;
  job_title: string | null;
  tags: string[] | null;
  contact_type: string | null;
  created_at: string;
  /** Data do último contato via mensagem — populado por useContactsSearch. Null = sem mensagens. */
  last_message_at?: string | null;
  /**
   * Se o usuário pode excluir este contato — vem da RPC `can_delete_contacts`
   * (mesmo predicado de permissão do banco). `undefined` = ainda não respondeu
   * (ou a RPC falhou): o item "Excluir" permanece visível, como antes.
   */
  can_delete?: boolean;
}

export interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  onToggleSelect: (id: string, selected: boolean) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  index: number;
  companyLogo?: string | null;
  companyName?: string | null;
  searchQuery?: string;
}
