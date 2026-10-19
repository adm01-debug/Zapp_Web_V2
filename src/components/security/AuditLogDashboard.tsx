import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, Calendar, User, Globe, AlertTriangle, Shield, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Contrato compartilhado de ações e entidades de papel: todo evento de papel em
// public.audit_logs começa com `role_` (audit_role_changes grava role_granted /
// role_revoked / role_changed com entity_type='user_roles'; o provisionamento de
// signup grava role_auto_provisioned / role_auto_provision_denied).
export const ROLE_ACTION_PREFIX = 'role_';
export const ROLE_FILTER_VALUE = 'role_events';
// eslint-disable-next-line react-refresh/only-export-components -- contrato compartilhado exigido no proprio arquivo (cartao R2-AUTH-032)
export const isRoleAction = (action: string) => action.startsWith(ROLE_ACTION_PREFIX);
// eslint-disable-next-line react-refresh/only-export-components -- contrato compartilhado exigido no proprio arquivo (cartao R2-AUTH-032)
export const isSensitiveAction = (action: string) =>
  isRoleAction(action) || action.includes('delete') || action.includes('export') || action.includes('role_change');

// eslint-disable-next-line react-refresh/only-export-components -- contrato compartilhado exigido no proprio arquivo (cartao R2-AUTH-032)
export const ENTITY_TYPES_BY_FILTER: Record<string, string[]> = {
  contact: ['contact'], message: ['message'], campaign: ['campaign'],
  user: ['user', 'user_roles'], settings: ['settings'],
};

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-success/10 text-success',
  logout: 'bg-muted text-muted-foreground',
  create: 'bg-info/10 text-info',
  update: 'bg-warning/10 text-warning',
  delete: 'bg-destructive/10 text-destructive',
  export: 'bg-secondary/10 text-secondary',
  mfa_enabled: 'bg-success/10 text-success',
  mfa_disabled: 'bg-destructive/10 text-destructive',
  password_change: 'bg-warning/10 text-warning',
  role_change: 'bg-accent/10 text-accent-foreground',
};

const LOGS_PAGE_LIMIT = 200;

const ACTION_ICONS: Record<string, typeof Shield> = {
  login: User,
  logout: User,
  create: FileText,
  update: FileText,
  delete: AlertTriangle,
  mfa_enabled: Shield,
  mfa_disabled: Shield,
  password_change: Shield,
  role_change: Shield,
};

export function AuditLogDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, today: 0, suspicious: 0, uniqueUsers: 0 });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string } | null>(null);

  // Contagens server-side — independentes dos filtros de UI da lista.
  const fetchStats = useCallback(async () => {
    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, hojeRes, sensRes, userRes] = await Promise.all([
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
      supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', ago24h)
        .or('action.like.%delete%,action.like.%export%,action.like.role_%'),
      supabase
        .from('audit_logs')
        .select('user_id')
        .gte('created_at', ago7d)
        .not('user_id', 'is', null),
    ]);

    if (totalRes.error) {
      setError(totalRes.error as { message: string });
      return;
    }

    const uniqueUsers = new Set(
      ((userRes.data ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id),
    ).size;

    setStats({
      total: totalRes.count ?? 0,
      today: hojeRes.count ?? 0,
      suspicious: sensRes.count ?? 0,
      uniqueUsers,
    });
    setError(null);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('id, action, entity_type, user_id, details, ip_address, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(LOGS_PAGE_LIMIT);

    if (actionFilter === ROLE_FILTER_VALUE) {
      query = query.like('action', ROLE_ACTION_PREFIX + '%');
    } else if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }
    if (entityFilter !== 'all') {
      query = query.in('entity_type', ENTITY_TYPES_BY_FILTER[entityFilter] ?? [entityFilter]);
    }

    const { data, error: fetchError } = await query;
    if (!fetchError && data) {
      setLogs(data as AuditLog[]);

      const userIds = Array.from(
        new Set((data as AuditLog[]).map((l) => l.user_id).filter(Boolean)),
      ) as string[];

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        if (profilesData) {
          setProfiles(
            Object.fromEntries(
              (profilesData as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
            ),
          );
        }
      }
    }
    setLoading(false);
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-filtro padrão
    fetchStats();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-filtro padrão
    fetchLogs();
  }, [fetchStats, fetchLogs]);

  // Realtime: re-executa as contagens ao chegar INSERT na tabela.
  useEffect(() => {
    const canal = supabase
      .channel('audit-logs-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [fetchStats]);

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.entity_type?.toLowerCase().includes(s) ||
      log.ip_address?.includes(s) ||
      log.user_id?.includes(s)
    );
  });

  const getActionColor = (action: string) => {
    for (const [key, color] of Object.entries(ACTION_COLORS)) {
      if (action.includes(key)) return color;
    }
    return 'bg-muted text-muted-foreground';
  };

  const getActionIcon = (action: string) => {
    for (const [key, Icon] of Object.entries(ACTION_ICONS)) {
      if (action.includes(key)) return Icon;
    }
    return Activity;
  };

  const statValue = (value: number): string | number => (error ? '—' : value);

  return (
    <div className="space-y-6 w-full min-w-0">
      {error && (
        <div role="alert" className="text-destructive text-sm">
          {error.message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: logs.length >= LOGS_PAGE_LIMIT ? 'Últimos 200' : 'Total de Logs', value: statValue(stats.total), icon: FileText, color: 'text-primary' },
          { label: 'Hoje', value: statValue(stats.today), icon: Calendar, color: 'text-success' },
          { label: 'Ações Sensíveis', value: statValue(stats.suspicious), icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Usuários Únicos', value: statValue(stats.uniqueUsers), icon: User, color: 'text-info' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {logs.length >= LOGS_PAGE_LIMIT && (
        <p className="text-xs text-muted-foreground text-center">
          pode haver registros mais antigos fora do recorte
        </p>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ação, IP, usuário..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="create">Criação</SelectItem>
                <SelectItem value="update">Atualização</SelectItem>
                <SelectItem value="delete">Exclusão</SelectItem>
                <SelectItem value="export">Exportação</SelectItem>
                <SelectItem value={ROLE_FILTER_VALUE}>Papéis (concessões e revogações)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Entidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="contact">Contatos</SelectItem>
                <SelectItem value="message">Mensagens</SelectItem>
                <SelectItem value="campaign">Campanhas</SelectItem>
                <SelectItem value="user">Usuários</SelectItem>
                <SelectItem value="settings">Configurações</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Logs de Auditoria ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
                ))
              ) : filteredLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum log encontrado
                </p>
              ) : (
                filteredLogs.map((log) => {
                  const Icon = getActionIcon(log.action);
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div className={`p-2 rounded-lg ${getActionColor(log.action)}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{log.action}</span>
                            {log.entity_type && (
                              <Badge variant="outline" className="text-xs">
                                {log.entity_type}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</span>
                            {log.ip_address && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {log.ip_address}
                                </span>
                              </>
                            )}
                            {log.user_id && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {profiles[log.user_id] ?? log.user_id}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {log.details && (
                          <button
                            type="button"
                            onClick={() => setExpandedLogId((prev) => (prev === log.id ? null : log.id))}
                            aria-expanded={expandedLogId === log.id}
                            className="shrink-0 rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                          >
                            {expandedLogId === log.id ? '−detalhes' : '+detalhes'}
                          </button>
                        )}
                      </div>
                      {expandedLogId === log.id && log.details && (
                        <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-background/60 p-2 text-xs text-foreground/80">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
