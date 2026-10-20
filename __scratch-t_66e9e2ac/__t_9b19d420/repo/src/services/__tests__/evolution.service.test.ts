/**
 * Testes da camada de serviço da Evolution API (`src/services/evolution.service.ts`).
 *
 * Escopo: SÓ teste novo. Nenhuma linha de produção foi alterada.
 *
 * O que se prova aqui:
 *  - a view `whatsapp_connections_safe` é traduzida para `EvolutionInstance`
 *    (`name` -> `instance_name`, `status` -> `is_connected`);
 *  - leitura de UM registro devolve `null` em erro (contrato do arquivo), leitura
 *    de LISTA propaga o erro (senão "sem permissão" virava "lista vazia");
 *  - a escrita em `whatsapp_connections` filtra por `instance_id` e grava
 *    `updated_at` no INSTANTE UTC (o processo roda com TZ=America/Sao_Paulo);
 *  - as duas chamadas de envio roteiam pela edge function `evolution-api/*`,
 *    com o corpo que o roteador da edge function consome
 *    (supabase/functions/evolution-api/index.ts:806-828) e o erro do corpo
 *    HTTP 200 (`{error:true,message}`) chega ao chamador.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco), nunca o alvo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O relógio do processo fica no fuso do produto (Brasil, UTC-3). Serve para que
// a checagem de `updated_at` falhe se a implementação gravar hora LOCAL em vez
// do instante UTC: 2026-10-07T15:30:00Z é 12:30 no fuso local.
process.env.TZ = 'America/Sao_Paulo';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: h.from,
    functions: { invoke: h.invoke },
  },
}));

import { createQueryBuilder } from '@/test/mocks/supabase';
import {
  getConnectedEvolutionInstances,
  getEvolutionInstanceById,
  getEvolutionInstanceByName,
  getEvolutionInstances,
  sendEvolutionMedia,
  sendEvolutionMessage,
  updateEvolutionInstanceStatus,
  type EvolutionMessagePayload,
} from '@/services/evolution.service';

const VIEW = 'whatsapp_connections_safe';
const TABLE = 'whatsapp_connections';

// Instante fixo usado nas checagens de relógio (fuso do processo: UTC-3).
const FIXED_ISO = '2026-10-07T15:30:00.000Z';
const FIXED_MS = Date.parse(FIXED_ISO);

type Builder = ReturnType<typeof createQueryBuilder>;

let builder: Builder;

function mockRead(data: unknown, error: unknown = null): Builder {
  builder = createQueryBuilder(data, error);
  h.from.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  h.from.mockReset();
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── getEvolutionInstances ────────────────────────────────────────────────────

describe('getEvolutionInstances', () => {
  it('traduz a view segura: instance_name vem de `name` e is_connected só é true em connected/open', async () => {
    mockRead([
      { id: 'c1', name: 'Zap A', status: 'connected' },
      { id: 'c2', name: 'Zap B', status: 'open' },
      { id: 'c3', name: 'Zap C', status: 'connecting' },
      { id: 'c4', name: 'Zap D', status: null },
    ]);

    const result = await getEvolutionInstances();

    expect(h.from).toHaveBeenCalledWith(VIEW);
    expect(builder.select).toHaveBeenCalledWith('*');
    // A view não tem instance_display_name: a ordenação é pela coluna real `name`.
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true });

    expect(result.map((i) => [i.instance_name, i.is_connected])).toEqual([
      ['Zap A', true],
      ['Zap B', true],
      ['Zap C', false],
      ['Zap D', false],
    ]);
    // O resto da linha continua disponível para o consumidor.
    expect(result[0]).toMatchObject({ id: 'c1', name: 'Zap A', status: 'connected' });
  });

  it('devolve lista vazia quando a view volta vazia ou null (nunca undefined)', async () => {
    mockRead([]);
    await expect(getEvolutionInstances()).resolves.toEqual([]);

    mockRead(null);
    await expect(getEvolutionInstances()).resolves.toEqual([]);
  });

  it('propaga o erro de leitura (RLS 42501) em vez de devolver lista vazia', async () => {
    const rls = { code: '42501', message: 'permission denied for view whatsapp_connections_safe' };
    mockRead(null, rls);

    await expect(getEvolutionInstances()).rejects.toBe(rls);
  });
});

// ─── getEvolutionInstanceById / ByName ───────────────────────────────────────

describe('getEvolutionInstanceById', () => {
  it('busca pelo id com .eq + .single e devolve o registro traduzido', async () => {
    mockRead({ id: 'uuid-1', name: 'Zap A', status: 'open', phone_number: '5511999999999' });

    const result = await getEvolutionInstanceById('uuid-1');

    expect(h.from).toHaveBeenCalledWith(VIEW);
    expect(builder.eq).toHaveBeenCalledWith('id', 'uuid-1');
    expect(builder.single).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: 'uuid-1',
      instance_name: 'Zap A',
      is_connected: true,
      phone_number: '5511999999999',
    });
  });

  it('devolve null quando o registro não existe (PGRST116), sem lançar', async () => {
    mockRead(null, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });

    await expect(getEvolutionInstanceById('sumiu')).resolves.toBeNull();
  });

  it('devolve null também quando a RLS nega a leitura (42501) — hoje indistinguível de "não existe"', async () => {
    mockRead(null, { code: '42501', message: 'permission denied' });

    await expect(getEvolutionInstanceById('uuid-1')).resolves.toBeNull();
  });

  it.todo(
    'distinguir "não existe" (PGRST116 -> null) de "sem permissão" (42501 -> erro visível): o consumidor hoje mostra o mesmo estado para os dois casos',
  );
});

describe('getEvolutionInstanceByName', () => {
  it('busca pelo instance_name (coluna `name`) com .eq + .single', async () => {
    // status legado 'open' (v2): continua contando como conectado no lookup por nome.
    mockRead({ id: 'uuid-1', name: 'zap-01', status: 'open' });

    const result = await getEvolutionInstanceByName('zap-01');

    expect(builder.eq).toHaveBeenCalledWith('name', 'zap-01');
    expect(builder.single).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ instance_name: 'zap-01', is_connected: true });
  });

  it('devolve null em erro, sem lançar', async () => {
    mockRead(null, { code: 'PGRST116', message: 'no rows' });

    await expect(getEvolutionInstanceByName('zap-99')).resolves.toBeNull();
  });
});

// ─── getConnectedEvolutionInstances ──────────────────────────────────────────

describe('getConnectedEvolutionInstances', () => {
  it('filtra a view por status connected/open (o v2 gravava open; o webhook grava connected)', async () => {
    mockRead([
      { id: 'c1', name: 'Zap A', status: 'connected' },
      { id: 'c2', name: 'Zap B', status: 'open' },
    ]);

    const result = await getConnectedEvolutionInstances();

    expect(h.from).toHaveBeenCalledWith(VIEW);
    expect(builder.in).toHaveBeenCalledWith('status', ['connected', 'open']);
    expect(result.map((i) => i.instance_name)).toEqual(['Zap A', 'Zap B']);
    expect(result.every((i) => i.is_connected)).toBe(true);
  });

  it('devolve lista vazia quando nada está conectado', async () => {
    mockRead(null);

    await expect(getConnectedEvolutionInstances()).resolves.toEqual([]);
  });

  it('propaga o erro de leitura em vez de parecer "nenhuma conexão ativa"', async () => {
    const rls = { code: '42501', message: 'permission denied' };
    mockRead(null, rls);

    await expect(getConnectedEvolutionInstances()).rejects.toBe(rls);
  });
});

// ─── updateEvolutionInstanceStatus ───────────────────────────────────────────

describe('updateEvolutionInstanceStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_MS));
    mockRead(null);
  });

  it('grava o status na tabela real filtrando por instance_id e carimba updated_at', async () => {
    await updateEvolutionInstanceStatus('zap-01', {
      status: 'connected',
      is_connected: true,
      phone_number: '5511999999999',
      qr_code: null,
    });

    expect(h.from).toHaveBeenCalledWith(TABLE);
    expect(builder.update).toHaveBeenCalledWith({
      status: 'connected',
      is_connected: true,
      phone_number: '5511999999999',
      qr_code: null,
      updated_at: FIXED_ISO,
    });
    expect(builder.eq).toHaveBeenCalledWith('instance_id', 'zap-01');
  });

  it('carimba updated_at no INSTANTE UTC, não na hora local (TZ do processo: America/Sao_Paulo)', async () => {
    await updateEvolutionInstanceStatus('zap-01', { status: 'open' });

    const payload = builder.update.mock.calls[0][0] as { updated_at: string };

    expect(payload.updated_at).toBe(FIXED_ISO);
    expect(payload.updated_at.endsWith('Z')).toBe(true);
    // O instante tem de ser o mesmo que FIXED_MS: uma implementação com
    // `toLocaleString()` (12:30 local, sem offset) cairia 3 h fora.
    expect(Date.parse(payload.updated_at)).toBe(FIXED_MS);
    expect(Date.parse(payload.updated_at)).not.toBe(Date.parse('2026-10-07T12:30:00.000Z'));
  });

  it('update parcial não inventa campos ausentes (só o que veio + updated_at)', async () => {
    await updateEvolutionInstanceStatus('zap-01', { is_connected: false });

    const payload = builder.update.mock.calls[0][0] as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(['is_connected', 'updated_at']);
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('qr_code');
  });

  it('propaga o erro de escrita (RLS nega update para agente comum) em vez de falhar em silêncio', async () => {
    const rls = { code: '42501', message: 'new row violates row-level security policy' };
    mockRead(null, rls);

    await expect(updateEvolutionInstanceStatus('zap-01', { status: 'connected' })).rejects.toBe(rls);
  });
});

// ─── sendEvolutionMessage ────────────────────────────────────────────────────

describe('sendEvolutionMessage', () => {
  const payload: EvolutionMessagePayload = {
    instanceName: 'zap-01',
    number: '5511999999999',
    text: 'bom dia',
  };

  it('roteia pela edge function evolution-api/send-text com instanceName/number/text', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(sendEvolutionMessage(payload)).resolves.toBeUndefined();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('evolution-api/send-text', {
      body: { instanceName: 'zap-01', number: '5511999999999', text: 'bom dia' },
    });
  });

  it('nunca monta a URL/chave da Evolution no cliente (sem mediaUrl, sem chave no corpo)', async () => {
    await sendEvolutionMessage(payload);

    const [, options] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];

    expect(Object.keys(options.body).sort()).toEqual(['instanceName', 'number', 'text']);
    expect(JSON.stringify(options.body)).not.toMatch(/apiKey|evolutionApiUrl|apikey/i);
  });

  it('falha de rede (FunctionsFetchError) rejeita a promessa', async () => {
    const fetchError = Object.assign(new Error('Failed to send a request to the Edge Function'), {
      name: 'FunctionsFetchError',
    });
    h.invoke.mockResolvedValue({ data: null, error: fetchError });

    // Rejeita (não resolve em silêncio). A CAUSA da falha de rede hoje é
    // substituída pelo texto padrão do serviço — mesmo defeito do it.fails do 403.
    await expect(sendEvolutionMessage(payload)).rejects.toBeInstanceOf(Error);
  });

  it('erro do corpo com HTTP 200 ({error:true,message}) chega ao chamador com a mensagem do servidor', async () => {
    h.invoke.mockResolvedValue({
      data: { error: true, message: 'instance (instanceName) é obrigatório para esta ação.' },
      error: null,
    });

    await expect(sendEvolutionMessage(payload)).rejects.toThrow(
      'instance (instanceName) é obrigatório para esta ação.',
    );
  });

  it('corpo de erro sem message cai no texto padrão (não lança string vazia)', async () => {
    h.invoke.mockResolvedValue({ data: { error: true }, error: null });

    await expect(sendEvolutionMessage(payload)).rejects.toThrow('Failed to send message via Evolution API');
  });

  it('corpo que não é objeto (texto puro) não é tratado como erro', async () => {
    h.invoke.mockResolvedValue({ data: 'ok', error: null });

    await expect(sendEvolutionMessage(payload)).resolves.toBeUndefined();
  });

  it('403 da edge function (envio negado pela matriz de autorização) rejeita a chamada', async () => {
    const httpError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      name: 'FunctionsHttpError',
      context: new Response(
        JSON.stringify({ error: true, message: 'Sem permissão para enviar para este contato/conexão.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    h.invoke.mockResolvedValue({ data: null, error: httpError });

    await expect(sendEvolutionMessage(payload)).rejects.toBeInstanceOf(Error);
  });

  it.fails('propaga a mensagem do servidor quando a edge function responde 403 (hoje o corpo do erro é descartado)', async () => {
    const httpError = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      name: 'FunctionsHttpError',
      context: new Response(
        JSON.stringify({ error: true, message: 'Sem permissão para enviar para este contato/conexão.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    h.invoke.mockResolvedValue({ data: null, error: httpError });

    await expect(sendEvolutionMessage(payload)).rejects.toThrow('Sem permissão para enviar');
  });
});

// ─── sendEvolutionMedia ──────────────────────────────────────────────────────

describe('sendEvolutionMedia', () => {
  const base: EvolutionMessagePayload = {
    instanceName: 'zap-01',
    number: '5511999999999',
    mediaUrl: 'whatsapp-media/contato/foto.png',
    mediaType: 'image',
    caption: 'legenda',
    fileName: 'foto.png',
  };

  it('mídia comum vai para evolution-api/send-media com o corpo completo', async () => {
    await sendEvolutionMedia(base);

    expect(h.invoke).toHaveBeenCalledWith('evolution-api/send-media', {
      body: {
        instanceName: 'zap-01',
        number: '5511999999999',
        mediaUrl: 'whatsapp-media/contato/foto.png',
        mediaType: 'image',
        caption: 'legenda',
        fileName: 'foto.png',
      },
    });
  });

  it('mediaType audio troca o caminho para evolution-api/send-audio', async () => {
    await sendEvolutionMedia({ ...base, mediaType: 'audio' });

    expect(h.invoke.mock.calls[0][0]).toBe('evolution-api/send-audio');
  });

  it.each(['video', 'document'] as const)('mediaType %s continua em send-media', async (mediaType) => {
    await sendEvolutionMedia({ ...base, mediaType });

    expect(h.invoke.mock.calls[0][0]).toBe('evolution-api/send-media');
  });

  it('mediaType ausente cai em send-media (não explode)', async () => {
    await sendEvolutionMedia({ instanceName: 'zap-01', number: '5511', mediaUrl: 'x' });

    expect(h.invoke.mock.calls[0][0]).toBe('evolution-api/send-media');
  });

  it('erro do corpo chega ao chamador com a mensagem do servidor', async () => {
    h.invoke.mockResolvedValue({ data: { error: true, message: 'Arquivo maior que o limite do WhatsApp' }, error: null });

    await expect(sendEvolutionMedia(base)).rejects.toThrow('Arquivo maior que o limite do WhatsApp');
  });

  it('corpo de erro sem message cai no texto padrão de mídia', async () => {
    h.invoke.mockResolvedValue({ data: { error: true }, error: null });

    await expect(sendEvolutionMedia(base)).rejects.toThrow('Failed to send media via Evolution API');
  });

  it('falha de rede rejeita a chamada (não resolve em silêncio)', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('network down') });

    await expect(sendEvolutionMedia(base)).rejects.toBeInstanceOf(Error);
  });
});
