
import { bucketByDue, bucketByStatus, kpis, splitDoneByRecency, applyFilters } from '@/hooks/tasks/workItemAggregates';
import { countDoing } from '@/hooks/tasks/workItemMachine';
import { DEFAULT_FILTERS, isFilterActive } from '@/hooks/tasks/workItemFilters';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const d = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
function item(over: Partial<WorkItem>): WorkItem {
  return { id:'x', title:'t', description:null, status:'todo', priority:'medium',
    due_date:null, remind_at:null, notified_at:null, waiting_reason:null, position:0,
    started_at:null, status_changed_at:d(0), completed_at:null, contact_id:null,
    created_by:'u1', assigned_to:'u1', created_at:d(0), updated_at:d(0), contact:null, ...over } as WorkItem;
}

// A2-1
const semCarimbo = item({ id:'s1', status:'done', completed_at:null });
let b = bucketByDue([semCarimbo], NOW); let s = splitDoneByRecency([semCarimbo], NOW);
console.log('[A2-1] done SEM carimbo -> Lista.done7d=' + b.done7d.length + ' doneOlder=' + b.doneOlder.length
  + ' | Quadro.recent=' + s.recent.length + ' older=' + s.older.length);

// A2-2
const vazio = item({ id:'s2', status:'done', completed_at:'' });
b = bucketByDue([vazio], NOW); s = splitDoneByRecency([vazio], NOW);
console.log('[A2-2] done com completed_at="" -> Lista.done7d=' + b.done7d.length + ' doneOlder=' + b.doneOlder.length
  + ' | Quadro.recent=' + s.recent.length + ' older=' + s.older.length);

// A2-3
const antiga = item({ id:'s3', status:'done', completed_at:null, created_at:d(400) });
const k = kpis([antiga], NOW);
console.log('[A2-3] KPI Concluidas(7d) p/ item sem carimbo criado ha 400 dias = ' + k.done7d + ' | bucketByDue.done7d=' + bucketByDue([antiga],NOW).done7d.length);

// A2-4
const velha = item({ id:'s4', status:'done', completed_at:d(44) });
b = bucketByDue([velha], NOW); s = splitDoneByRecency([velha], NOW);
console.log('[A2-4] done 44d -> Lista: ' + b.done7d.length + '/' + b.doneOlder.length + ' | Quadro: ' + s.recent.length + '/' + s.older.length);

// A2-5 cancelled
const cancelada = item({ id:'s5', status:'cancelled' });
b = bucketByDue([cancelada], NOW);
console.log('[A2-5] cancelled -> total buckets lista=' + (b.overdue.length+b.today.length+b.tomorrow.length+b.upcoming.length+b.noDue.length) + ' done7d=' + b.done7d.length + ' doneOlder=' + b.doneOlder.length);

// A2-6 performance
const items: WorkItem[] = Array.from({length:1000},(_,i)=>item({
  id:'t'+i,
  status: (['backlog','todo','doing','waiting','done'] as const)[i%5],
  priority: (['low','medium','high','urgent'] as const)[i%4],
  due_date: d(i%30),
  completed_at: i%5===4 ? d(i%20) : null,
  started_at: i%5===4 ? d(20) : null,
}));
const filtro = { ...DEFAULT_FILTERS, prio:'high' as const };
for (let r=0;r<3;r++){
  const t0=performance.now();
  const comFiltro = applyFilters(items, filtro);
  const byDue = bucketByDue(comFiltro);
  const byStatus = bucketByStatus(comFiltro);
  const kpiData = kpis(comFiltro);
  const kpiReal = kpis(items);
  const doingReal = countDoing(items);
  const byStatusReal = bucketByStatus(items);
  const t1=performance.now();
  console.log('[A2-6 run'+r+'] 7 passadas/1000 itens = ' + (t1-t0).toFixed(2) + 'ms | kpiData.dueToday=' + kpiData.dueToday
   + ' kpiReal.dueToday=' + kpiReal.dueToday + ' doingReal=' + doingReal
   + ' byStatus.doing(len filtrado)=' + byStatus.doing.length + ' byStatusReal.done=' + byStatusReal.done.length
   + ' byDue.noDue=' + byDue.noDue.length);
}

// A2-7: filtro que esconde doing
const mistura: WorkItem[] = [
  item({ id:'m1', status:'doing', priority:'urgent' }),
  item({ id:'m2', status:'doing', priority:'medium' }),
  item({ id:'m3', status:'doing', priority:'medium' }),
  item({ id:'m4', status:'todo', priority:'medium', due_date: NOW.toISOString() }),
  item({ id:'m5', status:'todo', priority:'medium', due_date: NOW.toISOString() }),
  item({ id:'m6', status:'todo', priority:'medium', due_date: NOW.toISOString() }),
];
const fAlta = { ...DEFAULT_FILTERS, prio:'high' as const };
const rec = applyFilters(mistura, fAlta);
const kf = kpis(rec); const kr = kpis(mistura);
const bsF = bucketByStatus(rec); const bsR = bucketByStatus(mistura);
console.log('[A2-7] filtro prio=high -> visiveis=' + rec.length
  + ' | KPI Atrasadas(filtrado)=' + kf.overdue + ' Para hoje(filtrado)=' + kf.dueToday
  + ' Concluidas(filtrado)=' + kf.done7d
  + ' | KPI Fazendo(REAL)=' + countDoing(mistura)
  + ' | subtitulo abertas(REAL)=' + (bsR.backlog.length+bsR.todo.length+bsR.doing.length+bsR.waiting.length)
  + ' e para hoje(REAL)=' + kr.dueToday
  + ' | coluna Fazendo renderizada=' + bsF.doing.length + ' de ' + bsR.doing.length);
console.log('[A2-7b] filtro prio=high e ativo? ' + isFilterActive(fAlta));
