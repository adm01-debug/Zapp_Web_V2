/**
 * SEC-FRONTEND-03 — auditoria de front-end de 07/10/2026 (achado P2).
 *
 * Cenário do relatório: o atendente A digita um rascunho na conversa do cliente X e
 * sai. O atendente B entra na MESMA máquina e abre a conversa X — o campo de mensagem
 * vinha preenchido com o texto de A, porque o rascunho era gravado em
 * `chat_draft_<contato>` (sem dono) e não saía no logout. O hook REAL é montado aqui
 * com a sessão controlada pelo teste: com o dono errado, nada é restaurado.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatInputLogic } from '../useChatInputLogic';
import { INBOX_DRAFT_KEY_PREFIX, LEGACY_INBOX_DRAFT_KEY_PREFIX } from '@/lib/inboxDraftSession';

const cenario = vi.hoisted(() => ({ userId: 'atendente-b' as string | null, falha: false }));

vi.mock('@/lib/logger', () => {
  const loggerStub = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { log: loggerStub, logger: loggerStub, getLogger: () => loggerStub, createLogger: () => loggerStub };
});
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getSession: vi.fn(async () => {
      if (cenario.falha) throw new Error('sessão indisponível');
      return cenario.userId ? { user: { id: cenario.userId } } : null;
    }),
  },
}));

const CONTATO = 'contato-x';
const RASCUNHO_DO_B = 'texto que o atendente B digitou';

function montar() {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  const inputRef = { current: textarea } as React.RefObject<HTMLTextAreaElement>;
  const fileUploaderRef = { current: null } as React.RefObject<{ handleExternalFiles: (files: File[]) => void } | null>;

  const utils = renderHook(
    ({ value }: { value: string }) =>
      useChatInputLogic({
        inputValue: value,
        contactId: CONTATO,
        editingMessage: null,
        inputRef,
        fileUploaderRef,
        onSend: vi.fn(),
      }),
    { initialProps: { value: '' } },
  );

  return { ...utils, textarea };
}

/** Deixa a leitura da sessão e os efeitos do hook assentarem. */
async function assentar() {
  await act(async () => { await Promise.resolve(); });
}

describe('useChatInputLogic — rascunho de conversa com dono (SEC-FRONTEND-03)', () => {
  beforeEach(() => {
    cenario.userId = 'atendente-b';
    localStorage.clear();
  });

  it('não devolve para o atendente B o rascunho sem dono gravado pelo atendente A', async () => {
    localStorage.setItem(`${LEGACY_INBOX_DRAFT_KEY_PREFIX}${CONTATO}`, 'texto do atendente A');

    const { textarea } = montar();
    await assentar();

    expect(textarea.value).toBe('');
    expect(localStorage.getItem(`${LEGACY_INBOX_DRAFT_KEY_PREFIX}${CONTATO}`)).toBeNull();
  });

  it('grava o rascunho na chave do dono e o devolve só para esse atendente', async () => {
    const primeiro = montar();
    await assentar();

    primeiro.rerender({ value: RASCUNHO_DO_B });
    await waitFor(
      () => expect(localStorage.getItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:${CONTATO}`)).toBe(RASCUNHO_DO_B),
      { timeout: 3000 },
    );
    primeiro.unmount();

    // Mesma máquina, outro atendente: o campo abre vazio e o rascunho de B fica com B.
    cenario.userId = 'atendente-c';
    const segundo = montar();
    await assentar();

    expect(segundo.textarea.value).toBe('');
    expect(localStorage.getItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:${CONTATO}`)).toBe(RASCUNHO_DO_B);
  });

  it('devolve ao próprio dono o rascunho que ele deixou na conversa', async () => {
    localStorage.setItem(`${INBOX_DRAFT_KEY_PREFIX}atendente-b:${CONTATO}`, RASCUNHO_DO_B);

    const { textarea } = montar();
    await waitFor(() => expect(textarea.value).toBe(RASCUNHO_DO_B));
  });

  it('com a sessão indisponível não grava rascunho nenhum (falha fechada)', async () => {
    cenario.falha = true;

    const { rerender } = montar();
    rerender({ value: RASCUNHO_DO_B });
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(localStorage.length).toBe(0);
  });
});
