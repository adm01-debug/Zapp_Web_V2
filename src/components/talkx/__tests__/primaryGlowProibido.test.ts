import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `--primary-glow` reprova WCAG AA como cor de TEXTO nos dois temas, medido sobre as duas
 * superficies em que o texto da aplicacao vive (`--card` e `--background`), com os valores
 * de `src/styles/tokens.css`:
 *
 *   tema    token              sobre card   sobre background
 *   claro   --primary-glow           4.40               4.10   <- abaixo de 4.5
 *   claro   --primary-text           9.36               8.72
 *   escuro  --primary-glow           4.02               4.37   <- abaixo de 4.5
 *   escuro  --primary-text           8.71               9.47
 *
 * `contrasteAA.test.tsx` mede a razao de verdade, mas so alcanca os componentes que ele
 * renderiza; por isso a classe reprovada reapareceu em telas fora daquele alcance. Esta
 * varredura estatica cobre `src/` inteiro e e o que impede a volta.
 *
 * Nao proibe o token `--primary-glow` em si: ele continua valido para borda, fundo, sombra e
 * gradiente, onde o limite de 4.5 nao se aplica. O que esta proibido e a utility de TEXTO
 * `text-primary-glow`.
 */

const RAIZ = path.resolve(__dirname, '../../..');
const PROIBIDA = 'text-primary-glow';
const EXTENSOES = new Set(['.ts', '.tsx', '.css']);
const ESTE_ARQUIVO = path.resolve(__filename);
/** `contrasteAA.test.tsx` cita a classe como dado de comparacao, nao a aplica. */
const PERMITIDOS = new Set([
  path.join(RAIZ, 'components/talkx/__tests__/contrasteAA.test.tsx'),
]);

function varrer(dir: string, achados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      varrer(completo, achados);
      continue;
    }
    if (!EXTENSOES.has(path.extname(entrada.name))) continue;
    if (completo === ESTE_ARQUIVO || PERMITIDOS.has(completo)) continue;
    const texto = fs.readFileSync(completo, 'utf8');
    texto.split('\n').forEach((linha, i) => {
      if (linha.includes(PROIBIDA)) {
        achados.push(`${path.relative(RAIZ, completo)}:${i + 1}`);
      }
    });
  }
  return achados;
}

describe('text-primary-glow como cor de texto', () => {
  it('nao aparece em nenhum arquivo de src/', () => {
    const achados = varrer(RAIZ);
    expect(
      achados,
      `${PROIBIDA} reprova WCAG AA (4.40 no tema claro, 4.02 no escuro). ` +
        `Troque por text-[hsl(var(--primary-text))]. Encontrado em:\n  ${achados.join('\n  ')}`,
    ).toEqual([]);
  });

  it('a varredura realmente enxerga a classe (prova inversa)', () => {
    // Sem este caso, um erro de caminho ou de extensao deixaria a lista sempre vazia e o
    // teste passaria sem ter lido nada.
    const alvo = path.join(RAIZ, 'components/talkx/__tests__/contrasteAA.test.tsx');
    expect(fs.readFileSync(alvo, 'utf8')).toContain(PROIBIDA);
    expect(PERMITIDOS.has(alvo)).toBe(true);
  });

  it('o limite de cor crua segue pegando hsl( e rgb( com numero', () => {
    // Guarda do ajuste feito em TalkXSegmentProgressTable.test.tsx: o regex passou de
    // `\bhsla?\(` para `\bhsla?\(\s*\d`, para deixar passar `hsl(var(--token))` sem
    // deixar passar cor crua. Estes casos provam que o lado restritivo continua de pe.
    const CRUA_HSL = /\bhsla?\(\s*\d/i;
    const CRUA_RGB = /\brgba?\(\s*\d/i;
    expect('color: hsl(221 83% 35%)').toMatch(CRUA_HSL);
    expect('color: hsla(221, 83%, 35%, .5)').toMatch(CRUA_HSL);
    expect('color: rgb(12, 34, 56)').toMatch(CRUA_RGB);
    expect('color: hsl(var(--primary-text))').not.toMatch(CRUA_HSL);
    expect('class="text-[hsl(var(--primary-text))]"').not.toMatch(CRUA_HSL);
  });
});
