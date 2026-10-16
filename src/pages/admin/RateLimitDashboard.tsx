import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, Activity, Ban, Globe, AlertTriangle, 
  TrendingUp, TrendingDown, Clock, RefreshCw,
  ChevronLeft, ChevronRight, X,
  BarChart3
} from 'lucide-react';
import { useRateLimitLogs, type RateLimitSortKey } from '@/hooks/system/useRateLimitLogs';
import { useUserRole } from '@/hooks/system/useUserRole';
import { BlockedIPsPanel } from '@/components/security/BlockedIPsPanel';
import { IPWhitelistPanel } from '@/components/security/IPWhitelistPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    logs,
    stats,
    total,
    totalPages,
    error,
    loading,
    filters,
    setFilters,
    resetFilters,
    refetch,
  } = useRateLimitLogs(isAdmin || isSupervisor);
  const [activeTab, setActiveTab] = useState('overview');

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

  // Em alguns testes o hook é trocado por um dublê que não devolve `filters`; o
  // acesso opcional mantém a tela desenhável em vez de estourar em `undefined`.
  const ip = filters?.ip ?? '';
  const endpoint = filters?.endpoint ?? '';
  const blockedOnly = filters?.blockedOnly ?? false;
  const sortBy = filters?.sortBy ?? 'created_at';
  const sortDir = filters?.sortDir ?? 'desc';
  const paginaAtual = Math.max(1, filters?.page ?? 1);
  const tamanhoPagina = Math.max(1, filters?.pageSize ?? 25);
  const paginas = Math.max(1, totalPages ?? 1);
  const contagemTotal = total ?? 0;
  const primeiroDaPagina = (paginaAtual - 1) * tamanhoPagina + 1;
  const ultimoDaPagina = Math.min(paginaAtual * tamanhoPagina, contagemTotal);
  const temFiltro = Boolean(ip.trim() || endpoint.trim() || blockedOnly);

  const descricaoDaContagem = error
    ? 'Não foi possível carregar a contagem'
    : contagemTotal > 0
      ? `Mostrando ${primeiroDaPagina}–${ultimoDaPagina} de ${contagemTotal} requisições`
      : loading
        ? 'Carregando requisições…'
        : 'Nenhuma requisição encontrada';

  // Denominador da proporção é a JANELA de estatística (sampleSize), não a página
  // da listagem: `logs.length` agora é o recorte da página.
  const blockedPercentage = stats
    ? Math.round((stats.blockedRequests / Math.max(stats.sampleSize, 1)) * 100)
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
                  <p className="text-2xl font-bold text-warning">{stats?.blockedRequests || 0}</p>
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
              <CardDescription aria-live="polite">{descricaoDaContagem}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtro, ordem e recorte de página são resolvidos no SERVIDOR (hook); a
                  lista da página é exatamente o que o servidor devolveu. */}
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
                <div className="space-y-1">
                  <Label htmlFor="logs-filtro-ip">Filtrar por IP</Label>
                  <Input
                    id="logs-filtro-ip"
                    value={ip}
                    onChange={(e) => setFilters?.({ ip: e.target.value })}
                    placeholder="Ex.: 10.0.0.1"
                    autoComplete="off"
                    className="md:w-48"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="logs-filtro-endpoint">Filtrar por endpoint</Label>
                  <Input
                    id="logs-filtro-endpoint"
                    value={endpoint}
                    onChange={(e) => setFilters?.({ endpoint: e.target.value })}
                    placeholder="Ex.: /api/v1/messages"
                    autoComplete="off"
                    className="md:w-64"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="logs-ordem">Ordenar por</Label>
                  <Select
                    value={sortBy}
                    onValueChange={(valor) => setFilters?.({ sortBy: valor as RateLimitSortKey })}
                  >
                    <SelectTrigger id="logs-ordem" aria-label="Ordenar por" className="md:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">Quando</SelectItem>
                      <SelectItem value="request_count">Requisições</SelectItem>
                      <SelectItem value="ip_address">IP</SelectItem>
                      <SelectItem value="endpoint">Endpoint</SelectItem>
                      <SelectItem value="blocked">Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Inverter ordem de classificação"
                  onClick={() => setFilters?.({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
                >
                  {sortDir === 'asc' ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                </Button>
                <div className="flex items-center gap-2 md:pb-2">
                  <Checkbox
                    id="logs-so-bloqueados"
                    checked={blockedOnly}
                    onCheckedChange={(marcado) => setFilters?.({ blockedOnly: marcado === true })}
                  />
                  <Label htmlFor="logs-so-bloqueados" className="cursor-pointer">
                    Só bloqueados
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Limpar filtros"
                  disabled={!temFiltro}
                  onClick={() => resetFilters?.()}
                >
                  <X className="w-4 h-4 mr-2" />
                  Limpar filtros
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Não foi possível carregar os logs</AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-2">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={() => refetch?.()}>
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Erro em banner, POR CIMA da tabela: as linhas já carregadas
                  continuam visíveis (nunca some com dado disponível). */}
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
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Carregando logs…
                          </TableCell>
                        </TableRow>
                      ) : logs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhum log encontrado para os filtros aplicados
                          </TableCell>
                        </TableRow>
                      ) : (
                        logs.map((log) => (
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
                      )))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Página {paginaAtual} de {paginas}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Página anterior"
                    disabled={paginaAtual <= 1}
                    onClick={() => setFilters?.({ page: paginaAtual - 1 })}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Próxima página"
                    disabled={paginaAtual >= paginas}
                    onClick={() => setFilters?.({ page: paginaAtual + 1 })}
                  >
                    Próxima
                    <ChevronRight className="w-4 h-4 ml-1" />
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
