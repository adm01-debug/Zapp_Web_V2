Task t_e56122a6: Auditar chunking atual e medir baseline do Initial JS
  status:    running
  assignee:  complexo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_b8e7fd7b
  max-retries: 2 (default)
  created:   2026-10-09 03:31 by auto-decomposer
  started:   2026-10-09 03:31
  parents:   t_41aa965f, t_7ef087b9, t_84f25934, t_8a0b74b4, t_f8527549
  children:  t_28e3bbc3, t_7c914514, t_b8e7fd7b

Body:
Objetivo: estabelecer o estado real antes de mexer em config, e validar a dependência do cartão t_2f1569a7.

Passos:
1. Confirmar no git que o cartão t_2f1569a7 já entrou (retirada do framer-motion do skip-link) e identificar o commit/PR.
2. Procurar por importadores estáticos de framer-motion em componentes do caminho inicial: grep por `from 'framer-motion'` / `require('framer-motion')` em src de componentes (não em config).
3. Ler vite.config.ts e mapear como `manualChunks` agrupa hoje framer-motion e o vendor de Radix/UI; identificar em qual chunk o framer-motion cai.
4. Rodar `node scripts/ci/bundle-budget.mjs` e registrar os números atuais (Initial JS gzip e por-chunk), e ler performance-budget.json (teto atual 341 KB).

Entregável: relatório curto com (a) números de baseline (antes), (b) mapa de chunks mostrando onde framer-motion está, (c) veredito explícito sobre se t_2f1569a7 está completo.

Critério de bloqueio: se ainda houver importador estático de framer-motion no caminho inicial, NÃO prosseguir com o ajuste de budget — comentar no cartão que o escopo anterior está incompleto e bloquear.

Só leitura de arquivos; não editar nada fora do relatório/comentário.

Latest summary:
Critério de bloqueio do cartão mantido na ponta atual (dia/2026-10-09 @ 68980bf5e): o caminho inicial AINDA tem import estático de framer-motion — único importador `src/components/ui/skip-link.tsx:2` — e o first paint mede 343.9 KB gzip > 341 (rc=1, 14 chunks), com `vendor-motion` 43.0 KB pré-carregado pelo entry. Falta SÓ o SL-103C: `f89369657` existe mas não é ancestral da branch do dia, alcançável apenas de `refs/heads/v2/t-2f1569a7-2610090310a07f`. SL-103A (`d785a66c2`) e SL-103B (`f8b28f13a`) já foram integrados às 09:25:47. Ação: integrador publicar `f89369657` na branch do dia; depois o que sobra é o teto, e há achado novo para o cartão irmão t_7c914514 — com o runtime fora do grafo o medido é 301.0 KB, então teto 300 ainda fica vermelho por 1.0 KB (sugerido 310). Auditoria só-leitura: nenhum arquivo do projeto alterado. Relatório completo, números crus e caminhos de evidência no comentário.

Comments (10):
  [2026-10-09 03:35] complexo: **Especialista: complexo (área: build/CI — auditoria só-leitura).** Relatório da auditoria. Base do workspace: `dia/2026-10-09` @ `2a4798695`. Nada do projeto foi alterado (`git status` limpo); scripts de medição e logs ficaram em `.tmp/` do workspace.

## (a) Números de baseline (antes) — medidos agora
`bun install --frozen-lockfile` + `bun run build` (vite produção, 12,0s) + `node scripts/ci/bundle-budget.mjs` (gzip zlib nível 9, igual ao CI) → `.tmp/budget-base.txt`:

- **JS inicial: 342,6 KB gzip (teto 341 KB) → rc=1, VERMELHO** em 13 chunks
- CSS inicial: 41,5 KB (teto 80) OK · Maior chunk JS (inclui lazy): 492,3 KB (teto 550) OK · Assets totais: 3.028,6 KB (teto 4.100) OK
- Por chunk inicial: `vendor-ui` **107,5** · `vendor-core` 79,4 · `index` 68,3 · `vendor-data` 61,5 · `vendor-utils` 13,5 · `dist`(sonner) 9,1 · menores ≤0,9

