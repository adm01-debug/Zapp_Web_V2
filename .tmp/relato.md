Especialista: senior (area-sql-banco)
## O que mudou e por quê
- supabase/migrations/20261015030056_sla_register_resolvedor_canonico.sql (nova): o register volta a resolver os minutos pelo resolvedor canônico granular, com fallback para a RPC deste cartão quando o granular ainda não está na árvore; re-declara o resolvedor canônico com corpo idêntico ao do cartão granular (esta árvore ainda não o tem); mantém trava/lock/status/REVOKEs exigidos pelo contrato R2-SLA-003.
- scripts/db-audit/sla-resolve-applicable-contract.test.mjs: a fixture aplica também o resolvedor canônico; trava estática nova exige que o register (última definição) chame o canônico.
## Prova (saída real dos comandos)
- vermelho antes (árvore empilhada granular + migration antiga): `node --test scripts/db-audit/sla-granular-contract.test.mjs` → `not ok 3 - fallback intermediario: sla_configurations is_default aplica antes do padrao de 5 min` com `# fail 9` de `# tests 9`; causa no log: `ERROR: function public.resolve_applicable_sla(uuid) does not exist`.
- verde depois (empilhada): granular `# pass 9` de `# tests 9` (inclui o nó citado), meu contrato `# pass 10` de `# tests 10`, delivery `# pass 4` de `# tests 4`.
- verde depois (árvore limpa, só arquivos deste cartão): meu contrato `# pass 10` de `# tests 10`, delivery `# pass 4` de `# tests 4`.
- trava nova sem a correção: `# fail 1`; com a correção: `ok 9 - register usa o resolvedor canonico granular (trava do empilhamento R2-SLA-003)`.
- rollback de verdade (PostgreSQL descartável): aplica a migration nova → `NEW-EXIT=0`; aplica o `-- Rollback:` do cabeçalho → `RB-EXIT=0`; `pg_get_functiondef` do register volta a apontar a RPC (`t`) e não o canônico (`f`).
## Ponto 1 (espelho no empilhamento, nó do fallback intermediário): resolvido
Causa: meu register chamava a RPC nova, que a fixture do contrato granular não aplica (ela aplica só o resolvedor canônico + o register) — `undefined_function` derrubava os testes de comportamento e o estático. Correção no arquivo novo acima. A correção prevista em t_81c550ae não foi entregue (perfil senior travou); fiz a correção neste cartão.
## Ponto 2 (reproduzir, corrigir e fechar): reproduzido e corrigido
Reproduzi com o mecanismo do espelho (`node --test` na árvore empilhada com os arquivos do cartão granular — o `zapp-verify` não roda standalone neste ambiente: `cópia não encontrada`); corrigi; fecho neste relato.
## O que NÃO fiz e por quê
- Não toquei no contrato granular nem no delivery: fora de `ARQUIVOS QUE PODE TOCAR`; a correção é só na minha migration (o delivery quebrou num passo intermediário e voltou a 4/4 com a guarda de compatibilidade).
- Não re-executei `supabase/tests/sla_resolve_applicable.sql` no banco_local: o stack `v2-26101222220aaa` não subiu (2 tentativas, `EXIT=1`, travas de infra falhando com 446 stacks obsoletos e disco em 87%). Cobertura equivalente: as suítes descartáveis executam os mesmos corpos de função e o rollback de verdade (saídas acima); o cenário da seção (2) do teste servidor (gatilho→register→regra de 30 min) é o mesmo dos testes 4–5 do meu contrato, verdes. Recomendo ao integrador re-rodar o teste servidor quando a infra voltar.
- Não mudei `mark_first_response`: nenhum nó do empilhamento o acusa; fora do ponto da recusa.
- hotspot: `supabase/migrations` — quando o cartão granular integrar, haverá 2 definições de `resolve_applicable_first_response_minutes` (a minha, posterior, sombreia com corpo idêntico); deduplicar num cartão de higiene.
## Arquivos (`git diff --name-only 96dd72dc5f...HEAD`)
scripts/db-audit/sla-first-response-delivery-contract.test.mjs
scripts/db-audit/sla-resolve-applicable-contract.test.mjs
src/integrations/supabase/types.ts
supabase/migrations/20261013012747_sla_resolve_applicable.sql
supabase/migrations/20261015030056_sla_register_resolvedor_canonico.sql
supabase/tests/sla_resolve_applicable.sql
(Do trabalho anterior: todos exceto a migration nova e a minha edição no teste; meu commit `85a2a47` contém só a migration nova + a edição do teste.)
