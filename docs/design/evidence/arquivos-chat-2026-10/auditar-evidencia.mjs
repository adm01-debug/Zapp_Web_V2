import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '../../../..');
const relatorioPath = process.env.AUDIT_RELATORIO
  ? resolve(process.env.AUDIT_RELATORIO)
  : join(raiz, 'docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md');
const capturasDir = process.env.AUDIT_CAPTURAS_DIR ? resolve(process.env.AUDIT_CAPTURAS_DIR) : join(aqui, 'capturas');
const medicoesPath = process.env.AUDIT_MEDICOES ? resolve(process.env.AUDIT_MEDICOES) : join(capturasDir, 'medicoes.json');
const relatorio = readFileSync(relatorioPath, 'utf8');
const medicoes = JSON.parse(readFileSync(medicoesPath, 'utf8'));
const ok = [];
const falhas = [];
const guarda = (condicao, mensagem) => (condicao ? ok.push(mensagem) : falhas.push(mensagem));

const markdownRows = relatorio
  .split('\n')
  .filter((linha) => linha.trim().startsWith('|') && !/^\|\s*-+/.test(linha.trim()))
  .map((linha) => linha.trim());

const capturaPorArquivo = new Map(medicoes.capturas.map((captura) => [captura.arquivo, captura]));

const caminhoExiste = (caminho) => {
  if (caminho.startsWith('docs/design/')) return existsSync(join(raiz, caminho));
  if (caminho.startsWith('capturas/')) return existsSync(join(aqui, caminho));
  if (capturaPorArquivo.has(caminho) || ['.jpg', '.jpeg', '.png', '.json', '.txt'].includes(extname(caminho))) {
    return existsSync(join(capturasDir, basename(caminho)));
  }
  return true;
};

for (const match of relatorio.matchAll(/`([^`]+?)`/g)) {
  const caminho = match[1].trim();
  if (caminho.includes('*')) continue;
  if (!caminho.startsWith('docs/design/') && !caminho.startsWith('capturas/') && !capturaPorArquivo.has(caminho)) continue;
  guarda(caminhoExiste(caminho), `path existe: ${caminho}`);
}

guarda(existsSync(medicoesPath), 'medicoes.json existe');
guarda(existsSync(join(capturasDir, 'teclado-modo-selecao.jpg')), 'captura de teclado existe');

guarda(relatorio.includes('log-spec-files-tab.txt'), 'log do spec citado no relatório');
guarda(relatorio.includes('medicoes.json'), 'medicoes.json citado no relatório');

for (const captura of medicoes.capturas) {
  guarda(existsSync(join(capturasDir, captura.arquivo)), `captura existe: ${captura.arquivo}`);
  const linha = markdownRows.find((row) => row.includes(captura.arquivo));
  guarda(!!linha, `captura citada em linha de tabela: ${captura.arquivo}`);
}

const rotuloSidebar = (colapsada) => (colapsada ? 'colapsada' : 'expandida');
const rotuloDetalhes = (aberto) => (aberto ? 'aberto' : 'fechado');
const linhaComCaptura = (arquivo) => markdownRows.find((row) => row.includes(arquivo));
const linhaTem = (linha, partes) => partes.every((parte) => linha?.includes(parte));

for (const tema of ['light', 'dark']) {
  for (const sidebarColapsada of [false, true]) {
    for (const detalhesContato of [false, true]) {
      const captura = medicoes.capturas.find(
        (c) =>
          c.modo === 'grid' &&
          c.tema === tema &&
          c.sidebar_colapsada === sidebarColapsada &&
          c.detalhes_contato === detalhesContato,
      );
      const descricao = `${tema}|${rotuloSidebar(sidebarColapsada)}|${rotuloDetalhes(detalhesContato)}|grid`;
      guarda(!!captura, `matriz medida: ${descricao}`);
      if (captura) {
        const linha = linhaComCaptura(captura.arquivo);
        guarda(
          linhaTem(linha, [captura.arquivo, tema, rotuloSidebar(sidebarColapsada), rotuloDetalhes(detalhesContato), 'grid']),
          `matriz no relatório: ${descricao}`,
        );
      }
    }
  }
}

for (const modo of ['grid', 'list', 'table']) {
  const captura = medicoes.capturas.find((c) => c.modo === modo);
  guarda(!!captura, `modo medido: ${modo}`);
  if (captura) guarda(linhaTem(linhaComCaptura(captura.arquivo), [captura.arquivo, modo]), `modo no relatório: ${modo}`);
}

for (const n of ['4', '6']) {
  const captura = medicoes.capturas.find((c) => c.arquivo.startsWith(`colunas-${n}-`));
  guarda(!!captura, `coluna medida com captura: ${n}`);
  if (captura) {
    guarda(linhaTem(linhaComCaptura(captura.arquivo), [captura.arquivo, `${n} cabe`]), `coluna no relatório: ${n}`);
  }
}

const linhasColuna8 = markdownRows.filter((row) => /(^|\|)\s*8 colunas\s*(\||$)/i.test(row));
guarda(linhasColuna8.some((row) => /PENDENTE/i.test(row)), 'coluna 8 registrada como PENDENTE no relatório');
const leiturasEstaveis = medicoes.colunas.leituras_por_layout.filter((leitura) => leitura.estavel === true && leitura.cabe);
guarda(leiturasEstaveis.length > 0, 'leituras estáveis de colunas presentes');
guarda(leiturasEstaveis.every((leitura) => leitura.cabe['8'] === false), 'leituras estáveis recusam 8 colunas');

const leituraInstavel8 = medicoes.colunas.leituras_por_layout.some(
  (leitura) =>
    leitura.estavel !== true &&
    leitura.tema === 'dark' &&
    leitura.sidebar_colapsada === true &&
    leitura.detalhes_contato === false &&
    (leitura.opcoes ?? []).some(([rotulo, cabe]) => rotulo === '8 colunas' && cabe === true),
);
if (leituraInstavel8) {
  guarda(
    /inst[aá]vel/i.test(relatorio) && /dark/i.test(relatorio) && /colapsada/i.test(relatorio) && /fechado/i.test(relatorio),
    'divergência da leitura instável de 8 colunas explicada',
  );
}

guarda(!/abas\s+1[–-]7/i.test(relatorio), 'ordem de Tab não afirma abas 1–7 sem medição');
guarda(/passo\s+8/i.test(relatorio) || /8[–-]12/.test(relatorio), 'ordem de Tab começa na sequência versionada');

guarda(!!medicoes.teclado_aria?.ordem_de_tab_dentro_da_aba?.length, 'teclado/ARIA medido');
guarda(Object.keys(medicoes.contraste_por_tema ?? {}).length === 3, 'contraste em light/dark/alto contraste');
guarda(!!medicoes.reducao_de_movimento?.reduceAtivo, 'redução de movimento medida');

guarda(/PENDENTE/i.test(relatorio) && /sha256/i.test(relatorio), 'pendência de SHA/release declarada');
guarda(!/sha256\s+`?[a-f0-9]{64}`?/i.test(relatorio), 'sha256 numérico não é afirmado sem prova versionada');
guarda(!/ETag\s+`?W\//i.test(relatorio), 'ETag não é afirmado sem prova versionada');

for (const msg of ok) console.log(`  ok  ${msg}`);
if (falhas.length) {
  console.error(`FALHAS (${falhas.length}):`);
  for (const msg of falhas) console.error(`  FALHA  ${msg}`);
  process.exit(1);
}
console.log(`AUDITORIA OK — ${ok.length} verificações, ${medicoes.capturas.length} capturas de matriz.`);
