import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Package,
  Grid3X3,
  List,
  X,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  SlidersHorizontal,
  CheckSquare,
  Heart,
  Send,
  Download,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useExternalCatalog, useCatalogStats, useCatalogFavorites, ExternalProduct, type CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import { ExternalProductCard } from './ExternalProductCard';
import { CatalogProductCardSkeleton } from './CatalogProductCard';
import { SendProductDialog } from './SendProductDialog';
import { ModuleHeader, fmtAgo, AlertCard, TalkXPagination, TalkXTable, StatusPill, fmtDateTime, type TalkXColumn, type PillTone } from '@/components/talkx/talkxShared';
import { CatalogRail, type CatalogRailFilterKey } from './CatalogRail';
import { useCatalogRecentSends } from '@/hooks/integrations/useCatalogRecentSends';
import { CatalogKpiStrip, CategoryChips, AdvancedFilterChips, countAdvancedFilters, matchesAnySelected, DEFAULT_ADVANCED_FILTERS, CatalogErrorState, countLabel, useRateLimitCooldown, type AdvancedFilters } from './catalogShared';
import { CatalogAdvancedFilters } from './CatalogAdvancedFilters';
import { parseCatalogCategoryRoute, replaceCatalogCategoryRoute } from './catalogCategoryRoute';
import { CatalogBulkBar } from './CatalogBulkBar';
import { CatalogBulkSendDialog } from './CatalogBulkSendDialog';
// CT-28 — "Exportar seleção" reusa os builders puros do CSV (CT-20), como no
// catálogo do chat: as linhas são exatamente os produtos selecionados na tela
// (nada é buscado na edge; o export do filtro inteiro é o do rail).
import { buildCatalogCsv, catalogExportFilename, triggerCsvDownload } from './catalogExport';
import { CatalogFavoritesTab } from './CatalogFavoritesTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCatalogSendHistory,
  buildSendHistoryCsv,
  sendHistoryFilename,
  type CatalogSendHistoryRow,
} from '@/hooks/integrations/useCatalogSendHistory';
import { fetchCatalogContactPreset } from '@/hooks/integrations/useCatalogContactPreset';
import type { ContactResult } from './useSendProduct';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function SyncStatusChip({ lastSyncAt }: { lastSyncAt: string | null | undefined }) {
  const [isFresh] = useState(() => {
    if (!lastSyncAt) return true;
    return Date.now() - new Date(lastSyncAt).getTime() < 24 * 60 * 60 * 1000;
  });
  if (!lastSyncAt) return null;
  const label = isFresh
    ? 'Sincronizado ' + fmtAgo(lastSyncAt)
    : 'Última sincronização em ' + new Date(lastSyncAt).toLocaleDateString('pt-BR') + ' ' + new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <span className={cn(
      'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
      isFresh ? 'text-success border-success/30 bg-success/10' : 'text-muted-foreground border-border bg-muted/30'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', isFresh ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
      {label}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

function readPageParam(): number {
  try {
    const p = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1', 10);
    return isNaN(p) || p < 1 ? 0 : p - 1;
  } catch { return 0; }
}

// ─── CT-57 — abas com deep link `?tab=` ────────────────────────
const CATALOG_TABS = ['produtos', 'favoritos', 'enviados'] as const;
type CatalogTab = typeof CATALOG_TABS[number];

function isCatalogTab(value: string | null): value is CatalogTab {
  return value !== null && (CATALOG_TABS as readonly string[]).includes(value);
}

/** Aba inicial vinda da URL; ausente ou desconhecida cai em "produtos". */
function readTabParam(): CatalogTab {
  try {
    const value = new URLSearchParams(window.location.search).get('tab');
    return isCatalogTab(value) ? value : 'produtos';
  } catch { return 'produtos'; }
}

// ─── CT-57 — aba "Enviados" ────────────────────────────────────
/** Rótulo + tom do status do envio (mesma API dos pills do TalkX). */
const SEND_STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  sent: { label: 'Enviado', tone: 'success' },
  partial: { label: 'Parcial', tone: 'warning' },
  failed: { label: 'Falhou', tone: 'danger' },
};

const SEND_TEMPLATE_LABELS: Record<string, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
  custom: 'Personalizada',
};

/**
 * Colunas da tabela (ordem do plano: produto, contato, agente, modelo, fotos,
 * status, data). Contato/agente vêm de embed e podem voltar null sob RLS: o
 * fallback é "—", nunca a string "null".
 */
const SEND_HISTORY_TABLE_COLUMNS: TalkXColumn<CatalogSendHistoryRow>[] = [
  {
    key: 'product',
    header: 'Produto',
    render: (r) => (
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{r.product_name}</p>
        {r.product_sku && <p className="text-2xs text-muted-foreground">SKU: {r.product_sku}</p>}
        {r.variant_label && <p className="text-2xs text-muted-foreground">Variação: {r.variant_label}</p>}
      </div>
    ),
  },
  { key: 'contact', header: 'Contato', render: (r) => r.contact_name ?? <span className="text-muted-foreground">—</span> },
  { key: 'agent', header: 'Agente', render: (r) => r.agent_name ?? <span className="text-muted-foreground">—</span> },
  {
    key: 'template',
    header: 'Modelo',
    align: 'center',
    render: (r) => (r.template ? (SEND_TEMPLATE_LABELS[r.template] ?? r.template) : '—'),
  },
  { key: 'images', header: 'Fotos', align: 'center', render: (r) => r.images_count ?? 0 },
  { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status ?? ''} map={SEND_STATUS_META} /> },
  { key: 'created', header: 'Data', render: (r) => fmtDateTime(r.created_at) },
];

