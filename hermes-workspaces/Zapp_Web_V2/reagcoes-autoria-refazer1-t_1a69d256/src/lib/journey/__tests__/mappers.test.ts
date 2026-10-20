import { describe, it, expect } from 'vitest';
import {
  MESSAGE_GROUP_WINDOW_MS,
  mapCalls,
  mapConversationEvents,
  mapDealActivities,
  mapDeals,
  mapEmails,
  mapJourneyEvents,
  mapMessages,
  mapNotes,
  mapTasks,
} from '@/lib/journey/mappers';
import type { JourneyNames, JourneyTaskRow } from '@/lib/journey/mappers';
import { KIND_TO_CATEGORY } from '@/lib/journey/model';
import type { JourneyEvent } from '@/lib/journey/model';
import type {
  RawActivity,
  RawCall,
  RawDeal,
  RawEmail,
  RawEvent,
  RawMessage,
  RawNote,
  RawTask,
} from '@/lib/journey/rawRows';

/**
 * Prova dos mapeadores (S019–S042). As linhas cruas são escritas à mão, do jeito que os hooks de
 * `src/hooks/chat/journey/` as entregam; nenhuma consulta, nenhum Supabase, nenhum componente.
 */

const NAMES: JourneyNames = {
  u1: 'Ana Souza',
  u2: 'João Lima',
  q1: 'Comercial',
  cl1: 'Resolvido',
};

function mensagem(over: Partial<RawMessage> & { id: string; createdAt: string }): RawMessage {
  return {
    sender: 'contact',
    agentId: null,
    content: '',
    messageType: 'text',
    mediaFilename: null,
    mediaSize: null,
    mediaType: null,
    ...over,
  };
}

function ligacao(over: Partial<RawCall> & { id: string; startedAt: string }): RawCall {
  return {
    direction: 'inbound',
    status: 'ended',
    answeredAt: null,
    endedAt: null,
    durationSeconds: null,
    talkSeconds: null,
    agentId: null,
    answeredBy: null,
    endReason: null,
    hasRecording: false,
    ...over,
  };
}

function email(over: Partial<RawEmail> & { id: string; threadId: string; at: string }): RawEmail {
  return {
    direction: 'inbound',
    subject: 'Assunto',
    snippet: 'Trecho',
    fromName: null,
    assignedTo: null,
    ...over,
  };
}

function nota(over: Partial<RawNote> & { id: string; createdAt: string }): RawNote {
  return {
    authorId: null,
    content: 'nota',
    category: 'note',
    dueDate: null,
    isDone: false,
    ...over,
  };
}

function tarefa(over: Partial<JourneyTaskRow> & { id: string; createdAt: string }): JourneyTaskRow {
  return {
    title: 'Tarefa',
    description: null,
    status: 'todo',
    createdBy: null,
    assignedTo: null,
    dueDate: null,
    completedAt: null,
    startedAt: null,
    ...over,
  };
}

function eventoConversa(over: Partial<RawEvent> & { id: string; createdAt: string }): RawEvent {
  return {
    eventType: 'transfer',
    fromAgentId: null,
    toAgentId: null,
    fromQueueId: null,
    toQueueId: null,
    performedBy: null,
    closureId: null,
    ...over,
  };
}

function proposta(over: Partial<RawDeal> & { id: string; createdAt: string }): RawDeal {
  return {
    title: 'Proposta',
    value: null,
    status: null,
    assignedTo: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    ...over,
  };
}

function atividade(over: Partial<RawActivity> & { id: string; dealId: string; createdAt: string }): RawActivity {
  return {
    activityType: 'call',
    description: null,
    performedBy: null,
    ...over,
  };
}

/** O que a timeline monta na tela: texto dos detalhes por rótulo. */
function detalheDe(evento: JourneyEvent, label: string): string | undefined {
  return evento.details?.find((linha) => linha.label === label)?.value;
}