## (b) Onde o framer-motion está (mapa de chunks)
`vite.config.ts` **não usa `manualChunks`**: o agrupamento é `build.rolldownOptions.output.codeSplitting.groups` (rolldown nativo, `includeDependenciesRecursively: true`) e não existe grupo próprio para animação. O grupo `vendor-ui` (priority 80) casa `node_modules[\/](@radix-ui|framer-motion|class-variance-authority|clsx|tailwind-merge)[\/]` — ou seja, **framer-motion cai no mesmo chunk do Radix**.

- Prova por sourcemap: `framer-motion/`, `motion-dom/` e `motion-utils/` aparecem **só** em `dist/assets/vendor-ui-*.js.map`; nenhum outro chunk do first paint os contém.
- Composição do `vendor-ui` por código-fonte (`.tmp/mapa-chunks.txt`): `motion-dom` 346 KB-fonte (29%), `framer-motion` 162 KB (14%), `tailwind-merge` 104 KB (9%), `@radix-ui/react-select` 52 KB (4%).
- Medição diferencial (não editei nada do projeto: `node node_modules/vite/bin/vite.js build --config .tmp/vite.sem-framer.ts`, que só troca `framer-motion` por um stub e escreve em `.tmp/dist-sem-framer`) → `.tmp/budget-sem-framer.txt`: `vendor-ui` 107,5 → **64,9 KB** e JS inicial 342,6 → **300,2 KB gzip (rc=0)**.
- **Conclusão do mapa: tirar o framer-motion do grafo inicial libera 42,4 KB gzip** e deixa o Initial JS em ~300,2 KB — a meta de 300 KB é justa e não exige aperto de teto acima do real.

## Grafo estático do caminho inicial (BFS só de import estático a partir de `src/main.tsx`, 99 arquivos) → `.tmp/grafo-estatico.txt`
6 pontos de entrada (e não 1):
1. `App.tsx -> components/ui/skip-link.tsx` (o do SL-103C)
2. `App.tsx -> components/errors/ErrorBoundary.tsx -> components/ui/button.tsx`
3. `App.tsx -> components/errors/ErrorBoundary.tsx -> components/ui/card.tsx`
4. `App.tsx -> providers/AppProviders.tsx -> components/ui/accessible-toast.tsx`
5. `App.tsx -> routes/AppRoutes.tsx -> components/transitions/index.ts -> transitions/RouteTransition.tsx`
6. `... -> transitions/transitionVariants.ts` (import só de tipo)

## (c) Veredito explícito sobre t_2f1569a7
**INCOMPLETO como dependência deste cartão — e o escopo anterior não está no estado real.**
- O cartão é `done`, com commit `f89369657` ("perf(components): tirar o framer-motion do skip-link inicial (SL-103C)", 2 arquivos: `skip-link.tsx` + teste novo) na branch `v2/t-2f1569a7-2610090310a07f` (única ref que o contém; não há PR — V2 é local).
- `git merge-base --is-ancestor f89369657 dia/2026-10-09` → **NÃO** (idem `1d31ed22d`/SL-103A, só em `v2/sl-103a-framer-motion-caminho-inicial-2610090230c8ec`; e `8696cd395`/SL-103B, só em `v2/t-c91e2a5f-261009031886fb`).
- Na base, o defeito continua inteiro: `src/components/ui/skip-link.tsx:2` ainda é `import { motion, AnimatePresence } from 'framer-motion'` e `src/components/ui/__tests__/skip-link.test.tsx` **não existe**. Somado aos itens 2–6 acima, o runtime de animação segue no first paint: 342,6 KB é o número real de hoje.
- Ou seja: o critério do próprio SL-103C foi provado na branch dele, mas **o efeito não chegou à base** — a dependência que este cartão veio validar **não está satisfeita**, e o alvo ≤300 KB é inalcançável no estado atual (medido: só o stub do framer-motion chega a 300,2 KB).

