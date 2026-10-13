/**
 * Etapas 154 a 158 (plano, linhas 434–438; imagem 04, seção 3.4) — o modal
 * "Nova tarefa": componente, cabeçalho com título/subtítulo, campo Título,
 * campo Contato e prioridade segmentada.
 *
 * O que este arquivo prova, e por quê:
 *  - o modal nasce do MESMO `TasksUiContext` do resto do módulo: quem o monta
 *    quando `modalOpen` (o `TasksModule`) o monta no clique do cabeçalho — a
 *    prova usa o provedor REAL e uma sonda pelo `useTasksUi()`;
 *  - o campo Título conta os caracteres e mostra o erro inline só depois de
 *    tocado e vazio (o `maxLength` de 200 sai do mesmo teto do contador);
 *  - o campo Contato usa o `ContactCombobox` REAL: o serviço de busca é trocado
 *    por um falso (uma linha) e o teste clica nela para provar que o avatar e o
 *    nome aparecem — não um mock que já traz a resposta pronta;
 *  - a prioridade é um radiogroup de verdade: Média é o padrão e as setas
 *    trocam a escolha, com volta no fim.
 */
// Sem `import '@/test/mocks/tarefas'`: o harness compartilhado é criado por outro
// cartão; este teste NÃO depende dele (o modal não toca Supabase/useAuth aqui —
// o único serviço externo, `useContactsSearch`, é trocado logo abaixo). Trazer o
// harness criava uma dependência entre cartões: empilhado sem ele, o arquivo
// falhava no import e derrubava a suíte inteira (era o defeito do refazer).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getInitials } from '@/lib/avatar-colors';

// O serviço falso de contatos. `vi.hoisted` porque o `vi.mock` abaixo é içado
// acima das declarações do arquivo.
const h = vi.hoisted(() => ({
  contatos: [
    { id: 'c1', name: 'Ana Souza', phone: '11999998888', avatar_url: null },
  ],
}));

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({
    contacts: h.contatos,
    loading: false,
    handleSearchChange: () => {},
  }),
}));

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

/** Botão de abertura + sonda do mesmo contexto, como no módulo real. */
function AbrirEMontar(props: Parameters<typeof NewTaskDialog>[0] = {}) {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      <span data-testid="sonda-modal">{modalOpen ? 'aberto' : 'fechado'}</span>
      {modalOpen && <NewTaskDialog {...props} />}
    </>
  );
}

function montar(props: Parameters<typeof NewTaskDialog>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirEMontar {...props} />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
  return utils;
}

const campoTitulo = () => screen.getByTestId('new-task-title') as HTMLInputElement;
const segmento = (nome: string) => screen.getByRole('radio', { name: nome });

