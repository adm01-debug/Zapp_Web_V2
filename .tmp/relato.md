Especialista: worker (sql) (area-sql-banco)

## Conclusão
CONCLUÍ SEM COMMIT DE CÓDIGO (item 2 do cartão): o defeito do pedido já está corrigido no
código ATUAL de dia/2026-10-11. Não recriei nada.

## Como o conflito se resolveu
A entrega anterior já está na ponta atual. O commit `0f5bbfc5e` ("fix(departamentos): usa
RPC de modo do WhatsApp acessivel ao usuario logado (QA5-09)") JÁ É ancestral do HEAD do
workspace (`git merge-base --is-ancestor 0f5bbfc5e HEAD` → exit 0). Ou seja: os 4 arquivos
que apareciam em conflito na fila do integrador já entraram em dia/2026-10-11 iguais ou
superiores à entrega original (`68fe6e588`). Não há o que cherry-pickar nem conflito a
resolver — a correção inteira já está aplicada.

## Prova — o defeito NÃO existe mais (arquivo:linha)
- Hook do navegador usa a RPC nova: `src/hooks/team-chat/useDepartmentManagement.ts:126`
  `.rpc('get_department_whatsapp_mode', { p_department_id: departmentId })` (antes lia
  `get_department_whatsapp_credentials`, que é service_role-only e devolve a chave da API).
- Assinatura no cliente: `src/integrations/supabase/types.ts:11245`
  `get_department_whatsapp_mode: { Args: { p_department_id: string }; Returns: string }`.
- Migration real: `supabase/migrations/20261005111312_p1_department_whatsapp_mode.sql:14`
  `CREATE OR REPLACE FUNCTION public.get_department_whatsapp_mode(p_department_id uuid)`,
  com REVOKE de PUBLIC/anon (linha 42) e GRANT a authenticated (linha 44).
- Passo no CI: `.github/workflows/db-guard.yml:971`
  `bash scripts/db-audit/department-whatsapp-mode-rpc.test.sh`.
- Todos os caminhos do mesmo defeito: nenhum arquivo de `src/**` chama mais
  `get_department_whatsapp_credentials` (só o bootstrap dos próprios testes de contrato). O
  único ponto de navegador era `useDepartmentWhatsAppCredentials`, hoje na RPC nova.

## Prova — testes executados agora (saída real)
- `npx vitest run src/hooks/team-chat/__tests__/useDepartmentManagement.test.tsx src/hooks/team-chat/__tests__/useDepartmentWhatsAppCredentials.contrato-rpc.test.tsx`
  → `Test Files  2 passed (2)` · `Tests  12 passed (12)`
- `SKIP_DOCKER_SHIM=1 bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/department-whatsapp-mode-rpc.test.sh`
  → `[OK] contrato QA5-09 (RPC de modo do WhatsApp do departamento) verificado: 10 assercoes (postgres:17-alpine)`
  (ANTES: authenticated sem EXECUTE, chamada morre com 42501; DEPOIS: admin lê `evolution`,
  retorno sem a sentinela da chave, `pg_get_function_result = text`, anon barrado;
  MUTAÇÃO A e MUTAÇÃO B FALHAM como esperado.)

## O que NÃO fiz e por quê
- Nenhum arquivo de código alterado: não recriei a função, o teste nem a regra (já estão
  como a entrega pedia). Diff de código vazio, como manda o item 2 do cartão.
- Não arrastei arquivo de outro assunto.
- Único commit deste cartão: `.tmp/relato.md`. A base `dia/2026-10-11` deixou esse arquivo
  TRACKED (commit 32c68d56a), diferente do normal (untracked); o `hermes-tarefa-fechar`
  recusa fechar com "há mudanças não commitadas" por causa dele. Commitei SÓ o relato para
  limpar a árvore — nenhum arquivo do produto entrou nesse commit.
