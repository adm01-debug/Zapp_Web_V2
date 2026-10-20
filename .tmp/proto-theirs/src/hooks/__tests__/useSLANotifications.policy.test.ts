import '@/hooks/__tests__/helpers/alertMocks';
import '@/hooks/__tests__/helpers/alertContactMock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * `notify_on_warning` e `escalation_notes` das regras de SLA (PB-42/SA2).
 *
 * O aviso de risco só sai quando a regra aplicável pede (padrão: avisar) e as notas de escalonamento
 * da regra aparecem no alerta. A hierarquia é a MESMA de `useApplicableSLA`
 * (contato > empresa > cargo > tipo > fila > agente), resolvida aqui porque a linha de
 * `conversation_sla` não aponta a regra — só a configuração de prazo.
 */
import {
  callbacks,
  dedupeCalls,
  sonnerToast,
  slaRulesQuery,
  resetAlertKit,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import {
  useSLANotifications,
  pickRuleAlertPolicy,
  DEFAULT_SLA_ALERT_POLICY,
} from '@/hooks/sla/useSLANotifications';

const SLA_ID = '11111111-1111-4111-8111-111111111111';
const CONTATO_ID = '22222222-2222-4222-8222-222222222222';

const LINHA = {
  id: SLA_ID,
  contact_id: CONTATO_ID,
  first_message_at: '2026-10-12T12:00:00.000Z',
  first_response_at: null,
  first_response_breached: false,
  sla_configuration_id: null,
};

/** Regra sem escopo preenchido além de `contact_id` — o nível mais alto da hierarquia. */
const regraDoContato = (metadata: unknown) => ({
  contact_id: CONTATO_ID,
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  metadata,
});

const ATTRS = {
  contactId: CONTATO_ID,
  company: null,
  jobTitle: null,
  contactType: null,
  queueId: null,
  agentId: null,
};

async function entregarInsert(row: unknown) {
  await callbacks[1]({ new: row, old: {} });
}
async function entregarUpdate(row: unknown, old: unknown) {
  await callbacks[0]({ new: row, old });
}
const assentar = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pickRuleAlertPolicy — hierarquia e padrão', () => {
  it('sem regra aplicável vale o padrão: avisa e sem notas', () => {
    expect(pickRuleAlertPolicy([], ATTRS)).toEqual(DEFAULT_SLA_ALERT_POLICY);
    expect(DEFAULT_SLA_ALERT_POLICY).toEqual({ notifyOnWarning: true, escalationNotes: null });
  });

  it('regra do contato com notify_on_warning falso desliga o aviso', () => {
    const policy = pickRuleAlertPolicy([regraDoContato({ notify_on_warning: false })], ATTRS);
    expect(policy.notifyOnWarning).toBe(false);
  });

  it('notas de escalonamento vêm da regra (com espaços aparados)', () => {
    const policy = pickRuleAlertPolicy(
      [regraDoContato({ notify_on_warning: true, escalation_notes: '  Acionar o supervisor  ' })],
      ATTRS,
    );
    expect(policy).toEqual({ notifyOnWarning: true, escalationNotes: 'Acionar o supervisor' });
  });

  it('campos nulos no metadata (jsonb) não descartam a regra', () => {
    // `escalation_notes: null` é o que a coluna jsonb grava quando o campo é limpo: com
    // `.optional()` a regra inteira era descartada e o `notify_on_warning: false` deixava de
    // silenciar o aviso.
    const policy = pickRuleAlertPolicy(
      [regraDoContato({ notify_on_warning: false, escalation_notes: null })],
      ATTRS,
    );
    expect(policy).toEqual({ notifyOnWarning: false, escalationNotes: null });
  });

  it('regra do contato vence a da empresa', () => {
    const policy = pickRuleAlertPolicy(
      [
        {
          contact_id: null,
          company: 'ACME',
          job_title: null,
          contact_type: null,
          queue_id: null,
          agent_id: null,
          metadata: { notify_on_warning: false },
        },
        regraDoContato({ notify_on_warning: true }),
      ],
      { ...ATTRS, company: 'ACME' },
    );
    expect(policy.notifyOnWarning).toBe(true);
  });

  it('metadata ausente ou regra fora do contrato não quebra: vale o padrão', () => {
    expect(pickRuleAlertPolicy([regraDoContato(undefined)], ATTRS)).toEqual(DEFAULT_SLA_ALERT_POLICY);
    expect(
      pickRuleAlertPolicy([{ contact_id: CONTATO_ID, metadata: { notify_on_warning: 'sim' } }], ATTRS),
    ).toEqual(DEFAULT_SLA_ALERT_POLICY);
  });
});

describe('useSLANotifications — a regra manda no aviso de risco', () => {
  beforeEach(() => {
    resetAlertKit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aviso de risco é silenciado quando a regra aplicável manda não avisar', async () => {
    slaRulesQuery.rows = [regraDoContato({ notify_on_warning: false })];
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(sonnerToast.warning).not.toHaveBeenCalled();
    expect(dedupeCalls).toEqual([]);
  });

  it('aviso de risco sai com as notas de escalonamento da regra quando há', async () => {
    slaRulesQuery.rows = [
      regraDoContato({ notify_on_warning: true, escalation_notes: 'Acionar o supervisor' }),
    ];
    vi.useFakeTimers();
    renderHook(() => useSLANotifications());

    await entregarInsert({ ...LINHA, first_message_at: new Date().toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(sonnerToast.warning).toHaveBeenCalledTimes(1);
    const [, opcoes] = sonnerToast.warning.mock.calls[0];
    expect(opcoes.description).toContain('Acionar o supervisor');
  });

  it('estouro mostra as notas de escalonamento da regra', async () => {
    slaRulesQuery.rows = [regraDoContato({ escalation_notes: 'Acionar o supervisor' })];
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    const [, opcoes] = sonnerToast.error.mock.calls[0];
    expect(opcoes.description).toContain('Acionar o supervisor');
  });

  it('falha ao ler as regras não silencia o estouro: vale o padrão de avisar', async () => {
    slaRulesQuery.erro = new Error('RLS bloqueou as regras');
    renderHook(() => useSLANotifications());

    await entregarUpdate({ ...LINHA, first_response_breached: true }, { first_response_breached: false });
    await assentar();

    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
  });
});