/** Contrato mínimo de todo evento: id, instante ISO, categoria do `kind` e alvo do clique. */
function conferirContrato(evento: JourneyEvent): void {
  expect(evento.id.trim()).not.toBe('');
  expect(evento.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(evento.category).toBe(KIND_TO_CATEGORY[evento.kind]);
  expect(evento.title.trim()).not.toBe('');
  expect(evento.target.id.trim()).not.toBe('');
  expect(['contact', 'user', 'system']).toContain(evento.actor.kind);
  const textos = [evento.title, evento.summary ?? '', ...(evento.details ?? []).map((linha) => linha.value)];
  for (const texto of textos) {
    // Nada de JSON cru: chave/colchete só é aceito quando NÃO é JSON válido — o marcador de
    // objeção da própria aba de Notas ("[Preço] ...") é texto normal, um objeto JSON não é.
    if (texto.startsWith('{') || texto.startsWith('[')) {
      let ehJson = true;
      try {
        JSON.parse(texto);
      } catch {
        ehJson = false;
      }
      expect(ehJson, `texto cru de JSON na timeline: ${texto}`).toBe(false);
    }
  }
}

// ---------------------------------------------------------------- mensagens

describe('mapMessages', () => {
  const T0 = '2026-10-07T10:00:00.000Z';

  it('agrupa mensagens seguidas do MESMO autor em até 10 min', () => {
    const events = mapMessages([
      mensagem({ id: 'm1', createdAt: T0, content: 'oi' }),
      mensagem({ id: 'm2', createdAt: '2026-10-07T10:03:00.000Z', content: 'tudo bem?' }),
      mensagem({ id: 'm3', createdAt: '2026-10-07T10:09:00.000Z', content: 'vamos fechar' }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('3 mensagens recebidas');
    expect(events[0].count).toBe(3);
    expect(events[0].summary).toBe('vamos fechar');
    expect(events[0].kind).toBe('message_in');
    expect(events[0].category).toBe('message');
    // O episódio fica no instante da ÚLTIMA mensagem da rajada.
    expect(events[0].at).toBe('2026-10-07T10:09:00.000Z');
    // O alvo do clique guarda o id da PRIMEIRA mensagem da rajada e todos os ids do grupo.
    expect(events[0].target).toEqual({ type: 'message', id: 'm1', messageIds: ['m1', 'm2', 'm3'] });
    expect(events[0].id).toBe('msg-m1');
    conferirContrato(events[0]);
  });

  it('na virada de 10 min: exatamente 10 min agrupa, 10 min + 1 ms não agrupa', () => {
    const limite = new Date(Date.parse(T0) + MESSAGE_GROUP_WINDOW_MS).toISOString();
    const depois = new Date(Date.parse(T0) + MESSAGE_GROUP_WINDOW_MS + 1).toISOString();

    const noLimite = mapMessages([
      mensagem({ id: 'm1', createdAt: T0 }),
      mensagem({ id: 'm2', createdAt: limite }),
    ]);
    expect(noLimite).toHaveLength(1);
    expect(noLimite[0].count).toBe(2);

    const passou = mapMessages([
      mensagem({ id: 'm1', createdAt: T0 }),
      mensagem({ id: 'm2', createdAt: depois }),
    ]);
    expect(passou).toHaveLength(2);
    expect(passou.map((e) => e.id)).toEqual(['msg-m2', 'msg-m1']);
  });

  it('autores diferentes não entram na mesma rajada', () => {
    const events = mapMessages([
      mensagem({ id: 'm1', createdAt: T0, content: 'oi' }),
      mensagem({ id: 'm2', createdAt: '2026-10-07T10:01:00.000Z', sender: 'agent', agentId: 'u1', content: 'olá' }),
      mensagem({ id: 'm3', createdAt: '2026-10-07T10:02:00.000Z', content: 'voltei' }),
    ]);

    expect(events.map((e) => e.kind)).toEqual(['message_in', 'message_out', 'message_in']);
    expect(events.map((e) => e.count ?? 1)).toEqual([1, 1, 1]);
  });

  it('mensagem enviada usa o agente do `agent_id`; robô vira Sistema', () => {
    const [enviada] = mapMessages(
      [mensagem({ id: 'm1', createdAt: T0, sender: 'agent', agentId: 'u1', content: 'bom dia' })],
      { names: NAMES },
    );
    expect(enviada.kind).toBe('message_out');
    expect(enviada.title).toBe('Mensagem enviada');
    expect(enviada.actor).toEqual({ kind: 'user', id: 'u1', name: 'Ana Souza', avatarUrl: null });

    const [automatica] = mapMessages(
      [mensagem({ id: 'm2', createdAt: T0, sender: 'system', content: 'fora do horário' })],
      { names: NAMES },
    );
    expect(automatica.actor).toEqual({ kind: 'system', id: null, name: 'Sistema', avatarUrl: null });
    expect(automatica.kind).toBe('message_out');
  });

  it('localização, áudio, sticker e contato NUNCA aparecem como JSON cru', () => {
    const localizacao =
      '{"latitude":-23.56672978,"longitude":-46.61563441,"name":"XBZ Brindes","address":"R. da Independência"}';
    const [evento] = mapMessages([
      mensagem({ id: 'm1', createdAt: T0, content: localizacao, messageType: 'location' }),
    ]);
    expect(evento.summary).toBe('Localização: XBZ Brindes — R. da Independência');

    const [audio] = mapMessages([
      mensagem({ id: 'm2', createdAt: T0, content: '{"seconds":15}', messageType: 'ptt' }),
    ]);
    expect(audio.summary).toBe('Áudio');

    const [sticker] = mapMessages([
      mensagem({ id: 'm3', createdAt: T0, content: '', messageType: 'sticker' }),
    ]);
    expect(sticker.summary).toBe('Sticker');

    const [contato] = mapMessages([
      mensagem({ id: 'm4', createdAt: T0, content: 'BEGIN:VCARD', messageType: 'vcard' }),
    ]);
    expect(contato.summary).toBe('Contato compartilhado');
  });

  it('arquivo vira episódio próprio, com nome, tipo e tamanho nos detalhes', () => {
    const events = mapMessages([
      mensagem({
        id: 'f1',
        createdAt: T0,
        sender: 'agent',
        agentId: 'u1',
        messageType: 'document',
        mediaFilename: 'contrato.pdf',
        mediaType: 'application/pdf',
        mediaSize: 2048,
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('file_out');
    expect(events[0].title).toBe('Arquivo enviado');
    expect(events[0].category).toBe('file');
    expect(events[0].details).toEqual([
      { label: 'Nome', value: 'contrato.pdf' },
      { label: 'Tipo', value: 'Documento' },
      { label: 'Tamanho', value: '2.0 KB' },
    ]);
    expect(events[0].target.type).toBe('file');
    expect(events[0].target.id).toBe('f1');
    conferirContrato(events[0]);
  });

  it('arquivo sem nome continua legível (não some a linha do nome nem inventa um)', () => {
    const events = mapMessages([
      mensagem({
        id: 'f1',
        createdAt: T0,
        sender: 'agent',
        messageType: 'image',
        mediaType: 'image/png',
        mediaSize: 1024,
      }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Arquivo enviado');
    expect(detalheDe(events[0], 'Nome')).toBeUndefined();
    expect(detalheDe(events[0], 'Tipo')).toBe('Imagem');
    expect(detalheDe(events[0], 'Tamanho')).toBe('1.0 KB');
  });

  it('o arquivo não entra na rajada e quebra a rajada em volta', () => {
    const events = mapMessages([
      mensagem({ id: 'm1', createdAt: T0, content: 'segue o contrato' }),
      mensagem({
        id: 'f1',
        createdAt: '2026-10-07T10:01:00.000Z',
        messageType: 'document',
        mediaFilename: 'contrato.pdf',
        mediaType: 'application/pdf',
        mediaSize: 2048,
      }),
      mensagem({ id: 'm2', createdAt: '2026-10-07T10:02:00.000Z', content: 'qualquer dúvida me avise' }),
    ]);

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual(['message_in', 'file_in', 'message_in']);
  });

  it('linha sem data legível é ignorada; lista nula não estoura', () => {
    expect(mapMessages([mensagem({ id: 'm1', createdAt: 'nao-e-data' })])).toEqual([]);
    expect(mapMessages([mensagem({ id: 'm2', createdAt: '' })])).toEqual([]);
    expect(mapMessages(null)).toEqual([]);
    expect(mapMessages(undefined)).toEqual([]);
    expect(mapMessages([null as unknown as RawMessage])).toEqual([]);
  });

  it('id cru repetido não gera dois episódios com o mesmo id', () => {
    const events = mapMessages([
      mensagem({ id: 'm1', createdAt: T0 }),
      mensagem({ id: 'm1', createdAt: '2026-10-07T11:00:00.000Z' }),
    ]);

    expect(events).toHaveLength(2);
    // Ordem do trilho (mais recente primeiro): a 2ª linha repetida é a das 11:00.
    expect(events.map((e) => e.id)).toEqual(['msg-m1~2', 'msg-m1']);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it('rajada de mensagens guarda todos os ids no target.messageIds', () => {
    const events = mapMessages([
      mensagem({ id: 'm1', createdAt: T0, content: 'oi' }),
      mensagem({ id: 'm2', createdAt: '2026-10-07T10:03:00.000Z', content: 'tudo bem?' }),
      mensagem({ id: 'm3', createdAt: '2026-10-07T10:09:00.000Z', content: 'vamos fechar' }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].target.messageIds).toEqual(['m1', 'm2', 'm3']);
    expect(events[0].target.id).toBe('m1');
  });

  it('mensagem única sem rajada não tem messageIds no target', () => {
    const [evento] = mapMessages([mensagem({ id: 'm1', createdAt: T0, content: 'oi' })]);
    expect(evento.target.messageIds).toBeUndefined();
  });
});

// ---------------------------------------------------------------- ligações

describe('mapCalls', () => {
  const T0 = '2026-10-07T09:00:00.000Z';

  it('entrada atendida: título, duração, motivo do fim e alvo da ligação', () => {
    const [evento] = mapCalls(
      [
        ligacao({
          id: 'c1',
          startedAt: T0,
          direction: 'inbound',
          status: 'answered',
          answeredBy: 'u1',
          talkSeconds: 258,
          endReason: 'completed',
          hasRecording: true,
        }),
      ],
      { names: NAMES },
    );

    expect(evento.kind).toBe('call_in');
    expect(evento.category).toBe('call');
    expect(evento.title).toBe('Chamada recebida');
    expect(evento.badge).toEqual({ label: 'Concluída', tone: 'success' });
    expect(detalheDe(evento, 'Duração')).toBe('4m 18s');
    expect(detalheDe(evento, 'Motivo do fim')).toBe('Concluída');
    expect(detalheDe(evento, 'Gravação')).toBe('Disponível');
    expect(evento.actor).toEqual({ kind: 'user', id: 'u1', name: 'Ana Souza', avatarUrl: null });
    expect(evento.target).toEqual({ type: 'call', id: 'c1' });
    expect(evento.at).toBe(T0);
    conferirContrato(evento);
  });

  it('saída atendida é "chamada realizada"', () => {
    const [evento] = mapCalls(
      [ligacao({ id: 'c2', startedAt: T0, direction: 'outbound', status: 'completed', agentId: 'u1', talkSeconds: 42 })],
      { names: NAMES },
    );
    expect(evento.kind).toBe('call_out');
    expect(evento.title).toBe('Chamada realizada');
    expect(evento.badge?.label).toBe('Concluída');
  });

  it('ligação perdida (entrada não atendida): selo Perdida e autor contato', () => {
    const [evento] = mapCalls([ligacao({ id: 'c3', startedAt: T0, direction: 'inbound', status: 'missed' })], {
      names: NAMES,
    });

    expect(evento.kind).toBe('call_missed');
    expect(evento.title).toBe('Chamada perdida');
    expect(evento.badge).toEqual({ label: 'Perdida', tone: 'destructive' });
    expect(evento.actor.kind).toBe('contact');
    conferirContrato(evento);
  });

  it('`ended` decide pelo tempo falado — a MESMA regra do stats.ts', () => {
    const [atendida] = mapCalls([ligacao({ id: 'c4', startedAt: T0, status: 'ended', talkSeconds: 30 })]);
    expect(atendida.kind).toBe('call_in');
    expect(atendida.badge?.label).toBe('Concluída');

    const [perdida] = mapCalls([ligacao({ id: 'c5', startedAt: T0, status: 'ended', talkSeconds: null })]);
    expect(perdida.kind).toBe('call_missed');
    expect(perdida.badge?.label).toBe('Perdida');
  });

  it('saída que ninguém atendeu fica "sem resposta"', () => {
    const [evento] = mapCalls([
      ligacao({ id: 'c6', startedAt: T0, direction: 'outbound', status: 'no_answer', endReason: 'no_answer' }),
    ]);
    expect(evento.kind).toBe('call_out');
    expect(evento.badge).toEqual({ label: 'Sem resposta', tone: 'warning' });
    expect(detalheDe(evento, 'Motivo do fim')).toBe('Não atendida');
    expect(detalheDe(evento, 'Duração')).toBeUndefined();
  });

  it('motivo desconhecido sai como veio, sem virar texto técnico vazio', () => {
    const [evento] = mapCalls([ligacao({ id: 'c7', startedAt: T0, status: 'failed', endReason: 'sip_486' })]);
    expect(detalheDe(evento, 'Motivo do fim')).toBe('sip_486');
  });

  it('sem autor identificável o evento é do Sistema; sem data é ignorado', () => {
    const [evento] = mapCalls([ligacao({ id: 'c8', startedAt: T0, direction: 'outbound', status: 'completed' })]);
    expect(evento.actor.kind).toBe('system');

    expect(mapCalls([ligacao({ id: 'c9', startedAt: 'x' })])).toEqual([]);
    expect(mapCalls([])).toEqual([]);
  });
});

// ---------------------------------------------------------------- e-mails

describe('mapEmails', () => {
  const T0 = '2026-10-07T08:00:00.000Z';

  it('agrupa a mesma conversa e o mesmo sentido, com assunto no título e trecho no resumo', () => {
    const events = mapEmails(
      [
        email({ id: 'e1', threadId: 't1', at: T0, subject: 'Proposta comercial', snippet: 'Segue a proposta', fromName: 'Cliente XP' }),
        email({ id: 'e2', threadId: 't1', at: '2026-10-07T09:00:00.000Z', subject: 'Re: Proposta comercial', snippet: 'Alguma dúvida?', fromName: 'Cliente XP' }),
        email({ id: 'e3', threadId: 't2', at: T0, subject: 'Outro assunto', snippet: 'x', fromName: 'Cliente XP' }),
      ],
      { names: NAMES },
    );

    const conversa = events.find((e) => e.id === 'email-t1-in');
    expect(conversa).toBeDefined();
    expect(conversa?.kind).toBe('email_in');
    expect(conversa?.title).toBe('Proposta comercial');
    expect(conversa?.summary).toBe('Alguma dúvida?');
    expect(conversa?.count).toBe(2);
    expect(conversa?.at).toBe('2026-10-07T09:00:00.000Z');
    expect(conversa?.actor).toEqual({ kind: 'contact', id: null, name: 'Cliente XP', avatarUrl: null });
    expect(conversa?.target).toEqual({ type: 'email', id: 'e2', threadId: 't1' });
    expect(events).toHaveLength(2);
    conferirContrato(conversa as JourneyEvent);
  });

  it('e-mail enviado: autor é o responsável pela conversa; desconhecido = Sistema', () => {
    const [comDono] = mapEmails(
      [email({ id: 'e1', threadId: 't1', at: T0, direction: 'outbound', subject: 'Resposta', snippet: 'ok', assignedTo: 'u2' })],
      { names: NAMES },
    );
    expect(comDono.kind).toBe('email_out');
    expect(comDono.actor).toEqual({ kind: 'user', id: 'u2', name: 'João Lima', avatarUrl: null });

    const [semDono] = mapEmails([email({ id: 'e2', threadId: 't1', at: T0, direction: 'outbound' })]);
    expect(semDono.actor).toEqual({ kind: 'system', id: null, name: 'Sistema', avatarUrl: null });
  });

  it('recebido e enviado da MESMA conversa são episódios diferentes', () => {
    const events = mapEmails([
      email({ id: 'e1', threadId: 't1', at: T0, direction: 'inbound' }),
      email({ id: 'e2', threadId: 't1', at: '2026-10-07T10:00:00.000Z', direction: 'outbound', assignedTo: 'u2' }),
    ]);
    expect(events.map((e) => e.kind)).toEqual(['email_out', 'email_in']);
  });

  it('assunto vazio não deixa o título em branco; sem data a linha é ignorada', () => {
    const [evento] = mapEmails([email({ id: 'e1', threadId: 't1', at: T0, subject: '  ' })]);
    expect(evento.title).toBe('E-mail recebido');

    expect(mapEmails([email({ id: 'e2', threadId: 't1', at: 'sei la' })])).toEqual([]);
    expect(mapEmails(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------- notas

describe('mapNotes', () => {
  it('nota com autor, categoria e prazo', () => {
    const [evento] = mapNotes(
      [
        nota({
          id: 'n1',
          createdAt: '2026-10-07T12:00:00.000Z',
          authorId: 'u1',
          content: '  [Preço] acha   o valor alto ',
          category: 'objection',
          dueDate: '2026-10-10T00:00:00.000Z',
        }),
      ],
      { names: NAMES },
    );

    expect(evento.kind).toBe('note');
    expect(evento.category).toBe('note');
    expect(evento.title).toBe('Nota adicionada');
    expect(evento.summary).toBe('[Preço] acha o valor alto');
    expect(evento.actor).toEqual({ kind: 'user', id: 'u1', name: 'Ana Souza', avatarUrl: null });
    expect(detalheDe(evento, 'Categoria')).toBe('Objeção');
    expect(detalheDe(evento, 'Prazo')).toBe('10/10/2026');
    expect(evento.target).toEqual({ type: 'note', id: 'n1' });
    conferirContrato(evento);
  });

  it('prazo gravado à meia-noite UTC é lido no dia escolhido (não no anterior)', () => {
    const [evento] = mapNotes([nota({ id: 'n1', createdAt: '2026-10-07T12:00:00.000Z', dueDate: '2026-09-30T00:00:00.000Z' })]);
    expect(detalheDe(evento, 'Prazo')).toBe('30/09/2026');
  });

  it('nota sem autor é do Sistema e sem prazo não inventa detalhe', () => {
    const [evento] = mapNotes([nota({ id: 'n1', createdAt: '2026-10-07T12:00:00.000Z', category: '' })]);
    expect(evento.actor.kind).toBe('system');
    expect(evento.details).toBeUndefined();
  });

  it('lista nula e linha sem data não estouram', () => {
    expect(mapNotes(null)).toEqual([]);
    expect(mapNotes([nota({ id: 'n1', createdAt: '' })])).toEqual([]);
  });
});

// ---------------------------------------------------------------- tarefas

describe('mapTasks', () => {
  const AGORA = new Date('2026-10-09T12:00:00.000Z');

  it('criação, início e conclusão viram três episódios com responsável e criador', () => {
    const events = mapTasks(
      [
        tarefa({
          id: 't1',
          createdAt: '2026-10-01T10:00:00.000Z',
          title: 'Enviar catálogo',
          status: 'done',
          createdBy: 'u1',
          assignedTo: 'u2',
          startedAt: '2026-10-02T10:00:00.000Z',
          completedAt: '2026-10-03T10:00:00.000Z',
        }),
      ],
      { names: NAMES, now: AGORA },
    );

    expect(events.map((e) => e.kind)).toEqual(['task_done', 'task_started', 'task_created']);
    expect(events.map((e) => e.title)).toEqual(['Tarefa concluída', 'Tarefa iniciada', 'Tarefa criada']);
    for (const evento of events) {
      expect(evento.summary).toBe('Enviar catálogo');
      expect(detalheDe(evento, 'Responsável')).toBe('João Lima');
      expect(detalheDe(evento, 'Criador')).toBe('Ana Souza');
      expect(evento.target).toEqual({ type: 'task', id: 't1' });
      conferirContrato(evento);
    }
    // Quem agiu: o criador no nascimento, o responsável no resto.
    expect(events[0].actor.id).toBe('u2');
    expect(events[2].actor.id).toBe('u1');
    expect(events[0].badge).toEqual({ label: 'Concluída', tone: 'success' });
  });

  it('tarefa atrasada: episódio no prazo, com selo', () => {
    const events = mapTasks(
      [
        tarefa({
          id: 't1',
          createdAt: '2026-10-01T10:00:00.000Z',
          status: 'todo',
          assignedTo: 'u2',
          dueDate: '2026-10-05T00:00:00.000Z',
        }),
      ],
      { names: NAMES, now: AGORA },
    );

    const atrasada = events.find((e) => e.kind === 'task_overdue');
    expect(atrasada).toBeDefined();
    expect(atrasada?.title).toBe('Tarefa atrasada');
    expect(atrasada?.at).toBe('2026-10-05T00:00:00.000Z');
    expect(detalheDe(atrasada as JourneyEvent, 'Prazo')).toBe('05/10/2026');
    expect(atrasada?.badge).toEqual({ label: 'Atrasada', tone: 'destructive' });
  });

  it('tarefa concluída não atrasa, mesmo com prazo vencido', () => {
    const events = mapTasks(
      [
        tarefa({
          id: 't1',
          createdAt: '2026-10-01T10:00:00.000Z',
          status: 'done',
          dueDate: '2026-10-02T00:00:00.000Z',
          completedAt: '2026-10-03T10:00:00.000Z',
        }),
      ],
      { now: AGORA },
    );
    expect(events.some((e) => e.kind === 'task_overdue')).toBe(false);
  });

  it('prazo nulo nunca atrasa; prazo no futuro também não', () => {
    const semPrazo = mapTasks([tarefa({ id: 't1', createdAt: '2026-10-01T10:00:00.000Z', status: 'todo' })], {
      now: AGORA,
    });
    expect(semPrazo.some((e) => e.kind === 'task_overdue')).toBe(false);

    const futuro = mapTasks(
      [tarefa({ id: 't2', createdAt: '2026-10-01T10:00:00.000Z', status: 'todo', dueDate: '2026-10-20T00:00:00.000Z' })],
      { now: AGORA },
    );
    expect(futuro.some((e) => e.kind === 'task_overdue')).toBe(false);
  });

  it('prioridade aparece quando a linha a traz (campo opcional do tipo cru)', () => {
    const [evento] = mapTasks(
      [tarefa({ id: 't1', createdAt: '2026-10-01T10:00:00.000Z', priority: 'alta' })],
      { names: NAMES },
    );
    expect(detalheDe(evento, 'Prioridade')).toBe('alta');
  });

  it('tarefa sem data de criação não gera episódio', () => {
    expect(mapTasks([tarefa({ id: 't1', createdAt: 'sem-data' })])).toEqual([]);
    expect(mapTasks(null)).toEqual([]);
  });

  it('os 4 estágios recebem ids estáveis com sufixo de etapa (task-t1-created, -started, -done, -overdue)', () => {
    const events = mapTasks(
      [
        tarefa({
          id: 't1',
          createdAt: '2026-10-01T10:00:00.000Z',
          startedAt: '2026-10-02T10:00:00.000Z',
          dueDate: '2026-10-02T00:00:00.000Z',
          status: 'todo',
        }),
      ],
      { now: AGORA },
    );

    const ids = events.map((e) => e.id);
    expect(ids).toContain('task-t1-created');
    expect(ids).toContain('task-t1-started');
    expect(ids).toContain('task-t1-overdue');
    // Cada estágio tem um id único — sem ~n de repetição.
    expect(new Set(ids).size).toBe(3);
  });

  it('o id de criada e concluída é estável quando startedAt existe (sem ~n)', () => {
    const events = mapTasks(
      [
        tarefa({
          id: 't1',
          createdAt: '2026-10-01T10:00:00.000Z',
          startedAt: '2026-10-02T10:00:00.000Z',
          completedAt: '2026-10-03T10:00:00.000Z',
          status: 'done',
        }),
      ],
      { now: AGORA },
    );

    const criada = events.find((e) => e.kind === 'task_created');
    const concluida = events.find((e) => e.kind === 'task_done');
    expect(criada?.id).toBe('task-t1-created');
    expect(concluida?.id).toBe('task-t1-done');
  });

  it('sem task.id o id usa o timestamp como base (sem sufixo de estágio)', () => {
    const events = mapTasks(
      [
        tarefa({
          id: null as unknown as string,
          createdAt: '2026-10-01T10:00:00.000Z',
          status: 'todo',
        }),
      ],
      { now: AGORA },
    );

    const criada = events.find((e) => e.kind === 'task_created');
    expect(criada?.id).toBeTruthy();
    expect(criada?.id).not.toContain('task-null-created');
  });
});

// ---------------------------------------------------------------- eventos da conversa

describe('mapConversationEvents', () => {
  const T0 = '2026-10-07T14:00:00.000Z';

  it('transferência: "De → Para" com os nomes do mapa', () => {
    const [evento] = mapConversationEvents(
      [eventoConversa({ id: 'e1', createdAt: T0, eventType: 'transfer', fromAgentId: 'u1', toAgentId: 'u2', performedBy: 'u2' })],
      { names: NAMES },
    );

    expect(evento.kind).toBe('transfer');
    expect(evento.category).toBe('transfer');
    expect(evento.title).toBe('Transferência');
    expect(detalheDe(evento, 'De')).toBe('Ana Souza');
    expect(detalheDe(evento, 'Para')).toBe('João Lima');
    expect(evento.actor).toEqual({ kind: 'user', id: 'u2', name: 'João Lima', avatarUrl: null });
    expect(evento.target.type).toBe('detail');
    conferirContrato(evento);
  });

  it('transferência sem nome no mapa guarda o id (os nomes vêm depois)', () => {
    const [evento] = mapConversationEvents(
      [eventoConversa({ id: 'e1', createdAt: T0, eventType: 'transfer', fromAgentId: 'agente-x', toAgentId: 'agente-y' })],
    );
    expect(detalheDe(evento, 'De')).toBe('agente-x');
    expect(detalheDe(evento, 'Para')).toBe('agente-y');
  });

  it('transferência de fila mostra as filas', () => {
    const [evento] = mapConversationEvents(
      [
        eventoConversa({
          id: 'e1',
          createdAt: T0,
          eventType: 'queue_transfer',
          fromQueueId: null,
          toQueueId: 'q1',
        }),
      ],
      { names: NAMES },
    );
    expect(detalheDe(evento, 'Fila de destino')).toBe('Comercial');
    expect(detalheDe(evento, 'De')).toBeUndefined();
  });

  it('reatribuição automática tem título próprio e autor Sistema', () => {
    const [evento] = mapConversationEvents(
      [eventoConversa({ id: 'e1', createdAt: T0, eventType: 'overload_reassign', fromAgentId: 'u1', toAgentId: 'u2' })],
      { names: NAMES },
    );
    expect(evento.kind).toBe('transfer');
    expect(evento.title).toBe('Reatribuição automática');
    expect(evento.actor.kind).toBe('system');
  });

  it('atribuição e desatribuição', () => {
    const [assumiu] = mapConversationEvents(
      [eventoConversa({ id: 'e1', createdAt: T0, eventType: 'assign', toAgentId: 'u1', performedBy: 'u1' })],
      { names: NAMES },
    );
    expect(assumiu.kind).toBe('assign');
    expect(assumiu.title).toBe('Atribuição');
    expect(detalheDe(assumiu, 'Para')).toBe('Ana Souza');

    const [liberou] = mapConversationEvents(
      [eventoConversa({ id: 'e2', createdAt: T0, eventType: 'unassign', fromAgentId: 'u1', performedBy: 'u1' })],
      { names: NAMES },
    );
    expect(liberou.kind).toBe('unassign');
    expect(liberou.title).toBe('Desatribuição');
    expect(detalheDe(liberou, 'De')).toBe('Ana Souza');
  });

  it('encerramento com motivo pelo `closure_id` e reabertura com selo', () => {
    const [encerrada] = mapConversationEvents(
      [eventoConversa({ id: 'e1', createdAt: T0, eventType: 'close', closureId: 'cl1', performedBy: 'u1' })],
      { names: NAMES },
    );
    expect(encerrada.kind).toBe('case_closed');
    expect(encerrada.category).toBe('case');
    expect(encerrada.title).toBe('Conversa encerrada');
    expect(detalheDe(encerrada, 'Motivo')).toBe('Resolvido');
    expect(encerrada.badge).toEqual({ label: 'Encerrada', tone: 'muted' });

    const [reaberta] = mapConversationEvents(
      [eventoConversa({ id: 'e2', createdAt: T0, eventType: 'reopen', performedBy: 'u1' })],
      { names: NAMES },
    );
    expect(reaberta.kind).toBe('case_reopened');
    expect(reaberta.badge).toEqual({ label: 'Reaberta', tone: 'success' });
  });

  it('evento sem `performed_by` (automação/robô/IA) é do Sistema', () => {
    const [evento] = mapConversationEvents([eventoConversa({ id: 'e1', createdAt: T0, eventType: 'close' })]);
    expect(evento.actor).toEqual({ kind: 'system', id: null, name: 'Sistema', avatarUrl: null });
  });

  it('tipo de evento desconhecido é descartado; sem data também', () => {
    expect(mapConversationEvents([eventoConversa({ id: 'e1', createdAt: T0, eventType: 'qualquer_coisa' })])).toEqual([]);
    expect(mapConversationEvents([eventoConversa({ id: 'e2', createdAt: 'x', eventType: 'transfer' })])).toEqual([]);
    expect(mapConversationEvents(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------- propostas

describe('mapDeals', () => {
  const T0 = '2026-10-07T15:00:00.000Z';

  it('proposta ganha: valor, responsável e selo', () => {
    const [evento] = mapDeals(
      [proposta({ id: 'd1', createdAt: T0, title: 'Brindes corporativos', value: 1500, status: 'won', assignedTo: 'u2' })],
      { names: NAMES },
    );

    expect(evento.kind).toBe('deal_created');
    expect(evento.category).toBe('deal');
    expect(evento.title).toBe('Brindes corporativos');
    expect(evento.badge).toEqual({ label: 'Ganha', tone: 'success' });
    // O `Intl` de pt-BR usa espaço NÃO separável depois de "R$" — o valor sai com \u00a0.
    expect(detalheDe(evento, 'Valor')).toBe('R$\u00a01.500,00');
    expect(detalheDe(evento, 'Responsável')).toBe('João Lima');
    expect(evento.target).toEqual({ type: 'deal', id: 'd1' });
    conferirContrato(evento);
  });

  it('proposta perdida e proposta em aberto', () => {
    const [perdida] = mapDeals([proposta({ id: 'd1', createdAt: T0, status: 'lost' })]);
    expect(perdida.badge).toEqual({ label: 'Perdida', tone: 'destructive' });

    const [aberta] = mapDeals([proposta({ id: 'd2', createdAt: T0, status: 'negotiation' })]);
    expect(aberta.badge).toEqual({ label: 'Aberta', tone: 'warning' });
  });

  it('sem título cai no rótulo genérico; sem data é ignorada', () => {
    const [evento] = mapDeals([proposta({ id: 'd1', createdAt: T0, title: '  ' })]);
    expect(evento.title).toBe('Proposta');

    expect(mapDeals([proposta({ id: 'd2', createdAt: '' })])).toEqual([]);
    expect(mapDeals(null)).toEqual([]);
  });
});

describe('mapDealActivities', () => {
  it('descrição é o título; sem descrição, o tipo vira rótulo e o alvo é a proposta', () => {
    const [comDescricao] = mapDealActivities([
      atividade({ id: 'a1', dealId: 'd1', createdAt: '2026-10-07T16:00:00.000Z', description: 'Ligou para negociar', performedBy: 'u1' }),
    ]);
    expect(comDescricao.title).toBe('Ligou para negociar');
    expect(comDescricao.actor).toEqual({ kind: 'user', id: 'u1', name: null, avatarUrl: null });
    expect(comDescricao.target).toEqual({ type: 'deal', id: 'd1' });

    const [semDescricao] = mapDealActivities([
      atividade({ id: 'a2', dealId: 'd1', createdAt: '2026-10-07T16:00:00.000Z', activityType: 'meeting' }),
    ]);
    expect(semDescricao.title).toBe('Reunião');
  });

  it('atividade sem autor é do Sistema; sem data é ignorada', () => {
    const [evento] = mapDealActivities([atividade({ id: 'a1', dealId: 'd1', createdAt: '2026-10-07T16:00:00.000Z' })]);
    expect(evento.actor.kind).toBe('system');

    expect(mapDealActivities([atividade({ id: 'a2', dealId: 'd1', createdAt: null as unknown as string })])).toEqual([]);
    expect(mapDealActivities(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------- todas as fontes

describe('mapJourneyEvents', () => {
  it('junta as fontes, ordena do mais recente para o mais antigo e não repete id', () => {
    const events = mapJourneyEvents(
      {
        messages: [mensagem({ id: 'm1', createdAt: '2026-10-07T10:00:00.000Z', content: 'oi' })],
        calls: [ligacao({ id: 'c1', startedAt: '2026-10-07T11:00:00.000Z', status: 'answered' })],
        emails: [email({ id: 'e1', threadId: 't1', at: '2026-10-07T09:00:00.000Z' })],
        notes: [nota({ id: 'n1', createdAt: '2026-10-07T08:00:00.000Z' })],
        tasks: [tarefa({ id: 't1', createdAt: '2026-10-07T07:00:00.000Z' })],
        events: [eventoConversa({ id: 'v1', createdAt: '2026-10-07T06:00:00.000Z', eventType: 'close' })],
        deals: [proposta({ id: 'd1', createdAt: '2026-10-07T05:00:00.000Z', status: 'won' })],
        activities: [atividade({ id: 'a1', dealId: 'd1', createdAt: '2026-10-07T04:00:00.000Z' })],
      },
      { names: NAMES, now: new Date('2026-10-09T12:00:00.000Z') },
    );

    expect(events.map((e) => e.kind)).toEqual([
      'call_in',
      'message_in',
      'email_in',
      'note',
      'task_created',
      'case_closed',
      'deal_created',
      'deal_activity',
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (const evento of events) conferirContrato(evento);
  });

  it('o id do evento é único mesmo entre fontes diferentes', () => {
    const events = mapJourneyEvents({
      messages: [mensagem({ id: 'x', createdAt: '2026-10-07T10:00:00.000Z', content: 'oi' })],
      notes: [nota({ id: 'x', createdAt: '2026-10-07T10:00:00.000Z' })],
      deals: [proposta({ id: 'x', createdAt: '2026-10-07T10:00:00.000Z' })],
    });
    expect(events.map((e) => e.id).sort()).toEqual(['deal-x', 'msg-x', 'note-x']);
  });

  it('nenhuma fonte informada (ou tudo nulo) devolve lista vazia', () => {
    expect(mapJourneyEvents({})).toEqual([]);
    expect(
      mapJourneyEvents({ messages: null, calls: null, emails: null, notes: null, tasks: null, events: null, deals: null, activities: null }),
    ).toEqual([]);
  });
});
