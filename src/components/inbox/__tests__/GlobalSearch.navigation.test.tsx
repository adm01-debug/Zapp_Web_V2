/**
 * R2-INB-019 — navegação da busca global (GlobalSearch.tsx).
 *
 * Defeito: o `total` das setas era `tagSuggestions.length || results.length`. Com a
 * lista vazia (consulta pendente ou sem resultados) `(p + 1) % 0` deixava
 * `selectedIndex` em `NaN` — o Enter não escolhia mais nada — e as ações rápidas
 * visíveis ("Ações rápidas") ficavam de fora da navegação anunciada no cabeçalho.
 *
 * O teste monta o `GlobalSearch` REAL e dispara os mesmos eventos que o usuário
 * dispara (digitação, setas, Enter, clique). O único módulo trocado é o cliente
 * Supabase — a fonte de dados, não o alvo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlobalSearch } from '../GlobalSearch';

const db = vi.hoisted(() => ({
  messageRows: [] as Record<string, unknown>[],
  messageRowsFiltered: [] as Record<string, unknown>[],
  navigateToView: vi.fn(),
  // Identidade estável: `performSearch` é memoizado por `addToHistory`, e um mock que
  // devolvesse funções novas a cada render re-agendaria a busca sem parar.
  searchHistory: {
    history: [] as unknown[], addToHistory: vi.fn(), removeFromHistory: vi.fn(), clearHistory: vi.fn(),
  },
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: db.navigateToView }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useSearchHistory', () => ({ useSearchHistory: () => db.searchHistory }));

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (isMessages: boolean) => {
    let narrowedByMediaType = false;
    let excludesNulls = false;
    const q: Record<string, unknown> = {};
    // Cadeia do PostgREST: só `eq('message_type', …)` estreita o resultado devolvido e
    // `.not(col, 'is', null)` (busca por transcrição) devolve vazio — os fixtures não têm áudio.
    for (const method of ['select', 'order', 'limit', 'or', 'ilike', 'gte', 'in']) {
      q[method] = () => q;
    }
    q.not = () => { excludesNulls = true; return q; };
    q.eq = (column: string) => {
      if (column === 'message_type') narrowedByMediaType = true;
      return q;
    };
    q.then = (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
      Promise.resolve({
        data: isMessages && !excludesNulls
          ? (narrowedByMediaType ? db.messageRowsFiltered : db.messageRows)
          : [],
        error: null,
      }).then(onOk, onErr);
    return q;
  };
  return { supabase: { from: (table: string) => makeQuery(table === 'messages') } };
});

function messageRow(id: string, content: string) {
  return {
    id, content, message_type: 'text', created_at: '2026-04-08T10:00:00Z',
    contact_id: 'c1', contacts: null,
  };
}

function renderSearch() {
  const onOpenChange = vi.fn();
  const onSelectResult = vi.fn();
  render(<GlobalSearch open onOpenChange={onOpenChange} onSelectResult={onSelectResult} />);
  return { onOpenChange, onSelectResult };
}

const searchInput = () => screen.getByPlaceholderText(/Buscar mensagens/);

/**
 * O botão que abre os filtros é só ícone, sem nome acessível neste cartão (registrado
 * como achado fora do escopo). O clique é no controle real; o localizador usa o ícone.
 */
function openFiltersPanel() {
  const toggle = screen.getAllByRole('button').find((button) => button.querySelector('.lucide-funnel'));
  if (!toggle) throw new Error('botão de filtros não encontrado');
  fireEvent.click(toggle);
}

/** Espera o debounce da consulta (300 ms) e a resposta assíncrona da busca. */
async function settleSearch() {
  await act(async () => { vi.advanceTimersByTime(400); });
  for (let i = 0; i < 5; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe('GlobalSearch — navegação do R2-INB-019', () => {
  beforeEach(() => {
    db.messageRows = [messageRow('m1', 'zz primeiro'), messageRow('m2', 'zz segundo')];
    db.messageRowsFiltered = [messageRow('m1', 'zz primeiro')];
    db.navigateToView.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('percorre e aciona as ações rápidas com o teclado quando não há resultados', () => {
    const { onOpenChange } = renderSearch();

    expect(screen.getByText('Nova conversa')).toBeInTheDocument();
    expect(screen.getByText('Ir para Dashboard')).toBeInTheDocument();

    // Sem resultados o total antigo era 0: as setas não moviam nada (NaN) e o Enter
    // não acionava ação nenhuma. Duas setas para baixo têm de chegar em "Ir para Dashboard".
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(db.navigateToView).toHaveBeenCalledWith('dashboard');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('não corrompe o índice com tecla durante a busca e escolhe o 1º resultado quando ele chega', async () => {
    const { onSelectResult } = renderSearch();

    fireEvent.change(searchInput(), { target: { value: 'zz' } });

    // Consulta pendente: nada renderizado. As setas não podem gerar NaN.
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowUp' });

    await settleSearch();
    expect(screen.getByText('2 resultados')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('normaliza o índice quando a troca de filtro encolhe a lista de resultados', async () => {
    const { onSelectResult } = renderSearch();

    fireEvent.change(searchInput(), { target: { value: 'zz' } });
    await settleSearch();
    expect(screen.getByText('2 resultados')).toBeInTheDocument();

    // Vai para o 2º resultado e então estreita a lista pelo filtro de mídia (Imagens).
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    openFiltersPanel();
    fireEvent.click(screen.getByText('Imagens'));

    await settleSearch();
    expect(screen.getByText('1 resultado')).toBeInTheDocument();

    // O único resultado visível tem de continuar alcançável pelo Enter.
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });
});
