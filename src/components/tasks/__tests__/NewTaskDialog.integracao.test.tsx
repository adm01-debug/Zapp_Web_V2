/**
 * Etapas 172 e 173 (plano, linhas 452-453; T46, imagem 04, secao 3.4) do modal
 * "Nova tarefa": 172 testes do modal, 173 acessibilidade.
 * Prova a COERENCIA prazo x lembrete MONTADA no modal (verde, ambar, vermelho e
 * "sem prazo" dirigidos nos campos reais + "Ajustar" corrigindo o campo), o
 * fluxo INTEGRADO de criar (titulo/contato/prioridade/prazo/lembrete num INSERT
 * conferido no cliente Supabase falso), o descarte do rascunho, o
 * pre-preenchimento por contexto e o anuncio/foco/movimento do modal.
 */
import { resetSupabaseMock, setWriteResult, supabaseMock } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O serviço falso de contatos (uma linha): o ContactCombobox REAL o consome.
const h = vi.hoisted(() => ({
  contatos: [{ id: 'c1', name: 'Ana Souza', phone: '11999998888', avatar_url: null }],
}));

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({ contacts: h.contatos, loading: false, handleSearchChange: () => {} }),
}));

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';
import { diaLocal, horaLocal } from '@/components/tasks/shared/localDateTime';
import { duePresetISO, remindPresetISO } from '@/hooks/tasks/workItemPresets';

/**
 * 01/01/2030, 12:00 locais. A âncora é FUTURA de propósito: `createAndGetId`
 * valida o lembrete contra o relógio REAL (`assertRemindNotInPast`), então um
 * "Em 1 h" no passado real faria o INSERT ser recusado antes de chegar ao banco.
 */
const NOW = new Date(2030, 0, 1, 12, 0, 0, 0);
const HOJE = '2030-01-01';
const AMANHA_2359 = duePresetISO('tomorrow', NOW);
const EM_1H = remindPresetISO('in1h', NOW);

