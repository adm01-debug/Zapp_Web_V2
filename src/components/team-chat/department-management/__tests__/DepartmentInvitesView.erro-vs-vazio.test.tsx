import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invites: { data: [] as unknown[], isLoading: false, isError: false },
}));

vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useDepartmentInvites: () => h.invites,
  useCreateDepartmentInvite: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDepartmentInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { DepartmentInvitesView } from '@/components/team-chat/department-management/DepartmentInvitesView';

// Falha de leitura NAO pode se disfarcar de estado vazio.
//
// `useDepartmentInvites` devolve `[]` quando a consulta quebra (o componente usa
// `data: invites = []`), e a tela mostrava "Nenhum convite ativo". Para o admin
// isso e' uma afirmacao FALSA sobre o departamento: ele geraria um codigo novo
// por cima de convites que existem, ou concluiria que ninguem tem convite aberto.
//
// O contrato veio de um teste que outro agente escreveu e nunca foi mergeado
// (preservado em `refs/autosave/stash/6d7cd91aee88`); o formato segue o vizinho
// `TeamPerformancePanel.tsx:22`, que ja resolvia isso na mesma pasta.

function renderizar(props: Partial<{ isAdmin: boolean }> = {}) {
  return render(
    <DepartmentInvitesView
      departmentId="dep-1"
      currentUserName="Fulano"
      isAdmin={props.isAdmin ?? true}
    />,
  );
}

describe('DepartmentInvitesView — erro de leitura não vira "nenhum convite"', () => {
  afterEach(() => {
    h.invites = { data: [], isLoading: false, isError: false };
    vi.clearAllMocks();
  });

  it('erro de leitura aparece como erro, com papel de alerta', () => {
    h.invites = { data: [], isLoading: false, isError: true };
    renderizar();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os convites.');
    expect(screen.queryByText('Nenhum convite ativo')).toBeNull();
  });

  // O admin nao pode receber o botao de gerar codigo enquanto a tela nao sabe o
  // que existe: geraria convite duplicado sem ver os que ja estao la.
  it('com erro, a tela não oferece gerar código', () => {
    h.invites = { data: [], isLoading: false, isError: true };
    renderizar({ isAdmin: true });

    expect(screen.queryByRole('button', { name: /Gerar código/ })).toBeNull();
  });

  it('lista vazia de verdade continua dizendo que não há convite', () => {
    h.invites = { data: [], isLoading: false, isError: false };
    renderizar();

    expect(screen.getByText('Nenhum convite ativo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('carregando não é nem erro nem vazio', () => {
    h.invites = { data: [], isLoading: true, isError: false };
    renderizar();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nenhum convite ativo')).toBeNull();
  });

  it('com convites, a lista aparece e não há alerta', () => {
    h.invites = {
      data: [{
        id: 'inv-1',
        department_id: 'dep-1',
        code: 'ABC123',
        created_by: 'Fulano',
        expires_at: '2026-12-01T12:00:00.000Z',
        created_at: '2026-11-01T12:00:00.000Z',
      }],
      isLoading: false,
      isError: false,
    };
    renderizar();

    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nenhum convite ativo')).toBeNull();
  });
});
