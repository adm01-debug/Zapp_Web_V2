import { useRef, useState, useEffect, useCallback } from 'react';
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
import { appDayEndOfLocalDate, appDayStartOfLocalDate, localDayKey, parseDayKey } from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  /** Nome do autor resolvido via public.profiles (user_id -> name), null enquanto não resolvido. */
  actor_name: string | null;
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

/** Tamanho da página da lista (paginacao por cursor em created_at+id). */
const PAGE_SIZE = 50;

const MENSAGEM_ERRO = 'Não foi possível carregar a auditoria.';
const MENSAGEM_PERIODO_INVALIDO = 'Período inválido: a data inicial é posterior à data final.';

const COLUNAS_LISTA = 'id, action, entity_type, user_id, details, ip_address, created_at';

/**
 * Resolve os nomes dos autores de uma página de logs.
 * audit_logs.user_id referencia auth.users; o nome mora em public.profiles
 * (coluna user_id -> name). Falha tolerada: nome desconhecido vira null e a
 * linha mostra o marcador neutro — a lista nunca quebra por causa do nome.
 */
async function resolverNomesAutores(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', unicos);
    if (error || !data) return {};
    const mapa: Record<string, string> = {};
    for (const perfil of data as unknown as Array<{ user_id: string | null; name: string | null }>) {
      if (perfil.user_id && perfil.name) mapa[perfil.user_id] = perfil.name;
    }
    return mapa;
  } catch {
    return {};
  }
}

