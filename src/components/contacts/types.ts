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
