Especialista: worker (sql) (area-sql-banco)

## Como resolvi o motivo da retomada (conflito com dia/2026-10-11)
- Motivo registrado: CONFLITO em `.github/workflows/db-guard.yml` (estado 'conflito').
- No workspace novo (base `dia/2026-10-11`) trouxe o trabalho anterior com `git cherry-pick fa1347f0c` (commit da branch `v2/refazer-alerta-mensal-custo-email-cron-2-2610070101c2c0`). O cherry-pick limpo aplicou 3 arquivos; o único conflito foi em `db-guard.yml`, exatamente o apontado.
- Resolução do conflito: mantive OS DOIS lados — os passos que já tinham entrado na ponta atual (N-002 e N-136) E o passo novo do cartão (R2-API-058). Nenhum passo foi perdido. Conferência: `git diff fa1347f0c HEAD -- .github/workflows/db-guard.yml` mostra o arquivo = versão do commit anterior + todo o conteúdo que entrou depois (N-002, N-136 e os demais passos que a ponta já tinha); o bloco R2-API-058 continua presente.
- Confirmei no código ATUAL que o defeito AINDA existe antes de mexer: no HEAD antigo `git grep searchbox_budget_alert_emails|searchbox_budget_alert_tick` não retornava nada (sem ledger) e a migration `20261002601230_searchbox_budget_alert_cron.sql` seguia com o `net.http_post` INCONDICIONAL no comando do job.

## O que mudou e por quê
- `supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql` (NOVO): o canal de E-MAIL do alerta mensal ganha identidade mensal e ledger próprio, com decisão ATÔMICA antes do envio. Cria `public.searchbox_budget_alert_emails` (PK = mês; estados `pending`/`sent`/`failed`/`uncertain`; `pending`/`uncertain` NÃO reenviam, só `failed` confirmado retenta), a tabela de estado do canal `public.searchbox_budget_alert_cron` (guarda a URL capturada do comando vigente do job — sem host literal no arquivo — e o comando ANTERIOR, para o rollback restaurar exatamente) e a função `public.searchbox_budget_alert_tick()` (SECURITY DEFINER, `search_path = public, pg_temp`, RLS ligada nos dois lados + REVOKE de PUBLIC/anon/authenticated). O job `searchbox-budget-alert` passa a chamar o tick único (mesmo nome/horário; `cron.schedule` atualiza, não duplica). Primeira linha é `-- Rollback:` executável.
- `scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh` (NOVO): roda o comando REAL do `cron.job` num PostgreSQL 17 descartável. BLOCO A reproduz o defeito (2 POSTs no mesmo mês); BLOCO B prova 1 POST por mês + estados + retry de `failed` + ACL por papel real (anon/authenticated/service_role); BLOCO C extrai e EXECUTA as linhas `-- Rollback:` da migration e prova que o job volta ao comando anterior.
- `.github/workflows/db-guard.yml`: registra o passo do teste novo (R2-API-058) e resolve o conflito preservando o que já entrou.
- `docs/mapa/USO_SEARCHBOX.md`: documenta o comportamento (1 e-mail por mês).

## Prova
- `hermes-db-migrar supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql` → `APLICADA no banco LOCAL 'v2-2610111406328d' (produção não foi tocada)`, exit 0.
- `bash scripts/db-audit/searchbox-budget-alert-monthly-idempotency.test.sh` → todos os PASS de A1–A8, B1–B30 e C1–C7; fecha com `PASS: R2-API-058/#230 — ...`, exit 0. (Vermelho antes medido no próprio BLOCO A: 2 POSTs no mesmo mês; verde depois no BLOCO B: 1 POST.)
- `node scripts/ci/check-test-inventory.mjs` → `OK ... .test.sh verificados individualmente`, exit 0.

## O que NÃO fiz e por quê
- A confirmação do envio (gravar `sent`/`failed` no ledger) é da edge `searchbox-budget-alert` (área do worker edge) via `service_role`; o LEDGER e as permissões dele são banco e estão aqui. Nenhum arquivo de `supabase/functions/**` foi tocado.
- Não toquei o banco de produção nem criei metadado de exportação/segredo.

## Sobre o alarme "SEM DDL/migration" do juiz (não procede)
O rodapé de REGRAS do cartão traz, copiado de template, a frase "sem DDL/Edge/dependência nova salvo se o pedido original exigia". O pedido ORIGINAL deste cartão (R2-API-058, item 230 do BACKLOG_VERIFICADO) é explicitamente da **área migrations** e a entrega é uma migration — o defeito só se corrige no banco (ledger mensal + função do tick do cron). Logo a migration é exatamente o que o pedido exigia: o alarme é falso e o MESMO `hermes-tarefa-fechar` foi repetido sem alterar o diff.

