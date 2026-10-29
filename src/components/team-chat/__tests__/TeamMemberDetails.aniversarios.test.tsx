import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberProfile } from '@/hooks/team-chat/useTeamMemberDetails';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * HZ-28 — a seção "Próximos Aniversários" do Team Chat e o bloco de aniversário do
 * cabeçalho da conversa direta passam a mostrar os colegas de verdade.
 *
 * A RPC segura `get_team_birthdays` devolve SÓ dia e mês: a data e a idade do colega
 * nunca chegam ao front. O que este teste trava:
 *  1. grupo com dois colegas com aniversário mostra OS DOIS, ordenados pelos dias
 *     que faltam (o mais próximo primeiro);
 *  2. grupo sem aniversário cadastrado mostra o estado vazio;
 *  3. nenhuma tela mostra ano de nascimento nem idade.
 *
 * O `today` é fixado para a ordem não depender do dia em que a suíte roda.
 */

const f = vi.hoisted(() => ({
  groupMembers: [] as MemberProfile[],
  memberProfile: null as MemberProfile | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p-1' } }),
}));

vi.mock('@/hooks/team-chat/useTeamMemberDetails', () => ({
  useTeamMemberDetails: () => ({
    memberProfile: f.memberProfile,
    isLoading: false,
    groupMembers: f.groupMembers,
  }),
}));

import { TeamMemberDetails } from '../TeamMemberDetails';

function perfil(id: string, name: string, birthday: MemberProfile['birthday']): MemberProfile {
  return {
    id,
    name,
    email: null,
    phone: null,
    avatar_url: null,
    job_title: 'Vendedor',
    department: 'Comercial',
    role: 'agent',
    is_active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    birthday,
  };
}

const grupo = {
  id: 'g-1',
  type: 'group',
  name: 'Comercial',
  avatar_url: null,
  created_by: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  members: [
    { id: 'm-1', conversation_id: 'g-1', profile_id: 'p-1', joined_at: '', last_read_at: null, is_muted: false },
    { id: 'm-2', conversation_id: 'g-1', profile_id: 'p-2', joined_at: '', last_read_at: null, is_muted: false },
  ],
} as TeamConversation;

const direta = {
  id: 'd-1',
  type: 'direct',
  name: null,
  avatar_url: null,
  created_by: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  members: [],
} as TeamConversation;

function abrirProximosAniversarios() {
  render(<TeamMemberDetails conversation={grupo} onClose={() => {}} />);
  fireEvent.click(screen.getByText('Próximos Aniversários'));
}

describe('Team Chat — aniversários dos colegas (HZ-28)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sexta 16/10/2026, 12h: Ana faz aniversário em 4 dias, Bruno em 81.
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
    f.memberProfile = null;
    f.groupMembers = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra os dois colegas com aniversário, o mais próximo primeiro, sem ano nem idade', () => {
    f.groupMembers = [
      perfil('p-2', 'Bruno Lima', { day: 5, month: 1 }),
      perfil('p-1', 'Ana Souza', { day: 20, month: 10 }),
    ];

    abrirProximosAniversarios();

    expect(screen.getAllByText(/^(Ana Souza|Bruno Lima)$/).map((el) => el.textContent)).toEqual([
      'Ana Souza',
      'Bruno Lima',
    ]);
    expect(screen.getByText('20/10 (4d)')).toBeTruthy();
    expect(screen.getByText('05/01 (81d)')).toBeTruthy();
    expect(screen.queryByText('Nenhum aniversário cadastrado')).toBeNull();
    expect(document.body.textContent).not.toContain('anos');
    expect(document.body.textContent).not.toMatch(/\d{4}/);
  });

  it('grupo sem aniversário cadastrado mostra o estado vazio', () => {
    f.groupMembers = [perfil('p-1', 'Ana Souza', null), perfil('p-2', 'Bruno Lima', null)];

    abrirProximosAniversarios();

    expect(screen.getByText('Nenhum aniversário cadastrado')).toBeTruthy();
    expect(screen.queryByText(/^(Ana Souza|Bruno Lima)$/)).toBeNull();
  });

  it('conversa direta mostra o dia e o mês do colega, nunca o ano', () => {
    f.memberProfile = perfil('p-2', 'Bruno Lima', { day: 20, month: 10 });

    render(<TeamMemberDetails conversation={direta} onClose={() => {}} />);

    expect(screen.getByText('Aniversário')).toBeTruthy();
    // A data aparece no cartão do cabeçalho e na linha "Informações" — sempre sem ano.
    expect(screen.getAllByText('20 de outubro')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('anos');
  });
});
