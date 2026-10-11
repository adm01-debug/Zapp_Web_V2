/**
 * Etapas 161 e 162 — presets de prazo/lembrete e a coerência prazo × lembrete.
 *
 * Os presets reproduzem, em funções puras, o que o QuickAdd já faz inline nos
 * chips Hoje / Amanhã / Próx. semana / Em 1 h / Amanhã 9h / Próx. seg 9h; a
 * versão aqui é à prova de virada do dia (aritmética de CALENDÁRIO, não
 * `+86_400_000`) e reaproveita `tomorrowAtNine` para o "Amanhã 9h".
 *
 * Datas construídas no relógio LOCAL — o caso vale independente do fuso do CI.
 */
import { describe, it, expect } from 'vitest';

import {
  duePresetDate,
  duePresetISO,
  remindPresetDate,
  remindPresetISO,
  nextMondayAtNine,
  checkRemindCoherence,
} from '@/hooks/tasks/workItemPresets';
import { tomorrowAtNine } from '@/hooks/tasks/useMyWorkItems';

/** Domingo, 11/10/2026, 14:00 no relógio local. */
const AGORA = new Date(2026, 9, 11, 14, 0);

describe('workItemPresets — presets de prazo (etapa 161)', () => {
  it('"hoje" termina às 23:59 locais do PRÓPRIO dia', () => {
    const d = duePresetDate('today', AGORA);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it('"amanhã" é o dia seguinte às 23:59 — mesmo criado às 23:30', () => {
    const d = duePresetDate('tomorrow', new Date(2026, 9, 11, 23, 30));
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it('"próxima semana" é +7 dias de CALENDÁRIO às 23:59', () => {
    const d = duePresetDate('nextWeek', AGORA);
    expect(d.getDate()).toBe(18); // 11/10 -> 18/10
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it('duePresetISO devolve o mesmo instante do Date', () => {
    expect(duePresetISO('tomorrow', AGORA)).toBe(duePresetDate('tomorrow', AGORA).toISOString());
  });
});

describe('workItemPresets — presets de lembrete (etapa 161)', () => {
  it('"em 1 h" é agora + 3.600.000 ms', () => {
    const d = remindPresetDate('in1h', AGORA);
    expect(d.getTime() - AGORA.getTime()).toBe(3_600_000);
  });

  it('"amanhã 9h" REAPROVEITA tomorrowAtNine (amanhã às 09:00 locais)', () => {
    const d = remindPresetDate('tomorrow9', AGORA);
    expect(d.getTime()).toBe(tomorrowAtNine(AGORA).getTime());
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('"próxima segunda 9h" a partir de um domingo é a segunda seguinte', () => {
    const d = nextMondayAtNine(AGORA); // domingo 11/10
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('"próxima segunda 9h" NA PRÓPRIA segunda não devolve o mesmo dia', () => {
    const segunda = new Date(2026, 9, 12, 10, 0); // 12/10 é segunda
    const d = nextMondayAtNine(segunda);
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(19);
    expect(remindPresetDate('nextMonday9', segunda).getTime()).toBe(d.getTime());
  });

  it('remindPresetISO devolve o mesmo instante do Date', () => {
    expect(remindPresetISO('in1h', AGORA)).toBe(remindPresetDate('in1h', AGORA).toISOString());
  });
});

describe('workItemPresets — coerência prazo × lembrete (etapa 162)', () => {
  const PRAZO = new Date(2026, 9, 12, 23, 59);

  it('sem lembrete não há o que conferir', () => {
    expect(checkRemindCoherence(null, PRAZO, AGORA)).toEqual({ state: 'ok', message: '' });
  });

  it('lembrete no futuro e antes do prazo confirma', () => {
    const r = checkRemindCoherence(new Date(2026, 9, 12, 9, 0), PRAZO, AGORA);
    expect(r.state).toBe('ok');
    expect(r.message).toBe('Lembrete programado para antes do prazo.');
  });

  it('lembrete no passado', () => {
    expect(checkRemindCoherence(new Date(2026, 9, 11, 13, 0), PRAZO, AGORA).state).toBe('in_past');
    expect(checkRemindCoherence(AGORA, PRAZO, AGORA).state).toBe('in_past'); // igual ao agora = já passou
  });

  it('lembrete depois do prazo', () => {
    expect(checkRemindCoherence(new Date(2026, 9, 13, 9, 0), PRAZO, AGORA).state).toBe('after_due');
  });

  it('lembrete IGUAL ao prazo não é "antes do prazo"', () => {
    expect(checkRemindCoherence(PRAZO, PRAZO, AGORA).state).toBe('after_due');
  });

  it('lembrete sem prazo definido', () => {
    expect(checkRemindCoherence(new Date(2026, 9, 12, 9, 0), null, AGORA).state).toBe('no_due');
  });

  it('"no passado" tem prioridade sobre "depois do prazo"', () => {
    const r = checkRemindCoherence(new Date(2026, 9, 10, 9, 0), new Date(2026, 9, 9, 9, 0), AGORA);
    expect(r.state).toBe('in_past');
  });

  it('aceita ISO com offset', () => {
    expect(checkRemindCoherence('2026-10-12T09:00:00-03:00', '2026-10-12T23:59:00-03:00', AGORA).state).toBe('ok');
  });
});
