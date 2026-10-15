import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, Activity, Ban, Globe, AlertTriangle, 
  TrendingUp, TrendingDown, Clock, RefreshCw,
  BarChart3
} from 'lucide-react';
import { useRateLimitLogs, type RateLimitSortKey } from '@/hooks/system/useRateLimitLogs';
import { useUserRole } from '@/hooks/system/useUserRole';
import { BlockedIPsPanel } from '@/components/security/BlockedIPsPanel';
import { IPWhitelistPanel } from '@/components/security/IPWhitelistPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function RateLimitDashboard() {
  const { isAdmin, isSupervisor } = useUserRole();
  const {
    logs, stats, loading, refetch,
    filters, setFilters, resetFilters,
    total, totalPages, error,
  } = useRateLimitLogs(isAdmin || isSupervisor);
  const [activeTab, setActiveTab] = useState('overview');
  const [ipBusca, setIpBusca] = useState('');
  const [endpointBusca, setEndpointBusca] = useState('');

  if (!isAdmin && !isSupervisor) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const blockedPercentage = stats 
    ? Math.round((stats.blockedRequests / Math.max(logs.length, 1)) * 100) 
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Rate Limiting & Segurança
          </h1>
          <p className="text-muted-foreground">
            Monitore e gerencie a segurança do sistema
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Requests</p>
                  <p className="text-2xl font-bold">{stats?.totalRequests || 0}</p>
                </div>
                <div className="w-10 h-10 bg-info/10 dark:bg-info/20/30 rounded-full flex items-center justify-center">
                  <Activity className="w-5 h-5 text-info dark:text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bloqueados</p>
                  <p className="text-2xl font-bold text-destructive">{stats?.blockedRequests || 0}</p>
                </div>
                <div className="w-10 h-10 bg-destructive/10 dark:bg-destructive/20/30 rounded-full flex items-center justify-center">
                  <Ban className="w-5 h-5 text-destructive dark:text-destructive" />
                </div>
              </div>
              <Progress value={blockedPercentage} className="mt-2 h-1" aria-label="Percentual de requisições bloqueadas" />
              <p className="text-xs text-muted-foreground mt-1">{blockedPercentage}% do total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">IPs Únicos</p>
                  <p className="text-2xl font-bold">{stats?.uniqueIPs || 0}</p>
                </div>
                <div className="w-10 h-10 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center">
                  <Globe className="w-5 h-5 text-success dark:text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Alertas Ativos</p>
                  <p className="text-2xl font-bold text-warning">{logs.filter(l => l.blocked).length}</p>
                </div>
                <div className="w-10 h-10 bg-warning/10 dark:bg-warning/20/30 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-warning dark:text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="blocked">
            <Ban className="w-4 h-4 mr-2" />
            IPs Bloqueados
          </TabsTrigger>
          <TabsTrigger value="whitelist">
            <Globe className="w-4 h-4 mr-2" />
            Whitelist
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Clock className="w-4 h-4 mr-2" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Endpoints</CardTitle>
                <CardDescription>Endpoints mais acessados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.topEndpoints.map((endpoint, i) => (
                    <div key={endpoint.endpoint} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                        <code className="text-sm font-mono">{endpoint.endpoint}</code>
                      </div>
                      <Badge variant="secondary">{endpoint.count}</Badge>
                    </div>
                  ))}
                  {(!stats?.topEndpoints || stats.topEndpoints.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum dado disponível
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top IPs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top IPs</CardTitle>
                <CardDescription>IPs com mais requisições</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.topIPs.slice(0, 5).map((ip, i) => (
                    <div key={ip.ip} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                        <code className="text-sm font-mono">{ip.ip}</code>
                        {ip.blocked && (
                          <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
                        )}
                      </div>
                      <Badge variant="secondary">{ip.count}</Badge>
                    </div>
                  ))}
                  {(!stats?.topIPs || stats.topIPs.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum dado disponível
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="blocked" className="mt-4">
          <BlockedIPsPanel />
        </TabsContent>

        <TabsContent value="whitelist" className="mt-4">
          <IPWhitelistPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Rate Limiting</CardTitle>
              <CardDescription>
                {total === 0 ? 'Nenhum registro encontrado' : `Total de ${total} registros`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rl-ip">Filtrar por IP</Label>
                  <Input
                    id="rl-ip"
                    placeholder="Trecho do IP"
                    value={ipBusca}
                    onChange={e => setIpBusca(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rl-endpoint">Filtrar por endpoint</Label>
                  <Input
                    id="rl-endpoint"
                    placeholder="Trecho do endpoint"
                    value={endpointBusca}
                    onChange={e => setEndpointBusca(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setFilters({ ip: ipBusca, endpoint: endpointBusca })}
                >
                  Aplicar filtros
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setIpBusca(''); setEndpointBusca(''); resetFilters(); }}
                >
                  Limpar
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label="Somente bloqueados"
                    checked={filters.blockedOnly}
                    onChange={e => setFilters({ blockedOnly: e.target.checked })}
                  />
                  Somente bloqueados
                </label>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rl-ordem">Ordenar por</Label>
                  <select
                    id="rl-ordem"
                    aria-label="Ordenar por"
                    value={filters.sortBy}
                    onChange={e => setFilters({ sortBy: e.target.value as RateLimitSortKey })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="created_at">Data</option>
                    <option value="ip_address">IP</option>
                    <option value="endpoint">Endpoint</option>
                    <option value="request_count">Requisições</option>
                    <option value="blocked">Status</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rl-direcao">Direção</Label>
                  <select
                    id="rl-direcao"
                    aria-label="Direção da ordenação"
                    value={filters.sortDir}
                    onChange={e => setFilters({ sortDir: e.target.value as 'asc' | 'desc' })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="desc">Decrescente</option>
                    <option value="asc">Crescente</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rl-pagina-tamanho">Itens por página</Label>
                  <select
                    id="rl-pagina-tamanho"
                    aria-label="Itens por página"
                    value={filters.pageSize}
                    onChange={e => setFilters({ pageSize: Number(e.target.value) })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              {error && (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  Não foi possível carregar os logs: {error}{' '}
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Tentar de novo
                  </Button>
                </p>
              )}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Requisições</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <code className="font-mono text-sm">{log.ip_address}</code>
                        </TableCell>
                        <TableCell>
                          <code className="font-mono text-sm">{log.endpoint}</code>
                        </TableCell>
                        <TableCell>{log.request_count}</TableCell>
                        <TableCell>
                          {log.blocked ? (
                            <Badge variant="destructive">Bloqueado</Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(log.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {loading && logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Carregando logs…
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && !error && logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhum log disponível
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  Página {filters.page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ page: filters.page - 1 })}
                    disabled={filters.page <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ page: filters.page + 1 })}
                    disabled={filters.page >= totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
