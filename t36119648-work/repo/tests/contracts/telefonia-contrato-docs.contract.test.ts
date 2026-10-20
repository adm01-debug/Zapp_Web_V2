import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato dos documentos de Telefonia (T92 do plano
 * `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`).
 *
 * O aceite do T92 é textual — "nenhuma afirmação sem linha de código
 * correspondente (data, commit)" — e por isso ele não se sustenta sozinho: os dois
 * documentos já citaram arquivo/linha que não existiam mais
 * (`useSipConnection.ts:54`, `useSipClient.ts:15-17` como origem do host SIP) e
 * decisões que o dono já tinha trocado (D3 "aberto" depois de T71–T74, D7
 * "aberto" depois de D7=(b)).
 *
 * Este contrato transforma o aceite em regra verificável:
 *   1. os dois documentos declaram a revisão (`Revisado em`, data, commit);
 *   2. toda referência de código citada resolve (arquivo existe, e a faixa de
 *      linhas cabe no arquivo);
 *   3. a origem do SIP é a Edge, não o front;
 *   4. D3/D7 do CONTRATO casam com a decisão do plano e com o código;
 *   5. a tabela de RPCs cobre todas as funções do escopo no baseline commitado.
 *
 * Ele NÃO trava o estado de hoje: cada regra lê o artefato real (código, plano,
 * baseline) e falha quando o documento volta a divergir dele.
 */

const CAPACIDADES = 'docs/telefonia/CAPACIDADES.md';
const CONTRATO = 'docs/telefonia/CONTRATO.md';
const PLANO = 'docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md';
const BASELINE = 'docs/design/telefonia-baseline-2026-09-29/pos-fase-0.json';
const EDGE_SIP = 'supabase/functions/get-sip-password/index.ts';
const FRONT_SIP = 'src/hooks/communication/useSipClient.ts';
const ADAPTER_WHATSAPP = 'src/lib/calls/WhatsAppCallAdapter.ts';

const DOCUMENTOS = [CAPACIDADES, CONTRATO];

function ler(arquivo: string): string {
  return readFileSync(arquivo, 'utf8');
}

function linhas(arquivo: string): number {
  return ler(arquivo).split('\n').length;
}

/** `git ls-files` uma vez: mapa nome-base → caminhos (para refs sem diretório). */
let indice: Map<string, string[]> | null = null;
function arquivosDoRepo(): Map<string, string[]> {
  if (indice) return indice;
  const saida = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  indice = new Map();
  for (const caminho of saida.split('\n').filter(Boolean)) {
    const nome = caminho.split('/').pop() as string;
    indice.set(nome, [...(indice.get(nome) ?? []), caminho]);
  }
  return indice;
}

interface Referencia {
  bruta: string;
  caminho: string;
  linhaInicial: number | null;
  linhaFinal: number | null;
}

const EXCECOES = new Set(['.env.example']);

