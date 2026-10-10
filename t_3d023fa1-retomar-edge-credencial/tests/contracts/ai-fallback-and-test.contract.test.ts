/**
 * Contrato do fallback explícito (IA-039) e do modo teste (IA-040) — Bloco 04 / PR-2.
 *
 * `supabase/functions/ai-proxy/index.ts` importa `https://esm.sh/@supabase/supabase-js`
 * e usa `Deno.serve` — NÃO é importável no vitest. Por isso a fronteira é provada
 * por LEITURA DE FONTE com regex ancorada em CONSTRUÇÕES (não em mera presença de
 * símbolo): a expressão exata que autoriza o fallback, o destino lido do config,
 * a checagem de existência/estado/diferença e os códigos de classificação com
 * status HTTP coerente.
 *
 * O desenho congelado (.tmp/PLANO-BLOCO-04-PR2.md) define:
 *
 *   IA-039 — `config.allow_fallback === true` é condição NECESSÁRIA; destino em
 *            `config.fallback_provider_id` (existir + is_active + diferente da
 *            origem); metadata com fallback_allowed/fallback_reason/fallback_to/
 *            fallback_used; OpenRouter fixo NÃO é mais destino de fallback.
 *   IA-040 — `test === true`: fallback DESLIGADO, `provider_id` obrigatório
 *            (PROVIDER_REQUIRED), corpo de sucesso carrega o `provider_id` testado,
 *            classificação distinta (MISSING_KEY/QUOTA/CONTRACT/NETWORK).
 *
 * Cada caso traz asserção NEGATIVA: o defeito medido não pode voltar.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FONTE_PROXY = 'supabase/functions/ai-proxy/index.ts';
const FONTE_PROVIDERS = 'supabase/functions/_shared/ai-providers.ts';

/** Comentários fora antes de varrer o fonte: a doc cita os literais do defeito. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const proxy = semComentarios(readFileSync(FONTE_PROXY, 'utf8'));
const providers = semComentarios(readFileSync(FONTE_PROVIDERS, 'utf8'));

/** Fatia do fonte ao redor da PRIMEIRA ocorrência de `marca`. */
function janela(fonte: string, marca: RegExp, antes = 300, depois = 1200): string {
  const m = marca.exec(fonte);
  if (!m) return '';
  const i = m.index;
  return fonte.slice(Math.max(0, i - antes), i + m[0].length + depois);
}

/**
 * Alguma ocorrência de `codigo` tem `status` a menos de `largura` chars?
 *
 * A janela é ESTREITA de propósito (~120). As construções reais são do tipo
 * `fail('MISSING_KEY', 404, ...)`, com 8-14 chars entre código e status; uma
 * janela larga (900) passaria mesmo com o código e o status em blocos alheios.
 */
