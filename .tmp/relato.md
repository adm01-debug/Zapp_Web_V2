Especialista: workertestes

## Pontos do revisor (recusa → correção)
- Ponto 1 (primeira linha do relato): corrigido — a primeira linha deste relato é exatamente `Especialista: workertestes`, sem sufixo de skill.
- Ponto 2 (contagem por pasta, ordenada, derivada da linha de base): tabela abaixo, contada de `src/__tests__/a11y/icon-buttons-baseline.json` (`findings[].file`, agrupado por `src/<grupo>/<subgrupo>`, ordem decrescente; empate em ordem alfabética). Soma 46 em 32 arquivos — bate com o total da varredura e com o cruzamento por grep (195 `size="icon` − 149 com nome = 46).

| ocorrências | pasta |
|---:|---|
| 19 | `src/components/inbox` |
| 5 | `src/components/dashboard` |
| 4 | `src/components/admin` |
| 4 | `src/components/contacts` |
| 3 | `src/components/calls` |
| 2 | `src/components/cognitive` |
| 2 | `src/components/gmail` |
| 2 | `src/components/onboarding` |
| 2 | `src/components/queues` |
| 1 | `src/components/catalog` |
| 1 | `src/components/leaderboard` |
| 1 | `src/components/reports` |

## O que mudou e por quê
- NESTE refazer: só este relato (`.tmp/relato.md`) — nenhum arquivo de código foi alterado, nenhuma linha de base foi tocada (critérios 1 e 2 do cartão).
- Entrega anterior mantida: `src/__tests__/a11y/scan-icon-buttons.ts` (varredura AST que acha botão de ícone sem nome acessível — `<IconButton>` e `<Button size="icon*">` sem `aria-label`/`aria-labelledby`/`title` não vazios e sem filho com `sr-only`; funções `scanSource` e `scanProject`, chave estável por arquivo+assinatura da tag de abertura), `src/__tests__/a11y/icon-button-names.test.ts` (casos sintéticos que CHAMAM a varredura + teste de linha de base sobre `src/**` real) e `src/__tests__/a11y/icon-buttons-baseline.json` (linha de base das ocorrências já existentes, dado para a correção do UK-13b).

## Prova
- vermelho antes (novo botão sem nome): arquivo temporário `src/components/__a11y-mutacao.tsx` com `<Button size="icon" onClick={() => {}}>` → `npx vitest run src/__tests__/a11y/icon-button-names.test.ts -t "linha de base bate"` → `FAIL ... AssertionError: expected [ Array(1) ] to deeply equal []` / `surgiu botão de ícone SEM nome (arquivo src/components/__a11y-mutacao.tsx:6)`; arquivo temporário removido depois.
- vermelho antes (entrada já corrigida): adicionei `aria-label="Atualizar dados"` ao `<Button ... size="icon" ...>` de `src/components/admin/AIUsageDashboard.tsx` → mesmo comando → `FAIL ... linha de base com entrada já corrigida (remova da baseline)`; mudança desfeita.
- verde depois (neste refazer, sem tocar no código): `npx vitest run src/__tests__/a11y/icon-button-names.test.ts` → `Test Files 1 passed (1)` / `Tests 19 passed (19)` (`Duration 8.00s`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (23s)` (`db_guard OK, tipos OK, lint OK, migrations OK`; `banco_local` não verificado — sem nome de conjunto — e este refazer não mexe em banco).

## Arquivos deste cartão
- `src/__tests__/a11y/scan-icon-buttons.ts`, `src/__tests__/a11y/icon-button-names.test.ts`, `src/__tests__/a11y/icon-buttons-baseline.json` (entrega anterior, mantida) + `.tmp/relato.md` (este refazer). O diff deste refazer contra a entrega anterior contém SÓ `.tmp/relato.md`.

## O que NÃO fiz e por quê
- Não corrigi nenhum dos 46 botões de produção (só a varredura + linha de base) — a correção é o cartão UK-13b.
- Não mexi em `src/test/setup.ts`, no `vitest.config.ts` nem em teste existente.
