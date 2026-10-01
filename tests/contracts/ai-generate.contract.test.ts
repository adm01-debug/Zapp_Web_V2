/**
 * Contrato do DESPACHO CENTRAL de IA — `_shared/ai-generate.ts` (Bloco 04 / PR-3, IA-031/IA-032).
 *
 * `generateWithRouting` faz `fetch` e fala com o banco, então NÃO é importável no vitest
 * (importa `https://esm.sh/@supabase/supabase-js` e usa `Deno.env`). A fronteira é provada
 * por LEITURA DE FONTE com asserção ANCORADA EM CONSTRUÇÃO, no estilo do repo (ver
 * `ai-fallback-and-test.contract.test.ts`, `_adv_edge_legacy_producers.test.ts`): cada caso
 * aponta a CHAMADA (`nome(` com os argumentos balanceados), a GUARDA que a autoriza ou o
 * bloco onde ela vive — nunca a mera presença de um símbolo no arquivo.
 *
 * Desenho congelado (.tmp/PLANO-BLOCO-04-PR3.md, seção "Interface CONGELADA" + "Semântica
 * obrigatória"): o que cada caso prova está dito no próprio caso.
 *
 * Além do contrato de fonte, a seção (6) exercita COMPORTAMENTO REAL dos dois módulos puros
 * (`ai-routing.ts` / `ai-capabilities.ts`) nos pontos que o despacho pressupõe — inclusive o
 * que o plano mediu como risco da migração (pedido com `tools` no pipeline de conversa).
 *
 * Import LAZY dos puros (dentro do caso): se algum módulo ainda não estiver no disco, cada
 * caso falha individualmente e não derruba a coleta do arquivo.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const CAMINHO_DESPACHO = 'supabase/functions/_shared/ai-generate.ts';
const AUSENTE = `ai-generate.ts ausente em ${CAMINHO_DESPACHO} (interface congelada em .tmp/PLANO-BLOCO-04-PR3.md)`;

/**
 * Remove comentários PRESERVANDO literais: o `//` de `https://` dentro de uma string não é
 * comentário — com um stripper ingênuo a URL do gateway ficaria invisível e a checagem
 * negativa passaria com o defeito de volta. Strings/templates são guardados antes e
 * restaurados depois; só o que é comentário de verdade desaparece.
 */
/* Sentinela ASCII: sem backslash e sem caractere de controle (o lint do repo reprova
 * `no-control-regex`; a sentinela nao aparece em fonte real). */
const SENTINELA = '@@LIT@@';
function semComentarios(fonte: string): string {
  const literais: string[] = [];
  const protegido = fonte
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, (literal) => {
      literais.push(literal);
      return `${SENTINELA}${literais.length - 1}${SENTINELA}`;
    })
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return protegido.replace(new RegExp(`${SENTINELA}([0-9]+)${SENTINELA}`, 'g'), (_, indice) => literais[Number(indice)]);
}

