# Replay local das migrations — E24 (2026-10-03)

Item do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`: *"Replay integral das migrations — job (ou doc de
execução local) com replay verde ponta a ponta"* e *"divergências viram exceção documentada ou fix"*.

**O banco canônico não foi tocado em nenhuma rodada.** O replay roda em container Docker descartável,
criado e removido pelo próprio script.

## Como rodar

```bash
bash scripts/db-audit/replay-local.sh
```

Sobe `public.ecr.aws/supabase/postgres:17.6.1.159`, completa o bootstrap que os **serviços** do
Supabase trazem, aplica `supabase/migrations/*.sql` em ordem como `supabase_admin` e grava o **erro ao
lado do arquivo** em `replay-erros.tsv`. Container próprio (`hermes-e24-replay`), porta 5499.

## Resultado medido

| Rodada | Resultado | O que mudou |
|---|---|---|
| 1ª | **28 / 737 falhas** | Banco **vazio**: as extensões só podem ser criadas no banco `postgres` — falha 100% do harness |
| 2ª | **695 / 70** | Banco certo, usuário `postgres`: 279 `permission denied for schema public` |
| 3ª | **746 / 21** | Usuário `supabase_admin` + bootstrap de `storage`/`supabase_migrations` |
| 4ª | **731 / 37** ⚠️ | **Regressão minha**: tentei "ajudar" com `create schema cron` + `create extension pg_cron` e `drop/create publication` — **quebrei o pg_cron que a imagem já trazia** (10 `cron.schedule(...) does not exist` + 6 `cron.job does not exist`) |
| 5ª | **749 / 19** | Revertido, mantendo só o que ajudou (colunas de `auth.users`) |

| | |
|---|---|
| Migrations no repo | **768** (o plano dizia 443) |
| Aplicadas com sucesso | **749** |
| Falhas | **19**, todas nomeadas abaixo |

**Não é verde.** E a lição mais cara das cinco rodadas não é sobre as migrations, é sobre o
instrumento: **quatro números diferentes saíram do mesmo repositório**, e só o último merece ser lido
como fato. Os anteriores estão aqui de propósito — um "737 migrations quebradas" ou um "37 falhas"
lidos sem contexto viram pânico sobre um banco que está são.

## As 19 falhas, nomeadas e classificadas

### Defeito real no arquivo (SQL que nunca roda) — 2

| Arquivo | Erro | Situação em produção |
|---|---|---|
| `20260927450000_fix_indexes_checks_cleanup.sql` | `NOT VAFIDD;` (deveria ser `NOT VALID`) | **Inerte**: o ledger tem essa versão com outro nome (`gamification_guard_fix_xp_cap`), então o arquivo nunca foi aplicado. As constraints existem e estão `validated=true` ✓ |
| `20260916230000_talkx_e93_settings.sql` | `CREATE POLICY IF NOT EXISTS` — **não existe no PostgreSQL** (é `DROP POLICY IF EXISTS` + `CREATE POLICY`) | **Inerte**: superseded por `talkx_settings_policies_replay_safe` e `talkx_settings_replay_idempotent`, que já consertaram o padrão. `talkx_settings` existe, RLS ligado, 2 políticas, 10 linhas ✓ |

Os dois **só quebram reconstrução a partir dos arquivos** — exatamente o que este replay faz.

### Artefato de ordem/idempotência (inertes no banco real) — 6

`already member of publication` ×3 (`talkx_campaign_events`, `conversation_tasks` ×2) ·
`idx_gmail_accounts_user_id already exists` · `multiplix_confirm_dispatch already exists` ·
`policy "talkx_blacklist_update" does not exist`.

### Assertiva que exige ambiente real — 3

`E31: contagem inesperada de LIDs marcados: 0. Esperado 400-700` ·
`Job 8 does not exist or you don't own it` · `job vacuum-contacts-daily esperado 1x, encontrado 0`.

### Cascata de falha anterior — 5

`notify_due_reminders()` · `column "notified_at"` · `sync_contact_status_on_closure()` ·
`relation "public.conversations"` · `column "conversation_id"`.

### A inspecionar — 3

`20260925170000_add_reminders_pending_to_tab_counts.sql`,
`20260928140200_tab_counts_tasks_own.sql` e
`20260929370000_contacts_soft_delete_and_search_filters.sql` → `cannot change return type of existing
function`. Pode ser ordem de aplicação ou divergência real; **sozinho, o erro não decide**.

## O que falta para o replay ficar cheio

1. **Inspecionar os 3** `cannot change return type` comparando o corpo das funções entre as migrations.
2. **Reduzir as 5 de cascata** — cada uma depende de um objeto que outra migration não chegou a criar.
3. **Decidir o destino dos 2 arquivos com SQL inválido** — não editar migration aplicada (regra 7);
   aqui cabe remover a versão duplicada ou consertar por versão nova.

## Limites declarados

- **Isto não é o Supabase de verdade.** Faltam os serviços (Storage, Auth, Realtime, pg_cron *em
  execução*); migrations que dependem deles não são exercidas de verdade.
- **Não mexa no pg_cron nem na `supabase_realtime` da imagem.** Está medido: tentar recriar piora.
- O alvo de "443 migrations" do plano está desatualizado: são **768**.
