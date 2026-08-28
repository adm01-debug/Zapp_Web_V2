import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';
import { log } from '@/lib/logger';

interface QueuePerformance {
  id: string;
  name: string;
  color: string;
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  totalMessages: number;
  avgMessagesPerContact: number;
  agentsCount: number;
}

interface DateRange {
  from: Date;
  to: Date;
}

export function useQueuesComparison(dateRange: DateRange) {
  const [queuesPerformance, setQueuesPerformance] = useState<QueuePerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComparison();
  }, [dateRange.from.toISOString(), dateRange.to.toISOString()]);

  const fetchComparison = async () => {
    try {
      setLoading(true);

      // Fetch all queues
      const { data: queues, error: queuesError } = await supabase
        .from('queues')
        .select('id, name, color')
        .eq('is_active', true);

      if (queuesError) throw queuesError;
      if (!queues || queues.length === 0) {
        setQueuesPerformance([]);
        setLoading(false);
        return;
      }

      // Fetch all contacts with queue assignment
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, queue_id, assigned_to, created_at')
        .not('queue_id', 'is', null);

      if (contactsError) throw contactsError;

      // Fetch queue members
      const { data: members, error: membersError } = await supabase
        .from('queue_members')
        .select('queue_id, profile_id')
        .eq('is_active', true);

      if (membersError) throw membersError;

      // Get all contact IDs for message counting
      const contactIds = contacts?.map(c => c.id) || [];

      // Fetch messages in date range
      let messages: Array<{ contact_id: string }> = [];
      if (contactIds.length > 0) {
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('contact_id')
          .in('contact_id', contactIds)
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());

        if (messagesError) throw messagesError;
        messages = messagesData || [];
      }

      // Count messages per contact
      const messagesPerContact: Record<string, number> = {};
      messages.forEach(m => {
        messagesPerContact[m.contact_id] = (messagesPerContact[m.contact_id] || 0) + 1;
      });

      // Map contact to queue for message counting
      const contactToQueue: Record<string, string> = {};
      contacts?.forEach(c => {
        if (c.queue_id) {
          contactToQueue[c.id] = c.queue_id;
        }
      });

      // Count messages per queue
      const messagesPerQueue: Record<string, number> = {};
      Object.entries(messagesPerContact).forEach(([contactId, count]) => {
        const queueId = contactToQueue[contactId];
        if (queueId) {
          messagesPerQueue[queueId] = (messagesPerQueue[queueId] || 0) + count;
        }
      });

      // Build performance data for each queue
      const performance: QueuePerformance[] = queues.map(queue => {
        const queueContacts = contacts?.filter(c => c.queue_id === queue.id) || [];
        const assignedContacts = queueContacts.filter(c => c.assigned_to);
        const waitingContacts = queueContacts.filter(c => !c.assigned_to);
        const queueMembers = members?.filter(m => m.queue_id === queue.id) || [];
        const totalMessages = messagesPerQueue[queue.id] || 0;

        return {
          id: queue.id,
          name: queue.name,
          color: queue.color,
          totalContacts: queueContacts.length,
          assignedContacts: assignedContacts.length,
          waitingContacts: waitingContacts.length,
          totalMessages,
          avgMessagesPerContact: queueContacts.length > 0 
            ? Math.round(totalMessages / queueContacts.length * 10) / 10 
            : 0,
          agentsCount: queueMembers.length,
        };
      });

      // Sort by total contacts descending
      performance.sort((a, b) => b.totalContacts - a.totalContacts);

      setQueuesPerformance(performance);
    } catch (error) {
      log.error('Error fetching queues comparison:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    queuesPerformance,
    loading,
    refetch: fetchComparison,
  };
}
