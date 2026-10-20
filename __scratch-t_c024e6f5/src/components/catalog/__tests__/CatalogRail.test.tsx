import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CatalogRail, CATALOG_RAIL_COPY, CATALOG_RAIL_TIPS, daysSince } from '../CatalogRail';
import { exportCatalogCsv, PROMOGIFTS_BASE_URL } from '../catalogExport';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import type { CatalogSendEventRow } from '@/hooks/integrations/useCatalogRecentSends';

// CT-21: o clique em "Exportar catálogo" tem de chamar o builder do CT-20.
// Mock parcial: só a orquestração (que fala com a edge) é substituída — os
// builders puros e as constantes continuam os reais.
vi.mock('../catalogExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogExport')>();
  return {
    ...actual,
    exportCatalogCsv: vi.fn(async () => ({ ok: true, rows: 1, filename: 'catalogo_todos_20261001.csv', downloaded: true })),
  };
});

// recharts nao desenha em jsdom (ResponsiveContainer mede 0x0), entao os
// testes do grafico cobrem o que e observavel: titulo, delta e skeleton.
const mockStats = (o: Partial<CatalogStats> = {}): CatalogStats => ({
  total: 7576, in_stock: 6040, featured: 2147, new_30d: 252, bestseller: 596,
  kits: 978, low_stock: 308, categories_root: 27, suppliers_active: 4,
  last_sync_at: '2026-09-22T15:40:00Z', last_update_at: '2026-09-22T10:20:00Z',
  by_month: [
    { month: '2026-07', count: 100 },
    { month: '2026-08', count: 150 },
    { month: '2026-09', count: 180 },
  ],
  ...o,
});

describe('CatalogRail — E51 banner', () => {
  it('renderiza a copy do banner e nao inclui o placeholder do mock', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText(CATALOG_RAIL_COPY.bannerTitle)).toBeInTheDocument();
    expect(screen.queryByText(/SUA MARCA AQUI/i)).not.toBeInTheDocument();
  });

  it('usa o 1o produto em destaque COM imagem (ignora destaque sem foto)', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        products={[
          { id: 'a', name: 'Sem foto', is_featured: true },
          { id: 'b', name: 'Caneta Bambu', is_featured: true, image_url: 'https://x/c.jpg' },
        ]}
      />,
    );
    expect(screen.getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.queryByText('Sem foto')).not.toBeInTheDocument();
  });

  it('le a foto de primary_image_url (campo canonico do ExternalProduct)', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        products={[{ id: 'b', name: 'Squeeze Inox', is_featured: true, primary_image_url: 'https://x/s.jpg' }]}
      />,
    );
    expect(screen.getByText('Squeeze Inox')).toBeInTheDocument();
  });

  it('sem produto em destaque nao inventa imagem', () => {
    render(<CatalogRail stats={mockStats()} products={[{ id: 'a', name: 'Comum', image_url: 'https://x/a.jpg' }]} />);
    expect(screen.queryByText('Comum')).not.toBeInTheDocument();
  });

  it('CTA do banner aplica o filtro de novidades', () => {
    const onApplyFilter = vi.fn();
    render(<CatalogRail stats={mockStats()} onApplyFilter={onApplyFilter} />);
    fireEvent.click(screen.getByText(`${CATALOG_RAIL_COPY.bannerCta} →`));
    expect(onApplyFilter).toHaveBeenCalledWith('new_30d');
  });
});

