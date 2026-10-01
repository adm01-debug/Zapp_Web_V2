/**
 * RATCHET DO ACEITE do IA-032 — "trocar o provedor da finalidade altera todas as chamadas
 * abrangidas, SEM DEPENDER DO GATEWAY ANTIGO" (Bloco 04 / PR-3).
 *
 * O gateway antigo tem duas assinaturas no código:
 *   (a) `callAiWithTracking` (`_shared/ai-usage.ts`: URL fixa do Lovable embutida, sem
 *       roteamento por finalidade) — é o wrapper que os 6 consumidores usavam;
 *   (b) a URL `https://ai.gateway.lovable.dev/v1/chat/completions` escrita no código.
 *
 * Este arquivo varre `supabase/functions/**` INTEIRO (recursivo, como
 * `_adv_edge_legacy_producers.test.ts` faz) e falha se qualquer arquivo de PRODUÇÃO
 * (isto é: fora de `supabase/functions/**\/*.test.ts`) referenciar (a) fora do próprio lar
 * `_shared/ai-usage.ts`, ou (b) em qualquer lugar.
 *
 * Duas armadilhas medidas, e como são evitadas aqui:
 *  1. comentário e LITERAL: em `fetch("https://ai.gateway.lovable.dev/…")` o `//` está DENTRO
 *     de uma string. Um stripper de comentários ingênuo (que apaga do primeiro `//` até o fim
 *     da linha) engole a URL e o ratchet passaria com o defeito de volta. Por isso os literais
 *     são protegidos antes de remover comentários (mutação MUT2 da prova em
 *     .tmp/prova-mutacao-ai-generate.mjs).
 *  2. `ai-providers.ts` é o DESPACHANTE legítimo do `provider_type` `lovable_ai` (item 7 do
 *     desenho congelado): o endereço do gateway entra por lá quando — e só quando — o banco
 *     resolve um provedor `lovable_ai`. Por isso ele aparece no inventário esperado; a regra
 *     do aceite é sobre os consumidores, não sobre o adaptador que o próprio desenho manda
 *     reusar. Mesmo assim, a lista é EXPLÍCITA: qualquer arquivo novo que encoste no gateway
 *     falha e obriga a decisão a passar por revisão.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const EDGE = resolve(ROOT, 'supabase/functions');

/** Caminho relativo à raiz do repositório (é a chave legível nos relatórios). */
const rel = (absoluto: string) => absoluto.slice(ROOT.length + 1);

/**
 * Remove comentários PRESERVANDO literais (ver armadilha 1 no cabeçalho): o `//` de
 * `https://` dentro de uma string não é comentário.
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

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = resolve(dir, entrada);
    if (statSync(completo).isDirectory()) out.push(...tsFiles(completo));
    else if (completo.endsWith('.ts')) out.push(completo);
  }
  return out.sort();
}

const ARQUIVOS = tsFiles(EDGE);
// Arquivos de TESTE não são produção: podem citar os literais do defeito para documentá-lo.
const PRODUCAO = ARQUIVOS.filter((arquivo) => !arquivo.endsWith('.test.ts'));

/** Fonte de produção sem comentários, lida uma vez por arquivo. */
const FONTES = new Map<string, string>(PRODUCAO.map((arquivo) => [rel(arquivo), semComentarios(readFileSync(arquivo, 'utf8'))]));

function comReferencia(padrao: RegExp): string[] {
  return Array.from(FONTES.entries()).filter(([, fonte]) => padrao.test(fonte)).map(([caminho]) => caminho);
}

/**
 * Ausência de um defeito com mensagem legível: `expect(fonte).not.toMatch(re)` despeja o
 * arquivo inteiro no relatório e enterra a lista de infratores, que é a informação útil.
 */
function esperaAusencia(fonte: string, padrao: RegExp, mensagem: string): void {
  expect(padrao.test(fonte), mensagem).toBe(false);
}

