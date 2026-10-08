import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SL-219 — Bloco 20 do Plano IA 200 (IA-191..IA-200, "Homologação, implantação
 * controlada e entrega").
 *
 * O item de inventário (`Bloco 20 (191-200)`, `NAO_IMPLEMENTADA`, evidência
 * "sem entrega das etapas 191-200") pede a execução do bloco. O bloco, porém, é
 * um bloco **operacional**: o próprio plano o marca como `P1 — somente após
 * autorização específica` e a etapa IA-200 exige aceite de negócio, com
 * "produção exige autorização expressa". Nada disso cabe nas regras deste cartão
 * (que proíbe DDL, Edge Function, migration, deploy e produção) nem no nível
 * `worker`.
 *
 * O que este contrato fecha é a parte que o PRÓPRIO bloco exige — a revisão de
 * evidência ("Checkpoint do bloco: evidências dos dez critérios de aceite
 * revisadas; itens não comprovados permanecem pendentes"): o documento de estado
 * declara o estado REAL de cada uma das dez etapas na ponta do dia, e cada
 * caminho citado como prova precisa existir no repositório. Prosa solta não
 * satisfaz: o contrato lê a entrada da etapa, exige UM estado do vocabulário e
 * confere a prova no disco.
 *
 * O ponto sensível é não deixar o bloco ser lido nem como concluído nem como
 * inexistente: há infraestrutura REAL de homologação/rollout no repositório
 * (deploy controlado de edges, migrations com dry-run, rollout por flags do CRM),
 * e é isso que as etapas PARCIAIS registram; o que NÃO existe é a execução da
 * homologação da suíte de IA nem o aceite final — o documento precisa dizer os
 * dois lados sem confundir infraestrutura adjacente com capacidade entregue.
 */
const DOC = resolve(process.cwd(), 'docs/ia/IA-191-a-IA-200-homologacao-implantacao-entrega.md');
const TEXTO = readFileSync(DOC, 'utf8');
const LINHAS = TEXTO.split('\n');

type Estado = 'IMPLEMENTADA' | 'PARCIAL' | 'NÃO IMPLEMENTADA';
const ESTADOS: Estado[] = ['IMPLEMENTADA', 'PARCIAL', 'NÃO IMPLEMENTADA'];

const ETAPAS = [
  'IA-191',
  'IA-192',
  'IA-193',
  'IA-194',
  'IA-195',
  'IA-196',
  'IA-197',
  'IA-198',
  'IA-199',
  'IA-200',
] as const;

/**
 * Estado medido na ponta `dia/2026-10-08` (commit `210c3e7c1`). Mudar um estado
 * aqui é mudar o que o produto afirma sobre o bloco — exige rever a evidência no
 * documento, não só o rótulo.
 */
const ESTADO_ESPERADO: Record<(typeof ETAPAS)[number], Estado> = {
  'IA-191': 'PARCIAL',
  'IA-192': 'PARCIAL',
  'IA-193': 'NÃO IMPLEMENTADA',
  'IA-194': 'NÃO IMPLEMENTADA',
  'IA-195': 'NÃO IMPLEMENTADA',
  'IA-196': 'PARCIAL',
  'IA-197': 'PARCIAL',
  'IA-198': 'PARCIAL',
  'IA-199': 'PARCIAL',
  'IA-200': 'NÃO IMPLEMENTADA',
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

describe('SL-219 — Bloco 20 (IA-191..IA-200): estado real e prova', () => {
  it('declara as dez etapas do bloco', () => {
    for (const etapa of ETAPAS) {
      expect(entradaDaEtapa(etapa), `faltou a entrada de ${etapa} no estado do Bloco 20`).not.toBe('');
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

  it('as etapas PARCIAIS nomeiam a infraestrutura real que sustenta a parte provada', () => {
    const parciais = ETAPAS.filter((e) => ESTADO_ESPERADO[e] === 'PARCIAL');
    expect(parciais.length, 'o bloco operacional não pode ficar sem nenhuma parte provada').toBeGreaterThanOrEqual(4);
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

  it('não lê o bloco como concluído: a homologação da IA e o aceite final seguem ausentes', () => {
    // Sem execução da homologação da suíte de IA e sem aceite de negócio, os
    // critérios que dependem deles permanecem não atendidos — é o que o
    // documento tem de dizer, sem mascarar a pendência por infraestrutura vizinha.
    expect(estadoDa(entradaDaEtapa('IA-193'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-194'))).toBe('NÃO IMPLEMENTADA');
    expect(estadoDa(entradaDaEtapa('IA-200'))).toBe('NÃO IMPLEMENTADA');
  });

  it('declara que produção exige autorização expressa (o bloco é P1, não autorização implícita)', () => {
    expect(/autoriza[çc][aã]o expressa/i.test(TEXTO), 'o estado precisa registrar a trava de autorização').toBe(true);
  });
});
