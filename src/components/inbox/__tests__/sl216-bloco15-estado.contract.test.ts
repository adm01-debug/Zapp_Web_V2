import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SL-216 — Bloco 15 do Plano IA 200 (IA-141..IA-150, "Experiência de uso e
 * acessibilidade").
 *
 * O item de inventário (`Bloco 15 (141-150)`, `NAO_IMPLEMENTADA`, evidência
 * "sem entrega das etapas 141-150") pede a execução do bloco. O bloco, porém,
 * NÃO é um defeito de uma camada: são dez etapas com dez critérios de aceite
 * próprios, espalhadas por tabela de superfícies — unificação de pontos de
 * entrada, selo de origem da informação, visualizador de evidências, semântica
 * de modal × painel, teclado, estados visuais, legibilidade, proteção de
 * rascunho, separação administração × operação (que a IA-149 exige que seja
 * imposta **no servidor**, não só na tela) e preferências por usuário. Fechar
 * isso em um único cartão `worker` significaria ou entregar só um pedaço e
 * chamar o bloco de pronto, ou afrouxar metade das regras do cartão (a IA-149
 * toca API/rota/segredo, proibidos aqui).
 *
 * O que este contrato fecha é a parte que o PRÓPRIO bloco exige — a revisão de
 * evidência ("Checkpoint do bloco: evidências dos dez critérios de aceite
 * revisadas; itens não comprovados permanecem pendentes"): o documento de
 * estado declara o estado REAL de cada uma das dez etapas na ponta do dia, e
 * cada caminho citado como prova precisa existir no repositório. Prosa solta
 * não satisfaz: o contrato lê a entrada da etapa, exige UM estado do vocabulário
 * e confere a prova no disco.
 *
 * O ponto sensível é não deixar o bloco ser lido nem como concluído nem como
 * inexistente: há superfície REAL do assistente no repositório (a aba IA, os
 * painéis de ferramenta, a proteção de rascunho do `AIEnhanceButton`, a guarda
 * de papel da aba de provedores), e é isso que as etapas PARCIAIS registram; o
 * que NÃO existe é o selo de origem (IA-142), o visualizador de evidências
 * (IA-143) e as preferências por usuário (IA-150) — o documento precisa dizer
 * os dois lados sem confundir superfície vizinha com capacidade entregue.
 */
const DOC = resolve(process.cwd(), 'docs/ia/IA-141-a-IA-150-experiencia-uso-acessibilidade.md');
const TEXTO = readFileSync(DOC, 'utf8');
const LINHAS = TEXTO.split('\n');

type Estado = 'IMPLEMENTADA' | 'PARCIAL' | 'NÃO IMPLEMENTADA';
const ESTADOS: Estado[] = ['IMPLEMENTADA', 'PARCIAL', 'NÃO IMPLEMENTADA'];

const ETAPAS = [
  'IA-141',
  'IA-142',
  'IA-143',
  'IA-144',
  'IA-145',
  'IA-146',
  'IA-147',
  'IA-148',
  'IA-149',
  'IA-150',
] as const;

/**
 * Estado medido na ponta `dia/2026-10-08` (commit `e3349b70c`). Mudar um estado
 * aqui é mudar o que o produto afirma sobre o bloco — exige rever a evidência no
 * documento, não só o rótulo.
 */
const ESTADO_ESPERADO: Record<(typeof ETAPAS)[number], Estado> = {
  'IA-141': 'PARCIAL',
  'IA-142': 'NÃO IMPLEMENTADA',
  'IA-143': 'NÃO IMPLEMENTADA',
  'IA-144': 'PARCIAL',
  'IA-145': 'PARCIAL',
  'IA-146': 'PARCIAL',
  'IA-147': 'PARCIAL',
  'IA-148': 'PARCIAL',
  'IA-149': 'PARCIAL',
  'IA-150': 'NÃO IMPLEMENTADA',
};

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

describe('SL-216 — Bloco 15 (IA-141..IA-150): estado real e prova', () => {
  it('declara as dez etapas do bloco', () => {
    for (const etapa of ETAPAS) {
      expect(entradaDaEtapa(etapa), `faltou a entrada de ${etapa} no estado do Bloco 15`).not.toBe('');
    }
  });

  it('cada etapa declara UM estado do vocabulário, igual ao medido na ponta', () => {
    for (const etapa of ETAPAS) {
      const entrada = entradaDaEtapa(etapa);
      const estado = estadoDa(entrada);
      expect(estado, `a entrada de ${etapa} não declara um estado único`).not.toBeNull();
      expect(estado, `o estado declarado de ${etapa} diverge do medido na ponta`).toBe(
        ESTADO_ESPERADO[etapa],
      );
    }
  });

  it('as etapas PARCIAIS nomeiam a superfície real que sustenta a parte provada', () => {
    const parciais = ETAPAS.filter((e) => ESTADO_ESPERADO[e] === 'PARCIAL');
    expect(parciais.length, 'o bloco não pode ficar sem nenhuma parte provada').toBeGreaterThanOrEqual(6);
    for (const etapa of parciais) {
      const entrada = entradaDaEtapa(etapa);
      expect(
        caminhosCitados(entrada).length,
        `${etapa} é PARCIAL e precisa citar ao menos um caminho de prova`,
      ).toBeGreaterThanOrEqual(1);
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

  it('etapas sem caminho no repositório seguem NÃO IMPLEMENTADA (não viram intenção)', () => {
    // Sem selo de origem (IA-142), sem visualizador de evidências (IA-143) e sem
    // preferências por usuário (IA-150), os critérios que dependem deles
    // permanecem não atendidos — é o que o documento tem de dizer.
    expect(estadoDa(entradaDaEtapa('IA-142'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-143'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-150'))).toBe('NÃO IMPLEMENTADA');
  });

  it('não lê o bloco como concluído: a execução permanece pendente', () => {
    const naoImplementadas = ETAPAS.filter((e) => ESTADO_ESPERADO[e] === 'NÃO IMPLEMENTADA');
    expect(naoImplementadas.length, 'o bloco não pode ser lido como integralmente entregue').toBeGreaterThanOrEqual(3);
    expect(
      /itens não comprovados permanecem pendentes/i.test(TEXTO),
      'o estado precisa registrar o checkpoint do bloco (o que fica pendente)',
    ).toBe(true);
    expect(
      /não é implementação do bloco/i.test(TEXTO),
      'o documento precisa declarar que não é a implementação do bloco',
    ).toBe(true);
  });
});
