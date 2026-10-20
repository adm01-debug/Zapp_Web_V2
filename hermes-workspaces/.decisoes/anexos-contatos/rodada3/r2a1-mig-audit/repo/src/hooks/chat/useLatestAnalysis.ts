/**
 * useLatestAnalysis
 * 
 * Fetches the latest conversation analysis for a contact to display
 * sentiment, urgency, and key info in the inbox UI.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LatestAnalysis {
  id: string;
  summary: string;
  status: string;
  sentiment: string;
  sentiment_score: number | null;
  urgency: string | null;
  department: string | null;
  customer_satisfaction: number | null;
  key_points: string[] | null;
  topics: string[] | null;
  created_at: string;
}

export function useLatestAnalysis(contactId: string | null | undefined) {
  return useQuery<LatestAnalysis | null>({
    queryKey: ['latest-analysis', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('id, summary, status, sentiment, sentiment_score, urgency, department, customer_satisfaction, key_points, topics, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as LatestAnalysis | null;
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5,
  });
}
