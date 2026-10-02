/**
 * IA-051 — correlação de execução no CAMINHO SÍNCRONO (o clique do usuário).
 *
 * Por que este arquivo existe: a metade da FILA já está fechada e provada
 * (`ai-jobs-worker/index.ts` liga `job_id`/`attempt`, com guarda própria). O
 * caminho síncrono é o outro: o `requestId` que a IA-048 gera a cada clique
 * existia no cliente, o schema do servidor já o aceitava e o servidor já o
 * devolvia no corpo — mas NINGUÉM o gravava no log de consumo. O resultado era
 * uma linha em `ai_usage_logs` dizendo quanto foi gasto e não de qual clique.
 *
 * A fiação atravessa quatro arquivos de cada lado e morre EM SILÊNCIO se
 * alguém a desfizer: o campo some do corpo, o log continua sendo gravado e a
 * correlação simplesmente para de existir. Onde o zod descarta chave
 * desconhecida (comportamento decidido na IA-048), um campo que deixa de ser
 * enviado NÃO dá erro — por isso a guarda é de origem: lê o código.
 *
 * LIMITE DECLARADO: isto é uma guarda de origem (lê o texto), não prova de
 * comportamento. A prova de runtime exigiria provedor real e credencial de
 * banco, que este ambiente não tem — declarada como limitação no corpo do PR.
 * O canal em si (normalização, recusa de PII, gravação) tem prova de
 * comportamento em `supabase/functions/_shared/ai-usage.test.ts`.
 *
 * Fica em `tests/contracts/` de propósito: a varredura do ratchet
 * `_adv_edge_legacy_producers.test.ts` conta os `.ts` de `supabase/functions/`,
 * e um arquivo de teste ali mudaria a contagem pinada sem necessidade.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function ler(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Trecho do fonte entre `inicio` e o primeiro `fim` que vier depois dele. */
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  if (i < 0) return '';
  const j = fonte.indexOf(fim, i + inicio.length);
  return j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length);
}

/** TODOS os trechos entre `inicio` e o `fim` seguinte (para arquivos com mais de uma chamada). */
function blocos(fonte: string, inicio: string, fim: string): string[] {
  const out: string[] = [];
  let i = fonte.indexOf(inicio);
  while (i >= 0) {
    const j = fonte.indexOf(fim, i + inicio.length);
    out.push(j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length));
    i = fonte.indexOf(inicio, i + inicio.length);
  }
  return out;
}

const ID_NO_CLIENTE = 'requestId: request.requestId';

/** Cliques do inbox e a função que cada um chama. */
const CLIENTES: Array<[string, string]> = [
  ['src/components/inbox/AISuggestions.tsx', 'ai-suggest-reply'],
  ['src/components/inbox/AIConversationAssistant.tsx', 'ai-conversation-analysis'],
  ['src/components/inbox/ConversationSummary.tsx', 'ai-conversation-summary'],
];

describe('(IA-051) o id do clique chega ao log de consumo — caminho síncrono', () => {
  it('cada clique do inbox manda o `requestId` no corpo da chamada', () => {
    for (const [arquivo, funcao] of CLIENTES) {
      const fonte = ler(arquivo);
      const corpo = trecho(fonte, `functions.invoke('${funcao}'`, '});');
      expect(corpo, arquivo + ': não achei a chamada de ' + funcao).not.toBe('');
      expect(corpo, `${arquivo}: a chamada de ${funcao} não envia o requestId`).toContain(ID_NO_CLIENTE);
    }
  });

  it('o detector de objeções manda o `requestId` nas DUAS chamadas do ai-proxy', () => {
    const fonte = ler('src/hooks/inbox/useObjectionDetector.ts');
    const chamadas = blocos(fonte, "functions.invoke('ai-proxy'", '});');
    expect(chamadas, 'useObjectionDetector.ts: esperava 2 chamadas do ai-proxy').toHaveLength(2);
    for (const chamada of chamadas) {
      expect(chamada, 'useObjectionDetector.ts: chamada do ai-proxy sem requestId').toContain(ID_NO_CLIENTE);
    }
  });

  it('o roteador/pipeline do servidor repassa o `requestId` que recebeu do corpo', () => {
    const destinos: Array<[string, string]> = [
      ['supabase/functions/ai-suggest-reply/index.ts', 'generateWithRouting({'],
      ['supabase/functions/_shared/ai-conversation-pipeline.ts', 'generateWithRouting({'],
      ['supabase/functions/ai-conversation-analysis/index.ts', 'requestConversationModelJson({'],
      ['supabase/functions/ai-conversation-summary/index.ts', 'requestConversationModelJson({'],
    ];
    for (const [arquivo, chamada] of destinos) {
      const bloco = trecho(ler(arquivo), chamada, '});');
      expect(bloco, `${arquivo}: não achei a chamada de ${chamada}`).not.toBe('');
      expect(bloco, `${arquivo}: recebe o requestId e o descarta antes do log`).toContain('requestId');
    }
  });

  it('o `ai-proxy` grava o `requestId` nas duas saídas de log (erro e sucesso)', () => {
    const fonte = ler('supabase/functions/ai-proxy/index.ts');
    const logs = blocos(fonte, 'logAiUsageDetached({', '});');
    expect(logs, 'ai-proxy: esperava 2 chamadas de logAiUsageDetached').toHaveLength(2);
    for (const bloco of logs) {
      expect(bloco, 'ai-proxy: log sem requestId (o gasto volta a ser órfão)').toContain('requestId');
    }
  });

  it('o `requestId` NÃO é enviado junto de dado pessoal como identificador', () => {
    // O corpo carrega `contactId` por conta da IA-048 (descarte de resposta), mas
    // o identificador de LOG é o uuid. Este teste falha se alguém trocar a
    // correlação por algo derivado do contato — o que a etapa proíbe.
    for (const [arquivo] of CLIENTES) {
      const corpo = trecho(ler(arquivo), 'functions.invoke(', '});');
      expect(corpo, `${arquivo}: correlationId não pode vir do contato`).not.toContain(
        'requestId: contactId',
      );
      expect(corpo, `${arquivo}: correlationId não pode vir do contato`).not.toMatch(
        /requestId:\s*(contactName|contactPhone|phone)/,
      );
    }
  });
});
