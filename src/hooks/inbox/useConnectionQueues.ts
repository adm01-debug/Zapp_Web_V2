import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface ConnectionQueue {
  id: string;
  whatsapp_connection_id: string;
  queue_id: string;
  created_at: string;
}

export function useConnectionQueues(connectionId?: string) {
  const [connectionQueues, setConnectionQueues] = useState<ConnectionQueue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchQueues = useCallback(async () => {
    if (!connectionId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_connection_queues')
        .select('*')
        .eq('whatsapp_connection_id', connectionId);
      if (error) throw error;
      setConnectionQueues(data || []);
    } catch (err) {
      log.error('Error fetching connection queues:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  const addQueue = useCallback(async (queueId: string) => {
    if (!connectionId) return;
    try {
      const { error } = await supabase
        .from('whatsapp_connection_queues')
        .insert({ whatsapp_connection_id: connectionId, queue_id: queueId });
      if (error) throw error;
      await fetchQueues();
    } catch (err) {
      log.error('Error adding queue to connection:', err);
      throw err;
    }
  }, [connectionId, fetchQueues]);

  const removeQueue = useCallback(async (queueId: string) => {
    if (!connectionId) return;
    try {
      const { error } = await supabase
        .from('whatsapp_connection_queues')
        .delete()
        .eq('whatsapp_connection_id', connectionId)
        .eq('queue_id', queueId);
      if (error) throw error;
      setConnectionQueues(prev => prev.filter(cq => cq.queue_id !== queueId));
    } catch (err) {
      log.error('Error removing queue from connection:', err);
      throw err;
    }
  }, [connectionId]);

  return { connectionQueues, isLoading, addQueue, removeQueue, refetch: fetchQueues };
}
