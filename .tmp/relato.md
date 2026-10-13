Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
- `src/components/talkx/__tests__/RuleValueInput.test.tsx`: acrescentei um `afterEach(() => window.history.replaceState(null, '', '/'))` (e `afterEach` ao import do vitest). Motivo: o construtor de segmentos do Talk X vive no endereço (`?view=talkx&tab=segments&mode=new`); o `window.location` do jsdom é um só por arquivo, então o teste "em breve" de `lead_score`, que abre o construtor sem publicar, deixava `mode=new` no endereço e o `renderView()` do teste seguinte já montava no construtor — sem o botão "Novo segmento", o `findByRole` esgotava os 5 s do setup e o arquivo ficava vermelho. Nenhuma asserção, `skip`, `only` ou timeout foi tocado.

## Prova
- vermelho antes: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1)`; `Tests 1 failed | 4 passed (5)` — "Unable to find role=button name 'Novo segmento'", 5130 ms.
- verde depois: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` (3 execuções seguidas) → `Test Files 1 passed (1)`; `Tests 5 passed (5)`.
- verde da ordem que falhava (roda o de `lead_score` antes do último, `-t "em breve"`) → `Tests 2 passed`.
- verificação completa: `zapp-verify . --rapido` → `VERIFY: VERDE` (db_guard OK, tipos OK, lint OK, migrations OK), EXIT=0.

## Coerência com o diff
O único arquivo de código tocado é `RuleValueInput.test.tsx`; a correção é o `afterEach` de reset da URL, exatamente o que o relato descreve.

## Outros testes com o mesmo risco (item 4 do cartão)
Varri os 5 testes de `src/components/talkx/__tests__/` que usam "Novo segmento". `TalkXSegments.route.test.tsx`, `.groups.test.tsx`, `.builder.test.tsx` e `.detailFresh.test.tsx` já fazem `window.history.replaceState(null, '', '/')` em `afterEach` — ficam como estão. Só `RuleValueInput.test.tsx` não tinha, e é o que corrigi.
