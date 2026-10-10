/**
 * AdminCRMDashboard — Aggregated CRM metrics for admin area
 * Shows summary cards and quick data previews from the external CRM database
 */
import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Building2, Users, ShoppingCart, DollarSign, BarChart3,
  TrendingUp, Package, Truck, Activity, ExternalLink,
} from 'lucide-react';
import { useExternalSelect } from '@/hooks/integrations/useExternalDB';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { useNavigate } from 'react-router-dom';
import type { ExtCustomer, ExtCompanyRFMScore, ExtSale } from '@/types/externalDB';
import { callCRMIntegration } from '@/lib/crmIntegration';

interface CRMQueueHealth {
  pending: number;
  processing: number;
  failed: number;
  dead_letter: number;
  succeeded_24h: number;
  succeeded_without_link: number;
  oldest_ready_age_seconds: number;
  generated_at: string;
}

function IntegrationHealth() {
  const health = useQuery({
    queryKey: ['crm-integration-health'],
    queryFn: async () => {
      const response = await callCRMIntegration<{ external_reachable: boolean; queue: CRMQueueHealth }>('health');
      const value = response.data;
      const queue = value?.queue;
      if (value?.external_reachable !== true || !queue ||
        !['pending', 'processing', 'failed', 'dead_letter', 'succeeded_24h', 'succeeded_without_link', 'oldest_ready_age_seconds']
          .every((key) => typeof queue[key as keyof CRMQueueHealth] === 'number')) {
        throw new Error('CRM health returned an invalid response');
      }
      return value;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const queue = health.data?.queue;
  const degraded = Boolean(queue && (
    queue.dead_letter > 0 || queue.succeeded_without_link > 0 || queue.oldest_ready_age_seconds > 900
  ));

  return (
    <Card className={degraded || health.isError ? 'border-destructive/50' : 'border-border/50'}>
      <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <Activity className="h-4 w-4 text-primary" /> Saúde da integração
        </div>
        {health.isLoading ? <Skeleton className="h-5 w-48" /> : health.isError ? (
          <Badge variant="destructive">Health check indisponível</Badge>
        ) : (
          <>
            <Badge variant={health.data?.external_reachable ? 'outline' : 'destructive'}>
              CRM {health.data?.external_reachable ? 'conectado' : 'indisponível'}
            </Badge>
            <span>Pendentes: {queue?.pending ?? 0}</span>
            <span>Falhas: {queue?.failed ?? 0}</span>
            <span>DLQ: {queue?.dead_letter ?? 0}</span>
            <span>Sucesso 24h: {queue?.succeeded_24h ?? 0}</span>
            <span>Sem vínculo: {queue?.succeeded_without_link ?? 0}</span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Metric Card ─────────────────────────────────────────────
function MetricCard({ label, table, icon: Icon, color }: {
  label: string; table: string; icon: React.ElementType; color: string;
}) {
  const { data, isLoading } = useExternalSelect({
    table,
    select: 'id',
    limit: 1,
    countMode: 'estimated',
    staleTime: 15 * 60 * 1000,
  });
  const count = data?.meta?.record_count ?? 0;
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          {isLoading ? <Skeleton className="h-6 w-14" /> : (
            <p className="text-xl font-bold">
              {count > 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString('pt-BR')}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Top Customers ───────────────────────────────────────────
function TopCustomers() {
  const { data, isLoading } = useExternalSelect<ExtCustomer>({
    table: 'customers',
    select: 'id,vendedor_nome,valor_total_compras,total_pedidos,ticket_medio,cliente_ativado',
    order: { column: 'valor_total_compras', ascending: false },
    limit: 5,
    staleTime: 10 * 60 * 1000,
  });
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" /> Top 5 Clientes por Valor
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <div className="space-y-1.5">
            {(data?.data || []).map((c, i) => (
              <div key={c.id || i} className="flex items-center justify-between text-xs bg-muted/15 rounded-md px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono w-4">#{i + 1}</span>
                  <span className="font-medium truncate max-w-[120px]">{c.vendedor_nome || '—'}</span>
                  <Badge variant="outline" className={`text-[9px] ${c.cliente_ativado ? 'text-primary' : 'text-muted-foreground'}`}>
                    {c.cliente_ativado ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{fmt(c.valor_total_compras)}</span>
                  <span className="text-muted-foreground ml-2">({c.total_pedidos} ped.)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── RFM Distribution ────────────────────────────────────────
function RFMDistribution() {
  const { data, isLoading } = useExternalSelect<ExtCompanyRFMScore>({
    table: 'company_rfm_scores',
    select: 'id,segment_code,combined_score',
    limit: 200,
    staleTime: 15 * 60 * 1000,
  });

  const segments = (data?.data || []).reduce<Record<string, number>>((acc, r) => {
    const seg = r.segment_code || 'Sem segmento';
    acc[seg] = (acc[seg] || 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(segments).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);

  const segColors: Record<string, string> = {
    Champions: 'bg-success', 'Loyal Customers': 'bg-info',
    'Potential Loyalist': 'bg-primary', 'At Risk': 'bg-destructive',
    Hibernating: 'bg-muted-foreground', Lost: 'bg-muted-foreground/60',
    "Can't Lose Them": 'bg-destructive/80', 'Need Attention': 'bg-warning',
    Promising: 'bg-secondary',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> Distribuição RFM
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="space-y-1.5">
            {sorted.slice(0, 8).map(([seg, count]) => (
              <div key={seg} className="flex items-center gap-2 text-xs">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${segColors[seg] || 'bg-muted'}`} />
                <span className="flex-1 truncate">{seg}</span>
                <span className="text-muted-foreground">{count}</span>
                <div className="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${segColors[seg] || 'bg-primary'}`}
                    style={{ width: `${(count / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent Sales ────────────────────────────────────────────
function RecentSales() {
  const { data, isLoading } = useExternalSelect<ExtSale>({
    table: 'sales',
    select: 'id,client_name,product_name,amount,status,created_at',
    order: { column: 'created_at', ascending: false },
    limit: 5,
    staleTime: 5 * 60 * 1000,
  });
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Vendas Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <div className="space-y-1.5">
            {(data?.data || []).map((s, i) => (
              <div key={s.id || i} className="flex items-center justify-between text-xs bg-muted/15 rounded-md px-2 py-1.5">
                <div>
                  <span className="font-medium">{s.client_name}</span>
                  <span className="text-muted-foreground ml-1.5">— {s.product_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{s.status}</Badge>
                  <span className="font-semibold">{fmt(s.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main ────────────────────────────────────────────────────
export const AdminCRMDashboard = memo(function AdminCRMDashboard() {
  const navigate = useNavigate();
  const crmIntegrationEnabled = useCRMIntegrationEnabled();

  if (!crmIntegrationEnabled) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">CRM externo não configurado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Painel CRM Externo
          </h2>
          <p className="text-xs text-muted-foreground">Visão gerencial dos dados do CRM 360°</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/#crm360')} className="gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" /> Explorer Completo
        </Button>
      </div>

      <IntegrationHealth />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard label="Clientes" table="customers" icon={ShoppingCart} color="bg-info/15 text-info" />
        <MetricCard label="Scores RFM" table="company_rfm_scores" icon={BarChart3} color="bg-success/15 text-success" />
        <MetricCard label="Vendas" table="sales" icon={DollarSign} color="bg-warning/15 text-warning" />
        <MetricCard label="Interações" table="interactions" icon={Activity} color="bg-secondary/15 text-secondary" />
        <MetricCard label="Fornecedores" table="suppliers" icon={Package} color="bg-accent/15 text-accent-foreground" />
        <MetricCard label="Transportadoras" table="carriers" icon={Truck} color="bg-primary/15 text-primary" />
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TopCustomers />
        <RFMDistribution />
        <RecentSales />
      </div>
    </div>
  );
});
