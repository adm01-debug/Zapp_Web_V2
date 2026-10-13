import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, Calendar, User, Globe, AlertTriangle, Shield, Activity, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  appDayStart,
  appDayEnd,
  appDayStartOfLocalDate,
  appDayEndOfLocalDate,
  localDayKey,
  parseDayKey,
} from '@/lib/localDay';
import { useUserRole } from '@/hooks/system/useUserRole';

// Linha da lista de auditoria — ja vem do banco com o NOME do autor (a RPC
// audit_log_list faz o LEFT JOIN em public.profiles), para a tela nao precisar
// resolver user_id -> nome nem baixar a tabela de perfis.
interface AuditLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

// Resumo agregado (RPC audit_log_summary). Todos os numeros do card vem daqui —
// nenhum e contado no cliente, onde um erro de RLS virava "0".
interface AuditSummary {
  total_logs: number;
  sensitive_actions: number;
  unique_users: number;
  denied_24h: number;
  permission_changes_24h: number;
  admin_logins_7d: number;
  rls_failures_24h: number;
}

const PAGE_SIZE = 50;

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

const MENSAGEM_ERRO = 'Não foi possível carregar a auditoria.';

// Hook local da tela (o cartao pede a consulta junto do componente): resumo +
// primeira pagina da lista em paralelo e paginacao por cursor sob demanda.
// Diferente da consulta antiga (`.limit(200)` + `if (!error && data)`), aqui o
// erro da RPC sobe e vira estado `erro` — nada de zeros silenciosos.
function useAuditLogData(fromIso: string, toIso: string, ativo: boolean) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [hoje, setHoje] = useState<number | null>(null);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(ativo);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setLoading(true);
    setErro(null);
    try {
      const [resumo, lista, resumoHoje] = await Promise.all([
        supabase.rpc('audit_log_summary', { p_from: fromIso, p_to: toIso }),
        supabase.rpc('audit_log_list', { p_from: fromIso, p_to: toIso, p_limit: PAGE_SIZE }),
        supabase.rpc('audit_log_summary', {
          p_from: appDayStart(0).toISOString(),
          p_to: new Date().toISOString(),
        }),
      ]);
      const falha = resumo.error ?? lista.error ?? resumoHoje.error;
      if (falha) throw falha;

      setSummary((resumo.data?.[0] ?? null) as AuditSummary | null);
      setHoje(resumoHoje.data?.[0]?.total_logs ?? null);
      const dados = (lista.data ?? []) as unknown as AuditLogRow[];
      setRows(dados);
      setHasMore(dados.length === PAGE_SIZE);
    } catch {
      // Fail-explicito: limpa numeros antigos e mostra o card de erro com "Tentar de novo".
      setSummary(null);
      setHoje(null);
      setRows([]);
      setHasMore(false);
      setErro(MENSAGEM_ERRO);
    } finally {
      setLoading(false);
    }
  }, [ativo, fromIso, toIso]);

  const carregarMais = useCallback(async () => {
    if (!ativo || loadingMore || rows.length === 0) return;
    const ultimo = rows[rows.length - 1];
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.rpc('audit_log_list', {
        p_from: fromIso,
        p_to: toIso,
        p_cursor: ultimo.created_at,
        p_cursor_id: ultimo.id,
        p_limit: PAGE_SIZE,
      });
      if (error) throw error;
      const novos = (data ?? []) as unknown as AuditLogRow[];
      setRows((prev) => [...prev, ...novos]);
      setHasMore(novos.length === PAGE_SIZE);
    } catch {
      setErro(MENSAGEM_ERRO);
    } finally {
      setLoadingMore(false);
    }
  }, [ativo, loadingMore, rows, fromIso, toIso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao montar/trocar período (assíncrona), sem estado derivado de props.
    void carregar();
  }, [carregar, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  return { summary, hoje, rows, loading, loadingMore, hasMore, erro, carregarMais, tentarDeNovo };
}

function valorDoCard(valor: number | null | undefined) {
  return typeof valor === 'number' ? valor : '—';
}

