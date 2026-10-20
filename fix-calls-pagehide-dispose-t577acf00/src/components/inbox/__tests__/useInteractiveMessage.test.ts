import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/ui/use-toast', () => ({ toast }));

import { useInteractiveMessage } from '../interactive-builder/useInteractiveMessage';

const ultimoTitulo = () => toast.mock.calls[toast.mock.calls.length - 1]?.[0]?.title;

beforeEach(() => toast.mockReset());

describe('useInteractiveMessage — limites do WhatsApp', () => {
  it('aceita 3 botões e recusa o 4º com aviso', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.addButton('reply'); result.current.addButton('reply'); result.current.addButton('reply'); });
    expect(result.current.buttons).toHaveLength(3);

    act(() => result.current.addButton('reply'));
    expect(result.current.buttons).toHaveLength(3);
    expect(ultimoTitulo()).toBe('Limite atingido');
  });

  it('aceita 10 seções e recusa a 11ª com aviso', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { for (let i = 0; i < 10; i++) result.current.addSection(); });
    expect(result.current.sections).toHaveLength(10);

    act(() => result.current.addSection());
    expect(result.current.sections).toHaveLength(10);
    expect(ultimoTitulo()).toBe('Limite atingido');
  });

  it('aceita 10 itens numa seção e recusa o 11º com aviso', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => result.current.addSection());
    act(() => { for (let i = 0; i < 10; i++) result.current.addRowToSection(0); });
    expect(result.current.sections[0].rows).toHaveLength(10);

    act(() => result.current.addRowToSection(0));
    expect(result.current.sections[0].rows).toHaveLength(10);
    expect(ultimoTitulo()).toBe('Limite atingido');
  });
});

describe('useInteractiveMessage — edição de botões', () => {
  it('adiciona com o tipo pedido e campos conforme o tipo', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => result.current.addButton('url'));
    act(() => result.current.addButton('call'));

    expect(result.current.buttons[0]).toMatchObject({ type: 'url', url: '', title: '' });
    expect(result.current.buttons[1]).toMatchObject({ type: 'call', phoneNumber: '', title: '' });
  });

  it('atualiza e remove botão por índice', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.addButton('reply'); result.current.addButton('reply'); });
    act(() => result.current.updateButton(1, { title: 'Falar com vendedor' }));
    expect(result.current.buttons[1].title).toBe('Falar com vendedor');

    act(() => result.current.removeButton(0));
    expect(result.current.buttons).toHaveLength(1);
    expect(result.current.buttons[0].title).toBe('Falar com vendedor');
  });

  it('conta o total de itens somando todas as seções', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.addSection(); result.current.addSection(); });
    act(() => { result.current.addRowToSection(0); result.current.addRowToSection(0); result.current.addRowToSection(1); });
    expect(result.current.getTotalRows()).toBe(3);
  });
});

describe('useInteractiveMessage — validação (botões)', () => {
  it('exige corpo da mensagem', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => result.current.addButton('reply'));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Corpo obrigatório');
  });

  it('exige pelo menos um botão', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => result.current.setBody('Escolha uma opção'));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Adicione botões');
  });

  it('exige título em todos os botões', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.setBody('Escolha'); result.current.addButton('reply'); });
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Título obrigatório');
  });

  it('recusa título com mais de 20 caracteres', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.setBody('Escolha'); result.current.addButton('reply'); });
    act(() => result.current.updateButton(0, { title: 'a'.repeat(21) }));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Título muito longo');
  });

  it('recusa botão de URL sem link e aceita com link', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.setBody('Site'); result.current.addButton('url'); });
    act(() => result.current.updateButton(0, { title: 'Abrir site' }));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ultimoTitulo()).toBe('URL obrigatória');

    act(() => result.current.updateButton(0, { url: 'https://promobrindes.com.br' }));
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(true);
  });

  it('recusa telefone inválido e aceita número com 8 a 15 dígitos', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.setBody('Ligar'); result.current.addButton('call'); });
    act(() => result.current.updateButton(0, { title: 'Ligar agora', phoneNumber: '123' }));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Telefone obrigatório');

    act(() => result.current.updateButton(0, { phoneNumber: '+55 (11) 98765-4321' }));
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(true);
  });
});

describe('useInteractiveMessage — validação (lista)', () => {
  function prepararLista() {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => { result.current.setMessageType('list'); result.current.setBody('Veja as opções'); });
    return result;
  }

  it('exige pelo menos uma seção', () => {
    const result = prepararLista();
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Adicione seções');
  });

  it('exige título na seção', () => {
    const result = prepararLista();
    act(() => result.current.addSection());
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ultimoTitulo()).toBe('Título de seção obrigatório');
  });

  it('exige pelo menos um item na seção', () => {
    const result = prepararLista();
    act(() => result.current.addSection());
    act(() => result.current.updateSection(0, { title: 'Produtos' }));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Adicione itens');
  });

  it('exige título em cada item', () => {
    const result = prepararLista();
    act(() => result.current.addSection());
    act(() => result.current.updateSection(0, { title: 'Produtos' }));
    act(() => result.current.addRowToSection(0));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Título de item obrigatório');
  });

  it('valida lista completa', () => {
    const result = prepararLista();
    act(() => result.current.addSection());
    act(() => result.current.updateSection(0, { title: 'Produtos' }));
    act(() => result.current.addRowToSection(0));
    act(() => result.current.updateRow(0, 0, { title: 'Caneca' }));
    let ok = false;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(true);
  });

  it('exige texto do botão que abre a lista', () => {
    const result = prepararLista();
    act(() => result.current.addSection());
    act(() => result.current.updateSection(0, { title: 'Produtos' }));
    act(() => result.current.addRowToSection(0));
    act(() => result.current.updateRow(0, 0, { title: 'Caneca' }));
    act(() => result.current.setListButtonText('   '));
    let ok = true;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(ultimoTitulo()).toBe('Texto do botão obrigatório');
  });
});

describe('useInteractiveMessage — montagem e limpeza', () => {
  it('monta a mensagem de botões com cabeçalho e rodapé', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => {
      result.current.setBody('  Escolha uma opção  ');
      result.current.setHeaderText('Promoção');
      result.current.setFooter('Promo Brindes');
      result.current.addButton('reply');
    });
    act(() => result.current.updateButton(0, { title: 'Quero' }));

    expect(result.current.buildMessage()).toEqual({
      type: 'buttons',
      body: 'Escolha uma opção',
      header: { type: 'text', text: 'Promoção' },
      footer: 'Promo Brindes',
      buttons: result.current.buttons,
    });
  });

  it('monta a mensagem de lista com seções e texto do botão', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => {
      result.current.setMessageType('list');
      result.current.setBody('Veja');
      result.current.addSection();
    });
    const msg = result.current.buildMessage();
    expect(msg.type).toBe('list');
    expect(msg.listButtonText).toBe('Ver opções');
    expect(msg.sections).toHaveLength(1);
    expect('buttons' in msg).toBe(false);
  });

  it('resetForm volta ao estado inicial', () => {
    const { result } = renderHook(() => useInteractiveMessage());
    act(() => {
      result.current.setBody('Algo');
      result.current.setHeaderText('Cabeçalho');
      result.current.setListButtonText('Abrir');
      result.current.addButton('reply');
    });
    act(() => result.current.resetForm());

    expect(result.current.messageType).toBe('buttons');
    expect(result.current.body).toBe('');
    expect(result.current.headerText).toBe('');
    expect(result.current.listButtonText).toBe('Ver opções');
    expect(result.current.buttons).toHaveLength(0);
    expect(result.current.sections).toHaveLength(0);
  });
});
