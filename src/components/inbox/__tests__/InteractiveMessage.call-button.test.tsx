/**
 * R2-INB-003 (t_4f478510) — o construtor passou a emitir botões com o tipo
 * canônico da Evolution ('reply' | 'url' | 'call'). O renderizador de mensagens
 * interativas só conhecia 'phone' para o link de ligação: um botão 'call' saía
 * sem ícone e o clique não abria o discador.
 *
 * Prova (vermelho antes / verde depois): clicar num botão type='call' abre
 * `tel:` com o número, e o alias legado 'phone' continua funcionando.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractiveMessageDisplay } from '@/components/inbox/InteractiveMessage';

function mensagem(tipo: 'call' | 'phone') {
  return {
    type: 'buttons' as const,
    body: 'Fale com o time',
    buttons: [{ id: 'btn_1', title: 'Ligar agora', type: tipo, phoneNumber: '5511999990001' }],
  };
}

describe('InteractiveMessageDisplay — botão de ligação (R2-INB-003)', () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    openSpy.mockReset();
    vi.stubGlobal('open', openSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("abre o discador para o tipo canônico 'call'", () => {
    render(<InteractiveMessageDisplay interactive={mensagem('call')} isSent={false} />);
    screen.getByRole('button', { name: /ligar agora/i }).click();

    expect(openSpy).toHaveBeenCalledWith('tel:5511999990001', '_self');
  });

  it("mantém o alias legado 'phone' funcionando", () => {
    render(<InteractiveMessageDisplay interactive={mensagem('phone')} isSent={false} />);
    screen.getByRole('button', { name: /ligar agora/i }).click();

    expect(openSpy).toHaveBeenCalledWith('tel:5511999990001', '_self');
  });
});
