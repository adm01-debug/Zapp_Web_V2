/**
 * Guarda de contrato front → Edge `evolution-api`.
 *
 * O #2054 apagou do roteador rotas que o front ainda chamava (find-status-messages,
 * get-settings, set-settings, get-webhook, mark-unread…): em produção viraram
 * 404 "Unknown action" (admin) ou 403 (agente), e nenhum teste acusou porque a
 * lista de ações do roteador usada nos testes era colada à mão.
 *
 * Aqui as duas pontas são lidas do FONTE: toda ação literal que o app envia
 * (`'evolution-api/<ação>'`, `callApi('<ação>'`, `withToast('<ação>'`) precisa
 * ter um `action === '<ação>'` no roteador.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ROUTER = resolve(ROOT, 'supabase/functions/evolution-api/index.ts');
const SRC = resolve(ROOT, 'src');

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : fontes(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const acoesDoRoteador = new Set(
  [...readFileSync(ROUTER, 'utf8').matchAll(/action === '([a-z0-9-]+)'/g)].map((m) => m[1]),
);

function acoesChamadasPeloApp(): Array<{ acao: string; arquivo: string }> {
  const achados: Array<{ acao: string; arquivo: string }> = [];
  for (const arquivo of fontes(SRC)) {
    const texto = readFileSync(arquivo, 'utf8');
    const padroes = [/['"`]evolution-api\/([a-z0-9-]+)['"`]/g];
    // `callApi`/`withToast` são os atalhos dos hooks da Evolution (useEvolutionApiCore).
    if (/hooks[\\/]evolution[\\/]/.test(arquivo)) {
      padroes.push(/\b(?:callApi|withToast)\(\s*'([a-z0-9-]+)'/g);
    }
    for (const padrao of padroes) {
      for (const m of texto.matchAll(padrao)) achados.push({ acao: m[1], arquivo: relative(ROOT, arquivo) });
    }
  }
  return achados;
}

/**
 * Órfãs com correção em PR separado ainda não integrado. Depois do merge a
 * entrada fica inócua (a ação passa a existir) e pode sair desta lista.
 *  - find-status-messages: restaurada no PR #2999.
 */
const ORFAS_COM_CORRECAO_PENDENTE = new Set(['find-status-messages']);

describe('front → evolution-api: toda ação chamada existe no roteador', () => {
  it('o roteador foi lido (sanidade)', () => {
    expect(acoesDoRoteador.has('send-text')).toBe(true);
    expect(acoesDoRoteador.size).toBeGreaterThanOrEqual(50);
  });

  it('nenhuma ação órfã (chamada pelo app e sem tratador na Edge)', () => {
    const chamadas = acoesChamadasPeloApp();
    expect(chamadas.length).toBeGreaterThan(20);
    const orfas = chamadas.filter(({ acao }) => !acoesDoRoteador.has(acao) && !ORFAS_COM_CORRECAO_PENDENTE.has(acao));
    expect(orfas).toEqual([]);
  });
});