## Ação necessária / achado
1. O integrador precisa publicar na branch do dia os 4 commits que já estão na fila: `1d31ed22d` (SL-103A), `f89369657` (SL-103C) e `8696cd395` + `f6f64f078` (SL-103B). Com eles na árvore, o que sobra para o ajuste de budget é só `performance-budget.json` `maxKB` 341→300 (o `vendor-motion` sai do inicial).
2. Achado: **nenhum dos 5 cartões em que o auto-decomposer quebrou `t_b8e7fd7b` cobre essa publicação** — `t_28e3bbc3` (senior, chunking), `t_7c914514` (default, teto), `t_b2eb0e42` (workertestes, teste do ratchet) e `t_1e4bc1ed` (vera, verificação) supõem a base já corrigida. Sem a integração, `t_7c914514` bate no mesmo muro: apertar o teto para 300 com a árvore atual deixa o gate vermelho (`initial-js 342,6 > 300`, rc=1 medido).
3. `hotspot: vite.config.ts` — a regra de chunking do framer-motion já foi entregue em `8696cd395` (SL-103B/`t_c91e2a5f`); reaplicar aqui colide.

Evidência reprodutível no meu workspace `~/hermes-workspaces/Zapp_Web_V2/auditar-chunking-baseline-26100903313e7a/.tmp/`: `budget-base.txt`, `budget-sem-framer.txt`, `mapa-chunks.txt`, `grafo-estatico.txt`, `build.log`, `build-sem-framer.log`, `grafo-estatico.mjs`, `mapa-chunks.mjs`, `vite.sem-framer.ts` + `framer-stub.tsx`.
  [2026-10-09 03:38] coordenador: Especialista: coordenador. Decisão do sensor `blk:t_e56122a6`: bloqueio legítimo por critério do próprio cartão, não infraestrutura nem erro de roteamento. O `complexo` entregou a auditoria só-leitura e provou que a base ainda não contém os commits necessários (`1d31ed22d`, `f89369657`, `8696cd395` + `f6f64f078`); portanto não vou desbloquear, reatribuir nem criar substituto. Manter bloqueado até o integrador publicar os commits já concluídos na branch do dia; soltar os filhos agora geraria retrabalho/duplicação.
  [2026-10-09 09:34] default: [auditor] Auditor 09:30: SL-103B (f8b28f13a) e SL-103A (d785a66c2) foram integrados em dia/2026-10-09 às 09:25:47. Desbloqueado para remedir o Initial JS na ponta atual; se SL-103C (f89369657) ainda faltar, bloquear de novo citando só ele.
  [2026-10-09 09:35] default: [jev-entrada] COMANDO FIXO (antes: grave o corpo deste cartão em .tmp/cartao.md dentro do WORKSPACE do hermes-tarefa-iniciar):
devin -p --model swe --permission-mode dangerous --respect-workspace-trust false -- "Execute a tarefa do cartao t_e56122a6 descrita em .tmp/cartao.md, trabalhando so neste workspace. Antes de editar, abra a skill de area do cartao (area-* nas suas skills). Corrija TODOS os caminhos do defeito (concorrencia, lista vazia, proxima pagina, erro da segunda escrita). Escreva teste que FALHA sem a correcao e chama o codigo real (SQL roda no banco local, nunca mock). Mexa so nos arquivos do cartao e confira git diff --stat contra o titulo. Antes de terminar, abra autorrevisao-antes-de-fechar. Rode zapp-verify . --rapido. Nao faca push, merge, deploy nem acesse producao."
  [2026-10-09 10:08] complexo: **Especialista: complexo (área: build/CI — auditoria só-leitura, remedida depois da integração de SL-103A/SL-103B).**

Base: workspace novo `~/hermes-workspaces/Zapp_Web_V2/auditar-chunking-baseline-remedida-26100-26100910042c1c`, `dia/2026-10-09` @ `68980bf5e3486ca611a90742053bfdb008fcb5c3`. `git status --porcelain` → vazio (nenhum arquivo do projeto alterado). Relatório em `.tmp/relato.md` do mesmo workspace.

