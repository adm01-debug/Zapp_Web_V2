Especialista: senior
Skill usada: area-sql-banco

Ponto 1 — rebase do trabalho aprovado na ponta atual preservando o que já entrou na branch
- O que mudei: trouxe o commit aprovado c8dbbe7a049a para a branch v2/refazer-instance-pauses-whatsapp-t-8215f-26101308095bf3, baseada em dia/2026-10-13, com cherry-pick sem commit. O único conflito material do rebase foi em .tmp/relato.md, porque a branch atual já tinha relato de outro cartão; resolvi removendo os marcadores e escrevendo este relato novo do refazer atual. Os arquivos de produto do commit aprovado entraram sem conflito de conteúdo: src/integrations/supabase/types.ts recebeu apenas os tipos gerados de instance_pauses/funções, e supabase/migrations/20261011183812_instance_pauses.sql + supabase/tests/instance_pauses.sql foram adicionados.
- Prova: git diff --cached --name-only lista só .tmp/relato.md, src/integrations/supabase/types.ts, supabase/migrations/20261011183812_instance_pauses.sql e supabase/tests/instance_pauses.sql.

Ponto 2 — não acrescentar comportamento além da entrega aprovada
- O que mudei: não alterei a lógica aprovada da migration nem do teste depois do cherry-pick; só reescrevi o relato conflitado. Não toquei CI, manifesto, docs, telas, Edge Functions, políticas existentes nem arquivos fora da lista permitida.
- Prova: git show --stat c8dbbe7a049a e git diff --cached --stat mostram o mesmo escopo de produto do commit aprovado (migration, teste SQL e types), mais este relato.

Ponto 3 — teste do cartão e verificação completa
- Teste SQL do cartão: zapp-db-local psql . v2-26101308095bf3 -v ON_ERROR_STOP=1 < supabase/migrations/20261011183812_instance_pauses.sql -> exit 0; em seguida zapp-db-local psql . v2-26101308095bf3 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql -> exit 0, com NOTICE instance_pauses: T1..T9 OK — 12 grupo(s) e NOTICE instance_pauses: suite OK (... T10 rollback executado e estado restaurado).
- Verificação rápida: zapp-verify . --rapido -> exit 0; OK db_guard, tipos, lint e migrations; VERIFY: VERDE SEM BANCO (104s). O banco foi verificado separadamente pelo teste SQL real acima.
- Verificação exigida pelo cartão: zapp-verify full . foi executado e NÃO fechou verde neste workspace. Resultado: OK db_guard; OK tipos; OK lint; OK migrations; FALHOU testes (ver /home/joaquim_ataides/.local/state/zapp-verify/1eacf37a5fb5/testes.log). O jev-juiz classificou a falha como pre_existing (certeza 0.88) e mandou não consertar fora do escopo. Confirmei na base sem o meu diff com git stash: bunx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx -> exit 1; Test Files 1 failed (1); Tests 1 failed | 4 passed (5). Essa falha é fora do escopo do cartão e não toca os arquivos alterados aqui.

NÃO CONCLUÍ:
- Não fechei o cartão com hermes-tarefa-fechar porque o critério explícito pedia zapp-verify full verde, e o full atual está vermelho por falha preexistente fora do diff. Deixei o rebase pronto no workspace e registrei a prova para o próximo passo do Claude/revisor.

Arquivos alterados (git diff --cached --name-only):
.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011183812_instance_pauses.sql
supabase/tests/instance_pauses.sql

Verificações executadas:
- bun install -> exit 0.
- zapp-db-local psql . v2-26101308095bf3 -v ON_ERROR_STOP=1 < supabase/migrations/20261011183812_instance_pauses.sql -> exit 0.
- zapp-db-local psql . v2-26101308095bf3 -v ON_ERROR_STOP=1 < supabase/tests/instance_pauses.sql -> exit 0; T1..T9 OK — 12 grupo(s); suite OK com T10 rollback executado e estado restaurado.
- zapp-verify . --rapido -> exit 0; VERIFY: VERDE SEM BANCO (104s).
- zapp-verify full . -> exit 1; FALHOU testes; 3 failed | 1312 passed; log em /home/joaquim_ataides/.local/state/zapp-verify/1eacf37a5fb5/testes.log.
- jev-juiz falha /home/joaquim_ataides/.local/state/zapp-verify/1eacf37a5fb5/testes.log -> pre_existing (certeza 0.88).
- bunx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx com o meu diff stashed -> exit 1; Test Files 1 failed (1); Tests 1 failed | 4 passed (5).

Autorrevisão:
- Escopo limitado aos arquivos permitidos pelo cartão.
- Nenhum dado de produção, segredo, deploy, push, PR ou migration em produção foi usado.
- O teste executa SQL real no banco local e executa o rollback da migration dentro da suíte.
- A resolução do conflito preservou a ponta atual: o único conflito foi o relato, não houve escolha de comportamento de produto.