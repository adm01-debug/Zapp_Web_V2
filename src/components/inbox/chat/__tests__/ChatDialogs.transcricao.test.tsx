/**
 * Doc 11 (achado G12) — o texto FINAL da transcrição entrava no campo com um
 * espaço na frente quando o campo estava vazio: `prev + ' ' + text` com
 * `prev === ''` produz " bom dia…". Quem junta é o ChatDialogs.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/inbox/RealtimeTranscription', () => ({
  RealtimeTranscription: ({ onTranscript }: { onTranscript?: (texto: string, final: boolean) => void }) => (
    <button type="button" onClick={() => onTranscript?.('bom dia, tudo bem', true)}>transcrever</button>
  ),
}));

import { ChatDialogs } from '../ChatDialogs';

function montar(entrada: string) {
  const aplicado: string[] = [];
  const onSetInputValue = vi.fn((valor: string | ((prev: string) => string)) => {
    aplicado.push(typeof valor === 'function' ? valor(entrada) : valor);
  });

  render(
    <ChatDialogs
      dialogs={{ realtimeTranscription: true } as never}
      openDialog={vi.fn()}
      closeDialog={vi.fn()}
      conversation={{ contact: { id: 'c1', name: 'Ana', phone: '+5511999999999', queue_id: null, avatar: null } } as never}
      forwardMessage={null}
      contactId="c1"
      onTransfer={vi.fn()}
      onScheduleMessage={vi.fn()}
      onSendInteractiveMessage={vi.fn()}
      onForwardToTargets={vi.fn()}
      onSendLocation={vi.fn()}
      onSetInputValue={onSetInputValue}
    />,
  );

  return aplicado;
}

async function transcrever() {
  fireEvent.click(await screen.findByRole('button', { name: 'transcrever' }, { timeout: 5000 }));
}

describe('G12 — transcrição em tempo real no campo de mensagem', () => {
  // O painel é `lazy()`; pré-aquecer o módulo evita que o 1º caso corra com o
  // chunk ainda carregando (o `Suspense` cai em `fallback={null}`).
  beforeAll(async () => {
    await import('@/components/inbox/RealtimeTranscription');
  });

  beforeEach(() => vi.clearAllMocks());

  it('campo VAZIO: o texto entra sem espaço na frente', async () => {
    const aplicado = montar('');

    await transcrever();

    expect(aplicado).toEqual(['bom dia, tudo bem']);
    expect(aplicado[0].startsWith(' ')).toBe(false);
  });

  it('campo com texto: separa por UM espaço', async () => {
    const aplicado = montar('Boa tarde');

    await transcrever();

    expect(aplicado).toEqual(['Boa tarde bom dia, tudo bem']);
  });
});
