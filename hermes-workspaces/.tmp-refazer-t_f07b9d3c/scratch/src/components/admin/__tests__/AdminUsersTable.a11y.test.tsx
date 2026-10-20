import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * Y18-1 / SHELL-02 e SHELL-09 (Admin) —
 * 02: axe `button-name` [critical], 3 nós em TODOS os 6 combos (390 e 1280, claro/escuro/alto
 *     contraste): o Select de Role, o botão só de ícone de editar e o Switch de ativo não tinham
 *     nome acessível (docs/audits/AUDITORIA_A11Y_MOBILE_CONFIG_ADMIN_SHELL_2026-10-07.md:59).
 * 09: axe `color-contrast` [serious], 17 nós no Admin — nome 3,28:1, e-mail 2,14:1 e o texto do
 *     Select 3,17:1 (docs/...:133). Os três hexes medidos são exatamente o token COMPOSTO a 50%
 *     (`#8c8e92` = `--foreground` a 50% sobre branco; `#808080` = preto a 50% no alto contraste;
 *     o e-mail é `--muted-foreground` a 50%): quem reprovava era o `opacity-50` do `<tr>` da
 *     linha inativa, não a classe de cor. Sem a opacidade, os tokens do projeto passam de 4,5:1
 *     (`--foreground` 15:1 e `--muted-foreground` 6,1:1 sobre `--card` branco).
 *
 * O jsdom não carrega o CSS do Tailwind, então injetamos as utilidades usadas pela linha
 * (`.hidden` e `.opacity-50`) para que a medição de estilo seja a do navegador real.
 */
beforeAll(() => {
  const estilo = document.createElement('style');
  estilo.textContent = '.hidden { display: none; } .opacity-50 { opacity: 0.5; }';
  document.head.appendChild(estilo);
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AdminUsersTable } from '../AdminUsersTable';
import type { UserWithRole } from '../useAdminData';

function makeUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'p1',
    user_id: 'u1',
    name: 'Ana Silva',
    email: 'ana@test.local',
    avatar_url: null,
    nickname: null,
    // `signature` aqui é a assinatura de TEXTO do perfil do usuário (campo da tabela
    // `profiles`), não hash/HMAC — só aparece para completar o tipo do fixture.
    signature: null,
    role: 'agent',
    job_title: null,
    department: null,
    phone: null,
    access_level: 'basic',
    max_chats: null,
    can_download: false,
    is_active: true,
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const ativa = makeUser();
const inativa = makeUser({
  id: 'p2',
  user_id: 'u2',
  name: 'Beto Souza',
  email: 'beto@test.local',
  is_active: false,
});

function renderTabela() {
  return render(
    <AdminUsersTable
      users={[ativa, inativa]}
      isAdmin
      onRoleChange={vi.fn()}
      onToggleActive={vi.fn()}
      onEditUser={vi.fn()}
    />,
  );
}

describe('a11y: controles da tabela de usuários do Admin (SHELL-02)', () => {
  it('cada linha nomeia o Select de role, o botão de editar e o Switch de ativo', () => {
    renderTabela();

    for (const nome of ['Ana Silva', 'Beto Souza']) {
      expect(screen.getByRole('combobox', { name: `Alterar role de ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Editar ${nome}` })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: `Ativar/desativar ${nome}` })).toBeInTheDocument();
    }
  });

  it('axe não acusa controle sem nome (regras de nome de botão/campo)', async () => {
    const { container } = renderTabela();

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(
        v.id,
      ),
    );
    expect(semNome).toEqual([]);
  });
});

describe('a11y: contraste da linha de usuário inativo no Admin (SHELL-09)', () => {
  it('a linha inativa não compõe opacidade sobre o texto (era o que derrubava o contraste)', () => {
    renderTabela();

    const linhaInativa = screen.getByText('beto@test.local').closest('tr') as HTMLElement;
    const linhaAtiva = screen.getByText('ana@test.local').closest('tr') as HTMLElement;

    // 0,5 aqui é o que a auditoria mediu: token a 50% = 2,14:1 no e-mail e 3,28:1 no nome.
    expect(window.getComputedStyle(linhaInativa).opacity).toBe('1');
    expect(window.getComputedStyle(linhaAtiva).opacity).toBe('1');

    // O estado inativo continua sinalizado na linha, agora por fundo (token existente) em vez
    // de apagar o texto — nome, e-mail e placeholder seguem no DOM.
    expect(linhaInativa.className).toContain('bg-muted/50');
    expect(linhaInativa.textContent).toContain('Beto Souza');
    expect(linhaInativa.textContent).toContain('beto@test.local');
  });
});
