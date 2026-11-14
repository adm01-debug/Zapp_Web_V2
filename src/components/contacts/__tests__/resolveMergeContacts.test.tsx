import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveMergeContacts, useResolvedMergeContacts } from '../resolveMergeContacts';

interface Fixture { id: string; name: string }

function contact(id: string, name: string): Fixture {
  return { id, name };
}

const getByIds = vi.hoisted(() => vi.fn());
vi.mock('@/services/contact.service', () => ({ ContactService: { getByIds } }));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('resolveMergeContacts', () => {
  it('resolve os 2 selecionados quando ambos estão na lista atual', () => {
    const atual = [contact('a', 'Ana'), contact('b', 'Bia'), contact('c', 'Caio')];
    const resultado = resolveMergeContacts(['a', 'b'], atual, []);
    expect(resultado.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('completa com os contatos buscados (faltantes) um id que saiu da lista atual', () => {
    const atual = [contact('a', 'Ana')]; // 'b' não está mais aqui
    const faltantes = [contact('b', 'Bia')]; // devolvido pelo banco via getByIds
    const resultado = resolveMergeContacts(['a', 'b'], atual, faltantes);
    expect(resultado.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('ignora selecionado sem dado nem na lista atual nem nos faltantes', () => {
    const resultado = resolveMergeContacts(['a', 'desconhecido'], [contact('a', 'Ana')], []);
    expect(resultado.map((c) => c.id)).toEqual(['a']);
  });

  it('prioriza o dado da lista atual sobre os faltantes quando o id está nos dois', () => {
    const atual = [contact('a', 'Ana Atualizada')];
    const faltantes = [contact('a', 'Ana Antiga')];
    const resultado = resolveMergeContacts(['a'], atual, faltantes);
    expect(resultado[0].name).toBe('Ana Atualizada');
  });
});

describe('regressão do bug (ContactsView.tsx antes do patch)', () => {
  it('a fórmula antiga (filtrar a lista atual) perdia o selecionado de outra página — a nova resolve pelo ID', () => {
    const paginaAtual = [contact('a', 'Ana')]; // 'b' foi selecionado numa página/filtro anterior
    const selectedIds = ['a', 'b'];
    const faltantes = [contact('b', 'Bia')];

    // Código antigo: `filteredContacts.filter(c => selectedIds.includes(c.id))`.
    // Com os 2 selecionados vindos de páginas diferentes, sobra só 1 — o
    // ContactMergeDialog exige `contacts.length >= 2` e não renderiza nada.
    const formulaAntiga = paginaAtual.filter((c) => selectedIds.includes(c.id));
    expect(formulaAntiga).toHaveLength(1);

    // Patch: resolve pelo ID, completando com o que o banco devolveu.
    const resultado = resolveMergeContacts(selectedIds, paginaAtual, faltantes);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('useResolvedMergeContacts', () => {
  beforeEach(() => {
    getByIds.mockReset();
    getByIds.mockResolvedValue({ data: [], error: null });
  });

  it('não busca no banco quando os 2 selecionados já estão na lista atual', async () => {
    const atual = [contact('a', 'Ana'), contact('b', 'Bia')];
    const { result } = renderHook(
      () => useResolvedMergeContacts(true, ['a', 'b'], atual),
      { wrapper },
    );
    expect(result.current.map((c) => c.id)).toEqual(['a', 'b']);
    expect(getByIds).not.toHaveBeenCalled();
  });

  it('busca pelo ID e resolve o selecionado que saiu da página/filtro atual', async () => {
    getByIds.mockResolvedValue({ data: [contact('b', 'Bia')], error: null });
    const atual = [contact('a', 'Ana')]; // 'b' não está mais na lista atual
    const { result } = renderHook(
      () => useResolvedMergeContacts(true, ['a', 'b'], atual),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((c) => c.id)).toEqual(['a', 'b']);
    expect(getByIds).toHaveBeenCalledWith(['b']);
  });

  it('não busca enquanto o diálogo está fechado', () => {
    const atual = [contact('a', 'Ana')];
    renderHook(() => useResolvedMergeContacts(false, ['a', 'b'], atual), { wrapper });
    expect(getByIds).not.toHaveBeenCalled();
  });
});