function referencias(markdown: string): Referencia[] {
  const achadas: Referencia[] = [];
  const vistos = new Set<string>();
  for (const [, conteudo] of markdown.matchAll(/`([^`\n]+)`/g)) {
    const bruta = conteudo.trim();
    if (vistos.has(bruta) || EXCECOES.has(bruta)) continue;
    const casou = bruta.match(/^([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|sh|sql|json))(?:[:#](\d+)(?:-(\d+))?)?$/);
    if (!casou) continue;
    vistos.add(bruta);
    achadas.push({
      bruta,
      caminho: casou[1],
      linhaInicial: casou[2] ? Number(casou[2]) : null,
      linhaFinal: casou[3] ? Number(casou[3]) : null,
    });
  }
  return achadas;
}

function resolver(referencia: Referencia): { ok: boolean; motivo: string } {
  let caminho = referencia.caminho;
  if (!caminho.includes('/')) {
    const candidatos = arquivosDoRepo().get(caminho) ?? [];
    if (candidatos.length === 0) return { ok: false, motivo: 'nenhum arquivo com esse nome no repositório' };
    if (candidatos.length > 1) {
      return { ok: false, motivo: `nome ambíguo (${candidatos.length} arquivos); cite com o diretório` };
    }
    [caminho] = candidatos;
  }
  if (!existsSync(caminho)) return { ok: false, motivo: `arquivo não existe: ${caminho}` };
  if (referencia.linhaInicial !== null) {
    const total = linhas(caminho);
    const alvo = referencia.linhaFinal ?? referencia.linhaInicial;
    if (alvo > total) {
      return { ok: false, motivo: `${caminho} tem ${total} linhas; a referência aponta a linha ${alvo}` };
    }
  }
  return { ok: true, motivo: caminho };
}

/** Linha `N` (1-indexada) de um arquivo. */
function linhaDe(arquivo: string, numero: number): string {
  return ler(arquivo).split('\n')[numero - 1] ?? '';
}

describe('T92 — CAPACIDADES/CONTRATO revisados contra o código', () => {
  it.each(DOCUMENTOS)('%s declara a revisão com data e commit', (documento) => {
    const texto = ler(documento);

    const revisao = texto.match(/\*\*Revisado em (\d{2})\/(\d{2})\/(\d{4})\*\*/);
    expect(revisao, `${documento} precisa do carimbo "**Revisado em DD/MM/AAAA**"`).toBeTruthy();
    const [, dia, mes, ano] = revisao as RegExpMatchArray;
    expect(Number(dia), 'dia inválido no carimbo').toBeGreaterThanOrEqual(1);
    expect(Number(dia), 'dia inválido no carimbo').toBeLessThanOrEqual(31);
    expect(Number(mes), 'mês inválido no carimbo').toBeGreaterThanOrEqual(1);
    expect(Number(mes), 'mês inválido no carimbo').toBeLessThanOrEqual(12);
    expect(Number(ano), 'ano inválido no carimbo').toBeGreaterThanOrEqual(2020);

    const commit = texto.match(/commit `([0-9a-f]{7,40})`/);
    expect(commit, `${documento} precisa declarar o commit da revisão`).toBeTruthy();
    const sha = (commit as RegExpMatchArray)[1];
    expect(sha, 'o carimbo não pode ser um placeholder').not.toMatch(/^0+$/);

    // Repositório raso (checkout de CI com fetch-depth 1) não tem o objeto: a
    // existência do commit só é exigida quando o histórico está completo.
    const raso = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
    if (raso === 'false') {
      expect(
        () => execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }),
        `${documento} cita o commit ${sha}, que não existe neste repositório`,
      ).not.toThrow();
    }
  });

  it.each(DOCUMENTOS)('%s só cita código que existe (com faixa de linhas válida)', (documento) => {
    const refs = referencias(ler(documento));
    expect(refs.length, `nenhuma referência de código encontrada em ${documento}`).toBeGreaterThan(3);

    const problemas = refs
      .map((ref) => ({ ref, ...resolver(ref) }))
      .filter(({ ok }) => !ok)
      .map(({ ref, motivo }) => `${ref.bruta} — ${motivo}`);

    expect(problemas, `referências que não resolvem em ${documento}`).toEqual([]);
  });

  it('a origem do SIP é a Edge; o front não conhece o provedor', () => {
    const texto = ler(CAPACIDADES);

    expect(texto, 'a matriz precisa apontar a Edge como origem dos defaults SIP').toContain(EDGE_SIP);
    expect(texto, 'a alegação de host SIP "hardcoded" no front está obsoleta (T15)').not.toMatch(/\(hardcoded\)/);
    expect(texto, 'referência obsoleta ao host SIP no front').not.toMatch(/useSipClient\.ts:15-17/);

    expect(ler(EDGE_SIP), 'a Edge de provisionamento lê SIP_SERVER').toContain('SIP_SERVER');
    expect(ler(EDGE_SIP), 'os defaults do provedor moram na Edge').toContain('bitrixphone');
    expect(
      ler(FRONT_SIP),
      'o front não pode voltar a embutir o host do provedor',
    ).not.toContain('bitrixphone');
  });

  it('a citação do recebimento VoIP aponta para o arquivo que monta o onInvite', () => {
    const texto = ler(CAPACIDADES);
    const citacao = texto.match(/`(src\/hooks\/sip\/useSipConnection\.ts):(\d+)`/);
    expect(citacao, 'a matriz precisa citar o hook de conexão SIP com arquivo e linha').toBeTruthy();

    const [, arquivo, linha] = citacao as RegExpMatchArray;
    expect(Number(linha), 'linha citada fora do arquivo').toBeLessThanOrEqual(linhas(arquivo));
    expect(linhaDe(arquivo, Number(linha)), `a linha ${linha} de ${arquivo} não monta o onInvite`).toContain(
      'onInvite',
    );
  });

  it.each(['D3', 'D7'])('%s do CONTRATO casa com a decisão do plano e com o código', (decisao) => {
    const linhaDoContrato = ler(CONTRATO)
      .split('\n')
      .find((linha) => linha.startsWith(`| ${decisao} |`));
    const linhaDoPlano = ler(PLANO)
      .split('\n')
      .find((linha) => linha.startsWith(`| ${decisao} |`));

    expect(linhaDoContrato, `${decisao} ausente no CONTRATO`).toBeTruthy();
    expect(linhaDoPlano, `${decisao} ausente na seção 10 do plano`).toBeTruthy();
    expect(linhaDoContrato, `${decisao} não pode voltar a constar como "aberto"`).not.toMatch(/\*\*aberto\*\*/);
  });

  it('D3 = reconciliar com o Bitrix24 e D7 = "Ignorar" (declined local)', () => {
    const contrato = ler(CONTRATO);
    const d3 = contrato.split('\n').find((linha) => linha.startsWith('| D3 |')) as string;
    const plano = ler(PLANO);
    const d3DoPlano = plano.split('\n').find((linha) => linha.startsWith('| D3 |')) as string;

    expect(d3DoPlano, 'a seção 10 do plano decide pela reconciliação com o Bitrix24').toMatch(/Bitrix24/i);
    expect(d3, 'o CONTRATO precisa registrar a decisão D3 do plano').toMatch(/Bitrix24/i);

    const codigoWhatsApp = ler(ADAPTER_WHATSAPP);
    const rotulo = codigoWhatsApp.match(/ROTULO_IGNORAR_WHATSAPP\s*=\s*'([^']+)'/);
    expect(rotulo, 'o adapter do WhatsApp declara o rótulo da recusa').toBeTruthy();
    const texto = (rotulo as RegExpMatchArray)[1];
    expect(contrato, 'D7 do CONTRATO precisa registrar a decisão (b) "Ignorar"').toContain(texto);
  });

  it('a tabela de RPCs cobre todas as funções do contrato no baseline', () => {
    const baseline = JSON.parse(ler(BASELINE)) as { scope: { functions: string[] } };
    const funcoes = baseline.scope.functions;
    expect(funcoes.length, 'o baseline precisa listar as funções do escopo').toBeGreaterThan(3);

    const contrato = ler(CONTRATO);
    const secaoRpc = contrato.slice(contrato.indexOf('## 8.'), contrato.indexOf('## 9.'));
    const ausentes = funcoes.filter((funcao) => !secaoRpc.includes(`\`${funcao}(`));

    expect(ausentes, 'RPCs do contrato ausentes na seção 8 do CONTRATO').toEqual([]);
  });
});
