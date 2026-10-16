/**
 * Plural pt-BR — **fonte única** dos rótulos com contagem.
 *
 * O defeito que originou este módulo (`t_68472f55`) foi formar o plural por sufixo: colar a
 * terminação de plural na palavra, em vez de escolher a palavra inteira. Aqui a palavra
 * INTEIRA é escolhida pelo número que aparece no rótulo — `plural(1, 'reação', 'reações')`
 * devolve `1 reação` e `plural(3, 'reação', 'reações')` devolve `3 reações`.
 *
 * A função não decide nada de regra de negócio: só monta `"<n> <palavra>"`, de modo que o
 * número exibido e a forma da palavra saem do MESMO argumento e nunca se contradizem.
 */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
