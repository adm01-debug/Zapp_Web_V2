/**
 * Doc 11 (achado G12) — o cartão da Próxima Melhor Ação:
 *  • a carga tem de ser anunciável (`role="status"`), senão quem usa leitor de
 *    tela não sabe que algo está vindo;
 *  • cartão SEM destino real continua informativo — nada de `cursor-pointer`,
 *    nada de `role="button"` (o alvo real é só a aba Tarefas).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useNba } = vi.hoisted(() => ({ useNba: vi.fn() }));

vi.mock('@/hooks/chat/useNextBestAction', () => ({ useNextBestAction: useNba }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const React = await import('react');
    const semAnimacao = ({ initial, animate, exit, transition, variants, whileHover, whileTap, ...rest }: Record<string, unknown>) => rest;
  return {
    ...actual,

    motion: {
      div: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
        React.createElement('div', { ...semAnimacao(props), ref }),
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

import { NextBestActionEngine } from '../NextBestActionEngine';

const Icone = () => <span data-testid="icone" />;

const acao = (type: string, label: string, priority: 'high' | 'medium' | 'low') =>
  ({ type, label, description: `descrição de ${label}`, priority, icon: Icone });

describe('G12 — cartão da Próxima Melhor Ação', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('durante a carga anuncia um status, com animação só quando o sistema permite', () => {
    useNba.mockReturnValue({ actions: [], loading: true });

    const { container } = render(<NextBestActionEngine contactId="contato-1" contactName="Ana" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Carregando próximas ações');
    expect(container.querySelectorAll('[class*="motion-safe:animate-pulse"]')).toHaveLength(2);
  });

  it('cartão SEM destino real não parece clicável', () => {
    useNba.mockReturnValue({ actions: [acao('respond', 'Responder rápido', 'high')], loading: false });

    const { container } = render(<NextBestActionEngine contactId="contato-1" contactName="Ana" />);

    expect(screen.getByText('Responder rápido')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.cursor-pointer')).toBeNull();
  });

  it('cartão COM destino real leva à aba Tarefas (e é botão)', () => {
    const aoAbrirTarefas = vi.fn();
    window.addEventListener('inbox-open-tasks-tab', aoAbrirTarefas);
    useNba.mockReturnValue({ actions: [acao('complete_tasks', 'Concluir tarefas', 'medium')], loading: false });

    render(<NextBestActionEngine contactId="contato-1" contactName="Ana" />);

    fireEvent.click(screen.getByRole('button', { name: /Concluir tarefas/ }));
    expect(aoAbrirTarefas).toHaveBeenCalledTimes(1);

    window.removeEventListener('inbox-open-tasks-tab', aoAbrirTarefas);
  });
});
