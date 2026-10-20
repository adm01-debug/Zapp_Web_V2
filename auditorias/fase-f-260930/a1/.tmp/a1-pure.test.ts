/* A1 — sondas puras: parse/serialize da URL, applyFilters, bucketByDue.
 * Nao corrige nada: so mede. Saida crua via console.log com prefixo A1-*. */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  filtersFromSearch,
  isFilterActive,
  searchWithFilters,
} from '@/hooks/tasks/workItemFilters';
import { applyFilters, bucketByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

let seq = 0;
function item(over: Partial<WorkItem> = {}): WorkItem {
  const iso = new Date().toISOString();
  return {
    id: 'i' + ++seq, title: 'Tarefa', description: null, status: 'todo' as const,
    priority: 'medium' as const, due_date: null, remind_at: null, notified_at: null,
    waiting_reason: null, position: 0, started_at: null, status_changed_at: iso,
    completed_at: null, contact_id: null, created_by: 'u', assigned_to: 'u',
    created_at: iso, updated_at: iso, contact: null, ...over,
  };
}

const NFD_CAFE = 'cafe\u0301';

const FUZZ = [
  '?prio=zzz', '?prio=all', '?prio=URGENT', '?alarm=2', '?alarm=0', '?alarm=true',
  '?done=', '?done=1', '?done=0', '?done=yes', '?contact=', '?contact=%20',
  '?q=%E0%A4%A', '?q=%', '?q=+', '?q=%2B', '?q=%20%20', '?q=%C3%A9',
  '?q=' + 'a'.repeat(100000),
  '?q=a&q=b', '?q=a&q=b&q=c', '?q=&q=liga', '?q=liga&q=',
  '??', '?=x&q=y', '?q=🎉🎉', '?__proto__[x]=1', '?constructor=1', '?toString=1',
  '?q=' + '%C3%A9'.repeat(50000),
  '?alarm=1&alarm=0', '?prio=high&prio=low',
  '\u0000', '?.', '?q=%00', '?q=\u0000',
];

describe('A1 — fuzz do parse/serialize da URL', () => {
  it('imprime leitura e reescrita de cada URL hostil', () => {
    for (const s of FUZZ) {
      let lido: unknown, reescrito: string, lidoDeNovo: unknown, erro: string | null = null;
      try {
        lido = filtersFromSearch(s);
        reescrito = searchWithFilters(s, lido as never);
        lidoDeNovo = filtersFromSearch(reescrito);
      } catch (e) {
        erro = String(e);
        console.log('A1-FUZZ', JSON.stringify({ url: s.length > 60 ? s.slice(0, 60) + '…(' + s.length + ')' : s, erro }));
        continue;
      }
      const estavel = JSON.stringify(lido) === JSON.stringify(lidoDeNovo);
      console.log('A1-FUZZ', JSON.stringify({
        url: s.length > 60 ? s.slice(0, 60) + '…(' + s.length + ')' : s,
        lido, reescrito: reescrito.length > 60 ? reescrito.slice(0, 60) + '…(' + reescrito.length + ')' : reescrito,
        estavel, ativo: isFilterActive(lido as never),
      }));
    }
    expect(true).toBe(true);
  });

  it('URL 100k chars: ida e volta', () => {
    const grande = '?q=' + 'a'.repeat(100000);
    const f = filtersFromSearch(grande);
    const volta = searchWithFilters(grande, f);
    console.log('A1-GRANDE', JSON.stringify({ qLen: f.q.length, urlLen: grande.length, voltaLen: volta.length, igual: filtersFromSearch(volta).q.length }));
    expect(f.q.length).toBe(100000);
  });

  it('idempotencia: filtros lidos de uma URL nao sobrevivem a reescrita', () => {
    const s = '?q=%20%20';
    const lido = filtersFromSearch(s);
    const reescrito = searchWithFilters(s, lido);
    const lidoDeNovo = filtersFromSearch(reescrito);
    console.log('A1-IDEMPOT', JSON.stringify({ entrada: s, lido, reescrito, lidoDeNovo, igual: JSON.stringify(lido) === JSON.stringify(lidoDeNovo) }));
    expect(JSON.stringify(lido)).not.toBe(JSON.stringify(lidoDeNovo));
  });
});

describe('A1 — applyFilters: entradas degeneradas', () => {
  const f = (o: Partial<typeof DEFAULT_FILTERS> = {}) => ({ ...DEFAULT_FILTERS, ...o });

  it('null/undefined/[] nao explodem', () => {
    const r1 = applyFilters(null as never, f({ q: 'x' }));
    const r2 = applyFilters(undefined as never, f({ q: 'x' }));
    const r3 = applyFilters([], f({ q: 'x' }));
    console.log('A1-NULL-ITEMS', JSON.stringify({ null: r1.length, undefined: r2.length, vazio: r3.length }));
    expect([r1.length, r2.length, r3.length]).toEqual([0, 0, 0]);
  });

  it('titulo nulo/undefined/vazio: explode ou passa?', () => {
    const out: Record<string, unknown> = {};
    for (const [nome, titulo] of [['null', null], ['undefined', undefined], ['vazio', '']] as const) {
      try {
        const r = applyFilters([item({ title: titulo as never })], f({ q: 'x' }));
        out[nome] = 'ok:' + r.length;
      } catch (e) {
        out[nome] = 'THROW: ' + (e as Error).message;
      }
      try {
        const r2 = applyFilters([item({ title: titulo as never })], f({ q: '' }));
        out[nome + '_semTermo'] = 'ok:' + r2.length;
      } catch (e) {
        out[nome + '_semTermo'] = 'THROW: ' + (e as Error).message;
      }
    }
    console.log('A1-TITULO', JSON.stringify(out));
    expect(String(out.null)).toContain('THROW');
  });

  it('remind_at undefined escapa do filtro de alarme (=== null vs == null)', () => {
    const semCampo = { ...item(), remind_at: undefined } as unknown as WorkItem;
    const comNull = item({ remind_at: null });
    const r = applyFilters([semCampo, comNull], f({ alarm: true }));
    console.log('A1-ALARM-UNDEF', JSON.stringify({ passaram: r.length, ids: r.map(i => i.id), undefined_passou: r.includes(semCampo) }));
    expect(r.includes(semCampo)).toBe(true);
  });

  it('matriz acento/caixa', () => {
    const titulos = ['Café', 'cafe', NFD_CAFE, 'CAFÉ', 'İstanbul', 'Istanbul', '🎉 Festa'];
    const termos = ['cafe', 'café', 'CAFÉ', NFD_CAFE, 'CAFE', 'i', 'İ', '🎉', 'festa'];
    const itens = titulos.map((t, i) => item({ id: 's' + i, title: t }));
    const linhas: string[] = [];
    for (const termo of termos) {
      const achou = applyFilters(itens, f({ q: termo })).map(i => i.title);
      linhas.push(`${JSON.stringify(termo)} -> ${JSON.stringify(achou)}`);
    }
    console.log('A1-ACENTO\n' + linhas.join('\n'));
    expect(applyFilters(itens, f({ q: 'cafe' })).length).toBeGreaterThan(0);
  });

  it('query so de emoji / titulo de emoji', () => {
    const itens = [item({ title: '🎉 Festa' }), item({ title: 'Festa' })];
    console.log('A1-EMOJI', JSON.stringify({
      emoji: applyFilters(itens, f({ q: '🎉' })).map(i => i.title),
      meioEmoji: applyFilters(itens, f({ q: '🎉 Fe' })).map(i => i.title),
      'surrogate solto': applyFilters(itens, f({ q: '\uD83C' })).map(i => i.title),
    }));
    expect(true).toBe(true);
  });
});

describe('A1 — filtro x bucket', () => {
  it('done sem carimbo: onde cai', () => {
    const semCarimbo = item({ id: 'done-sem-carimbo', status: 'done', completed_at: null });
    const comCarimbo = item({ id: 'done-com-carimbo', status: 'done', completed_at: new Date().toISOString() });
    const antigo = item({ id: 'done-10d', status: 'done', completed_at: new Date(Date.now() - 10 * 86400000).toISOString() });
    const todos = [semCarimbo, comCarimbo, antigo];

    const b = bucketByDue(todos);
    console.log('A1-BUCKET', JSON.stringify({
      done7d: b.done7d.map(i => i.id), doneOlder: b.doneOlder.map(i => i.id),
      total: todos.length, cobertura: b.done7d.length + b.doneOlder.length,
    }));

    const comFiltroDone = applyFilters(todos, { ...DEFAULT_FILTERS, done: true });
    const semFiltroDone = applyFilters(todos, { ...DEFAULT_FILTERS, done: false });
    const bComFiltro = bucketByDue(comFiltroDone);
    const bSemFiltro = bucketByDue(semFiltroDone);
    console.log('A1-BUCKET-FILTRO', JSON.stringify({
      done_true_done7d: bComFiltro.done7d.map(i => i.id),
      done_false_done7d: bSemFiltro.done7d.map(i => i.id),
      done_false_total: semFiltroDone.length,
    }));

    expect(b.done7d.map(i => i.id)).toContain('done-sem-carimbo');
  });

  it('cancelled com completed_at nao entra em done7d nem em doneOlder', () => {
    const cancelado = item({ id: 'cancelado', status: 'cancelled', completed_at: new Date().toISOString() });
    const b = bucketByDue([cancelado]);
    console.log('A1-CANCELLED', JSON.stringify({
      done7d: b.done7d.length, doneOlder: b.doneOlder.length,
      ativos: b.overdue.length + b.today.length + b.tomorrow.length + b.upcoming.length + b.noDue.length,
    }));
    expect(b.done7d.length + b.doneOlder.length).toBe(0);
  });

  it('done sem carimbo some quando done=false e reaparece quando done=true', () => {
    const semCarimbo = item({ id: 'x', status: 'done', completed_at: null });
    const visivel = applyFilters([semCarimbo], { ...DEFAULT_FILTERS, done: true });
    const escondido = applyFilters([semCarimbo], { ...DEFAULT_FILTERS, done: false });
    console.log('A1-DONE-SEM-CARIMBO', JSON.stringify({ visivel: visivel.length, escondido: escondido.length, bucket: bucketByDue(visivel).done7d.length }));
    expect(visivel.length).toBe(1);
    expect(escondido.length).toBe(0);
  });
});
