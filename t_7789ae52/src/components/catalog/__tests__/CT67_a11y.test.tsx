/**
 * CT-67 — acessibilidade automatizada (axe-core, via `vitest-axe`) dos 5
 * componentes do módulo de catálogo: `CatalogProductCard`,
 * `CatalogAdvancedFilters`, `ProductDetailDialog`, `SendProductDialog` e
 * `ContactSelectionStep`.
 *
 * ── Aceite ────────────────────────────────────────────────────────────────
 * O plano (`docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md`, FASE 7) pede
 * **0 violações SÉRIAS** em cada componente. Por isso cada caso filtra os
 * resultados para `critical`/`serious` antes de afirmar
 * `toHaveNoViolations()` — é exatamente o critério do aceite (e evita o
 * vermelho por regras de página, ver abaixo). O inventário de violações
 * NÃO-sérias (`moderate`/`minor`) também é pinado por componente: nada fica
 * escondido e uma moderada nova quebra o teste (ver `NAO_SERIAS`).
 *
 * ── DÍVIDA CONHECIDA (NÃO é do CT-67) ──────────────────────────────────────
 * Os 3 achados `button-name` (**impacto `critical`**) que existiam quando este
 * teste foi escrito JÁ FORAM PAGOS pelo PR #1500 (bloco H — CT-68/CT-69):
 *   • `ProductDetailDialog` — as thumbs da galeria ganharam
 *     `aria-label="Ver imagem N de M"` (`ProductDetailDialog.tsx:204`); o
 *     `<img alt="">` CONTINUA vazio, é decorativo. 2 nós.
 *   • `SendProductDialog` — o trigger do split-button ganhou
 *     `aria-label="Mais ações de envio"` (`SendProductDialog.tsx:571`). 1 nó.
 * Com isso os casos de `ProductDetailDialog` e `SendProductDialog` ficam
 * VERDES hoje. Resta 1 achado NÃO-sério, pinado na allowlist `NAO_SERIAS`
 * abaixo (nada escondido):
 *   • `ProductDetailDialog` — `SectionCard` usa `<h4>` sob o título `<h2>` do
 *     dialog → `heading-order` (`moderate`).
 * Nenhuma regra foi desabilitada: a varredura séria do CT-67 roda sobre os
 * componentes reais e o inventário não-sério é afirmado por igualdade.
 *
 * ── Mocks ─────────────────────────────────────────────────────────────────
 * Os mesmos padrões dos testes vizinhos (`*.test.tsx`) — nenhuma infra nova.
 * Radix (Sheet/Dialog/Slider/DropdownMenu) roda de verdade; só é polyfillado o
 * `ResizeObserver`, que o jsdom não implementa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ContactSelectionStep } from '../ContactSelectionStep';
import { CatalogProductCard } from '../CatalogProductCard';
import { CatalogAdvancedFilters } from '../CatalogAdvancedFilters';
import { ProductDetailDialog } from '../ProductDetailDialog';
import { SendProductDialog } from '../SendProductDialog';
import { DEFAULT_ADVANCED_FILTERS } from '../catalogShared';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import type { ContactResult } from '../useSendProduct';

// Radix mede os alvos com `ResizeObserver`, API ausente no jsdom (o setup
// global só faz polyfill de IntersectionObserver) — mesmo polyfill dos testes
// de catálogo já existentes.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

const mockUseExternalProduct = vi.hoisted(() => vi.fn());
const mockToggleFavorite = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog'
  );
  return {
    ...actual,
    useExternalProduct: (...args: unknown[]) => mockUseExternalProduct(...args),
    useCatalogFavorites: () => ({ isFavorite: () => false, toggle: mockToggleFavorite }),
  };
});

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockReadiness = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogSendReadiness', () => ({
  useCatalogSendReadiness: (...args: unknown[]) => mockReadiness(...args),
}));

const mockFetchContacts = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogContactSearch', () => ({
  fetchCatalogContactResults: (...args: unknown[]) => mockFetchContacts(...args),
  logCatalogSendEvent: vi.fn().mockResolvedValue(undefined),
  CONTACT_SEARCH_MIN_CHARS: 2,
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

const mockRecentSends = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogRecentSends', () => ({
  useCatalogRecentSends: (...args: unknown[]) => mockRecentSends(...args),
  CATALOG_SEND_EVENTS_KEY: ['catalog-send-events'],
}));

const product = (o: Partial<ExternalProduct> = {}): ExternalProduct => ({
  id: 'p1', name: 'Caneta Bambu', description: null, short_description: null,
  sku: 'CB-001', sale_price: 12.5, suggested_price: null, stock_quantity: 100,
  primary_image_url: 'https://x/a.jpg', colors: null, brand: null,
  origin_country: null, min_quantity: 25, dimensions_display: '10 x 5 cm', weight_g: 250,
  combined_sizes: null, product_type: null, is_kit: false, is_active: true,
  is_stockout: false, allows_personalization: false, lead_time_days: 15, supply_mode: null,
  category_id: null, supplier_id: null, slug: 'caneta-bambu', capacity_ml: 350, ncm_code: null,
  categories: null, suppliers: { id: 's1', name: 'Só Marcas' },
  // produto já com variants (mesmo vazio): needsFullProduct fica false, então
  // useExternalProduct nunca dispara fetch de rede durante o teste.
  images: ['https://x/a.jpg'],
  variants: [],
  ...o,
} as unknown as ExternalProduct);

const stats = (o: Partial<CatalogStats> = {}): CatalogStats => ({
  total: 100, in_stock: 80, featured: 10, new_30d: 5, bestseller: 20,
  kits: 3, low_stock: 4, categories_root: 5, suppliers_active: 2,
  last_sync_at: null, last_update_at: null, by_month: [], price_max: 1000,
  top_colors: [{ label: 'Azul', count: 40 }, { label: 'Preto', count: 12 }],
  top_materials: [{ label: 'Metal', count: 8 }],
  ...o,
});

const contact: ContactResult = { id: 'c1', name: 'Tomaz Alves', phone: '5511949600474', avatar_url: null };

const contactStepProps = {
  productName: 'Açucareiro em bambu',
  productImageUrl: 'https://x/produto.jpg',
  selectedImagesCount: 3,
  template: 'informal' as const,
  templateLabels: { formal: 'Formal', informal: 'Informal', promo: 'Promoção' },
  contactSearch: '',
  onContactSearchChange: vi.fn(),
  contactResults: [contact] as ContactResult[],
  searchingContacts: false,
  selectedContact: null as ContactResult | null,
  onSelectContact: vi.fn(),
  isSending: false,
  onBack: vi.fn(),
  onSend: vi.fn(),
};

/** Impactos que o aceite do plano trata como "séria". */
const SERIOUS = new Set(['critical', 'serious']);

