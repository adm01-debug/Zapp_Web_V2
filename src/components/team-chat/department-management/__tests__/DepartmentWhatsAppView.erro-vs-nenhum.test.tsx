import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cred: { data: undefined as unknown, isError: false },
  salvar: vi.fn(),
}));

vi.mock('@/hooks/team-chat/useDepartmentManagement', () => ({
  useDepartmentWhatsAppCredentials: () => h.cred,
  useSaveDepartmentWhatsApp: () => ({ mutate: h.salvar, isPending: false }),
}));

import { DepartmentWhatsAppView } from '@/components/team-chat/department-management/DepartmentWhatsAppView';

// Falha de leitura NAO pode virar formulario no padrao "Nenhum".
//
// Sem `isError`, a consulta quebrada deixava `credentials` indefinido, o
// `useEffect` nao rodava e a tela mostrava o modo `none` com os campos vazios —
// indistinguivel de um departamento que de fato nao tem WhatsApp configurado.
// O admin podia SALVAR esse padrao por cima das credenciais reais e perder a
// configuracao do departamento. E' pior que o caso dos convites: ali o dano era
// um convite duplicado; aqui e' perda de credencial.
//
// O contrato veio de um teste que outro agente escreveu e nunca foi mergeado
// (preservado em `refs/autosave/stash/6d7cd91aee88`).

function renderizar(isAdmin = true) {
  return render(
    <DepartmentWhatsAppView departmentId="dep-1" currentUserName="Fulano" isAdmin={isAdmin} />,
  );
}

describe('DepartmentWhatsAppView — erro de leitura não vira "Nenhum"', () => {
  afterEach(() => {
    h.cred = { data: undefined, isError: false };
    vi.clearAllMocks();
  });

  it('erro na leitura aparece como alerta, não como formulário', () => {
    h.cred = { data: undefined, isError: true };
    renderizar();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a configuração de WhatsApp deste departamento.',
    );
    expect(screen.queryByText('Modo de integração')).toBeNull();
  });

  // A trava que importa: com erro nao pode existir caminho para gravar, senao o
  // admin sobrescreve credencial real com o padrao vazio.
  it('com erro não há como salvar', () => {
    h.cred = { data: undefined, isError: true };
    renderizar();

    expect(screen.queryByRole('button', { name: /Salvar/i })).toBeNull();
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it('departamento sem configuração de verdade continua mostrando o formulário', () => {
    h.cred = { data: { mode: 'none', evolution_url: null }, isError: false };
    renderizar();

    expect(screen.getByText('Modo de integração')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('configuração existente continua carregando sem alerta', () => {
    h.cred = {
      data: { mode: 'evolution', evolution_url: 'https://evo.example.com' },
      isError: false,
    };
    renderizar();

    expect(screen.getByText('Modo de integração')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
