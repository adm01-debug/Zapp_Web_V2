# Auditoria Supabase de 22/10/2026 — arquivo

Resgatada da branch `claude/loving-lovelace-esc3l2`, que nunca foi mergeada. São 77
arquivos: inventário do banco em 12 seções (`inventario/`), 20 SQLs de proposta
(`propostas/`) e os roteiros de teste de RLS (`testes/`). O código daquela branch já
está na `main`; **este material de decisão não estava em lugar nenhum.**

## Leia isto antes de usar

**Não é a auditoria atual.** A `main` já tem outra, mais nova e mais estruturada, em
`docs/_arquivo/auditoria-supabase/` (inventário `S01`–`S12`, 5 propostas). Esta é uma
rodada **anterior e paralela**, de 22/10/2026, e está aqui porque cobre assuntos que a
outra não cobre — não para substituí-la.

**Nenhuma proposta deste diretório foi aplicada por este resgate.** Os cabeçalhos dizem
"NÃO APLICADA" e isso continua verdade, com as exceções da tabela abaixo.

## O que já aconteceu desde então

Conferido no banco oficial `tnnnlkbymytvtqngbbqh` em 16/11/2026:

| Proposta | Situação hoje |
|---|---|
| `P001` department_invites ownership | **já implementada** por outro caminho: produção tem `dept_invites_select_admin`, `dept_invites_insert_admin` e `dept_invites_delete_admin`, todas em `is_admin(auth.uid())`, e o INSERT ainda exige `created_by` do próprio perfil (migration `20261114121000`) |
| `P003_log_search_event_rpc` | **já implementada**: a função existe nas migrations da `main` |
| `P010` login_attempts TTL | **já implementada em substância**: o cron `login-attempts-retention-90d` roda às 04:41 e apaga por `last_attempt_at/updated_at/created_at`. Falta só o índice `idx_login_attempts_updated_at`, detalhe de desempenho numa tabela pequena |
| `01_revogar_grants_anon`, `02_rls_with_check`, `03_drop_unused_indexes`, `04_fk_indexes`, `05_drop_duplicate_indexes` | mesmos assuntos das 5 propostas da auditoria mais nova em `docs/_arquivo/auditoria-supabase/propostas/` |

## O que continua pendente, com o número de hoje

Medido em 16/11/2026, não em 22/10:

| Proposta | Dizia em 22/10 | Hoje |
|---|---|---|
| `P01` UPDATE sem `WITH CHECK` | 39 policies | **29 policies** |
| `P03` ledger com `statements` NULL | 65 migrations | **63 migrations** |
| `P04` índices sem uso | 107 MB | **328 índices, 46 MB** |
| `P06` retenção do auth audit log | ausente | **nenhum cron** faz isso |
| `P08` / `P09` crons de vacuum | propostas | só existe `vacuum-contacts-daily` (03:42) |
| `P02` MFA obrigatório para admin/supervisor | proposta | **não verificado** — exigiria as APIs de auth, que são proibidas nesta sessão por conterem PII |
| `P002` wrapper de `get_search_insights`, `P005` limite de tamanho da voz do Multiplix, `P006` policy de storage por papel, `P007` índices de desempenho em `messages` | propostas | **não verificado** nesta sessão |

O `P03` merece atenção: 63 migrations no ledger com `statements` NULL significa que o
replay local não consegue reconstruir o que elas fizeram. É dívida de auditoria do
banco, não de código.

## Procedência

Branch `claude/loving-lovelace-esc3l2`, árvore `auditoria-supabase/`, commit
`bc79d33b54adb458352f7ad660a31a8a7909dc78`. Arquivos copiados byte a byte; só este
README foi acrescentado.
