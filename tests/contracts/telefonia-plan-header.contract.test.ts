import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PLANO = 'docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md';

/**
 * Contrato do CABEÇALHO do plano da Telefonia.
 *
 * O cabeçalho (tudo antes do primeiro separador `---`) é o resumo de status que
 * qualquer leitor vê primeiro. Ele já mentiu sobre o estado real: dizia que a
 * Fase 2 não tinha começado, que a PR #1494 aguardava responsável e que o T06
 * seguia preso por autenticação — enquanto o próprio ledger do arquivo já
 * registrava fases posteriores fechadas e o login respondendo de novo em 03/10.
 *
 * O contrato trava as quatro verdades que o cabeçalho precisa declarar e proíbe
 * a volta das alegações obsoletas. Ele NÃO exige mudança no corpo histórico:
 * só o cabeçalho é inspecionado.
 */

/** Cabeçalho = o texto antes do primeiro separador `---` (o corpo fica intacto). */
function cabecalho(): string {
  const md = readFileSync(PLANO, 'utf8');
  const linhas = md.split('\n');
  const fim = linhas.findIndex((linha) => linha.trim() === '---');
  return linhas.slice(0, fim === -1 ? linhas.length : fim).join('\n');
}

describe('cabeçalho do plano da Telefonia reflete o estado real', () => {
  const header = cabecalho();

  it('declara as fases 0–7 executadas/fechadas', () => {
    expect(
      header,
      'o cabeçalho precisa declarar as fases 0–7 executadas/fechadas',
    ).toMatch(/fases?\s*0\s*[–\-—]\s*7\b[^\n]{0,80}(executad|fechad)/i);
  });

  it('declara a Fase 8 em execução, com T75–T78 e T79–T80 abertas', () => {
    expect(header, 'a Fase 8 precisa constar como em execução').toMatch(
      /Fase\s*8[^\n]{0,80}em\s+(execu|andamento)/i,
    );
    expect(header, 'a faixa T75–T78 precisa aparecer no cabeçalho').toMatch(
      /T75\s*[–\-—]\s*T78/,
    );
    expect(header, 'a faixa T79–T80 precisa aparecer no cabeçalho').toMatch(
      /T79\s*[–\-—]\s*T80/,
    );
  });

  it('declara resolvido o bloqueio de autenticação do T06 em 03/10', () => {
    expect(header, 'o T06 precisa constar como resolvido').toMatch(
      /T06[^\n]{0,80}resolv/i,
    );
    expect(header, 'a resolução precisa ser datada de 03/10').toMatch(/03\/10/);
  });

  it('declara o T11 ainda pendente de evidência de chamada real', () => {
    expect(
      header,
      'o T11 precisa seguir pendente por falta de chamada real de aceite',
    ).toMatch(
      /T11[^\n]{0,120}(pendente|desmarcad)[^\n]{0,80}(chamada real|evid[êe]ncia)/i,
    );
  });

  it('não repete a alegação obsoleta de que a Fase 2 não foi iniciada', () => {
    expect(header, 'a alegação de Fase 2 não iniciada está obsoleta').not.toMatch(
      /Fase\s*2[^\n]{0,80}n[ãa]o[^\n]{0,12}iniciad/i,
    );
  });

  it('não repete a alegação obsoleta de que a PR #1494 aguarda responsável', () => {
    expect(header, 'a PR #1494 já foi incorporada').not.toMatch(
      /#1494[^\n]{0,60}aguard/i,
    );
  });
});
