/**
 * Etapa 046 do plano (seção 8-bis) — testes da barra de ferramentas de Tarefas.
 *
 * O que este arquivo tranca, pela TELA REAL (o `TasksModule` montado, com a
 * barra, o `useTasksFilters` e a URL de verdade) — não por mock do componente:
 *  - busca por texto: digitação imediata, debounce de 200ms e o "Limpar";
 *  - dropdowns: o `Select` de Prioridade abre, lista e aplica (Radix dirigido
 *    por `pointerDown`, a receita que já roda no domínio vizinho);
 *  - popover de filtros (Contato): abre, marca, fecha ao escolher e desmarca;
 *  - indicador de filtro ativo: o "Limpar" (X) aparece, reflete e remove;
 *  - sincronia com a URL: cada filtro vira parâmetro e o estado inicial é lido
 *    da URL (deep-link); o padrão não escreve nada;
 *  - toggle de concluídas: alterna a exibição respeitando a janela de 7 dias
 *    (decisão vigente G-8, seção 8-bis).
 *
 * Seção 8-bis que cada caso protege está citada no `it`.
 * Radix (Select/Popover) exige os métodos de captura de ponteiro, ausentes no
 * jsdom — o polyfill é o mesmo de `cardAcoes.test.tsx`/`WorkItemSheet.test.tsx`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  resetSupabaseMock,
  setSelectResult,
  makeTaskRow,
  makeQueryClient,
  makeWrapper,
} from '@/test/mocks/tarefas';

import { TasksModule } from '@/components/tasks/TasksModule';
import { TooltipProvider } from '@/components/ui/tooltip';

const MODE_STORAGE_KEY = 'tasks-mode';

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

function renderModule() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      {/* O board usa `Tooltip` (BoardColumn) e a app fornece o provider em AppProviders. */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Abre um Select do Radix com o evento real do usuário e escolhe a opção. */
function escolherNoSelect(label: string, opcao: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: label }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

function diasAtras(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const CONTATO = { id: 'c1', name: 'Ana Souza', phone: null, avatar_url: null };

/** Carga base: uma aberta urgente com contato e uma concluída hoje (prioridade média). */
function cargaBase() {
  return [
    makeTaskRow({
      id: 'a', title: 'Ligar', status: 'todo', priority: 'urgent',
      contact: CONTATO, contact_id: 'c1',
    }),
    makeTaskRow({
      id: 'b', title: 'Feita', status: 'done', priority: 'medium',
      completed_at: new Date().toISOString(),
    }),
  ];
}

/** A barra monta junto com o módulo; o Quadro é o modo em que a concluída
 *  recente fica visível na coluna Concluído (na Lista ela nasce recolhida). */
function montarBarraComQuadro() {
  localStorage.setItem(MODE_STORAGE_KEY, 'board');
  setSelectResult({ data: cargaBase(), error: null });
  renderModule();
  return screen.findByTestId('tasks-filter-bar');
}

describe('Etapa 046 — busca por texto (digitação, debounce e limpar)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('a digitação anda na hora e o recorte só chega depois do debounce, sem `q` na URL', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Ligar')).toBeTruthy();

    const campo = screen.getByRole('searchbox', { name: 'Buscar tarefa' }) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'feita' } });

    // imediato: o texto do campo muda, mas o recorte NÃO (o filtro é debounced)
    expect(campo.value).toBe('feita');
    expect(screen.getByText('Ligar')).toBeTruthy();

    // depois de 200ms o recorte acompanha — é o sinal do debounce
    await waitFor(() => expect(screen.queryByText('Ligar')).toBeNull());
    // seção 8-bis (Fase F): o texto da busca não viaja na URL
    expect(window.location.search).not.toContain('q=');
  });

  it('o "Limpar" limpa o campo e CANCELA o debounce pendente (o recorte não ressuscita)', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Ligar')).toBeTruthy();

    const campo = screen.getByRole('searchbox', { name: 'Buscar tarefa' }) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'feita' } });

    fireEvent.click(await screen.findByRole('button', { name: /Limpar/ }));

    expect(campo.value).toBe('');
    expect(screen.queryByRole('button', { name: /Limpar/ })).toBeNull();

    // sem cancelar o timer, 200ms depois o filtro antigo voltaria com o campo vazio
    await new Promise(r => setTimeout(r, 300));
    expect(screen.getByText('Ligar')).toBeTruthy();
    expect(window.location.search).toBe('');
  });
});

describe('Etapa 046 — dropdowns da barra (Select de prioridade)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('abre, lista as opções e aplica a prioridade escolhida (URL reflete)', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Feita')).toBeTruthy();

    const gatilho = screen.getByRole('combobox', { name: 'Prioridade' });
    fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' });

    // as opções do módulo (padrão + as 4 prioridades de `PRIORITY_LABELS`)
    expect(await screen.findByRole('option', { name: 'Todas as prioridades' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Urgente' })).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: 'Urgente' }));

    // recorte: a "Ligar" (urgente) fica, a "Feita" (média) sai — seção 8-bis
    // ("filtro é recorte de TELA")
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    expect(screen.getByText('Ligar')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('prio')).toBe('urgent');
  });
});

