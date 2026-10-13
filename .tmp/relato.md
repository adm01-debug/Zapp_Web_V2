Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/crm/useContactChangeLog.ts` (novo): hook que lê a trilha de alteração de contato e a entrega pronta para a tela. Lê PAGINADO com `fetchAllRows` (ordem `performed_at desc` + `id desc`), traduz os NOMES das colunas alteradas para pt-BR (`phone`→`Telefone`, `assigned_to`→`Responsável`...) sem receber valor nenhum, traduz a operação (`insert`→`Criado`, `update`→`Alterado`, `soft_delete`→`Excluído`, `restore`→`Restaurado`), devolve `performed_at` exatamente como o banco guarda e resolve o ator em `profiles`. Leitura vazia devolve `[]`; erro sobe; leitura incompleta (erro no meio ou teto de páginas) vira erro em vez de lista parcial apresentada como trilha inteira. Ator com perfil excluído: o nome some (`hasActor=false`) mas a entrada CONTINUA na trilha.
- `src/hooks/crm/__tests__/useContactChangeLog.test.tsx` (novo): 10 testes com o cliente Supabase mockado — pt-BR dos campos, vocabulário de exclusão/restauração, data intacta, vazio, erro, leitura de 1500 linhas (acima do teto de 1000 do PostgREST) sem repetir nem perder, ator resolvido, ator excluído e falha ao resolver o ator.
- `src/hooks/crm/index.ts`: exporta `useContactChangeLog`.
- A leitura de `profiles` (nomes dos atores) trata o `error`: falha sobe como erro da query em vez de o erro ser engolido e todo ator parecer "excluído" (aviso do portão no 1º fechar, recusa real TL-171).
- A faixa do pai (banco, t_ba716533) foi trazida por `git cherry-pick -x 6b029fb72` (migration + `types.ts` + teste SQL) — sem ela o hook não teria a tabela nem os tipos. Os commits de relato do pai não foram trazidos: são `.tmp/relato.md`, não código.

## Prova
- vermelho antes: `npx vitest run src/hooks/crm/__tests__/useContactChangeLog.test.tsx` → `Cannot find module '../useContactChangeLog'` / `Test Files 1 failed (1); Tests no tests` (módulo ainda não existia)
- verde depois: `npx vitest run src/hooks/crm/__tests__/useContactChangeLog.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)`

## O que NÃO fiz e por quê
- Não mexi em `supabase/**` nem reapliquei a migration: é do cartão de banco (pai) e já veio pelo cherry-pick.
- Não criei tela/componente de histórico: é de outro especialista (telas). O hook já entrega `fieldLabels`, `operationLabel` e `performedAt` prontos.