/** Bloco balanceado `( ... )` a partir do `(` em `abre`. */
function blocoParenteses(texto: string, abre: number): string {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '(') nivel++;
    else if (texto[i] === ')') {
      nivel--;
      if (nivel === 0) return texto.slice(abre, i + 1);
    }
  }
  return texto.slice(abre);
}

/** Chamadas `nome(...)` de um fonte, com os argumentos balanceados. */
function chamadas(fonte: string, nome: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?<![\\w$])${nome}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte)) !== null) out.push(blocoParenteses(fonte, fonte.indexOf('(', m.index)));
  return out;
}

/* ---------------------------------------------------------------------------------------- */
/* Escopo do aceite: os 6 consumidores migrados (5 arquivos — o pipeline serve resumo e      */
/* análise) e as 2 capacidades de conversa que ele atende.                                   */
/* ---------------------------------------------------------------------------------------- */

const CONSUMIDORES_MIGRADOS: readonly string[] = [
  'supabase/functions/chatbot-l1/index.ts',
  'supabase/functions/ai-auto-tag/index.ts',
  'supabase/functions/ai-suggest-reply/index.ts',
  'supabase/functions/ai-enhance-message/index.ts',
  'supabase/functions/_shared/ai-conversation-pipeline.ts',
];

/** As duas capacidades servidas pelo pipeline (fazem par com `ai-conversation-summary/analysis`). */
const CAPACIDADES_DE_CONVERSA: readonly string[] = [
  'supabase/functions/ai-conversation-summary/index.ts',
  'supabase/functions/ai-conversation-analysis/index.ts',
];

/**
 * Dívida declarada do IA-033: arquivos que ainda falam com o gateway antigo por `fetch`
 * direto. Entram como BASELINE explícito, não como exceção permanente: o IA-033 os migra
 * e esta lista volta a zero.
 *
 * Neste PR (IA-033 parte 1: VISÃO) a dívida ENCOLHEU DE 4 PARA 2: `classify-sticker` e
 * `classify-emoji` foram migrados para o despacho central com `need.modality:'vision'`
 * (contrato anti-regressão no describe (3) deste arquivo). Os 2 restantes continuam
 * declarados aqui — voz/áudio e o classificador de meme de áudio — e qualquer arquivo
 * NOVO que encoste no endereço fixo falha o teste (a lista é a única allowlist).
 */
const DIVIDA_IA_033: readonly string[] = [
  'supabase/functions/voice-agent/index.ts',
  'supabase/functions/classify-audio-meme/index.ts',
];

/** Despacho legítimo do `provider_type` lovable_ai (item 7 do desenho): só entra por provedor do banco. */
const DESPACHANTE_LOVABLE_AI = 'supabase/functions/_shared/ai-providers.ts';

/**
 * Rótulos de RELATÓRIO (não são exceções: a asserção continua exigindo lista vazia). Serve
 * para que o vermelho diga de quem é cada pendência, em vez de só acusar "alguém".
 */
const PAPEL_NO_INVENTARIO: ReadonlyMap<string, string> = new Map([
  [
    'supabase/functions/_shared/ai-providers.ts',
    'despachante do provider_type lovable_ai (item 7 do desenho: só entra por provedor do banco)',
  ],
  ['supabase/functions/voice-agent/index.ts', 'fora do escopo do IA-032 — dívida do IA-033 (voz/áudio)'],
  ['supabase/functions/classify-audio-meme/index.ts', 'fora do escopo do IA-032 — dívida do IA-033 (classificador de áudio)'],
  ['supabase/functions/classify-emoji/index.ts', 'migrado no IA-033 parte 1 (visão) — REINCIDÊNCIA no gateway fixo'],
  ['supabase/functions/classify-sticker/index.ts', 'migrado no IA-033 parte 1 (visão) — REINCIDÊNCIA no gateway fixo'],
]);

