#!/usr/bin/env node
/**
 * X055 — gera a matriz tela × estado do Talk X em `docs/talkx/ESTADOS.md`.
 *
 * A matriz é LIDA DO CÓDIGO: para cada tela de `src/components/talkx/*.tsx` e
 * para cada estado do sistema, o gerador lista as linhas onde o estado é
 * adotado — em vez de um texto escrito à mão que envelhece sozinho.
 *
 * Uso:
 *   node scripts/talkx/gen-estados.mjs           # escreve docs/talkx/ESTADOS.md
 *   node scripts/talkx/gen-estados.mjs --check   # rc 1 se o arquivo divergir
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const TELAS_DIR = join(root, 'src/components/talkx');
export const SAIDA = join(root, 'docs/talkx/ESTADOS.md');

/**
 * Estado do sistema → marcadores que o implementam no código.
 * `error`: quem decide o estado de erro é o boundary (`TalkXQueryBoundary`),
 * então a tela que adota o boundary adota o erro.
 */
export const ESTADOS = [
  { id: 'empty', titulo: 'Vazio', padroes: [/<TalkX(?:Empty|FilteredEmpty)State\b/] },
  { id: 'loading', titulo: 'Carregando (esqueleto)', padroes: [/<TalkXSkeletonRows\b/, /<KpiCardSkeleton\b/] },
  { id: 'error', titulo: 'Erro de consulta', padroes: [/<TalkXQueryBoundary\b/] },
  { id: 'crm', titulo: 'CRM 360 indisponível', padroes: [/<TalkXCrmUnavailableState\b/] },
  { id: 'wa', titulo: 'WhatsApp desconectado', padroes: [/<TalkXWhatsAppDisconnectedState\b/] },
  { id: 'perm', titulo: 'Sem permissão', padroes: [/<TalkXNoPermissionState\b/] },
];

/** Os valores aceitos por `?talkxState=` (prancha de referência, X055). */
export const ESTADOS_FORCADOS = ['empty', 'loading', 'error', 'crm', 'wa', 'perm'];

/** Linhas de `texto` onde cada estado aparece (1-based, na ordem do arquivo). */
export function varrerTela(texto, estados = ESTADOS) {
  const linhas = texto.split('\n');
  const achados = {};
  for (const estado of estados) {
    const hits = [];
    linhas.forEach((linha, indice) => {
      if (estado.padroes.some((re) => re.test(linha))) hits.push(indice + 1);
    });
    achados[estado.id] = hits;
  }
  return achados;
}

/** Telas do módulo (`TalkX*.tsx`), em ordem alfabética. */
export function telasDoModulo(dir = TELAS_DIR) {
  return readdirSync(dir)
    .filter((nome) => nome.startsWith('TalkX') && nome.endsWith('.tsx')
      && !nome.includes('.test.') && !nome.includes('.spec.'))
    .sort();
}

/** Matriz: uma entrada por tela, com as linhas de cada estado adotado. */
export function matriz(dir = TELAS_DIR, estados = ESTADOS) {
  return telasDoModulo(dir).map((arquivo) => ({
    arquivo,
    achados: varrerTela(readFileSync(join(dir, arquivo), 'utf8'), estados),
  }));
}

function celula(linhas) {
  return linhas.length > 0 ? linhas.map((l) => `\`${l}\``).join(', ') : '—';
}

/** Markdown completo de `docs/talkx/ESTADOS.md`. */
export function renderMarkdown(linhas, estados = ESTADOS, dir = TELAS_DIR) {
  const caminho = (arquivo) => relative(root, join(dir, arquivo)).split('\\').join('/');
  const porEstado = estados.map((estado) => ({
    ...estado,
    total: linhas.filter((l) => (l.achados[estado.id] ?? []).length > 0).length,
  }));

  const cabecalho = `| Tela | ${estados.map((e) => e.titulo).join(' | ')} |`;
  const separador = `|---|${estados.map(() => '---').join('|')}|`;
  const corpo = linhas
    .map((l) => `| \`${caminho(l.arquivo)}\` | ${estados.map((e) => celula(l.achados[e.id] ?? [])).join(' | ')} |`)
    .join('\n');

  const foraDasTelas = estados.filter((e) => !linhas.some((l) => (l.achados[e.id] ?? []).length > 0));

  return `# Talk X — matriz tela × estado (X055)

> Gerado por \`node scripts/talkx/gen-estados.mjs\`. Não edite à mão: rode o
> gerador. \`node scripts/talkx/gen-estados.mjs --check\` falha quando este
> arquivo divergir do código.

Cada célula traz o \`arquivo:linha\` onde a tela adota aquele estado do sistema.
\`—\` significa que a tela ainda não trata o estado (dívida conhecida, não
esquecimento).

Estado forçado para conferência visual (prancha \`?view=talkx-kit\`, só em DEV ou
com \`VITE_TALKX_KIT=1\`):
${ESTADOS_FORCADOS.map((e) => `\`?talkxState=${e}\``).join(' · ')}

${cabecalho}
${separador}
${corpo}

## Resumo

${porEstado.map((e) => `- **${e.titulo}**: ${e.total} de ${linhas.length} telas`).join('\n')}

## Como usar

1. \`node scripts/talkx/gen-estados.mjs\` regenera este arquivo.
2. \`node scripts/talkx/gen-estados.mjs --check\` (rc 0) prova que ele bate com o código.
3. Para ver o estado na tela de verdade: abra o módulo com
   \`?view=talkx&talkxState=<valor>\` (ex.: \`error\`) e confira contra
   \`docs/talkx/references/17_Estados_do_Sistema_e_Modais.png\`.

${foraDasTelas.length > 0
    ? `Estados sem nenhuma tela adotando: ${foraDasTelas.map((e) => e.titulo).join(', ')}.`
    : 'Todos os estados têm pelo menos uma tela adotando.'}
`;
}

/** Markdown gerado a partir do repositório. */
export function gerar(dir = TELAS_DIR, estados = ESTADOS) {
  return renderMarkdown(matriz(dir, estados), estados, dir);
}

export function main(argv) {
  const check = argv.includes('--check');
  const gerado = gerar();
  if (check) {
    if (!existsSync(SAIDA)) {
      console.error(`gen-estados: ${relative(root, SAIDA)} não existe — rode sem --check.`);
      return 1;
    }
    const atual = readFileSync(SAIDA, 'utf8');
    if (atual !== gerado) {
      console.error(`gen-estados: ${relative(root, SAIDA)} divergiu do código — rode o gerador.`);
      return 1;
    }
    console.log('gen-estados: ESTADOS.md bate com o código.');
    return 0;
  }
  writeFileSync(SAIDA, gerado);
  console.log(`gen-estados: ${relative(root, SAIDA)} atualizado (${telasDoModulo().length} telas).`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
