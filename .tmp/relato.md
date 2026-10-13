Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- Nenhum arquivo de código. O defeito descrito no cartão ("remover `editReasonOptions` com `value` vazio") NÃO existe na base `dia/2026-10-13`:
  - `git grep -n "editReasonOptions" -- src` -> sem ocorrências.
  - `git grep -n 'value=""' -- src/components/talkx/TalkXSuppression.tsx` -> sem ocorrências.
  - O Select de Motivo usa `value={editReason}` (linha 782), inicializado em `openEdit` com `setEditReason(entry.reason_code ?? 'manual')` (linha 494), e as opções vêm de `REASON_CODES` (`value={r.code}`, nunca vazio, linhas 786) mais `value="keep"` só no modo em massa (linha 785). Não há `value=""` nem prop `editReasonOptions`.
- Conclusão: o cartão nasceu de uma premissa desatualizada; não há correção a aplicar em `src/components/talkx/TalkXSuppression.tsx`.

## Prova
- verde: `npx vitest run src/components/talkx/__tests__/TalkXSuppression` -> `Test Files 10 passed (10); Tests 71 passed (71)`.
- Vermelho/verde do invariante ("Select de Motivo sem opção de valor vazio") já está registrado no teste-guarda do cartão irmão t_8337aed3, commit `606f2f15d` (`test(talk-x): garante Select de motivo sem opção de valor vazio`, arquivo `src/components/talkx/__tests__/TalkXSuppression.editReasonVazio.test.tsx`). Esse arquivo pertence ao cartão `t_8337aed3`, por isso não entra neste diff.

## O que NÃO fiz e por quê
- Não removi `editReasonOptions`: não existe no repositório.
- Não criei teste novo neste branch: a suíte-guarda do invariante pertence ao cartão `t_8337aed3` (worker testes); tocar arquivo de outro cartão é proibido pelas minhas regras.
- Não alterei strings nem comentários: nada a ajustar (o código já corresponde ao que a interface afirma).