describe('Etapa 046 — popover de filtros (contato): abre, marca, fecha e desmarca', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('abre com "Todos os contatos", aplica o contato, fecha ao escolher e desmarca depois', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Ligar')).toBeTruthy();

    const gatilho = screen.getByLabelText('Contato');
    expect(gatilho.textContent).toBe('Todos os contatos');

    // abrir
    fireEvent.click(gatilho);
    const opcao = await screen.findByRole('option', { name: /Ana Souza/ });

    // marcar/aplicar: escolher o contato recorta e fecha o popover
    fireEvent.click(opcao);
    await waitFor(() => expect(screen.getByLabelText('Contato').textContent).toBe('Ana Souza'));
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    expect(screen.getByText('Ligar')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('contact')).toBe('c1');
    expect(screen.queryByPlaceholderText('Buscar contato…')).toBeNull();

    // desmarcar: "Todos os contatos" devolve o filtro e a tela
    fireEvent.click(screen.getByLabelText('Contato'));
    fireEvent.click(await screen.findByRole('option', { name: 'Todos os contatos' }));
    await waitFor(() => expect(screen.getByLabelText('Contato').textContent).toBe('Todos os contatos'));
    expect(new URLSearchParams(window.location.search).get('contact')).toBeNull();
    await waitFor(() => expect(screen.getByText('Feita')).toBeTruthy());
  });
});

describe('Etapa 046 — indicador de filtro ativo', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('o "Limpar" (X) só aparece com filtro fora do padrão e remove o filtro ao clicar', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Ligar')).toBeTruthy();

    // padrão: nenhum filtro ativo, nenhum "Limpar"
    expect(screen.queryByRole('button', { name: /Limpar/ })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Com alarme' }));

    const limpar = await screen.findByRole('button', { name: /Limpar/ });
    expect(limpar.querySelector('svg')).toBeTruthy(); // o X
    expect(new URLSearchParams(window.location.search).get('alarm')).toBe('1');

    fireEvent.click(limpar);

    expect(screen.queryByRole('button', { name: /Limpar/ })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Com alarme' }).getAttribute('data-state')).toBe('unchecked');
    expect(window.location.search).toBe('');
  });

  it.todo('chips de filtro ativo com X: o elemento não existe no HEAD — a etapa 044 (iris) é dona do chip; hoje quem indica e remove o filtro ativo é o botão "Limpar"');
});

describe('Etapa 046 — sincronia com a URL (parâmetros e deep-link)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('nasce do deep-link: prioridade, alarme, concluídas e contato são lidos da URL', async () => {
    window.history.replaceState(null, '', '/?prio=high&alarm=1&done=0&contact=c1');
    setSelectResult({ data: cargaBase(), error: null });

    renderModule();
    await screen.findByTestId('tasks-filter-bar');

    expect(screen.getByRole('combobox', { name: 'Prioridade' }).textContent).toContain('Alta');
    expect(screen.getByRole('switch', { name: 'Com alarme' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('switch', { name: 'Mostrar concluídas' }).getAttribute('data-state')).toBe('unchecked');
    // o rótulo do contato só resolve depois da carga (antes disso a lista de
    // opções está vazia e o gatilho diz "Contato indisponível" de propósito)
    await waitFor(() => expect(screen.getByLabelText('Contato').textContent).toBe('Ana Souza'));
    // com filtro ativo, o "Limpar" está na tela (nome exato: o vazio da Etapa
    // 045 usa "Limpar filtros" e não deve casar aqui)
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeTruthy();
  });

  it('cada controle escreve o seu parâmetro; o estado padrão não escreve nada', async () => {
    await montarBarraComQuadro();
    expect(await screen.findByText('Ligar')).toBeTruthy();
    expect(window.location.search).toBe('');

    // `done` é o padrão `true`: o que viaja é a exceção (`done=0`)
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('done')).toBe('0'));

    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});

describe('Etapa 046 — toggle de concluídas e a janela de 7 dias (G-8)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    localStorage.setItem(MODE_STORAGE_KEY, 'board');
    setSelectResult({
      data: [
        makeTaskRow({ id: 'a', title: 'Em aberto', status: 'todo' }),
        makeTaskRow({
          id: 'b', title: 'Feita hoje', status: 'done',
          completed_at: new Date().toISOString(),
        }),
        makeTaskRow({
          id: 'c', title: 'Feita antiga', status: 'done',
          completed_at: diasAtras(13),
        }),
      ],
      error: null,
    });
  });

  it('alterna a exibição e, ao mostrar de novo, a janela de 7 dias volta a valer', async () => {
    renderModule();
    expect(await screen.findByText('Em aberto')).toBeTruthy();

    // janela de 7 dias (G-8): a recente aparece; a de 13 dias fica atrás do
    // rodapé do Quadro, que é quem revela as de 8–30 dias
    expect(screen.getByText('Feita hoje')).toBeTruthy();
    expect(screen.queryByText('Feita antiga')).toBeNull();

    // alterna: esconder as concluídas tira as recentes E as antigas, e a URL diz
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));
    await waitFor(() => expect(screen.queryByText('Feita hoje')).toBeNull());
    expect(screen.queryByText('Feita antiga')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('done')).toBe('0');

    // os três modos seguem o mesmo recorte: a aberta continua na tela
    expect(screen.getByText('Em aberto')).toBeTruthy();

    // mostrar de novo: a recente volta, a antiga NÃO (a janela de 7 dias voltou)
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));
    await waitFor(() => expect(screen.getByText('Feita hoje')).toBeTruthy());
    expect(screen.queryByText('Feita antiga')).toBeNull();

    // e o rodapé do Quadro prova que é a janela que a esconde (não a falta de dado)
    fireEvent.click(screen.getByRole('button', { name: 'Ver mais antigas (30 dias)' }));
    expect(await screen.findByText('Feita antiga')).toBeTruthy();
  });
});