/** Troca strings/templates por um marcador — usado só antes de balancear parênteses. */
function semStrings(fonte: string): string {
  return fonte
    .replace(/`(?:[^`\\]|\\.)*`/g, '`S`')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, `'S'`)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '"S"');
}

let cache: string | null = null;

/** Fonte do despacho, sem comentários. '' quando o arquivo ainda não existe no disco. */
function fonte(): string {
  if (cache === null) {
    try {
      cache = semComentarios(readFileSync(resolve(ROOT, CAMINHO_DESPACHO), 'utf8'));
    } catch {
      cache = '';
    }
  }
  return cache;
}

/** Fonte para navegação estrutural (parênteses/chaves não são atrapalhados por literais). */
function fonteEstrutural(): string {
  return semStrings(fonte());
}

function contar(texto: string, re: RegExp): number {
  const global = re.global ? re : new RegExp(re.source, re.flags + 'g');
  return (texto.match(global) ?? []).length;
}

/**
 * Ausência de um defeito com mensagem legível: `expect(texto).not.toMatch(re)` despeja o
 * arquivo inteiro no relatório de falha, o que enterra a informação útil.
 */
function esperaAusencia(texto: string, padrao: RegExp, mensagem: string): void {
  expect(padrao.test(texto), mensagem).toBe(false);
}

/** Bloco balanceado `( ... )` a partir do `(` em `abre`. */
function blocoParenteses(texto: string, abre: number): string {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '(') nivel++;
    else if (ch === ')') {
      nivel--;
      if (nivel === 0) return texto.slice(abre, i + 1);
    }
  }
  return texto.slice(abre);
}

/** Bloco balanceado `{ ... }` a partir do primeiro `{` em/na frente de `inicio`. */
function blocoChaves(texto: string, inicio: number): string {
  const abre = texto.indexOf('{', inicio);
  if (abre < 0) return '';
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '{') nivel++;
    else if (ch === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(abre, i + 1);
    }
  }
  return texto.slice(abre);
}

/** Todas as chamadas `nome(...)` do fonte, já com os argumentos balanceados. */
function chamadas(texto: string, nome: string): string[] {
  const out: string[] = [];
  // Sem lookbehind para `.`: `...filterExtraBody(x)` é uma chamada legítima.
  const re = new RegExp(`(?<![\\w$])${nome}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    out.push(blocoParenteses(texto, texto.indexOf('(', m.index)));
  }
  return out;
}

/** Texto dos `largura` chars que ANTECEDEM a primeira ocorrência de `marca`. */
function antes(texto: string, marca: RegExp, largura = 300): string {
  const m = marca.exec(texto);
  if (!m) return '';
  return texto.slice(Math.max(0, m.index - largura), m.index);
}

/**
 * Corpo de `generateWithRouting`: pula a lista de parâmetros e pega o `{` que abre o corpo.
 * Se a assinatura declarar o retorno com objeto INLINE (chaves antes do corpo), a extração
 * devolve outra coisa — nesse caso medimos o MÓDULO INTEIRO, que é o pior caso mais rigoroso
 * (mais `return` contados), nunca mais frouxo.
 */
