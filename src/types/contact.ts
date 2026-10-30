import type { Database } from '@/integrations/supabase/types';

type _BaseRow = Database['public']['Tables']['contacts']['Row'];

/**
 * ContactRow torna opcionais os campos que o snapshot de types.ts pode não ter
 * ainda, ou que o banco adicionou recentemente. Assim, código que constrói
 * objetos parciais não quebra quando types.ts é regenerado com novas colunas.
 */
export type ContactRow = Omit<
  _BaseRow,
  'blocked_at' | 'blocked_by' | 'presence_status' | 'presence_updated_at' | 'last_seen_at'
> & {
  blocked_at?: string | null;
  blocked_by?: string | null;
  is_vip?: boolean;
  presence_status?: string | null;
  presence_updated_at?: string | null;
  last_seen_at?: string | null;
};
export type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
export type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

export interface Contact extends ContactRow {
  createdAt?: Date;
}

export interface ContactStats {
  totalMessages: number;
  avgResponseTimeMinutes: number;
  totalConversations: number;
  csatAverage: number | null;
  csatCount: number;
}