/**
 * Inventário pinado das violações NÃO-sérias (`moderate`/`minor`) por
 * componente. Nada é escondido: se uma moderada nova aparecer — ou se uma
 * conhecida sumir (por ex. ao corrigir o cabeçalho do `SectionCard`) — o teste
 * quebra e o inventário tem de ser atualizado à mão.
 *   • `ProductDetailDialog`: `heading-order` (1 nó, `moderate`) — `<h4>` do
 *     `SectionCard` sob o `<h2>` do título do dialog (pula o `h3`).
 *   • `ContactSelectionStep`: nenhuma. O `region` que a varredura acusava era
 *     artefato do harness (o passo estava fora de um `role="dialog"`); com o
 *     `DialogContent` real ele some — não foi preciso desabilitar regra.
 */
const NAO_SERIAS: Record<string, string[]> = {
  CatalogProductCard: [],
  CatalogAdvancedFilters: [],
  ProductDetailDialog: ['heading-order'],
  SendProductDialog: [],
  ContactSelectionStep: [],
};

const ids = (violations: { id: string }[]) => violations.map((v) => v.id).sort();

/**
 * Roda o axe no alvo e aplica as duas afirmações do CT-67:
 *   1. `toHaveNoViolations()` sobre as violações SÉRIAS (o aceite);
 *   2. igualdade do inventário de violações NÃO-sérias (visibilidade — nada
 *      é escondido, só classificado).
 */
