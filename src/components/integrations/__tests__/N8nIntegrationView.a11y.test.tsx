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

const MOCK_WORKFLOWS = [
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
];

/**
 * Simula a tela conectada (isConnected=true + 2 workflows) sem clicar na UI:
 * o botão Conectar é sempre `disabled` (a integração real ainda não existe),
 * então o estado interno é semeado pelo valor inicial do useState.
 *
 * Por que pelo formato do valor inicial (e não pela ordem de chamada): o mock
 * anterior contava chamadas (2ª e 3ª) e substituía o useState de TODOS os
 * componentes — qualquer useState do Radix (Tooltip, Switch) deslocava a
 * contagem e quebrava o teste ou os filhos. Aqui só a 1ª ocorrência de cada
 * formato é interceptada e o resto delega ao useState real, então os
 * componentes Radix continuam funcionando.
 *
 * Dependência assumida (documentada): os hooks do componente pai rodam antes
 * dos filhos no React, e o TooltipProvider (único ancestral) usa no Radix
 * useState(null/undefined) — nunca `false` nem `[]`. Por isso a 1ª ocorrência
 * de `false` é o isConnected e a 1ª de `[]` é workflows, ambos do
 * N8nIntegrationView (o 1º useState é string '', o 4º é objeto, o 5º é o 2º
 * `false` e continua real). Se a ordem dos useStates do componente mudar,
 * este mock precisa acompanhar.
 */
const mockState = { connected: false, workflows: false };

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (initial === false && !mockState.connected) {
        mockState.connected = true;
        return [true, vi.fn()];
      }
      if (Array.isArray(initial) && initial.length === 0 && !mockState.workflows) {
        mockState.workflows = true;
        return [MOCK_WORKFLOWS, vi.fn()];
      }
      return actual.useState(initial as never);
    },
  };
});

import { N8nIntegrationView } from '../N8nIntegrationView';

/**
 * Renderiza o componente com o estado mockado acima (isConnected=true e dois
 * workflows ativos), tornando os controles de workflow visíveis no DOM.
 * Único helper de render deste arquivo.
 */
function renderComWorkflowsVisiveis() {
  mockState.connected = false;
  mockState.workflows = false;
  return render(
    <TooltipProvider>
      <N8nIntegrationView />
    </TooltipProvider>,
  );
}

describe('a11y: N8nIntegrationView — nomes acessíveis em botões e switches (N-195)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.connected = false;
    mockState.workflows = false;
  });

  it('o botão Conectar tem nome acessível visível no DOM', () => {
    renderComWorkflowsVisiveis();
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
    const { baseElement } = renderComWorkflowsVisiveis();

    const results = await axe(baseElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});
