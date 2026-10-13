# fix(testes): RuleValueInput.test isola a rota do construtor entre os testes

Especialista: worker (ci) (area-verificacao-ci)

## O que mudou

`src/components/talkx/__tests__/RuleValueInput.test.tsx` (1 arquivo, +13/-1): um `afterEach(() => window.history.replaceState(null, '', '/'))`, importando `afterEach` do vitest. Nenhuma asserção foi tocada, nem `skip`/`only`, nem timeout.

## A causa (medida, não a do diagnóstico do cartão)

Não era o tempo. O construtor de segmentos do Talk X vive no endereço (`?view=talkx&tab=segments&mode=new` — `TalkXSegments` lê a rota em `useState` e `openBuilder` empurra o `mode=new` para o `window.location`). O `window.location` do jsdom é UM só por arquivo de teste: o teste "em breve" de `lead_score` (o antepenúltimo) abre o construtor, clica num indicador desabilitado e termina sem publicar — o `mode=new` fica no endereço. O `renderView()` do último teste, então, já monta no construtor, sem o botão "Novo segmento"; o `findByRole` esgota os 5 s (asyncUtilTimeout do setup) e estoura. Um timeout maior NÃO consertaria: o botão não existe no DOM.

Prova da causa: o último teste passa sozinho e falha quando o anterior roda antes; os 4 arquivos irmãos do módulo (route/groups/builder/detailFresh) já resetam a URL em `afterEach` — esta prova era a única sem isso.

## Prova

Vermelho antes (base 96dd72dc5, sem a correção):
- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1)` / `Tests 1 failed | 4 passed (5)` — a falha em "em breve: ... desabilitados no catálogo", 5130 ms, "Unable to find role=button name 'Novo segmento'".
- ordem que falhava (`-t "em breve"`, roda o de lead_score antes) → `Tests 1 failed | 1 passed`.

Verde depois (commit 61070aa90):
- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` (3 execuções seguidas) → `Test Files 1 passed (1)` / `Tests 5 passed (5)` em cada uma.
- ordem que falhava (`-t "em breve"`) → `Test Files 1 passed (1)` / `Tests 2 passed | 3 skipped (5)`.

Verificação completa:
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (352s)` (db_guard OK, tipos OK, lint OK, migrations OK), EXIT=0.

## Item 4 do cartão — outros testes com o mesmo risco

O risco real é a rota ficar no `window.location` entre testes, não "render pesado". Varri os 5 testes de `src/components/talkx/__tests__/` que usam "Novo segmento": `TalkXSegments.route/groups/builder/detailFresh` JÁ têm `window.history.replaceState(null, '', '/')` em `afterEach` — não mexem. Só `RuleValueInput.test.tsx` não tinha, e é o que corrigi.

## O que não fiz

Nada fora do arquivo do cartão. `git diff --stat` = só `RuleValueInput.test.tsx` (+13/-1) no commit de código.
