/**
 * Contrato das capacidades declaradas de IA — Bloco 04 / PR-2 (IA-036).
 *
 * O desenho congelado (.tmp/PLANO-BLOCO-04-PR2.md, seção "Interfaces congeladas")
 * define `supabase/functions/_shared/ai-capabilities.ts` como módulo PURO
 * (sem Deno, sem fetch) — por isso é importável direto no vitest. Este teste
 * trava a semântica do "sem prometer capacidades inexistentes":
 *
 *   1. BASE_CAPABILITIES: o que cada provider_type garante por construção;
 *   2. `declaredCapabilities` COM PORTAMENTO: o config só ESTREITA features
 *      ou ACRESCENTA modalidades não-texto — nunca amplia `tools`/`json`/
 *      `streaming` a um tipo que não os garante;
 *   3. limites vêm SOMENTE de config.limits (positivos e numéricos), nada é
 *      inventado;
 *   4. `assertCapabilities` lança AiCapabilityError com os quatro códigos,
 *      inclusive UNDECLARED_LIMIT (ausência de declaração NÃO é permissão).
 *
 * O import do módulo é LAZY (dentro de cada caso) e não no topo: enquanto o
 * módulo não existir no disco cada caso falha individualmente com mensagem
 * clara, sem derrubar a coleta do arquivo.
 */

import { describe, expect, it } from 'vitest';

type AiModality = 'text' | 'vision' | 'audio_stt' | 'audio_tts' | 'audio_sts';
type AiFeature = 'tools' | 'json' | 'streaming';
type AiCapabilityErrorCode =
  | 'UNSUPPORTED_MODALITY'
  | 'UNSUPPORTED_FEATURE'
  | 'LIMIT_EXCEEDED'
  | 'UNDECLARED_LIMIT';

interface AiCapabilities {
  modalities: AiModality[];
  features: AiFeature[];
  limits: {
    max_input_tokens?: number;
    max_output_tokens?: number;
    max_audio_seconds?: number;
  };
  source: 'type' | 'config';
}

interface AiProviderRow {
  id: string;
  name: string;
  provider_type: string;
  api_endpoint?: string | null;
  api_key_secret_name?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  config: Record<string, unknown> | null;
  is_active?: boolean;
  [chave: string]: unknown;
}

interface Necessidade {
  modality?: AiModality;
  features?: AiFeature[];
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
}

interface CapabilitiesModule {
  BASE_CAPABILITIES: Record<string, { modalities: AiModality[]; features: AiFeature[] }>;
  AiCapabilityError: new (
    code: AiCapabilityErrorCode,
    message?: string,
  ) => Error & { readonly code: AiCapabilityErrorCode };
  declaredCapabilities: (provider: AiProviderRow) => AiCapabilities;
  assertCapabilities: (provider: AiProviderRow, need: Necessidade) => AiCapabilities;
}

let cache: CapabilitiesModule | null = null;

/** Importa (uma vez) o módulo puro de capacidades. */
async function caps(): Promise<CapabilitiesModule> {
  if (!cache) {
    try {
      cache = (await import(
        '../../supabase/functions/_shared/ai-capabilities.ts'
      )) as unknown as CapabilitiesModule;
    } catch (erro) {
      // Mensagem clara: o alvo pode ainda não estar no disco (agentes paralelos).
      throw new Error(
        'ai-capabilities.ts não importável (interface congelada .tmp/PLANO-BLOCO-04-PR2.md): ' +
          (erro instanceof Error ? erro.message : String(erro)),
      );
    }
  }
  return cache;
}

/** Executa `fn` esperando AiCapabilityError e devolve o erro tipado. */
async function erroDe(
  fn: () => unknown,
): Promise<Error & { readonly code: AiCapabilityErrorCode }> {
  const { AiCapabilityError } = await caps();
  try {
    fn();
  } catch (erro) {
    expect(erro, 'a recusa de capacidade deveria ser AiCapabilityError').toBeInstanceOf(
      AiCapabilityError,
    );
    return erro as Error & { readonly code: AiCapabilityErrorCode };
  }
  throw new Error('esperava AiCapabilityError — nenhuma exceção foi lançada');
}

