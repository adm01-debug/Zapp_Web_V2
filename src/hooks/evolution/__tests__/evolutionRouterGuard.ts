/**
 * Varredura estática da guarda "front → evolution-api" (ver rotas-chamadas-existem.test.ts).
 * Funções puras sobre TEXTO, para a própria guarda poder ser testada por simulação.
 */

export interface Chamada { acao: string; arquivo: string; forma: string }

/** Ações tratadas pelo roteador (`action === '<ação>'`, inclusive em `a || b`). */
export function acoesDoRoteador(fonteDoRoteador: string): Set<string> {
  return new Set([...fonteDoRoteador.matchAll(/action === '([a-z0-9-]+)'/g)].map((m) => m[1]));
}

const FORMAS: Array<{ forma: string; re: RegExp }> = [
  // invoke('evolution-api/<ação>') e qualquer literal com o caminho
  { forma: 'caminho', re: /['"`]evolution-api\/([a-z0-9-]+)['"`]/g },
  // atalhos do useEvolutionApiCore, em QUALQUER arquivo (hooks/evolution, hooks/integrations…)
  { forma: 'callApi/withToast', re: /\b(?:callApi|withToast)\(\s*['"]([a-z0-9-]+)['"]/g },
  // invoke('evolution-api', { body: { action: '<ação>' } }) — ação no corpo
  { forma: 'corpo', re: /invoke\(\s*['"`]evolution-api['"`]\s*,\s*\{[\s\S]{0,400}?\baction\s*:\s*['"]([a-z0-9-]+)['"]/g },
];

/** Uso dinâmico (`evolution-api/${...}`): não dá para ler a ação do texto. */
const DINAMICO = /`evolution-api\/\$\{/;

export function acoesChamadas(arquivos: Array<{ arquivo: string; texto: string }>): { chamadas: Chamada[]; dinamicos: string[] } {
  const chamadas: Chamada[] = [];
  const dinamicos: string[] = [];
  for (const { arquivo, texto } of arquivos) {
    for (const { forma, re } of FORMAS) {
      for (const m of texto.matchAll(re)) chamadas.push({ acao: m[1], arquivo, forma });
    }
    if (DINAMICO.test(texto)) dinamicos.push(arquivo);
  }
  return { chamadas, dinamicos };
}
