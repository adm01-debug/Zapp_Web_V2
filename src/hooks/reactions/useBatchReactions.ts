import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { MessageReaction } from './types';

/**
 * Hook for batch loading reactions for multiple messages.
 */
export function useMessagesReactions(messageIds: string[]) {
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (messageIds.length === 0) return;

    const fetchReactions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (error) throw error;

        const grouped = (data || []).reduce((acc, r) => {
          if (!acc[r.message_id]) acc[r.message_id] = [];
          acc[r.message_id].push(r);
          return acc;
        }, {} as Record<string, MessageReaction[]>);

        setReactionsMap(grouped);
      } catch (err) {
        log.error('Error fetching reactions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReactions();
  }, [messageIds.join(',')]);

  return { reactionsMap, isLoading };
}