describe('CatalogRail — E52 grafico mensal', () => {
  it('mostra o delta quando o mes anterior tem base > 0', () => {
    render(<CatalogRail stats={mockStats()} />);
    // 150 -> 180 = +20%
    expect(screen.getByText('+20%')).toBeInTheDocument();
  });

  it('omite o delta quando o mes anterior e zero (evita +Infinity%)', () => {
    render(<CatalogRail stats={mockStats({ by_month: [{ month: '2026-08', count: 0 }, { month: '2026-09', count: 42 }] })} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('sem by_month o card do grafico nao renderiza', () => {
    render(<CatalogRail stats={mockStats({ by_month: [] })} />);
    expect(screen.queryByText('Resumo do catálogo')).not.toBeInTheDocument();
  });
});

describe('CatalogRail — E53 contagens', () => {
  it('mostra os 4 valores reais de catalog_stats', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText('6.040')).toBeInTheDocument();
    expect(screen.getByText('2.147')).toBeInTheDocument();
    expect(screen.getByText('252')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('linha com filtro real e clicavel e aplica o filtro', () => {
    const onApplyFilter = vi.fn();
    render(<CatalogRail stats={mockStats()} onApplyFilter={onApplyFilter} />);
    fireEvent.click(screen.getByText('Produtos em estoque'));
    expect(onApplyFilter).toHaveBeenCalledWith('in_stock');
  });

  it('"Fornecedores ativos" nao e botao (e contagem, nao filtro)', () => {
    render(<CatalogRail stats={mockStats()} onApplyFilter={vi.fn()} />);
    expect(screen.getByText('Fornecedores ativos').closest('button')).toBeNull();
  });

  it('loading mostra skeleton e nenhum valor', () => {
    render(<CatalogRail loading />);
    expect(screen.queryByText('6.040')).not.toBeInTheDocument();
  });
});

describe('CatalogRail — E56 enviados recentemente / mais enviados', () => {
  // Derivado de CatalogSendEventRow de proposito: campo novo no tipo passa
  // a aparecer aqui como erro de compilacao, nao como fixture silenciosamente
  // desatualizado.
  const ev = (o: Partial<CatalogSendEventRow> = {}): CatalogSendEventRow => ({
    id: 'e1', product_id: 'p1', product_name: 'Caneta Bambu', product_sku: 'CB-1',
    status: 'sent', created_at: new Date().toISOString(),
    contact_id: 'c1', contact_name: 'Maria Souza', ...o,
  });

  it('sem eventos a secao inteira fica oculta', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[]} topSent={[]} />);
    expect(screen.queryByText('Enviados recentemente')).not.toBeInTheDocument();
    expect(screen.queryByText('Mais enviados')).not.toBeInTheDocument();
  });

  it('lista os envios recentes com o status traduzido', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        recentSends={[
          ev({ id: 'e1', product_name: 'Caneta Bambu', status: 'sent' }),
          ev({ id: 'e2', product_id: 'p2', product_name: 'Squeeze Inox', status: 'failed' }),
          ev({ id: 'e3', product_id: 'p3', product_name: 'Mochila Preta', status: 'partial' }),
        ]}
      />,
    );
    expect(screen.getByText('Enviados recentemente')).toBeInTheDocument();
    expect(screen.getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.getByText(/Falhou/)).toBeInTheDocument();
    expect(screen.getByText(/Parcial/)).toBeInTheDocument();
  });

  it('mostra o destinatario na legenda do envio', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ contact_name: 'Joana Prado' })]} />);
    expect(screen.getByText(/Joana Prado/)).toBeInTheDocument();
  });

  it('sem nome de contato a legenda nao quebra nem mostra separador solto', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ contact_name: null })]} />);
    // Ancorado: /Enviado/ solto casaria tambem com o titulo do card
    // ("Enviados recentemente") e daria multiplos elementos.
    const legenda = screen.getByText(/^Enviado ·/);
    expect(legenda).toBeInTheDocument();
    expect(legenda.textContent?.trim().endsWith('·')).toBe(false);
  });

  it('clicar num envio recente reabre o produto pelo id', () => {
    const onOpenProduct = vi.fn();
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ product_id: 'p-42' })]} onOpenProduct={onOpenProduct} />);
    fireEvent.click(screen.getByText('Caneta Bambu'));
    expect(onOpenProduct).toHaveBeenCalledWith('p-42');
  });

  it('"Mais enviados" mostra a contagem e so aparece com recentes', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        recentSends={[ev()]}
        topSent={[{ product_id: 'p1', product_name: 'Caneta Bambu', count: 12 }]}
      />,
    );
    expect(screen.getByText('Mais enviados')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('CatalogRail — CT-21 acoes rapidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra as duas acoes rapidas (Exportar catalogo e Gerenciar no PromoGifts)', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText('Ações rápidas')).toBeInTheDocument();
    expect(screen.getByText('Exportar catálogo')).toBeInTheDocument();
    expect(screen.getByText('Gerenciar no PromoGifts')).toBeInTheDocument();
  });

  it('nao tem link morto (href="#")', () => {
    const { container } = render(<CatalogRail stats={mockStats()} />);
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });

  it('Exportar catalogo chama o builder do CT-20 com o catalogo inteiro quando o pai nao passa o filtro', async () => {
    render(<CatalogRail stats={mockStats()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Exportar catálogo'));
    });
    expect(exportCatalogCsv).toHaveBeenCalledWith({ filterKey: 'todos', filters: {} });
  });

  it('Exportar catalogo usa o filtro atual quando recebe exportFilter', async () => {
    render(<CatalogRail stats={mockStats()} exportFilter="in_stock" />);
    await act(async () => {
      fireEvent.click(screen.getByText('Exportar catálogo'));
    });
    expect(exportCatalogCsv).toHaveBeenCalledWith({ filterKey: 'in_stock', filters: { only_in_stock: true } });
  });

  it('R2-MOD-041: exportFilter e exportFilters SOMAM (o filtro da listagem nao some)', async () => {
    render(
      <CatalogRail
        stats={mockStats()}
        exportFilter="in_stock"
        exportFilters={{ search: 'caneta', category_id: 'cat1' }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Exportar catálogo'));
    });
    expect(exportCatalogCsv).toHaveBeenCalledWith({
      filterKey: 'in_stock',
      filters: { only_in_stock: true, search: 'caneta', category_id: 'cat1' },
    });
  });

  it('Gerenciar no PromoGifts abre a URL publica em nova aba', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<CatalogRail stats={mockStats()} />);
    fireEvent.click(screen.getByText('Gerenciar no PromoGifts'));
    expect(openSpy).toHaveBeenCalledWith(PROMOGIFTS_BASE_URL, '_blank', 'noopener,noreferrer');
  });

  it('"Importar planilha" e "Gerenciar categorias" NAO entram (sem URL publica confirmada)', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.queryByText('Importar planilha')).not.toBeInTheDocument();
    expect(screen.queryByText('Gerenciar categorias')).not.toBeInTheDocument();
  });
});

