#!/usr/bin/env node
/**
 * Régua visual do Talk X — compara, lado a lado, os mockups de referência
 * (docs/talkx/references/NN_Nome.png) com as capturas determinísticas do app
 * (e2e/talkx-visual/captura-NN.png) geradas pelo spec `talkx-visual.spec.ts`.
 *
 * Telas ainda não implementadas (13/14/15) são marcadas com o conteúdo do
 * arquivo `nao-existe-NN.txt` escrito pelo spec.
 *
 * Uso:
 *   node scripts/talkx/lado-a-lado.mjs [--out <diretório>]
 * Saída: <diretório>/index.html (default: .tmp/regua/index.html)
 */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const refDir = join(root, 'docs/talkx/references');
const capDir = join(root, 'e2e/talkx-visual');

const outArgIdx = process.argv.indexOf('--out');
const outDir = outArgIdx >= 0 ? resolve(process.argv[outArgIdx + 1]) : join(root, '.tmp/regua');

// 1. Descobre os mockups (NN_Nome.png) e ordena por número.
const telas = readdirSync(refDir)
  .filter((f) => /^\d{2}_.+\.png$/.test(f))
  .sort()
  .map((f) => {
    const nn = f.slice(0, 2);
    const nome = f.slice(3, -4).replace(/_/g, ' ');
    return { nn, nome, mockSrc: f };
  });

// 2. Prepara o diretório de saída e copia as imagens (mock + captura).
mkdirSync(join(outDir, 'img', 'mock'), { recursive: true });
mkdirSync(join(outDir, 'img', 'captura'), { recursive: true });

const linhas = telas.map((t) => {
  copyFileSync(join(refDir, t.mockSrc), join(outDir, 'img', 'mock', `${t.nn}.png`));
  const capSrc = join(capDir, `captura-${t.nn}.png`);
  const naoSrc = join(capDir, `nao-existe-${t.nn}.txt`);
  const temCaptura = existsSync(capSrc);
  if (temCaptura) copyFileSync(capSrc, join(outDir, 'img', 'captura', `${t.nn}.png`));
  const naoExiste = existsSync(naoSrc) ? readFileSync(naoSrc, 'utf8').trim() : null;
  return { ...t, temCaptura, naoExiste };
});

const comCaptura = linhas.filter((l) => l.temCaptura).length;
const ausentes = linhas.length - comCaptura;

// 3. Gera o HTML lado a lado.
const cards = linhas
  .map((t) => {
    const mock = `<img src="img/mock/${t.nn}.png" alt="Mockup ${t.nome}" loading="lazy">`;
    const cap = t.temCaptura
      ? `<img src="img/captura/${t.nn}.png" alt="Captura ${t.nome}" loading="lazy">`
      : `<div class="falta">⚠️ Tela ainda não existe<div class="motivo">${t.naoExiste ?? ''}</div></div>`;
    const status = t.temCaptura
      ? '<span class="pill ok">capturada</span>'
      : '<span class="pill falta">não existe</span>';
    return `  <section class="card">
    <header><h2>${t.nn} — ${t.nome}</h2>${status}</header>
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
<p class="sub">${linhas.length} telas · ${comCaptura} capturadas · ${ausentes} ainda não existem · gerado pelo spec <code>e2e/talkx-visual.spec.ts</code></p>
${cards}
</body>
</html>
`;

writeFileSync(join(outDir, 'index.html'), html);
console.log(`régua: ${outDir}/index.html — ${linhas.length} telas (${comCaptura} capturas, ${ausentes} ausentes)`);
