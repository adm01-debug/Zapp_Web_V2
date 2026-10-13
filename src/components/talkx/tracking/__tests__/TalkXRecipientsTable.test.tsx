/**
 * X150 — tabela única de destinatários (`tracking/TalkXRecipientsTable`).
 *
 * O defeito real que este teste protege: cada tela desenhava a própria lista do
 * mesmo destinatário. A tela 11 tinha colunas fixas (Contato/Telefone/Status/
 * Enviada em/Entregue em) e mapa de estado local; a tela 12 tinha cartões, sem
 * telefone, busca, filtro, contagem ou paginação. Um destinatário "lido" não
 * aparecia como "Lida" (o banco não guarda esse valor em `status` — só `read_at`),
 * e o horário de quem ainda está na fila ficava "—".
 *
 * Aqui o componente REAL é renderizado e o usuário age: digita na busca, escolhe
 * o estado no select, troca de página/tamanho, abre o menu de ações.
 */
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// O jsdom não implementa captura de ponteiro; os gatilhos do Select e do menu (Radix)
// chamam `hasPointerCapture`/`setPointerCapture` no pointerdown que os abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { TalkXRecipientsTable, type TalkXRecipientRow } from '../TalkXRecipientsTable';

const LINHA = (i: number, extra: Partial<TalkXRecipientRow> = {}): TalkXRecipientRow => ({
  id: `r${i}`,
  status: 'sent',
  sent_at: '2026-10-08T12:05:00.000Z',
  updated_at: '2026-10-08T12:05:00.000Z',
  contacts: { name: `Contato ${i}`, phone: `+551199999000${i}`, company: 'Loja', avatar_url: null, lead_origin: 'Singu' },
  ...extra,
});

/** 12 destinatários: base para paginação, busca e filtro. */
const DOZE: TalkXRecipientRow[] = Array.from({ length: 12 }, (_, i) => LINHA(i + 1));

const ESTADOS: TalkXRecipientRow[] = [
  LINHA(1, { status: 'delivered', delivered_at: '2026-10-08T12:06:00.000Z', read_at: '2026-10-08T12:07:00.000Z', contacts: { name: 'Ana Lida', phone: '+5511911110001', lead_origin: 'CRM 360' } }),
  LINHA(2, { status: 'sending', sent_at: null, replied_at: '2026-10-08T12:08:00.000Z', contacts: { name: 'Bruno Respondeu', phone: '+5511911110002' } }),
  LINHA(3, { status: 'pending', sent_at: null, contacts: { name: 'Caio Sem Fone', phone: null } }),
  LINHA(4, { status: 'failed', error_message: 'Número inválido', contacts: { name: 'Dora Falha', phone: '+5511911110004' } }),
  // Entregue e depois o contato perdeu o telefone: o desfecho NÃO pode virar "Sem telefone".
  LINHA(5, { status: 'delivered', delivered_at: '2026-10-08T12:09:00.000Z', contacts: { name: 'Elza Entregue', phone: null } }),
];

function renderEstados(props: Partial<Parameters<typeof TalkXRecipientsTable>[0]> = {}) {
  return render(<TalkXRecipientsTable rows={ESTADOS} onRetry={vi.fn()} {...props} />);
}

/** Rótulo de estado que o usuário vê na linha do contato. */
const estadoDe = (nome: string) => {
  const linha = screen.getByText(nome).closest('tr') as HTMLElement;
  return linha.textContent ?? '';
};

const abrirSelect = (nome: string) => {
  const trigger = screen.getByRole('combobox', { name: nome });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(trigger);
};

