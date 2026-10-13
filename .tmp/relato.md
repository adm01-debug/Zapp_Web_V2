Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/sla/useApplicableSLA.ts: o prazo de 1ª resposta passa a ser resolvido pela RPC do banco (`resolve_applicable_sla`, PB-39, SECURITY DEFINER) em UMA chamada por contato (`p_contact_id`), com chave `['applicable-sla', params]` e `staleTime` de 60s — o mesmo contato na lista virtualizada e no cabeçalho do chat compartilha a leitura (antes: hierarquia montada no cliente + 2 consultas por linha, ambas vazias para o papel `agent` pela RLS). O retorno ganha `matchedLevel` (contact/company/job_title/contact_type/queue/agent/global_default/system_default) e normaliza nível desconhecido para `system_default`.
- src/hooks/sla/useSLARulesCounts.ts (novo): a contagem por escopo que estava inline no `SLARulesManager` virou hook compartilhado na MESMA chave `['sla-rules-counts']` que os mutadores de regra já invalidam, com `staleTime` de 10s.
- src/hooks/sla/useSLAScopeNames.ts (novo): nomes de contato/fila/agente das regras; valida `isValidUUID` antes do `.in('id', ...)` (id corrompido faz o PostgREST recusar a consulta inteira) e usa `staleTime`. Exporta `isValidUUID`.
- src/hooks/sla/useSLAScopeOptions.ts (novo): as cinco consultas de opções do formulário (empresas, cargos, filas, agentes, busca de contatos com `escapeOrFilterValue` e teto de 20) saem do `SLARuleFormDialog` para um hook cacheado, com o mesmo gate de abertura/escopo.
- src/components/settings/SLARulesManager.tsx, src/components/settings/sla/ScopeRulesList.tsx, src/components/settings/sla/SLARuleFormDialog.tsx: passam a consumir os três hooks (nenhuma consulta inline restou).
- src/hooks/sla/useSLAConfigurations.ts: salvar/alternar/remover configuração invalida `['applicable-sla']` e `['sla-configurations-default']` (sem isso o badge/linha do tempo seguia com o prazo antigo) e passa a manter UM único padrão — ao gravar com `is_default`, desmarca os outros (`neq('id', ...)` no update, antes do insert quando não há id).
- src/hooks/sla/index.ts: exporta os três hooks novos pelo barrel.
- src/hooks/sla/__tests__/sla-hooks-staletime-contract.test.ts (novo): contrato de fonte no espírito do `sla-rules-staletime-contract` da V3 (staleTime declarado, sem `staleTime: Infinity`; a RPC é chamada; UUID validado antes do filtro).

## Aviso de diff (cherry-pick do cartão pai)
- O diff contra `dia/2026-10-12` inclui o commit do cartão pai (`ac820d0d8`, cherry-pick `-x` para `5cfcd28c5`), que a branch do dia ainda não tinha: `supabase/migrations/20261013012747_sla_resolve_applicable.sql`, `supabase/tests/sla_resolve_applicable.sql`, `scripts/db-audit/sla-resolve-applicable-contract.test.mjs`, `scripts/db-audit/sla-first-response-delivery-contract.test.mjs` e `src/integrations/supabase/types.ts` (tipos da RPC). Sem ele o meu hook não compila.

## Arquivos tocados que o cartão não lista literalmente (ponto 1 do juiz)
- `src/components/settings/SLARulesManager.tsx`, `src/components/settings/sla/ScopeRulesList.tsx` e `src/components/settings/sla/SLARuleFormDialog.tsx` SÃO os "componentes que hoje têm essa lógica inline" citados no cartão (a contagem por escopo, os nomes por UUID e as cinco consultas de opção viviam neles). Sem ligá-los, os hooks novos nascem mortos e o critério 3 ("hooks de escopo reutilizáveis") não se cumpre.
- `src/hooks/sla/index.ts` é o barrel do próprio diretório: 3 linhas `export *` para os hooks novos.
- `scripts/db-audit/sla-first-response-delivery-contract.test.mjs`, `scripts/db-audit/sla-resolve-applicable-contract.test.mjs`, `supabase/migrations/20261013012747_sla_resolve_applicable.sql`, `supabase/tests/sla_resolve_applicable.sql` e `src/integrations/supabase/types.ts` vêm do **cherry-pick do cartão pai** (`ac820d0d8`) — não são edição minha.

## Conferência do juiz sobre a migration do pai (ponto 2)
- A `20261013012747_sla_resolve_applicable.sql` e o `UPDATE` em `conversation_sla` (gatilho de `updated_at`) são do cartão PAI (PB-39, worker sql), trazidos por cherry-pick porque a RPC precisa existir para o hook compilar. Não reescrevo SQL de outro especialista neste cartão; o ponto fica registrado em comentário para o cartão pai.

## Prova
- vermelho antes: com o hook na versão da base (`git show dia/2026-10-12:src/hooks/sla/useApplicableSLA.ts`) e o teste NOVO: `npx vitest run src/hooks/sla/__tests__/useApplicableSLA.test.tsx` → `Test Files 1 failed (1); Tests 8 failed | 1 passed (9)`.
- verde depois: `npx vitest run src/hooks/sla/__tests__/` → `Test Files 6 passed (6); Tests 47 passed (47)`.
- regressão dos módulos tocados: `npx vitest run src/components/settings` → `Test Files 41 passed (41); Tests 763 passed (763)`.
- regressão dos consumidores do hook: `npx vitest run src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx src/components/inbox/chat/__tests__/menus-r2-inb-021.test.tsx src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx src/components/inbox/__tests__/VirtualizedRealtimeList.identidade-profile.test.tsx` → `Test Files 4 passed (4); Tests 37 passed (37)`.
- suite da caixa de entrada: `npx vitest run src/components/inbox` → `Test Files 199 passed (199); Tests 1641 passed | 1 todo (1642)`.

## O que NÃO fiz e por quê
- Não toquei banco, migration, Edge nem produção: o resolvedor é a RPC entregue pelo cartão pai; o SLA de Resolução está fora do escopo (DEC-1), por isso a RPC não devolve `resolution_minutes`.
- Mantive `resolutionMinutes` no shape: `useContactSlaTimeline` (linha do tempo) ainda o consome para `limitsReady` e para o marco de resolução — removê-lo seria regressão. O valor continua vindo da regra que a RPC casou (`rule_id` → id→valor, sem remontar a hierarquia no cliente), com queda para a configuração padrão e, por último, 60 do sistema.
- O hook passou a exigir `contactId` (a RPC é por contato). Todos os chamadores atuais (badge da lista, cabeçalho do chat, linha do tempo) já o informam.
- Não removi `src/hooks/__tests__/useApplicableSLA.test.ts`: ele testa uma CÓPIA local da hierarquia que agora só vive no banco; registro o achado em comentário no cartão em vez de apagar teste existente fora dos arquivos do cartão.
- Testes de comportamento dos três hooks novos e do `useSLAConfigurations` (UUID inválido, staleTime, um único padrão) ficam no cartão filho t_4918a2be, já criado para isso.