/** Linha de ai_providers com defaults válidos. */
function linha(over: Partial<AiProviderRow> = {}): AiProviderRow {
  return {
    id: 'p1',
    name: 'Provedor 1',
    provider_type: 'openai_compatible',
    api_endpoint: 'https://api.exemplo.test/v1/chat/completions',
    api_key_secret_name: 'SECRET_X',
    model: null,
    system_prompt: null,
    config: {},
    is_active: true,
    ...over,
  };
}

const ordenado = (vs: readonly string[]) => [...vs].sort();

const TIPOS_COMPLETOS = ['lovable_ai', 'openai_compatible', 'google_gemini'] as const;
const TIPOS_SEM_FEATURES = ['custom_webhook', 'custom_agent'] as const;
const TODAS_MODALIDADES: AiModality[] = ['text', 'vision', 'audio_stt', 'audio_tts', 'audio_sts'];
const TODAS_FEATURES: AiFeature[] = ['tools', 'json', 'streaming'];

// ---------------------------------------------------------------------------
// 1. BASE_CAPABILITIES — o que cada tipo garante por construção
// ---------------------------------------------------------------------------

describe('IA-036 — BASE_CAPABILITIES: cada tipo anuncia apenas o que garante', () => {
  it('lovable_ai: texto + tools/json/streaming', async () => {
    const { BASE_CAPABILITIES } = await caps();
    const base = BASE_CAPABILITIES['lovable_ai'];
    expect(base, 'lovable_ai deveria estar na base').toBeDefined();
    expect(ordenado(base.modalities)).toEqual(['text']);
    expect(ordenado(base.features)).toEqual(ordenado(TODAS_FEATURES));
  });

  it('openai_compatible: texto + tools/json/streaming', async () => {
    const { BASE_CAPABILITIES } = await caps();
    const base = BASE_CAPABILITIES['openai_compatible'];
    expect(base, 'openai_compatible deveria estar na base').toBeDefined();
    expect(ordenado(base.modalities)).toEqual(['text']);
    expect(ordenado(base.features)).toEqual(ordenado(TODAS_FEATURES));
  });

  it('google_gemini: texto + tools/json/streaming', async () => {
    const { BASE_CAPABILITIES } = await caps();
    const base = BASE_CAPABILITIES['google_gemini'];
    expect(base, 'google_gemini deveria estar na base').toBeDefined();
    expect(ordenado(base.modalities)).toEqual(['text']);
    expect(ordenado(base.features)).toEqual(ordenado(TODAS_FEATURES));
  });

  it('custom_webhook: texto sem features (contrato é de quem configura)', async () => {
    const { BASE_CAPABILITIES } = await caps();
    const base = BASE_CAPABILITIES['custom_webhook'];
    expect(base, 'custom_webhook deveria estar na base').toBeDefined();
    expect(ordenado(base.modalities)).toEqual(['text']);
    // Asserção negativa: webhook não promete tools/json/streaming.
    expect(base.features).toEqual([]);
  });

  it('custom_agent: texto sem features', async () => {
    const { BASE_CAPABILITIES } = await caps();
    const base = BASE_CAPABILITIES['custom_agent'];
    expect(base, 'custom_agent deveria estar na base').toBeDefined();
    expect(ordenado(base.modalities)).toEqual(['text']);
    expect(base.features).toEqual([]);
  });

  it('declaredCapabilities de cada tipo, sem config, devolve exatamente a base', async () => {
    const { declaredCapabilities } = await caps();

    for (const tipo of TIPOS_COMPLETOS) {
      const c = declaredCapabilities(linha({ provider_type: tipo, config: {} }));
      expect(ordenado(c.modalities), tipo).toEqual(['text']);
      expect(ordenado(c.features), tipo).toEqual(ordenado(TODAS_FEATURES));
      expect(c.source, tipo).toBe('type');
    }

    for (const tipo of TIPOS_SEM_FEATURES) {
      const c = declaredCapabilities(linha({ provider_type: tipo, config: {} }));
      expect(ordenado(c.modalities), tipo).toEqual(['text']);
      // Asserção negativa: nenhuma feature inventada para o tipo.
      expect(c.features, tipo).toEqual([]);
      expect(c.source, tipo).toBe('type');
    }
  });

  it('tipo desconhecido: texto sem features (não inventa capacidade)', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({ provider_type: 'tipo_nunca_visto_xyz', config: {} }),
    );
    expect(ordenado(c.modalities)).toEqual(['text']);
    // Asserção negativa: tipo desconhecido não ganha tools/json/streaming.
    expect(c.features).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. O config NÃO amplia feature que o tipo não garante
// ---------------------------------------------------------------------------

describe('IA-036 — features do config FILTRAM a base, nunca acrescentam', () => {
  it('custom_webhook com config.features=[tools,json,streaming] continua sem features', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'custom_webhook',
        config: { capabilities: { features: ['tools', 'json', 'streaming'] } },
      }),
    );
    // Asserção negativa: o config não pode prometer o que o tipo não garante.
    expect(c.features).toEqual([]);
    expect(c.features).not.toContain('tools');
    expect(c.features).not.toContain('json');
    expect(c.features).not.toContain('streaming');
  });

  it('custom_agent e tipo desconhecido também não ganham features por config', async () => {
    const { declaredCapabilities } = await caps();
    for (const tipo of ['custom_agent', 'tipo_desconhecido_abc']) {
      const c = declaredCapabilities(
        linha({ provider_type: tipo, config: { capabilities: { features: TODAS_FEATURES } } }),
      );
      expect(c.features, tipo).toEqual([]);
    }
  });

  it('openai_compatible: config.features=[tools] estreita para só tools', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'openai_compatible',
        config: { capabilities: { features: ['tools'] } },
      }),
    );
    expect(ordenado(c.features)).toEqual(['tools']);
    expect(c.source).toBe('config');
  });

  it('o resultado é sempre subconjunto de base ∪ declaração do config (base REAL, não a lista canônica)', async () => {
    const { BASE_CAPABILITIES, declaredCapabilities } = await caps();

    const casos: Array<{
      tipo: string;
      config: Record<string, unknown>;
      declara: { modalities: AiModality[]; features: AiFeature[] };
    }> = [
      {
        tipo: 'openai_compatible',
        config: { capabilities: { modalities: ['vision'], features: ['json'] } },
        declara: { modalities: ['vision'], features: ['json'] },
      },
      {
        tipo: 'lovable_ai',
        config: { capabilities: { modalities: ['audio_stt'], features: ['tools'] } },
        declara: { modalities: ['audio_stt'], features: ['tools'] },
      },
      {
        tipo: 'google_gemini',
        config: { capabilities: { features: ['streaming'] } },
        declara: { modalities: [], features: ['streaming'] },
      },
      {
        tipo: 'custom_webhook',
        config: { capabilities: { modalities: ['vision', 'audio_tts'], features: TODAS_FEATURES } },
        declara: { modalities: ['vision', 'audio_tts'], features: TODAS_FEATURES },
      },
      {
        tipo: 'custom_agent',
        config: { capabilities: { modalities: ['audio_sts'], features: ['json'] } },
        declara: { modalities: ['audio_sts'], features: ['json'] },
      },
      {
        tipo: 'tipo_nunca_visto_abc',
        config: { capabilities: { modalities: ['vision'], features: ['tools'] } },
        declara: { modalities: ['vision'], features: ['tools'] },
      },
    ];

    const baseDe = (tipo: string) =>
      BASE_CAPABILITIES[tipo] ?? { modalities: ['text'] as AiModality[], features: [] as AiFeature[] };

    for (const caso of casos) {
      const base = baseDe(caso.tipo);
      const c = declaredCapabilities(linha({ provider_type: caso.tipo, config: caso.config }));

      // Conjunto PERMITIDO de verdade: a base do TIPO ∪ o que o config declarou.
      const permitidasMod = Array.from(
        new Set<string>([
          ...base.modalities,
          ...caso.declara.modalities.filter((m) => TODAS_MODALIDADES.includes(m)),
        ]),
      );
      // Features: o config só FILTRA a base — o permitido é base ∩ declaração.
      const permitidasFeat = Array.from(
        new Set<string>(base.features.filter((f) => caso.declara.features.includes(f))),
      );

      for (const m of c.modalities) {
        expect(permitidasMod, `${caso.tipo}: modalidade ${m} fora de base ∪ config`).toContain(m);
      }
      for (const f of c.features) {
        expect(permitidasFeat, `${caso.tipo}: feature ${f} fora de base ∩ config`).toContain(f);
      }

      // Igualdade EXATA com o conjunto permitido: nem a mais (ampliação) nem a menos.
      expect(ordenado(c.modalities), `${caso.tipo}: modalidades`).toEqual(ordenado(permitidasMod));
      expect(ordenado(c.features), `${caso.tipo}: features`).toEqual(ordenado(permitidasFeat));
    }

    // NEGATIVO REAL de não-ampliação: para CADA tipo cuja base NÃO garante features,
    // o config que declara todas as features não amplia nada (não só o custom_webhook).
    for (const tipo of ['custom_webhook', 'custom_agent', 'tipo_nunca_visto_abc']) {
      const base = baseDe(tipo);
      expect(base.features, `${tipo}: premissa do caso negativo (base sem features)`).toEqual([]);
      const c = declaredCapabilities(
        linha({ provider_type: tipo, config: { capabilities: { features: TODAS_FEATURES } } }),
      );
      for (const feature of TODAS_FEATURES) {
        expect(c.features, `${tipo} ganhou ${feature} declarada no config`).not.toContain(feature);
      }
      expect(c.features, `${tipo}: nenhuma feature pode vir do config`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. O config ACRESCENTA vision/áudio quando declarado
// ---------------------------------------------------------------------------

describe('IA-036 — modalidades não-texto só aparecem quando o config as declara', () => {
  it('sem declaração, vision/áudio NÃO são anunciadas por nenhum tipo', async () => {
    const { declaredCapabilities } = await caps();
    for (const tipo of [...TIPOS_COMPLETOS, ...TIPOS_SEM_FEATURES, 'desconhecido_xyz']) {
      const c = declaredCapabilities(linha({ provider_type: tipo, config: {} }));
      // Asserção negativa: a base não promete vision/áudio.
      expect(c.modalities, tipo).not.toContain('vision');
      expect(c.modalities, tipo).not.toContain('audio_stt');
      expect(c.modalities, tipo).not.toContain('audio_tts');
      expect(c.modalities, tipo).not.toContain('audio_sts');
    }
  });

  it('config.capabilities.modalities=[vision] acrescenta vision e preserva text', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'openai_compatible',
        config: { capabilities: { modalities: ['vision'] } },
      }),
    );
    expect(c.modalities).toContain('vision');
    expect(c.modalities).toContain('text');
    expect(c.source).toBe('config');
  });

  it('config declara áudio (stt/tts/sts) no custom_webhook', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'custom_webhook',
        config: { capabilities: { modalities: ['vision', 'audio_stt', 'audio_tts', 'audio_sts'] } },
      }),
    );
    expect(c.modalities).toContain('vision');
    expect(c.modalities).toContain('audio_stt');
    expect(c.modalities).toContain('audio_tts');
    expect(c.modalities).toContain('audio_sts');
    expect(c.modalities).toContain('text');
  });

  it('config com modalities fora da lista é IGNORADO (não vira modalidade inventada)', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'openai_compatible',
        config: { capabilities: { modalities: ['vision', 'telepatia', '__x__'] } },
      }),
    );
    for (const m of c.modalities) {
      expect(TODAS_MODALIDADES, `modalidade ${m} não é válida`).toContain(m);
    }
    expect(c.modalities).toContain('vision');
  });
});