/** Lista de infratores legível: caminho + papel do que sobrou. */
function relatar(infratores: string[]): string {
  if (infratores.length === 0) return 'nenhum';
  return infratores
    .map(
      (caminho) =>
        `\n  - ${caminho}${PAPEL_NO_INVENTARIO.has(caminho) ? ` [${PAPEL_NO_INVENTARIO.get(caminho)}]` : ' [NOVO: fora do inventário conhecido]'}`,
    )
    .join('');
}

describe('(1) o gateway antigo não é referenciado por nenhum produtor', () => {
  it('callAiWithTracking não existe em lugar nenhum (o wrapper do gateway antigo foi removido)', () => {
    const infratores = comReferencia(/\bcallAiWithTracking\b/);
    expect(
      infratores,
      `ainda existe referência ao wrapper do gateway antigo:${relatar(infratores)}`,
    ).toEqual([]);
  });

  it('a URL ai.gateway.lovable.dev só aparece no despachante do lovable_ai e na dívida declarada do IA-033', () => {
    const infratores = comReferencia(/ai\.gateway\.lovable\.dev/).filter(
      (caminho) => caminho !== DESPACHANTE_LOVABLE_AI && !DIVIDA_IA_033.includes(caminho),
    );
    expect(
      infratores,
      `arquivo de produção com o endereço fixo do gateway antigo:${relatar(infratores)}`,
    ).toEqual([]);
  });
});