beforeEach(() => {
  resetSupabaseMock();
  setWriteResult({ data: { id: 'nt-1' }, error: null });
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(() => cleanup());

/** Botão de abertura (dono do foco de retorno) + controle externo + sonda. */
function AbrirEMontar(props: Parameters<typeof NewTaskDialog>[0] = {}) {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      <button type="button">Controle externo</button>
      <span data-testid="sonda-modal">{modalOpen ? 'aberto' : 'fechado'}</span>
      {modalOpen && <NewTaskDialog now={NOW} {...props} />}
    </>
  );
}

function renderizar(props: Parameters<typeof NewTaskDialog>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirEMontar {...props} />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
}

function montar(props: Parameters<typeof NewTaskDialog>[0] = {}) {
  renderizar(props);
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
}

function titulo() {
  return screen.getByTestId('new-task-title') as HTMLInputElement;
}
function campo(testid: string) {
  return screen.getByTestId(testid) as HTMLInputElement;
}
function coerencia() {
  return screen.getByTestId('nt-coerencia');
}
function sonda() {
  return screen.getByTestId('sonda-modal');
}

describe('NewTaskDialog — etapas 172–173 (integração e acessibilidade do modal)', () => {
  it('172: prazo Amanhã + lembrete Em 1h deixam a coerência VERDE (role de status)', () => {
    montar();

    // Sem nada escolhido não há o que conferir (a faixa não existe).
    expect(screen.queryByTestId('nt-coerencia')).toBeNull();

    fireEvent.click(campo('new-task-prazo-amanha'));
    fireEvent.click(campo('nt-lembrete-em-1h'));

    const faixa = coerencia();
    expect(faixa.getAttribute('data-state')).toBe('ok');
    expect(faixa).toHaveAttribute('role', 'status');
    expect(faixa).toHaveTextContent('Lembrete programado para antes do prazo.');
    // Coerente não tem o que ajustar.
    expect(screen.queryByTestId('nt-coerencia-ajustar')).toBeNull();
  });

  it('172: lembrete depois do prazo vira âmbar e o "Ajustar" corrige o campo para 1h antes', () => {
    montar();

    fireEvent.click(campo('new-task-prazo-hoje')); // 01/01 23:59
    fireEvent.change(campo('nt-lembrete-data'), { target: { value: HOJE } });
    fireEvent.change(campo('nt-lembrete-hora'), { target: { value: '23:59' } }); // igual ao prazo

    const faixa = coerencia();
    expect(faixa.getAttribute('data-state')).toBe('after_due');
    expect(faixa).toHaveAttribute('role', 'alert');
    expect(faixa).toHaveTextContent('O lembrete precisa ser antes do prazo.');

    // O atalho ajusta o próprio campo de lembrete para 22:59 (1 h antes).
    fireEvent.click(screen.getByTestId('nt-coerencia-ajustar'));

    expect(campo('nt-lembrete-hora').value).toBe('22:59');
    expect(coerencia().getAttribute('data-state')).toBe('ok');
  });

  it('172: lembrete sem prazo avisa em âmbar e NÃO oferece um ajuste que não resolveria', () => {
    montar();

    fireEvent.click(campo('nt-lembrete-em-1h'));

    expect(coerencia().getAttribute('data-state')).toBe('no_due');
    expect(coerencia()).toHaveTextContent('Sem prazo definido');
    expect(screen.queryByTestId('nt-coerencia-ajustar')).toBeNull();
  });

  it('172: lembrete no passado avisa em vermelho (role de alerta)', () => {
    montar();

    fireEvent.click(campo('new-task-prazo-amanha'));
    fireEvent.change(campo('nt-lembrete-data'), { target: { value: '2029-12-31' } });
    fireEvent.change(campo('nt-lembrete-hora'), { target: { value: '09:00' } });

    expect(coerencia().getAttribute('data-state')).toBe('in_past');
    expect(coerencia()).toHaveAttribute('role', 'alert');
    expect(coerencia()).toHaveTextContent('O lembrete precisa estar no futuro.');
  });

  it('172: o fluxo inteiro (campos, presets e coerência) leva prazo, lembrete e contato ao INSERT', async () => {
    montar();

    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana sobre o orçamento' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }));

    // Contato pelo combobox REAL (o serviço falso de uma linha).
    fireEvent.click(campo('new-task-contact'));
    fireEvent.click(await screen.findByRole('option', { name: /Ana Souza/ }));

    fireEvent.click(campo('new-task-prazo-amanha'));
    fireEvent.click(campo('nt-lembrete-em-1h'));
    expect(coerencia().getAttribute('data-state')).toBe('ok');

    // Criar pelo rodapé (etapa 167); o Ctrl+Enter já tem prova no rodape.test.
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(supabaseMock.insert).toHaveBeenCalledTimes(1));
    expect(supabaseMock.insert.mock.calls[0][0]).toMatchObject({
      title: 'Ligar para Ana sobre o orçamento',
      status: 'backlog',
      priority: 'high',
      contact_id: 'c1',
      due_date: AMANHA_2359,
      remind_at: EM_1H,
    });
    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
  });

  it('172: prazo e lembrete vindos do contexto pré-preenchem os campos e nascem coerentes', () => {
    montar({ defaultDueDate: AMANHA_2359, defaultRemindAt: EM_1H });

    expect(campo('new-task-prazo-data').value).toBe(diaLocal(AMANHA_2359));
    expect(campo('new-task-prazo-hora').value).toBe(horaLocal(AMANHA_2359));
    expect(campo('nt-lembrete-data').value).toBe(diaLocal(EM_1H));
    expect(campo('nt-lembrete-hora').value).toBe(horaLocal(EM_1H));
    expect(coerencia().getAttribute('data-state')).toBe('ok');
  });

  it('172: descartar o rascunho não cria nada e o "Continuar editando" preserva o que foi digitado', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(await screen.findByTestId('nt-descarte')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nt-descarte-continuar'));

    await waitFor(() => expect(screen.queryByTestId('nt-descarte')).toBeNull());
    expect(titulo().value).toBe('Ligar para Ana');

    // Agora descarta de fato: fecha e nada vai ao banco.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(await screen.findByTestId('nt-descarte-confirmar'));

    await waitFor(() => expect(sonda()).toHaveTextContent('fechado'));
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });

  it('173: o anúncio vem do diálogo — nome e descrição ligados por aria-*', () => {
    montar();

    const dialogo = screen.getByRole('dialog', { name: 'Nova tarefa' });
    const descrito = dialogo.getAttribute('aria-describedby');
    expect(descrito).toBeTruthy();
    expect(document.getElementById(descrito as string)).toHaveTextContent(
      'Capture agora. Organize o próximo passo.',
    );
    // O título também é um cabeçalho de verdade (leitor de tela navega por ele).
    expect(screen.getByRole('heading', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('173: sem violação de acessibilidade (axe) com a coerência e a prévia na tela', async () => {
    montar();
    fireEvent.change(titulo(), { target: { value: 'Ligar para Ana' } });
    fireEvent.click(campo('new-task-prazo-amanha'));
    fireEvent.click(campo('nt-lembrete-em-1h'));
    fireEvent.click(campo('nt-previa-gatilho'));

    expect(coerencia()).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('173: o foco entra no modal e a tela de trás sai da árvore de acessibilidade (foco preso)', async () => {
    renderizar();
    // Gatilho e externo são lidos ANTES de abrir: abertos, ficam aria-hidden.
    const gatilho = screen.getByRole('button', { name: 'abrir modal' });
    const externo = screen.getByRole('button', { name: 'Controle externo' });
    fireEvent.click(gatilho);

    const dialogo = screen.getByRole('dialog', { name: 'Nova tarefa' });

    // O foco inicial entra no modal (o Título recebe o `autoFocus`).
    await waitFor(() => expect(dialogo).toContainElement(document.activeElement as HTMLElement));

    // O resto da tela fica fora da árvore de acessibilidade — o modal é a única
    // região alcançável pelo foco/leitor enquanto está aberto.
    expect(externo.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(gatilho.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(dialogo.closest('[aria-hidden="true"]')).toBeNull();

    // Os dois guardas de foco das bordas estão montados (o ciclo do TAB é do
    // navegador e não roda no jsdom — ver a nota no topo do arquivo).
    expect(document.querySelectorAll('[data-radix-focus-guard]').length).toBe(2);
  });

  it('173: o único movimento do modal (rotação do chevron da prévia) está sob motion-safe', () => {
    montar();

    const chevron = screen.getByTestId('nt-previa-gatilho').querySelector('svg');
    expect(chevron).toBeTruthy();
    const classe = chevron!.getAttribute('class') ?? '';
    // `motion-safe:` desliga a rotação com `prefers-reduced-motion`.
    expect(classe).toContain('transition-transform');
    expect(classe).toContain('motion-safe:data-[state=open]:rotate-180');
  });
});
