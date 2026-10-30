/**
 * Menções do chat — e-mail mascarado (não-admin) não pode derrubar a tela.
 *
 * Contexto: `get_team_profiles` devolve `email` NULL para quem não é admin
 * (mascaramento na RPC). A lista de menções fazia `a.email.toLowerCase()` no
 * filtro e `{agent.email}` na linha, então o simples "@" de um não-admin
 * estourava um TypeError e a tela morria.
 *
 * Prova com o componente REAL (`MentionAutocomplete`), sem mock de valor:
 *  - digitar "@" com um perfil sem e-mail não quebra e a pessoa aparece;
 *  - perfil sem e-mail mostra só o nome (a linha de e-mail não é renderizada);
 *  - perfil com nome nulo e e-mail presente não quebra e usa o e-mail de rótulo;
 *  - perfil sem nome E sem e-mail não é listado (não é mencionável);
 *  - a menção selecionada é inserida pelo nome real, nunca por "null".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, renderHook, act } from '@testing-library/react';

const { rpcMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const selectMock = vi.fn(() => ({ limit: limitMock }));
  const rpcMock = vi.fn(() => ({ select: selectMock }));
  return { rpcMock, limitMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

import { MentionAutocomplete, useMentions } from '../MentionAutocomplete';

const AGENTS = [
  { id: '1', name: 'Maria Silva', email: 'maria@promobrindes.com.br', avatar_url: null },
  // não-admin: a RPC manda email NULL
  { id: '2', name: 'Marina Souza', email: null, avatar_url: null },
  // sem nome e sem e-mail: não há o que mencionar
  { id: '3', name: null, email: null, avatar_url: null },
  // nome nulo com e-mail visível (admin incompleto)
  { id: '4', name: null, email: 'marcos@promobrindes.com.br', avatar_url: null },
];

function renderMention(query = 'ma') {
  limitMock.mockResolvedValue({ data: AGENTS, error: null });
  const inputValue = `@${query}`;
  return render(
    <MentionAutocomplete
      inputValue={inputValue}
      cursorPosition={inputValue.length}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      isOpen
    />,
  );
}

beforeEach(() => {
  rpcMock.mockClear();
  limitMock.mockReset();
});

describe('MentionAutocomplete — e-mail mascarado (regressão)', () => {
  it('não quebra ao digitar "@" com perfil sem e-mail e lista a pessoa', async () => {
    renderMention('ma');
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument();
  });

  it('perfil sem e-mail mostra só o nome (sem linha de e-mail)', async () => {
    renderMention('ma');
    const row = (await screen.findByText('Marina Souza')).closest('button')!;
    expect(row.querySelectorAll('span')).toHaveLength(1);
    expect(row).not.toHaveTextContent('@');
  });

  it('perfil com e-mail visível (admin) mostra nome e e-mail', async () => {
    renderMention('ma');
    const row = (await screen.findByText('Maria Silva')).closest('button')!;
    expect(row.querySelectorAll('span')).toHaveLength(2);
    expect(row).toHaveTextContent('maria@promobrindes.com.br');
  });

  it('nome nulo com e-mail presente não quebra e usa o e-mail de rótulo', async () => {
    renderMention('ma');
    const row = (await screen.findByText('marcos@promobrindes.com.br')).closest('button')!;
    // uma única linha: o e-mail virou o rótulo, não é repetido
    expect(row.querySelectorAll('span')).toHaveLength(1);
  });

  it('perfil sem nome e sem e-mail não entra na lista (não é mencionável)', async () => {
    renderMention('ma');
    await screen.findByText('Marina Souza');
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});

describe('useMentions — inserção da menção (não-admin)', () => {
  it('insere "@<nome>" e nunca "@null" quando o e-mail é oculto', () => {
    const ta = document.createElement('textarea');
    ta.value = '@ma';
    document.body.appendChild(ta);
    const ref = { current: ta } as React.RefObject<HTMLTextAreaElement>;

    const { result } = renderHook(() => useMentions(ref));
    act(() => result.current.checkForMention('@ma', 3));
    act(() => result.current.handleSelect({ id: '2', name: 'Marina Souza', email: null }, 0));

    expect(ta.value).toBe('@Marina Souza ');
    ta.remove();
  });
});