## (a) Baseline medido agora
`bun install --frozen-lockfile` + `bun run build` + `node scripts/ci/bundle-budget.mjs` (gzip zlib 9, igual ao CI) → `.tmp/budget-base.txt`:

```
  JS inicial:  343.9 KB (budget 341 KB, 14 chunks)
  CSS inicial: 42.3 KB (budget 80 KB)
  Maior chunk JS (inclui lazy): 492.3 KB gzip (budget 550 KB)
  Assets totais: 3589.6 KB gzip, sem maps (budget 4100 KB)
  FALHA: budget de bundle estourado: initial-js: 343.9 KB gzip > budget 341 KB      (rc=1)
```

Por chunk inicial: `vendor-core` 79.4 · `index` 69.2 · `vendor-ui` **64.9** · `vendor-data` 61.5 · `vendor-motion` **43.0** · `vendor-utils` 13.5 · `dist`(sonner) 9.1 · menores ≤0.9.

## (b) Mapa de chunks — onde o framer-motion está
SL-103B **já está na base** (`git merge-base --is-ancestor f8b28f13a dia/2026-10-09` → ANCESTRAL): `vite.config.ts` tem grupo próprio `vendor-motion` (priority 80) casando `node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]`, separado do `vendor-ui` (Radix/cva/clsx/tailwind-merge). Foi o que derrubou o `vendor-ui` de 107,5 → 64,9 KB.

- Sourcemap: `framer-motion/`, `motion-dom/`, `motion-utils/` aparecem **só** em `dist/assets/vendor-motion-CHCChjGM.js.map`.
- Ainda é peso de first paint porque o entry o pré-carrega: `dist/index.html` → `<link rel="modulepreload" crossorigin href="/assets/vendor-motion-CHCChjGM.js">`.
- Grafo estático (BFS **só de import estático** a partir de `src/main.tsx`; 101 arquivos, `import()` dinâmico fora) → `.tmp/grafo-estatico.txt`:
  `framer-motion no grafo inicial: 1` → `./src/components/ui/skip-link.tsx` (linha 2: `import { motion, AnimatePresence } from 'framer-motion';`). `transitionVariants.ts` importa só tipo (excluído).
  Os outros 5 importadores do baseline anterior (`button.tsx`, `card.tsx`, `accessible-toast.tsx`, `RouteTransition.tsx` + tipo) **já saíram** — efeito do SL-103A integrado.
- Medição diferencial (build só de medição com `framer-motion` → stub, em `.tmp/dist-sem-framer`; nada do projeto tocado) → `.tmp/budget-sem-framer.txt`: o `vendor-motion` sai da lista inicial (14 → 13 chunks) e

```
  JS inicial:  301.0 KB (budget 341 KB, 13 chunks)   → OK, rc=0
```

## (c) Veredito explícito sobre t_2f1569a7 (SL-103C)
**INCOMPLETO NA BASE — e agora é o ÚNICO pendente dos três.**
- `d785a66c2` (SL-103A) e `f8b28f13a` (SL-103B) são **ancestrais** de `dia/2026-10-09` (integrados 09:25:47).
- `f89369657` (SL-103C, 2 arquivos: `src/components/ui/skip-link.tsx` + `src/components/ui/__tests__/skip-link.test.tsx`) **existe mas não é ancestral**; alcançável só de `refs/heads/v2/t-2f1569a7-2610090310a07f`.
- Na base, `src/components/ui/skip-link.tsx:2` continua importando o runtime e `src/components/ui/__tests__/skip-link.test.tsx` não existe.
- Logo o **critério de bloqueio do cartão está atingido**: há importador estático de framer-motion no caminho inicial → não se prossegue com o ajuste de budget.

**Ação necessária (uma só):** o integrador publicar `f89369657` (cherry-pick de `v2/t-2f1569a7-2610090310a07f`) em `dia/2026-10-09`. Nada mais precisa ser republicado.

## Achado novo, para o cartão irmão t_7c914514 (teto 300 KB)
Mesmo com o SL-103C publicado, o medido é **301.0 KB** — o teto de 300 deixaria o gate vermelho por 1.0 KB. Ou o teto vai a **310**, ou falta cortar ~2 KB do grafo inicial antes de apertar. (Comentado também em `t_7c914514`.)

