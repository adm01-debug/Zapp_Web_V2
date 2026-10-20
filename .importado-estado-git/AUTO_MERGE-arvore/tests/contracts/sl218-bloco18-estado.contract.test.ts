import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SL-218 — Bloco 18 do Plano IA 200 (IA-171..IA-180, "Agentes especializados e
 * ações supervisionadas").
 *
 * O item de inventário (`Bloco 18 (171-180)`, `NAO_IMPLEMENTADA`, evidência
 * "sem entrega das etapas 171-180") pede execução do bloco. O bloco, porém,
 * propõe uma CAMADA NOVA (catálogo de ferramentas, executor determinístico,
 * aprovação vinculada ao efeito, caixa de propostas) que exige tabelas próprias,
 * executor em Edge Function e tela de aprovação — nada disso cabe nas regras do
 * cartão (`sem DDL / Edge Function / migration`, sem dependência nova) nem no
 * tamanho de um cartão de nível `worker`.
 *
 * O que este contrato fecha é a parte que o PRÓPRIO bloco exige — a revisão de
 * evidência ("evidências dos dez critérios de aceite revisadas; itens não
 * comprovados permanecem pendentes"): o documento de estado declara o estado
 * REAL de cada uma das dez etapas na ponta do dia, e cada caminho citado como
 * prova precisa existir no repositório. Prosa solta não satisfaz: o contrato lê
 * a entrada da etapa, exige UM estado do vocabulário, exige a RAZÃO declarada da
 * pendência e confere a prova no disco — e confere a contagem do fecho contra a
 * tabela.
 *
 * O ponto sensível é não deixar o bloco ser lido nem como concluído nem como
 * inexistente: IA-177 está entregue (e o inventário erra ao dizer que não há
 * entrega alguma), e as demais permanecem pendentes — sem que a pendência seja
 * mascarada por um nome parecido no produto (treinamento, copiloto de supervisor,
 * monitoramento) nem por infraestrutura de IA que não é supervisão de ação.
 */
const DOC = resolve(process.cwd(), 'docs/ia/IA-171-a-IA-180-agentes-especializados.md');
const TEXTO = readFileSync(DOC, 'utf8');
const LINHAS = TEXTO.split('\n');

type Estado = 'IMPLEMENTADA' | 'PARCIAL' | 'NÃO IMPLEMENTADA';
const ESTADOS: Estado[] = ['IMPLEMENTADA', 'PARCIAL', 'NÃO IMPLEMENTADA'];

const ETAPAS = [
  'IA-171',
  'IA-172',
  'IA-173',
  'IA-174',
  'IA-175',
  'IA-176',
  'IA-177',
  'IA-178',
  'IA-179',
  'IA-180',
] as const;

/**
 * Estado medido na ponta `dia/2026-10-08` (commit `210c3e7c1`). Mudar um estado
 * aqui é mudar o que o produto afirma sobre o bloco — exige rever a evidência no
 * documento, não só o rótulo.
 */
const ESTADO_ESPERADO: Record<(typeof ETAPAS)[number], Estado> = {
  'IA-171': 'NÃO IMPLEMENTADA',
  'IA-172': 'PARCIAL',
  'IA-173': 'NÃO IMPLEMENTADA',
  'IA-174': 'NÃO IMPLEMENTADA',
  'IA-175': 'PARCIAL',
  'IA-176': 'PARCIAL',
  'IA-177': 'IMPLEMENTADA',
  'IA-178': 'NÃO IMPLEMENTADA',
  'IA-179': 'PARCIAL',
  'IA-180': 'NÃO IMPLEMENTADA',
};

/**
 * Frases que declaram AUSÊNCIA na entrada da etapa — o MOTIVO de ela não estar
 * fechada. Ficam aqui, ao lado do estado esperado, para o contrato provar
 * conteúdo (a razão declarada), não só o rótulo do estado.
 */
const RAZOES_DE_AUSENCIA: RegExp[] = [
  /Não existe/,
  /não existe/,
  /Não h[áa]/,
  /não h[áa]/,
  /Nenhum\b|Nenhuma\b/,
  /Falta\b/,
];

/** Entrada da etapa: a linha do marcador `- **IA-1XX — ...` mais a sua continuação. */
function entradaDaEtapa(etapa: string): string {
  const inicio = LINHAS.findIndex((l) => new RegExp(`^\\s*-\\s*\\*\\*${etapa}\\b`).test(l));
  if (inicio === -1) return '';
  const entrada: string[] = [LINHAS[inicio]];
  for (let i = inicio + 1; i < LINHAS.length; i++) {
    const linha = LINHAS[i];
    if (/^\s*-\s*\*\*IA-/.test(linha) || /^##/.test(linha)) break;
    entrada.push(linha);
  }
  return entrada.join('\n');
}

/** Estado declarado na entrada (o vocabulário fica entre travessões e o ponto final). */
function estadoDa(entrada: string): Estado | null {
  const encontrados = ESTADOS.filter((e) => new RegExp(`—\\s*${e}\\.`).test(entrada));
  return encontrados.length === 1 ? encontrados[0] : null;
}

/** Caminhos de repositório citados em `código` na entrada (com barra e extensão de arquivo). */
function caminhosCitados(entrada: string): string[] {
  const tokens = entrada.match(/`[^`]+`/g) ?? [];
  return tokens
    .map((t) => t.slice(1, -1))
    .filter((t) => /\/.+\.(ts|tsx|sql|md)$/.test(t) && !t.includes(' '));
}

describe('SL-218 — Bloco 18 (IA-171..IA-180): estado real e prova', () => {
  it('declara as dez etapas do bloco', () => {
    for (const etapa of ETAPAS) {
      expect(entradaDaEtapa(etapa), `faltou a entrada de ${etapa} no estado do Bloco 18`).not.toBe('');
    }
  });

  it('cada etapa declara UM estado do vocabulário', () => {
    for (const etapa of ETAPAS) {
      const entrada = entradaDaEtapa(etapa);
      const estado = estadoDa(entrada);
      expect(estado, `a entrada de ${etapa} não declara um estado único`).not.toBeNull();
      expect(estado, `o estado declarado de ${etapa} diverge do medido na ponta`).toBe(
        ESTADO_ESPERADO[etapa],
      );
    }
  });

  it('IA-177 é IMPLEMENTADA e nomeia a prova que existe (o inventário erra ao não ver entrega)', () => {
    const entrada = entradaDaEtapa('IA-177');
    expect(estadoDa(entrada)).toBe('IMPLEMENTADA');
    const prova = entrada.match(/TrainingMode[^`\s]*\.tsx?/g) ?? [];
    expect(prova.length, 'IA-177 precisa citar o componente e o teste do treinamento').toBeGreaterThanOrEqual(2);
  });

  /**
   * Prova substantiva da pendência: o rótulo do estado já é provado no teste
   * anterior (repeti-lo era o teste tautológico desta entrega); aqui se exige a
   * RAZÃO declarada em cada entrada pendente. O "não contadas como entregues"
   * segue garantido pelo teste de estado, que trava o valor exato `PARCIAL` ou
   * `NÃO IMPLEMENTADA` para as nove pendentes.
   */
  it('cada etapa pendente declara a RAZÃO da falta, não só o rótulo do estado', () => {
    const pendentes = ETAPAS.filter((e) => ESTADO_ESPERADO[e] !== 'IMPLEMENTADA');
    expect(pendentes.length, 'o bloco tem nove etapas pendentes a justificar').toBe(9);
    for (const etapa of pendentes) {
      const entrada = entradaDaEtapa(etapa);
      const razao = RAZOES_DE_AUSENCIA.find((r) => r.test(entrada));
      expect(
        razao,
        `${etapa} é ${ESTADO_ESPERADO[etapa]} e precisa declarar por que falta ` +
          '(ex.: "Não existe", "Não há", "Nenhum ... existe", "Falta")',
      ).toBeDefined();
    }
  });

  it('todo caminho citado como prova existe no repositório', () => {
    const citados = new Set<string>();
    for (const etapa of ETAPAS) {
      for (const caminho of caminhosCitados(entradaDaEtapa(etapa))) citados.add(caminho);
    }
    expect(citados.size, 'nenhum caminho de prova foi citado — o estado viraria prosa').toBeGreaterThanOrEqual(8);
    for (const caminho of citados) {
      expect(existsSync(resolve(process.cwd(), caminho)), `prova citada não existe: ${caminho}`).toBe(true);
    }
  });

  /**
   * O fecho do documento é o ponto onde a entrega anterior se contradisse
   * ("três etapas" e quatro nomeadas logo depois). A contagem do texto e a tabela
   * (`ESTADO_ESPERADO`) precisam sair do mesmo número: este teste lê a seção
   * final, exige a palavra certa e exige que ela seja o total de `PARCIAL`.
   */
  it('o fecho conta as quatro etapas parciais que a tabela mede (sem "três etapas")', () => {
    const inicio = LINHAS.findIndex((l) => /^##\s+Consequência para o plano/.test(l));
    expect(inicio, 'a seção "Consequência para o plano" precisa existir').toBeGreaterThanOrEqual(0);
    const fim = LINHAS.findIndex((l, i) => i > inicio && /^##/.test(l));
    const secao = LINHAS.slice(inicio + 1, fim === -1 ? undefined : fim).join('\n');

    const parciais = ETAPAS.filter((e) => ESTADO_ESPERADO[e] === 'PARCIAL');
    expect(parciais.length, 'o estado medido tem quatro etapas PARCIAL').toBe(4);
    expect(secao, 'o fecho precisa dizer "quatro etapas"').toMatch(/quatro etapas/);
    expect(secao, 'o fecho não pode dizer "três etapas" e listar quatro').not.toMatch(/três etapas/);
    for (const etapa of parciais) {
      expect(secao, `o fecho precisa nomear ${etapa} entre as parciais`).toContain(etapa);
    }
    expect(secao, 'o fecho precisa registrar a etapa já entregue (IA-177)').toContain('IA-177');
  });
});