const audit = async (target: Element, componente: keyof typeof NAO_SERIAS) => {
  const results = await axe(target);
  expect({
    ...results,
    violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
  }).toHaveNoViolations();
  expect(ids(results.violations.filter((v) => !SERIOUS.has(v.impact ?? '')))).toEqual(NAO_SERIAS[componente]);
};

/**
 * Alvo da varredura. Componentes Radix que renderizam em portal (Sheet/Dialog)
 * precisam ser varridos em `document.body`: o `container` do render fica
 * vazio e a varredura seria vácuo (falsa segurança).
 */
const scanBody = () => document.body;

beforeEach(() => {
  cleanup();
  mockUseExternalProduct.mockReset();
  mockUseExternalProduct.mockReturnValue({ data: undefined, isFetching: false });
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ profile: { id: 'profile-1' } });
  mockReadiness.mockReset();
  mockReadiness.mockReturnValue({ blocked: false, reason: null, checking: false });
  mockFetchContacts.mockReset();
  mockFetchContacts.mockResolvedValue([]);
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [], isLoading: false, hasData: false });
  sessionStorage.clear();
});

describe('CT-67 — acessibilidade (axe) dos componentes do catálogo', () => {
  it('CatalogProductCard não tem violações sérias', async () => {
    const { container } = render(<CatalogProductCard product={product()} onSend={vi.fn()} />);
    await audit(container, 'CatalogProductCard');
  });

  it('CatalogAdvancedFilters não tem violações sérias', async () => {
    render(
      <CatalogAdvancedFilters
        open
        onOpenChange={vi.fn()}
        filters={{ ...DEFAULT_ADVANCED_FILTERS, colors: ['Azul'], priceMin: '50', priceMax: '900' }}
        stats={stats()}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );
    await audit(scanBody(), 'CatalogAdvancedFilters');
  });

  it('ProductDetailDialog não tem violações sérias', async () => {
    render(
      <ProductDetailDialog
        product={product({
          images: ['https://x/a.jpg', 'https://x/b.jpg'],
          variants: [
            {
              id: 'v1', product_id: 'p1', sku: 'CB-001-A', name: 'Azul',
              attributes: null, stock_quantity: 10, color_name: 'Azul', color_hex: '#0000ff',
              size_code: null, capacity_ml: null, selected_thumbnail: 'https://x/azul.jpg', is_active: true,
            },
          ],
          color_swatches: [
            { color_name: 'Azul', color_hex: '#0000ff', image_url: 'https://x/b.jpg', stock_quantity: 10 },
          ],
          categories: { id: 'c1', name: 'Canecas', slug: 'canecas', parent_id: null },
          tags: ['promo'],
        })}
        open
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
      />
    );
    await audit(scanBody(), 'ProductDetailDialog');
  });

  it('SendProductDialog não tem violações sérias', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SendProductDialog product={product()} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );
    await audit(scanBody(), 'SendProductDialog');
  });

  it('ContactSelectionStep não tem violações sérias', async () => {
    // Renderizado como o `SendProductDialog` faz: dentro do `DialogContent`
    // (role="dialog"), que é o container real do passo em produção.
    render(
      <Dialog open>
        <DialogContent>
          <ContactSelectionStep {...contactStepProps} />
        </DialogContent>
      </Dialog>
    );
    await audit(scanBody(), 'ContactSelectionStep');
  });
});

/**
 * Controle vermelho-antes do CT-67. Um `<button>` sem nome acessível viola a
 * regra `button-name` do axe: o matcher TEM que reprovar (por isso o `.not`).
 * Sem o matcher registrado no `setup.ts` este caso explode com "not a
 * function"; com um matcher no-op o `.not` falha. Nos dois casos o teste
 * quebra — logo, ele mede o matcher, não o decora.
 */
describe('CT-67 — controle: o matcher detecta violação real (button-name)', () => {
  it('um botão sem nome acessível CONTÉM violação (matcher não é decorativo)', async () => {
    const { container } = render(<button type="button" />);
    const results = await axe(container);

    // Prova que o axe rodou de verdade e achou exatamente button-name.
    expect(ids(results.violations)).toContain('button-name');
    expect(results).not.toHaveNoViolations();
  });
});
