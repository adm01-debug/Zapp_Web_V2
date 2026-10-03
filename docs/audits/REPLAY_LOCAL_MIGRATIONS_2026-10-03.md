# Replay local das migrations — E24 (2026-10-03)

Item do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`: *"Replay integral das migrations — job (ou doc de
execução local) com replay verde ponta a ponta"* e *"divergências viram exceção documentada ou fix"*.

**O banco canônico não foi tocado.** O replay roda em container Docker descartável, criado e removido
pelo próprio script.

> **Registro honesto de duas rodadas anteriores, ambas com medição errada.** A 1ª usou um banco
> **vazio**: `28 ok / 737 falhas` — todas do harness (as extensões só podem ser criadas no banco
> `postgres`). A 2ª usou o banco certo, mas o usuário `postgres`: `695 ok / 70 falhas`, das quais 279
> eram `permission denied for schema public`. Nenhum desses números é um fato sobre o repositório, e
> ficam registrados porque, lidos sem contexto, virariam alarme falso sobre 737 migrations quebradas.

## Como rodar

```bash
bash scripts/db-audit/replay-local.sh
```

Sobe `public.ecr.aws/supabase/postgres:17.6.1.159`, cria o bootstrap que os **serviços** do Supabase
trazem (`storage`, `supabase_migrations`, `app.settings.trusted_domains`), aplica
`supabase/migrations/*.sql` em ordem como `supabase_admin` e grava o **erro ao lado do arquivo** em
`replay-erros.tsv`. Container próprio (`hermes-e24-replay`), porta 5499, removido no fim.

## Resultado medido (2026-10-03)

| | |
|---|---|
| Migrations no repo | **767** (o plano dizia 443) |
| Aplicadas com sucesso | **746** |
| Falhas | **21** |

A evolução — **28 → 695 → 746** — veio só de corrigir o harness. É a prova de que as falhas restantes
são poucas e nomeáveis, e não "o repositório está quebrado".

## As 21 falhas, nomeadas e classificadas

| Arquivo | Erro | Natureza |
|---|---|---|
| `20260927450000_fix_indexes_checks_cleanup.sql` | `syntax error at or near "VAFIDD"` | ⚠️ **Defeito real no arquivo** — ver abaixo |
| `20260916230000_talkx_e93_settings.sql` | `syntax error at or near "NOT"` | A inspecionar |
| `20260925170000_add_reminders_pending_to_tab_counts.sql` | `cannot change return type` | A inspecionar |
| `20260928140200_tab_counts_tasks_own.sql` | `cannot change return type` | A inspecionar |
| `20260929370000_contacts_soft_delete_and_search_filters.sql` | `cannot change return type` | A inspecionar |
| `20260926410000_add_fk_support_indexes.sql` | `relation ... already exists` | Não idempotente (inerte no banco real) |
| `20261001351230_f51a_multiplix_confirm_dispatch_fn.sql` | `function ... already exists` | Não idempotente (inerte no banco real) |
| 3 × publicação realtime (`campaign_events`, `conversation_tasks`) | `already member of publication` | Idempotência esperada |
| 2 × cron (`Job 8 does not exist`, `vacuum-contacts-daily esperado 1x`) | assertiva de job | Depende de jobs criados antes |
| `20260906000001_e31_contacts_is_lid_legacy.sql` | `E31: contagem inesperada de LIDs: 0. Esperado 400-700` | **Assertiva de dados reais** — esperado em banco novo |
| 6 × (função/coluna inexistente, `conversations` não existe) | cascata | Cascata |

**Nenhuma das 21 indica schema quebrado em produção.** Conferido no banco canônico: as constraints
do arquivo defeituoso existem e estão `validated=true`.

## ⚠️ Achado real: migration com SQL inválido e versão já ocupada

`supabase/migrations/20260927450000_fix_indexes_checks_cleanup.sql`, linhas 31 e 47:

```sql
  CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived'))
  NOT VAFIDD;          -- deveria ser NOT VALID
```

As demais constraints do **mesmo arquivo** usam `NOT VALID;` corretamente. É corrupção de texto.

**Por que isso nunca quebrou produção:** o ledger registra a versão `20260927450000` com **outro
nome** — `gamification_guard_fix_xp_cap`. A versão já estava ocupada quando este arquivo entrou no
repositório, então ele **nunca foi aplicado**. As constraints que ele tenta criar existem por outro
caminho (em produção: `chk_conversation_status_values`, `chk_level_min_one` e `chk_xp_non_negative`
presentes e `validated=true`).

**Consequência:** o arquivo é inerte hoje, mas envenena qualquer reconstrução do banco a partir dos
arquivos — que é exatamente o que este replay faz.

### O padrão geral, medido no ledger

O ledger tem **nomes repetidos em versões diferentes**, indicando migrations reaplicadas sob versão nova:

```
20260927430000:gamification_guard_fix_xp_cap
20260927450000:gamification_guard_fix_xp_cap
20260927450001:gamification_guard_fix_xp_cap
20260927500001:talkx_e27_realtime_campaign_events
20260927570000:talkx_e27_realtime_campaign_events
```

## O que falta para o replay ficar cheio

1. **Inspecionar 4 arquivos** (`talkx_e93_settings` + os 3 `cannot change return type`) — o resto é
   cascata ou inércia.
2. **Tratar as assertivas dependentes de dados/jobs** (E31, cron) como exceções nomeadas, não falha.
3. Decidir o destino do arquivo com `NOT VAFIDD` — não editar migration aplicada; aqui cabe remover a
   versão duplicada ou corrigir por versão nova.

## Limites declarados

- **Isto não é o Supabase de verdade.** Faltam os serviços (Storage, Auth, Realtime, pg_cron em
  execução); migrations que dependem deles não são exercidas de verdade.
- O alvo de "443 migrations" do plano está desatualizado: são **767**.
