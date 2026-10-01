/**
 * FASE F (etapa 69) — o miolo do aviso de alarme, com `now` FIXO.
 *
 * Os helpers puros de `useWorkItemNotifications` concentram a regra que precisa
 * estar certa no banco: `snooze` rearma o `remind_at` e ZERA o `notified_at`
 * (senão o alarme nunca mais dispara), e `complete` fecha a tarefa limpando o
 * alarme. O `useDocumentBadge` só mexe no título quando a aba está oculta.
 */
import { describe, it, expect } from 'vitest';

import {
  notificationTargets,
  computeRemindAt,
  snoozePatch,
  completePatch,
} from '@/hooks/tasks/useWorkItemNotifications';
import { formatBadgeTitle, stripBadgeTitle } from '@/hooks/system/useDocumentBadge';

const AGORA = new Date('2026-10-01T14:00:00-03:00');

describe('FASE F — useWorkItemNotifications (etapa 59)', () => {
  it('lê task_id e contact_id do metadata da notificação', () => {
    const n = { id: 'n1', metadata: { task_id: 't1', contact_id: 'c1' } };
    expect(notificationTargets(n as never)).toEqual({ taskId: 't1', contactId: 'c1' });
  });

  it('aguenta metadata ausente ou de tipo inesperado sem estourar', () => {
    expect(notificationTargets(null)).toEqual({ taskId: null, contactId: null });
    expect(notificationTargets({ id: 'n2', metadata: null } as never)).toEqual({ taskId: null, contactId: null });
    expect(notificationTargets({ id: 'n3', metadata: { task_id: 42 } } as never)).toEqual({ taskId: null, contactId: null });
  });

  it('snooze 15 min conta a partir do agora', () => {
    const alvo = new Date(computeRemindAt(15, AGORA));
    expect(alvo.getTime() - AGORA.getTime()).toBe(15 * 60 * 1000);
  });

  it("snooze 'tomorrow9' cai amanhã às 09:00 locais", () => {
    const alvo = new Date(computeRemindAt('tomorrow9', AGORA));
    expect(alvo.getHours()).toBe(9);
    expect(alvo.getMinutes()).toBe(0);
    expect(alvo.getDate()).toBe(2); // 01/10 -> 02/10
  });

  it('adiar SEMPRE zera notified_at (o alarme volta a poder disparar)', () => {
    for (const opcao of [15, 60, 'tomorrow9'] as const) {
      const patch = snoozePatch(opcao, AGORA);
      expect(patch.notified_at).toBeNull();
      expect(typeof patch.remind_at).toBe('string');
      expect(new Date(patch.remind_at).getTime()).toBeGreaterThan(AGORA.getTime());
    }
  });

  it('concluir fecha a tarefa e limpa o alarme', () => {
    const patch = completePatch(AGORA);
    expect(patch.status).toBe('done');
    expect(patch.remind_at).toBeNull();
    expect(patch.notified_at).toBeNull();
    expect(patch.completed_at).toBe(AGORA.toISOString());
  });
});

describe('FASE F — useDocumentBadge (etapa 63)', () => {
  it('prefixa "(n) " só quando há contagem', () => {
    expect(formatBadgeTitle(3, 'Zapp')).toBe('(3) Zapp');
    expect(formatBadgeTitle(0, 'Zapp')).toBe('Zapp');
  });

  it('o par format/strip permite trocar a contagem sem acumular', () => {
    // formatBadgeTitle espera a base LIMPA; stripBadgeTitle é quem devolve a base
    // (o hook guarda a base original e nunca formata sobre o título já marcado).
    const marcado = formatBadgeTitle(2, 'Zapp');
    expect(marcado).toBe('(2) Zapp');
    expect(stripBadgeTitle(marcado)).toBe('Zapp');
    expect(stripBadgeTitle('Zapp')).toBe('Zapp');
    expect(formatBadgeTitle(5, stripBadgeTitle(marcado))).toBe('(5) Zapp');
  });
});
