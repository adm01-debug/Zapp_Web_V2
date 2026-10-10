/**
 * N-195 — botões "Testar/Remover fluxo" e interruptores de workflow sem nome acessível.
 *
 * Prova que, quando os controles de workflow estão visíveis (isConnected=true),
 * cada botão icon e o Switch possuem aria-label e o axe não aponta violações
 * de nome acessível (button-name, aria-toggle-field-name).
 *
 * O teste falha SEM a correção (sem aria-label nos botões e switch) porque
 * getByRole('button', {name:'...'}) e getByRole('switch', {name:'...'})
 * lançam erro quando o elemento não tem nome acessível.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/**
 * Mocka useState no nível do módulo para que o named import
 * do componente também seja interceptado (vi.spyOn no objeto
 * padrão não funciona com named imports em Vitest).
 */
const useStateMeta = { count: 0 };

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => {
      useStateMeta.count++;
      // 2ª chamada: isConnected → true
      if (useStateMeta.count === 2) return [true, vi.fn()];
      // 3ª chamada: workflows → lista com 2 workflows
      if (useStateMeta.count === 3)
        return [
          [
            {
              id: 'wf-1',
              name: 'Webhook Recebido',
              webhookUrl: 'https://n8n.example.com/webhook/abc',
              isActive: true,
              triggerEvent: 'message.received',
            },
            {
              id: 'wf-2',
              name: 'API Call',
              webhookUrl: 'https://n8n.example.com/webhook/def',
              isActive: true,
              triggerEvent: 'message.received',
            },
          ],
          vi.fn(),
        ];
      return [initial, vi.fn()];
    },
  };
});

import { N8nIntegrationView } from '../N8nIntegrationView';

function renderComWorkflows() {
  return render(
    <TooltipProvider>
      <N8nIntegrationView />
    </TooltipProvider>,
  );
}

/**
 * Renderiza o componente com useState mockado para simular
 * isConnected=true e dois workflows ativos, tornando os
 * controles de workflow visíveis no DOM.
 */
function renderComWorkflowsVisiveis() {
  useStateMeta.count = 0;
  return render(
    <TooltipProvider>
      <N8nIntegrationView />
    </TooltipProvider>,
  );
}

describe('a11y: N8nIntegrationView — nomes acessíveis em botões e switches (N-195)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStateMeta.count = 0;
  });

  it('o botão Conectar tem nome acessível visível no DOM', () => {
    renderComWorkflows();
    expect(screen.getByRole('button', { name: /conectar/i })).toBeInTheDocument();
  });

  it('os botões Testar e Remover têm nome acessível quando workflows estão visíveis', () => {
    renderComWorkflowsVisiveis();

    expect(screen.getByRole('button', { name: 'Testar Webhook Recebido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Webhook Recebido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Testar API Call' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover API Call' })).toBeInTheDocument();
  });

  it('o Switch de workflow tem nome acessível', () => {
    renderComWorkflowsVisiveis();

    expect(screen.getByRole('switch', { name: 'Ativar Webhook Recebido' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ativar API Call' })).toBeInTheDocument();
  });

  it('axe não acusa controles sem nome (button-name, aria-toggle-field-name)', async () => {
    const { container } = renderComWorkflows();

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});