describe('X150 — colunas, estados, busca, filtro e paginação (tabela única)', () => {
  it('a variante "live" traz as colunas da tela 11 e a "deliveries" as da tela 12', () => {
    const { unmount } = render(<TalkXRecipientsTable rows={DOZE} variant="live" />);
    for (const header of ['Contato', 'Origem', 'Segmento', 'Status', 'Horário']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    // Na variante da tela 11 a mensagem sai do menu de ações, não em coluna própria.
    expect(screen.queryByRole('columnheader', { name: 'Mensagem' })).toBeNull();
    unmount();

    render(<TalkXRecipientsTable rows={DOZE} variant="deliveries" />);
    for (const header of ['Contato', 'Segmento', 'Status', 'Tiques', 'Horário', 'Mensagem']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    expect(screen.queryByRole('columnheader', { name: 'Origem' })).toBeNull();
  });

  it('os estados derivados aparecem: Lida (read_at), Respondida (replied_at) e Sem telefone (fila sem telefone)', () => {
    renderEstados();

    expect(estadoDe('Ana Lida')).toContain('Lida');
    expect(estadoDe('Bruno Respondeu')).toContain('Respondida');
    expect(estadoDe('Caio Sem Fone')).toContain('Sem telefone');
    expect(estadoDe('Dora Falha')).toContain('Falha');
    // O desfecho real vence o derivado: entregue não vira "Sem telefone".
    expect(estadoDe('Elza Entregue')).toContain('Entregue');
    expect(estadoDe('Elza Entregue')).not.toContain('Sem telefone');
  });

  it('o horário é HH:mm em todos os estados — inclusive em quem ainda está na fila', () => {
    renderEstados();

    // Coluna "Horário" da variante live: Contato, Origem, Segmento, Status, Horário, Ações.
    const horarioDe = (nome: string) => {
      const tds = (screen.getByText(nome).closest('tr') as HTMLElement).querySelectorAll('td');
      return tds[4].textContent ?? '';
    };

    // "Na fila" não tem envio: o horário vem do updated_at da linha (antes ficava "—").
    expect(horarioDe('Caio Sem Fone')).toMatch(/^\d{2}:\d{2}$/);
    expect(horarioDe('Ana Lida')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('mostra os tiques (enviado/entregue/lido) por linha, sem indicar canal', () => {
    renderEstados({ variant: 'deliveries' });

    const lida = screen.getByText('Ana Lida').closest('tr') as HTMLElement;
    expect(within(lida).getByLabelText('Entregue').getAttribute('data-on')).toBe('true');
    expect(within(lida).getByLabelText('Lido').getAttribute('data-on')).toBe('true');

    const fila = screen.getByText('Caio Sem Fone').closest('tr') as HTMLElement;
    expect(within(fila).getByLabelText('Enviado').getAttribute('data-on')).toBe('false');
    expect(within(fila).getByLabelText('Lido').getAttribute('data-on')).toBe('false');
  });

  it('a busca espera 300 ms antes de filtrar (e filtra nome/fone/empresa)', () => {
    vi.useFakeTimers();
    try {
      renderEstados();
      const busca = screen.getByPlaceholderText('Buscar destinatário…');

      fireEvent.change(busca, { target: { value: 'Dora' } });
      act(() => { vi.advanceTimersByTime(299); });
      // Ainda dentro da espera: a lista não mudou.
      expect(screen.getByText('Ana Lida')).toBeTruthy();

      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.queryByText('Ana Lida')).toBeNull();
      expect(screen.getByText('Dora Falha')).toBeTruthy();
      expect(screen.getByText('Mostrando 1 a 1 de 1 destinatários')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o filtro por estado usa o mapa único do kit (Lida filtra pela linha lida)', async () => {
    renderEstados();

    abrirSelect('Filtrar por estado');
    fireEvent.click(screen.getByRole('option', { name: 'Lida' }));

    await waitFor(() => expect(screen.queryByText('Dora Falha')).toBeNull());
    expect(screen.getByText('Ana Lida')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 1 destinatários')).toBeTruthy();
  });

  it('paginação por página: contagem, 2ª página e tamanho de página com efeito', () => {
    render(<TalkXRecipientsTable rows={DOZE} onRetry={vi.fn()} />);
    expect(screen.getByText('Mostrando 1 a 10 de 12 destinatários')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 11 a 12 de 12 destinatários')).toBeTruthy();

    // R2-MOD-060: controle sem efeito é defeito — "20 por página" mostra os 12 e volta à 1ª.
    const linhaPaginacao = screen.getByText('Mostrando 11 a 12 de 12 destinatários').parentElement as HTMLElement;
    const trigger = within(linhaPaginacao).getByRole('combobox');
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('option', { name: '20 por página' }));

    expect(screen.getByText('Mostrando 1 a 12 de 12 destinatários')).toBeTruthy();
    expect(screen.getAllByText(/^Contato \d+$/)).toHaveLength(12);
  });

  it('paginação "Carregar mais": cresce em lotes e some quando acaba', () => {
    const sete = DOZE.slice(0, 7);
    render(<TalkXRecipientsTable rows={sete} pagination="more" pageSize={3} />);

    expect(screen.getByText('Mostrando 3 de 7 destinatários')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(screen.getByText('Mostrando 6 de 7 destinatários')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(screen.getByText('Mostrando 7 de 7 destinatários')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('sem resultado pelo filtro: explica e limpa busca e filtro', async () => {
    renderEstados();

    fireEvent.change(screen.getByPlaceholderText('Buscar destinatário…'), { target: { value: 'inexistente' } });
    await waitFor(() => expect(screen.getByText('Nenhum destinatário corresponde à busca ou ao filtro.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca e filtro' }));
    expect(screen.getByText('Ana Lida')).toBeTruthy();
  });

  it('o menu de ações mostra a mensagem gravada e esconde de novo ("Ver mensagem"/"Ocultar mensagem")', async () => {
    const comMensagem = LINHA(1, { personalized_message: 'Olá Ana, seu cupom chegou!' });
    render(<TalkXRecipientsTable rows={[comMensagem, LINHA(2)]} />);

    const trigger = screen.getByRole('button', { name: 'Ações de Contato 1' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver mensagem' }));

    expect(screen.getByText('Olá Ana, seu cupom chegou!')).toBeTruthy();

    const fechar = screen.getByRole('button', { name: 'Ações de Contato 1' });
    fireEvent.pointerDown(fechar);
    fireEvent.click(fechar);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ocultar mensagem' }));

    await waitFor(() => expect(screen.queryByText('Olá Ana, seu cupom chegou!')).toBeNull());
  });

  it('estados da consulta: carregando, erro com retry e vazio (o erro nunca vira vazio)', () => {
    const onRetry = vi.fn();
    const { container, unmount } = render(<TalkXRecipientsTable rows={[]} isLoading onRetry={onRetry} />);
    expect(container.querySelector('[data-talkx-query="loading"]')?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    unmount();

    const erro = render(<TalkXRecipientsTable rows={[]} isError error={new Error('falha X150')} onRetry={onRetry} />);
    expect(screen.getByText('Não foi possível carregar as informações dos destinatários')).toBeTruthy();
    expect(erro.container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    erro.unmount();

    render(<TalkXRecipientsTable rows={[]} emptyTitle="Nenhum destinatário nesta campanha." />);
    expect(screen.getByText('Nenhum destinatário nesta campanha.')).toBeTruthy();
  });
});
