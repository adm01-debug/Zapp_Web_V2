import { describe, it, expect } from 'vitest';
import { boardByDue, boardDueColumns, BOARD_DUE_COLUMNS } from '../workItemBoardGroups';
import type { WorkItem } from '../workItem.types';

// 03/10/2026, meio-dia LOCAL — os prazos abaixo são montados na hora local, então
// o teste vale em qualquer fuso (nada de string ISO com Z amarrada ao relógio).
const now = new Date(2026, 9, 3, 12, 0, 0);
const at = (y: number, m: number, d: number, h = 23, min = 59) =>
  new Date(y, m - 1, d, h, min).toISOString();

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 'p1',
    title: 'Test',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: now.toISOString(),
    completed_at: null,
    contact_id: null,
    created_by: 'p1',
    assigned_to: 'p1',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

const ids = (items: WorkItem[]) => items.map(i => i.id);

describe('boardByDue — colunas por prazo (etapa 101 / D1)', () => {
  const atrasadaDeOntem = makeItem({ id: 'a1', due_date: at(2026, 10, 2) });
  const atrasadaDeHojeComHora = makeItem({ id: 'a2', due_date: at(2026, 10, 3, 9, 0) });
  const hojeDiaInteiro = makeItem({ id: 'h1', due_date: at(2026, 10, 3) });
  const hojeHoraFutura = makeItem({ id: 'h2', due_date: at(2026, 10, 3, 14, 0) });
  const amanha = makeItem({ id: 'f1', due_date: at(2026, 10, 4) });
  const futuro = makeItem({ id: 'f2', due_date: at(2026, 10, 6) });
  const semPrazo = makeItem({ id: 'f3', due_date: null });
  const concluidaRecente = makeItem({ id: 'c1', status: 'done', completed_at: at(2026, 10, 2) });
  const concluidaSemCarimbo = makeItem({ id: 'c2', status: 'done', completed_at: null });

  const todos = [
    atrasadaDeOntem, atrasadaDeHojeComHora, hojeDiaInteiro, hojeHoraFutura,
    amanha, futuro, semPrazo, concluidaRecente, concluidaSemCarimbo,
  ];

  it('cada item cai em UMA coluna: nada some e nada duplica', () => {
    const col = boardByDue(todos, now);
    const todosIds = [
      ...ids(col.atrasadas), ...ids(col.paraHoje), ...ids(col.fazendo), ...ids(col.concluidas),
    ];

    expect(todosIds).toHaveLength(todos.length);          // soma = entrada, sem coluna vazia
    expect(new Set(todosIds).size).toBe(todos.length);    // nenhum id repetido entre colunas
  });

  it('prazo com hora que JÁ passou (hoje às 9h) é Atrasada, não Para hoje (R2-MOD-058)', () => {
    const col = boardByDue(todos, now);

    expect(ids(col.atrasadas)).toEqual(['a1', 'a2']);
    // dentro de "Para hoje" a hora manda: 14:00 antes das 23:59 do dia inteiro
    expect(ids(col.paraHoje)).toEqual(['h2', 'h1']);
  });

  it('prazo de dia inteiro de hoje (23:59) ainda vale como Para hoje ao meio-dia', () => {
    const col = boardByDue([hojeDiaInteiro], now);

    expect(ids(col.paraHoje)).toEqual(['h1']);
    expect(col.atrasadas).toEqual([]);
  });

  it('o resto do aberto (amanhã, futuro e sem prazo) fica em Fazendo', () => {
    const col = boardByDue([amanha, futuro, semPrazo], now);

    expect(ids(col.fazendo).sort()).toEqual(['f1', 'f2', 'f3']);
    expect(col.atrasadas).toEqual([]);
    expect(col.paraHoje).toEqual([]);
  });

  it('fazendo ordena por prazo e põe o "sem prazo" no fim', () => {
    const col = boardByDue([semPrazo, futuro, amanha], now);

    expect(ids(col.fazendo)).toEqual(['f1', 'f2', 'f3']);
  });

  it('concluída recente entra em Concluídas, inclusive SEM carimbo (tarefa não some)', () => {
    const col = boardByDue([concluidaRecente, concluidaSemCarimbo], now);

    expect(ids(col.concluidas).sort()).toEqual(['c1', 'c2']);
  });

  it('concluída há mais de 7 dias NÃO entra (é o recorte do "ver mais (30 dias)")', () => {
    const antiga = makeItem({ id: 'c3', status: 'done', completed_at: at(2026, 9, 20) });
    const col = boardByDue([concluidaRecente, antiga], now);

    expect(ids(col.concluidas)).toEqual(['c1']);
    expect(ids(col.atrasadas)).not.toContain('c3');
    expect(ids(col.paraHoje)).not.toContain('c3');
    expect(ids(col.fazendo)).not.toContain('c3');
  });

  it('cancelada não aparece em coluna nenhuma', () => {
    const cancelada = makeItem({ id: 'x1', status: 'cancelled', due_date: at(2026, 10, 2) });
    const col = boardByDue([cancelada, hojeDiaInteiro], now);
    const todosIds = [
      ...ids(col.atrasadas), ...ids(col.paraHoje), ...ids(col.fazendo), ...ids(col.concluidas),
    ];

    expect(todosIds).toEqual(['h1']);
  });

  it('Atrasadas ordena por prazo mais antigo primeiro e desempata por prioridade', () => {
    const doDia1 = makeItem({ id: 'o1', due_date: at(2026, 10, 1), priority: 'low' });
    const mesmoPrazoUrgente = makeItem({ id: 'o2', due_date: at(2026, 10, 2), priority: 'urgent' });
    const mesmoPrazoAlta = makeItem({ id: 'o3', due_date: at(2026, 10, 2), priority: 'high' });
    const col = boardByDue([mesmoPrazoAlta, doDia1, mesmoPrazoUrgente], now);

    expect(ids(col.atrasadas)).toEqual(['o1', 'o2', 'o3']);
  });

  it('empate total (prazo, prioridade e criação iguais) desempata pelo id — ordem estável', () => {
    const b = makeItem({ id: 'b', due_date: at(2026, 10, 1), priority: 'high' });
    const a = makeItem({ id: 'a', due_date: at(2026, 10, 1), priority: 'high' });
    const col = boardByDue([b, a], now);

    expect(ids(col.atrasadas)).toEqual(['a', 'b']);
    expect(ids(boardByDue([a, b], now).atrasadas)).toEqual(['a', 'b']);
  });

  it('é somente leitura: não muda a ordem da lista recebida nem troca as referências', () => {
    const entrada = [futuro, atrasadaDeOntem, semPrazo];
    const antes = ids(entrada);

    const col = boardByDue(entrada, now);

    expect(ids(entrada)).toEqual(antes);                       // a entrada ficou como estava
    expect(col.atrasadas[0]).toBe(atrasadaDeOntem);            // mesmos objetos, sem cópia
    expect(col.fazendo).not.toBe(entrada);                     // array novo, não o da entrada
  });

  it('lista nula não derruba (guarda `items ?? []`)', () => {
    const col = boardByDue(undefined as unknown as WorkItem[], now);

    expect(col).toEqual({ atrasadas: [], paraHoje: [], fazendo: [], concluidas: [] });
  });
});

describe('boardDueColumns — ordem e rótulos da imagem 03', () => {
  it('devolve as quatro colunas na ordem Atrasadas, Para hoje, Fazendo, Concluídas', () => {
    const colunas = boardDueColumns([], now);

    expect(colunas.map(c => c.key)).toEqual(['atrasadas', 'paraHoje', 'fazendo', 'concluidas']);
    expect(colunas.map(c => c.label)).toEqual(['Atrasadas', 'Para hoje', 'Fazendo', 'Concluídas']);
    expect(BOARD_DUE_COLUMNS.map(c => c.key)).toEqual(colunas.map(c => c.key));
  });

  it('cada coluna traz os MESMOS itens do boardByDue (uma verdade só)', () => {
    const itens = [
      makeItem({ id: 'a', due_date: at(2026, 10, 1) }),
      makeItem({ id: 'h', due_date: at(2026, 10, 3) }),
      makeItem({ id: 'f', due_date: null }),
      makeItem({ id: 'c', status: 'done', completed_at: at(2026, 10, 2) }),
    ];
    const porChave = boardByDue(itens, now);
    const colunas = boardDueColumns(itens, now);

    for (const c of colunas) expect(ids(c.items)).toEqual(ids(porChave[c.key]));
  });
});