export function AuditLogDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [dataInicio, setDataInicio] = useState<string | null>(null);
  const [dataFim, setDataFim] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, today: 0, suspicious: 0, uniqueUsers: 0 });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  // Geração da consulta vigente: resposta de consulta antiga (filtro trocado
  // no meio do voo) é descartada em vez de sobrescrever a lista atual.
  const geracaoConsulta = useRef(0);

  const aplicarFiltros = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (query: any) => {
      let q = query;
      if (actionFilter === ROLE_FILTER_VALUE) {
        q = q.like('action', ROLE_ACTION_PREFIX + '%');
      } else if (actionFilter !== 'all') {
        q = q.eq('action', actionFilter);
      }
      if (entityFilter !== 'all') {
        q = q.in('entity_type', ENTITY_TYPES_BY_FILTER[entityFilter] ?? [entityFilter]);
      }
      if (dataInicio) {
        const dia = parseDayKey(dataInicio);
        if (dia) q = q.gte('created_at', appDayStartOfLocalDate(dia).toISOString());
      }
      if (dataFim) {
        const dia = parseDayKey(dataFim);
        if (dia) q = q.lte('created_at', appDayEndOfLocalDate(dia).toISOString());
      }
      return q;
    },
    [actionFilter, entityFilter, dataInicio, dataFim],
  );

  const atualizarStats = useCallback((rows: AuditLog[]) => {
    const today = localDayKey(new Date());
    const todayLogs = rows.filter((l) => localDayKey(l.created_at) === today);
    const uniqueUsers = new Set(rows.map((l) => l.user_id).filter(Boolean));
    const suspicious = rows.filter((l) => isSensitiveAction(l.action));

    setStats({
      total: rows.length,
      today: todayLogs.length,
      suspicious: suspicious.length,
      uniqueUsers: uniqueUsers.size,
    });
  }, []);

  const anexarNomes = useCallback(async (rows: AuditLog[]): Promise<AuditLog[]> => {
    const nomes = await resolverNomesAutores(rows.map((r) => r.user_id).filter((v): v is string => !!v));
    if (Object.keys(nomes).length === 0) return rows;
    return rows.map((r) => (r.user_id && nomes[r.user_id] ? { ...r, actor_name: nomes[r.user_id] } : r));
  }, []);

  const fetchLogs = useCallback(async () => {
    // Período inválido: erro explícito sem consultar o banco.
    if (dataInicio && dataFim) {
      const ini = parseDayKey(dataInicio);
      const fim = parseDayKey(dataFim);
      if (ini && fim && ini.getTime() > fim.getTime()) {
        setLogs([]);
        setHasMore(false);
        atualizarStats([]);
        setErro(MENSAGEM_PERIODO_INVALIDO);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setErro(null);
    const geracao = ++geracaoConsulta.current;
    try {
      const query = aplicarFiltros(
        supabase.from('audit_logs').select(COLUNAS_LISTA).order('created_at', { ascending: false }).limit(PAGE_SIZE),
      );
      const { data, error } = await query;
      if (geracao !== geracaoConsulta.current) return;
      if (error) throw error;
      const base = ((data ?? []) as AuditLog[]).map((l) => ({ ...l, actor_name: null }));
      const comNomes = await anexarNomes(base);
      setLogs(comNomes);
      setHasMore(base.length === PAGE_SIZE);
      atualizarStats(comNomes);
    } catch {
      // Falha explícita: limpa a lista em vez de manter números velhos ou zeros silenciosos.
      setLogs([]);
      setHasMore(false);
      atualizarStats([]);
      setErro(MENSAGEM_ERRO);
    } finally {
      if (geracao === geracaoConsulta.current) setLoading(false);
    }
  }, [aplicarFiltros, anexarNomes, atualizarStats, dataInicio, dataFim]);

  const carregarMais = useCallback(async () => {
    if (loadingMore || logs.length === 0) return;
    const ultimo = logs[logs.length - 1];
    setLoadingMore(true);
    setErro(null);
    const geracao = ++geracaoConsulta.current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pagina: any = supabase
        .from('audit_logs')
        .select(COLUNAS_LISTA)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      // Cursor composto (created_at, id): linhas com o mesmo instante do
      // último item entram pelo desempate do id — sem pular nem repetir.
      pagina = pagina.or(`created_at.lt.${ultimo.created_at},and(created_at.eq.${ultimo.created_at},id.lt.${ultimo.id})`);
      const query = aplicarFiltros(pagina);
      const { data, error } = await query;
      if (geracao !== geracaoConsulta.current) return;
      if (error) throw error;
      const base = ((data ?? []) as AuditLog[]).map((l) => ({ ...l, actor_name: null }));
      const comNomes = await anexarNomes(base);
      setLogs((prev) => {
        const combinados = [...prev, ...comNomes];
        atualizarStats(combinados);
        return combinados;
      });
      setHasMore(base.length === PAGE_SIZE);
    } catch {
      setErro(MENSAGEM_ERRO);
    } finally {
      setLoadingMore(false);
    }
  }, [aplicarFiltros, anexarNomes, atualizarStats, loadingMore, logs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-filtro padrão, sem estado derivado de props para sincronizar.
    void fetchLogs();
  }, [fetchLogs, tentativa]);

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.entity_type?.toLowerCase().includes(s) ||
      log.ip_address?.includes(s) ||
      log.user_id?.includes(s) ||
      log.actor_name?.toLowerCase().includes(s)
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
          { label: 'Total de Logs', value: stats.total, icon: FileText, color: 'text-primary' },
          { label: 'Hoje', value: stats.today, icon: Calendar, color: 'text-success' },
          { label: 'Ações Sensíveis', value: stats.suspicious, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Usuários Únicos', value: stats.uniqueUsers, icon: User, color: 'text-info' },
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
            <div className="flex items-center gap-2">
              <label htmlFor="audit-data-inicio" className="text-xs text-muted-foreground">De</label>
              <Input
                id="audit-data-inicio"
                type="date"
                value={dataInicio ?? ''}
                onChange={(e) => setDataInicio(e.target.value || null)}
                className="w-[150px]"
              />
              <label htmlFor="audit-data-fim" className="text-xs text-muted-foreground">Até</label>
              <Input
                id="audit-data-fim"
                type="date"
                value={dataFim ?? ''}
                onChange={(e) => setDataFim(e.target.value || null)}
                className="w-[150px]"
              />
              {(dataInicio || dataFim) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDataInicio(null);
                    setDataFim(null);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erro explícito com nova tentativa */}
      {erro && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <p className="flex-1 text-sm">{erro}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar de novo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              {loading && logs.length === 0 ? (
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
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {log.actor_name ?? '—'}
                            </span>
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
              {hasMore && !loading && (
                <div className="flex justify-center pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void carregarMais()} disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      'Carregar mais'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
