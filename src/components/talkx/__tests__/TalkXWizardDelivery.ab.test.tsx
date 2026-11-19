import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

import { TalkXWizardDelivery } from '@/components/talkx/TalkXWizardDelivery';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

// X065 — A ENTRADA do teste A/B no passo de entrega do assistente.
//
// Por que este arquivo existe: as colunas `ab_*`, a RPC de estatística e a
// decisão da vencedora já estavam no banco e NADA na interface alcançava a
// configuração — `ab_enabled` nascia falso em toda campanha. O controle foi
// adicionado, mas o ponto de entrada ficou sem nenhum teste: dava para
// removê-lo sem quebrar nada, e o teste A/B voltaria a ser inalcançável em
// silêncio, exatamente como estava.
//
// Três contratos ficam travados aqui:
//   1. sem template escolhido a seção NÃO aparece (a variante vem do template,
//      não da mensagem livre — mostrar o controle prometeria o que não existe);
//   2. com template a seção aparece e o interruptor chama `setAbEnabled`;
//   3. métrica e amostra mínima só aparecem com o A/B ligado, e os limites do
//      campo são os MESMOS da CHECK da coluna em produção
//      (`ab_min_sample >= 1 AND <= 1000000`), senão o banco recusa o save com
//      violação de constraint em vez de mensagem útil.

/** `ed` mínimo para renderizar o passo de entrega. */
function deliveryEd(overrides: Record<string, unknown> = {}) {
  return {
    isScheduled: false,
    scheduledAt: '',
    scheduleTimezone: 'America/Sao_Paulo',
    setIsScheduled: vi.fn(),
    setScheduledAt: vi.fn(),
    setScheduleTimezone: vi.fn(),
    sendWindowEnabled: false,
    sendWindowStart: '08:00',
    sendWindowEnd: '18:00',
    setSendWindowEnabled: vi.fn(),
    setSendWindowStart: vi.fn(),
    setSendWindowEnd: vi.fn(),
    businessHoursOnly: false,
    setBusinessHoursOnly: vi.fn(),
    speedProfile: 'normal',
    setSpeedProfile: vi.fn(),
    typingDelay: [1, 3],
    setTypingDelay: vi.fn(),
    sendInterval: [5, 15],
    setSendInterval: vi.fn(),
    messagesPerMinute: 20,
    estimatedTime: '5 min',
    respectSuppression: true,
    setRespectSuppression: vi.fn(),
    confirmConsent: true,
    setConfirmConsent: vi.fn(),
    suppressedCount: 0,
    connections: [{ id: 'c1', name: 'Conexão', phone_number: '5511999999999' }],
    connectionId: 'c1',
    // X065 — o que esta suíte exercita.
    templateId: 'template-1',
    abEnabled: false,
    abMetric: 'reply_rate',
    abMinSample: 50,
    setAbEnabled: vi.fn(),
    setAbMetric: vi.fn(),
    setAbMinSample: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

describe('TalkXWizardDelivery — entrada do teste A/B (X065)', () => {
  afterEach(() => vi.clearAllMocks());

  it('sem template escolhido a seção do A/B não aparece', () => {
    render(<TalkXWizardDelivery ed={deliveryEd({ templateId: '' })} />);
    expect(screen.queryByText('Teste A/B')).toBeNull();
    expect(screen.queryByLabelText('Ativar teste A/B nesta campanha')).toBeNull();
  });

  it('com template a seção aparece e o interruptor liga o A/B', () => {
    const setAbEnabled = vi.fn();
    render(<TalkXWizardDelivery ed={deliveryEd({ setAbEnabled })} />);

    expect(screen.getByText('Teste A/B')).toBeTruthy();
    const interruptor = screen.getByLabelText('Ativar teste A/B nesta campanha');
    fireEvent.click(interruptor);
    expect(setAbEnabled).toHaveBeenCalledWith(true);
  });

  // Com o A/B desligado não existe métrica nem amostra a configurar: mostrar os
  // campos sugeriria que a campanha vai comparar variantes quando não vai.
  it('métrica e amostra mínima só aparecem com o A/B ligado', () => {
    const { unmount } = render(<TalkXWizardDelivery ed={deliveryEd({ abEnabled: false })} />);
    expect(screen.queryByLabelText('Métrica que decide a vencedora')).toBeNull();
    expect(screen.queryByLabelText('Amostra mínima por variante')).toBeNull();
    unmount();

    render(<TalkXWizardDelivery ed={deliveryEd({ abEnabled: true })} />);
    expect(screen.getByLabelText('Métrica que decide a vencedora')).toBeTruthy();
    expect(screen.getByLabelText('Amostra mínima por variante')).toBeTruthy();
  });

  // As três opções são exatamente as da CHECK `talkx_campaigns_ab_metric_check`
  // (conferida no banco oficial): reply_rate, click_rate, delivery_rate.
  it('as métricas oferecidas são as três que o banco aceita', () => {
    render(<TalkXWizardDelivery ed={deliveryEd({ abEnabled: true })} />);
    const select = screen.getByLabelText('Métrica que decide a vencedora') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      'reply_rate',
      'click_rate',
      'delivery_rate',
    ]);
  });

  it('a troca de métrica chega no editor', () => {
    const setAbMetric = vi.fn();
    render(<TalkXWizardDelivery ed={deliveryEd({ abEnabled: true, setAbMetric })} />);
    fireEvent.change(screen.getByLabelText('Métrica que decide a vencedora'), {
      target: { value: 'delivery_rate' },
    });
    expect(setAbMetric).toHaveBeenCalledWith('delivery_rate');
  });

  // `talkx_campaigns_ab_min_sample_check` é `>= 1 AND <= 1000000`. Se o campo
  // oferecer faixa diferente, o save morre com violação de constraint em vez de
  // mensagem útil — e a RPC `set_talkx_campaign_ab` também fecha na faixa, então
  // divergir aqui só esconde o erro do operador.
  it('a amostra mínima respeita a faixa que a CHECK da coluna aceita', () => {
    const setAbMinSample = vi.fn();
    render(<TalkXWizardDelivery ed={deliveryEd({ abEnabled: true, setAbMinSample })} />);
    const campo = screen.getByLabelText('Amostra mínima por variante') as HTMLInputElement;

    expect(campo.type).toBe('number');
    expect(campo.min).toBe('1');
    expect(campo.max).toBe('1000000');

    fireEvent.change(campo, { target: { value: '120' } });
    expect(setAbMinSample).toHaveBeenCalledWith(120);
  });
});
