/* eslint-disable react-refresh/only-export-components */
/**
 * Rail direito do Catálogo (Fase 5 — mock A, coluna da direita).
 * E51 banner · E52 gráfico mensal · E53 contagens.
 *
 * O <aside className="catalog-rail"> nasceu vazio na E31 (layout); este
 * componente é o conteúdo dele. Primitivos reusados de talkxShared
 * (RailCard/MetaRow/IconTile) — mesma linguagem visual do Talk X, sem
 * recriar nada.
 */
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sparkles, BarChart3, PackageCheck, Star, Truck, Send, Flame } from 'lucide-react';
import { RailCard, MetaRow, IconTile, RecentList, fmtInt, fmtAgo } from '@/components/talkx/talkxShared';
import type { PillTone, RecentItem } from '@/components/talkx/talkxShared';
import type { CatalogSendEventRow, CatalogTopSent } from '@/hooks/integrations/useCatalogRecentSends';
import { ProductThumb } from './catalogShared';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import { Skeleton } from '@/components/ui/skeleton';

/** Texto do banner isolado numa constante (E51 item 4): trocar a copy não
 * exige mexer no componente. A marca "SUA MARCA AQUI" do mock NÃO entra —
 * é placeholder de mockup, não conteúdo real. */
export const CATALOG_RAIL_COPY = {
  bannerTitle: 'Brindes que fortalecem relacionamentos',
  bannerSubtitle: 'Produtos personalizáveis com a identidade do seu cliente.',
  bannerCta: 'Ver novidades',
} as const;

/** Forma mínima do produto usada pelo rail — estrutural, como
 * CatalogCategoryLike no catalogShared: o rail não precisa (nem deve)
 * conhecer o tipo completo do catálogo.
 * primary_image_url é o campo canônico do ExternalProduct; image_url e
 * images ficam como fallback para outras formas de produto. */
export interface CatalogRailProduct {
  id: string;
  name: string;
  primary_image_url?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  is_featured?: boolean | null;
}

export type CatalogRailFilterKey = 'in_stock' | 'featured' | 'new_30d';

export interface CatalogRailProps {
  stats?: CatalogStats;
  loading?: boolean;
  /** Produtos já carregados na tela — o banner tira daqui a foto em
   * destaque real (E51 item 1). Evita alterar a edge function só para
   * isso: o bootstrap hoje devolve apenas categories/suppliers/stats. */
  products?: CatalogRailProduct[];
  onApplyFilter?: (key: CatalogRailFilterKey) => void;
  /** E56 — vem de useCatalogRecentSends no componente pai. O rail recebe
   * por prop (como CatalogKpiStrip/CategoryChips) em vez de chamar o hook:
   * mantém o rail puro e testável sem QueryClientProvider. */
  recentSends?: CatalogSendEventRow[];
  topSent?: CatalogTopSent[];
  /** Reabre o envio do mesmo produto — o pai resolve o produto completo
   * via fetchProduct(id), já que catalog_send_events guarda só id/nome. */
  onOpenProduct?: (productId: string) => void;
}

/** Primeiro produto em destaque COM imagem. Sem imagem de verdade o banner
 * não inventa nada (E51 item 1: "sem imagem fake") — cai no gradiente. */
function pickFeatured(products: CatalogRailProduct[] | undefined): { name: string; src: string } | null {
  if (!products?.length) return null;
  for (const p of products) {
    if (!p.is_featured) continue;
    const src = p.primary_image_url || p.image_url || p.images?.[0];
    if (src) return { name: p.name, src };
  }
  return null;
}

function RailBanner({ products, onApplyFilter }: Pick<CatalogRailProps, 'products' | 'onApplyFilter'>) {
  const featured = useMemo(() => pickFeatured(products), [products]);
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={Sparkles} color="violet" size={40} glow />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-snug">{CATALOG_RAIL_COPY.bannerTitle}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">{CATALOG_RAIL_COPY.bannerSubtitle}</p>
        </div>
      </div>
      {featured && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2">
          <ProductThumb src={featured.src} alt={featured.name} ratio="square" iconSize="w-4 h-4" />
          <p className="text-xs text-foreground font-medium truncate">{featured.name}</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onApplyFilter?.('new_30d')}
        className="mt-3 text-[13px] font-semibold text-primary-glow hover:underline"
      >
        {CATALOG_RAIL_COPY.bannerCta} →
      </button>
    </div>
  );
}

/** Últimos 7 meses de by_month (catalog_stats). O mês vem como "YYYY-MM". */
function useMonthlyBars(stats?: CatalogStats) {
  return useMemo(() => {
    const raw = (stats?.by_month || []).slice(-7);
    return raw.map((m) => ({
      month: m.month,
      label: format(parse(m.month, 'yyyy-MM', new Date()), 'MMM', { locale: ptBR }),
      count: m.count,
    }));
  }, [stats]);
}

