Especialista: worker (geral)

## O que mudou e por quê
- Nada a mudar: a separação pedida pelo cartão JÁ existe na base desta branch (dia/2026-10-12), entregue pelo commit f8b28f13a — "perf(ci): separar framer-motion do chunk inicial e guardar a regra de chunking (SL-103B)", cartão V2 261009031886fb.
- vite.config.ts continua INTOCADO neste cartão (diff vazio por design). A regra que capturava framer-motion era o grupo `vendor-ui`; ela hoje é:
  - `{ name: "vendor-ui", priority: 80, test: /node_modules[\\/](@radix-ui|class-variance-authority|clsx|tailwind-merge)[\\/]/ }` (linhas 99-100) — sem framer-motion;
  - `{ name: "vendor-motion", priority: 80, test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ }` (linhas 106-107) — grupo dedicado, colocado depois do vendor-ui e reivindicando framer-motion + deps.
- O cartão fala em `manualChunks`; a config é Vite 8/rolldown (`codeSplitting.groups`), o mecanismo equivalente. Não reestruturei nem reordenei outros grupos.

## Prova
- comando de build: `npm run build` → exit status 0 (`✓ built in 12.29s`).
- Saída do build (separa os dois chunks):
  - `dist/assets/vendor-motion-BDmqy6zw.js  135.58 kB`
  - `dist/assets/vendor-ui-yBBNlVRr.js      221.92 kB`
- Prova módulo→chunk pelos sourcemaps emitidos (não por busca de texto):
  - vendor-motion-BDmqy6zw.js.map: 299 sources de `node_modules/framer-motion|motion-dom|motion-utils`; 0 de `@radix-ui`.
  - vendor-ui-yBBNlVRr.js.map: 52 sources de `node_modules/@radix-ui`; 0 de `framer-motion|motion-dom|motion-utils`.
- Guarda existente que trava a regra (SL-103B): `node --test scripts/ci/bundle-budget.unit.mjs` → `tests 7; pass 7; fail 0`, incluindo "framer-motion fica em grupo proprio, fora do vendor-ui do Radix" e "o grupo do runtime de animacao nao captura pacotes vizinhos por nome parecido".

## O que NÃO fiz e por quê
- Não editei nenhum arquivo (escopo do cartão era só vite.config.ts, e ele já satisfaz o critério).
- Não tirei o import estático que ainda puxa o framer-motion para o grafo inicial: `dist/index.html` linha 120 faz modulepreload de `/assets/vendor-motion-BDmqy6zw.js`. O cartão manda registrar isso como comentário e não corrigir. Registrado no comentário do cartão (comentário 11391).
- Nenhum arquivo além de vite.config.ts foi tocado; qualquer alteração fora dele seria fora do escopo.

## Ressalva
- Critério "framer-motion fora do chunk inicial": o chunk é próprio e NÃO está embutido no vendor-ui/Radix (critério atendido). Porém ele ainda é pré-carregado no first paint porque um import estático o puxa no grafo do entry — remover esse import é trabalho de outro cartão, fora do escopo declarado aqui.
