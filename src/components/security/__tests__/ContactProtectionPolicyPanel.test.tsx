/**
 * Painel da política de proteção de contatos.
 *
 * O sujeito é o componente REAL; o dublê é o contrato de dados. Regras provadas: os estados de
 * carregamento e erro, o que está valendo para quem está logado (inclusive a origem), editar o
 * padrão do sistema, criar a exceção de um papel a partir do que ele herda, remover a exceção e
 * "Restaurar padrão".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  policies: [] as unknown[],
  minha: null as unknown,
  carregando: false,
  erro: false,
  refetch: null as unknown,
  salvar: null as unknown,
  remover: null as unknown,
}));

vi.mock('@/hooks/security/useContactProtectionPolicy', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/hooks/security/useContactProtectionPolicy')>();
  return {
    ...real,
    useContactProtectionPolicies: () => ({
      policies: h.policies,
      isLoading: h.carregando,
      isError: h.erro,
      isFetching: false,
      refetch: h.refetch,
    }),
    useMyContactProtectionPolicy: () => ({
      policy: h.minha,
      isLoading: false,
      isError: false,
    }),
    useSaveContactProtectionPolicy: () => ({ mutate: h.salvar, isPending: false }),
    useDeleteContactProtectionPolicy: () => ({ mutate: h.remover, isPending: false }),
  };
});

import { ContactProtectionPolicyPanel } from '../ContactProtectionPolicyPanel';

const policy = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  scopeRole: null,
  bloquearCopia: true,
  bloquearImpressao: true,
  marcaDagua: true,
  mascararContato: true,
  limiteFichasHora: 100,
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  h.policies = [policy()];
  h.minha = {
    bloquearCopia: true,
    bloquearImpressao: true,
    marcaDagua: true,
    mascararContato: true,
    limiteFichasHora: 100,
    origem: 'global',
  };
  h.carregando = false;
  h.erro = false;
  h.refetch = vi.fn();
  h.salvar = vi.fn();
  h.remover = vi.fn();
});

describe('ContactProtectionPolicyPanel', () => {
  it('mostra esqueleto enquanto lê as regras', () => {
    h.carregando = true;
    render(<ContactProtectionPolicyPanel />);
    expect(screen.getByTestId('protecao-carregando')).toBeTruthy();
  });

  it('mostra o erro de leitura e deixa tentar de novo', () => {
    h.erro = true;
    render(<ContactProtectionPolicyPanel />);
    expect(screen.getByTestId('protecao-erro')).toBeTruthy();
    fireEvent.click(screen.getByText('Tentar de novo'));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('diz de onde vem a política que está valendo', () => {
    h.minha = { ...(h.minha as object), origem: 'papel', limiteFichasHora: 5 };
    render(<ContactProtectionPolicyPanel />);

    const efetiva = within(screen.getByTestId('protecao-efetiva'));
    expect(efetiva.getByText('regra do seu papel')).toBeTruthy();
    const resumo = screen.getByTestId('protecao-efetiva-resumo').textContent ?? '';
    expect(resumo).toContain('Mascarar contato: ligado');
    expect(resumo).toContain('5 fichas/hora');
  });

  it('salva o padrão do sistema com o que foi mexido', () => {
    render(<ContactProtectionPolicyPanel />);

    fireEvent.click(screen.getByTestId('protecao-bloquearCopia-global'));
    fireEvent.change(screen.getByTestId('protecao-limite-global'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByTestId('protecao-salvar-global'));

    expect(h.salvar).toHaveBeenCalledTimes(1);
    expect(h.salvar).toHaveBeenCalledWith({
      id: 'pol-1',
      scopeRole: null,
      valores: { ...policy(), id: undefined, scopeRole: undefined, updatedAt: undefined, bloquearCopia: false, limiteFichasHora: 30 },
    });
  });

  it('papel sem regra herda o padrão e cria a própria a partir dele', () => {
    render(<ContactProtectionPolicyPanel />);

    const escopoAgente = within(screen.getByTestId('protecao-escopo-agent'));
    expect(escopoAgente.getByText('usando o padrão do sistema')).toBeTruthy();

    fireEvent.click(screen.getByTestId('protecao-definir-agent'));
    expect(screen.getByTestId('protecao-mascararContato-agent')).toBeTruthy();

    fireEvent.click(screen.getByTestId('protecao-salvar-agent'));
    expect(h.salvar).toHaveBeenCalledWith({
      id: null,
      scopeRole: 'agent',
      valores: {
        bloquearCopia: true,
        bloquearImpressao: true,
        marcaDagua: true,
        mascararContato: true,
        limiteFichasHora: 100,
      },
    });
  });

  it('remove a exceção do papel pelo id da regra', () => {
    h.policies = [policy(), policy({ id: 'pol-4', scopeRole: 'supervisor', marcaDagua: false })];
    render(<ContactProtectionPolicyPanel />);

    fireEvent.click(screen.getByTestId('protecao-remover-supervisor'));
    expect(h.remover).toHaveBeenCalledWith('pol-4');
  });

  it('"Restaurar padrão" volta tudo ligado e 100 fichas', () => {
    h.policies = [policy({ bloquearCopia: false, marcaDagua: false, limiteFichasHora: 3 })];
    render(<ContactProtectionPolicyPanel />);

    fireEvent.click(screen.getByTestId('protecao-restaurar-global'));
    fireEvent.click(screen.getByTestId('protecao-salvar-global'));

    expect(h.salvar).toHaveBeenCalledWith({
      id: 'pol-1',
      scopeRole: null,
      valores: {
        bloquearCopia: true,
        bloquearImpressao: true,
        marcaDagua: true,
        mascararContato: true,
        limiteFichasHora: 100,
      },
    });
  });
});
