/**
 * Etapa 058 (D21) — a regra ÚNICA de datas do módulo de Tarefas.
 *
 * Todas as superfícies (Lista, Quadro, Agenda, painel, modal) passam por aqui,
 * então o teste fixa o formato exato pedido pelo plano: "Ontem, 17:00",
 * "Hoje, 14:00", "Amanhã, 10:00", "13 out., 15:00"; concluídas só o dia
 * ("Hoje", "Ontem", "09 out."); campos do painel/modal "Hoje, 11/10" + hora
 * separada; e NUNCA o "Seg, 09/09, 14:20" da imagem 04.
 *
 * As datas são construídas no relógio LOCAL (`new Date(ano, mês, dia, h, min)`),
 * o mesmo que o módulo promete ler — assim o caso não depende de o processo
 * rodar em UTC-3 para valer.
 */
import { describe, it, expect } from 'vitest';

import {
  formatWorkItemDay,
  formatWorkItemTime,
  formatWorkItemDate,
  formatWorkItemFieldDate,
  formatWorkItemField,
} from '@/hooks/tasks/workItemFormat';

/** Domingo, 11/10/2026, 14:00 no relógio local. */
const AGORA = new Date(2026, 9, 11, 14, 0);

function withTimeZone<T>(timeZone: string, run: () => T): T {
  const oldTz = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (oldTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = oldTz;
    }
  }
}

