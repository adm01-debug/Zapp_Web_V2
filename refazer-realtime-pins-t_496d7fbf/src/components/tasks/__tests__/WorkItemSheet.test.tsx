/**
 * FASE C — etapa 23–27: Sheet de edição.
 *
 * Os dois últimos casos são de integração (`TasksModule`) e são eles que hoje
 * falham sem a etapa 26: nada no módulo renderiza o Sheet, então clicar no card
 * e abrir por `?task=` não faziam absolutamente nada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  supabaseMock as h,
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
  supabaseMock,
} from '@/test/mocks/tarefas';
import { createQueryBuilder } from '@/test/mocks/supabase';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import { TasksModule } from '@/components/tasks/TasksModule';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

// jsdom não implementa as APIs de captura de ponteiro que o Radix Select usa.
beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const base: WorkItem = {
  id: 't1',
  title: 'Ligar para o cliente',
  description: null,
  status: 'todo',
  priority: 'medium',
  due_date: null,
  remind_at: null,
  notified_at: null,
  waiting_reason: null,
  position: 0,
  started_at: null,
  status_changed_at: '2026-10-01T10:00:00.000Z',
  completed_at: null,
  contact_id: null,
  created_by: 'u1',
  assigned_to: 'u1',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  contact: null,
};

function props(over: Record<string, unknown> = {}) {
  return {
    item: base,
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    onMove: vi.fn(),
    onSnooze: vi.fn(),
    onSetReminder: vi.fn(),
    onCancel: vi.fn(),
    contactOptions: [{ id: 'c1', name: 'Ana Souza' }],
    doingCount: 0,
    ...over,
  };
}

/** Radix Select abre pelo teclado (ArrowDown no gatilho) — pointerdown não basta no jsdom. */
async function abrirEstado() {
  const trigger = screen.getByTestId('sheet-estado');
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return screen.findByRole('listbox');
}

