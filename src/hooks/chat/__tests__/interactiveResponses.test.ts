/**
 * Prova do mapeador: a resposta do cliente a um botão ou a um item de lista deixa de
 * aparecer como o id cru no balão e passa a trazer o texto que ele tocou.
 *
 * O que chega do canal é só o id (`content`), então o título tem de vir do payload
 * imutável da mensagem interativa enviada (`media_meta->outbound_delivery_payload`).
 * Estes casos usam o shape EXATO que a edge `message-delivery` aceita e envia.
 */
import { describe, expect, it } from 'vitest';
import { resolveInteractiveResponses } from '../interactiveResponses';
import { mapMessageRowToMessage } from '@/adapters/inboxAdapter';
import type { Message, MessageRow } from '@/types/chat';

function mensagem(over: Partial<Message> & Pick<Message, 'id' | 'sender' | 'content'>): Message {
  return {
    timestamp: new Date('2026-10-15T12:00:00Z'),
    type: 'text',
    ...over,
  } as Message;
}

const ENVIADA_BOTOES = mensagem({
  id: 'out-botoes',
  sender: 'agent',
  content: '🔘 *Botões:* Como podemos ajudar?\n• Sim\n• Não',
  type: 'buttons' as Message['type'],
  media_meta: {
    outbound_delivery_payload: {
      body: 'Como podemos ajudar?',
      footer: 'Promo',
      buttons: [
        { type: 'reply', displayText: 'Sim', id: 'b-sim' },
        { type: 'reply', displayText: 'Não', id: 'b-nao' },
      ],
    },
  },
});

const ENVIADA_LISTA = mensagem({
  id: 'out-lista',
  sender: 'agent',
  content: '📋 *Lista:* Escolha o produto\n• Smartphones',
  type: 'list' as Message['type'],
  media_meta: {
    outbound_delivery_payload: {
      body: 'Escolha o produto',
      buttonText: 'Ver opções',
      sections: [
        { title: 'Produtos', rows: [{ id: 'r-smar', title: 'Smartphones' }] },
        { title: 'Serviços', rows: [{ id: 'r-cons', title: 'Consultoria' }] },
      ],
    },
  },
});

describe('resolveInteractiveResponses', () => {
  it('resposta de cliente a BOTÃO vira buttonResponse com o texto do botão', () => {
    const [resposta] = resolveInteractiveResponses([
      ENVIADA_BOTOES,
      mensagem({ id: 'in-1', sender: 'contact', content: 'b-sim' }),
    ]).slice(1);

    expect(resposta.buttonResponse).toEqual({ buttonId: 'b-sim', buttonTitle: 'Sim' });
    expect(resposta.listResponse).toBeUndefined();
  });

  it('resposta de cliente a ITEM de lista vira listResponse com seção e item tocados', () => {
    const [resposta] = resolveInteractiveResponses([
      ENVIADA_LISTA,
      mensagem({ id: 'in-2', sender: 'contact', content: 'r-cons' }),
    ]).slice(1);

    expect(resposta.listResponse).toEqual({ sectionTitle: 'Serviços', itemTitle: 'Consultoria' });
    expect(resposta.buttonResponse).toBeUndefined();
  });

  it('texto comum do cliente NÃO vira resposta interativa', () => {
    const resultado = resolveInteractiveResponses([
      ENVIADA_BOTOES,
      ENVIADA_LISTA,
      mensagem({ id: 'in-3', sender: 'contact', content: 'bom dia, tudo bem?' }),
    ]);

    expect(resultado[2].buttonResponse).toBeUndefined();
    expect(resultado[2].listResponse).toBeUndefined();
  });

  it('o id só vale depois do payload: mensagem anterior à interativa não vira resposta', () => {
    const resultado = resolveInteractiveResponses([
      mensagem({ id: 'in-4', sender: 'contact', content: 'b-sim' }),
      ENVIADA_BOTOES,
    ]);

    expect(resultado[0].buttonResponse).toBeUndefined();
  });

  it('sem payload na conversa, a resposta fica como veio (nada inventado)', () => {
    const resultado = resolveInteractiveResponses([
      mensagem({ id: 'in-5', sender: 'contact', content: 'b-sim' }),
    ]);

    expect(resultado[0].buttonResponse).toBeUndefined();
    expect(resultado[0].content).toBe('b-sim');
  });

  it('preserva a identidade da lista quando nada é resolvido', () => {
    const entrada = [mensagem({ id: 'in-6', sender: 'contact', content: 'oi' })];
    expect(resolveInteractiveResponses(entrada)).toBe(entrada);
  });

  it('ponta a ponta: linhas do banco -> Message -> resposta com o texto tocado', () => {
    const linhas = [
      {
        id: 'linha-interativa',
        contact_id: 'c1',
        content: '🔘 *Botões:* Como podemos ajudar?',
        sender: 'agent',
        message_type: 'buttons',
        created_at: '2026-10-15T12:00:00Z',
        media_meta: {
          outbound_delivery_payload: {
            body: 'Como podemos ajudar?',
            buttons: [{ type: 'reply', displayText: 'Sim', id: 'b-sim' }],
          },
        },
      },
      {
        id: 'linha-resposta',
        contact_id: 'c1',
        content: 'b-sim',
        sender: 'contact',
        message_type: 'text',
        created_at: '2026-10-15T12:00:05Z',
      },
    ] as unknown as MessageRow[];

    const resultado = resolveInteractiveResponses(linhas.map(mapMessageRowToMessage));

    expect(resultado[1].buttonResponse).toEqual({ buttonId: 'b-sim', buttonTitle: 'Sim' });
  });
});