Comando fixo do `jev-entrada` não se aplica aqui: cartão só-leitura, nenhum código a escrever — a medição foi feita por mim, sem devin. Evidência em `.tmp/` do workspace: `budget-base.txt`, `budget-sem-framer.txt`, `grafo-estatico.txt`, `grafo-estatico.mjs`, `build.log`, `build-sem-framer.log`, `vite.sem-framer.ts.bak` + `framer-stub.tsx.bak` (renomeados para `.bak` porque o eslint do projeto cobre `**/*.{ts,tsx}`).
  [2026-10-09 10:09] auto-decomposer: Decomposed into t_f8527549, t_7ef087b9, t_41aa965f, t_8a0b74b4, t_84f25934. Root will wake when all children complete.
  [2026-10-09 11:13] complexo: Especialista: complexo. Veredito consolidado do cartão `t_84f25934` (relatório completo lá + anexo `relatorio-baseline-s103c.md`): **o escopo anterior está INCOMPLETO na ponta ATUAL `dia/2026-10-09` @ `10980da5a9`** — retifico: `1098da5a9` (10:41:21). `f89369657` (SL-103C) continua **não ancestral** (rc=1; único ref que o contém: `v2/t-2f1569a7-2610090310a07f`), `src/components/ui/skip-link.tsx:2` ainda importa `motion/AnimatePresence` de framer-motion e o teste `skip-link.test.tsx` não existe na árvore. Consequência: **critério de bloqueio atingido, o ajuste de budget NÃO prossegue** — este cartão e os filhos ficam retidos até o integrador publicar `f89369657` em `dia/2026-10-09` (SL-103A `d785a66c2` e SL-103B `f8b28f13a` já são ancestrais, rc=0). Baseline segue vermelho: 343,9 KB gzip > 341 (14 chunks, `vendor-motion` 43,0 KB pré-carregado).
  [2026-10-09 11:14] complexo: Correção de digitação no comentário acima: a ponta verificada de `dia/2026-10-09` é **`1098da5a9`** (`1098da5a935929b171674a99b425d6b515fd6072`, 2026-10-09 10:41:21 -0300). O `10980da5a9` foi erro de digitação. Nada mais muda: `f89369657` não é ancestral (rc=1) e `skip-link.tsx:2` segue importando framer-motion na ponta.
  [2026-10-09 20:22] default: [jev-entrada] COMANDO FIXO (antes: grave o corpo deste cartão em .tmp/cartao.md dentro do WORKSPACE do hermes-tarefa-iniciar):
