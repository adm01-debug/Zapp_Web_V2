import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ConnectionStatus {
  id: string;
  instance_id: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageDiagnostic {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  failureRate: number;
  recentFailures: Array<{
    id: string;
    content: string;
    status: string;
    created_at: string;
    contact_name: string;
  }>;
}

export interface SystemHealth {
  database: 'healthy' | 'degraded' | 'down';
  storage: 'healthy' | 'degraded' | 'down';
  realtime: 'healthy' | 'degraded' | 'down';
  edgeFunctions: 'healthy' | 'degraded' | 'down';
  dbLatency: number;
  storageLatency: number;
  contactsCount: number;
  messagesCount: number;
  connectionsCount: number;
}

export interface ErrorLog {
  id: string;
  type: 'connection' | 'message' | 'system' | 'webhook';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: string;
  timestamp: Date;
}

export function useDiagnosticsData() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [messageDiag, setMessageDiag] = useState<MessageDiagnostic | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);

  const fetchConnections = async () => {
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setConnections(data as ConnectionStatus[]);
  };

  const fetchMessageDiagnostics = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Optimize by grouping or reducing query count if possible, 
    // but head: true is already quite fast for counts.
    // However, we can use a single query for statuses if we fetch data, 
    // but for large datasets head: true is better.
    const [
      { count: totalCount },
      { count: sentCount },
      { count: deliveredCount },
      { count: readCount },
      { count: failedCount },
      { count: pendingCount },
    ] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'sent'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'delivered'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'read'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'failed'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('sender', 'agent').eq('status', 'sending'),
    ]);

    const { data: failures } = await supabase
      .from('messages')
      .select('id, content, status, created_at, contact_id')
      .eq('sender', 'agent')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10);

    const recentFailures = [];
    if (failures && failures.length > 0) {
      const contactIds = Array.from(new Set(failures.map(f => f.contact_id).filter((id): id is string => id !== null)));
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);
      
      const contactMap = new Map(contacts?.map(c => [c.id, c.name]) || []);

      for (const f of failures) {
        recentFailures.push({
          id: f.id,
          content: f.content,
          status: f.status || 'unknown',
          created_at: f.created_at,
          contact_name: contactMap.get(f.contact_id!) || 'Desconhecido',
        });
      }
    }

    const total = totalCount || 0;
    const sent = sentCount || 0;
    const delivered = deliveredCount || 0;
    const read = readCount || 0;
    const failed = failedCount || 0;
    const pending = pendingCount || 0;

    setMessageDiag({
      total, sent, delivered, read, failed, pending,
      deliveryRate: total > 0 ? Math.round(((delivered + read) / total) * 100) : 0,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      recentFailures,
    });
  };

  const fetchSystemHealth = async () => {
    const dbStart = performance.now();
    const { count: contactsCount } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    const dbLatency = Math.round(performance.now() - dbStart);

    const storageStart = performance.now();
    await supabase.storage.from('whatsapp-media').list('', { limit: 1 });
    const storageLatency = Math.round(performance.now() - storageStart);

    const { count: messagesCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
    const { count: connectionsCount } = await supabase.from('whatsapp_connections').select('*', { count: 'exact', head: true });

    let edgeFunctionsStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    try {
      const { error } = await supabase.functions.invoke('connection-health-check');
      if (error) edgeFunctionsStatus = 'degraded';
    } catch {
      edgeFunctionsStatus = 'degraded';
    }

    setHealth({
      database: dbLatency < 500 ? 'healthy' : dbLatency < 2000 ? 'degraded' : 'down',
      storage: storageLatency < 1000 ? 'healthy' : storageLatency < 3000 ? 'degraded' : 'down',
      realtime: 'healthy',
      edgeFunctions: edgeFunctionsStatus,
      dbLatency,
      storageLatency,
      contactsCount: contactsCount || 0,
      messagesCount: messagesCount || 0,
      connectionsCount: connectionsCount || 0,
    });
  };

  const fetchErrorLogs = async () => {
    const logs: ErrorLog[] = [];

    const { data: failedMsgs } = await supabase
      .from('messages')
      .select('id, content, created_at, contact_id')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(20);

    if (failedMsgs) {
      for (const msg of failedMsgs) {
        logs.push({
          id: `msg-${msg.id}`,
          type: 'message',
          severity: 'error',
          message: 'Falha no envio de mensagem',
          details: `Mensagem "${msg.content?.slice(0, 50)}..." falhou ao enviar`,
          timestamp: new Date(msg.created_at),
        });
      }
    }

    const { data: disconnected } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, updated_at')
      .neq('status', 'connected');

    if (disconnected) {
      for (const conn of disconnected) {
        logs.push({
          id: `conn-${conn.id}`,
          type: 'connection',
          severity: 'critical',
          message: `Conexão ${conn.instance_id} desconectada`,
          details: `Status: ${conn.status || 'desconhecido'}. Última atualização: ${conn.updated_at}`,
          timestamp: new Date(conn.updated_at),
        });
      }
    }

    const { count: orphanCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .is('whatsapp_connection_id', null);

    if (orphanCount && orphanCount > 0) {
      logs.push({
        id: 'orphan-contacts',
        type: 'system',
        severity: 'warning',
        message: `${orphanCount} contato(s) sem conexão WhatsApp`,
        details: 'Esses contatos não receberão mensagens enviadas pelo sistema. Vincule-os a uma conexão.',
        timestamp: new Date(),
      });
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: stuckCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sending')
      .lt('created_at', fiveMinAgo);

    if (stuckCount && stuckCount > 0) {
      logs.push({
        id: 'stuck-messages',
        type: 'message',
        severity: 'warning',
        message: `${stuckCount} mensagem(ns) travada(s) no status "enviando"`,
        details: 'Mensagens com mais de 5 minutos no status "sending". Pode indicar problemas com a Evolution API.',
        timestamp: new Date(),
      });
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setErrorLogs(logs);
  };

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchConnections(),
        fetchMessageDiagnostics(),
        fetchSystemHealth(),
        fetchErrorLogs(),
      ]);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = async () => {
    toast.info('Atualizando diagnósticos...');
    await fetchAll();
    toast.success('Diagnósticos atualizados!');
  };

  const errorCount = errorLogs.filter(l => l.severity === 'error' || l.severity === 'critical').length;
  const warningCount = errorLogs.filter(l => l.severity === 'warning').length;
  const connectedCount = connections.filter(c => c.status === 'connected').length;

  return {
    loading, refreshing, lastRefresh,
    connections, messageDiag, health, errorLogs,
    handleRefresh,
    errorCount, warningCount, connectedCount,
  };
}
