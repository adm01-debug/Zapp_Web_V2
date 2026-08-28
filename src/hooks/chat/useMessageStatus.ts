import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface MessageStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  status_updated_at: string;
}

export const useMessageStatus = (contactId?: string) => {
  const [statusUpdates, setStatusUpdates] = useState<Map<string, MessageStatusUpdate>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial statuses from database
  useEffect(() => {
    if (!contactId) {
      setStatusUpdates(new Map());
      return;
    }

    const fetchInitialStatuses = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, status, status_updated_at')
          .eq('contact_id', contactId)
          .eq('sender', 'agent')
          .not('status', 'is', null);

        if (error) {
          log.error('Error fetching message statuses:', error);
          return;
        }

        if (data) {
          const statusMap = new Map<string, MessageStatusUpdate>();
          data.forEach((msg) => {
            if (msg.status) {
              statusMap.set(msg.id, {
                id: msg.id,
                status: msg.status as 'sent' | 'delivered' | 'read' | 'failed',
                status_updated_at: msg.status_updated_at || new Date().toISOString(),
              });
            }
          });
          setStatusUpdates(statusMap);
        }
      } catch (err) {
        log.error('Error in fetchInitialStatuses:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialStatuses();
  }, [contactId]);

  // Subscribe to realtime status updates
  useEffect(() => {
    if (!contactId) return;

    log.debug('Setting up realtime status subscription for contact:', contactId);

    const channel = supabase
      .channel(`message-status-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          log.debug('Message status update received:', payload);
          const newData = payload.new as { id: string; status: string; status_updated_at: string };
          
          if (newData.status) {
            setStatusUpdates((prev) => {
              const updated = new Map(prev);
              updated.set(newData.id, {
                id: newData.id,
                status: newData.status as 'sent' | 'delivered' | 'read' | 'failed',
                status_updated_at: newData.status_updated_at,
              });
              return updated;
            });
          }
        }
      )
      .subscribe((status) => {
        log.debug('Status subscription status:', status);
      });

    return () => {
      log.debug('Cleaning up status subscription');
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  const getMessageStatus = useCallback(
    (messageId: string): 'sent' | 'delivered' | 'read' | 'failed' | undefined => {
      return statusUpdates.get(messageId)?.status;
    },
    [statusUpdates]
  );

  const updateLocalStatus = useCallback(
    (messageId: string, status: 'sent' | 'delivered' | 'read' | 'failed') => {
      setStatusUpdates((prev) => {
        const updated = new Map(prev);
        updated.set(messageId, {
          id: messageId,
          status,
          status_updated_at: new Date().toISOString(),
        });
        return updated;
      });
    },
    []
  );

  return {
    statusUpdates,
    getMessageStatus,
    updateLocalStatus,
    isLoading,
  };
};
