Especialista: iris

## O que mudou e por quê
- src/components/admin/useTarefasAgendadas.ts (novo): hook react-query que lê a agenda por
  `admin_list_cron_jobs()` (sem argumentos) e alterna por `admin_toggle_cron_job({p_jobname,
  p_ativo})`, com trava de reentrada (dois cliques = uma chamada) e tradução de erro: negação de
  acesso vira a mensagem fixa do `describeAccessError` (sem nome de função/policy) e o resto vira
  texto genérico. O SQL do job (`cron.job.command`) não é pedido nem exibido: o tipo tem só os seis
  campos que a RPC devolve.
- src/components/admin/CronJobsTab.tsx (novo): a aba. Estados carregando (role="status"), erro
  (role="alert" + "Tentar de novo"), vazio ("Nenhuma tarefa agendada encontrada.") e tabela com Nome,
  Agenda, Situação (Ativo/Pausado), Última execução (Intl pt-BR; sem execução = "Nunca executada") e
  Resultado (status do pg_cron + return_message em 2 linhas). Pausar/ativar é um Switch que abre um
  AlertDialog de confirmação antes de chamar a RPC; a linha em alteração fica desabilitada.
- src/components/admin/AdminView.tsx: a lista de abas virou o array `abas` e a aba "Tarefas
  agendadas" (ícone CalendarClock, painel sob SectionErrorBoundary) só entra quando `isAdmin` — o
  supervisor continua vendo as 7 de antes e o atendente segue no "Acesso Restrito".
- src/components/admin/__tests__/CronJobsTab.tarefas.test.tsx (novo) e
  __tests__/AdminView.tarefas-agendadas.test.tsx (novo): provas do cartão.
- src/components/admin/__tests__/AdminView.a11y.test.tsx: o teste que contava abas passou de 7 para
  8 — a contagem mudou de verdade para o admin (mock do teste é admin), não é afrouxamento: a
  asserção segue exata (`toHaveLength(8)`) e o novo teste prova que fora do admin a aba não existe.

## FAXA DO PAI
FAIXA DO PAI: commits 0638315225 e 8045a09d29 do cartão t_ac2fa555 — não são deste cartão. Vieram
por cherry-pick do intervalo dia/2026-10-11..d2f008acc e são eles que trazem a migration
`supabase/migrations/20261011173000_admin_cron_jobs.sql`, o contrato
`tests/contracts/admin-cron-jobs-rpc.contract.test.ts`, o script
`scripts/db-audit/admin-cron-jobs-rpc.test.sh`, o trecho novo de `.github/workflows/db-guard.yml` e
as duas entradas de RPC em `src/integrations/supabase/types.ts`. O único conflito do cherry-pick foi
de POSIÇÃO em `db-guard.yml` (o passo novo e o job `replay-migrations`): resolvi mantendo os dois —
o passo entrou no job `offline-contract` e o job `replay-migrations` ficou inteiro. Validei com
`python3 -c "yaml.safe_load(...)"` → jobs = ['offline-contract', 'replay-migrations'] e último passo
do offline-contract = "Provar as RPCs do painel admin de cron jobs (t_ac2fa555)".

## Por que esses cinco arquivos estão no diff (o cartão manda trazê-los)
O cartão manda, na seção DEPENDÊNCIA, "traga a FAIXA inteira: `git cherry-pick ... <base_dia do JSON
do pai>..<sha do pai>`" quando o trabalho do pai não está no workspace. O pai t_ac2fa555 é o CR1
deste mesmo cartão (as funções `admin_list_cron_jobs`/`admin_toggle_cron_job` que a tela consome), e
`git merge-base --is-ancestor d2f008acc HEAD` deu falso aqui — ou seja, sem o cherry-pick a aba não
compila e o critério 1 é impossível. Por isso `.github/workflows/db-guard.yml`,
`scripts/db-audit/admin-cron-jobs-rpc.test.sh`, `src/integrations/supabase/types.ts`,
`supabase/migrations/20261011173000_admin_cron_jobs.sql` e
`tests/contracts/admin-cron-jobs-rpc.contract.test.ts` estão no diff: são a faixa do pai, trazida de
propósito, não alteração minha — o único toque meu nesses arquivos foi devolver a quebra de linha
final de `db-guard.yml` (commit fc2e77932a), que o próprio cherry-pick havia perdido ao resolver o
conflito de posição.

## Prova
- verificação do cartão (critério 2): `zapp-verify . --rapido` → `OK db_guard 0s | OK tipos 232s | OK
  lint 8s | OK migrations 1s` e `VERIFY: VERDE SEM BANCO (241s)`. O `banco_local` sai "NÃO
  VERIFICADO: sem nome de conjunto" porque este cartão não toca banco (as RPCs vieram da faixa do
  pai). Antes disso o verify tinha ficado VERMELHO em `tipos` com "TypeScript local nao encontrado.
  Execute a instalacao das dependencias primeiro" — era o workspace recém-criado sem `bun install`;
  rodei `bun install` (651 pacotes) e o verify ficou verde.
- vermelho antes: `git show HEAD:src/components/admin/AdminView.tsx > src/components/admin/AdminView.tsx`
  (AdminView SEM a aba) e `npx vitest run src/components/admin/__tests__/AdminView.tarefas-agendadas.test.tsx
  src/components/admin/__tests__/AdminView.a11y.test.tsx` → `× admin vê a aba e, ao abrir, a tela lê a
  agenda pela RPC` e `× expõe tablist nomeado, 8 abas ...`; linha final `Test Files 2 failed (2); Tests
  2 failed | 12 passed (14)`. Depois restaurei o arquivo do `.tmp/` (o worktree voltou ao estado
  commitado).
- verde depois: `npx vitest run src/components/admin/__tests__` → `Test Files 23 passed (23); Tests 98
  passed (98)` (nenhum pulado).
- tipos: `npx tsc -p tsconfig.app.json --noEmit` → sem saída, exit 0.
- lint: `npx eslint` nos 5 arquivos do cartão → exit 0, 0 problemas.

## Estados da tela alterada
- carregando: esqueleto com `role="status"` e texto "Carregando tarefas agendadas…" (o react-query
  só marca `isLoading` na primeira busca).
- erro: card com `role="alert"`, mensagem traduzida (sem eco da RPC) e botão "Tentar de novo" que
  refaz a consulta.
- vazio: "Nenhuma tarefa agendada encontrada."

## O que NÃO fiz e por quê
- Nada de banco: as RPCs, a migration e o contrato vieram prontos da faixa do pai (acima); não
  alterei SQL, Edge Function nem migration neste cartão.
- Não mexi em `src/hooks/**` (área do Hugo): o acesso a dados ficou em
  `src/components/admin/useTarefasAgendadas.ts`, ao lado do `useAdminData.ts` que já mora ali, e
  importa o client por `@/lib/supabaseHelpers` (o eslint restringe só o caminho
  `**/integrations/supabase/client`, conferido com eslint exit 0).
