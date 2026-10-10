/**
 * N-085 — Botões icon-only da tela de comparação de filas com nome acessível
 * QUE CORRESPONDE À PÁGINA DE DESTINO.
 *
 * Varredura feita no módulo (`grep 'size="icon"'` + `grep '<button'` em
 * src/components/queues/):
 *  - já tinham nome: QueueCard.tsx "Ações da fila {nome}"; EditQueueDialog.tsx
 *    "Cor {hex}".
 *  - nomeados neste cartão: QueuesComparisonDashboard.tsx "Voltar" e
 *    "Abrir fila {nome}" (os 2 do defeito N-085); QueueCard.tsx
 *    "Adicionar atendente à fila" e "Remover {membro} da fila";
 *    QueueAlertsDisplay.tsx "Dispensar alerta da fila".
 *
 * Comparação nome x destino (cabeçalho/h1 da página de destino):
 *  - "Abrir fila {nome}" -> destino /queue/:id. src/routes/AppRoutes.tsx monta
 *    QueueDetails, que em src/pages/QueueDetails.tsx:117 renderiza
 *    PageHeader com title={queue.name}, e src/components/layout/PageHeader.tsx:148
 *    põe esse título dentro de um <h1>. O nome acessível carrega o próprio h1 do
 *    destino (o nome da fila). BATE.
 *  - "Voltar" -> destino "/". AppRoutes.tsx monta Index -> AppShell
 *    (src/pages/Index.tsx:110), que NÃO tem um <h1> de página. O nome segue a
 *    convenção de navegação e leva à raiz do aplicativo. NÃO BATE com um h1
 *    porque o destino não tem h1.
 *
 * O teste abaixo quebra se qualquer um dos dois nomes for trocado por texto que
 * não corresponda ao destino — foi o que o revisor reprovou antes (o teste antigo
 * só localizava pelo nome, então um texto qualquer passava).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/queues/QueuesComparisonCharts', () => ({ QueuesComparisonCharts: () => null }));
vi.mock('@/components/queues/PeriodSelector', () => ({ PeriodSelector: () => null }));

// h1 da página de destino /queue/:id (QueueDetails.tsx:117 -> PageHeader title).
const NOME_FILA = 'Suporte';

// Espião de navegação: prova o destino de cada botão sem precisar de rotas.
const navegar = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>();
  return { ...real, useNavigate: () => navegar };
});

vi.mock('@/hooks/business/useQueuesComparison', () => ({
  useQueuesComparison: () => ({
    queuesPerformance: [
      {
        id: 'q1',
        name: NOME_FILA,
        color: '#3B82F6',
        totalContacts: 10,
        assignedContacts: 8,
        waitingContacts: 2,
        totalMessages: 50,
        avgMessagesPerContact: 5,
        agentsCount: 3,
      },
    ],
    loading: false,
  }),
}));

import { QueuesComparisonDashboard } from '@/components/queues/QueuesComparisonDashboard';

function renderTela() {
  navegar.mockClear();
  return render(<QueuesComparisonDashboard />);
}

describe('N-085 — nome dos botões icon-only da comparação de filas', () => {
  it('o botão "Abrir fila" carrega o h1 da página de destino e abre a fila', () => {
    renderTela();

    // O destino /queue/:id tem <h1>{queue.name}</h1>; o nome do botão precisa
    // carregar esse mesmo texto (um nome genérico não passa).
    const botao = screen.getByRole('button', { name: `Abrir fila ${NOME_FILA}` });
    expect(botao).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Abrir$/ })).toBeNull();

    fireEvent.click(botao);
    expect(navegar).toHaveBeenCalledWith('/queue/q1');
  });

  it('o botão "Voltar" tem nome não-genérico e leva à raiz do aplicativo', () => {
    renderTela();

    const botao = screen.getByRole('button', { name: 'Voltar' });
    fireEvent.click(botao);

    expect(navegar).toHaveBeenCalledWith('/');
  });

  it('varredura axe na tela não acusa violação', async () => {
    const { container } = renderTela();

    const resultados = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultados.violations).toEqual([]);
  });
});
