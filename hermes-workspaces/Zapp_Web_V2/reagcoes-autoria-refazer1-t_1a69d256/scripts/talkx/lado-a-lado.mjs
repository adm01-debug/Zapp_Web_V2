#!/usr/bin/env node
/**
 * Régua visual do Talk X — compara, lado a lado, os mockups de referência
 * (docs/talkx/references/NN_Nome.png) com as capturas determinísticas do app
 * (e2e/talkx-visual/captura-NN.png) geradas pelo spec `talkx-visual.spec.ts`.
 *
 * A ausência de captura aparece com o MOTIVO REAL de cada tela, lido do disco e
 * da fixture (item 479/TX05 — "manter a ausência visível no placar"):
 *   - `capturada`      — há `captura-NN.png`;
 *   - `sem-dados`      — a fixture da tela ainda é `{}` (contrato de crescimento
 *                        X003/X004): a tela entra na régua quando a etapa dela
 *                        popular a fixture;
 *   - `sem-componente` — o spec gravou `nao-existe-NN.txt`: a tela ainda não
 *                        existe no app (13/14/15);
 *   - `sem-captura`    — a fixture TEM dados e não há captura: a régua deveria
 *                        ter medido e não mediu (rode o spec).
 * Só `sem-componente` pode dizer "não existe": tela que existe com fixture vazia
 * nunca é rotulada como inexistente, e captura de execução anterior (fixture já
 * esvaziada) não é reexibida como se fosse medida.
 *
 * Uso:
 *   node scripts/talkx/lado-a-lado.mjs [--out <diretório>]
 * Saída: <diretório>/index.html (default: .tmp/regua/index.html)
 */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REF_DIR = join(root, 'docs/talkx/references');
export const CAP_DIR = join(root, 'e2e/talkx-visual');
export const FIX_DIR = join(root, 'e2e/fixtures/talkx-demo');

/**
 * Fixture da tela `nn`: `{arquivo, comDados}` a partir do JSON da própria tela,
 * ou `undefined` quando não existe arquivo para ela.
 */
export function lerFixture(nn, fixDir = FIX_DIR) {
  if (!existsSync(fixDir)) return undefined;
  const arquivo = readdirSync(fixDir).find((f) => new RegExp(`^${nn}-.+\\.json$`).test(f));
  if (!arquivo) return undefined;
  const dados = JSON.parse(readFileSync(join(fixDir, arquivo), 'utf8'));
  return { arquivo, comDados: Object.keys(dados).length > 0 };
}

/**
 * Estado da tela no placar da régua, a partir do que a execução do spec deixou
 * no disco e da fixture real (nunca de um rótulo fixo).
 */
export function classificarTela({ temCaptura, naoExiste, fixture }) {
  if (naoExiste) return 'sem-componente';
  if (fixture?.comDados) return temCaptura ? 'capturada' : 'sem-captura';
  return 'sem-dados';
}

/** Rótulo, classe CSS e motivo de cada estado. O motivo é uma função da tela. */
const ESTADOS = {
  capturada: { rotulo: 'capturada', classe: 'ok', motivo: () => null },
  'sem-dados': {
    rotulo: 'sem dados ainda',
    classe: 'falta',
    motivo: (t) =>
      `fixture ${t.fixture ? t.fixture.arquivo : `${t.nn}-*.json`} ainda é {} — a tela entra na régua quando a etapa dela popular a fixture (contrato de crescimento X003/X004)`,
  },
  'sem-componente': {
    rotulo: 'não existe',
    classe: 'falta',
    motivo: (t) => t.naoExiste ?? `tela ainda não existe: ${t.nome}`,
  },
  'sem-captura': {
    rotulo: 'sem captura',
    classe: 'falta',
    motivo: (t) =>
      `a fixture ${t.fixture.arquivo} tem dados mas não há captura-${t.nn}.png — rode o spec da régua`,
  },
};

/** Resumo do placar, em ordem fixa (determinístico): "17 telas · N capturadas · ...". */
export function resumoDasTelas(linhas) {
  const contar = (estado) => linhas.filter((l) => l.estado === estado).length;
  return [
    `${linhas.length} telas`,
    `${contar('capturada')} capturadas`,
    `${contar('sem-dados')} sem dados ainda`,
    `${contar('sem-componente')} sem componente no app`,
    `${contar('sem-captura')} sem captura`,
  ].join(' · ');
}

