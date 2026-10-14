Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- Nenhum arquivo de código neste diff: o defeito do cartão não existe na árvore, então não havia correção a aplicar em `src/components/talkx/TalkXSuppression.tsx`. O commit é o próprio relato.
- A construção `editReasonOptions` não existe: `git grep -n "editReasonOptions" -- src` -> zero ocorrências.
- Nenhum `SelectItem` com valor vazio no arquivo, em nenhuma branch: `git log --all --oneline -S 'value=""' -- src/components/talkx/TalkXSuppression.tsx` -> zero commits; `grep -n 'value=""' src/components/talkx/TalkXSuppression.tsx` -> zero linhas.
- O Select de Motivo (modal "Editar motivo e expiração") é controlado por `editReason`, que nasce de `entry.reason_code ?? 'manual'`; as opções vêm de `REASON_CODES.map((r) => <SelectItem value={r.code}>)` e, no modo em massa, de `value="keep"`. Motivo nulo nunca produz opção vazia.

## Prova (vermelho antes -> verde depois)
- teste que abre o modal ⋮ "Editar motivo e expiração" no componente REAL e lê as opções (`role="option"`): `src/components/talkx/__tests__/TalkXSuppression.editReasonVazio.test.tsx`.
- vermelho antes (injetei `<SelectItem value="">MUTACAO</SelectItem>` no Select de Motivo): `npx vitest run src/components/talkx/__tests__/TalkXSuppression.editReasonVazio.test.tsx` -> `Test Files 1 failed (1); Tests 3 failed (3)`.
- verde depois (código de hoje, sem a mutação): mesmo comando -> `Test Files 1 passed (1); Tests 3 passed (3)`.
- suíte vizinha: `npx vitest run .../TalkXSuppression.actions.test.tsx .../TalkXSuppression.add.test.tsx .../TalkXSuppression.atividade.test.tsx .../TalkXSuppression.editReasonVazio.test.tsx` -> `Test Files 4 passed (4); Tests 37 passed (37)`.

## FAIXA DO PAI
- O teste-guarda acima é do cartão t_8337aed3 (commit `606f2f15d`) e NÃO entra neste diff; usei-o como instrumento de prova do invariante. A integração dele é daquele cartão.

## Critérios de aceite
1. `editReasonOptions` sem string vazia com motivo nulo: cumprido — a variável não existe e não há `value=""` no arquivo (prova acima).
2. Teste que abre/edita registro sem motivo sem crashar: coberto pelo teste-guarda acima, que passa verde no código de hoje e fica vermelho quando um `value=""` é introduzido (prova acima).
3. `zap-verify . --rapido`: `VERIFY: VERMELHO em db_guard (6s)`; `DB_GUARD: BLOQUEADO — Zapp_Web_V2-anexos/arquivo/qa-fase0/g1-seguranca/guard/caso-A-env/.env da cópia aponta para a produção`. O bloqueio vem de uma cópia (`Zapp_Web_V2-anexos`) fora deste workspace, não do diff deste cartão.

## O que NÃO fiz e por quê
- Não alterei `TalkXSuppression.tsx`: alterar sem defeito seria regra além do que o título pede.
- Não criei `editReasonOptions` nem sentinela: não há o que corrigir.
- Não commitei o teste-guarda: ele pertence ao cartão t_8337aed3.