/** CT-57 — contagem ao lado do rótulo da aba. */
function TabCount({ value }: { value: number }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
      {value.toLocaleString('pt-BR')}
    </span>
  );
}

export const ExternalProductManagement: React.FC = () => {
  const { data: stats, isLoading: statsLoading, error: statsError } = useCatalogStats();
  const {
    products,
    totalProducts,
    categories,
    suppliers,
    loading,
    error,
    errorCode,
    fetchProducts,
    fetchCategories,
    fetchSuppliers,
    fetchProduct,
  } = useExternalCatalog();

  // CT-59 — 429 da edge: toast + botões desabilitados por 10 s.
  const coolingDown = useRateLimitCooldown(errorCode === 'CATALOG_RATE_LIMITED');

  // E56 — recentes/mais enviados do rail (catalog_send_events).
  const { recent: recentSends, topSent } = useCatalogRecentSends();

  // CT-70 — com "reduzir movimento" ligado, nada entra animando.
  const prefersReducedMotion = useReducedMotion();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>(
    () => parseCatalogCategoryRoute(window.location.search).categoryId ?? 'all'
  );

  const handleCategoryChange = useCallback((id: string) => {
    setCategoryId(id);
    replaceCatalogCategoryRoute(id === 'all' ? null : id);
  }, []);
  const [supplierId, setSupplierId] = useState<string>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [lowStock, setLowStock] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('catalog.view') as 'grid' | 'list') ?? 'grid'
  );
  const [page, setPageState] = useState(() => readPageParam());
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() => {
    const stored = parseInt(sessionStorage.getItem('catalog.page_size') ?? '24', 10);
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(stored) ? stored as PageSizeOption : 24;
  });
  const [orderBy, setOrderBy] = useState<string>(() => sessionStorage.getItem('catalog.order_by') ?? 'name');
  const [ascending, setAscending] = useState<boolean>(() => sessionStorage.getItem('catalog.ascending') !== 'false');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>({ ...DEFAULT_ADVANCED_FILTERS });
  const advCount = countAdvancedFilters(advFilters);

  // E36-2: o edge promogifts-catalog (list_products) agora aceita array
  // em color/material (OR entre valores) — contagem/paginação (totalProducts)
  // já vêm corretas do servidor com 2+ selecionados. Este filtro client-side
  // fica como segunda camada (idempotente, sem custo real: já bate 100% com
  // o que o servidor devolveu), tolerando os dois formatos jsonb que a
  // coluna tem hoje (string simples ou `{nome}}`, via matchesAnySelected).
  const visibleProducts = useMemo(
    () => products.filter((p) => matchesAnySelected(p.colors, advFilters.colors) && matchesAnySelected(p.materials, advFilters.materials)),
    [products, advFilters.colors, advFilters.materials]
  );

  // E43: favoritos Supabase (o `favorites` alimenta a contagem da aba).
  const { favorites, isFavorite: isFav, toggle } = useCatalogFavorites();
  const handleToggleFavorite = useCallback((id: string) => {
    const p = products.find((x) => x.id === id);
    if (p) toggle({ id, name: p.name, sku: p.sku, primary_image_url: p.primary_image_url });
  }, [products, toggle]);

  // CT-57 — aba ativa dirigida pela URL (`?tab=`), não pelo estado interno do
  // Radix: é o que faz o link abrir direto em "enviados" e a URL refletir a
  // troca. Em "produtos" (a padrão) o parâmetro é removido, como `page`.
  const [tab, setTab] = useState<CatalogTab>(readTabParam);
  const handleTabChange = useCallback((value: string) => {
    if (!isCatalogTab(value)) return;
    setTab(value);
    try {
      const url = new URL(window.location.href);
      if (value === 'produtos') url.searchParams.delete('tab');
      else url.searchParams.set('tab', value);
      history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  }, []);

  // CT-57 — histórico de envios. A RLS de catalog_send_events já recorta por
  // agente (próprios envios) ou por admin/supervisor — o hook não refiltra,
  // senão um supervisor deixaria de ver a equipe (mesma premissa do rail).
  const { rows: sendHistoryRows, isLoading: sendHistoryLoading, error: sendHistoryError } = useCatalogSendHistory();
  const [sentSearch, setSentSearch] = useState('');
  const [sentStatus, setSentStatus] = useState<string>('all');
  const [sentPage, setSentPage] = useState(1);
  const [sentPageSize, setSentPageSize] = useState<number>(20);

  const handleSentSearch = useCallback((value: string) => { setSentSearch(value); setSentPage(1); }, []);
  const handleSentStatus = useCallback((value: string) => { setSentStatus(value); setSentPage(1); }, []);
  const handleSentPageSize = useCallback((size: number) => { setSentPageSize(size); setSentPage(1); }, []);

  const filteredSendRows = useMemo(() => {
    const term = sentSearch.trim().toLowerCase();
    return sendHistoryRows.filter((r) => {
      if (sentStatus !== 'all' && r.status !== sentStatus) return false;
      if (!term) return true;
      return [r.product_name, r.product_sku, r.contact_name, r.agent_name]
        .some((value) => (value ?? '').toLowerCase().includes(term));
    });
  }, [sendHistoryRows, sentSearch, sentStatus]);

  const sentPageRows = useMemo(
    () => filteredSendRows.slice((sentPage - 1) * sentPageSize, sentPage * sentPageSize),
    [filteredSendRows, sentPage, sentPageSize],
  );

  /** CT-57 — CSV do que está na tela (filtro aplicado), como o CT-28 faz com a
   * seleção. O builder é novo: o do CT-20 monta linha de PRODUTO do PromoGifts
   * e não tem contato/agente/status. */
  const handleExportSentHistory = useCallback(() => {
    if (filteredSendRows.length === 0) return;
    triggerCsvDownload(buildSendHistoryCsv(filteredSendRows), sendHistoryFilename(new Date()));
    toast.success(`${filteredSendRows.length} envio(s) exportado(s) em CSV`);
  }, [filteredSendRows]);

  // E47: seleção em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelectProduct = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelectAll = useCallback(() => {
    const pageIds = visibleProducts.map((p) => p.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [visibleProducts, selectedIds]);
  const allPageSelected = visibleProducts.length > 0 && visibleProducts.every((p) => selectedIds.has(p.id));

  /** CT-28 — produtos selecionados da página atual (mesma fonte da barra). */
  const selectedProducts = useMemo(
    () => visibleProducts.filter((p) => selectedIds.has(p.id)),
    [visibleProducts, selectedIds]
  );

  /** CT-28 — "Exportar seleção": CSV com exatamente os produtos escolhidos,
   * reusando os builders puros do CT-20 (sem tocar na edge). */
  const handleExportSelection = useCallback(() => {
    if (selectedProducts.length === 0) return;
    triggerCsvDownload(buildCatalogCsv(selectedProducts), catalogExportFilename('selecao', new Date()));
    toast.success(`${selectedProducts.length} produto(s) exportado(s) em CSV`);
  }, [selectedProducts]);

  /** CT-28 — "Favoritar N": favorita só os selecionados que ainda não são
   * favoritos, com o mesmo `toggle` do hook de favoritos da tela. */
  const handleFavoriteSelection = useCallback(() => {
    const toFavorite = selectedProducts.filter((p) => !isFav(p.id));
    toFavorite.forEach((p) => {
      void toggle({ id: p.id, name: p.name, sku: p.sku, primary_image_url: p.primary_image_url });
    });
    if (toFavorite.length > 0) toast.success(`${toFavorite.length} produto(s) adicionado(s) aos favoritos`);
  }, [selectedProducts, isFav, toggle]);

  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const handleBulkSend = useCallback(() => { setBulkSendOpen(true); }, []);

  const gridRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    setPageState((prev) => {
      const next = typeof p === 'function' ? p(prev) : p;
      try {
        const url = new URL(window.location.href);
        if (next === 0) { url.searchParams.delete('page'); } else { url.searchParams.set('page', String(next + 1)); }
        history.replaceState(null, '', url.toString());
      } catch { /* ignore */ }
      return next;
    });
    setSelectedIds(new Set());
  }, []);

  const setPageSize = useCallback((ps: PageSizeOption) => {
    setPageSizeState(ps);
    sessionStorage.setItem('catalog.page_size', String(ps));
    setPage(0);
  }, [setPage]);

  const parentCategories = categories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const buildFilters = useCallback((pageOverride?: number, sizeOverride?: number): Record<string, unknown> => {
    const currentPage = pageOverride ?? page;
    const currentSize = sizeOverride ?? pageSize;
    const params: Record<string, unknown> = {
      limit: currentSize,
      offset: currentPage * currentSize,
      only_in_stock: onlyInStock,
    };
    if (search) params.search = search;
    if (categoryId !== 'all') params.category_id = categoryId;
    if (supplierId !== 'all') params.supplier_id = supplierId;
    if (isFeatured) params.is_featured = true;
    if (isNew) params.is_new = true;
    // CT-23 — estoque baixo (1..10 unidades), filtro que já existe na edge
    // (CatalogFilters.low_stock) e faltava nesta fiação.
    if (lowStock) params.low_stock = true;
    const effectiveOrder = search ? orderBy : (orderBy === 'name' ? 'name' : orderBy);
    params.order_by = effectiveOrder;
    params.ascending = ascending;
    if (advFilters.isBestseller) params.is_bestseller = true;
    if (advFilters.priceMin) params.price_min = parseFloat(advFilters.priceMin);
    if (advFilters.priceMax) params.price_max = parseFloat(advFilters.priceMax);
    // E36-2 — o edge aceita 1 valor ou array (OR entre si); manda a
    // seleção completa direto, servidor filtra e pagina certo com 2+.
    if (advFilters.colors.length > 0) params.color = advFilters.colors;
    if (advFilters.materials.length > 0) params.material = advFilters.materials;
    return params;
  }, [page, pageSize, search, categoryId, supplierId, onlyInStock, lowStock, isFeatured, isNew, orderBy, ascending, advFilters]);

  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
    fetchProducts(buildFilters());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const parsed = parseCatalogCategoryRoute(window.location.search);
    if (parsed.needsNormalization) replaceCatalogCategoryRoute(null);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      fetchProducts(buildFilters(0));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, supplierId, onlyInStock, lowStock, isFeatured, isNew, orderBy, ascending, advFilters, pageSize]);

  useEffect(() => {
    if (page > 0) {
      fetchProducts(buildFilters());
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.ceil(totalProducts / pageSize);
  const hasFilters = search || categoryId !== 'all' || supplierId !== 'all' || onlyInStock || lowStock || isFeatured || isNew || advCount > 0;

  const clearFilters = () => {
    setSearch('');
    setCategoryId('all');
    setSupplierId('all');
    setOnlyInStock(false);
    setLowStock(false);
    setIsFeatured(false);
    setIsNew(false);
    setOrderBy('name');
    setAscending(true);
    setPage(0);
    sessionStorage.removeItem('catalog.order_by');
    sessionStorage.removeItem('catalog.ascending');
    setAdvFilters({ ...DEFAULT_ADVANCED_FILTERS });
  };

  type SortOption = { label: string; order_by: string; ascending: boolean };
  const SORT_OPTIONS: SortOption[] = [
    { label: 'Nome A–Z', order_by: 'name', ascending: true },
    { label: 'Nome Z–A', order_by: 'name', ascending: false },
    { label: 'Menor preço', order_by: 'sale_price', ascending: true },
    { label: 'Maior preço', order_by: 'sale_price', ascending: false },
    { label: 'Maior estoque', order_by: 'stock_quantity', ascending: false },
    { label: 'Mais recentes', order_by: 'created_at', ascending: false },
    // CT-22 — "Mais pedidos" (order_by 'order_count') fica OCULTO de propósito: o
    // PromoGifts ainda não expõe dado de pedido (falta `has_order_data` na RPC
    // zapp_catalog_stats). Reexibir quando o responsável pelo PromoGifts entregar a
    // flag — pendência registrada no plano. Não se faz DDL no banco externo (CLAUDE.md §1).
    // Um sort antigo persistido em sessionStorage cai no fallback `?? SORT_OPTIONS[0]`.
  ];
  const sortKey = orderBy + ':' + String(ascending);
  const currentSort = SORT_OPTIONS.find((o) => o.order_by === orderBy && o.ascending === ascending) ?? SORT_OPTIONS[0];

  const applySort = (key: string) => {
    const opt = SORT_OPTIONS.find((o) => o.order_by + ':' + String(o.ascending) === key);
    if (!opt) return;
    setOrderBy(opt.order_by);
    setAscending(opt.ascending);
    sessionStorage.setItem('catalog.order_by', opt.order_by);
    sessionStorage.setItem('catalog.ascending', String(opt.ascending));
    setPage(0);
  };

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('catalog.view', mode);
  };

  /** Aplica o filtro do indicador clicado (KPIs do topo e contagens do rail).
   * As chaves são `keyof CatalogStats`; só as que têm filtro booleano real na
   * listagem agem — o resto é no-op consciente (E33). */
  const handleKpiSelect = useCallback((key: keyof CatalogStats) => {
    if (key === 'in_stock') setOnlyInStock(true);
    else if (key === 'featured') setIsFeatured(true);
    else if (key === 'new_30d') setIsNew(true);
    // CT-23 — filtro de estoque baixo (1..10): já existe na edge e em
    // CatalogFilters (`low_stock`); sem este branch o botão do alerta do rail
    // ficaria morto.
    else if (key === 'low_stock') setLowStock(true);
  }, []);

  /** CT-23 — o alerta de estoque baixo do rail tem callback próprio
   * (`onApplyLowStock`) em vez de `onApplyFilter`; reusa handleKpiSelect para
   * não duplicar a regra. */
  const handleApplyLowStock = useCallback(() => { handleKpiSelect('low_stock'); }, [handleKpiSelect]);

  /** CT-21 — chave do filtro do rail ativo agora, para o "Exportar catálogo"
   * exportar o filtro atual em vez do catálogo inteiro. A precedência só
   * importa com 2+ filtros ligados ao mesmo tempo; todas as chaves são as que
   * o builder do CSV sabe traduzir para a edge (filterKeyToEdgeParams). */
  const activeRailFilter: CatalogRailFilterKey | null =
    onlyInStock ? 'in_stock' : isFeatured ? 'featured' : isNew ? 'new_30d' : null;

  const [sendProduct, setSendProduct] = useState<ExternalProduct | null>(null);
  const handleSendProduct = (product: ExternalProduct) => { setSendProduct(product); };

  /** E56 — reabrir envio a partir do rail. catalog_send_events guarda só
   * o id do produto, então busca o produto completo antes de abrir o
   * diálogo; se ele tiver sumido do catálogo, não abre nada. */
  const lastRequestedProductIdRef = useRef<string | null>(null);
  const handleOpenProductFromRail = useCallback(async (productId: string) => {
    lastRequestedProductIdRef.current = productId;
    const product = await fetchProduct(productId);
    if (product && lastRequestedProductIdRef.current === productId) setSendProduct(product);
  }, [fetchProduct]);

  // E78 — deep link ?product=<id>&send=1[&variant=<cor>][&contact=<id>] abre o
  // dialog de envio direto ao carregar a página, sem precisar clicar em nada.
  // O valor inicial de deepLinkVariant vem do lazy initializer (lido uma vez, na
  // primeira render) pra não precisar de um setState síncrono dentro do
  // efeito de mount abaixo.
  const [deepLinkVariant, setDeepLinkVariant] = useState<string | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('send') === '1' && params.get('product') ? (params.get('variant') ?? undefined) : undefined;
  });
  // CT-55 — contato do deep link `?contact=<id>`. É o ContactResult completo
  // (buscado por id), não só o id: o dialog precisa de nome/telefone/avatar
  // para o card-resumo não abrir vazio.
  const [deepLinkContact, setDeepLinkContact] = useState<ContactResult | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('product');
    const send = params.get('send');
    if (send === '1' && productId) {
      const contactId = params.get('contact');
      // setTimeout(0) move o fetch inicial pra fora do corpo síncrono do
      // efeito, mesmo padrão já usado em RateLimitRealtimeAlerts.tsx (E62)
      // pra satisfazer react-hooks/set-state-in-effect. Não reusa
      // handleOpenProductFromRail (compartilhado com o rail) porque o
      // caminho de falha aqui precisa limpar deepLinkVariant — algo que o
      // rail não tem motivo pra saber (Audit 24/09, CRÍTICO 2).
      setTimeout(() => {
        void (async () => {
          lastRequestedProductIdRef.current = productId;
          // CT-55 — produto e contato em paralelo; o contato é opcional e a
          // falha dele (id inexistente/sem permissão) devolve null, caindo no
          // passo normal de seleção em vez de abrir um contato fantasma.
          const [product, contact] = await Promise.all([
            fetchProduct(productId),
            contactId ? fetchCatalogContactPreset(contactId) : Promise.resolve(null),
          ]);
          if (lastRequestedProductIdRef.current !== productId) return;
          if (product) {
            setDeepLinkContact(contact);
            setSendProduct(product);
          } else {
            // Produto do deep link não existe mais (removido/id errado):
            // sem isso, deepLinkVariant ficava preso no state e vazava pra
            // um envio totalmente não relacionado depois.
            setDeepLinkVariant(undefined);
          }
        })();
      }, 0);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('product');
        url.searchParams.delete('send');
        url.searchParams.delete('variant');
        // CT-55 — `contact` sai junto: sem isso o parâmetro ficaria preso na
        // URL (o efeito só roda no mount) e um refresh reabriria o dialog.
        url.searchParams.delete('contact');
        history.replaceState(null, '', url.toString());
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full min-w-0">
      <TabsList className="mb-4 h-9">
        <TabsTrigger value="produtos" className="gap-1.5 text-xs">
          <Package className="w-3.5 h-3.5" />
          Produtos
          <TabCount value={totalProducts} />
        </TabsTrigger>
        <TabsTrigger value="favoritos" className="gap-1.5 text-xs">
          <Heart className="w-3.5 h-3.5" />
          Favoritos
          <TabCount value={favorites.length} />
        </TabsTrigger>
        {/* CT-57 — envios do agente logado (admin/supervisor veem a equipe):
            o recorte é a RLS de catalog_send_events, não um filtro da tela. */}
        <TabsTrigger value="enviados" className="gap-1.5 text-xs">
          <Send className="w-3.5 h-3.5" />
          Enviados
          <TabCount value={sendHistoryRows.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="produtos">
    <div className="w-full min-w-0 xl:grid xl:grid-cols-[1fr_300px] 2xl:grid-cols-[1fr_320px] xl:gap-6">
    <div className="space-y-6 min-w-0">
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      >
        {statsLoading ? (
          <div className="flex items-center gap-3.5">
            <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
        ) : (
          <ModuleHeader
            icon={Package}
            color="blue"
            title="Catálogo de Produtos"
            subtitle={(stats?.total ?? totalProducts).toLocaleString('pt-BR') + ' produtos sincronizados em tempo real com o PromoGifts. Gerencie, edite e compartilhe produtos.'}
            right={(
              <>
                <SyncStatusChip key={stats?.last_sync_at} lastSyncAt={stats?.last_sync_at} />
                <Button variant="outline" size="sm" onClick={() => fetchProducts(buildFilters())} disabled={coolingDown}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Atualizar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://promogifts.com.br" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Gerenciar no PromoGifts
                  </a>
                </Button>
              </>
            )}
          />
        )}
      </motion.div>

      {statsError ? (
        <AlertCard tone="warning">Não foi possível carregar os indicadores do catálogo agora.</AlertCard>
      ) : (
        <CatalogKpiStrip stats={stats} loading={statsLoading} onSelect={handleKpiSelect} />
      )}

      <AdvancedFilterChips
        filters={advFilters}
        onChange={(next) => { setAdvFilters(next); setPage(0); }}
      />

      {parentCategories.length > 0 && (
        <CategoryChips
          categories={parentCategories}
          activeId={categoryId === 'all' ? null : categoryId}
          onChange={(id) => handleCategoryChange(id ?? 'all')}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch('')}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <Select value={categoryId} onValueChange={handleCategoryChange} disabled={coolingDown}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {parentCategories.map((cat) => {
              const subs = getSubcategories(cat.id);
              return (
                <React.Fragment key={cat.id}>
                  <SelectItem value={cat.id} className="font-semibold">
                    {countLabel(cat.name, cat.products_count)}
                  </SelectItem>
                  {subs.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id} className="pl-6 text-sm">
                      {countLabel(sub.name, sub.products_count)}
                    </SelectItem>
                  ))}
                </React.Fragment>
              );
            })}
          </SelectContent>
        </Select>

        <Select value={supplierId} onValueChange={setSupplierId} disabled={coolingDown}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos fornecedores</SelectItem>
            {/* CT-60 — fornecedor sem contagem: ExternalSupplier não tem campo
                de contagem e a edge não devolve esse número (SUPPLIER_FIELDS em
                promogifts-catalog/index.ts). Sem fonte real, o número não é
                inventado — divergência registrada no relatório do CT-60. */}
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch id="stock-mgmt" checked={onlyInStock} onCheckedChange={setOnlyInStock} disabled={coolingDown} />
          <Label htmlFor="stock-mgmt" className="text-sm cursor-pointer">Em estoque</Label>
        </div>

        <div className="flex border rounded-md">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="rounded-r-none" onClick={() => handleViewMode('grid')} title="Grade">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="rounded-l-none" onClick={() => handleViewMode('list')} title="Lista">
            <List className="w-4 h-4" />
          </Button>
        </div>

        <Button
          variant={selectedIds.size > 0 ? 'secondary' : 'outline'}
          size="sm"
          onClick={selectedIds.size > 0 ? clearSelection : toggleSelectAll}
          className="gap-1.5"
        >
          <CheckSquare className="w-4 h-4" />
          {selectedIds.size > 0 ? `${selectedIds.size} selecionado${selectedIds.size > 1 ? 's' : ''}` : 'Selecionar'}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(true)} className="relative">
          <SlidersHorizontal className="w-4 h-4 mr-1.5" />
          Filtros avançados
          {advCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {advCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {loading
            ? 'Carregando...'
            : totalProducts === 0
              ? 'Nenhum produto'
              : <>Mostrando <span className="font-medium text-foreground">{Math.min(page * pageSize + 1, totalProducts).toLocaleString('pt-BR')}–{Math.min((page + 1) * pageSize, totalProducts).toLocaleString('pt-BR')}</span> de <span className="font-medium text-foreground">{totalProducts.toLocaleString('pt-BR')}</span></>
          }
        </span>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <Button variant="link" size="sm" onClick={clearFilters} className="h-auto p-0">
              Limpar filtros
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground hover:text-foreground">
                Ordenar: {currentSort.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sortKey} onValueChange={applySort}>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt.order_by + ':' + String(opt.ascending)}
                    value={opt.order_by + ':' + String(opt.ascending)}
                  >
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <CatalogErrorState
          code={errorCode}
          message={error}
          onRetry={() => fetchProducts(buildFilters())}
          retryDisabled={coolingDown}
        />
      )}

      <div ref={gridRef}>
        {loading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' : 'space-y-3'}>
            {[...Array(pageSize)].map((_, i) => (
              viewMode === 'grid'
                ? <CatalogProductCardSkeleton key={i} mode="grade" />
                : <CatalogProductCardSkeleton key={i} mode="list" />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Package className="w-16 h-16 opacity-40" />
            {hasFilters ? (
              <>
                <p className="font-medium text-lg text-foreground">Nenhum produto com esses filtros</p>
                <p className="text-sm">Tente remover ou ajustar os filtros de busca.</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
              </>
            ) : (
              <>
                <p className="font-medium text-lg text-foreground">Catálogo vazio</p>
                <p className="text-sm">Nenhum produto sincronizado ainda.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://promogifts.com.br" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-1" />Gerenciar no PromoGifts
                  </a>
                </Button>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout={!prefersReducedMotion}
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                  : 'space-y-2'
              }
            >
              {visibleProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout={!prefersReducedMotion}
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
                >
                  <ExternalProductCard
                    product={product}
                    onSend={handleSendProduct}
                    compact={viewMode === 'list'}
                    /* CT-72 — as 4 capas acima da dobra saem eager + fetchpriority=high (mesma regra da grade do catálogo). */
                    priority={index < 4}
                    isFavorite={isFav(product.id)}
                    onToggleFavorite={handleToggleFavorite}
                    isSelected={selectedIds.has(product.id)}
                    onToggleSelect={toggleSelectProduct}
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {totalPages > 1 && (
        <TalkXPagination
          page={page + 1}
          pageSize={pageSize}
          total={totalProducts}
          onPage={(p) => setPage(p - 1)}
          onPageSize={(ps) => setPageSize(ps as PageSizeOption)}
          noun="produto"
        />
      )}

      <CatalogAdvancedFilters
        key={String(advancedOpen)}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        filters={advFilters}
        stats={stats}
        onApply={(next) => { setAdvFilters(next); setPage(0); }}
        onClear={() => { setAdvFilters({ ...DEFAULT_ADVANCED_FILTERS }); setPage(0); }}
      />

      {selectedIds.size > 0 && (
        <CatalogBulkBar
          count={selectedIds.size}
          pageTotal={visibleProducts.length}
          allPageSelected={allPageSelected}
          onToggleSelectAll={toggleSelectAll}
          onClear={clearSelection}
          onSend={handleBulkSend}
          onExport={handleExportSelection}
          onFavorite={handleFavoriteSelection}
        />
      )}

      {sendProduct && (
        <SendProductDialog
          key={sendProduct.id}
          product={sendProduct}
          open={!!sendProduct}
          onOpenChange={(open) => { if (!open) { setSendProduct(null); setDeepLinkVariant(undefined); setDeepLinkContact(null); } }}
          initialVariantColor={deepLinkVariant}
          /* CT-55 — contato pré-selecionado vindo de `?contact=<id>`. */
          presetContact={deepLinkContact}
        />
      )}

      <CatalogBulkSendDialog
        products={[...selectedIds].map((id) => products.find((p) => p.id === id)).filter((p): p is ExternalProduct => p !== undefined)}
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        onSent={clearSelection}
      />
    </div>

    <aside className="catalog-rail sticky top-4 hidden xl:block">
      {/* E51-E53: o rail nasceu vazio na E31 (layout). onApplyFilter reusa
          handleKpiSelect — as chaves do rail são keyof CatalogStats de
          propósito, pra não duplicar a lógica de aplicar filtro.
          CT-21/CT-23: exportFilter = filtro do rail ativo agora (o export sai
          do filtro atual, não do catálogo inteiro) e onApplyLowStock liga o
          botão do alerta de estoque baixo. */}
      <CatalogRail
        stats={stats}
        loading={statsLoading}
        products={products}
        onApplyFilter={handleKpiSelect}
        recentSends={recentSends}
        topSent={topSent}
        onOpenProduct={handleOpenProductFromRail}
        exportFilter={activeRailFilter}
        onApplyLowStock={handleApplyLowStock}
      />
    </aside>
    </div>
      </TabsContent>

      <TabsContent value="favoritos">
        <CatalogFavoritesTab />
      </TabsContent>

      {/* CT-57 — enviados: TalkXTable sobre catalog_send_events (a leitura já
          vem recortada pela RLS por agente / admin-supervisor). Filtros e
          paginação no cliente sobre o lote carregado pelo hook. */}
      <TabsContent value="enviados">
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto, SKU, contato ou agente..."
                value={sentSearch}
                onChange={(e) => handleSentSearch(e.target.value)}
                className="pl-9"
              />
              {sentSearch && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => handleSentSearch('')}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <Select value={sentStatus} onValueChange={handleSentStatus}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="partial">Parcial</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportSentHistory} disabled={filteredSendRows.length === 0}>
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </div>

          {sendHistoryError ? (
            <AlertCard tone="warning">Não foi possível carregar o histórico de envios agora.</AlertCard>
          ) : sendHistoryLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : (
            <>
              <TalkXTable
                columns={SEND_HISTORY_TABLE_COLUMNS}
                rows={sentPageRows}
                getId={(r) => r.id}
                stickyHeader
                emptyState={sendHistoryRows.length === 0 ? 'Nenhum produto enviado ainda.' : 'Nenhum envio com esses filtros.'}
              />
              {filteredSendRows.length > 0 && (
                <TalkXPagination
                  page={sentPage}
                  pageSize={sentPageSize}
                  total={filteredSendRows.length}
                  onPage={setSentPage}
                  onPageSize={handleSentPageSize}
                  noun="envio"
                />
              )}
            </>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
};