/** Descobre os mockups (NN_Nome.png) de um diretório, ordenados por número. */
export function listarTelas(refDir = REF_DIR) {
  return readdirSync(refDir)
    .filter((f) => /^\d{2}_.+\.png$/.test(f))
    .sort()
    .map((f) => {
      const nn = f.slice(0, 2);
      const nome = f.slice(3, -4).replace(/_/g, ' ');
      return { nn, nome, mockSrc: f };
    });
}

/**
 * Monta o diretório da régua (imagens + index.html) e devolve as linhas do
 * placar — uma por tela, cada uma com `estado`, `fixture` e `naoExiste`.
 */
export function gerarRegua({ refDir = REF_DIR, capDir = CAP_DIR, fixDir = FIX_DIR, outDir } = {}) {
  mkdirSync(join(outDir, 'img', 'mock'), { recursive: true });
  mkdirSync(join(outDir, 'img', 'captura'), { recursive: true });

  const linhas = listarTelas(refDir).map((t) => {
    copyFileSync(join(refDir, t.mockSrc), join(outDir, 'img', 'mock', `${t.nn}.png`));
    const capturaSrc = join(capDir, `captura-${t.nn}.png`);
    const naoSrc = join(capDir, `nao-existe-${t.nn}.txt`);
    const fixture = lerFixture(t.nn, fixDir);
    const naoExiste = existsSync(naoSrc) ? readFileSync(naoSrc, 'utf8').trim() : null;
    const estado = classificarTela({ temCaptura: existsSync(capturaSrc), naoExiste, fixture });
    // Só entra no artefato a tela realmente capturada nesta régua.
    if (estado === 'capturada') {
      copyFileSync(capturaSrc, join(outDir, 'img', 'captura', `${t.nn}.png`));
    }
    return { ...t, fixture, naoExiste, estado };
  });

  const cards = linhas
    .map((t) => {
      const e = ESTADOS[t.estado];
      const mock = `<img src="img/mock/${t.nn}.png" alt="Mockup ${t.nome}" loading="lazy">`;
      const cap =
        t.estado === 'capturada'
          ? `<img src="img/captura/${t.nn}.png" alt="Captura ${t.nome}" loading="lazy">`
          : `<div class="falta">⚠️ ${e.rotulo}<div class="motivo">${e.motivo(t) ?? ''}</div></div>`;
      return `  <section class="card">
    <header><h2>${t.nn} — ${t.nome}</h2><span class="pill ${e.classe}">${e.rotulo}</span></header>
    <div class="lado">
      <figure class="painel"><figcaption>Mockup de referência</figcaption>${mock}</figure>
      <figure class="painel"><figcaption>App (captura determinística)</figcaption>${cap}</figure>
    </div>
  </section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Talk X — Régua visual (mock vs app)</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #0b0e14; color: #e6e9ef; font: 14px/1.5 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .sub { color: #8a93a6; margin: 0 0 24px; }
  .card { background: #12161f; border: 1px solid #232a38; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  .card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .card h2 { margin: 0; font-size: 16px; }
  .pill { padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: #123b2a; color: #4ade80; }
  .pill.falta { background: #3b1220; color: #f87171; }
  .lado { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .painel { margin: 0; }
  .painel figcaption { color: #8a93a6; font-size: 12px; margin-bottom: 6px; }
  .painel img { width: 100%; height: auto; border: 1px solid #2a3245; border-radius: 8px; background: #05070b; }
  .falta { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    min-height: 220px; border: 1px dashed #3b1220; border-radius: 8px; color: #f87171; background: #0e0b0f; }
  .motivo { font-size: 12px; color: #8a93a6; padding: 0 16px; text-align: center; }
  @media (max-width: 800px) { .lado { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Talk X — Régua visual</h1>
<p class="sub">${resumoDasTelas(linhas)} · gerado pelo spec <code>e2e/talkx-visual.spec.ts</code></p>
${cards}
</body>
</html>
`;

  writeFileSync(join(outDir, 'index.html'), html);
  return { linhas, outDir };
}

export function main(argv = process.argv.slice(2)) {
  const outArgIdx = argv.indexOf('--out');
  const outDir = outArgIdx >= 0 ? resolve(argv[outArgIdx + 1]) : join(root, '.tmp/regua');
  const { linhas } = gerarRegua({ outDir });
  console.log(`régua: ${outDir}/index.html — ${resumoDasTelas(linhas)}`);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) main();
