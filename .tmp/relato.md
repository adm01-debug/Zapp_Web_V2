Especialista: worker (geral)

## Conclusão
CONCLUÍ. O critério de aceite do cartão está cumprido na base desta branch (dia/2026-10-12): framer-motion está em chunk próprio e NÃO está embutido no chunk vendor-ui do Radix. Nenhuma alteração foi necessária em vite.config.ts, então o diff de produção deste cartão é vazio por decisão, não por falha.

A separação veio no commit f8b28f13a — "perf(ci): separar framer-motion do chunk inicial e guardar a regra de chunking (SL-103B)" (cartão V2 261009031886fb), já presente no histórico desta branch.

## Regra de chunking hoje (verbatim)
- `{ name: "vendor-ui", priority: 80, test: /node_modules[\\/](@radix-ui|class-variance-authority|clsx|tailwind-merge)[\\/]/ }` (vite.config.ts linhas 99-100) — framer-motion removido daqui.
- `{ name: "vendor-motion", priority: 80, test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ }` (vite.config.ts linhas 106-107) — grupo dedicado, colocado depois do vendor-ui.

O cartão cita `manualChunks`; a config é Vite 8/rolldown (`build.rolldownOptions.output.codeSplitting.groups`), o mecanismo equivalente.

## Verificação (executada agora neste workspace)
- `npm run build` → exit status 0, linha final `✓ built in 12.29s`. Chunks emitidos: `dist/assets/vendor-motion-BDmqy6zw.js` (135.58 kB) e `dist/assets/vendor-ui-yBBNlVRr.js` (221.92 kB), dois arquivos distintos.
- Prova módulo→chunk pelos sourcemaps emitidos pelo próprio build:
  - `vendor-motion-BDmqy6zw.js.map`: 299 sources casando `node_modules/(framer-motion|motion-dom|motion-utils)`; 0 casando `@radix-ui`.
  - `vendor-ui-yBBNlVRr.js.map`: 52 sources casando `node_modules/@radix-ui`; 0 casando `framer-motion|motion-dom|motion-utils`.
- Guarda que trava a regra: `node --test scripts/ci/bundle-budget.unit.mjs` → `tests 7; pass 7; fail 0`, incluindo "framer-motion fica em grupo proprio, fora do vendor-ui do Radix".

## O que NÃO fiz e por quê
- Não editei vite.config.ts nem qualquer outro arquivo: o requisito já está satisfeito na base.
- Achado fora do escopo, registrado como comentário no cartão (comentário 11391), não como edição: um import estático ainda puxa o framer-motion no grafo do entry, então `dist/index.html` linha 120 faz modulepreload de `/assets/vendor-motion-BDmqy6zw.js` junto do entry `/assets/index-8HhNUKCo.js`. O chunk é separado do Radix, mas o runtime ainda é pré-carregado no first paint; tirar esse import é trabalho de outro cartão, fora do escopo declarado.