describe('CatalogRail — CT-23 alertas', () => {
  // 2026-09-22T15:40Z -> 2026-10-01T16:00Z = 9 dias inteiros.
  const FIXED_NOW = new Date('2026-10-01T16:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('last_sync_at com mais de 3 dias mostra o alerta de sync com a contagem', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText(/PromoGifts sem sincronizar há 9 dias/)).toBeInTheDocument();
  });

  it('sincronizado ha 1 dia nao mostra alerta de sync', () => {
    render(<CatalogRail stats={mockStats({ last_sync_at: '2026-09-30T16:00:00Z' })} />);
    expect(screen.queryByText(/sem sincronizar/)).not.toBeInTheDocument();
  });

  it('sem last_sync_at nao inventa alerta (dado ausente != problema)', () => {
    render(<CatalogRail stats={mockStats({ last_sync_at: null })} />);
    expect(screen.queryByText(/sem sincronizar/)).not.toBeInTheDocument();
  });

  it('mostra os produtos com estoque baixo vindos de catalog_stats', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText(/308 produtos com estoque baixo/)).toBeInTheDocument();
  });

  it('low_stock = 0 nao mostra o alerta de estoque', () => {
    render(<CatalogRail stats={mockStats({ low_stock: 0 })} />);
    expect(screen.queryByText(/estoque baixo \(até/)).not.toBeInTheDocument();
  });

  it('sem dados (loading) nao mostra alerta nenhum', () => {
    render(<CatalogRail loading />);
    expect(screen.queryByText(/sem sincronizar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/estoque baixo \(até/)).not.toBeInTheDocument();
  });

  it('alerta de estoque SEM callback aparece sem botao de filtro (nada morto)', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.queryByText('Ver produtos com estoque baixo')).not.toBeInTheDocument();
    // O controle de dispensa continua (é o que fecha o ciclo do "ocultável").
    expect(screen.getByLabelText('Ocultar alerta de estoque baixo')).toBeInTheDocument();
  });

  it('com onApplyLowStock o alerta de estoque vira filtro clicavel', () => {
    const onApplyLowStock = vi.fn();
    render(<CatalogRail stats={mockStats()} onApplyLowStock={onApplyLowStock} />);
    fireEvent.click(screen.getByText('Ver produtos com estoque baixo'));
    expect(onApplyLowStock).toHaveBeenCalledTimes(1);
  });

  it('Ocultar dispensa o alerta de sync pela sessao (sobrevive ao remount)', () => {
    const { unmount } = render(<CatalogRail stats={mockStats()} />);
    fireEvent.click(screen.getByLabelText('Ocultar alerta de sincronização'));
    expect(screen.queryByText(/sem sincronizar/)).not.toBeInTheDocument();

    unmount();
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.queryByText(/sem sincronizar/)).not.toBeInTheDocument();
    // A dispensa e por alerta: o de estoque continua.
    expect(screen.getByText(/308 produtos com estoque baixo/)).toBeInTheDocument();
  });

  it('Ocultar dispensa so o alerta de estoque, sem levar o de sync junto', () => {
    render(<CatalogRail stats={mockStats()} />);
    fireEvent.click(screen.getByLabelText('Ocultar alerta de estoque baixo'));
    expect(screen.queryByText(/estoque baixo \(até/)).not.toBeInTheDocument();
    expect(screen.getByText(/PromoGifts sem sincronizar há 9 dias/)).toBeInTheDocument();
  });
});

