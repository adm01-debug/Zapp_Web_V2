/**
 * SL-198 — itens 061-062 do inventário: linha do tempo de envio POR MENSAGEM e a barra de
 * falhas/progresso de fila da conversa.
 *
 * O defeito: `MessageStatus.tsx` e o `MessageStatusIcon` (`chat/messageUtils.tsx`) mostram só o
 * ÚLTIMO estado — não existia `MessageAttemptsTimeline` nem `MessageSendHistorySheet`, então
 * "quantas tentativas" e "quando" não tinham onde aparecer.
 *
 * Como este teste prova: usa as colunas REAIS de `public.messages` como as RPCs de entrega as
 * deixam (`enqueue_outbound_message` → 'sending'; `claim_outbound_message` → +1 tentativa e o
 * claim; `complete_outbound_message` → sent/delivered/read; `fail_outbound_message` → 'failed' ou
 * de volta a 'sending' quando `p_retryable`), verifica o cálculo passo a passo e depois renderiza
 * os componentes de verdade (`MessageSendHistorySheet`, `MessageAttemptsTimeline`, `ChatQueueProgress`).
 * O cálculo está em `../messageSendTimeline` (a regra da casa `react-refresh/only-export-components`
 * não deixa um arquivo exportar componente E função pura).
 *
 * Antes da correção (vermelho): os dois arquivos não existiam — o import não resolvia.
 */
import { describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { render, screen } from '@testing-library/react';
import { Message } from '@/types/chat';
import {
  ChatQueueProgress,
  MessageAttemptsTimeline,
  MessageSendHistorySheet,
} from '../MessageSendHistorySheet';
import { buildMessageSendTimeline, summarizeDeliveryProgress } from '../messageSendTimeline';

/** Linha de `public.messages` como as RPCs de entrega a deixam (só as colunas que importam aqui). */
function linha(over: Partial<Message>): Message {
  return {
    id: 'm-1',
    content: 'bom dia',
    sender: 'agent',
    timestamp: new Date('2026-10-09T12:00:00.000Z'),
    type: 'text',
    created_at: '2026-10-09T12:00:00.000Z',
    status: 'sending',
    status_updated_at: '2026-10-09T12:00:00.000Z',
    delivery_attempt_count: 0,
    delivery_claimed_at: null,
    delivery_claim_expires_at: null,
    delivery_last_claim_token: null,
    ...over,
  } as Message;
}

const hora = (iso: string) => format(new Date(iso), 'HH:mm:ss');

describe('SL-198 / 061 — linha do tempo de envio por mensagem', () => {
  it('mensagem enviada: enfileirada -> 1 tentativa -> enviada, com os horários reais de cada passo', () => {
    const passos = buildMessageSendTimeline(
      linha({
        status: 'sent',
        status_updated_at: '2026-10-09T12:00:04.000Z',
        delivery_attempt_count: 1,
        delivery_last_claim_token: '11111111-1111-1111-1111-111111111111',
      }),
    );

    expect(passos.map((p) => p.key)).toEqual(['queued', 'attempt', 'result']);
    expect(passos[0]).toMatchObject({ label: 'Enfileirada', at: '2026-10-09T12:00:00.000Z', state: 'done' });
    expect(passos[1]).toMatchObject({ label: 'Tentativa 1 de envio', state: 'done' });
    expect(passos[2]).toMatchObject({ label: 'Enviado', at: '2026-10-09T12:00:04.000Z', state: 'done' });
  });

  it('mensagem com 3 tentativas: mostra as 3 e o estado final de falha com o horário do banco', () => {
    const passos = buildMessageSendTimeline(
      linha({
        status: 'failed',
        status_updated_at: '2026-10-09T12:07:31.000Z',
        delivery_attempt_count: 3,
        delivery_last_claim_token: '22222222-2222-2222-2222-222222222222',
      }),
    );

    expect(passos[1].label).toBe('Tentativas 1 a 3 de envio');
    expect(passos[1].detail).toBe('3 tentativas');
    expect(passos[2]).toMatchObject({ label: 'Falha no envio', at: '2026-10-09T12:07:31.000Z', state: 'error' });
  });

  it('tentativa em voo: usa o claim real (delivery_claimed_at) e mostra até quando o lease vale', () => {
    const passos = buildMessageSendTimeline(
      linha({
        status: 'sending',
        status_updated_at: '2026-10-09T12:00:00.000Z',
        delivery_attempt_count: 2,
        delivery_claimed_at: '2026-10-09T12:02:10.000Z',
        delivery_claim_expires_at: '2026-10-09T12:02:40.000Z',
        delivery_last_claim_token: '33333333-3333-3333-3333-333333333333',
      }),
    );

    expect(passos[1]).toMatchObject({
      label: 'Tentativa 2 em andamento',
      at: '2026-10-09T12:02:10.000Z',
      state: 'current',
    });
    expect(passos[1].detail).toBe(`lease até ${hora('2026-10-09T12:02:40.000Z')}`);
    expect(passos[2]).toMatchObject({ label: 'Aguardando confirmação de entrega', state: 'current' });
  });

  it('falha recuperável: a mensagem já teve tentativa fechada e voltou para a fila (status sending)', () => {
    const passos = buildMessageSendTimeline(
      linha({
        status: 'sending',
        delivery_attempt_count: 1,
        delivery_claimed_at: null,
        delivery_last_claim_token: '44444444-4444-4444-4444-444444444444',
      }),
    );

    expect(passos[1]).toMatchObject({
      label: 'Tentativa 1 falhou e foi reposta na fila',
      state: 'current',
      at: null,
    });
  });

  it('nada de tentativa ainda: a mensagem está só na fila do worker', () => {
    const passos = buildMessageSendTimeline(linha({}));

    expect(passos[1]).toMatchObject({ label: 'Aguardando o worker de entrega', state: 'current', at: null });
    expect(passos[2]).toMatchObject({ label: 'Na fila de entrega', state: 'current' });
  });

  it('mensagem RECEBIDA não tem linha do tempo de envio', () => {
    expect(buildMessageSendTimeline(linha({ sender: 'contact' }))).toEqual([]);
  });
});

describe('SL-198 / 061 — a timeline renderiza o que a linha do banco diz', () => {
  it('o sheet mostra os 3 passos com os horários do banco', () => {
    render(
      <MessageSendHistorySheet
        open
        onOpenChange={vi.fn()}
        message={linha({
          status: 'failed',
          status_updated_at: '2026-10-09T12:07:31.000Z',
          delivery_attempt_count: 3,
          delivery_last_claim_token: '55555555-5555-5555-5555-555555555555',
        })}
      />,
    );

    expect(screen.getByText('Histórico de envio')).toBeTruthy();
    expect(screen.getByText('Enfileirada')).toBeTruthy();
    expect(screen.getByText('Tentativas 1 a 3 de envio')).toBeTruthy();
    expect(screen.getByText('Falha no envio')).toBeTruthy();
    expect(screen.getByText(hora('2026-10-09T12:00:00.000Z'))).toBeTruthy();
    expect(screen.getByText(hora('2026-10-09T12:07:31.000Z'))).toBeTruthy();
    // Coluna de texto de estado: o token AA do sistema, nunca o de preenchimento (E.3).
    const falha = screen.getByText('Falha no envio');
    expect(falha.className).toContain('--destructive-text');
    expect(falha.className).not.toContain('text-destructive ');
  });

  it('MessageAttemptsTimeline é renderizável sozinha com os passos calculados', () => {
    render(<MessageAttemptsTimeline steps={buildMessageSendTimeline(linha({ status: 'sent', delivery_attempt_count: 1, delivery_last_claim_token: '66666666-6666-6666-6666-666666666666' }))} />);

    expect(screen.getByText('Tentativa 1 de envio')).toBeTruthy();
    expect(screen.getByText('Enviado')).toBeTruthy();
  });
});

describe('SL-198 / 062 — barra de falhas e progresso de fila da conversa', () => {
  const conversa: Message[] = [
    linha({ id: 'a', status: 'sending', delivery_attempt_count: 0 }),
    linha({ id: 'b', status: 'sending', delivery_attempt_count: 1, delivery_claimed_at: '2026-10-09T12:02:10.000Z', delivery_claim_expires_at: '2026-10-09T12:02:40.000Z', delivery_last_claim_token: '77777777-7777-7777-7777-777777777777' }),
    linha({ id: 'c', status: 'failed', delivery_attempt_count: 3, delivery_last_claim_token: '88888888-8888-8888-8888-888888888888' }),
    linha({ id: 'd', status: 'delivered', delivery_attempt_count: 1, delivery_last_claim_token: '99999999-9999-9999-9999-999999999999' }),
    linha({ id: 'e', status: 'read', delivery_attempt_count: 1, delivery_last_claim_token: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
    linha({ id: 'f', sender: 'contact', status: null }),
  ];

  it('conta a fila por estado real, ignorando o que o contato mandou', () => {
    expect(summarizeDeliveryProgress(conversa)).toEqual({
      total: 5,
      queued: 1,
      inFlight: 1,
      failed: 1,
      confirmed: 2,
    });
  });

  it('sem nada na fila nem falha, a barra não aparece (nada de toast/banner repetido)', () => {
    const { container } = render(
      <ChatQueueProgress messages={[linha({ status: 'delivered', delivery_attempt_count: 1, delivery_last_claim_token: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' })]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('com fila e falha, anuncia os quatro números', () => {
    render(<ChatQueueProgress messages={conversa} />);

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('5');
    expect(screen.getByText(/1 na fila/)).toBeTruthy();
    expect(screen.getByText(/1 em envio/)).toBeTruthy();
    expect(screen.getByText(/1 falha/)).toBeTruthy();
    expect(screen.getByText(/2 confirmadas/)).toBeTruthy();
  });
});