// ---------------------------------------------------------------------------
// 4. Limites vêm somente do config
// ---------------------------------------------------------------------------

describe('IA-036 — limits: só do config, positivos e numéricos', () => {
  it('provedor sem config.limits não declara limite algum (nada é inventado)', async () => {
    const { declaredCapabilities } = await caps();
    for (const tipo of [...TIPOS_COMPLETOS, ...TIPOS_SEM_FEATURES]) {
      const c = declaredCapabilities(linha({ provider_type: tipo, config: {} }));
      // Asserção negativa: o tipo NÃO traz limites por construção.
      expect(c.limits.max_input_tokens, tipo).toBeUndefined();
      expect(c.limits.max_output_tokens, tipo).toBeUndefined();
      expect(c.limits.max_audio_seconds, tipo).toBeUndefined();
    }
  });

  it('config.limits válido é devolvido como está', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({
        provider_type: 'lovable_ai',
        config: { limits: { max_input_tokens: 8000, max_output_tokens: 4000, max_audio_seconds: 30 } },
      }),
    );
    expect(c.limits.max_input_tokens).toBe(8000);
    expect(c.limits.max_output_tokens).toBe(4000);
    expect(c.limits.max_audio_seconds).toBe(30);
    expect(ordenado(Object.keys(c.limits))).toEqual(
      ['max_audio_seconds', 'max_input_tokens', 'max_output_tokens'],
    );
  });

  it('limite parcial: só a chave declarada aparece', async () => {
    const { declaredCapabilities } = await caps();
    const c = declaredCapabilities(
      linha({ config: { limits: { max_output_tokens: 512 } } }),
    );
    expect(c.limits.max_output_tokens).toBe(512);
    expect(c.limits.max_input_tokens).toBeUndefined();
    expect(c.limits.max_audio_seconds).toBeUndefined();
  });

  it('valores não positivos/não numéricos são descartados (nunca viram limite)', async () => {
    const { declaredCapabilities } = await caps();
    const invalidos = [-1, 0, 0.0, '1000', 'abc', NaN, null, undefined, true, [], {}, Infinity];
    for (const ruim of invalidos) {
      const c = declaredCapabilities(linha({ config: { limits: { max_input_tokens: ruim } } }));
      expect(c.limits.max_input_tokens, `limite inválido ${String(ruim)} vazou`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. declaredCapabilities nunca lança (entrada inválida → só a base)
// ---------------------------------------------------------------------------

describe('IA-036 — declaredCapabilities: entrada inválida usa só a base, nunca lança', () => {
  it('config null/string/array/número/boolean → base, sem exceção', async () => {
    const { declaredCapabilities } = await caps();
    const invalidos: unknown[] = [null, undefined, 'uma string', 42, true, [], ['vision']];

    for (const cfg of invalidos) {
      for (const tipo of [...TIPOS_COMPLETOS, ...TIPOS_SEM_FEATURES, 'desconhecido_zzz']) {
        const provider = linha({ provider_type: tipo, config: cfg as AiProviderRow['config'] });
        expect(
          () => declaredCapabilities(provider),
          `${tipo} com config ${JSON.stringify(cfg) ?? 'undefined'} lançou`,
        ).not.toThrow();

        const c = declaredCapabilities(provider);
        expect(c.modalities, tipo).toContain('text');
        if (tipo !== 'openai_compatible' && tipo !== 'lovable_ai' && tipo !== 'google_gemini') {
          expect(c.features, tipo).toEqual([]);
        }
      }
    }
  });

  it('capabilities/limits com forma errada não ampliam nem lançam', async () => {
    const { declaredCapabilities } = await caps();
    const formas: Record<string, unknown>[] = [
      { capabilities: null },
      { capabilities: 'vision' },
      { capabilities: [] },
      { capabilities: { modalities: 'vision' } },
      { capabilities: { modalities: 42 } },
      { capabilities: { modalities: [] } },
      { capabilities: { features: 'tools' } },
      { capabilities: { features: 42 } },
      { limits: 'x' },
      { limits: [] },
      { limits: null },
      { capabilities: { modalities: ['vision'] }, limits: { max_output_tokens: -3 } },
    ];

    for (const cfg of formas) {
      const provider = linha({ provider_type: 'openai_compatible', config: cfg });
      expect(() => declaredCapabilities(provider), JSON.stringify(cfg)).not.toThrow();
      const c = declaredCapabilities(provider);
      expect(c.modalities, JSON.stringify(cfg)).toContain('text');
      for (const m of c.modalities) {
        expect(TODAS_MODALIDADES, `modalidade ${m} inventada em ${JSON.stringify(cfg)}`).toContain(m);
      }
    }

    // Asserção negativa explícita: modalities como string NÃO vira modalidade.
    const stringMod = declaredCapabilities(
      linha({ config: { capabilities: { modalities: 'vision' } } }),
    );
    expect(stringMod.modalities).not.toContain('vision');
  });

  it('formas malformadas de JSON (array-de-arrays, objeto aninhado, __proto__) não ampliam nem lançam', async () => {
    const { declaredCapabilities } = await caps();

    // (a) array-de-arrays: nada de achatamento/coerção.
    const ninho = declaredCapabilities(
      linha({
        provider_type: 'custom_webhook',
        config: { capabilities: { modalities: [['vision']], features: [['tools', 'json']] } },
      }),
    );
    expect(ninho.modalities).toEqual(['text']);
    expect(ninho.features).toEqual([]);

    // (b) objeto aninhado onde se espera string/array.
    const aninhado = declaredCapabilities(
      linha({
        provider_type: 'custom_webhook',
        config: { capabilities: { modalities: { vision: true }, features: { tools: true } } },
      }),
    );
    expect(aninhado.modalities).toEqual(['text']);
    expect(aninhado.features).toEqual([]);

    // (c) chave `__proto__` vinda de JSON (dado real de jsonb): não vira capacidade
    //     e não polui o protótipo global. Sem getters — o contrato cobre dado JSON.
    const comProto = JSON.parse(
      '{"__proto__":{"capabilities":{"modalities":["vision"],"features":["tools"]}}}',
    ) as Record<string, unknown>;
    const viaJson = declaredCapabilities(
      linha({ provider_type: 'custom_webhook', config: comProto }),
    );
    expect(viaJson.modalities).toEqual(['text']);
    expect(viaJson.features).toEqual([]);
    expect(({} as Record<string, unknown>)['capabilities'], 'protótipo global poluído').toBeUndefined();
    expect(({} as Record<string, unknown>)['modalities'], 'protótipo global poluído').toBeUndefined();

    // (c.2) chave HERDADA — o ponto que o endurecimento cobre: o protótipo é dado JSON
    //       puro (sem getter) e `capabilities` NÃO é chave própria. O módulo precisa
    //       ignorá-la (senão um `__proto__` copiado de jsonb viraria capacidade).
    const prototipoJson = JSON.parse(
      '{"capabilities":{"modalities":["vision"],"features":["tools"]}}',
    );
    const herdado = Object.create(prototipoJson) as Record<string, unknown>;
    expect('capabilities' in herdado, 'a premissa do caso: `capabilities` existe por herança').toBe(
      true,
    );
    expect(
      Object.prototype.hasOwnProperty.call(herdado, 'capabilities'),
      'a premissa do caso: a chave é HERDADA, não própria',
    ).toBe(false);
    const viaHerdado = declaredCapabilities(
      linha({ provider_type: 'custom_webhook', config: herdado }),
    );
    expect(viaHerdado.modalities, 'chave herdada não pode virar modalidade').toEqual(['text']);
    expect(viaHerdado.features, 'chave herdada não pode virar feature').toEqual([]);
  });

  it('provider sem config (undefined) é tratado como base', async () => {
    const { declaredCapabilities } = await caps();
    const provider = linha();
    delete (provider as { config?: unknown }).config;
    expect(() => declaredCapabilities(provider)).not.toThrow();
    expect(declaredCapabilities(provider).modalities).toContain('text');
  });
});

// ---------------------------------------------------------------------------
// 6. assertCapabilities — recursos incompatíveis falham claramente
// ---------------------------------------------------------------------------

describe('IA-036 — assertCapabilities: pedido não coberto falha com código próprio', () => {
  it('pedido coberto devolve as capacidades (não lança)', async () => {
    const { assertCapabilities } = await caps();
    const provider = linha({
      provider_type: 'openai_compatible',
      config: { limits: { max_output_tokens: 1000 } },
    });

    const c = assertCapabilities(provider, {
      modality: 'text',
      features: ['tools', 'json', 'streaming'],
      outputTokens: 100,
    });

    expect(c.modalities).toContain('text');
    expect(c.features).toContain('tools');
    expect(c.limits.max_output_tokens).toBe(1000);
  });

  it('modalidade fora da lista → UNSUPPORTED_MODALITY', async () => {
    const { assertCapabilities } = await caps();
    for (const provider of [
      linha({ provider_type: 'openai_compatible', config: {} }),
      linha({ provider_type: 'custom_webhook', config: {} }),
    ]) {
      const erro = await erroDe(() => assertCapabilities(provider, { modality: 'vision' }));
      expect(erro.code).toBe('UNSUPPORTED_MODALITY');
    }

    // Com o config declarando vision, o mesmo pedido passa.
    const comVision = linha({
      provider_type: 'openai_compatible',
      config: { capabilities: { modalities: ['vision'] } },
    });
    expect(() => assertCapabilities(comVision, { modality: 'vision' })).not.toThrow();
  });

  it('feature fora da lista → UNSUPPORTED_FEATURE', async () => {
    const { assertCapabilities } = await caps();

    const semFerramentas = await erroDe(() =>
      assertCapabilities(linha({ provider_type: 'custom_webhook', config: {} }), {
        features: ['tools'],
      }),
    );
    expect(semFerramentas.code).toBe('UNSUPPORTED_FEATURE');

    // A base garante, mas o config estreitou: continua recusando.
    const estreitado = await erroDe(() =>
      assertCapabilities(
        linha({ provider_type: 'openai_compatible', config: { capabilities: { features: ['json'] } } }),
        { features: ['tools'] },
      ),
    );
    expect(estreitado.code).toBe('UNSUPPORTED_FEATURE');
  });

  it('valor acima de um limite declarado → LIMIT_EXCEEDED', async () => {
    const { assertCapabilities } = await caps();
    const provider = linha({
      provider_type: 'openai_compatible',
      config: {
        limits: { max_input_tokens: 100, max_output_tokens: 200, max_audio_seconds: 30 },
      },
    });

    expect((await erroDe(() => assertCapabilities(provider, { inputTokens: 101 }))).code).toBe(
      'LIMIT_EXCEEDED',
    );
    expect((await erroDe(() => assertCapabilities(provider, { outputTokens: 201 }))).code).toBe(
      'LIMIT_EXCEEDED',
    );
    expect((await erroDe(() => assertCapabilities(provider, { audioSeconds: 31 }))).code).toBe(
      'LIMIT_EXCEEDED',
    );

    // Exatamente no limite é permitido.
    expect(() =>
      assertCapabilities(provider, { inputTokens: 100, outputTokens: 200, audioSeconds: 30 }),
    ).not.toThrow();
  });

  it('pedido exige limite não declarado → UNDECLARED_LIMIT (ausência não é permissão)', async () => {
    const { assertCapabilities } = await caps();
    const semLimites = linha({ provider_type: 'openai_compatible', config: {} });

    const porEntrada = await erroDe(() => assertCapabilities(semLimites, { inputTokens: 10 }));
    expect(porEntrada.code).toBe('UNDECLARED_LIMIT');

    const porSaida = await erroDe(() => assertCapabilities(semLimites, { outputTokens: 10 }));
    expect(porSaida.code).toBe('UNDECLARED_LIMIT');

    const porAudio = await erroDe(() => assertCapabilities(semLimites, { audioSeconds: 10 }));
    expect(porAudio.code).toBe('UNDECLARED_LIMIT');

    // Asserção negativa: declarar UM limite não libera os outros.
    const soSaida = linha({ config: { limits: { max_output_tokens: 100 } } });
    const outro = await erroDe(() => assertCapabilities(soSaida, { inputTokens: 10 }));
    expect(outro.code).toBe('UNDECLARED_LIMIT');

    // Dentro do limite declarado NÃO lança.
    expect(() => assertCapabilities(soSaida, { outputTokens: 50 })).not.toThrow();
  });
});