describe('CatalogRail — daysSince (helper puro do alerta)', () => {
  const now = new Date('2026-10-01T16:00:00Z').getTime();

  it('conta dias inteiros', () => {
    expect(daysSince('2026-09-22T15:40:00Z', now)).toBe(9);
    expect(daysSince('2026-09-30T16:00:00Z', now)).toBe(1);
  });

  it('instante futuro da negativo (nao dispara alerta)', () => {
    expect(daysSince('2026-10-05T16:00:00Z', now)).toBeLessThan(0);
  });

  it('ausente ou invalido vira null', () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(undefined, now)).toBeNull();
    expect(daysSince('nao-e-data', now)).toBeNull();
  });
});

describe('CatalogRail — CT-24 dica do dia', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderAt = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    return render(<CatalogRail stats={mockStats()} />);
  };

  it('roda as 5 dicas pelo dia do mes (getDate() % 5)', () => {
    expect(CATALOG_RAIL_TIPS).toHaveLength(5);
    const day = new Date('2026-10-03T12:00:00Z');
    renderAt('2026-10-03T12:00:00Z');
    const idx = day.getDate() % CATALOG_RAIL_TIPS.length;
    expect(screen.getByText('Dica do dia')).toBeInTheDocument();
    expect(screen.getByText(CATALOG_RAIL_TIPS[idx])).toBeInTheDocument();
    expect(idx).toBe(3);
  });

  it('muda de dica no dia seguinte (rotacao real, nao lista fixa)', () => {
    const dia3 = new Date('2026-10-03T12:00:00Z').getDate() % 5;
    const dia4 = new Date('2026-10-04T12:00:00Z').getDate() % 5;
    expect(dia3).not.toBe(dia4);

    renderAt('2026-10-03T12:00:00Z');
    expect(screen.getByText(CATALOG_RAIL_TIPS[dia3])).toBeInTheDocument();
    expect(screen.queryByText(CATALOG_RAIL_TIPS[dia4])).not.toBeInTheDocument();
  });
});