describe('WorkItemSheet — FASE C (etapas 23–25)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('23: abre com os 8 campos e fecha no Esc', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    expect(screen.getByTestId('sheet-titulo')).toBeTruthy();
    expect(screen.getByTestId('sheet-estado')).toBeTruthy();
    expect(screen.getByTestId('sheet-prio-medium')).toBeTruthy();
    expect(screen.getByTestId('sheet-contato')).toBeTruthy();
    expect(screen.getByTestId('sheet-prazo')).toBeTruthy();
    expect(screen.getByTestId('sheet-alarme')).toBeTruthy();
    expect(screen.getByTestId('sheet-toggle-descricao')).toBeTruthy();
    expect(screen.getByTestId('sheet-salvar')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('25: Salvar só habilita com mudança, salva o patch e fecha', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    const salvar = screen.getByTestId('sheet-salvar') as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    expect((screen.getByTestId('sheet-salvar') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('sheet-salvar'));
    expect(p.onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' });
    // R2-MOD-051: o fechamento agora só acontece depois da escrita. Com o spy
    // resolvendo na hora (vi.fn() -> undefined), o close chega no microtask.
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('24: após preencher o motivo, salvar leva o motivo pelo move', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    const motivo = await screen.findByTestId('sheet-motivo');
    fireEvent.change(motivo, { target: { value: 'Aguardando aprovação do cliente' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(p.onMove).toHaveBeenCalledWith(base, 'waiting', 'Aguardando aprovação do cliente');
  });

  it('24/25: Aguardando sem motivo não move e mostra o erro inline', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(await screen.findByTestId('sheet-motivo-erro')).toHaveTextContent('Diga por que parou');
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('24: "Fazendo" fica desabilitado com o texto de cheio quando doingCount=3', async () => {
    render(<WorkItemSheet {...props({ doingCount: 3 })} />);
    await abrirEstado();
    const fazendo = screen.getByRole('option', { name: /Fazendo está cheio \(3\/3\)/ });
    expect(fazendo.getAttribute('aria-disabled')).toBe('true');
  });

  it('25: Concluir move para done e Cancelar tarefa chama onCancel', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    fireEvent.click(screen.getByTestId('sheet-concluir'));
    expect(p.onMove).toHaveBeenCalledWith(base, 'done');

    fireEvent.click(screen.getByTestId('sheet-cancelar'));
    expect(p.onCancel).toHaveBeenCalledWith(base);
  });

  it('24: alarme já disparado mostra "Avisado em"', () => {
    const item = { ...base, remind_at: '2026-10-01T09:00:00.000Z', notified_at: '2026-10-01T09:00:00.000Z' };
    render(<WorkItemSheet {...props({ item })} />);
    expect(screen.getByTestId('sheet-avisado')).toHaveTextContent('Avisado em');
  });

  // #425 / R2-MOD-057: o executor (`notify_due_tasks`) ignora done/cancelled —
  // o Sheet do card não pode oferecer alarme nem "Adiar" nesses estados.
  it('tarefa concluída não oferece alarme nem "Adiar", e diz por quê', async () => {
    const p = props({ item: { ...base, status: 'done' } });
    render(<WorkItemSheet {...p} />);

    expect(screen.queryByTestId('sheet-alarme')).toBeNull();
    expect(screen.queryByTestId('sheet-adiar')).toBeNull();
    expect(screen.queryByTestId('sheet-alarme-hora')).toBeNull();
    expect(screen.getByTestId('sheet-alarme-indisponivel')).toHaveTextContent(/reabra/i);

    // sem controle de alarme não há caminho de snooze a partir do Sheet
    expect(p.onSnooze).not.toHaveBeenCalled();
    expect(p.onSetReminder).not.toHaveBeenCalled();
  });

  it('tarefa cancelada também não oferece alarme; em "todo" o campo segue', () => {
    const { unmount } = render(<WorkItemSheet {...props({ item: { ...base, status: 'cancelled' } })} />);
    expect(screen.queryByTestId('sheet-alarme')).toBeNull();
    expect(screen.getByTestId('sheet-alarme-indisponivel')).toBeTruthy();
    unmount();

    render(<WorkItemSheet {...props()} />);
    expect(screen.getByTestId('sheet-alarme')).toBeTruthy();
    expect(screen.queryByTestId('sheet-alarme-indisponivel')).toBeNull();
  });

  // --- Etapa 88: ampliação das três travas (motivo obrigatório, Fazendo cheio,
  //     Salvar sem mudança). Os casos acima cobrem o caminho feliz; os de baixo
  //     cobrem as bordas que ele deixava passar. ---

  it('88: motivo só com espaços em branco NÃO sai de Aguardando (trim no gate)', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    fireEvent.change(await screen.findByTestId('sheet-motivo'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(await screen.findByTestId('sheet-motivo-erro')).toHaveTextContent('Diga por que parou');
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('88: o motivo gravado sai aparado (espaços das pontas fora)', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    fireEvent.change(await screen.findByTestId('sheet-motivo'), {
      target: { value: '  aguardando o cliente responder  ' },
    });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(p.onMove).toHaveBeenCalledWith(base, 'waiting', 'aguardando o cliente responder');
  });

  it('88: "Fazendo" continua habilitado quando o item já está em doing, mesmo com a coluna cheia', async () => {
    render(<WorkItemSheet {...props({ item: { ...base, status: 'doing' }, doingCount: 3 })} />);
    await abrirEstado();

    // A trava é para ENTRAR em Fazendo; um item já em doing não pode ficar preso.
    const fazendo = screen.getByRole('option', { name: 'Fazendo' });
    expect(fazendo.getAttribute('aria-disabled')).not.toBe('true');
    expect(fazendo).toHaveTextContent('Fazendo');
  });

  it('88: reverter a alteração volta a desabilitar o Salvar (mudou recalculado)', () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    const salvar = () => screen.getByTestId('sheet-salvar') as HTMLButtonElement;
    expect(salvar().disabled).toBe(true);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    expect(salvar().disabled).toBe(false);

    // Volta ao valor original: nada mudou de novo, então Salvar re-desabilita.
    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: base.title } });
    expect(salvar().disabled).toBe(true);
    expect(p.onSave).not.toHaveBeenCalled();
  });
});

/**
 * R2-MOD-051 — Salvar fecha com escritas pendentes e divide a edição em
 * operações concorrentes.
 *
 * O contrato provado aqui é o do próprio componente: as props de escrita
 * devolvem a promessa da gravação, e o Sheet só fecha quando ela conclui. Um
 * erro mantém o formulário aberto com tudo que foi digitado, e o estado não sai
 * em paralelo com os campos.
 */
describe('WorkItemSheet — R2-MOD-051 (Salvar espera a escrita)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('mantém o formulário aberto e bloqueia novo envio enquanto a escrita não volta', async () => {
    let liberar!: () => void;
    const escrita = new Promise<void>((resolve) => { liberar = resolve; });
    const onSave = vi.fn(() => escrita);
    const p = props({ onSave });
    render(<WorkItemSheet {...p} />);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' });
    // A resposta ainda não chegou: o Salvar fica travado e a tela não fecha.
    await waitFor(() => expect((screen.getByTestId('sheet-salvar') as HTMLButtonElement).disabled).toBe(true));
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar amanhã');

    await act(async () => { liberar(); });

    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('falha na escrita mantém o formulário aberto com os campos digitados', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('falha de rede')));
    const p = props({ onSave });
    render(<WorkItemSheet {...p} />);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    fireEvent.click(screen.getByTestId('sheet-prio-urgent'));
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(await screen.findByTestId('sheet-erro-salvar')).toBeTruthy();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
    // O rascunho continua na tela para a retentativa.
    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Outro título');
    expect(screen.getByTestId('sheet-prio-urgent').getAttribute('aria-pressed')).toBe('true');
  });

  it('estado e campos não saem em duas escritas concorrentes', async () => {
    let liberarMove!: () => void;
    const onMove = vi.fn(() => new Promise<void>((resolve) => { liberarMove = resolve; }));
    const onSave = vi.fn();
    const p = props({ onMove, onSave });
    render(<WorkItemSheet {...p} />);

    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Fazendo' }));
    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(onMove).toHaveBeenCalledWith(base, 'doing', undefined);
    // Enquanto o move não volta, o patch dos campos não é disparado.
    expect(onSave).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);

    await act(async () => { liberarMove(); });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' }));
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('se o move falhar, o patch dos campos não é enviado e o formulário fica aberto', async () => {
    const onMove = vi.fn(() => Promise.reject(new Error('limite de Fazendo')));
    const onSave = vi.fn();
    const p = props({ onMove, onSave });
    render(<WorkItemSheet {...p} />);

    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Fazendo' }));
    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(await screen.findByTestId('sheet-erro-salvar')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar amanhã');
  });
});

describe('TasksModule — FASE C (etapas 26 e 27): o Sheet abre pelo card e pelo ?task=', () => {
  function renderModulo() {
    const qc = makeQueryClient();
    const Wrapper = makeWrapper(qc);
    return render(
      <MemoryRouter>
        <TooltipProvider>
          <Wrapper>
            <TasksModule />
          </Wrapper>
        </TooltipProvider>
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    setSelectResult({
      data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente', status: 'todo' })],
      error: null,
    });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('26 (vermelho antes): clicar no card abre o Sheet com os dados do item', async () => {
    window.history.replaceState(null, '', '/');
    renderModulo();

    const card = await screen.findByTestId('work-item-card');
    fireEvent.click(card.querySelector('[data-testid="work-item-open"]') ?? card);

    const titulo = await screen.findByTestId('sheet-titulo');
    expect((titulo as HTMLInputElement).value).toBe('Ligar para o cliente');
    expect(new URLSearchParams(window.location.search).get('task')).toBe('t1');
  });

  it('27: F5 com ?task=<id> reabre; fechar limpa a URL', async () => {
    window.history.replaceState(null, '', '/?task=t1');
    renderModulo();

    expect((await screen.findByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar para o cliente');

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('task')).toBeNull());
  });

  it('#R2-MOD-049: trocar o contato no Sheet persiste contact_id no update', async () => {
    // Dois contatos carregados: o que já está na tarefa e o de destino que o
    // combobox oferece (a lista de opções sai dos contatos das tarefas em tela).
    const contato = (id: string, name: string) => ({ id, name, phone: null, avatar_url: null });
    setSelectResult({
      data: [
        makeTaskRow({
          id: 't1', title: 'Ligar para o cliente', status: 'todo', position: 0,
          contact_id: 'c-ana', contact: contato('c-ana', 'Ana Souza'),
        }),
        makeTaskRow({
          id: 't2', title: 'Enviar proposta', status: 'todo', position: 1,
          contact_id: 'c-bruno', contact: contato('c-bruno', 'Bruno Lima'),
        }),
      ],
      error: null,
    });
    window.history.replaceState(null, '', '/');
    renderModulo();

    const card = await waitFor(() => {
      const el = document.querySelector('[data-item-id="t1"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    fireEvent.click(card);

    // Troca o Contato no Sheet (Radix abre pelo teclado no jsdom).
    const trigger = await screen.findByTestId('sheet-contato');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Bruno Lima' }));

    fireEvent.click(screen.getByTestId('sheet-salvar'));

    // A escrita que chega ao banco tem de levar a coluna contact_id — antes da
    // correção o patch saía vazio e o vínculo antigo permanecia.
    await waitFor(() => expect(h.update).toHaveBeenCalled());
    expect(h.update.mock.calls[0][0]).toMatchObject({ contact_id: 'c-bruno' });
  });

  it('#R2-MOD-049: escolher "Sem contato" no Sheet grava contact_id nulo', async () => {
    setSelectResult({
      data: [
        makeTaskRow({
          id: 't1', title: 'Ligar para o cliente', status: 'todo', position: 0,
          contact_id: 'c-ana',
          contact: { id: 'c-ana', name: 'Ana Souza', phone: null, avatar_url: null },
        }),
      ],
      error: null,
    });
    window.history.replaceState(null, '', '/');
    renderModulo();

    const card = await waitFor(() => {
      const el = document.querySelector('[data-item-id="t1"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    fireEvent.click(card);

    const trigger = await screen.findByTestId('sheet-contato');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Sem contato' }));

    fireEvent.click(screen.getByTestId('sheet-salvar'));

    await waitFor(() => expect(h.update).toHaveBeenCalled());
    // desvincular também é uma mudança: a coluna vai a nulo em vez de o patch
    // sair vazio e o vínculo antigo continuar.
    expect(h.update.mock.calls[0][0]).toHaveProperty('contact_id', null);
  });

  it('R2-MOD-051: o Sheet só fecha quando a escrita da tarefa termina de verdade', async () => {
    // A escrita do Supabase fica presa num "portão" que o teste só abre no fim:
    // se o módulo descartasse a promessa, a tela fecharia antes disso.
    let liberar!: () => void;
    const portao = new Promise<void>((resolve) => { liberar = resolve; });
    supabaseMock.from.mockImplementation(() => {
      const leitura = makeTaskRow({ id: 't1', title: 'Ligar para o cliente', status: 'todo' });
      const escritaLeitura = createQueryBuilder([leitura], null);
      // A escrita é uma promessa que só resolve quando o teste liberar o portão;
      // `update`/`eq` devolvem o próprio builder (como o PostgREST encadeável).
      type EscritaControlada = Promise<{ data: null; error: null }> & {
        update: (patch: unknown) => EscritaControlada;
        eq: () => EscritaControlada;
      };
      const escrita: EscritaControlada = Object.assign(
        portao.then(() => ({ data: null, error: null })),
        {
          update: (patch: unknown): EscritaControlada => {
            supabaseMock.update(patch);
            return escrita;
          },
          eq: (): EscritaControlada => escrita,
        },
      );
      return {
        select: () => escritaLeitura,
        insert: () => escrita,
        update: (patch: unknown) => { supabaseMock.update(patch); return escrita; },
        upsert: () => escrita,
      };
    });
    window.history.replaceState(null, '', '/?task=t1');
    renderModulo();

    const titulo = await screen.findByTestId('sheet-titulo');
    expect((titulo as HTMLInputElement).value).toBe('Ligar para o cliente');

    fireEvent.change(titulo, { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    // O update foi disparado, mas a resposta não voltou: o Sheet continua aberto.
    await waitFor(() => expect(supabaseMock.update).toHaveBeenCalled());
    expect(screen.getByTestId('sheet-titulo')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('task')).toBe('t1');

    await act(async () => { liberar(); });

    await waitFor(() => expect(screen.queryByTestId('sheet-titulo')).toBeNull());
    expect(new URLSearchParams(window.location.search).get('task')).toBeNull();
  });
});

/**
 * R2-MOD-051 — save prematuro: o `salvar` fecha o Sheet e dispara a edição
 * fragmentada sem esperar as escritas pendentes.
 *
 * Casos escritos ANTES da correção (vermelho): no código atual o `salvar` chama
 * `onMove` e `onSave` sem aguardar e roda `onOpenChange(false)` na mesma batida,
 * então o Sheet fecha (e o módulo descarta a promessa) com a escrita ainda em
 * voo, e o estado e os campos saem em duas escritas concorrentes.
 *
 * O contrato provado aqui é o do próprio componente: a escrita devolvida por
 * `onSave`/`onMove` é aguardada — o Sheet só fecha quando ela conclui — e a
 * edição é uma operação serializada (o patch dos campos depois do move).
 */
describe('WorkItemSheet — R2-MOD-051 (salvar espera a escrita pendente)', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('R2-MOD-051/1: escrita pendente não fecha o Sheet nem descarta o rascunho', async () => {
    let liberar!: () => void;
    // Escrita que só termina quando o teste abre o portão: é o estado real
    // entre o clique em Salvar e a resposta do banco.
    const escritaPendente = new Promise<void>((resolve) => { liberar = resolve; });
    const onSave = vi.fn(() => escritaPendente);
    const p = props({ onSave });
    render(<WorkItemSheet {...p} />);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' });
    // A escrita ainda está em voo: não pode fechar antes de ela concluir.
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByTestId('sheet-titulo') as HTMLInputElement).value).toBe('Ligar amanhã');

    // Só com a escrita concluída o Sheet fecha.
    await act(async () => { liberar(); });
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('R2-MOD-051/2: edição serializada — o patch dos campos não sai em paralelo com o move', async () => {
    let liberarMove!: () => void;
    const onMove = vi.fn(() => new Promise<void>((resolve) => { liberarMove = resolve; }));
    const onSave = vi.fn();
    const p = props({ onMove, onSave });
    render(<WorkItemSheet {...p} />);

    // Estado e campo mudam no mesmo Salvar: são duas escritas, uma de cada vez.
    await abrirEstado();
    fireEvent.click(await screen.findByRole('option', { name: 'Fazendo' }));
    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByTestId('sheet-salvar'));

    expect(onMove).toHaveBeenCalledWith(base, 'doing', undefined);
    // Enquanto o move não volta, o patch dos campos não pode sair.
    expect(onSave).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalledWith(false);

    await act(async () => { liberarMove(); });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(base, { title: 'Ligar amanhã' }));
    await waitFor(() => expect(p.onOpenChange).toHaveBeenCalledWith(false));
  });
});
