/**
 * L06 — casos adversariais do saneamento do link de e-mail do contato (C03).
 *
 * Grupo 1 — saneamento em `navigateToView(view, params?)`: a lista fixa
 * NAV_PARAM_SANITIZERS é a ÚNICA porta de entrada de `emailContact` (UUID) e
 * `emailTo` (e-mail ≤ 254). Aqui essa porta é atacada com o que um link hostil
 * ou um erro de programação tentaria empurrar para a URL: esquema `javascript:`/
 * `data:`, texto de 5 mil caracteres, Unicode que PARECE `@`, UUID em maiúsculas,
 * parâmetro repetido, marcação `<script>`, e-mail sem domínio e chave fora da lista.
 *
 * Grupo 2 — consumo em `EmailChatInbox` (D02/D03 do plano): os parâmetros saem da
 * URL na MESMA entrada (replaceState, sem empilhar) depois de consumidos, e
 * `?emailThread` explícito vence a intenção de contato. O controle negativo de
 * D03 (mesma URL SEM emailThread → consome) existe para "não veio intenção" e
 * "intenção proibida" não ficarem indistinguíveis.
 *
 * O arquivo é `.ts` (sem JSX): os duplos usam `createElement`.
 */
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { navigateToView } from '../useNavigationHistory';

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const UUID_MAIUSCULO = '123E4567-E89B-42D3-A456-426614174000';

const search = () => window.location.search;
const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const ocorrencias = (name: string) => (window.location.search.match(new RegExp(`${name}=`, 'g')) ?? []).length;

let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=inbox');
  pushSpy = vi.spyOn(window.history, 'pushState');
  replaceSpy = vi.spyOn(window.history, 'replaceState');
});

afterEach(() => {
  pushSpy.mockRestore();
  replaceSpy.mockRestore();
});

