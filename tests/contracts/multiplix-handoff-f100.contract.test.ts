import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F100 (Bloco J) — encerramento documental do Multiplix.
 *
 * O item pede TRÊS artefatos que não existiam na ponta de dia/2026-10-08:
 *   1. `docs/handoffs/HANDOFF_MULTIPLIX_<data>.md` — o que ficou fora, dívidas
 *      e evoluções (linguagem natural, pressão de contato, tarefas automáticas);
 *   2. a retrospectiva em `docs/audits/`, comparando o plano de finalização com
 *      o que foi executado;
 *   3. a decisão final sobre a flag do item F92 (`multiplix_enabled_departments`).
 *
 * O contrato prende o que NÃO pode voltar a divergir:
 *
 *   - as contagens publicadas na retro são ESPELHO FIEL do ledger de
 *     reconciliação (`docs/reconciliation/tasks/P039.json`, fonte independente,
 *     que não é escrita por este teste nem pelo handoff). Publicar documento não
 *     pode maquiar o estado do plano.
 *
 *   - a decisão da flag tem de bater com a árvore do repositório. Medido em
 *     08/10/2026: a flag NÃO existe em `src/` nem em `supabase/functions/`, e o
 *     kill switch real do Multiplix é a permissão nomeada
 *     `multiplix.dispatch.create` (nav e rota). Implementar a flag sem atualizar
 *     a decisão no handoff QUEBRA este teste de propósito.
 *
 * O teste LÊ os documentos e a árvore: é ele que segura o encerramento no lugar.
 */

const HANDOFF = 'docs/handoffs/HANDOFF_MULTIPLIX_2026-10-08.md';
const RETRO = 'docs/audits/RETRO_MULTIPLIX_2026-10-08.md';
const LEDGER = 'docs/reconciliation/tasks/P039.json';
const FLAG = 'multiplix_enabled_departments';
const PERMISSAO_KILL_SWITCH = 'multiplix.dispatch.create';

const read = (path: string) => readFileSync(path, 'utf8');

/** Contagens publicadas na retro, dentro do bloco marcado. */
function contagensDaRetro(md: string): Record<string, number> {
  const bloco = md.match(
    /<!-- multiplix-f100-contagens -->\s*```json\s*([\s\S]*?)```/,
  );
  if (!bloco) {
    throw new Error(
      'a retro precisa publicar as contagens em <!-- multiplix-f100-contagens --> seguido de ```json',
    );
  }
  return JSON.parse(bloco[1]) as Record<string, number>;
}

/** Arquivos de código (sem teste) sob um diretório, recursivamente. */
function arquivosDeCodigo(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name === '__tests__') continue;
      achados.push(...arquivosDeCodigo(caminho));
      continue;
    }
    if (/\.(ts|tsx|js|mjs|sql|toml|json)$/.test(entrada.name) && !/\.test\./.test(entrada.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe('F100 — encerramento documental do Multiplix', () => {
  const handoff = read(HANDOFF);
  const retro = read(RETRO);

  it('o handoff existe e declara o escopo, o que ficou fora e as dívidas', () => {
    expect(handoff, 'o handoff precisa se identificar e datar o encerramento').toMatch(
      /HANDOFF\s*—\s*Multiplix/i,
    );
    expect(handoff, 'o handoff precisa declarar o que ficou fora').toMatch(
      /##[^\n]*O que ficou fora/i,
    );
    expect(handoff, 'o handoff precisa listar as dívidas').toMatch(/##[^\n]*D[íi]vidas/i);
  });

  it('o handoff declara as três evoluções pedidas pelo item', () => {
    const evolucoes: Array<[string, RegExp]> = [
      ['linguagem natural', /linguagem natural/i],
      ['pressão de contato', /press[ãa]o de contato/i],
      ['tarefas automáticas', /tarefas autom[áa]ticas/i],
    ];
    for (const [nome, padrao] of evolucoes) {
      expect(handoff, `o item F100 pede a evolução "${nome}"`).toMatch(padrao);
    }
  });

  it('a retro compara o plano com o executado e cita as duas fontes', () => {
    expect(retro, 'a retro precisa nomear o plano comparado').toContain(
      'docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md',
    );
    expect(retro, 'a retro precisa declarar o ledger de reconciliação').toContain(LEDGER);
  });

  it('as contagens da retro são espelho fiel do ledger oficial', () => {
    const ledger = JSON.parse(read(LEDGER)) as {
      plan: { status_counts: Record<string, number> };
    };
    const oficial = ledger.plan.status_counts;

    expect(Object.keys(oficial), 'o ledger mudou de formato').toHaveLength(10);
    expect(
      Object.values(oficial).reduce((soma, n) => soma + n, 0),
      'os 100 itens do plano precisam fechar na soma',
    ).toBe(100);

    expect(
      contagensDaRetro(retro),
      `a retro divergiu de ${LEDGER}; atualize o bloco <!-- multiplix-f100-contagens -->`,
    ).toEqual(oficial);
  });

  it('a decisão da flag está declarada no handoff', () => {
    expect(handoff, 'o handoff precisa de uma seção de decisão da flag').toMatch(
      /##[^\n]*Decis[ãa]o sobre a flag/i,
    );
    expect(handoff, 'a decisão precisa nomear a flag do item F92').toContain(FLAG);
  });

  it('a decisão da flag bate com a árvore do repositório', () => {
    const fontes = [...arquivosDeCodigo('src'), ...arquivosDeCodigo('supabase/functions')];
    expect(fontes.length, 'varredura sem arquivos: caminho errado').toBeGreaterThan(100);

    const comFlag = fontes.filter((arquivo) => read(arquivo).includes(FLAG));
    expect(
      comFlag,
      `${FLAG} passou a existir no código: atualize a decisão sobre a flag no handoff`,
    ).toEqual([]);

    const comPermissao = fontes.filter((arquivo) => read(arquivo).includes(PERMISSAO_KILL_SWITCH));
    expect(
      comPermissao.length,
      `o kill switch declarado no handoff (${PERMISSAO_KILL_SWITCH}) precisa existir no código`,
    ).toBeGreaterThan(0);
  });

  it('nenhum dos dois documentos expõe identificador de projeto Supabase', () => {
    const documentos: Array<[string, string]> = [
      [HANDOFF, handoff],
      [RETRO, retro],
    ];
    for (const [nome, conteudo] of documentos) {
      expect(conteudo, `${nome} não pode expor o ref do projeto`).not.toMatch(/\b[a-z]{20}\b/);
    }
  });
});