describe('(2) os 6 consumidores do aceite usam o despacho central', () => {
  it('os 5 arquivos importam de ai-generate.ts', () => {
    for (const caminho of CONSUMIDORES_MIGRADOS) {
      const fonte = FONTES.get(caminho);
      expect(fonte, `arquivo do aceite ausente: ${caminho}`).toBeDefined();
      expect(fonte, `${caminho} não importa de ai-generate.ts`).toMatch(
        /from\s*["'][^"']*ai-generate\.ts["']/,
      );
      expect(fonte, `${caminho} importa de ai-generate.ts mas não o despacho central`).toContain(
        'generateWithRouting',
      );
    }
  });

  it('os 5 arquivos CHAMAM generateWithRouting (import morto não conta)', () => {
    for (const caminho of CONSUMIDORES_MIGRADOS) {
      const fonte = FONTES.get(caminho)!;
      expect(chamadas(fonte, 'generateWithRouting').length, `${caminho} só importa, não chama`).toBeGreaterThan(0);
    }
  });

  it('nenhuma chamada a generateWithRouting passa apiKey (a credencial é resolvida no servidor)', () => {
    for (const caminho of CONSUMIDORES_MIGRADOS) {
      for (const args of chamadas(FONTES.get(caminho)!, 'generateWithRouting')) {
        expect(args, `${caminho}: generateWithRouting não aceita apiKey (interface congelada)`).not.toMatch(
          /\bapiKey\b/,
        );
      }
    }
  });

  it('nenhum dos 5 voltou a fixar o modelo do provedor (google/gemini-3-flash-preview)', () => {
    for (const caminho of CONSUMIDORES_MIGRADOS) {
      esperaAusencia(FONTES.get(caminho)!, /google\/gemini-3-flash-preview/, `${caminho} fixa o modelo do provedor de novo`);
    }
  });

  it('nenhum dos 5 carrega LOVABLE_API_KEY (a chave do gateway antigo sai do consumidor)', () => {
    for (const caminho of CONSUMIDORES_MIGRADOS) {
      esperaAusencia(FONTES.get(caminho)!, /\bLOVABLE_API_KEY\b/, `${caminho} ainda carrega a chave do gateway antigo`);
    }
  });

  it('as duas capacidades de conversa não carregam mais a credencial nem o wrapper antigos', () => {
    for (const caminho of CAPACIDADES_DE_CONVERSA) {
      const fonte = FONTES.get(caminho);
      expect(fonte, `arquivo do aceite ausente: ${caminho}`).toBeDefined();
      esperaAusencia(fonte!, /\bLOVABLE_API_KEY\b/, `${caminho} ainda carrega a chave do gateway antigo`);
      esperaAusencia(fonte!, /\bcallAiWithTracking\b/, `${caminho} ainda referencia o wrapper do gateway antigo`);
    }
  });

  it('_shared/ai-usage.ts continua exportando o registro de consumo (o aceite não se cumpre apagando a auditoria)', () => {
    const fonte = FONTES.get('supabase/functions/_shared/ai-usage.ts');
    expect(fonte).toBeDefined();
    expect(fonte, 'logAiUsage precisa continuar existindo').toMatch(/export\s+async\s+function\s+logAiUsage\s*\(/);
    expect(fonte, 'extractTokenUsage precisa continuar existindo').toMatch(
      /export\s+function\s+extractTokenUsage\s*\(/,
    );
  });
});

/* ---------------------------------------------------------------------------------------- */
/* (3) Escopo desta rodada (IA-033, parte 1 — VISÃO) e o contrato ANTI-REGRESSÃO.             */
/* Os 2 classificadores deixaram o `fetch` fixo e passaram a exigir a modalidade `vision`     */
/* pelo despacho central. As asserções abaixo são o contrato de que a migração não volta     */
/* atrás: qualquer um dos dois que volte ao gateway fixo, ao modelo fixo, à chave antiga,    */
/* que perca a exigência de visão OU a degradação para `outros` fica vermelho.                */
/* ---------------------------------------------------------------------------------------- */

const MIGRADOS_PARA_VISAO: readonly string[] = [
  'supabase/functions/classify-sticker/index.ts',
  'supabase/functions/classify-emoji/index.ts',
];

/** `{ category: 'outros' }` — a degradação que impede erro de provedor de virar 500. */
const CATEGORIA_NEUTRA = /category\s*:\s*['"]outros['"]/g;

describe('(3) os 2 classificadores de visão (IA-033 parte 1) usam o despacho central', () => {
  it('os 2 CHAMAM generateWithRouting (import morto não conta)', () => {
    for (const caminho of MIGRADOS_PARA_VISAO) {
      const fonte = FONTES.get(caminho);
      expect(fonte, `arquivo migrado ausente: ${caminho}`).toBeDefined();
      expect(
        chamadas(fonte!, 'generateWithRouting').length,
        `${caminho} não chama generateWithRouting (voltou ao fetch direto ao gateway?)`,
      ).toBeGreaterThan(0);
    }
  });

  it('nenhum dos 2 cita lovable, o modelo fixo antigo nem LOVABLE_API_KEY', () => {
    for (const caminho of MIGRADOS_PARA_VISAO) {
      const fonte = FONTES.get(caminho)!;
      esperaAusencia(fonte, /lovable/i, `${caminho} ainda cita o gateway/fornecedor antigo`);
      esperaAusencia(fonte, /gemini-2\.5-flash-lite/, `${caminho} fixa o modelo antigo de novo`);
      esperaAusencia(fonte, /\bLOVABLE_API_KEY\b/, `${caminho} ainda carrega a chave do gateway antigo`);
    }
  });

  it('os 2 exigem a modalidade de visão (sem need.modality a chamada cairia no texto)', () => {
    for (const caminho of MIGRADOS_PARA_VISAO) {
      const comVisao = chamadas(FONTES.get(caminho)!, 'generateWithRouting').filter((args) =>
        /modality\s*:\s*['"]vision['"]/.test(args),
      );
      expect(
        comVisao.length,
        `${caminho} chama generateWithRouting sem exigir need.modality:'vision'`,
      ).toBeGreaterThan(0);
    }
  });

  it("os 2 preservam a degradação para 'outros' (falha do provedor não vira 500)", () => {
    for (const caminho of MIGRADOS_PARA_VISAO) {
      const fonte = FONTES.get(caminho)!;
      const ocorrencias = fonte.match(CATEGORIA_NEUTRA)?.length ?? 0;
      // Entrada vazia/sem imagem E o catch de exceção: sem as duas, um erro de provedor vira 500.
      expect(
        ocorrencias,
        `${caminho} perdeu a degradação para 'outros' (esperado >= 2, achou ${ocorrencias})`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
