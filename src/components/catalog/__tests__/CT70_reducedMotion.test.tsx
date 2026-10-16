/**
 * CT-70 — `useReducedMotion` em todo componente animado do módulo.
 *
 * Aceite do plano: "cada arquivo com `framer-motion` importa `useReducedMotion`".
 * São duas provas:
 *  1. contrato de fonte — varre src/components/catalog/*.tsx e falha se algum
 *     arquivo que importa de `framer-motion` não usar o hook;
 *  2. comportamento — monta o catálogo com `prefers-reduced-motion: reduce`
 *     ligado (via o singleton que o próprio framer-motion lê, em `motion-dom`)
 *     e confere que a entrada animada dos cards some, renderizando o estado
 *     final. Sem a flag, o contrário: a entrada animada volta.
 */
import { toastError } from './catalogMocks';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCatalog } from '../ExternalProductCatalog';
import { WhatsAppTemplatesManager } from '../WhatsAppTemplatesManager';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

// ── controle do "reduzir movimento" ──────────────────────────────────────
// `useReducedMotion` do framer-motion lê `prefersReducedMotion.current`, um
// singleton inicializado uma única vez — trocar o matchMedia no meio do arquivo
// não funciona. Aqui só o hook é substituído (o resto do framer-motion segue
// real, então as asserções são sobre o DOM que ele de fato produz).
const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const mockCatalog = vi.hoisted(() => vi.fn());
const mockFavorites = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/integrations/useExternalCatalog', () => ({
  useExternalCatalog: (...args: unknown[]) => mockCatalog(...args),
  useCatalogFavorites: (...args: unknown[]) => mockFavorites(...args),
  useExternalProduct: () => ({ data: null, isFetching: false }),
}));

vi.mock('../CatalogProductCard', () => ({
  CatalogProductCard: ({ product }: { product: ExternalProduct }) => (
    <div data-testid={`card-${product.id}`}>{product.name}</div>
  ),
  CatalogProductCardSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('../SendProductDialog', () => ({
  SendProductDialog: () => <div data-testid="send-dialog" />,
}));

const mockTemplates = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useWhatsAppTemplates', () => ({
  useWhatsAppTemplates: () => mockTemplates(),
  TEMPLATE_CATEGORIES: [{ value: 'marketing', label: 'Marketing' }],
  TEMPLATE_LANGUAGES: [{ value: 'pt_BR', label: 'Português' }],
  STATUS_BADGES: { draft: { label: 'Rascunho', className: '', iconName: 'FileText' } },
  EMPTY_TEMPLATE: {},
}));

const product = (id: string, name: string): ExternalProduct =>
  ({ id, name, sku: `SKU-${id}`, sale_price: 10, stock_quantity: 5, variants: [] } as unknown as ExternalProduct);

const renderCatalog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExternalProductCatalog open onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
};

/** Envolucra o card no `<motion.div>` da grade — é nele que vive a entrada animada. */
const cardWrapper = (id: string) => screen.getByTestId(`card-${id}`).parentElement as HTMLElement;

beforeEach(() => {
  reduceMotion.value = false;
  mockCatalog.mockReset();
  mockFavorites.mockReset();
  toastError.mockReset();
  mockCatalog.mockReturnValue({
    products: [product('p1', 'Caneta Bambu'), product('p2', 'Squeeze Aço')],
    totalProducts: 2,
    categories: [],
    suppliers: [],
    loading: false,
    error: null,
    errorCode: null,
    errorStatus: null,
    fetchProducts: vi.fn(),
    fetchCategories: vi.fn(),
    fetchSuppliers: vi.fn(),
  });
  mockFavorites.mockReturnValue({
    favorites: [],
    favoriteIds: new Set<string>(),
    isFavorite: () => false,
    isLoading: false,
    toggle: vi.fn(),
  });
});

