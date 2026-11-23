import { beforeEach, describe, expect, it, vi } from 'vitest';

// O guard do ESTADO.md (`scripts/ci/docs-estado-registry-convention.unit.mjs`) lê o
// código real para decidir o grupo de cada edge, então a chamada de verdade fica em
// `useTalkxAi.ts` e aqui só trocamos o wrapper central por um duplo.
vi.mock('@/lib/invokeEdge', () => ({
  invokeEdge: vi.fn(),
  EdgeFunctionError: class EdgeFunctionError extends Error {
    code: string;
    status: number | null;
    constructor(parsed: { code: string; message: string; status: number | null }) {
      super(parsed.message);
      this.code = parsed.code;
      this.status = parsed.status;
    }
  },
}));

import { EdgeFunctionError, invokeEdge } from '@/lib/invokeEdge';
import { mensagemDaRecusa, pedirTalkxAi, recusaDoErro, type RespostaTalkxAi } from '../useTalkxAi';

/**
 * X076/IA-161 — o consumidor da edge `talkx-ai`.
 *
 * O que importa provar aqui é que cada recusa da edge chega ao operador como um
 * estado com texto acionável, e que a resposta de sucesso com `cached: true` é
 * tratada igual à resposta paga (mesmo `output`) — o cache de 24 h é decisão do
 * servidor, não do cliente.
 */

const chamar = vi.mocked(invokeEdge);

function ok(body: RespostaTalkxAi) {
  chamar.mockResolvedValue({ data: body, error: null } as never);
}

function falha(code: string, status: number) {
  chamar.mockResolvedValue({
    data: null,
    error: new EdgeFunctionError({ code, message: code, status }),
  } as never);
}

beforeEach(() => {
  chamar.mockReset();
});

describe('pedirTalkxAi — tradução das recusas da edge', () => {
  it('pede message_variation no formato que a edge valida (kind + input.texto)', async () => {
    ok({ ok: true, kind: 'message_variation', cached: false, output: 'Oi {{nome}}, tudo bem?' });
    const r = await pedirTalkxAi({ kind: 'message_variation', input: { texto: 'Olá {{nome}}' } });

    expect(chamar).toHaveBeenCalledWith('talkx-ai', {
      body: { kind: 'message_variation', input: { texto: 'Olá {{nome}}' } },
    });
    expect(r.resposta?.output).toBe('Oi {{nome}}, tudo bem?');
    expect(r.recusa).toBeNull();
  });

  it('propaga entity_type/entity_id quando o chamador informa a origem', async () => {
    ok({ ok: true, kind: 'insight_text', cached: false, output: 'frase' });
    await pedirTalkxAi({
      kind: 'insight_text',
      input: { regra: { tipo: 'entrega' } },
      entity_type: 'campaign',
      entity_id: 'c1',
    });
    expect(chamar).toHaveBeenCalledWith('talkx-ai', {
      body: { kind: 'insight_text', input: { regra: { tipo: 'entrega' } }, entity_type: 'campaign', entity_id: 'c1' },
    });
  });

  it('cache de 24 h é tratado como sucesso, com o mesmo output da chamada paga', async () => {
    ok({ ok: true, kind: 'message_variation', cached: true, output: 'texto cacheado' });
    const r = await pedirTalkxAi({ kind: 'message_variation', input: { texto: 'x' } });
    expect(r.recusa).toBeNull();
    expect(r.resposta?.cached).toBe(true);
    expect(r.resposta?.output).toBe('texto cacheado');
  });

  it('ai_disabled vira texto de ajuste, não erro genérico', async () => {
    falha('ai_disabled', 403);
    const r = await pedirTalkxAi({ kind: 'insight_text', input: { regra: {} } });
    expect(r.resposta).toBeNull();
    expect(r.recusa?.code).toBe('ai_disabled');
    expect(r.recusa?.status).toBe(403);
    expect(r.recusa?.message).toContain('teto mensal');
  });

  it('budget_exceeded e user_daily_limit_exceeded são recusas distintas', async () => {
    falha('budget_exceeded', 429);
    const mes = await pedirTalkxAi({ kind: 'insight_text', input: { regra: {} } });
    falha('user_daily_limit_exceeded', 429);
    const dia = await pedirTalkxAi({ kind: 'insight_text', input: { regra: {} } });

    expect(mes.recusa?.message).toContain('teto mensal');
    expect(dia.recusa?.message).toContain('limite diário');
    expect(mes.recusa?.message).not.toBe(dia.recusa?.message);
  });

  it('forbidden explica o papel exigido', async () => {
    falha('forbidden', 403);
    const r = await pedirTalkxAi({ kind: 'insight_text', input: { regra: {} } });
    expect(r.recusa?.message).toContain('administradores e supervisores');
  });

  it('corpo 200 sem ok:true não passa como sucesso', async () => {
    chamar.mockResolvedValue({ data: { ok: false, reason: 'ai_disabled' }, error: null } as never);
    const r = await pedirTalkxAi({ kind: 'insight_text', input: { regra: {} } });
    expect(r.resposta).toBeNull();
    expect(r.recusa?.code).toBe('resposta_invalida');
  });

  it('motivo desconhecido não vira texto inventado', () => {
    expect(mensagemDaRecusa('motivo_novo')).toBe('A IA recusou o pedido (motivo_novo).');
  });

  it('erro sem code nem status vira recusa legível, sem lançar', () => {
    expect(recusaDoErro(null)).toEqual({
      code: 'desconhecido',
      message: 'A IA recusou o pedido (desconhecido).',
      status: null,
    });
  });
});