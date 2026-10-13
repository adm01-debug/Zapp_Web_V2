Especialista: complexo (area-front-hooks)

## O que mudou e por quê
- `src/components/talkx/__tests__/RuleValueInput.test.tsx`: `afterEach(() => window.history.replaceState(null, '', '/'))` (e `afterEach` no import do vitest). Motivo: o construtor de segmentos do Talk X vive no endereço (`?view=talkx&tab=segments&mode=new`); o `window.location` do jsdom é um só por arquivo, então o teste "em breve" de `lead_score`, que abre o construtor sem publicar, deixava `mode=new` no endereço e o `renderView()` do teste seguinte já montava no construtor — sem o botão "Novo segmento", o `findByRole` esgotava os 5 s do setup e o arquivo ficava vermelho. Nenhuma asserção, `skip`, `only` ou timeout foi tocado. A correção veio da primeira execução do cartão; como complexo, conferi o diff, reproduzi o vermelho sem ela e o verde com ela, e a mantive sem alterar nada.

## Prova
- vermelho sem a correção (hook removido temporariamente, mesmo arquivo): `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1)`; `Tests 1 failed | 4 passed (5)`.
- verde com a correção (arquivo restaurado, árvore limpa): mesmo comando, 4 execuções → `Test Files 1 passed (1)`; `Tests 5 passed (5)` em todas.
- verificação completa: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (41s)`, EXIT=0 (db_guard OK, tipos OK, lint OK, migrations OK; banco_local com AVISO "sem nome de conjunto" — o cartão não tem migration, nada de banco para verificar).

## Coerência com o diff
O único arquivo de código no diff contra a base é `RuleValueInput.test.tsx`; a correção é o `afterEach` de reset da URL, exatamente o que o relato descreve.

## Outros testes com o mesmo risco (item 4 do cartão)
Conferi com `git grep -n replaceState -- src/components/talkx/__tests__/`: `TalkXSegments.route/groups/builder/detailFresh` já resetam a URL em `afterEach` (linhas 102/137/108/136) — ficam como estão. Só `RuleValueInput.test.tsx` não tinha, e é o que este cartão corrige.
