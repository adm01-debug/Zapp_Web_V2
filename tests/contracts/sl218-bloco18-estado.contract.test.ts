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
 * a entrada da etapa, exige UM estado do vocabulário e confere a prova no disco.
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

  it('as etapas pendentes declaram a pendência, sem serem contadas como entregues', () => {
    const pendentes = ETAPAS.filter((e) => ESTADO_ESPERADO[e] !== 'IMPLEMENTADA');
    for (const etapa of pendentes) {
      const entrada = entradaDaEtapa(etapa);
      expect(/NÃO IMPLEMENTADA|PARCIAL/.test(entrada), `${etapa} precisa declarar a pendência`).toBe(true);
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

  it('não lê o bloco como concluído: a camada de propostas/supervisão segue ausente', () => {
    // Sem executor e sem caixa de propostas, os três critérios que dependem deles
    // permanecem não atendidos — é o que o documento tem de dizer.
    expect(estadoDa(entradaDaEtapa('IA-171'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-173'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-180'))).toBe('NÃO IMPLEMENTADA');
  });
});
