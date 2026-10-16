import type { Database } from '@/integrations/supabase/types';

/**
 * ContactRow estende a linha gerada com colunas recentes ainda não regeneradas
 * no snapshot de types.ts (blocked_at, blocked_by, is_vip).
 * Remover quando o próximo `generate-types` incluir essas colunas.
 */
export type ContactRow = Database['public']['Tables']['contacts']['Row'] & {
  /** Timestamp de bloqueio do contato (null = não bloqueado). */
  blocked_at?: string | null;
  /** Agente que realizou o bloqueio. */
  blocked_by?: string | null;
  /** Marcador VIP do contato (default false no banco). */
  is_vip?: boolean;
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
