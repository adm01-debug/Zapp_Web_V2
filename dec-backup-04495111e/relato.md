Especialista: senior (area-testes-do-produto)

Refazer 1 do commit 04495111e (branch v2/decidir-padrao-teste-teclado-user-event-26101409261183).

Ponto 1 — quebra TIPOS/LINT no empilhamento (arquivo citado: src/components/a11y/__tests__/AccessibleListTeclado.test.tsx):
causa encontrada e corrigida. O `zapp-verify full .` reproduziu VERMELHO em lint,
mas o culpado nao era o teste nem o ADR: era um resto meu da rodada anterior,
`.tmp/a11yHooks.bak.tsx` (backup da prova por mutacao), que o lint ratchet contou
como 1 ocorrencia nova (`react-refresh/only-export-components`). TIPOS passou
limpo nas duas rodadas. Removi o arquivo (era git-ignored, fora do diff) e rodei
`zapp-verify full .` de novo: VERDE SEM BANCO (1316s), EXIT=0 — db_guard OK,
tipos OK (15s), lint OK (142s), migrations OK, testes OK (1142s), build OK (16s).
O teste-alvo continua verde: 4 passed (4). Nenhuma assercao afrouxada e nenhum
arquivo do diff foi alterado: o diff contra a base segue exatamente os 5 arquivos
do sha 04495111e (package.json, bun.lock, docs/adr/ADR-009, docs/adr/README,
AccessibleListTeclado.test.tsx).

Arquivos (`git diff --name-only 88327e43dc..HEAD`):
- package.json
- bun.lock
- docs/adr/ADR-009-testes-de-teclado-user-event.md
- docs/adr/README.md
- src/components/a11y/__tests__/AccessibleListTeclado.test.tsx

Verificacoes (comandos rodados agora, neste workspace):
- `npx vitest run src/components/a11y/__tests__/AccessibleListTeclado.test.tsx` -> 4 passed (4)
- `npx tsc --noEmit` -> sem erro no arquivo do cartao; `npx eslint` no arquivo -> limpo
- `zapp-verify full .` antes da remocao -> VERMELHO em lint (1 ocorrencia nova em .tmp/a11yHooks.bak.tsx)
- `zapp-verify full .` depois da remocao -> VERDE SEM BANCO (1316s), EXIT=0
