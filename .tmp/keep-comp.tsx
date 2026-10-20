import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, Calendar, User, Globe, AlertTriangle, Shield, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuditLogDashboard } from '@/hooks/security/useAuditLogDashboard';

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
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // O vocabulário dos filtros fica na tela; a consulta (contagem de servidor e
  // lista de 200) fica no hook.
  const entityTypes = useMemo(
    () => (entityFilter === 'all' ? null : ENTITY_TYPES_BY_FILTER[entityFilter] ?? [entityFilter]),
    [entityFilter],
  );
  const consulta = useMemo(
    () => ({
      actionLike: actionFilter === ROLE_FILTER_VALUE ? ROLE_ACTION_PREFIX + '%' : null,
      actionEq: actionFilter !== 'all' && actionFilter !== ROLE_FILTER_VALUE ? actionFilter : null,
      entityTypes,
    }),
    [actionFilter, entityTypes],
  );

  const { stats, logs, nomesPorUsuario, loading, error, recarregar } = useAuditLogDashboard(consulta);

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.entity_type?.toLowerCase().includes(s) ||
      log.ip_address?.includes(s) ||
      log.user_id?.includes(s) ||
      nomesPorUsuario[log.user_id ?? '']?.toLowerCase().includes(s)
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
          { label: 'Total de Logs', hint: null, value: stats?.total, icon: FileText, color: 'text-primary' },
          { label: 'Hoje', hint: 'últimas 24 h', value: stats?.ultimas24h, icon: Calendar, color: 'text-success' },
          { label: 'Ações Sensíveis', hint: 'últimas 24 h', value: stats?.sensiveis24h, icon: AlertTriangle, color: 'text-destructive' },
          {
            label: 'Usuários Únicos',
            hint: stats?.usuariosUnicosIncompleto ? 'últimos 7 d (leitura parcial)' : 'últimos 7 d',
            value: stats?.usuariosUnicos7d,
            icon: User,
            color: 'text-info',
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  {stat.hint && <p className="text-[10px] text-muted-foreground/70">{stat.hint}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Não foi possível carregar a auditoria: {error}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={recarregar}>
            Tentar de novo
          </Button>
        </div>
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
                  const autor = log.user_id ? nomesPorUsuario[log.user_id] ?? log.user_id : null;
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
                            {autor && (
                              <>
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {autor}
                                </span>
                                <span>•</span>
                              </>
                            )}
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