describe('CT-70 — contrato de fonte', () => {
  const catalogDir = path.resolve(__dirname, '..');

  const arquivosDoModulo = readdirSync(catalogDir)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .filter((f) => !f.includes('.test.'));

  const fonte = (f: string) => readFileSync(path.join(catalogDir, f), 'utf8');
  const usaFramer = (f: string) => /\bfrom\s+'framer-motion'/.test(fonte(f));

  it('todo arquivo que importa framer-motion também importa useReducedMotion', () => {
    const comFramer = arquivosDoModulo.filter(usaFramer);
    // o módulo tem componentes animados de verdade; se a varredura achar zero, o
    // filtro quebrou e o teste estaria passando vazio.
    expect(comFramer.length).toBeGreaterThan(0);

    const semHook = comFramer.filter((f) => {
      const src = fonte(f);
      const importLine = src.match(/import\s*\{[^}]*\}\s*from\s*'framer-motion'/)?.[0] ?? '';
      return !importLine.includes('useReducedMotion');
    });

    expect(semHook).toEqual([]);
  });

  it('os arquivos animados realmente chamam o hook (não só importam)', () => {
    const semChamada = arquivosDoModulo
      .filter(usaFramer)
      .filter((f) => !/=\s*useReducedMotion\(\)/.test(fonte(f)));

    expect(semChamada).toEqual([]);
  });
});

describe('CT-70 — comportamento com prefers-reduced-motion: reduce', () => {
  it('sem redução, os cards entram animando (opacidade 0 no primeiro paint)', () => {
    reduceMotion.value = false;
    renderCatalog();

    expect(cardWrapper('p1').style.opacity).toBe('0');
  });

  it('com redução, os cards já nascem no estado final (sem opacidade inicial)', () => {
    reduceMotion.value = true;
    renderCatalog();

    const wrapper = cardWrapper('p1');
    expect(wrapper.style.opacity).not.toBe('0');
    expect(wrapper.style.transform).not.toContain('scale');
    // o card continua na tela — só a animação foi pulada
    expect(screen.getByText('Caneta Bambu')).toBeInTheDocument();
  });
});

describe('CT-70 — WhatsAppTemplatesManager (motion.tr)', () => {
  const template = {
    id: 't1',
    name: 'Boas-vindas',
    content: 'Olá {{nome}}',
    category: 'marketing',
    language: 'pt_BR',
    status: 'draft',
    variables: ['nome'],
  };

  const renderTemplates = () =>
    render(<WhatsAppTemplatesManager />);

  it('sem redução, a linha da tabela entra com fade (opacidade 0 no 1º paint)', () => {
    reduceMotion.value = false;
    mockTemplates.mockReturnValue({ templates: [template], loading: false, search: '', setSearch: vi.fn(), filterCategory: 'all', setFilterCategory: vi.fn(), filterStatus: 'all', setFilterStatus: vi.fn(), isDialogOpen: false, setIsDialogOpen: vi.fn(), isPreviewOpen: false, setIsPreviewOpen: vi.fn(), editingTemplate: { id: null }, setEditingTemplate: vi.fn(), previewTemplate: null, previewVariables: {}, setPreviewVariables: vi.fn(), isSaving: false, handleContentChange: vi.fn(), handleSave: vi.fn(), handleDelete: vi.fn(), handleDuplicate: vi.fn(), handlePreview: vi.fn(), renderPreviewContent: () => null, openNew: vi.fn(), openEdit: vi.fn() });
    const { container } = renderTemplates();

    const linha = container.querySelector('tbody tr') as HTMLTableRowElement;
    expect(linha).not.toBeNull();
    expect(linha.style.opacity).toBe('0');
  });

  it('com redução, a linha já nasce visível (sem fade de entrada)', () => {
    reduceMotion.value = true;
    mockTemplates.mockReturnValue({ templates: [template], loading: false, search: '', setSearch: vi.fn(), filterCategory: 'all', setFilterCategory: vi.fn(), filterStatus: 'all', setFilterStatus: vi.fn(), isDialogOpen: false, setIsDialogOpen: vi.fn(), isPreviewOpen: false, setIsPreviewOpen: vi.fn(), editingTemplate: { id: null }, setEditingTemplate: vi.fn(), previewTemplate: null, previewVariables: {}, setPreviewVariables: vi.fn(), isSaving: false, handleContentChange: vi.fn(), handleSave: vi.fn(), handleDelete: vi.fn(), handleDuplicate: vi.fn(), handlePreview: vi.fn(), renderPreviewContent: () => null, openNew: vi.fn(), openEdit: vi.fn() });
    const { container } = renderTemplates();

    const linha = container.querySelector('tbody tr') as HTMLTableRowElement;
    expect(linha).not.toBeNull();
    expect(linha.style.opacity).not.toBe('0');
    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
  });
});