describe('L06 · saneamento adversarial de navigateToView', () => {
  it('rejeita esquemas javascript: e data: em emailTo e emailContact', () => {
    navigateToView('email-chat', {
      emailTo: 'javascript:alert(1)',
      emailContact: 'javascript:alert(1)',
    });
    expect(param('emailTo')).toBeNull();
    expect(param('emailContact')).toBeNull();

    window.history.replaceState(null, '', '/?view=inbox');
    navigateToView('email-chat', { emailTo: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' });
    expect(param('emailTo')).toBeNull();

    // Invariante: nada do esquema hostil sobra na URL (nem codificado).
    expect(search().toLowerCase()).not.toContain('javascript');
    expect(search().toLowerCase()).not.toContain('data:');
    expect(param('view')).toBe('email-chat');
  });

  it('descarta emailTo com 5 mil caracteres e mantém a URL curta', () => {
    const longo = `${'a'.repeat(5000)}@x.co`;
    navigateToView('email-chat', { emailTo: longo, emailContact: 'a'.repeat(5000) });

    expect(param('emailTo')).toBeNull();
    expect(param('emailContact')).toBeNull();
    expect(search().length).toBeLessThan(80);

    // O teto de 254 é o do saneador, não um efeito do comprimento total da URL.
    const noLimite = `${'a'.repeat(249)}@x.co`; // 254 caracteres
    expect(noLimite).toHaveLength(254);
    navigateToView('contacts');
    navigateToView('email-chat', { emailTo: noLimite });
    expect(param('emailTo')).toBe(noLimite);
  });

  it('não confunde Unicode parecido com @ (U+FF20 fullwidth, U+FE6B small commercial at) por e-mail', () => {
    const fullwidth = 'maria\uFF20test.com';
    const pequenoArroba = 'maria\uFE6Btest.com';

    navigateToView('email-chat', { emailTo: fullwidth });
    expect(param('emailTo')).toBeNull();

    navigateToView('contacts');
    navigateToView('email-chat', { emailTo: pequenoArroba });
    expect(param('emailTo')).toBeNull();

    // O '@' ASCII de verdade continua valendo (o teste não está só recusando tudo).
    navigateToView('contacts');
    navigateToView('email-chat', { emailTo: 'maria@test.com' });
    expect(param('emailTo')).toBe('maria@test.com');
  });

  it('aceita UUID em MAIÚSCULAS sem normalizar (o saneador é case-insensitive, não um filtro de igualdade)', () => {
    navigateToView('email-chat', { emailContact: UUID_MAIUSCULO });
    expect(param('emailContact')).toBe(UUID_MAIUSCULO);

    // ...e ainda recusa o quase-UUID (sem hífens, com chaves, fora do alfabeto hex).
    window.history.replaceState(null, '', '/?view=inbox');
    navigateToView('email-chat', { emailContact: UUID_MAIUSCULO.replace(/-/g, '') });
    expect(param('emailContact')).toBeNull();

    navigateToView('contacts');
    navigateToView('email-chat', { emailContact: `${UUID}z` });
    expect(param('emailContact')).toBeNull();
  });

  it('parâmetro repetido não acumula: a URL de entrada fica com UM valor (o último)', () => {
    // URL de entrada já traz emailTo duas vezes e um emailContact velho.
    window.history.replaceState(null, '', `/?view=email-chat&emailTo=velho@x.co&emailTo=outro@x.co&emailContact=${UUID}`);

    navigateToView('email-chat', { emailTo: 'novo@x.co', emailContact: UUID_MAIUSCULO });

    expect(ocorrencias('emailTo')).toBe(1);
    expect(ocorrencias('emailContact')).toBe(1);
    expect(param('emailTo')).toBe('novo@x.co');
    expect(param('emailContact')).toBe(UUID_MAIUSCULO);

    // Duas chamadas seguidas em views diferentes: nada se acumula — o valor
    // válido remanescente continua UM só (a limpeza é do consumo, no grupo 2).
    navigateToView('inbox');
    navigateToView('email-chat', { emailContact: UUID });
    expect(ocorrencias('emailContact')).toBe(1);
    expect(ocorrencias('emailTo')).toBe(1);
    expect(param('emailContact')).toBe(UUID);
    expect(param('emailTo')).toBe('novo@x.co');
  });

  it('rejeita valores com <script> (marcação) sem deixar o payload na URL', () => {
    navigateToView('email-chat', {
      emailTo: '<script>alert(1)</script>@x.co',
      emailContact: '<script>alert(1)</script>',
    });
    expect(param('emailTo')).toBeNull();
    expect(param('emailContact')).toBeNull();

    window.history.replaceState(null, '', '/?view=inbox');
    navigateToView('email-chat', { emailTo: '<img src=x onerror=alert(1)>' });
    expect(param('emailTo')).toBeNull();

    const bruto = decodeURIComponent(search()).toLowerCase();
    expect(bruto).not.toContain('<script');
    expect(bruto).not.toContain('onerror');
  });

  it('rejeita e-mail sem domínio e domínio sem ponto', () => {
    const invalidos = ['maria@', 'maria@local', '@x.co', 'maria@.com', 'maria test@x.co', 'maria@x.co;DROP'];
    for (const invalido of invalidos) {
      window.history.replaceState(null, '', '/?view=inbox');
      navigateToView('email-chat', { emailTo: invalido });
      expect(param('emailTo'), `deveria recusar: ${invalido}`).toBeNull();
    }
  });

  it('ignora chave fora da lista, inclusive quando tenta sobrescrever view ou semear emailThread', () => {
    window.history.replaceState(null, '', '/?view=inbox&emailThread=thread-deep-link');
    navigateToView('email-chat', {
      emailTo: 'maria@test.com',
      ...({ view: 'hacked', admin: 'true', emailThread: 'thread-injetada' } as Record<string, string>),
    });

    expect(param('view')).toBe('email-chat');
    expect(param('admin')).toBeNull();
    expect(param('emailThread')).toBeNull(); // compareceu emailTo válido → a intenção de contato limpa a conversa velha
  });

  it('com SÓ chaves desconhecidas não grava nada nem limpa emailThread remanescente', () => {
    window.history.replaceState(null, '', '/?view=inbox&emailThread=thread-deep-link');
    pushSpy.mockClear();
    navigateToView('inbox', { admin: 'true', whatever: 'x' });

    expect(param('admin')).toBeNull();
    expect(param('whatever')).toBeNull();
    expect(param('emailThread')).toBe('thread-deep-link');
    expect(search()).toBe('?view=inbox&emailThread=thread-deep-link');

    // Chave só no protótipo não conta como parâmetro (Object.entries é own-only).
    const comPrototipo = Object.create({ emailTo: 'injetado@x.co' }) as Record<string, string>;
    navigateToView('contacts', comPrototipo);
    expect(param('emailTo')).toBeNull();
  });

  it('na view já ativa grava por replaceState (mesma entrada, sem empilhar) e confirma a URL sem params hostis', () => {
    window.history.replaceState(null, '', '/?view=email-chat');
    pushSpy.mockClear();
    replaceSpy.mockClear();
    const entradasAntes = window.history.length;

    navigateToView('email-chat', { emailContact: UUID, emailTo: '<script>alert(1)</script>' });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(entradasAntes);
    expect(param('emailContact')).toBe(UUID);
    expect(param('emailTo')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 2 — consumo em EmailChatInbox (D02 limpeza por replaceState, D03 emailThread vence)
// ─────────────────────────────────────────────────────────────────────────────

const lookup = vi.hoisted(() => ({
  status: 'none' as 'loading' | 'found' | 'none' | 'error',
  threadId: null as string | null,
  calls: [] as Array<string | null | undefined>,
}));

const inboxState = vi.hoisted(() => ({
  accounts: [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }] as Array<{ id: string; email_address: string; is_active: boolean }>,
  activeAccount: { id: 'account-1', email_address: 'admin@example.com', is_active: true } as { id: string; email_address: string; is_active: boolean } | undefined,
  threads: [] as EmailThread[],
}));

const THREAD: EmailThread = {
  id: 'thread-1', gmail_account_id: 'account-1', gmail_thread_id: 'gmail-thread-1', contact_id: UUID,
  subject: 'Assunto real', snippet: 'Prévia', label_ids: ['INBOX'], message_count: 1, is_unread: true,
  is_starred: false, is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
  last_from_address: 'maria@test.com', assigned_to: null, status: 'open', priority: 'medium', tags: [],
  created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    ...inboxState,
    accountsLoading: false, accountsError: null,
    refetchAccounts: vi.fn(), connectGmail: { mutate: vi.fn(), isPending: false }, labels: [],
    threadsLoading: false, threadsError: null, syncInbox: { mutate: vi.fn(), isPending: false },
    syncLabels: { mutate: vi.fn(), isPending: false }, unreadCount: 0, threadsTotalCount: inboxState.threads.length,
    downloadAttachment: { mutate: vi.fn(), isPending: false },
    subscribeToThreads: () => vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({
  useEmailThreadForContact: (_accountId: string | undefined, contactId: string | null | undefined) => {
    lookup.calls.push(contactId);
    return { status: lookup.status, threadId: lookup.threadId };
  },
}));
vi.mock('@/components/email/EmailThreadList', () => ({
  EmailThreadList: () => createElement('div', { 'data-testid': 'thread-list' }),
}));
vi.mock('@/components/email/EmailChatThread', () => ({
  EmailChatThread: ({ accountId }: { accountId?: string }) => createElement('div', { 'data-testid': 'thread-account' }, accountId),
}));
vi.mock('@/components/email/EmailContactPanel', () => ({
  EmailContactPanel: () => createElement('div', { 'data-testid': 'contact-panel' }),
}));
vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: ({ accountId, defaultTo }: { accountId?: string; defaultTo?: string }) =>
    createElement('div', { 'data-testid': 'composer-account', 'data-to': defaultTo }, accountId),
}));

import { EmailChatInbox } from '@/components/email/EmailChatInbox';

describe('L06 · consumo adversarial no EmailChatInbox (D02/D03)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    inboxState.activeAccount = { id: 'account-1', email_address: 'admin@example.com', is_active: true };
    inboxState.accounts = [inboxState.activeAccount];
    inboxState.threads = [];
    lookup.status = 'none';
    lookup.threadId = null;
    lookup.calls.length = 0;
    pushSpy.mockClear();
    replaceSpy.mockClear();
  });

  it('D02: consome a intenção e limpa emailContact/emailTo por replaceState (sem empilhar entrada)', async () => {
    window.history.replaceState({}, '', `/?view=email-chat&emailContact=${UUID}&emailTo=maria@test.com`);
    pushSpy.mockClear();
    replaceSpy.mockClear();
    const entradasAntes = window.history.length;

    render(createElement(EmailChatInbox));

    await waitFor(() => expect(screen.getByTestId('composer-account')).toBeInTheDocument());
    expect(screen.getByTestId('composer-account')).toHaveAttribute('data-to', 'maria@test.com');
    expect(param('emailContact')).toBeNull();
    expect(param('emailTo')).toBeNull();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.history.length).toBe(entradasAntes);
  });

  it('D03: ?emailThread explícito vence emailContact — abre a conversa, descarta a intenção e limpa por replaceState', async () => {
    lookup.status = 'found';
    lookup.threadId = 'thread-9';
    inboxState.threads = [THREAD];
    window.history.replaceState({}, '', `/?view=email-chat&emailThread=thread-1&emailContact=${UUID}&emailTo=maria@test.com`);
    pushSpy.mockClear();
    replaceSpy.mockClear();
    const entradasAntes = window.history.length;

    render(createElement(EmailChatInbox));

    await waitFor(() => expect(param('emailContact')).toBeNull());
    expect(param('emailThread')).toBe('thread-1');
    expect(screen.getByTestId('thread-account')).toHaveTextContent('account-1');
    expect(screen.queryByTestId('composer-account')).not.toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entradasAntes);
    // A consulta por contato nem é disparada: a intenção foi descartada antes.
    expect(lookup.calls.every(contactId => !contactId)).toBe(true);
  });

  it('controle negativo de D03: a MESMA URL sem emailThread consome a intenção (prova que o teste acima não passa por acidente)', async () => {
    window.history.replaceState({}, '', '/?view=email-chat');

    const { rerender } = render(createElement(EmailChatInbox));
    expect(screen.queryByTestId('composer-account')).not.toBeInTheDocument();

    // Chega a intenção de contato por navegação na view já ativa (replaceState +
    // evento zapp:navigate, sem popstate).
    pushSpy.mockClear();
    navigateToView('email-chat', { emailContact: UUID, emailTo: 'maria@test.com' });
    rerender(createElement(EmailChatInbox));
    fireEvent(window, new CustomEvent('zapp:navigate', { detail: { view: 'email-chat' } }));

    await waitFor(() => expect(screen.getByTestId('composer-account')).toBeInTheDocument());
    expect(screen.getByTestId('composer-account')).toHaveAttribute('data-to', 'maria@test.com');
    expect(lookup.calls.some(contactId => contactId === UUID)).toBe(true);
    expect(param('emailContact')).toBeNull();
  });

  // E13 (metade que o produto cumpre hoje): link hostil escrito À MÃO na URL não
  // injeta marcação no DOM e a tela não quebra. O consumo NÃO revalida o parâmetro
  // (o saneador vive só no navigateToView) — a outra metade de E13 está no comentário
  // do cartão, não aqui.
  it('link hostil escrito à mão na URL não injeta <script> no DOM nem derruba a tela', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailTo=%3Cscript%3Ealert(1)%3C%2Fscript%3E');

    const { container } = render(createElement(EmailChatInbox));

    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('thread-list')).toBeInTheDocument();
  });
});