function codigoPertoDe(fonte: string, codigo: string, status: number, largura = 120): boolean {
  const re = new RegExp(`\\b${codigo}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    const trecho = fonte.slice(Math.max(0, m.index - largura), m.index + codigo.length + largura);
    if (new RegExp(`\\b${status}\\b`).test(trecho)) return true;
  }
  return false;
}

/** Bloco balanceado a partir do primeiro `{` em/na frente de `inicio`. */
function blocoBalanceado(fonte: string, inicio: number): string {
  const abre = fonte.indexOf('{', inicio);
  if (abre < 0) return '';
  let nivel = 0;
  for (let i = abre; i < fonte.length; i++) {
    const ch = fonte[i];
    if (ch === '{') nivel++;
    else if (ch === '}') {
      nivel--;
      if (nivel === 0) return fonte.slice(abre, i + 1);
    }
  }
  return fonte.slice(abre);
}

/**
 * Corpo de `function nome(...) { ... }` — pula a assinatura (os tipos de
 * parâmetro têm chaves) até o `{` que abre o corpo. Permite provar o que está
 * DENTRO da função, não só o que existe no arquivo.
 */
function corpoDeFuncao(fonte: string, nome: string): string {
  const m = new RegExp(`(?:async\\s+)?function\\s+${nome}\\s*\\(`).exec(fonte);
  if (!m) return '';
  let i = m.index + m[0].length - 1; // no '('
  let nivel = 0;
  for (; i < fonte.length; i++) {
    const ch = fonte[i];
    if (ch === '(') nivel++;
    else if (ch === ')') {
      nivel--;
      if (nivel === 0) {
        i++;
        break;
      }
    }
  }
  return blocoBalanceado(fonte, i);
}

/**
 * Bloco `if (isTest) { ... }` que contém a chamada REAL a `runProviderTest`.
 * (Há outros `if (isTest)` no arquivo — ex.: roteamento — então o alvo é o que
 * precede a chamada.)
 */
function blocoCallSiteModoTeste(fonte: string): string {
  const alvo = fonte.indexOf('return await runProviderTest');
  if (alvo < 0) return '';
  const re = /if\s*\(\s*isTest\s*\)\s*\{/g;
  let abre = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) {
    if (m.index >= alvo) break;
    abre = m.index;
  }
  return abre < 0 ? '' : blocoBalanceado(fonte, abre);
}

/** Expressão da atribuição `const fallbackAllowed = <expr>;` (normalizada). */
function exprFallbackAllowed(fonte: string): string | null {
  const m = fonte.match(/const\s+fallbackAllowed\s*=\s*([^;]+);/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Valida a expressão INTEIRA de autorização do fallback e devolve os termos da
 * conjunção (ou `null` se a forma não for a ancorada). Regras:
 *  - NENHUMA disjunção (`||`/`??`): é por aí que uma condição extra autorizaria;
 *  - o primeiro termo é `!isTest` (modo teste nunca cai no fallback);
 *  - o último termo é `<config>.allow_fallback === true` (condição necessária);
 *  - no meio, SÓ uma checagem de chave PRÓPRIA sobre `allow_fallback`
 *    (`hasOwn`/`hasOwnProperty`), nunca outra condição qualquer.
 * Assim `allow_fallback === true || <outra>` — o buraco do regex antigo — não passa.
 */
function termosFallbackAllowed(expr: string): string[] | null {
  if (/\|\||\?\?/.test(expr)) return null;
  const termos = expr.replace(/^\(|\)$/g, '').split('&&').map((t) => t.trim());
  if (termos.length < 2) return null;
  if (termos[0] !== '!isTest') return null;
  if (!/^[A-Za-z_$][\w$.]*\.allow_fallback\s*===\s*true$/.test(termos[termos.length - 1])) {
    return null;
  }
  const guardaChavePropria =
    /^(?:[A-Za-z_$][\w$.]*)?hasOwn(?:Property)?(?:\.call)?\s*\(\s*[A-Za-z_$][\w$.]*\s*,\s*['"]allow_fallback['"]\s*\)$/;
  for (const termo of termos.slice(1, -1)) {
    if (!guardaChavePropria.test(termo)) return null;
  }
  return termos;
}

// ---------------------------------------------------------------------------
// IA-039 — fallback explícito
// ---------------------------------------------------------------------------

describe('IA-039 — o fallback só existe com autorização explícita', () => {
  it('a autorização é a expressão exata `allow_fallback === true` (padrão = negado)', () => {
    // Construção exata que autoriza a troca de fornecedor.
    expect(proxy, 'o fallback deve ser autorizado por allow_fallback === true').toMatch(
      /allow_fallback\s*===\s*true/,
    );

    // A EXPRESSÃO INTEIRA de `fallbackAllowed` é ancorada: uma disjunção como
    // `allow_fallback === true || <outra condição>` autorizaria por outra via e
    // NÃO pode passar (o regex antigo só olhava `||`/`??` ANTES do `true`).
    const expr = exprFallbackAllowed(proxy);
    expect(expr, 'a autorização precisa estar em `const fallbackAllowed = ...;`').not.toBeNull();
    expect(expr!, 'a autorização do fallback não pode conter disjunção (|| / ??)').not.toMatch(
      /\|\||\?\?/,
    );
    expect(
      termosFallbackAllowed(expr!),
      'a autorização deve ser a conjunção ancorada `!isTest && <guarda de chave própria>? && <config>.allow_fallback === true`',
    ).not.toBeNull();

    // Asserção negativa: nenhuma forma permissiva (que autorizaria ausência/undefined).
    expect(proxy, 'allow_fallback não pode ser permissivo com ||/??').not.toMatch(
      /allow_fallback[\s\S]{0,60}(?:\|\||\?\?)[\s\S]{0,20}true/,
    );
    expect(proxy, 'allow_fallback !== false autorizaria o padrão').not.toMatch(
      /allow_fallback\s*!==\s*false/,
    );
  });

  it('sem allow_fallback não há troca de fornecedor (nada de fallback incondicional)', () => {
    // A autorização precede o destino: o config é lido antes de usar.
    const iAutorizacao = proxy.search(/allow_fallback\s*===\s*true/);
    const iDestino = proxy.search(/fallback_provider_id/);
    expect(iAutorizacao, 'allow_fallback === true não encontrado').toBeGreaterThanOrEqual(0);
    expect(iDestino, 'fallback_provider_id não encontrado').toBeGreaterThanOrEqual(0);
    expect(proxy.indexOf('allow_fallback')).toBeLessThan(proxy.indexOf('fallback_provider_id'));

    // Asserções negativas: as construções do defeito antigo não voltaram.
    expect(proxy, 'o gate antigo do OpenRouter por secret não pode voltar').not.toMatch(
      /isOpenRouter\s*=\s*provider\.api_key_secret_name/,
    );
    expect(proxy, 'o log antigo de fallback para OpenRouter não pode voltar').not.toMatch(
      /falling back to OpenRouter/i,
    );
  });

  it('o destino vem de config.fallback_provider_id (não de env fixo)', () => {
    expect(proxy, 'destino deve vir de fallback_provider_id').toMatch(/fallback_provider_id/);

    const regiao = janela(proxy, /fallback_provider_id/, 500, 1600);
    expect(regiao, 'o destino precisa existir em ai_providers').toMatch(/ai_providers/);
    expect(regiao, 'o destino precisa estar is_active').toMatch(/is_active/);
    expect(
      regiao,
      'o destino precisa ser comparado com a origem (id igual/diferente)',
    ).toMatch(
      /(?:\.id\s*(?:!==|===))|(?:(?:!==|===)\s*[^;\n]{0,40}\.id)|(?:\.neq\s*\(\s*['"]id['"])/,
    );

    // Asserção negativa: o endereço fixo do OpenRouter não mora no caminho de fallback.
    expect(regiao, 'OR_ENDPOINT/OR_CONFIG não podem estar no fallback').not.toMatch(
      /OR_ENDPOINT|OR_CONFIG|openrouter\.ai/i,
    );
  });

  it('a troca de fornecedor passa pelo dispatch (e não por callOpenRouter)', () => {
    expect(proxy, 'o destino deve ser despachado pelo mesmo dispatch').toMatch(/dispatchProvider/);

    // Asserção negativa: o fallback não é mais uma atribuição direta ao OpenRouter.
    expect(proxy, 'callOpenRouter não pode ser atribuído no fluxo de fallback').not.toMatch(
      /=\s*await\s+callOpenRouter\s*\(/,
    );
    expect(proxy, 'nenhum catch pode cair direto no callOpenRouter').not.toMatch(
      /catch\s*\([^)]*\)\s*\{[\s\S]{0,600}?callOpenRouter\s*\(/,
    );
  });

  it('metadata registra motivo e destino efetivos (fallback_allowed/reason/to/used)', () => {
    for (const chave of ['fallback_allowed', 'fallback_reason', 'fallback_to', 'fallback_used']) {
      expect(proxy, `metadata deve registrar ${chave}`).toMatch(new RegExp(`\\b${chave}\\b`));
    }

    // As chaves entram como propriedades de metadata (não só citadas em comentário).
    expect(proxy).toMatch(/fallback_allowed\s*:/);
    expect(proxy).toMatch(/fallback_reason\s*:/);
    expect(proxy).toMatch(/fallback_to\s*:/);
    expect(proxy).toMatch(/fallback_used\s*:/);

    // `fallback_to` é null quando não houve troca — destino explícito.
    expect(proxy, 'fallback_to deve poder ser null').toMatch(
      /fallback_to[\s\S]{0,400}?(?:null|\?\?)/,
    );
  });
});

// ---------------------------------------------------------------------------
// IA-040 — modo teste
// ---------------------------------------------------------------------------

describe('IA-040 — modo test: destino fixo, sem fallback e classificação distinta', () => {
  it('`test` é reconhecido no schema e exige provider_id (PROVIDER_REQUIRED)', () => {
    expect(proxy, 'o campo test deve estar no schema').toMatch(/\btest\b/);
    expect(proxy, 'a checagem do modo teste deve existir').toMatch(
      /test\s*===\s*true|if\s*\(\s*(?:test|isTest)\b/,
    );

    expect(proxy, 'o modo teste precisa de PROVIDER_REQUIRED').toMatch(/PROVIDER_REQUIRED/);
    // O 400 é ancorado na CONSTRUÇÃO da resposta (não por proximidade): a resposta
    // `jsonResponse({ ... code: 'PROVIDER_REQUIRED' ... }, 400, req)` tem de existir.
    expect(
      proxy,
      'PROVIDER_REQUIRED deveria ser `jsonResponse({ ... }, 400, req)`',
    ).toMatch(/jsonResponse\(\{[\s\S]*?'PROVIDER_REQUIRED'[\s\S]*?\}\s*,\s*400\s*,\s*req\)/);
  });

  it('o modo teste está FIADO no fluxo: call site real + região de runProviderTest sem retry/fallback/outro dispatch', () => {
    // (a) CALL SITE REAL. Sem ele, `runProviderTest` é símbolo morto: provar que
    //     existe não prova que o modo teste passa por ele.
    expect(
      proxy,
      'o call site `if (isTest) { return await runProviderTest(...) }` precisa existir',
    ).toMatch(/if\s*\(\s*isTest\s*\)\s*\{[\s\S]{0,400}?return\s+await\s+runProviderTest\s*\(/);

    const blocoCallSite = blocoCallSiteModoTeste(proxy);
    expect(
      blocoCallSite.length,
      'a chamada real a runProviderTest precisa estar dentro de um bloco `if (isTest) { ... }`',
    ).toBeGreaterThan(20);
    expect(blocoCallSite, 'o bloco if (isTest) precisa RETORNAR runProviderTest').toMatch(
      /return\s+await\s+runProviderTest\s*\(/,
    );

    // O modo teste sai ANTES de montar autorização/destino de fallback.
    const iCallSite = proxy.indexOf('return await runProviderTest');
    const iFallback = proxy.search(/const\s+fallbackAllowed\s*=/);
    expect(iCallSite, 'chamada real a runProviderTest ausente').toBeGreaterThanOrEqual(0);
    expect(iFallback, 'fallbackAllowed ausente').toBeGreaterThanOrEqual(0);
    expect(iCallSite, 'o modo teste tem de sair ANTES do fallback').toBeLessThan(iFallback);

    // (b) A REGIÃO da função prova o contrato interno (não a mera presença do símbolo):
    //     UM dispatch (`dispatchProvider(provider`), SEM retry e SEM destino de fallback.
    const corpo = corpoDeFuncao(proxy, 'runProviderTest');
    expect(corpo.length, 'não achei o corpo de runProviderTest').toBeGreaterThan(200);
    expect(
      corpo,
      'runProviderTest não pode usar withRetry (o diagnóstico mede UMA tentativa)',
    ).not.toMatch(/\bwithRetry\b/);
    expect(corpo, 'runProviderTest não pode ter destino de fallback').not.toMatch(
      /fallback_provider_id|fallbackAllowed|fallbackProviderId|coveredFallbackTarget|loadFallbackTarget|fallback_to/,
    );
    expect(
      corpo.match(/dispatchProvider\s*\(/g) ?? [],
      'runProviderTest deve despachar exatamente uma vez',
    ).toHaveLength(1);
    expect(corpo, 'o dispatch do teste é SEMPRE do provedor sob teste').toMatch(
      /dispatchProvider\s*\(\s*provider\b/,
    );
    expect(corpo, 'runProviderTest não pode chamar o OpenRouter legado').not.toMatch(
      /callOpenRouter/,
    );
  });

  it('em modo test o fallback está DESLIGADO dentro da própria expressão de autorização', () => {
    // A autorização é ancorada na ATRIBUIÇÃO: `!isTest` solto em qualquer lugar do
    // arquivo não vale — tem de estar DENTRO da expressão que autoriza o fallback.
    const expr = exprFallbackAllowed(proxy);
    expect(expr, 'a autorização precisa estar em `const fallbackAllowed = ...;`').not.toBeNull();
    expect(expr!, 'fallbackAllowed não pode ter disjunção (|| / ??)').not.toMatch(/\|\||\?\?/);
    const termos = termosFallbackAllowed(expr!);
    expect(
      termos,
      'fallbackAllowed deve ser a conjunção ancorada `!isTest && <guarda de chave própria>? && <config>.allow_fallback === true`',
    ).not.toBeNull();
    expect(termos![0], 'o modo teste tem de desligar o fallback DENTRO de fallbackAllowed').toBe(
      '!isTest',
    );

    // Asserção negativa ANCORADA NA REGIÃO do modo teste: o símbolo `callOpenRouter`
    // foi extinto do arquivo, então varrer o arquivo inteiro seria vácuo. O que não
    // pode reaparecer é o OpenRouter legado no caminho de teste.
    const blocoCallSite = blocoCallSiteModoTeste(proxy);
    const corpoTeste = corpoDeFuncao(proxy, 'runProviderTest');
    expect(blocoCallSite.length, 'não achei o ramo `if (isTest)` com a chamada real').toBeGreaterThan(20);
    expect(corpoTeste.length, 'não achei o corpo de runProviderTest').toBeGreaterThan(200);
    for (const [rotulo, texto] of [
      ['ramo `if (isTest)`', blocoCallSite],
      ['corpo de runProviderTest', corpoTeste],
    ] as const) {
      expect(texto, `${rotulo}: o OpenRouter legado não pode reaparecer no caminho de teste`).not.toMatch(
        /callOpenRouter|OR_ENDPOINT|OR_CONFIG|openrouter/i,
      );
    }
  });

  it('o corpo de sucesso carrega o provider_id do provedor testado', () => {
    expect(proxy, 'a resposta de teste tem ok:true').toMatch(/ok\s*:\s*true/);
    expect(proxy, 'a resposta de falha tem ok:false').toMatch(/ok\s*:\s*false/);

    const sucesso = janela(proxy, /ok\s*:\s*true/, 80, 500);
    expect(sucesso, 'o sucesso deve trazer o provider_id testado').toMatch(/provider_id/);
    expect(sucesso, 'o sucesso deve trazer provider_name').toMatch(/provider_name/);
    expect(sucesso, 'o sucesso deve trazer o modelo efetivo (model_used)').toMatch(/model_used/);

    const falha = janela(proxy, /ok\s*:\s*false/, 80, 500);
    expect(falha, 'a falha deve trazer code').toMatch(/\bcode\b/);
    expect(falha, 'a falha deve trazer o provider_id testado').toMatch(/provider_id/);

    // Asserção negativa: a resposta de sucesso do teste não fala em OpenRouter —
    // ela identifica o provedor efetivamente testado, nunca o fallback legado.
    expect(sucesso, 'o sucesso não pode citar o OpenRouter de fallback').not.toMatch(/openrouter/i);
  });

  it('classifica chave ausente, quota, contrato e rede com status distintos', () => {
    for (const codigo of ['MISSING_KEY', 'QUOTA', 'CONTRACT', 'NETWORK']) {
      expect(proxy, `código ${codigo} ausente no ai-proxy`).toMatch(new RegExp(`\\b${codigo}\\b`));
    }

    expect(codigoPertoDe(proxy, 'MISSING_KEY', 404), 'MISSING_KEY deveria responder 404').toBe(true);
    expect(codigoPertoDe(proxy, 'QUOTA', 429), 'QUOTA deveria responder 429').toBe(true);
    expect(codigoPertoDe(proxy, 'CONTRACT', 400), 'CONTRACT deveria responder 400').toBe(true);
    expect(codigoPertoDe(proxy, 'NETWORK', 502), 'NETWORK deveria responder 502').toBe(true);

    // Chave/endpoint ausente falha ANTES de qualquer fetch: a região de MISSING_KEY
    // fala de secret/env/endpoint.
    const regiaoChave = janela(proxy, /MISSING_KEY/, 1500, 1500);
    expect(
      regiaoChave,
      'MISSING_KEY deveria nascer de checagem de segredo/endpoint',
    ).toMatch(/api_key_secret_name|apiKey|api_endpoint|Deno\.env|secret/i);

    // Asserção negativa: não existe um único código genérico para tudo.
    expect(proxy, 'não pode haver um code genérico "ERROR"').not.toMatch(/code\s*:\s*['"]ERROR['"]/);
  });

  it('IA-040 — o helper aceita timeoutMs opcional e aborta como erro de rede', () => {
    expect(providers, 'a opção timeoutMs deve existir').toMatch(/timeoutMs/);
    expect(providers, 'timeoutMs deve ser opcional (não muda consumidores atuais)').toMatch(
      /timeoutMs\?\s*:\s*number/,
    );
    expect(providers, 'o timeout usa AbortController').toMatch(/AbortController/);

    const regiaoAbort = janela(providers, /AbortController/, 150, 900);
    expect(regiaoAbort, 'o timer do AbortController precisa ser limpo (clearTimeout)').toMatch(
      /clearTimeout/,
    );
  });
});
