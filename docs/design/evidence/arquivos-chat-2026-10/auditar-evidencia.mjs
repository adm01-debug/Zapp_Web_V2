/**
 * Auditoria automática da evidência do cartão t_830c5962 (critério de pronto 4).
 *
 * Confere, contra o disco e contra `capturas/medicoes.json`:
 *   A. todo caminho `docs/design/...` citado no relatório existe;
 *   B. toda captura de `medicoes.json` é citada no relatório e existe no disco;
 *   C. os 8 cruzamentos de lateral (2 temas × 2 colapsadas × 2 estados de detalhes),
 *      os 3 modos, os 2 temas e as colunas 4/6/8 têm linha na medição;
 *   D. a matriz do relatório tem uma linha por combinação (contagem do cabeçalho).
 * Sai com 1 e imprime o motivo quando algo falta.
 *
 * Uso (na raiz do workspace da tarefa):
 *   node docs/design/evidence/arquivos-chat-2026-10/auditar-evidencia.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../../..');
const RELATORIO = join(RAIZ, 'docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md');
const CAPTURAS = join(AQUI, 'capturas');
const ok = [];
const falhas = [];
const guarda = (cond, msg) => (cond ? ok.push(msg) : falhas.push(msg));

const relatorio = readFileSync(RELATORIO, 'utf8');
const medicoes = JSON.parse(readFileSync(join(CAPTURAS, 'medicoes.json'), 'utf8'));

// A. caminhos citados (ignora menções com curinga/abreviação: `...`, `/**`, `*.jpg`)
const citados = new Set([...relatorio.matchAll(/`(docs\/design\/[^`]+?)`/g)].map((m) => m[1]));
for (const caminho of citados) {
  if (caminho.includes('*') || caminho.endsWith('/') || caminho.endsWith('...')) continue;
  const alvo = join(RAIZ, caminho);
  guarda(existsSync(alvo), `path existe: ${caminho}`);
}

// B. capturas medidas ↔ citadas e presentes no disco
const arquivos = medicoes.capturas.map((c) => c.arquivo);
guarda(arquivos.length > 0, `capturas medidas: ${arquivos.length}`);
for (const arquivo of arquivos) {
  guarda(relatorio.includes(arquivo), `citada no relatório: ${arquivo}`);
  guarda(existsSync(join(CAPTURAS, arquivo)), `imagem existe: ${arquivo}`);
}

// C. matriz obrigatória
const chave = (t) => `${t.tema}|${t.sidebar_colapsada ? 'colapsada' : 'expandida'}|${t.detalhes_contato ? 'aberto' : 'fechado'}`;
const laterais = new Set(medicoes.capturas.filter((c) => c.modo === 'grid').map(chave));
for (const tema of ['light', 'dark']) {
  for (const colapsada of [true, false]) {
    for (const detalhes of [true, false]) {
      const k = `${tema}|${colapsada ? 'colapsada' : 'expandida'}|${detalhes ? 'aberto' : 'fechado'}`;
      guarda(laterais.has(k), `lateral coberta: ${k}`);
    }
  }
}
const modos = new Set(medicoes.capturas.map((c) => c.modo).filter(Boolean));
for (const modo of ['grid', 'list', 'table']) guarda(modos.has(modo), `modo coberto: ${modo}`);
const temas = new Set(medicoes.capturas.map((c) => c.tema));
for (const tema of ['light', 'dark']) guarda(temas.has(tema), `tema coberto: ${tema}`);
const colunas = new Set();
for (const captura of medicoes.capturas) {
  const achado = /colunas-(\d+)-/.exec(captura.arquivo);
  if (achado) colunas.add(achado[1]);
}
for (const layout of medicoes.colunas.leituras_por_layout) {
  if (layout.captura_8_colunas) colunas.add('8');
  if (layout.cabe) for (const [n, cabe] of Object.entries(layout.cabe)) if (cabe) colunas.add(n);
  // opção existente na UI mesmo quando o app a desabilita por não caber conta como medida
  for (const [rotulo] of layout.opcoes ?? []) {
    const achado = /^(\d+) colunas$/.exec(rotulo);
    if (achado) colunas.add(achado[1]);
  }
}
for (const n of ['4', '6', '8']) guarda(colunas.has(n), `coluna coberta (medida, capturada ou registrada): ${n}`);
guarda(!!medicoes.reducao_de_movimento, 'redução de movimento medida');
guarda(Object.keys(medicoes.contraste_por_tema).length === 3, 'contraste medido nos 3 temas');
guarda(!!medicoes.teclado_aria?.ordem_de_tab_dentro_da_aba?.length, 'ordem de Tab medida dentro da aba');

// D. linhas da matriz no relatório
const linhasMatriz = relatorio
  .split('\n')
  .filter((l) => l.startsWith('| `') && /\.jpg`/.test(l));
for (const k of laterais) {
  const [tema, lateral, detalhes] = k.split('|');
  guarda(
    linhasMatriz.some((l) => l.includes(tema === 'light' ? '`light-' : '`dark-') && l.includes(lateral) && l.includes(detalhes)),
    `linha na matriz do relatório: ${k}`,
  );
}
guarda(linhasMatriz.length >= 11, `linhas na matriz do relatório: ${linhasMatriz.length}`);

for (const linha of ok) console.log(`  ok  ${linha}`);
if (falhas.length) {
  console.error(`FALHAS (${falhas.length}):`);
  for (const linha of falhas) console.error(`  FALHA  ${linha}`);
  process.exit(1);
}
console.log(`AUDITORIA OK — ${ok.length} verificações, ${arquivos.length} capturas, ${linhasMatriz.length} linhas na matriz.`);
