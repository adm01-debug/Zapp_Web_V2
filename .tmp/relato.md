Especialista: senior (area-sql-banco)

## Pontos do revisor

- Ponto 1: `p_priority = null` agora é tratado explicitamente em `supabase/migrations/20261011154935_manual_priority.sql`: a validação só chama `ai_is_canonical_priority` quando `p_priority is not null`. Teste que prova: `limpar com NULL zera prioridade, autor e instante e audita` em `node --test scripts/db-audit/manual-priority.test.mjs` passou no verde final.

- Ponto 2: mantive `SECURITY DEFINER` apenas para a escrita em `audit_logs`, mas removi a confiança implícita no dono da função para o UPDATE de `contacts`: a RPC agora precomputa `v_visible_agent_ids`, `v_profile_id` e `v_is_admin` do `auth.uid()` e chama a assinatura explícita `public.can_edit_contact(c.assigned_to, c.queue_id, v_visible_agent_ids, v_profile_id, v_is_admin)`. Testes que provam: `set_manual_priority reusa o predicado explicito de 5 argumentos das policies` e `authenticated malicioso com ID arbitrario fora do escopo: 42501, sem mutacao e sem auditoria`.

- Ponto 3: reforcei o teste real em Postgres descartável. Ele aplica a migration real, executa a RPC com papéis reais (`anon`/`authenticated`/usuários sintéticos), cobre usuário malicioso com ID arbitrário, UPDATE direto de `manual_priority*` por usuário com policy de update na linha, limpeza com `NULL`, matriz de `effective_priority`, RLS de leitura e rollback executado a partir do cabeçalho da própria migration. Prova vermelho antes: com a migration anterior e os testes novos, `node --test scripts/db-audit/manual-priority.test.mjs` falhou em 5 testes (incluindo trigger ausente, UPDATE direto retornando `OK` e rollback sem trigger). Verde depois: o mesmo comando terminou com `tests 17`, `pass 17`, `fail 0`.

- Ponto 4: o rollback do cabeçalho agora remove o trigger guard e sua função, revoga as ACLs novas antes dos drops das funções, remove constraint/colunas e limpa os comentários enganosos (`ai_priority` continua existindo; sem menção a `SKIP`). O teste `o Rollback do cabecalho roda e desfaz exatamente o que foi criado` extrai e executa esse bloco do arquivo real e confere que colunas, constraint, funções e trigger somem.

- Ponto 5: `src/integrations/supabase/types.ts` deixou de expor `manual_priority` e `p_priority` como `string`: adicionei `ContactManualPriority = "low" | "medium" | "high" | "urgent"` e usei esse tipo em `Row`/`Insert`/`Update` de `contacts` e nos args da RPC. Também ajustei `src/adapters/evolutionAdapter.ts` com `manual_priority`, `manual_priority_at` e `manual_priority_by` nulos no contato derivado, porque o typecheck real apontou esse chamador como quebrado após as novas colunas. Testes que provam: `src/integrations/supabase/__tests__/manualPriorityTypes.test.ts` fixa o contrato de tipo e aceita `null` na RPC; `src/adapters/__tests__/evolutionAdapter.test.ts` prova que o contato derivado expõe os três campos como `null`.

## Arquivos alterados

```text
.tmp/relato.md
scripts/db-audit/manual-priority.test.mjs
src/adapters/__tests__/evolutionAdapter.test.ts
src/adapters/evolutionAdapter.ts
src/integrations/supabase/__tests__/manualPriorityTypes.test.ts
src/integrations/supabase/types.ts
supabase/migrations/20261011154935_manual_priority.sql
```

## Verificações executadas

- `node --test scripts/db-audit/manual-priority.test.mjs` com a migration antiga restaurada temporariamente: falhou em 5 testes (trigger guard ausente, liberação da RPC ausente, UPDATE direto retornando `OK`, mutação colateral e rollback sem trigger).
- `node --test scripts/db-audit/manual-priority.test.mjs` depois da correção: `tests 17`, `pass 17`, `fail 0`.
- `bun run typecheck` com `types.ts` e `evolutionAdapter.ts` temporariamente revertidos para a base anterior: falhou com `ContactManualPriority` ausente, `set_manual_priority` ausente e `manual_priority*` inexistente no contato derivado.
- `bunx vitest run src/adapters/__tests__/evolutionAdapter.test.ts src/integrations/supabase/__tests__/manualPriorityTypes.test.ts`: `Test Files 2 passed (2)`, `Tests 4 passed (4)`.
- `hermes-db-migrar supabase/migrations/20261011154935_manual_priority.sql`: aplicado no banco LOCAL antes do ajuste final; ao reexecutar após o trigger, a ferramenta recusou corretamente porque a versão já estava aplicada no banco local da tarefa. A aplicação fresca do SQL final foi provada pelo teste Postgres descartável acima.
- `bun run typecheck`: exit 0 (`tsc -b --force`).
- `bun run db:guard`: `OK: nenhuma violacao nova.` / `arquivos validos em supabase/migrations: 823`.
- `git diff --stat dia/2026-10-11...HEAD` / `git diff ... | wc -c`: escopo conferido antes do fechamento; o bloco de fatos medidos do fechar registra os números finais do commit.

- `src/integrations/supabase/__tests__/manualPriorityTypes.test.ts` é propositalmente um contrato de tipo: TypeScript apaga `types.ts` em runtime, então a prova real desse arquivo é o `tsc -b --force` falhar sem a correção e passar com ela; o `it` só deixa o fixture rodável pelo Vitest.
- Os arquivos de teste fora da lista estrita são indispensáveis para cumprir a recusa: `scripts/db-audit/manual-priority.test.mjs` é o teste real que executa a migration/RPC/rollback em Postgres; `src/adapters/__tests__/evolutionAdapter.test.ts` prova o chamador que quebrou no typecheck. `src/adapters/evolutionAdapter.ts` é o único código fora de SQL/tipos e só adiciona os três campos nulos exigidos pelo novo `contacts.Row`.

## O que não fiz

- Não alterei tela, Edge Function, política global nem manifesto/guarda de CI. O único arquivo fora da lista SQL/teste/tipos foi `src/adapters/evolutionAdapter.ts`, limitado a 3 campos nulos exigidos pelo typecheck real após o schema novo.
