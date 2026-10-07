import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '../../../..');
const relatorioPath = join(raiz, 'docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md');
const capturasDir = join(aqui, 'capturas');
const relatorio = readFileSync(relatorioPath, 'utf8');
const medicoes = JSON.parse(readFileSync(join(capturasDir, 'medicoes.json'), 'utf8'));
const ok = [];
const falhas = [];
const guarda = (condicao, mensagem) => (condicao ? ok.push(mensagem) : falhas.push(mensagem));

for (const match of relatorio.matchAll(/`(docs\/design\/[^`]+?)`/g)) {
  const caminho = match[1];
  if (/[*/]/.test(caminho) || caminho.endsWith('**')) continue;
  guarda(existsSync(join(raiz, caminho)), `path existe: ${caminho}`);
}

guarda(existsSync(join(capturasDir, 'teclado-modo-selecao.jpg')), 'captura de teclado existe');

for (const captura of medicoes.capturas) {
  guarda(existsSync(join(capturasDir, captura.arquivo)), `captura existe: ${captura.arquivo}`);
  guarda(relatorio.includes(captura.arquivo), `captura citada: ${captura.arquivo}`);
}

const chave = (c) => `${c.tema}|${c.sidebar_colapsada ? 'colapsada' : 'expandida'}|${c.detalhes_contato ? 'aberto' : 'fechado'}`;
const laterais = new Set(medicoes.capturas.filter((c) => c.modo === 'grid' && typeof c.sidebar_colapsada === 'boolean' && typeof c.detalhes_contato === 'boolean').map(chave));
for (const tema of ['light', 'dark']) {
  for (const sidebar of ['expandida', 'colapsada']) {
    for (const detalhes of ['fechado', 'aberto']) {
      guarda(laterais.has(`${tema}|${sidebar}|${detalhes}`), `lateral coberta: ${tema}|${sidebar}|${detalhes}`);
    }
  }
}

const modos = new Set(medicoes.capturas.map((c) => c.modo).filter(Boolean));
for (const modo of ['grid', 'list', 'table']) guarda(modos.has(modo), `modo coberto: ${modo}`);

const colunas = new Set();
for (const captura of medicoes.capturas) {
  const m = /colunas-(\d+)-/.exec(captura.arquivo);
  if (m) colunas.add(m[1]);
}
for (const leitura of medicoes.colunas.leituras_por_layout) {
  for (const [numero, cabe] of Object.entries(leitura.cabe ?? {})) if (cabe || numero === '8') colunas.add(numero);
  for (const [rotulo] of leitura.opcoes ?? []) {
    const m = /^(\d+) colunas$/.exec(rotulo);
    if (m) colunas.add(m[1]);
  }
}
for (const n of ['4', '6', '8']) guarda(colunas.has(n), `coluna registrada: ${n}`);

guarda(!!medicoes.teclado_aria?.ordem_de_tab_dentro_da_aba?.length, 'teclado/ARIA medido');
guarda(Object.keys(medicoes.contraste_por_tema ?? {}).length === 3, 'contraste em light/dark/alto contraste');
guarda(!!medicoes.reducao_de_movimento?.reduceAtivo, 'redução de movimento medida');
guarda(relatorio.includes('PENDENTE') && relatorio.includes('sha256'), 'pendência de SHA/release declarada');

for (const msg of ok) console.log(`  ok  ${msg}`);
if (falhas.length) {
  console.error(`FALHAS (${falhas.length}):`);
  for (const msg of falhas) console.error(`  FALHA  ${msg}`);
  process.exit(1);
}
console.log(`AUDITORIA OK — ${ok.length} verificações, ${medicoes.capturas.length} capturas de matriz.`);
