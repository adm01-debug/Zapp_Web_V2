/**
 * X133 — passo Entrega reutilizável (TL-145).
 *
 * O corpo destas seções vivia preso ao objeto do wizard (`TalkXWizardDelivery`) e
 * a tela 10 não conseguia usar nada. Aqui a prova monta as seções REAIS com props
 * e confere o que o operador vê quando o valor muda — as três regras que o item
 * cobra: a velocidade vem do perfil escolhido, o horário comercial vem das
 * configurações gravadas e o fuso salvo volta selecionado.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// O gatilho do Select (Radix) chama `hasPointerCapture` no pointerdown que o abre;
// o jsdom não implementa captura de ponteiro.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import {
  ScheduleSection, SendWindowSection, ThrottleSection, SuppressionSection, ConnectionSection, AdvancedThrottleSliders,
} from '../TalkXDeliverySections';
import {
  formatBusinessHours, profileMessagesPerMinute, daysToDeliver, readTalkXBusinessHours,
  DEFAULT_TALKX_BUSINESS_HOURS,
} from '../talkxDeliveryRules';
import { TALKX_TIMEZONES, talkxTimezoneLabel } from '../talkxTimezones';

const noop = () => {};

function openTimezoneSelect() {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Fuso horário' }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
}

describe('TalkXDeliverySections — fuso horário (lista única)', () => {
  it('traz o rótulo que o operador lê, com o offset, para o fuso padrão', () => {
    expect(talkxTimezoneLabel('America/Sao_Paulo')).toBe('(UTC-03:00) Brasília (BRT)');
    // Um valor que o banco aceita mas a tela ainda não lista volta como veio.
    expect(talkxTimezoneLabel('Australia/Sydney')).toBe('Australia/Sydney');
    expect(new Set(TALKX_TIMEZONES.map((timezone) => timezone.value)).size).toBe(TALKX_TIMEZONES.length);
    expect(talkxTimezoneLabel('America/Santiago')).toBe('(UTC-04:00/UTC-03:00) Santiago (CLT/CLST)');
    expect(talkxTimezoneLabel('America/New_York')).toBe('(UTC-05:00/UTC-04:00) Nova York (ET)');
    expect(talkxTimezoneLabel('Europe/London')).toBe('(UTC+00:00/UTC+01:00) Londres (GMT/BST)');
    expect(talkxTimezoneLabel('Europe/Lisbon')).toBe('(UTC+00:00/UTC+01:00) Lisboa (WET/WEST)');
  });

  it('volta com o fuso SALVO selecionado, e não com o primeiro da lista', () => {
    const { unmount } = render(
      <ScheduleSection
        scheduled
        onScheduledChange={noop}
        scheduledAt="2026-10-15T14:30"
        onScheduledAtChange={noop}
        minimumScheduledAt="2026-10-09T12:00"
        timezone="America/Manaus"
        onTimezoneChange={noop}
        statusLabel="Agendada"
      />,
    );

    // Data e hora são campos SEPARADOS (antes era um datetime-local só) e partem
    // do mesmo valor salvo.
    expect((screen.getByDisplayValue('2026-10-15') as HTMLInputElement).value).toBe('2026-10-15');
    expect((screen.getByDisplayValue('14:30') as HTMLInputElement).value).toBe('14:30');

    openTimezoneSelect();
    // O Radix marca o item escolhido com `data-state="checked"` (o `aria-selected`
    // fica "false" mesmo no item marcado quando o select é de escolha única).
    expect(screen.getByRole('option', { name: '(UTC-04:00) Manaus (AMT)' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('option', { name: '(UTC-03:00) Brasília (BRT)' }).getAttribute('data-state')).toBe('unchecked');
    unmount();

    // Trocar o valor salvo muda a opção marcada — o seletor lê o dado, não a ordem.
    render(
      <ScheduleSection
        scheduled
        onScheduledChange={noop}
        scheduledAt="2026-10-15T14:30"
        onScheduledAtChange={noop}
        minimumScheduledAt="2026-10-09T12:00"
        timezone="America/Sao_Paulo"
        onTimezoneChange={noop}
        statusLabel="Agendada"
      />,
    );
    openTimezoneSelect();
    expect(screen.getByRole('option', { name: '(UTC-03:00) Brasília (BRT)' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('option', { name: '(UTC-04:00) Manaus (AMT)' }).getAttribute('data-state')).toBe('unchecked');
  });

  it('monta data e hora em campos separados sem zerar o outro lado', () => {
    const onScheduledAtChange = vi.fn();
    render(
      <ScheduleSection
        scheduled
        onScheduledChange={noop}
        scheduledAt="2026-10-15T14:30"
        onScheduledAtChange={onScheduledAtChange}
        minimumScheduledAt="2026-10-09T12:00"
        timezone="America/Sao_Paulo"
        onTimezoneChange={noop}
        statusLabel="Agendada"
      />,
    );

    fireEvent.change(screen.getByDisplayValue('2026-10-15'), { target: { value: '2026-10-20' } });
    expect(onScheduledAtChange).toHaveBeenLastCalledWith('2026-10-20T14:30');

    fireEvent.change(screen.getByDisplayValue('14:30'), { target: { value: '09:45' } });
    expect(onScheduledAtChange).toHaveBeenLastCalledWith('2026-10-15T09:45');
  });

  it('aplica mínimo de hora quando a data é o mesmo dia do mínimo agendável', () => {
    const { rerender } = render(
      <ScheduleSection
        scheduled
        onScheduledChange={noop}
        scheduledAt="2026-10-09T14:30"
        onScheduledAtChange={noop}
        minimumScheduledAt="2026-10-09T12:15"
        timezone="America/Sao_Paulo"
        onTimezoneChange={noop}
        statusLabel="Agendada"
      />,
    );

    expect((screen.getByDisplayValue('14:30') as HTMLInputElement).min).toBe('12:15');

    rerender(
      <ScheduleSection
        scheduled
        onScheduledChange={noop}
        scheduledAt="2026-10-10T14:30"
        onScheduledAtChange={noop}
        minimumScheduledAt="2026-10-09T12:15"
        timezone="America/Sao_Paulo"
        onTimezoneChange={noop}
        statusLabel="Agendada"
      />,
    );

    expect((screen.getByDisplayValue('14:30') as HTMLInputElement).min).toBe('');
  });
});

describe('TalkXDeliverySections — horário comercial das configurações', () => {
  function renderWindow(businessHours: typeof DEFAULT_TALKX_BUSINESS_HOURS) {
    return (
      <SendWindowSection
        enabled
        onEnabledChange={noop}
        start="08:00"
        end="18:00"
        onStartChange={noop}
        onEndChange={noop}
        timezone="America/Sao_Paulo"
        businessHoursOnly
        onBusinessHoursOnlyChange={noop}
        businessHours={businessHours}
      />
    );
  }

  it('mostra o horário GRAVADO (antes era a constante "segunda a sexta, 08:00 às 18:00")', () => {
    const { rerender } = render(renderWindow(DEFAULT_TALKX_BUSINESS_HOURS));
    expect(screen.getByTestId('talkx-business-hours').textContent).toContain('no fuso (UTC-03:00) Brasília (BRT)');
    expect(screen.getByTestId('talkx-business-hours').textContent).toContain('Seg–Sex, das 08:00 às 18:00');
    expect(screen.getByTestId('talkx-send-days').textContent).toContain('Dias de envio: Seg–Sex');

    // Mudar as configurações muda o texto — inclusive os dias.
    rerender(renderWindow({ start: '07:30', end: '19:00', days: [1, 2, 3, 4, 5, 6] }));
    expect(screen.getByTestId('talkx-business-hours').textContent).toContain('Seg–Sáb, das 07:30 às 19:00');
    expect(screen.getByTestId('talkx-send-days').textContent).toContain('Dias de envio: Seg–Sáb');
  });

  it('lê a chave `business_hours` de `talkx_settings` e cai no default do motor quando falta', () => {
    const fromSettings = readTalkXBusinessHours([
      { key: 'business_hours', value: { start: '09:00', end: '17:00', days: [1, 3, 5] } },
      { key: 'outra_chave', value: { start: '00:00', end: '00:00', days: [] } },
    ]);
    expect(formatBusinessHours(fromSettings)).toBe('Seg, Qua, Sex, das 09:00 às 17:00');

    // Sem configuração (ou fora do contrato) vale o default do motor: 08:00–18:00, seg–sex.
    expect(readTalkXBusinessHours(undefined)).toEqual(DEFAULT_TALKX_BUSINESS_HOURS);
    expect(readTalkXBusinessHours([{ key: 'business_hours', value: { start: 'x', end: 'y', days: [] } }]))
      .toEqual(DEFAULT_TALKX_BUSINESS_HOURS);
  });
});

describe('TalkXDeliverySections — throttle', () => {
  it('troca o intervalo exibido para o valor efetivo que o slider avançado muda', () => {
    const { rerender } = render(
      <ThrottleSection
        speedProfile="moderate"
        onSpeedProfileChange={noop}
        audienceTotal={250}
        campaignMaxPerMinute={null}
        connectionDailyLimit={null}
        sendInterval={[8, 20]}
        messagesPerMinute={4.3}
        estimatedTime="58 min"
        advanced={<AdvancedThrottleSliders typingDelay={[1.5, 4]} sendInterval={[8, 20]} onTypingDelayChange={noop} onSendIntervalChange={noop} />}
      />,
    );
    expect(screen.getByTestId('talkx-throttle-interval').textContent).toBe('Intervalo de 8s a 20s · ~4.3 mensagens/min');
    expect(screen.getByTestId('talkx-estimated-time').textContent).toBe('58 min');
    expect(profileMessagesPerMinute('moderate')).toBe(4.3);

    rerender(
      <ThrottleSection
        speedProfile="moderate"
        onSpeedProfileChange={noop}
        audienceTotal={250}
        campaignMaxPerMinute={null}
        connectionDailyLimit={null}
        sendInterval={[30, 40]}
        messagesPerMinute={1.6}
        estimatedTime="2 h 25 min"
        advanced={<AdvancedThrottleSliders typingDelay={[1.5, 4]} sendInterval={[30, 40]} onTypingDelayChange={noop} onSendIntervalChange={noop} />}
      />,
    );
    expect(screen.getByTestId('talkx-throttle-interval').textContent).toBe('Intervalo de 30s a 40s · ~1.6 mensagens/min');
    expect(screen.getByTestId('talkx-estimated-time').textContent).toBe('2 h 25 min');
  });

  it('mostra o limite da campanha, o limite diário da conexão e quantos dias ele leva', () => {
    render(
      <ThrottleSection speedProfile="slow" onSpeedProfileChange={noop} audienceTotal={250} campaignMaxPerMinute={60} connectionDailyLimit={100} />,
    );
    expect(screen.getByTestId('talkx-campaign-limit').textContent).toBe('60/min');
    expect(screen.getByTestId('talkx-connection-daily-limit').textContent).toBe('100/dia');
    expect(screen.getByTestId('talkx-connection-daily-limit').parentElement?.textContent).toContain('leva 3 dias');
    expect(daysToDeliver(250, 100)).toBe(3);
  });

  it('sem limite definido não inventa número', () => {
    render(<ThrottleSection speedProfile="moderate" onSpeedProfileChange={noop} audienceTotal={250} campaignMaxPerMinute={null} connectionDailyLimit={null} />);
    expect(screen.getByTestId('talkx-campaign-limit').textContent).toBe('sem limite definido');
    expect(screen.getByTestId('talkx-connection-daily-limit').textContent).toBe('sem limite definido');
    expect(daysToDeliver(250, null)).toBeNull();
  });
});

describe('TalkXDeliverySections — supressão e conexão', () => {
  it('marca a supressão conforme o valor persistido e mantém a segunda caixa fixa', () => {
    render(<SuppressionSection respectSuppression onRespectSuppressionChange={noop} suppressedCount={12} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0].getAttribute('aria-checked')).toBe('true');
    expect(boxes[1].getAttribute('aria-checked')).toBe('true');
    expect(boxes[1].hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/12 no público atual/)).toBeTruthy();
  });

  it('sem conexão ativa mostra o estado "desconectada" do kit; com conexão, o estado ao vivo', () => {
    const { rerender } = render(<ConnectionSection connections={[]} connectionId="" onConnectionChange={noop} onConnect={noop} />);
    expect(screen.getByText('Conexão WhatsApp desconectada')).toBeTruthy();

    rerender(
      <ConnectionSection
        connections={[{ id: 'c1', name: 'Principal', phone_number: '5511999999999' }]}
        connectionId="c1"
        onConnectionChange={noop}
        onConnect={noop}
      />,
    );
    expect(screen.getByTestId('talkx-connection-state').textContent).toBe('Principal · conectada e pronta');
  });
});