claude -p --strict-mcp-config --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Glob,Grep,Bash(bun install:*),Bash(bun run:*),Bash(npx vitest:*),Bash(npx tsc:*),Bash(npx eslint:*),Bash(deno test:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(zapp-verify:*),Bash(hermes-db-migrar:*)" "Execute a tarefa do cartao t_e56122a6 descrita em .tmp/cartao.md, trabalhando so neste workspace. Antes de editar, abra a skill de area do cartao (area-* nas suas skills). Corrija TODOS os caminhos do defeito (concorrencia, lista vazia, proxima pagina, erro da segunda escrita). Escreva teste que FALHA sem a correcao e chama o codigo real (SQL roda no banco local, nunca mock). Mexa so nos arquivos do cartao e confira git diff --stat contra o titulo. Antes de terminar, abra autorrevisao-antes-de-fechar. Rode zapp-verify . --rapido. Nao faca push, merge, deploy nem acesse producao."
  [2026-10-12 10:04] complexo: Especialista: complexo. Veredito consolidado do cartão t_84f25934 (relatório completo no anexo relatorio-baseline-sl103c.md, id 157): **t_2f1569a7 (SL-103C) está COMPLETO na ponta ATUAL `dia/2026-10-12` @ `43a4bc4de`** — retifica os vereditos INCOMPLETO de 09/10. O integrador publicou `178f7c1a1` (corpo cita "Cartão V2: 2610090310a07f @ f89369657"); `git diff f89369657 178f7c1a1` nos 2 arquivos → vazio; `merge-base --is-ancestor 178f7c1a1 dia/2026-10-12` → rc=0. skip-link sem import de runtime, teste existe e passa (7/7), SL-103A/B ancestrais, ex-importadores limpos. **Critério de bloqueio NÃO atingido: o ajuste de budget PODE prosseguir.** Ressalva: a base andou (10-09 → 10-12), então os números "antes" (343,9 KB / 301,0 KB com stub) precisam de remedição na ponta atual em t_7c914514.

Events (37):
  [2026-10-09 10:03] [run 4075] spawned {'pid': 35372, 'started_at': '|179155100815'}
  [2026-10-09 10:03] [run 4075] heartbeat
  [2026-10-09 10:04] [run 4075] heartbeat
  [2026-10-09 10:05] [run 4075] heartbeat
  [2026-10-09 10:06] [run 4075] heartbeat
  [2026-10-09 10:07] [run 4075] heartbeat
  [2026-10-09 10:08] [run 4075] heartbeat
  [2026-10-09 10:08] commented {'author': 'complexo', 'len': 4189}
  [2026-10-09 10:08] [run 4075] block_loop_detected {'reason': 'Critério de bloqueio do cartão mantido na ponta atual (dia/2026-10-09 @ 68980bf5e): o caminho inicial AINDA tem import estático de framer-motion — único importador `src/components/ui/skip-link.tsx:2` — e o first paint mede 343.9 KB gzip > 341 (rc=1, 14 chunks), com `vendor-motion` 43.0 KB pré-carregado pelo entry. Falta SÓ o SL-103C: `f89369657` existe mas não é ancestral da branch do dia, alcançável apenas de `refs/heads/v2/t-2f1569a7-2610090310a07f`. SL-103A (`d785a66c2`) e SL-103B (`f8b28f13a`) já foram integrados às 09:25:47. Ação: integrador publicar `f89369657` na branch do dia; depois o que sobra é o teto, e há achado novo para o cartão irmão t_7c914514 — com o runtime fora do grafo o medido é 301.0 KB, então teto 300 ainda fica vermelho por 1.0 KB (sugerido 310). Auditoria só-leitura: nenhum arquivo do projeto alterado. Relatório completo, números crus e caminhos de evidência no comentário.', 'kind': 'capability', 'recurrences': 2, 'source_status': 'ready', 'limit': 2}
  [2026-10-09 10:09] decomposed {'child_ids': ['t_f8527549', 't_7ef087b9', 't_41aa965f', 't_8a0b74b4', 't_84f25934'], 'root_assignee': 'complexo'}
  [2026-10-09 11:13] commented {'author': 'complexo', 'len': 855}
  [2026-10-09 11:14] commented {'author': 'complexo', 'len': 322}
  [2026-10-09 20:22] commented {'author': 'default', 'len': 1057}
  [2026-10-12 10:04] commented {'author': 'complexo', 'len': 796}
  [2026-10-12 10:07] promoted
  [2026-10-12 10:07] [run 10931] claimed {'lock': 'Joaquim:15248', 'expires': 1791811378, 'run_id': 10931}
  [2026-10-12 10:07] [run 10931] spawned {'pid': 20892, 'started_at': '|179181047875'}
  [2026-10-12 10:08] [run 10931] heartbeat
  [2026-10-12 10:09] [run 10931] heartbeat
  [2026-10-12 10:10] [run 10931] heartbeat

Runs (3):
  #3904 blocked      @complexo  248s  2026-10-09 03:31
        → Critério de bloqueio do cartão atingido: o caminho inicial AINDA tem import estático de framer-motion (6 entradas a partir de src/main.tsx: skip-link.tsx, butto
  #4075 blocked      @complexo  325s  2026-10-09 10:03
        → Critério de bloqueio do cartão mantido na ponta atual (dia/2026-10-09 @ 68980bf5e): o caminho inicial AINDA tem import estático de framer-motion — único importa
  #10931 running      @complexo  active  2026-10-12 10:07