describe('NewTaskDialog — modal "Nova tarefa" (etapas 154–158)', () => {
  beforeEach(() => {
    cleanup();
    // jsdom não tem as APIs de ponteiro/rolagem que o Radix (Popover) e o cmdk
    // (Command) usam — mesmo polyfill dos outros testes de Tarefas.
    const proto = Element.prototype as unknown as Record<string, () => unknown>;
    proto.hasPointerCapture ??= () => false;
    proto.setPointerCapture ??= () => undefined;
    proto.releasePointerCapture ??= () => undefined;
    proto.scrollIntoView ??= () => undefined;
  });
  afterEach(() => {
    cleanup();
  });

  it('etapa 155: cabeçalho com ícone, título, subtítulo, fechar e foco inicial no Título', async () => {
    montar();

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('heading', { name: 'Nova tarefa' })).toBeTruthy();
    expect(within(dialogo).getByText('Capture agora. Organize o próximo passo.')).toBeTruthy();
    expect(within(dialogo).getByTestId('new-task-icon')).toBeTruthy();
    // O "fechar" do Dialog do projeto (o mesmo do resto do app).
    expect(within(dialogo).getByRole('button', { name: 'Close' })).toBeTruthy();
    // O rótulo está ligado ao campo (getByLabelText falha se o htmlFor quebrar).
    expect(screen.getByLabelText('Título da tarefa')).toBe(campoTitulo());

    await waitFor(() => expect(document.activeElement).toBe(campoTitulo()));
  });

  it('etapa 154: fechar o modal pelo Esc devolve o contexto para fechado', async () => {
    montar();
    expect(screen.getByTestId('sonda-modal').textContent).toBe('aberto');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('sonda-modal').textContent).toBe('fechado');
  });

  it('etapa 156: contador discreto e erro inline só depois de tocar e sair vazio', () => {
    montar();

    expect(screen.getByTestId('new-task-title-counter').textContent).toBe('0/200');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(campoTitulo(), { target: { value: 'Ligar para o cliente' } });
    expect(screen.getByTestId('new-task-title-counter').textContent).toBe('20/200');

    fireEvent.change(campoTitulo(), { target: { value: '' } });
    fireEvent.blur(campoTitulo());

    expect(screen.getByRole('alert').textContent).toBe('Informe o título da tarefa.');
    expect(campoTitulo().getAttribute('aria-invalid')).toBe('true');
    expect(campoTitulo().getAttribute('maxLength')).toBe('200');

    // Ao voltar a digitar, o erro inline some (não é um aviso grudado).
    fireEvent.change(campoTitulo(), { target: { value: 'Retomar orçamento' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(campoTitulo().getAttribute('aria-invalid')).toBe('false');
  });

  it('etapa 157: mostra "Sem contato" e o contato escolhido vira avatar + nome', async () => {
    montar();

    const gatilho = screen.getByTestId('new-task-contact');
    expect(gatilho.textContent).toContain('Sem contato');

    // Abre o popover e busca no serviço FALSO (uma linha só).
    fireEvent.pointerDown(gatilho, { button: 0 });
    fireEvent.click(gatilho);
    const opcao = await screen.findByTestId('contact-combobox-option');
    expect(opcao.textContent).toContain('Ana Souza');

    fireEvent.click(opcao);

    await waitFor(() => expect(screen.getByTestId('new-task-contact').textContent).toContain('Ana Souza'));
    expect(screen.getByTestId('new-task-contact').getAttribute('aria-label')).toContain('Ana Souza');
    // O avatar do chip: sem foto, a inicial determinística de "Ana Souza".
    expect(within(screen.getByTestId('new-task-contact')).getByText(getInitials('Ana Souza'))).toBeTruthy();
  });

  it('etapa 157: contato pré-preenchido quando o modal nasce de um contato', () => {
    montar({ defaultContactId: 'c1', defaultContact: { id: 'c1', name: 'Ana Souza' } });

    const gatilho = screen.getByTestId('new-task-contact');
    expect(gatilho.textContent).toContain('Ana Souza');
    expect(gatilho.textContent).not.toContain('Sem contato');
  });

  it('etapa 158: Média é o padrão e as setas trocam o segmento escolhido', () => {
    montar();

    const grupo = screen.getByRole('radiogroup', { name: 'Prioridade' });
    expect(within(grupo).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Baixa', 'Média', 'Alta', 'Urgente',
    ]);
    expect(segmento('Média').getAttribute('aria-checked')).toBe('true');

    // Setas avançam e voltam, com volta no fim da lista.
    fireEvent.keyDown(segmento('Média'), { key: 'ArrowRight' });
    expect(segmento('Alta').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(segmento('Alta'), { key: 'ArrowRight' });
    expect(segmento('Urgente').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(segmento('Urgente'), { key: 'ArrowRight' });
    expect(segmento('Baixa').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(segmento('Baixa'), { key: 'ArrowLeft' });
    expect(segmento('Urgente').getAttribute('aria-checked')).toBe('true');

    // Só o escolhido entra na ordem de tabulação do grupo.
    expect(segmento('Urgente').getAttribute('tabindex')).toBe('0');
    expect(segmento('Média').getAttribute('tabindex')).toBe('-1');
  });

  it('sem violação de acessibilidade (axe)', async () => {
    montar();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