function RailMonthlyChart({ stats, loading }: Pick<CatalogRailProps, 'stats' | 'loading'>) {
  const bars = useMonthlyBars(stats);
  // Delta só quando o mês anterior tem base > 0 (E52 item 2): sem isso
  // qualquer produto novo viraria "+Infinity%".
  const delta = useMemo(() => {
    if (bars.length < 2) return null;
    const prev = bars[bars.length - 2].count;
    const curr = bars[bars.length - 1].count;
    if (prev <= 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  }, [bars]);

  if (loading) {
    return (
      <RailCard icon={BarChart3} color="blue" title="Resumo do catálogo" glow>
        <Skeleton className="h-28 w-full" />
      </RailCard>
    );
  }
  if (!bars.length) return null;

  return (
    <RailCard
      icon={BarChart3}
      color="blue"
      title="Resumo do catálogo"
      subtitle="Produtos cadastrados por mês"
      glow
      right={
        delta != null ? (
          <span className={`text-xs font-semibold tabular-nums ${delta >= 0 ? 'text-success' : 'text-destructive'}`}>
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        ) : undefined
      }
    >
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tickCount={4} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              // ValueType do recharts pode ser number|string|array|undefined -
              // Number() normaliza os 3 primeiros casos, fmtInt ja cobre undefined.
              formatter={(v: unknown) => [fmtInt(typeof v === 'number' ? v : Number(v) || undefined), 'Produtos']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {bars.map((b, i) => (
                <Cell key={b.month} fill={i === bars.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.4)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </RailCard>
  );
}

function RailCounts({ stats, loading, onApplyFilter }: CatalogRailProps) {
  if (loading) {
    return (
      <RailCard icon={PackageCheck} color="green" title="Números do catálogo">
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </RailCard>
    );
  }
  if (!stats) return null;

  // Só as 3 primeiras linhas têm filtro booleano real na listagem
  // (onlyInStock / is_featured / is_new). "Fornecedores ativos" é uma
  // contagem agregada, não um filtro — fica informativa, não clicável.
  const rows: { key: CatalogRailFilterKey | null; icon: typeof PackageCheck; color: 'green' | 'amber' | 'violet' | 'blue'; label: string; value: number }[] = [
    { key: 'in_stock', icon: PackageCheck, color: 'green', label: 'Produtos em estoque', value: stats.in_stock },
    { key: 'featured', icon: Star, color: 'amber', label: 'Em destaque', value: stats.featured },
    { key: 'new_30d', icon: Sparkles, color: 'violet', label: 'Novidades', value: stats.new_30d },
    { key: null, icon: Truck, color: 'blue', label: 'Fornecedores ativos', value: stats.suppliers_active },
  ];

  return (
    <RailCard icon={PackageCheck} color="green" title="Números do catálogo">
      <ul className="space-y-1">
        {rows.map((r) => {
          const content = (
            <MetaRow
              icon={r.icon}
              label={r.label}
              value={<span className="tabular-nums">{fmtInt(r.value)}</span>}
            />
          );
          return (
            <li key={r.label}>
              {r.key && onApplyFilter ? (
                <button type="button" onClick={() => onApplyFilter(r.key as CatalogRailFilterKey)} className="w-full text-left rounded-lg hover:bg-muted/30 transition-colors">
                  {content}
                </button>
              ) : content}
            </li>
          );
        })}
      </ul>
    </RailCard>
  );
}

/** status de catalog_send_events -> tom do ponto do RecentList. */
function toneOf(status: string | null): { tone: PillTone; label: string } {
  if (status === 'failed') return { tone: 'danger', label: 'Falhou' };
  if (status === 'partial') return { tone: 'warning', label: 'Parcial' };
  return { tone: 'success', label: 'Enviado' };
}

function RailRecentSends({ recentSends, topSent, onOpenProduct }: Pick<CatalogRailProps, 'recentSends' | 'topSent' | 'onOpenProduct'>) {
  // Sem nenhum evento a seção inteira some (E56 item 3) — rail curto é
  // melhor que rail com card vazio. Hoje catalog_send_events tem 0 linhas.
  if (!recentSends?.length) return null;

  const items: RecentItem[] = recentSends.map((e) => {
    const { tone, label } = toneOf(e.status);
    return {
      id: e.id,
      name: e.product_name,
      // O destinatário entra na legenda: sem ele, o mesmo produto enviado
      // a contatos diferentes fica indistinguível na lista.
      statusLabel: [label, fmtAgo(e.created_at), e.contact_name].filter(Boolean).join(' · '),
      statusTone: tone,
      // catalog_send_events não guarda imagem (só id/nome/sku) — sem
      // thumb o RecentList cai no ícone, sem imagem inventada.
      onOpen: () => onOpenProduct?.(e.product_id),
    };
  });

  return (
    <>
      <RailCard icon={Send} color="blue" title="Enviados recentemente">
        <RecentList items={items} />
      </RailCard>
      {topSent && topSent.length > 0 && (
        <RailCard icon={Flame} color="amber" title="Mais enviados" subtitle="Últimos 30 dias">
          <ul className="space-y-1">
            {topSent.map((t) => (
              <li key={t.product_id}>
                <button type="button" onClick={() => onOpenProduct?.(t.product_id)} className="w-full text-left rounded-lg hover:bg-muted/30 transition-colors">
                  <MetaRow label={t.product_name} value={<span className="tabular-nums">{fmtInt(t.count)}</span>} />
                </button>
              </li>
            ))}
          </ul>
        </RailCard>
      )}
    </>
  );
}

export function CatalogRail({ stats, loading, products, onApplyFilter, recentSends, topSent, onOpenProduct }: CatalogRailProps) {
  return (
    <div className="space-y-3">
      <RailBanner products={products} onApplyFilter={onApplyFilter} />
      <RailMonthlyChart stats={stats} loading={loading} />
      <RailCounts stats={stats} loading={loading} onApplyFilter={onApplyFilter} />
      <RailRecentSends recentSends={recentSends} topSent={topSent} onOpenProduct={onOpenProduct} />
    </div>
  );
}