describe('workItemFormat — regra única de datas (etapa 058 / D21)', () => {
  it('rotula Hoje / Ontem / Amanhã pelo dia LOCAL', () => {
    expect(formatWorkItemDay(new Date(2026, 9, 11, 8, 0), AGORA)).toBe('Hoje');
    expect(formatWorkItemDay(new Date(2026, 9, 10, 23, 30), AGORA)).toBe('Ontem');
    expect(formatWorkItemDay(new Date(2026, 9, 12, 0, 30), AGORA)).toBe('Amanhã');
  });

  it('fora de Hoje/Ontem/Amanhã usa "dd mês." em pt-BR', () => {
    expect(formatWorkItemDay(new Date(2026, 9, 9, 10, 0), AGORA)).toBe('09 out.');
    expect(formatWorkItemDay(new Date(2026, 9, 13, 10, 0), AGORA)).toBe('13 out.');
    expect(formatWorkItemDay(new Date(2027, 0, 5, 10, 0), AGORA)).toBe('05 jan.');
  });

  it('com hora compõe "Ontem, 17:00" / "Hoje, 14:00" / "Amanhã, 10:00" / "13 out., 15:00"', () => {
    expect(formatWorkItemDate(new Date(2026, 9, 10, 17, 0), { now: AGORA })).toBe('Ontem, 17:00');
    expect(formatWorkItemDate(new Date(2026, 9, 11, 14, 0), { now: AGORA })).toBe('Hoje, 14:00');
    expect(formatWorkItemDate(new Date(2026, 9, 12, 10, 0), { now: AGORA })).toBe('Amanhã, 10:00');
    expect(formatWorkItemDate(new Date(2026, 9, 13, 15, 0), { now: AGORA })).toBe('13 out., 15:00');
  });

  it('concluída mostra SÓ o dia (sem hora)', () => {
    expect(formatWorkItemDate(new Date(2026, 9, 11, 14, 0), { now: AGORA, format: 'day' })).toBe('Hoje');
    expect(formatWorkItemDate(new Date(2026, 9, 10, 8, 0), { now: AGORA, format: 'day' })).toBe('Ontem');
    expect(formatWorkItemDate(new Date(2026, 9, 9, 10, 0), { now: AGORA, format: 'day' })).toBe('09 out.');
  });

  it('nunca inclui o dia da semana ("Seg, 09/09, 14:20" da imagem 04)', () => {
    const saida = String(formatWorkItemDate(new Date(2026, 8, 9, 14, 20), { now: AGORA }));
    expect(saida).toBe('09 set., 14:20');
    expect(saida).not.toMatch(/seg|ter|qua|qui|sex|s[áa]b|dom/i);
  });

  it('fuso local: 23:30 do dia não vira o dia seguinte (UTC-3)', () => {
    const value = new Date(2026, 9, 10, 23, 30); // 10/10 23:30 local
    const now = new Date(2026, 9, 10, 20, 0); // 10/10 20:00 local
    expect(formatWorkItemDate(value, { now })).toBe('Hoje, 23:30');
    // O banco devolve ISO; a leitura tem de ser o mesmo dia LOCAL.
    expect(formatWorkItemDate(value.toISOString(), { now })).toBe('Hoje, 23:30');
  });

  it('virada do dia: 00:05 do dia seguinte é "Amanhã" e 23:55 é "Ontem"', () => {
    expect(formatWorkItemDate(new Date(2026, 9, 11, 0, 5), { now: new Date(2026, 9, 10, 23, 55) })).toBe('Amanhã, 00:05');
    expect(formatWorkItemDate(new Date(2026, 9, 10, 23, 55), { now: new Date(2026, 9, 11, 0, 5) })).toBe('Ontem, 23:55');
  });

  it('formatWorkItemDay atravessa horário de verão real em America/Sao_Paulo por calendário local', () => {
    withTimeZone('America/Sao_Paulo', () => {
      // 04/11/2018 teve 23h em São Paulo: 00:05 não existiu e o JS normaliza para 01:05.
      expect(formatWorkItemDate(new Date(2018, 10, 4, 0, 5), { now: new Date(2018, 10, 3, 23, 30) })).toBe('Amanhã, 01:05');
      expect(formatWorkItemDay(new Date(2018, 10, 4, 0, 5), new Date(2018, 10, 3, 23, 30))).toBe('Amanhã');
      expect(formatWorkItemDay(new Date(2018, 10, 3, 23, 30), new Date(2018, 10, 4, 1, 5))).toBe('Ontem');

      // 17/02/2019 teve 25h em São Paulo: ainda é só uma troca de dia civil.
      expect(formatWorkItemDate(new Date(2019, 1, 17, 0, 5), { now: new Date(2019, 1, 16, 23, 30) })).toBe('Amanhã, 00:05');
      expect(formatWorkItemDay(new Date(2019, 1, 17, 0, 5), new Date(2019, 1, 16, 23, 30))).toBe('Amanhã');
      expect(formatWorkItemDay(new Date(2019, 1, 16, 23, 30), new Date(2019, 1, 17, 0, 5))).toBe('Ontem');
    });
  });

  it('campos do painel/modal usam "Hoje, 11/10" e a hora à parte', () => {
    const value = new Date(2026, 9, 11, 14, 0);
    expect(formatWorkItemFieldDate(value, AGORA)).toBe('Hoje, 11/10');
    expect(formatWorkItemField(value, AGORA)).toEqual({ date: 'Hoje, 11/10', time: '14:00' });
    expect(formatWorkItemFieldDate(new Date(2026, 9, 13, 15, 0), AGORA)).toBe('13/10');
    expect(formatWorkItemFieldDate(new Date(2027, 0, 5, 15, 0), AGORA)).toBe('05/01/2027');
  });

  it('hora separada é null quando o valor não tem hora escolhida', () => {
    // A convenção de "dia inteiro" do módulo é 23:59; o campo ainda a mostra.
    expect(formatWorkItemTime(null)).toBeNull();
    expect(formatWorkItemField(new Date(2026, 9, 12, 9, 0), AGORA)).toEqual({ date: 'Amanhã, 12/10', time: '09:00' });
  });

  it('valor ausente ou inválido devolve null (a tela decide "Sem prazo")', () => {
    expect(formatWorkItemDate(null)).toBeNull();
    expect(formatWorkItemDate(undefined)).toBeNull();
    expect(formatWorkItemDate('nao-e-data')).toBeNull();
    expect(formatWorkItemDay('', AGORA)).toBeNull();
    expect(formatWorkItemField(null)).toEqual({ date: null, time: null });
  });

  it('aceita o ISO com offset que o banco devolve', () => {
    withTimeZone('America/Sao_Paulo', () => {
      const agora = new Date(2026, 9, 11, 14, 0);
      expect(formatWorkItemDate('2026-10-11T17:00:00-03:00', { now: agora })).toBe('Hoje, 17:00');
    });
  });

  it('ISO em Z que vira outro dia local em UTC-3 é lido no fuso local', () => {
    withTimeZone('America/Sao_Paulo', () => {
      // 2026-10-12T02:30:00Z = 11/10 23:30 em UTC-3 → ainda o dia local 11.
      expect(formatWorkItemDate('2026-10-12T02:30:00Z', { now: new Date(2026, 9, 11, 20, 0) })).toBe('Hoje, 23:30');
    });
  });
});
