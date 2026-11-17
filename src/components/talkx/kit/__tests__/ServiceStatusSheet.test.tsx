import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServiceStatusSheet } from '../ServiceStatusSheet';
import { TalkXWhatsAppDisconnectedState } from '../states';
import type { TalkXServiceStatus } from '@/hooks/integrations/useTalkXServiceStatus';

/**
 * X048 (TL-106) — o fluxo estava pela metade: os estados de indisponibilidade
 * ofereciam "Ver status dos serviços" quando recebiam `onViewStatus`, e nenhuma
 * tela passava a prop porque não havia painel para abrir. Estes testes cobrem as
 * duas pontas: o botão só existe quando há destino, e o painel diz a verdade
 * sobre o que o sistema checa.
 */

afterEach(() => cleanup());

function status(connected: boolean | null): TalkXServiceStatus {
  return { whatsapp: { connected } };
}

describe('ServiceStatusSheet — X048', () => {
  it('fechado não renderiza nada', () => {
    render(<ServiceStatusSheet open={false} onOpenChange={() => {}} status={status(true)} />);
    expect(screen.queryByText('Status dos serviços')).toBeNull();
  });

  it('aberto lista os três serviços', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(true)} />);
    expect(screen.getByText('Status dos serviços')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('CRM 360°')).toBeTruthy();
    expect(screen.getByText('Tempo real')).toBeTruthy();
  });

  it('WhatsApp conectado aparece como Operacional', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(true)} />);
    expect(screen.getByText('Operacional')).toBeTruthy();
    expect(screen.queryByText('Indisponível')).toBeNull();
  });

  it('WhatsApp sem conexão aparece como Indisponível', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(false)} />);
    expect(screen.getByText('Indisponível')).toBeTruthy();
    expect(screen.queryByText('Operacional')).toBeNull();
  });

  it('WhatsApp indeterminado aparece como Verificando, nunca como Indisponível', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(null)} />);
    expect(screen.getByText('Verificando…')).toBeTruthy();
    expect(screen.queryByText('Indisponível')).toBeNull();
  });

  it('CRM e tempo real aparecem como Não monitorado — o painel não inventa sinal', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(true)} />);
    // Dois serviços sem sinal no sistema: duas linhas "Não monitorado", e nenhuma
    // delas fingindo que há uma checagem em curso.
    expect(screen.getAllByText('Não monitorado')).toHaveLength(2);
    expect(screen.queryByText('Verificando…')).toBeNull();
  });

  it('o botão de fechar tem nome acessível', () => {
    render(<ServiceStatusSheet open onOpenChange={() => {}} status={status(true)} />);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('fechar chama onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<ServiceStatusSheet open onOpenChange={onOpenChange} status={status(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('TalkXWhatsAppDisconnectedState — a ponta que abre o painel', () => {
  // Este é o ponto da correção: na main o botão só existia se a tela passasse
  // `onViewStatus`, e nenhuma passava — então ele nunca chegava à interface.
  // Agora o estado traz o próprio destino e o botão não depende de ligação.
  it('o botão de status aparece SEM a tela precisar ligar nada', () => {
    render(<TalkXWhatsAppDisconnectedState onConnect={() => {}} />);
    expect(screen.getByRole('button', { name: /Ver status dos serviços/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Conectar WhatsApp/i })).toBeTruthy();
  });

  it('clicar abre o painel por conta própria', () => {
    render(<TalkXWhatsAppDisconnectedState onConnect={() => {}} />);
    expect(screen.queryByText('Status dos serviços')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver status dos serviços/i }));

    expect(screen.getByText('Status dos serviços')).toBeTruthy();
    // Sem status explícito, o painel assume o que levou este estado à tela.
    expect(screen.getByText('Indisponível')).toBeTruthy();
  });

  it('o painel interno respeita o status recebido', () => {
    render(
      <TalkXWhatsAppDisconnectedState
        onConnect={() => {}}
        serviceStatus={{ whatsapp: { connected: null } }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver status dos serviços/i }));
    expect(screen.getByText('Verificando…')).toBeTruthy();
  });

  it('onViewStatus SUBSTITUI o destino e não monta o painel interno', () => {
    const onViewStatus = vi.fn();
    render(<TalkXWhatsAppDisconnectedState onConnect={() => {}} onViewStatus={onViewStatus} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver status dos serviços/i }));

    expect(onViewStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Status dos serviços')).toBeNull();
  });

  it('o botão de conectar continua funcionando', () => {
    const onConnect = vi.fn();
    render(<TalkXWhatsAppDisconnectedState onConnect={onConnect} />);
    fireEvent.click(screen.getByRole('button', { name: /Conectar WhatsApp/i }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