export function AuditLogDashboard() {
  const { hasRole, loading: carregandoPapel } = useUserRole();
  const isAdmin = hasRole('admin');

  const [de, setDe] = useState(() => localDayKey(appDayStart(6)) ?? '');
  const [ate, setAte] = useState(() => localDayKey(appDayStart(0)) ?? '');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // O dia escolhido no seletor e o do relogio do usuario, mas o recorte e aplicado
  // no fuso do app — mesma regra do resto do produto (ver src/lib/localDay.ts).
  const deDate = parseDayKey(de);
  const ateDate = parseDayKey(ate);
  const fromIso = (deDate ? appDayStartOfLocalDate(deDate) : appDayStart(29)).toISOString();
  const toIso = (ateDate ? appDayEndOfLocalDate(ateDate) : appDayEnd(0)).toISOString();

  const { summary, hoje, rows, loading, loadingMore, hasMore, erro, carregarMais, tentarDeNovo } =
    useAuditLogData(fromIso, toIso, isAdmin);

  const filteredLogs = useMemo(
    () =>
      rows.filter((log) => {
        if (actionFilter === ROLE_FILTER_VALUE) {
          if (!isRoleAction(log.action)) return false;
        } else if (actionFilter !== 'all' && log.action !== actionFilter) {
          return false;
        }
        if (entityFilter !== 'all') {
          const alvos = ENTITY_TYPES_BY_FILTER[entityFilter] ?? [entityFilter];
          if (!log.entity_type || !alvos.includes(log.entity_type)) return false;
        }
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          log.action.toLowerCase().includes(s) ||
          (log.actor_name?.toLowerCase().includes(s) ?? false) ||
          (log.entity_type?.toLowerCase().includes(s) ?? false) ||
          (log.ip_address?.includes(s) ?? false) ||
          (log.user_id?.includes(s) ?? false)
        );
      }),
    [rows, search, actionFilter, entityFilter],
  );

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

  if (carregandoPapel) {
    return (
      <div className="space-y-6 w-full min-w-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} data-testid="audit-skeleton" className="h-20 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Sem papel admin a policy de audit_logs e a guarda das RPCs devolvem zero linhas:
  // mostrar "0" seria mentira. A tela diz explicitamente que nao ha permissao.
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Shield className="w-8 h-8 text-muted-foreground" />
          <p className="font-medium">Você não tem permissão para ver a auditoria</p>
          <p className="text-sm text-muted-foreground">
            Os registros de auditoria são visíveis apenas para administradores.
          </p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    { label: 'Total de Logs', value: summary?.total_logs, icon: FileText, color: 'text-primary' },
    { label: 'Hoje', value: hoje, icon: Calendar, color: 'text-success' },
    { label: 'Ações Sensíveis', value: summary?.sensitive_actions, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Usuários Únicos', value: summary?.unique_users, icon: User, color: 'text-info' },
  ];

  const kpis = [
    { label: 'Acessos negados (24h)', value: summary?.denied_24h },
    { label: 'Mudanças de permissão (24h)', value: summary?.permission_changes_24h },
    { label: 'Logins de admin (7d)', value: summary?.admin_logins_7d },
    { label: 'Falhas de RLS (24h)', value: summary?.rls_failures_24h },
  ];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Erro explícito: nada de zeros silenciosos quando a leitura falha. */}
      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-medium">{erro}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Verifique a conexão e tente novamente.
            </p>
            <Button variant="outline" onClick={tentarDeNovo} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {!erro && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    <div>
                      <p className="text-2xl font-bold">{loading ? '—' : valorDoCard(stat.value)}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* KPIs (janelas ancoradas no fim do período selecionado) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-2xl font-bold">{loading ? '—' : valorDoCard(kpi.value)}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
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
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Data inicial"
                value={de}
                max={ate || undefined}
                onChange={(e) => setDe(e.target.value)}
                className="w-[150px]"
              />
              <span className="text-muted-foreground text-sm">até</span>
              <Input
                type="date"
                aria-label="Data final"
                value={ate}
                min={de || undefined}
                onChange={(e) => setAte(e.target.value)}
                className="w-[150px]"
              />
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
                  <div key={i} data-testid="audit-skeleton" className="h-16 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
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
                            <span className="font-medium text-foreground/80">
                              {log.actor_name?.trim() || 'Sistema'}
                            </span>
                            <span>•</span>
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
              {!loading && hasMore && filteredLogs.length > 0 && (
                <div className="pt-2 text-center">
                  <Button variant="outline" onClick={carregarMais} disabled={loadingMore} className="gap-2">
                    {loadingMore && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
                    Carregar mais
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