function corpoDoDespacho(): string {
  const src = fonteEstrutural();
  const m = /export\s+(?:async\s+)?function\s+generateWithRouting\s*\(/.exec(src);
  if (!m) return '';
  const fimParams = blocoParenteses(src, src.indexOf('(', m.index)).length + src.indexOf('(', m.index);
  const corpo = blocoChaves(src, fimParams);
  return /\breturn\b/.test(corpo) ? corpo : '';
}

/**
 * Nomes que REGISTRAM consumo neste módulo: `logAiUsage` e eventuais wrappers locais
 * (const/let/var/function cujo valor chama `logAiUsage`). O aceite é "nenhuma chamada paga
 * fica invisível", então a prova estrutural precisa contar o wrapper, não só o import.
 */
function nomesDeLog(): string[] {
  const src = fonteEstrutural();
  const nomes = new Set<string>(['logAiUsage']);
  const re = /(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/logAiUsage\s*\(/.test(src.slice(m.index, m.index + 1200))) nomes.add(m[1]);
  }
  return [...nomes];
}

/**
 * `logAiUsage(` no corpo de um WRAPPER local (`… => logAiUsage(`) não é um caminho de
 * retorno: é a definição. Sem esta distinção a contagem fica com 1 de folga e um caminho
 * de retorno sem log passaria (medido: mutação com um log removido passava).
 */
function logEhDefinicaoDeWrapper(corpo: string, indice: number): boolean {
  return corpo.slice(Math.max(0, indice - 160), indice).trimEnd().endsWith('=>');
}

/** Campos congelados de `GenerateParams` (.tmp/PLANO-BLOCO-04-PR3.md). */
const CAMPOS_GENERATE_PARAMS: readonly string[] = [
  'purpose',
  'functionName',
  'userId',
  'messages',
  'system',
  'need',
  'temperature',
  'tools',
  'toolChoice',
  'extraBody',
  'timeoutMs',
];

/** Campos congelados de `GenerateResult`. */
const CAMPOS_GENERATE_RESULT: readonly string[] = [
  'ok',
  'response',
  'data',
  'providerId',
  'providerName',
  'model',
  'durationMs',
  'status',
  'errorCode',
  'fallbackUsed',
];

/** Peças do roteamento central que NÃO podem ter cópia local no despacho. */
const PECAS_DO_ROTEAMENTO: readonly string[] = [
  'resolveProvider',
  'resolveModel',
  'composeMessages',
  'assertCapabilities',
  'filterExtraBody',
  'filterConfigBody',
  'filterHeaders',
];

/** Bloco da declaração `export interface/type NOME { ... }`. */
function declaracao(nome: string): string {
  const src = fonteEstrutural();
  const m = new RegExp(`export\\s+(?:interface|type)\\s+${nome}\\b`).exec(src);
  return m ? blocoChaves(src, m.index) : '';
}

describe('(1) interface congelada: o despacho existe com a forma do desenho', () => {
  it('o módulo existe no caminho congelado e exporta generateWithRouting', () => {
    expect(fonte().length, AUSENTE).toBeGreaterThan(800);
    expect(fonteEstrutural()).toMatch(/export\s+(?:async\s+)?function\s+generateWithRouting\s*\(/);
    expect(fonteEstrutural()).toMatch(/Promise\s*<\s*GenerateResult\s*>/);
    expect(declaracao('GenerateParams').length).toBeGreaterThan(0);
    expect(declaracao('GenerateResult').length).toBeGreaterThan(0);
  });

  it('GenerateParams carrega os 11 campos do desenho (lista pinada)', () => {
    const bloco = declaracao('GenerateParams');
    const faltando = CAMPOS_GENERATE_PARAMS.filter((campo) => !new RegExp(`\\b${campo}\\s*[?:]`).test(bloco));
    expect(faltando, `campos ausentes em GenerateParams: ${faltando.join(', ')}`).toEqual([]);
  });

  it('GenerateResult carrega os 10 campos do desenho (lista pinada)', () => {
    const bloco = declaracao('GenerateResult');
    const faltando = CAMPOS_GENERATE_RESULT.filter((campo) => !new RegExp(`\\b${campo}\\s*[?:]`).test(bloco));
    expect(faltando, `campos ausentes em GenerateResult: ${faltando.join(', ')}`).toEqual([]);
  });
});

describe('(2) o despacho usa as peças do roteamento central (e não as reimplementa)', () => {
  it('importa resolveProvider/resolveModel/composeMessages/filters de ./ai-routing.ts', () => {
    const m = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*ai-routing\.ts["']/.exec(fonte());
    expect(m, 'generateWithRouting precisa importar de ./ai-routing.ts').not.toBeNull();
    const especificadores = m![1];
    for (const peca of ['resolveProvider', 'resolveModel', 'composeMessages', 'filterExtraBody']) {
      expect(especificadores, `${peca} não é importado de ./ai-routing.ts`).toContain(peca);
    }
  });

  it('importa assertCapabilities de ./ai-capabilities.ts', () => {
    const m = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*ai-capabilities\.ts["']/.exec(fonte());
    expect(m, 'generateWithRouting precisa importar de ./ai-capabilities.ts').not.toBeNull();
    expect(m![1]).toContain('assertCapabilities');
  });

  it('não redefine localmente nenhuma peça do roteamento (uma única implementação)', () => {
    const copias = PECAS_DO_ROTEAMENTO.filter((peca) =>
      new RegExp(`(?:function|const|let|var)\\s+${peca}\\b`).test(fonte()),
    );
    expect(copias, `cópia local de peça do roteamento: ${copias.join(', ')}`).toEqual([]);
  });

  it('toma logAiUsage de ./ai-usage.ts (o registro de consumo continua sendo o mesmo)', () => {
    const m = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*ai-usage\.ts["']/.exec(fonte());
    expect(m, 'logAiUsage precisa vir de ./ai-usage.ts').not.toBeNull();
    expect(m![1]).toContain('logAiUsage');
  });
});

describe('(3) roteamento: finalidade, capacidades e modelo do servidor', () => {
  it('resolveProvider é chamado com a finalidade do chamador (purpose), nunca com literal', () => {
    const chamadasResolve = chamadas(fonteEstrutural(), 'resolveProvider');
    expect(chamadasResolve.length, 'o despacho precisa chamar resolveProvider').toBeGreaterThan(0);
    for (const args of chamadasResolve) {
      expect(args, `resolveProvider chamado sem a finalidade: ${args}`).toMatch(/\bpurpose\b/);
      expect(args, 'finalidade fixa em literal trocaria o roteamento do chamador').not.toMatch(
        /,\s*['"](?:copilot|analysis|summary|tagging|auto_reply)['"]/,
      );
    }
  });

  it('assertCapabilities só roda sob a guarda de `need` (sem need não inventa pedido)', () => {
    const src = fonteEstrutural();
    const chamadasCaps = chamadas(src, 'assertCapabilities');
    expect(chamadasCaps.length, 'o despacho precisa chamar assertCapabilities').toBeGreaterThan(0);
    for (const args of chamadasCaps) expect(args, 'assertCapabilities sem o pedido `need`').toMatch(/\bneed\b/);
    expect(antes(src, /assertCapabilities\s*\(/), 'assertCapabilities precisa estar sob `if (… need …)`').toMatch(
      /if\s*\([^)]*\bneed\b/,
    );
  });

  it('resolveModel recebe `null` como pedido do cliente (modelo decidido pelo servidor)', () => {
    const chamadasModel = chamadas(fonteEstrutural(), 'resolveModel');
    expect(chamadasModel.length, 'o despacho precisa chamar resolveModel').toBeGreaterThan(0);
    for (const args of chamadasModel) {
      expect(args, `resolveModel sem o pedido neutro (null): ${args}`).toMatch(/\bnull\b/);
    }
  });

  it('o módulo não lê `params.model` (o consumidor não escolhe modelo — IA-035)', () => {
    esperaAusencia(fonte(), /params\s*\.\s*model\b/, 'o despacho não pode ler o modelo pedido pelo cliente');
    esperaAusencia(fonte(), /\bmodelRequested\s*:\s*params\b/, 'modelo do chamador não entra no despacho');
  });

  it('composeMessages recebe o system do servidor (política fora das mensagens do cliente)', () => {
    const chamadasCompose = chamadas(fonteEstrutural(), 'composeMessages');
    expect(chamadasCompose.length, 'o despacho precisa chamar composeMessages').toBeGreaterThan(0);
    for (const args of chamadasCompose) expect(args).toMatch(/\bsystem\b/);
  });
});

describe('(4) despacho, filtros e teto de tempo', () => {
  it('carrega ai_providers do banco canônico com a service role', () => {
    expect(fonte()).toMatch(/from\(\s*["']ai_providers["']\s*\)/);
    expect(fonte()).toMatch(/select\(\s*["']\*["']\s*\)/);
    expect(fonte()).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('despacha pelos provider_types do desenho (lovable_ai/openai_compatible/google_gemini/custom_webhook)', () => {
    for (const tipo of ['lovable_ai', 'openai_compatible', 'google_gemini', 'custom_webhook']) {
      expect(fonte(), `provider_type ${tipo} sem caminho de chamada`).toContain(tipo);
    }
    for (const funcao of ['callLovableAI', 'callOpenAICompatible', 'callCustomWebhook']) {
      expect(chamadas(fonteEstrutural(), funcao).length, `${funcao} não é o caminho de despacho`).toBeGreaterThan(0);
    }
  });

  it('recusa custom_agent de forma explícita (falha de configuração, nunca um chute)', () => {
    const m = /custom_agent/.exec(fonte());
    expect(m, 'custom_agent precisa ser tratado explicitamente').not.toBeNull();
    const trecho = fonte().slice(m!.index, m!.index + 300);
    expect(trecho, 'custom_agent precisa falhar de forma explícita, sem endereço chutado').toMatch(
      /throw|ConfigError|errorCode|n[aã]o suportado|sem caminho/,
    );
  });

  it('aplica filterExtraBody ao extraBody do chamador (IA-038)', () => {
    const aplicacoes = chamadas(fonteEstrutural(), 'filterExtraBody');
    expect(aplicacoes.length, 'extraBody precisa passar por filterExtraBody').toBeGreaterThan(0);
    expect(
      aplicacoes.some((args) => /extraBody/.test(args)),
      `filterExtraBody não é aplicado ao extraBody do chamador: ${aplicacoes.join(' | ')}`,
    ).toBe(true);
    // Nenhum caminho pode espalhar o extraBody CRU: só o resultado do filtro.
    esperaAusencia(
      fonte(),
      /\.\.\.\s*(?:params|args|input|request)\s*\.\s*extraBody/,
      'extraBody cru no corpo enviado ao provedor (só o filtrado pode viajar)',
    );
  });

  it('usa withRetry e um teto de tempo com padrão de 30s', () => {
    const m = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*ai-providers\.ts["']/.exec(fonte());
    expect(m, 'o despacho precisa reusar ./ai-providers.ts').not.toBeNull();
    expect(m![1]).toContain('withRetry');
    expect(chamadas(fonteEstrutural(), 'withRetry').length).toBeGreaterThan(0);
    expect(fonte()).toMatch(/30[_]?000/);
    expect(fonte()).toMatch(/\btimeoutMs\b/);
  });

  it('não fixa endereço do gateway nem outro destino: o endereço vem da linha do provedor', () => {
    esperaAusencia(fonte(), /ai\.gateway\.lovable\.dev/, 'endereço do gateway antigo fixado no despacho');
    // Único URL tolerado é o import do client Supabase; qualquer outro host fixo é destino chutado.
    const semEsm = fonte().replace(/https:\/\/esm\.sh\/[^\s"']+/g, 'URL');
    esperaAusencia(semEsm, /https?:\/\//, 'endereço fixo de provedor no despacho central');
    expect(fonte()).toContain('api_endpoint');
  });

  it('LOVABLE_API_KEY só entra pelo ramo do provider_type lovable_ai (o gateway é do banco)', () => {
    const src = fonte();
    const re = /LOVABLE_API_KEY/g;
    let m: RegExpExecArray | null;
    let ocorrencias = 0;
    while ((m = re.exec(src)) !== null) {
      ocorrencias += 1;
      const antes_ = src.slice(Math.max(0, m.index - 500), m.index);
      expect(antes_, 'LOVABLE_API_KEY fora do ramo `case "lovable_ai"`').toMatch(/lovable_ai/);
    }
    expect(ocorrencias, 'LOVABLE_API_KEY só pode existir no ramo lovable_ai').toBeLessThanOrEqual(1);
  });

  it('não existe modelo de provedor hardcoded no módulo novo', () => {
    esperaAusencia(fonte(), /google\/gemini-3-flash-preview/, 'modelo de provedor fixado no despacho');
    esperaAusencia(fonte(), /\bmodel\s*:\s*["'][^"']+["']/, 'literal de modelo no corpo do despacho');
  });

  it('não importa callAiWithTracking (o gateway antigo não entra pelo despacho)', () => {
    esperaAusencia(fonte(), /callAiWithTracking/, 'o despacho central não pode usar o wrapper do gateway antigo');
  });
});

describe('(5) auditoria e desfecho (nenhuma chamada paga invisível)', () => {
  it('o log de consumo carrega os campos e o metadata do aceite (chaves pinadas)', () => {
    const args = chamadas(fonteEstrutural(), 'logAiUsage').join(' ');
    expect(args, 'logAiUsage precisa receber o desfecho').toMatch(/\bfunctionName\b/);
    expect(args).toMatch(/\bstatus\b/);
    expect(args).toMatch(/\bmetadata\b/);
    expect(args).toMatch(/\bdurationMs\b/);
    for (const chave of ['purpose', 'provider_id', 'provider_name', 'model_substituted']) {
      expect(fonte(), `metadata sem a chave ${chave}`).toContain(chave);
    }
  });

  it('logAiUsage cobre TODOS os caminhos de retorno (logs >= retornos)', () => {
    const corpo = corpoDoDespacho() || fonteEstrutural();
    const retornos = contar(corpo, /return\s+(?:(?:await\s+)?[A-Za-z_$]|\{|\[)/g);
    const nomes = nomesDeLog();
    const wrappers = nomes.filter((nome) => nome !== 'logAiUsage');

    // Contam como log de CHAMADA: (a) chamadas aos wrappers locais e (b) `logAiUsage(` que
    // NÃO seja o corpo de um wrapper — a definição do wrapper não é caminho de retorno.
    const diretos = Array.from(corpo.matchAll(/\blogAiUsage\s*\(/g)).filter(
      (ocorrencia) => !logEhDefinicaoDeWrapper(corpo, ocorrencia.index),
    ).length;
    const viaWrapper = wrappers.reduce(
      (total, nome) => total + contar(corpo, new RegExp(`(?<![\\w$.])${nome}\\s*\\(`, 'g')),
      0,
    );
    const logs = diretos + viaWrapper;
    // Alternativa igualmente forte: log num `finally` cobre toda saída da função.
    const logNoFinally = /finally\s*\{[\s\S]{0,600}?logAiUsage\s*\(/.test(corpo);

    expect(logs, `nenhum log de consumo no despacho (nomes de log: ${nomes.join(', ')})`).toBeGreaterThan(0);
    expect(retornos, 'o despacho precisa ter caminhos de retorno').toBeGreaterThan(0);
    expect(
      logNoFinally || logs >= retornos,
      `caminho de retorno SEM registro de consumo: retornos=${retornos}, logs=${logs} ` +
        `(diretos=${diretos}, via wrapper=${viaWrapper}; nomes: ${nomes.join(', ')})`,
    ).toBe(true);
  });

  it('o desfecho de ERRO também registra consumo (erro HTTP, exceção, roteamento)', () => {
    expect(contar(fonte(), /status\s*:\s*["']error["']/g)).toBeGreaterThanOrEqual(3);
    expect(fonte()).toMatch(/["']success["']/);
    const marca = /(?:if|else\s+if)\s*\(\s*!\s*response\.ok\s*\)/.exec(fonteEstrutural());
    expect(marca, 'o caminho de erro HTTP precisa existir no despacho').not.toBeNull();
    const blocoHttp = blocoChaves(fonteEstrutural(), marca!.index);
    const nomes = nomesDeLog();
    expect(
      nomes.some((nome) => blocoHttp.includes(`${nome}(`)),
      'erro HTTP devolvido sem registrar consumo',
    ).toBe(true);
  });

  it('erros de roteamento e de capacidade são capturados e devolvidos como falha (não lançam)', () => {
    for (const erro of ['AiRoutingError', 'AiCapabilityError']) {
      const m = new RegExp(`instanceof\\s+${erro}`).exec(fonteEstrutural());
      expect(m, `${erro} precisa ser classificado, não propagado`).not.toBeNull();
      expect(antes(fonteEstrutural(), new RegExp(`instanceof\\s+${erro}`), 400), `${erro} fora de um catch`).toMatch(
        /catch\s*\(/,
      );
    }
  });

  it('os status HTTP do desenho estão mapeados (503/409/400)', () => {
    for (const status of ['503', '409', '400']) {
      expect(fonte(), `status ${status} do desenho ausente`).toMatch(new RegExp(`\\b${status}\\b`));
    }
  });

  it('data é o JSON do provedor e vira null quando a resposta não é JSON', () => {
    expect(fonte()).toMatch(/\.json\(\)/);
    expect(fonte()).toMatch(/data\s*[:=][^;]{0,80}null/);
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (6) comportamento puro que o despacho pressupõe (módulos importáveis, sem rede)          */
/* ---------------------------------------------------------------------------------------- */

type AiProviderRow = {
  id: string;
  name: string;
  provider_type: string;
  api_endpoint: string | null;
  api_key_secret_name: string | null;
  model: string | null;
  system_prompt: string | null;
  config: Record<string, unknown> | null;
  is_active: boolean;
  is_default: boolean;
  use_for: string[] | null;
};

interface ModuloRoteamento {
  resolveProvider: (rows: AiProviderRow[], purpose: string, providerId?: string | null) => AiProviderRow;
  resolveModel: (
    provider: AiProviderRow,
    requested?: string | null,
  ) => { model: string | null; modelRequested: string | null; modelSubstituted: boolean };
  composeMessages: (
    system: string | null,
    messages: Array<{ role: string; content: string }>,
  ) => Array<{ role: string; content: string }>;
  filterExtraBody: (extra: unknown) => Record<string, unknown>;
}

interface ModuloCapacidades {
  assertCapabilities: (provider: AiProviderRow, need: Record<string, unknown>) => unknown;
  AiCapabilityError: new (code: string, message?: string) => Error & { readonly code: string };
}

let cacheRoteamento: ModuloRoteamento | null = null;
let cacheCapacidades: ModuloCapacidades | null = null;

async function roteamento(): Promise<ModuloRoteamento> {
  if (!cacheRoteamento) {
    try {
      cacheRoteamento = (await import(
        '../../supabase/functions/_shared/ai-routing.ts'
      )) as unknown as ModuloRoteamento;
    } catch (erro) {
      throw new Error(
        'ai-routing.ts não importável (módulo puro do desenho de PR-1/PR-3): ' +
          (erro instanceof Error ? erro.message : String(erro)),
      );
    }
  }
  return cacheRoteamento;
}

async function capacidades(): Promise<ModuloCapacidades> {
  if (!cacheCapacidades) {
    try {
      cacheCapacidades = (await import(
        '../../supabase/functions/_shared/ai-capabilities.ts'
      )) as unknown as ModuloCapacidades;
    } catch (erro) {
      throw new Error(
        'ai-capabilities.ts não importável (módulo puro do desenho de PR-2): ' +
          (erro instanceof Error ? erro.message : String(erro)),
      );
    }
  }
  return cacheCapacidades;
}

/** As 5 finalidades do banco (`use_for`) — nada além delas é finalidade válida. */
const FINALIDADES: readonly string[] = ['copilot', 'analysis', 'summary', 'tagging', 'auto_reply'];

/**
 * Inventário MEDIDO de `ai_providers` (leitura read-only do ambiente): 4 linhas, TODAS com
 * `use_for` das 5 finalidades, e só o DeepSeek é padrão. É esse retrato que faz
 * `resolveProvider` resolver pelo padrão em vez de cair em AMBIGUOUS_PROVIDER.
 */
function linhasDeProvedores(): AiProviderRow[] {
  const base = {
    api_endpoint: null,
    api_key_secret_name: null,
    system_prompt: null,
    config: null,
    is_active: true,
    use_for: [...FINALIDADES],
  };
  return [
    { ...base, id: 'p-deepseek', name: 'DeepSeek', provider_type: 'openai_compatible', model: 'deepseek-chat', is_default: true },
    { ...base, id: 'p-openai', name: 'OpenAI', provider_type: 'openai_compatible', model: 'gpt-4o', is_default: false },
    { ...base, id: 'p-gemini', name: 'Gemini', provider_type: 'google_gemini', model: 'gemini-2.0-flash', is_default: false },
    { ...base, id: 'p-lovable', name: 'Lovable', provider_type: 'lovable_ai', model: 'google/gemini-3-flash-preview', is_default: false },
  ];
}

describe('(6) comportamento puro que o despacho pressupõe', () => {
  it('resolveProvider resolve o provedor PADRÃO da finalidade (só o DeepSeek é padrão)', async () => {
    const { resolveProvider } = await roteamento();
    const linhas = linhasDeProvedores();
    for (const finalidade of FINALIDADES) {
      expect(resolveProvider(linhas, finalidade).id, `finalidade ${finalidade}`).toBe('p-deepseek');
    }
  });

  it('assertCapabilities aceita `tools` em openai_compatible (o pipeline de conversa não quebra)', async () => {
    const { assertCapabilities } = await capacidades();
    const alvo = linhasDeProvedores().find((linha) => linha.id === 'p-deepseek')!;
    expect(() => assertCapabilities(alvo, { features: ['tools'] })).not.toThrow();
  });

  it('assertCapabilities recusa `tools` em custom_webhook (UNSUPPORTED_FEATURE)', async () => {
    const { assertCapabilities, AiCapabilityError } = await capacidades();
    const alvo: AiProviderRow = {
      ...linhasDeProvedores()[0],
      id: 'p-webhook',
      name: 'Webhook',
      provider_type: 'custom_webhook',
      is_default: true,
    };
    let capturado: (Error & { readonly code: string }) | null = null;
    try {
      assertCapabilities(alvo, { features: ['tools'] });
    } catch (erro) {
      capturado = erro as Error & { readonly code: string };
    }
    expect(capturado, 'tools não é garantido em custom_webhook').toBeInstanceOf(AiCapabilityError);
    expect(capturado!.code).toBe('UNSUPPORTED_FEATURE');
  });

  it('filterExtraBody descarta as chaves reservadas (case-insensitive) e mantém o resto', async () => {
    const { filterExtraBody } = await roteamento();
    const filtrado = filterExtraBody({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'oi' }],
      Model: 'outro',
      Messages: [],
      system: 'política do cliente',
      tools: [],
      tool_choice: { type: 'function' },
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' },
    });
    expect(filtrado).toEqual({
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' },
    });
  });

  it('composeMessages põe a política na posição 0 sem mutar as mensagens do cliente', async () => {
    const { composeMessages } = await roteamento();
    const doCliente = [
      { role: 'system', content: 'system do cliente (fica onde está)' },
      { role: 'user', content: 'oi' },
    ];
    const composto = composeMessages('POLÍTICA DO SERVIDOR', doCliente);
    expect(composto).toEqual([
      { role: 'system', content: 'POLÍTICA DO SERVIDOR' },
      { role: 'system', content: 'system do cliente (fica onde está)' },
      { role: 'user', content: 'oi' },
    ]);
    expect(doCliente).toHaveLength(2);
    expect(doCliente[0].content).toBe('system do cliente (fica onde está)');
    expect(composeMessages(null, doCliente)).toEqual(doCliente);
  });

  it('resolveModel(provider, null) descarta o modelo fixo legado dos consumidores (IA-035)', async () => {
    const { resolveModel } = await roteamento();
    const deepseek = linhasDeProvedores().find((linha) => linha.id === 'p-deepseek')!;
    expect(resolveModel(deepseek, null)).toEqual({
      model: 'deepseek-chat',
      modelRequested: null,
      modelSubstituted: false,
    });
    const pedido = resolveModel(deepseek, 'google/gemini-3-flash-preview');
    expect(pedido.model, 'o modelo fixo antigo não pode vencer o do servidor').toBe('deepseek-chat');
    expect(pedido.modelSubstituted).toBe(true);
  });
});
