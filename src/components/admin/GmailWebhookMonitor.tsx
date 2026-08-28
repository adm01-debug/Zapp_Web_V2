import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('GmailWebhookMonitor');
import { Mail, RefreshCw, CheckCircle, AlertCircle, Clock, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';

interface GmailAccount {
  id: string;
  email_address: string;
  is_active: boolean;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  history_id: string | null;
  created_at: string;
}

interface ThreadStats {
  total: number;
  unread: number;
}

export function GmailWebhookMonitor() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [stats, setStats] = useState<ThreadStats>({ total: 0, unread: 0 });
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: gmailAccounts } = await supabase
        .rpc('get_own_gmail_accounts');

      setAccounts((gmailAccounts || []).map(a => ({ ...a, history_id: null })) as GmailAccount[]);

      // Get thread stats
      const { count: totalThreads } = await supabase
        .from('email_threads')
        .select('*', { count: 'exact', head: true });

      const { count: unreadThreads } = await supabase
        .from('email_threads')
        .select('*', { count: 'exact', head: true })
        .eq('is_unread', true);

      setStats({ total: totalThreads || 0, unread: unreadThreads || 0 });
    } catch (err) {
      log.warn('Failed to load Gmail data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive) return <Badge variant="outline" className="text-[10px]">Inativo</Badge>;
    switch (status) {
      case 'synced': return <Badge className="bg-success/10 text-success border-success/30 text-[10px]">Sincronizado</Badge>;
      case 'syncing': return <Badge className="bg-info/10 text-info border-info/30 text-[10px]">Sincronizando</Badge>;
      case 'pending': return <Badge className="bg-warning/10 text-warning border-warning/30 text-[10px]">Pendente</Badge>;
      case 'error': return <Badge variant="destructive" className="text-[10px]">Erro</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  const timeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora';
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Gmail Webhook Monitor</h2>
          <p className="text-sm text-muted-foreground">Status do webhook Pub/Sub e sincronização de emails</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-primary">{accounts.length}</p>
            <p className="text-xs text-muted-foreground">Contas Gmail</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-success">{accounts.filter(a => a.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Threads Totais</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.unread}</p>
            <p className="text-xs text-muted-foreground">Não Lidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas & Webhook Status</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma conta Gmail conectada. Configure em Integrações → Gmail.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                  <div className="p-2 rounded-lg bg-muted">
                    {account.is_active ? <Wifi className="w-4 h-4 text-success" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{account.email_address}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Último sync: {timeSince(account.last_sync_at)}
                      </span>
                      {account.history_id && (
                        <span className="text-xs text-muted-foreground/50">
                          · historyId: {account.history_id}
                        </span>
                      )}
                    </div>
                    {account.last_error && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        <span className="text-xs text-destructive truncate">{account.last_error}</span>
                      </div>
                    )}
                  </div>
                  {getStatusBadge(account.sync_status, account.is_active)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="w-5 h-5 text-success" /> Configuração do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs space-y-2 border">
            <p className="text-muted-foreground">Endpoint:</p>
            <p className="pl-4 text-foreground/80 break-all">
              {SUPABASE_URL}/functions/v1/gmail-webhook
            </p>
            <p className="text-muted-foreground mt-2">Tipo: Google Cloud Pub/Sub Push</p>
            <p className="text-muted-foreground">Eventos: messages.insert (INBOX)</p>
            <p className="text-muted-foreground">Auto-refresh: Token OAuth refresh automático</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
