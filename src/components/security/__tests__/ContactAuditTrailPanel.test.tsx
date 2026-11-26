/**
 * Painel da trilha de contatos.
 *
 * O sujeito é o componente REAL; o dublê é o hook de dados. Regras provadas: os quatro estados
 * (carregando/erro/vazio/lista), o texto de vazio próprio de cada trilha, o autor degradado quando
 * o perfil não existe, os filtros chegando ao hook (operação, período, aba, busca), a paginação por
 * "Carregar mais" e a limpeza da busca.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  recebidos: [] as Array<Record<string, unknown>>,
  retorno: {} as Record<string, unknown>,
  refetch: null as unknown,
  carregarMais: null as unknown,
}));

vi.mock('@/hooks/security/useContactAuditTrail', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/hooks/security/useContactAuditTrail')>();
  return {
    ...real,
    useContactAuditTrail: (filtros: Record<string, unknown>) => {
      h.recebidos.push(filtros);
      return { ...h.retorno, refetch: h.refetch, carregarMais: h.carregarMais };
    },
  };
});

import { ContactAuditTrailPanel } from '../ContactAuditTrailPanel';

const evento = (over: Record<string, unknown> = {}) => ({
  id: '1',
  contactId: 'c-1',
  operation: 'delete',
  markerFrom: null,
  markerTo: '2026-11-20T10:00:00.000Z',
  performedAt: '2026-11-20T10:00:00.000Z',
  performedBy: 'u-abc12345',
  performedByProfile: null,
  performedByDbRole: 'authenticated',
  contact: { id: 'c-1', name: 'Maria Souza', phone: null, deletedAt: null, blockedAt: null },
  authorName: null,
  ...over,
});

beforeEach(() => {
  h.recebidos = [];
  h.refetch = vi.fn();
  h.carregarMais = vi.fn();
  h.retorno = {
    eventos: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    hasMore: false,
    carregandoMais: false,
  };
});

describe('ContactAuditTrailPanel', () => {
  it('mostra esqueleto enquanto carrega', () => {
    h.retorno.isLoading = true;
    render(<ContactAuditTrailPanel />);
    expect(screen.getByTestId('trilha-carregando')).toBeTruthy();
  });

  it('mostra o erro de leitura e deixa tentar de novo', () => {
    h.retorno.isError = true;
    render(<ContactAuditTrailPanel />);
    expect(screen.getByTestId('trilha-erro')).toBeTruthy();
    fireEvent.click(screen.getByText('Tentar de novo'));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('vazio de exclusões pede para ampliar o período', () => {
    render(<ContactAuditTrailPanel />);
    expect(screen.getByTestId('trilha-vazio')).toBeTruthy();
    expect(screen.getByText('Nenhuma exclusão no período escolhido')).toBeTruthy();
  });

  it('lista evento com contato, operação e autor degradado', () => {
    h.retorno.eventos = [evento()];
    render(<ContactAuditTrailPanel />);

    const linha = within(screen.getByTestId('trilha-evento-1'));
    expect(linha.getByText('Excluído')).toBeTruthy();
    expect(linha.getByText('Maria Souza')).toBeTruthy();
    expect(linha.getByText('authenticated · u-abc123')).toBeTruthy();
    expect(screen.getByTestId('trilha-total').textContent).toContain('1 registro');
  });

  it('trocar a aba zera a operação e muda o tipo', () => {
    render(<ContactAuditTrailPanel />);
    fireEvent.mouseDown(screen.getByTestId('trilha-aba-block'));

    const ultimo = h.recebidos[h.recebidos.length - 1];
    expect(ultimo.kind).toBe('block');
    expect(ultimo.operation).toBe('todas');
  });

  it('operação e período escolhidos chegam ao hook', () => {
    render(<ContactAuditTrailPanel />);

    fireEvent.change(screen.getByTestId('trilha-operacao'), { target: { value: 'restore' } });
    expect(h.recebidos[h.recebidos.length - 1].operation).toBe('restore');

    fireEvent.change(screen.getByTestId('trilha-periodo'), { target: { value: '90' } });
    expect(h.recebidos[h.recebidos.length - 1].period).toBe(90);
  });

  it('busca só vai ao servidor depois de pedir, e limpar devolve tudo', () => {
    render(<ContactAuditTrailPanel />);
    const campo = screen.getByTestId('trilha-busca');

    fireEvent.change(campo, { target: { value: '  maria  ' } });
    expect(h.recebidos[h.recebidos.length - 1].search).toBe('');

    fireEvent.click(screen.getByTestId('trilha-buscar'));
    expect(h.recebidos[h.recebidos.length - 1].search).toBe('maria');

    fireEvent.click(screen.getByTestId('trilha-limpar'));
    expect(h.recebidos[h.recebidos.length - 1].search).toBe('');
  });

  it('"Carregar mais" aparece só quando há mais e pede a próxima página', () => {
    h.retorno.eventos = [evento()];
    h.retorno.hasMore = true;
    render(<ContactAuditTrailPanel />);

    fireEvent.click(screen.getByTestId('trilha-carregar-mais'));
    expect(h.carregarMais).toHaveBeenCalledTimes(1);
  });

  it('sem mais páginas não oferece "Carregar mais"', () => {
    h.retorno.eventos = [evento()];
    render(<ContactAuditTrailPanel />);
    expect(screen.queryByTestId('trilha-carregar-mais')).toBeNull();
  });
});
