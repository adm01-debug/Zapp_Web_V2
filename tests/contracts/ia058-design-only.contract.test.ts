import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const README = 'docs/ia/README.md';
const PROJETO = 'docs/audits/PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03.md';

/**
 * Contrato do ESTADO DOCUMENTAL da IA-058 (achado IA-DESIGN-001).
 *
 * A IA-058 foi entregue APENAS como projeto (#1839): o documento fixa escopos,
 * sinais, limiares, a identidade do incidente (deduplicação) e o formato do
 * bloqueio por capacidade — e declara que nada foi implementado. O risco é a
 * entrega documental ser contada como alerta disponível, falseando o estado do
 * produto. O índice da IA precisa registrar IA-058 como DESIGN_ONLY, distinta de
 * runtime, e não pode afirmar alerta nem bloqueio em operação.
 *
 * Só o estado documental é inspecionado: o corpo do projeto permanece intacto.
 */
describe('IA-058: estado documental DESIGN_ONLY, distinto de runtime', () => {
  const readme = readFileSync(README, 'utf8');
  const projeto = readFileSync(PROJETO, 'utf8');

  it('registra no índice da IA que IA-058 não está implementada em operação', () => {
    expect(
      readme,
      'o índice precisa dizer que IA-058 não está implementada em operação',
    ).toMatch(/IA-058[^\n]{0,120}n[ãa]o est[áa] implementada em opera[çc][ãa]o/i);
  });

  it('classifica IA-058 como DESIGN_ONLY (projeto) no índice', () => {
    expect(readme, 'o índice precisa marcar IA-058 como DESIGN_ONLY').toMatch(
      /IA-058[^\n]{0,80}DESIGN_ONLY/i,
    );
    expect(readme, 'DESIGN_ONLY é a classificação do projeto').toMatch(
      /DESIGN_ONLY \(projeto\)/,
    );
  });

  it('declara o estado documental distinto de runtime', () => {
    expect(readme, 'o índice precisa separar documento de runtime').toMatch(
      /distinto de runtime/i,
    );
  });

  it('aponta o documento do projeto e a origem pública (#1839)', () => {
    expect(readme, 'o índice precisa citar o projeto da IA-058').toMatch(
      /PROJETO_IA058_ALERTAS_DE_CONSUMO_ANOMALO_2026-10-03\.md/,
    );
    expect(readme, 'a origem do projeto é o #1839').toMatch(/#1839/);
  });

  it('o próprio projeto declara que nada foi implementado', () => {
    expect(projeto, 'o projeto precisa declarar que nada foi implementado').toMatch(
      /nada aqui é implementado/i,
    );
  });

  it('não afirma alerta, bloqueio nem entrega concluída em operação', () => {
    expect(
      readme,
      'nenhum alerta/bloqueio da IA-058 pode ser afirmado em operação',
    ).not.toMatch(/IA-058[^\n]{0,60}em produ[çc][ãa]o/i);
    expect(
      readme,
      'o projeto não pode aparecer como alerta ativo/disponível',
    ).not.toMatch(/IA-058[^\n]{0,60}(alerta ativo|alerta dispon[íi]vel)/i);
    expect(
      readme,
      'o Bloco 06/IA-058 não pode constar como concluído',
    ).not.toMatch(/(Bloco\s*06|IA-058)[^\n]{0,60}conclu[íi]d/i);
  });
});
