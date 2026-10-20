import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { temHora, groupAgendaDay } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const out: any = {};

const iso = (y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0) =>
  new Date(y, mo - 1, d, h, mi, s, ms).toISOString();
// convencao do <input type="date"> do app: new Date('yyyy-MM-dd').toISOString() = meia-noite UTC
const dOnlyUTC = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d)).toISOString();

const fmt = (v: string | null) => {
  if (v === null) return 'null';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Invalid Date';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

let seq = 0;
function makeItem(over: Partial<WorkItem>): WorkItem {
  seq += 1;
  return {
    id: `i${seq}`, title: `T${seq}`, description: null, status: 'todo', priority: 'medium',
    due_date: null, remind_at: null, notified_at: null, waiting_reason: null, position: 0,
    started_at: null, status_changed_at: null, completed_at: null, contact_id: null,
    created_by: 'p1', assigned_to: 'p1', created_at: '2026-09-30T00:00:00.000Z',
    updated_at: '2026-09-30T00:00:00.000Z', ...over,
  } as WorkItem;
}

describe('a3 temHora', () => {
  it('dump', () => {
    out.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    out.utcOffsetMinOutubro = new Date(2026, 9, 3).getTimezoneOffset();

    const casos: Array<[string, string | null]> = [
      ['23:59:00 local', iso(2026, 10, 3, 23, 59, 0)],
      ['23:59:30 local', iso(2026, 10, 3, 23, 59, 30)],
      ['23:59:59.999 local', iso(2026, 10, 3, 23, 59, 59, 999)],
      ['23:59:59.000 local', iso(2026, 10, 3, 23, 59, 59, 0)],
      ['23:59:00.001 local', iso(2026, 10, 3, 23, 59, 0, 1)],
      ['23:30 local', iso(2026, 10, 3, 23, 30, 0)],
      ['23:00 local', iso(2026, 10, 3, 23, 0, 0)],
      ['00:00:00 local', iso(2026, 10, 3, 0, 0, 0)],
      ['00:00:30 local', iso(2026, 10, 3, 0, 0, 30)],
      ['00:01 local', iso(2026, 10, 3, 0, 1, 0)],
      ['09:30 local', iso(2026, 10, 3, 9, 30, 0)],
      ["'abc' (invalido)", 'abc'],
      ['string vazia', ''],
      ['"2026-10-03" (date-only ISO sem TZ)', '2026-10-03'],
      ['meia-noite UTC (convencao input type=date)', dOnlyUTC(2026, 10, 3)],
      ['null', null],
    ];
    out.casos = casos.map(([nome, v]) => ({ nome, valor: v, lidoLocal: fmt(v), temHora: temHora(v as any) }));

    out.dst = ([
      ['NY 2026-11-01 01:30 local (fim DST)', iso(2026, 11, 1, 1, 30, 0)],
      ['NY 2026-11-01 23:59 local', iso(2026, 11, 1, 23, 59, 0)],
      ['NY 2026-03-08 23:59 local (inicio DST)', iso(2026, 3, 8, 23, 59, 0)],
      ['NY 2026-03-08 00:00 local', iso(2026, 3, 8, 0, 0, 0)],
      ['NY 2026-03-08 02:30 local (hora inexistente)', iso(2026, 3, 8, 2, 30, 0)],
    ] as Array<[string, string]>).map(([nome, v]) => ({ nome, valor: v, lidoLocal: fmt(v), temHora: temHora(v) }));

    // o MESMO codigo do QuickAdd/Agenda: new Date(dia).setHours(23,59,0,0).toISOString()
    const mk = (y: number, mo: number, d: number) => {
      const x = new Date(y, mo - 1, d);
      x.setHours(23, 59, 0, 0);
      return { dia: `${y}-${mo}-${d}`, valorSetHours: x.toISOString(), lidoLocal: fmt(x.toISOString()), temHora: temHora(x.toISOString()) };
    };
    out.setHours2359 = [mk(2026, 10, 3), mk(2026, 11, 1), mk(2026, 3, 8), mk(2026, 9, 30)];

    writeFileSync('/tmp/a3-temHora.json', JSON.stringify(out, null, 2));
    expect(true).toBe(true);
  });
});
