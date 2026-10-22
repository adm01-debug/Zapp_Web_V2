import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, Calendar, User, Globe, AlertTriangle, Shield, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [truncated, setTruncated] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('id, action, entity_type, user_id, details, ip_address, created_at')
      .order('created_at', { ascending: false })
      .limit(LOGS_PAGE_LIMIT);

    if (actionFilter === ROLE_FILTER_VALUE) {
      query = query.like('action', ROLE_ACTION_PREFIX + '%');
    } else if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }
    if (entityFilter !== 'all') {
      query = query.in('entity_type', ENTITY_TYPES_BY_FILTER[entityFilter] ?? [entityFilter]);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as AuditLog[]);
      // A consulta corta em LOGS_PAGE_LIMIT: com a página cheia o número exibido
      // é "os N mais recentes", não o total — o aviso na tela deixa isso claro.
      setTruncated(data.length >= LOGS_PAGE_LIMIT);

      // Contagem "Hoje" vem do SERVIDOR com janela de 24 h exata (não meia-noite
      // truncada — ver cartão HZ1-08). Fetch separado para não depender do
      // recorte de página de 200 linhas.
      const janela24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: countHoje } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', janela24h);

      const uniqueUsers = new Set(data.map(l => l.user_id).filter(Boolean));
      const suspicious = data.filter(l => isSensitiveAction(l.action));

      setStats({
        total: data.length,
        today: countHoje ?? 0,
        suspicious: suspicious.length,
        uniqueUsers: uniqueUsers.size,
      });
    }
    setLoading(false);
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-filtro padrão, sem estado derivado de props para sincronizar.
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
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

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: truncated ? 'Últimos 200' : 'Total de Logs', value: stats.total, icon: FileText, color: 'text-primary', hint: undefined },
          { label: 'Hoje', value: stats.today, icon: Calendar, color: 'text-success', hint: 'últimas 24 h' },
          { label: 'Ações Sensíveis', value: stats.suspicious, icon: AlertTriangle, color: 'text-destructive', hint: 'últimas 24 h' },
          { label: 'Usuários Únicos', value: stats.uniqueUsers, icon: User, color: 'text-info', hint: undefined },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  {stat.hint && <p className="text-xs text-muted-foreground/70">{stat.hint}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
          {truncated && (
            <p className="text-xs text-warning mt-1">
              Exibindo os 200 registros mais recentes — pode haver registros mais antigos fora do recorte.
            </p>
          )}
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
