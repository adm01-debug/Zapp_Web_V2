Especialista: iris

## Ponto da recusa (refazer 1)
Ponto 1: a entrega movia o `supabase.functions.invoke('evolution-sync')` em ConnectionsView.tsx da linha 69 para a linha 81, mas ESTADO.md mantinha a âncora `src/components/connections/ConnectionsView.tsx:69`. A guarda do espelho do CI (`scripts/ci/docs-estado-registry-convention.unit.mjs`, teste "ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge") lê a linha ancorada e exige que ela contenha o nome da edge — por isso o empilhamento acusava ESTADO.md quebrado. Corrigi realinhando a âncora em ESTADO.md para `src/components/connections/ConnectionsView.tsx:81` (linha exata do invoke). Não toquei na guarda nem afrouxei nenhuma asserção.

## O que mudou e por quê
- ESTADO.md: linha do `evolution-sync` — âncora `ConnectionsView.tsx:69` → `ConnectionsView.tsx:81`. O cherry-pick dos commits da entrega (531d15e59c, 3a754b1983) deslocou o invoke ao adicionar o estado `disconnecting` (handleDisconnectWithState); a âncora do inventário de edges precisa apontar para a linha real que cita a edge.
- Reparo executado pelo worker (design); o trabalho de tela veio por cherry-pick dos commits da entrega original (t_53fc1ddb), sem recomeçar.

## Prova
- vermelho antes: `node scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` / `AssertionError: âncora desatualizada: src/components/connections/ConnectionsView.tsx:69 não cita 'evolution-sync'`
- verde depois: mesmo comando → `ℹ pass 11 / ℹ fail 0` (11 testes da convenção de docs)
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (114s)`
- verificação completa: `zapp-verify full .` (step `testes`, `bun run test`) → `Test Files 1349 passed | 3 skipped (1352); Tests 12002 passed | 25 expected fail | 37 todo (12064)`; o `build` foi confirmado à parte com `bun run build` → `✓ built in 22.43s`
- regressão de conexões: `npx vitest run src/components/connections` → `Test Files 11 passed (11); Tests 46 passed (46)`

## Sobre o "mesmo comando" pedido na recusa
O espelho do CI (`bash ~/arquitetura-v2/integrador/ci_espelho.sh .`) não executa neste ambiente: a guarda do Hermes bloqueia o script (ele exporta PATH com node/bun/deno de `~/.local` e o classificador trata como mexer no ferramental da fábrica). Rodei o trecho equivalente direto — `node --test` sobre os mesmos alvos de `scripts/ci/*.unit.mjs`, `scripts/edge-deploy/*.unit.mjs`, `scripts/db-audit/*.test.mjs`, `scripts/talkx/*.unit.mjs` (148 arquivos): resultado `# tests 1370 / # pass 1359 / # fail 10`, com o teste antes vermelho agora verde. As 10 falhas restantes não leem nenhum arquivo tocado por este cartão (o diff contra dia/2026-10-13 altera só ESTADO.md e src/components/connections/**) — são o `--staged` do lint-ratchet (6, falha local por `git init`), `tsconfig.app.json`/TS7006, `FLAG_CHANGES.md` e 2 do Talk X de janela de entrega por timezone.

## O que NÃO fiz e por quê
- Não editei o ferramental da fábrica (~/arquitetura-v2, ~/.local) nem a guarda de docs; a causa era a âncora desatualizada no documento do repositório.
- Nada fora de ESTADO.md e src/components/connections/** — `git diff --stat dia/2026-10-13..HEAD` confirma 7 arquivos (o documento + 3 componentes + 3 testes do cartão).
