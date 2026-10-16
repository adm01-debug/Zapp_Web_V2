/**
 * Etapa 171 (plano, linha 451) — "Mais opções…" no QuickAdd: o `⋯` do modo
 * compacto leva a captura para o modal "Nova tarefa" com o que já foi digitado.
 *
 * O que este arquivo prova, e por quê:
 *  - o `⋯` DEPOSITA o rascunho (título, prioridade, prazo, lembrete e contato) e
 *    chama o `openModal()` do MESMO `TasksUiContext` que o `TasksModule` usa para
 *    montar o modal — o modal nasce sem props, então o texto só chega lá por esse
 *    canal (a sonda lê o contexto real, não um mock do QuickAdd);
 *  - fora do módulo (sem `TasksUiProvider`) o `⋯` continua sendo o popover dos
 *    chips: nada é depositado (o componente também é usado no chat e nas notas);
 *  - a leitura do rascunho NÃO consome: o `main.tsx` liga o `StrictMode`, que roda
 *    o render duas vezes — um `useState` que apagasse a caixa entregaria vazio;
 *  - o `⋯` é um `<button>` nativo de 40 px, com nome acessível e sem zerar o
 *    outline (foco visível). O contrato vem da CLASSE aplicada, resolvida em px
 *    pela régua do Tailwind — o mesmo idioma de `barraCapturaDisposicao.test.tsx`.
 *
 * Sem o `abrirMaisOpcoes` no `⋯` o primeiro caso morre: nada é depositado e a
 * sonda do contexto continua "fechado".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { QuickAdd } from '@/components/tasks/shared/QuickAdd';
import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import {
  esquecerRascunhoDaCaptura,
  lerRascunhoDaCaptura,
} from '@/components/tasks/shared/new-task/rascunhoDaCaptura';

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({
    contacts: [{ id: 'c1', name: 'Ana Souza', phone: '+55 11 90000-0000' }],
    totalCount: 1,
    loading: false,
    hasMore: false,
    searchInput: '',
    handleSearchChange: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

beforeEach(() => {
  cleanup();
  esquecerRascunhoDaCaptura();
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

/** Altura garantida pela classe aplicada, em px, pela régua do Tailwind (n*4px).
 *  Traduz EXATAMENTE o que o navegador aplica: `h-7` = 28 px (reprova em 40) e
 *  `min-h-10` = 40 px (passa). */
function alturaGarantidaPx(el: Element): number {
  let px = 0;
  for (const c of el.className.split(/\s+/)) {
    const m = c.match(/^(?:min-)?h-(.+)$/);
    if (!m) continue;
    const v = m[1];
    const n = v.startsWith('[') && v.endsWith('px]')
      ? parseFloat(v.slice(1, -3))
      : /^[0-9.]+$/.test(v) ? parseFloat(v) * 4 : NaN;
    if (!Number.isNaN(n)) px = Math.max(px, n);
  }
  return px;
}

/** Sonda do MESMO contexto que o `TasksModule` usa para montar o modal. */
function SondaDoModal() {
  const { modalOpen } = useTasksUi();
  return <span data-testid="sonda-modal">{modalOpen ? 'aberto' : 'fechado'}</span>;
}

function montar(opts: { comModulo?: boolean } = {}) {
  const onAdd = vi.fn(async () => {});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const captura = <QuickAdd onAdd={onAdd} compact />;

  render(
    <QueryClientProvider client={qc}>
      {opts.comModulo ? (
        <TasksUiProvider>
          {captura}
          <SondaDoModal />
        </TasksUiProvider>
      ) : captura}
    </QueryClientProvider>,
  );

  return { onAdd, input: screen.getByTestId('quick-add-input') as HTMLInputElement };
}

describe('QuickAdd "Mais opções…" (etapa 171)', () => {
  it('o ⋯ deposita o texto digitado e abre o modal pelo TasksUiContext', () => {
    const { input } = montar({ comModulo: true });

    expect(screen.getByTestId('sonda-modal').textContent).toBe('fechado');
    expect(lerRascunhoDaCaptura()).toBeNull();

    fireEvent.change(input, { target: { value: 'Falar com o fornecedor' } });
    fireEvent.click(screen.getByTestId('quick-add-more'));

    // Abriu o modal de verdade (o mesmo `modalOpen` que o TasksModule lê)...
    expect(screen.getByTestId('sonda-modal').textContent).toBe('aberto');
    // ...com o que estava na captura. O modal monta sem props: o texto viaja aqui.
    expect(lerRascunhoDaCaptura()).toEqual({
      title: 'Falar com o fornecedor',
      priority: 'medium',
      dueDate: null,
      remindAt: null,
      contactId: null,
    });
    // O campo da captura continua com o texto (nada é limpo por abrir o modal).
    expect(input.value).toBe('Falar com o fornecedor');
  });

  it('leva também a prioridade ajustada no chip', async () => {
    const { input } = montar({ comModulo: true });
    fireEvent.change(input, { target: { value: 'Urgente' } });

    // No compact o chip de prioridade vive dentro do ⋯: Ctrl+@ abre o popover.
    fireEvent.keyDown(input, { key: '@', ctrlKey: true });
    fireEvent.click(await screen.findByTestId('quick-add-chip-priority'));
    fireEvent.click(await screen.findByTestId('quick-add-priority-urgent'));
    fireEvent.click(screen.getByTestId('quick-add-more'));

    expect(lerRascunhoDaCaptura()?.priority).toBe('urgent');
    expect(lerRascunhoDaCaptura()?.title).toBe('Urgente');
  });

  it('a leitura não consome o rascunho (StrictMode roda o render duas vezes)', () => {
    const { input } = montar({ comModulo: true });
    fireEvent.change(input, { target: { value: 'Dobrar o render' } });
    fireEvent.click(screen.getByTestId('quick-add-more'));

    const primeira = lerRascunhoDaCaptura();
    const segunda = lerRascunhoDaCaptura();
    expect(primeira).toEqual(segunda);
    expect(segunda?.title).toBe('Dobrar o render');
  });

  it('fora do módulo (sem TasksUiProvider) o ⋯ não deposita nada: segue abrindo os chips', async () => {
    const { input } = montar();
    fireEvent.change(input, { target: { value: 'Fora do módulo' } });

    fireEvent.click(screen.getByTestId('quick-add-more'));

    expect(lerRascunhoDaCaptura()).toBeNull();
    // O popover do ⋯ abriu: os chips (que no compacto só existem dentro dele) estão lá.
    await waitFor(() => expect(screen.getByTestId('quick-add-chip-today')).toBeTruthy());
  });

  it('o ⋯ tem alvo de 40 px, nome acessível e não zera o outline (foco visível)', () => {
    montar({ comModulo: true });
    const botao = screen.getByTestId('quick-add-more');

    expect(alturaGarantidaPx(botao)).toBeGreaterThanOrEqual(40);
    expect(botao.getAttribute('aria-label')).toBe('Mais opções');
    // Botão NATIVO: entra na ordem do Tab e Enter/Espaço acionam o `onClick`.
    expect(botao.tagName).toBe('BUTTON');
    expect((botao as HTMLButtonElement).type).toBe('button');
    expect(botao.getAttribute('tabindex')).not.toBe('-1');
    botao.focus();
    expect(document.activeElement).toBe(botao);
    // O outline nativo do navegador é o anel de foco — nada aqui o zera.
    expect(botao.className).not.toContain('outline-none');
    expect(botao.className).not.toContain('focus:outline');
  });
});
