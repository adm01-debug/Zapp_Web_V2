import type { Database } from '@/integrations/supabase/types';

export type QueueRow = Database['public']['Tables']['queues']['Row'];
export type QueueMemberRow = Database['public']['Tables']['queue_members']['Row'];

export type Queue = QueueRow;

export interface QueueMember extends QueueMemberRow {
  profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_active: boolean;
  };
}

export interface QueueWithMembers extends Queue {
  id: string;
  name: string;
  color: string;
  members: QueueMember[];
  waiting_count: number;
}
