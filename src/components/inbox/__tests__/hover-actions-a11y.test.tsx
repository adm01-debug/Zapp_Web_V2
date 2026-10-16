import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { axe } from 'vitest-axe';
import { HOVER_REVEAL, HOVER_REVEAL_TAP } from '../hoverActions';
import { MessageTemplates } from '../MessageTemplates';

/**
 * U1 — as 21 ações do inbox que só apareciam no hover.
 *
 * O defeito: `opacity-0 group-hover:opacity-100` só acende a camada com ponteiro
 * que tem hover. No celular (sem hover) a ação fica invisível para sempre e no
 * teclado o Tab chega ao botão sem nada acender na tela.
 *
 * O teste guarda o contrato dos 21 pontos (todos passam pela constante de
 * `hoverActions.ts`, nenhum repete a classe antiga) e prova na tela real, com o
 * `MessageTemplates` montado, que a camada de ações traz o padrão e que os
 * botões seguem no caminho do teclado com nome acessível.
 */

const PASTA = resolve(__dirname, '..');

const CLASSE_ANTIGA = 'opacity-0 group-hover:opacity-100';

/** O caminho do teclado e do ponteiro de toque, token a token. */
const VIAS = [
  'group-hover:opacity-100',
  'group-focus-within:opacity-100',
  'focus-visible:opacity-100',
  '[@media(hover:none)]:opacity-100',
];

/**
 * Os 21 pontos do U1, por arquivo: quantas camadas de hover cada um tem.
 * Soma 21 — o mesmo número do levantamento do relatório de paridade.
 */
const PONTOS: Array<[string, number]> = [
  ['AISuggestions.tsx', 1],
  ['AudioMemePicker.tsx', 1],
  ['CustomEmojiPicker.tsx', 1],
  ['GlobalSearch.tsx', 1],
  ['LinkPreview.tsx', 3],
  ['MediaPreview.tsx', 1],
  ['MessageContextActions.tsx', 1],
  ['MessageReactions.tsx', 2],
  ['MessageTemplates.tsx', 1],
  ['QuickRepliesManager.tsx', 1],
  ['SlashCommands.tsx', 1],
  ['TemplatesWithVariables.tsx', 1],
  ['TextToSpeechButton.tsx', 1],
  ['chat/MessageHoverToolbar.tsx', 1],
  ['quick-replies/QuickReplyCardList.tsx', 1],
  ['tabs/NotesTab.tsx', 3],
];

function ler(arquivo: string): string {
  return readFileSync(join(PASTA, arquivo), 'utf8');
}

describe('hoverActions — o padrão único', () => {
  it('HOVER_REVEAL abre as quatro vias de visibilidade', () => {
    for (const via of VIAS) {
      expect(HOVER_REVEAL).toContain(via);
    }
  });

  it('HOVER_REVEAL não mexe em tamanho: só revela', () => {
    expect(HOVER_REVEAL).not.toMatch(/(^|\s)(min-)?[hw]-\d/);
  });

  it('HOVER_REVEAL_TAP soma os 40 px de toque e só sob (pointer: coarse)', () => {
    expect(HOVER_REVEAL_TAP.startsWith(HOVER_REVEAL)).toBe(true);
    expect(HOVER_REVEAL_TAP).toContain('[@media(pointer:coarse)]:min-h-10');
    expect(HOVER_REVEAL_TAP).toContain('[@media(pointer:coarse)]:min-w-10');
    // 40 px = 2,5rem: nenhum utilitário de medida solto (sem a media query).
    expect(HOVER_REVEAL_TAP).not.toMatch(/(^|\s)min-[hw]-\d/);
  });
});

describe('os 21 pontos do U1 passam pela constante', () => {
  it.each(PONTOS)('%s usa hoverActions nas %i camada(s)', (arquivo, camadas) => {
    // Sem a linha de import: o que sobra são os usos reais na tela.
    const corpo = ler(arquivo).replace(/^import .*HOVER_REVEAL.*$/gm, '');

    expect(corpo.match(/HOVER_REVEAL(_TAP)?/g) ?? []).toHaveLength(camadas);
    expect(corpo).not.toContain(CLASSE_ANTIGA);
  });

  it('cobre os 21 pontos do levantamento, sem sobra', () => {
    expect(PONTOS.reduce((soma, [, camadas]) => soma + camadas, 0)).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// Prova na tela: o MessageTemplates real com os hooks mockados (mesmo arranjo
// de `MessageTemplates.a11y-buttons.test.tsx`).
// ---------------------------------------------------------------------------

const templates = [
  { id: 't1', title: 'Olá, tudo bem?', content: 'Olá, como posso ajudar?', shortcut: '/ola', category: 'saudacao', use_count: 5 },
];

vi.mock('@/hooks/chat/useMessageTemplates', () => ({
  useMessageTemplates: vi.fn(() => ({
    templates,
    isLoading: false,
    fetchTemplates: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    incrementUseCount: vi.fn(),
  })),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1', email: 'test@test.com' } })),
}));

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => <span {...props}>{children}</span>,
}));

function abrirCamada() {
  const view = render(<MessageTemplates onSelectTemplate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Templates de mensagem' }));
  const editar = screen.getByRole('button', { name: 'Editar template: Olá, tudo bem?' });
  const camada = editar.parentElement as HTMLElement;
  return { ...view, editar, camada };
}

describe('hoverActions — camada de ações do template na tela', () => {
  it('a camada visível no hover leva o padrão inteiro (teclado e toque)', () => {
    const { camada } = abrirCamada();
    const utilitarios = camada.className.split(/\s+/);

    for (const via of VIAS) {
      expect(utilitarios).toContain(via);
    }
    expect(utilitarios).toContain('[@media(pointer:coarse)]:min-h-10');
    expect(utilitarios).toContain('[@media(pointer:coarse)]:min-w-10');
    expect(utilitarios).toContain('transition-opacity');
    expect(utilitarios).not.toContain(CLASSE_ANTIGA);
  });

  it('os botões da camada seguem no caminho do teclado, com nome acessível', () => {
    const { camada, editar } = abrirCamada();

    // jsdom não move o foco com Tab; o que se prova aqui é o que o Tab precisa
    // encontrar: botão nativo, fora de `tabindex="-1"`, sem `disabled`, que
    // aceita foco — e a camada que acende por `focus-visible`/`focus-within`.
    expect(editar.tagName).toBe('BUTTON');
    expect(editar).not.toHaveAttribute('tabindex', '-1');
    expect(editar).not.toBeDisabled();
    editar.focus();
    expect(editar).toHaveFocus();
    expect(camada).toContainElement(document.activeElement as HTMLElement);

    const botoes = within(camada).getAllByRole('button');
    expect(botoes).toHaveLength(2);
    expect(botoes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Editar template: Olá, tudo bem?',
      'Excluir template: Olá, tudo bem?',
    ]);
  });

  it('axe não acha violação de nome de botão na camada', async () => {
    const { container } = abrirCamada();
    const resultados = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(resultados).toHaveNoViolations();
  });
});
