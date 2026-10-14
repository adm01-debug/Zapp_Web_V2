Especialista: hugo
(refazer 1 executado pelo semisenior, skill area-front-hooks)

## Ponto 1 da recusa (único): diff de 103536 caracteres grande demais — dividir em cartões menores ou remover gerados/irrelevantes
Causa conferida no código: o trabalho anterior trouxe com `git cherry-pick` o commit do cartão pai PB-39 (`5cfcd28c5`, "feat(db): o banco resolve o prazo de 1a resposta via resolve_applicable_sla"), com 5 arquivos e 911 inserções que não são deste cartão e que ARQUIVOS QUE PODE TOCAR não autoriza: `supabase/migrations/20261013012747_sla_resolve_applicable.sql` (287 linhas), `supabase/tests/sla_resolve_applicable.sql` (140), `scripts/db-audit/sla-resolve-applicable-contract.test.mjs` (460, arquivo novo), `scripts/db-audit/sla-first-response-delivery-contract.test.mjs` (17) e o hunk de `src/integrations/supabase/types.ts` (9).
O que mudei (commit `cdb8996130`): removi do diff os 4 arquivos inteiros do pai (3 deletados por `git rm`, 1 revertido à base `96dd72dc5`); mantive SÓ o hunk de 9 linhas do `types.ts`. Fiz diferente da receita literal ("remova gerados") nesse hunk porque sem ele o cartão não compila: `tsc -b --force` falha com 5 erros (vermelho medido: `TS2345 '"resolve_applicable_sla"' is not assignable` + 4× `TS2339` em `first_response_minutes/rule_name/rule_id/matched_level`); com ele, passa limpo (verde medido: `EXIT:0`, saída vazia). A RPC continua sendo entregue pelo cartão pai — este cartão a USA, como o pedido manda — e a tipagem mínima é exigida pela regra "o cartão compila e passa sozinho".
Não dividi em cartões menores porque dividir é do coordenador (fronteira do meu perfil); a remoção resolve o ponto mantendo o pedido original intacto.
Prova de tamanho (régua `git diff "dia/2026-10-13"...HEAD -- . ':!.tmp/relato.md' | wc -c`): antes 93065, depois 49386 — abaixo do teto de 90000.

## O que o pedido original entregou (mantido, sem retoque)
- `src/hooks/sla/useApplicableSLA.ts`: prazo de 1ª resposta resolvido pela RPC `resolve_applicable_sla` (SECURITY DEFINER) em UMA chamada por contato (`p_contact_id`), chave `['applicable-sla', params]`, `staleTime` 60s; retorno ganha `matchedLevel` (contact/company/job_title/contact_type/queue/agent/global_default/system_default, desconhecido normaliza para `system_default`).
- `src/hooks/sla/useSLARulesCounts.ts` (novo), `useSLAScopeNames.ts` (novo, exporta `isValidUUID` com gate antes do `.in('id', ...)`), `useSLAScopeOptions.ts` (novo): lógica que estava inline em `SLARulesManager/ScopeRulesList/SLARuleFormDialog`, com `staleTime`; os 3 componentes agora consomem os hooks (nenhuma consulta inline restou).
- `src/hooks/sla/useSLAConfigurations.ts`: salvar/alternar/remover invalida `['applicable-sla']` e mantém UM único padrão (`neq('id', ...)`).
- `src/hooks/sla/index.ts`: barrel com os 3 `export *`.
- Testes: `sla-hooks-staletime-contract.test.ts` (novo, espírito do contrato da V3), `useApplicableSLA.test.tsx`, `+16 useContactSlaTimeline`, `+4 useSLAConfigurations`.
- Componentes tocados SÃO os "componentes que hoje têm essa lógica inline" do cartão; `index.ts` é o barrel do diretório.

## Prova (tudo rodado DEPOIS da remoção, sem os arquivos do pai)
- `node_modules/.bin/vitest run src/hooks/sla/__tests__/` → `Test Files 6 passed (6); Tests 47 passed (47)`.
- `node_modules/.bin/tsc -b --force` → limpo (`EXIT:0`); sem o hunk do types.ts, 5 erros (vermelho acima).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (9s)` — `OK db_guard/tipos/lint/migrations`; `AVISO banco_local NÃO VERIFICADO` (sem migration neste cartão, esperado).

## Arquivos (`git diff --name-only "dia/2026-10-13"...HEAD`, colado do comando)
.tmp/relato.md
src/components/settings/SLARulesManager.tsx
src/components/settings/sla/SLARuleFormDialog.tsx
src/components/settings/sla/ScopeRulesList.tsx
src/hooks/sla/__tests__/sla-hooks-staletime-contract.test.ts
src/hooks/sla/__tests__/useApplicableSLA.test.tsx
src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx
src/hooks/sla/__tests__/useSLAConfigurations.test.tsx
src/hooks/sla/index.ts
src/hooks/sla/useApplicableSLA.ts
src/hooks/sla/useSLAConfigurations.ts
src/hooks/sla/useSLARulesCounts.ts
src/hooks/sla/useSLAScopeNames.ts
src/hooks/sla/useSLAScopeOptions.ts
src/integrations/supabase/types.ts

## O que NÃO fiz e por quê
- Não recriei migration/RPC nem teste de banco: são do cartão pai PB-39. Não apaguei teste existente nem afrouxei guarda/CI/manifesto. Nenhuma linha adicionada cita ref de produção; meu commit só remove linhas.
- Não removi `src/hooks/__tests__/useApplicableSLA.test.ts` (cópia local da hierarquia antiga): fora dos arquivos do cartão, vira `kanban_comment`, nunca correção.
