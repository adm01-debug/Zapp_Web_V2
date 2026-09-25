import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('RealtimeDashboard');

export interface RealtimeMetric {
  timestamp: Date;
  messagesPerMinute: number;
  activeConversations: number;
  avgResponseTimeSeconds: number | null;
}

export interface RealtimeDashboardState {
  messagesThisHour: number;
  messagesLastHour: number;
  messagesPerMinute: number;
  activeConversationsNow: number;
  newContactsToday: number;
  unreadMessages: number;
  metricsHistory: RealtimeMetric[];
  lastMessageAt: Date | null;
  isConnected: boolean;
}

const MAX_HISTORY = 60; // Keep last 60 data points (1 per minute = 1 hour)

export function useRealtimeDashboard() {
  const [state, setState] = useState<RealtimeDashboardState>({
    messagesThisHour: 0,
    messagesLastHour: 0,
    messagesPerMinute: 0,
    activeConversationsNow: 0,
    newContactsToday: 0,
    unreadMessages: 0,
    metricsHistory: [],
    lastMessageAt: null,
    isConnected: false,
  });

  const messageCountRef = useRef(0);
  const minuteCountRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch initial counts
  const fetchInitialData = useCallback(async () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    try {
      const [messagesThisHour, messagesLastHour, unread, contactsToday] = await Promise.all([
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', hourAgo.toISOString()),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', twoHoursAgo.toISOString())
          .lt('created_at', hourAgo.toISOString()),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('is_read', false)
          .eq('sender', 'contact'),
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString()),
      ]);

      // Get active conversations (contacts with messages in last hour)
      const { data: activeContacts } = await supabase
        .from('messages')
        .select('contact_id')
        .gte('created_at', hourAgo.toISOString())
        .not('contact_id', 'is', null).limit(5000); // E26: cap PostgREST 1000 linhas — mitigação, fix definitivo é RPC (E24/E25)

      const uniqueContacts = new Set(activeContacts?.map(m => m.contact_id) || []);

      if (!isMountedRef.current) return;

      setState(prev => ({
        ...prev,
        messagesThisHour: messagesThisHour.count || 0,
        messagesLastHour: messagesLastHour.count || 0,
        unreadMessages: unread.count || 0,
        newContactsToday: contactsToday.count || 0,
        activeConversationsNow: uniqueContacts.size,
        isConnected: true,
      }));

      messageCountRef.current = messagesThisHour.count || 0;
    } catch (error) {
      log.error('Error fetching initial data:', error);
    }
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    fetchInitialData();

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          log.debug('New message received in dashboard');
          minuteCountRef.current++;
          messageCountRef.current++;

          pending.hasUpdate = true;
          pending.lastMessageAt = new Date();
          if (payload.new.sender === 'contact') {
            pending.unreadMessagesDelta += 1;
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contacts' },
        () => {
          pending.hasUpdate = true;
          pending.newContactsTodayDelta += 1;
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new.is_read && !payload.old?.is_read) {
            pending.hasUpdate = true;
            pending.unreadMessagesDelta -= 1;
          }
        }
      )
      .subscribe((status) => {
        setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
      });

    // E27: deltas de eventos realtime acumulados aqui (ver callbacks acima) e aplicados em lote
    // pelo flushInterval abaixo, em vez de 1 setState sincrono por INSERT/UPDATE.
    const FLUSH_MS = 4000;
    type PendingDelta = {
      hasUpdate: boolean;
      unreadMessagesDelta: number;
      newContactsTodayDelta: number;
      lastMessageAt: Date | null;
    };
    let pending: PendingDelta = {
      hasUpdate: false,
      unreadMessagesDelta: 0,
      newContactsTodayDelta: 0,
      lastMessageAt: null,
    };

    const flushInterval = setInterval(() => {
      if (!pending.hasUpdate) return;

      setState(prev => ({
        ...prev,
        messagesThisHour: messageCountRef.current,
        lastMessageAt: pending.lastMessageAt ?? prev.lastMessageAt,
        unreadMessages: Math.max(0, prev.unreadMessages + pending.unreadMessagesDelta),
        newContactsToday: prev.newContactsToday + pending.newContactsTodayDelta,
      }));

      pending = { hasUpdate: false, unreadMessagesDelta: 0, newContactsTodayDelta: 0, lastMessageAt: null };
    }, FLUSH_MS);

    // Collect metrics every minute
    const metricsInterval = setInterval(() => {
      setState(prev => {
        const metric: RealtimeMetric = {
          timestamp: new Date(),
          messagesPerMinute: minuteCountRef.current,
          activeConversations: prev.activeConversationsNow,
          avgResponseTimeSeconds: null,
        };

        const newHistory = [...prev.metricsHistory, metric].slice(-MAX_HISTORY);

        return {
          ...prev,
          messagesPerMinute: minuteCountRef.current,
          metricsHistory: newHistory,
        };
      });

      minuteCountRef.current = 0;
    }, 60000);

    // Refresh full data every 5 minutes
    const refreshInterval = setInterval(fetchInitialData, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(flushInterval);
      clearInterval(metricsInterval);
      clearInterval(refreshInterval);
    };
  }, [fetchInitialData]);

  return state;
}
