import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * As consultas do inbox deixaram de usar `select('*')`: elas traziam junto o que
 * o front nunca lê (tokens do claim do worker e rastros internos de projeção de
 * IA/avatar). O teste cobra os dois lados: a lista mantém o que alguma tela lê e
 * não traz as colunas internas — e é ela que a consulta manda ao banco.
 */
const h = vi.hoisted(() => {
  const selects: string[] = [];

  function makeQuery() {
    const q: Record<string, unknown> = {};
    // `select` guarda o argumento: é por ele que o teste vê a consulta real.
    q.select = (columns: string) => { selects.push(columns); return q; };
    q.eq = () => q;
    q.order = () => q;
    q.range = () => q;
    q.in = () => q;
    q.limit = () => q;
    q.not = () => q;
    q.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null }));
    return q;
  }

  return { makeQuery, selects };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

import { ChatService } from '@/services/chat.service';
import {
  RealtimeService,
  INBOX_MESSAGE_COLUMNS,
  INBOX_CONTACT_COLUMNS,
} from '@/services/realtime.service';

const colunas = (lista: string) => lista.split(',').map((c) => c.trim());

const LEITURAS_DE_MENSAGEM = [
  'content',
  'media_url',
  'media_type',
  'media_meta',
  'caption',
  'ptt',
  'reply_to_id',
  'link_preview',
  'is_deleted',
  'is_edited',
  'transcription',
  'transcription_status',
  'status',
  'status_updated_at',
  'external_id',
  'is_read',
  'message_type',
  'sender',
  'created_at',
  'contact_id',
  // A linha do tempo de envio (components/inbox/chat/messageSendTimeline.ts) lê:
  'delivery_attempt_count',
  'delivery_claimed_at',
  'delivery_claim_expires_at',
  'delivery_last_claim_token',
];

const LEITURAS_DE_CONTATO = [
  'id',
  'name',
  'surname',
  'phone',
  'email',
  'avatar_url',
  'conversation_status',
  'assigned_to',
  'queue_id',
  'tags',
  'notes',
  'is_lid_legacy',
  'lead_score',
];

beforeEach(() => {
  h.selects.length = 0;
});

describe('colunas do inbox — sem `select(\'*\')`', () => {
  it('messages: mantém todas as colunas que a interface lê', () => {
    const lista = colunas(INBOX_MESSAGE_COLUMNS);
    expect(lista).toEqual(expect.arrayContaining(LEITURAS_DE_MENSAGEM));
  });

  it('messages: não traz os campos internos do claim nem o id de meme de áudio', () => {
    const lista = colunas(INBOX_MESSAGE_COLUMNS);
    for (const interna of ['delivery_claim_token', 'delivery_claimed_by', 'audio_meme_id']) {
      expect(lista).not.toContain(interna);
    }
  });

  it('contacts: mantém as colunas lidas pela conversa/painel e corta os rastros internos', () => {
    const lista = colunas(INBOX_CONTACT_COLUMNS);
    expect(lista).toEqual(expect.arrayContaining(LEITURAS_DE_CONTATO));
    for (const interna of [
      'ai_projection_analysis_id',
      'ai_projection_updated_at',
      'avatar_fetch_attempted_at',
    ]) {
      expect(lista).not.toContain(interna);
    }
  });

  it('a consulta de mensagens da conversa manda a lista, não `*`', async () => {
    await ChatService.fetchMessages('c1');

    expect(h.selects).toHaveLength(1);
    expect(h.selects[0]).toBe(INBOX_MESSAGE_COLUMNS);
    expect(h.selects[0]).not.toContain('*');
  });

  it('a consulta de contatos por id manda a lista (com o embed do SLA), não `*`', async () => {
    await RealtimeService.fetchContactsByIds(['c1']);

    expect(h.selects).toHaveLength(1);
    expect(h.selects[0].startsWith(INBOX_CONTACT_COLUMNS)).toBe(true);
    expect(h.selects[0]).toContain('conversation_sla(');
    expect(h.selects[0].split('conversation_sla(')[0]).not.toContain('*');
  });
});
