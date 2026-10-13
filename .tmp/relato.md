Especialista: worker (sql) (area-sql-banco)

# Retomada — fix(ci): baseline do usage-guard acompanha a RPC da conexao padrao empilhada (#174)

## O que mudou e por quê
- Retomei a entrega de #174 trazendo o stack inteiro para a base atual (tip `dia/2026-10-13`, commit 96dd72dc5f). Cherry-pick dos 5 commits da branch anterior `v2/t-b59835ff-2610111223f845` (1ccd9e50f6, 21b562b72e, 52b952dc18, c8a6f8b73c, b324381833), um a um, sem reescrever o defeito.
- O único conflito real foi `scripts/db-audit/known-violations.json`, porque a `dia/` passou a ter também a chave temporária `rpc:talkx_campaign_window_open:*` (NOTA 2026-10-11, t_7457095e), que a entrega antiga não conhecia.
- Resolução: **preservei o que já entrou** — mantive a chave `rpc:talkx_campaign_window_open:*` e a NOTA 2026-10-11 no `_comment`, e apliquei só o que é do #174: removi a chave `rpc:set_default_whatsapp_connection:src/hooks/inbox/useConnectionsManager.ts` (fica obsoleta quando a migration 20261006234158 entra no stack) e acrescentei a entrada correspondente em `_resolvido`. Remover exceção aperta o ratchet, não afrouxa.
- Os outros arquivos entraram sem conflito: `supabase/migrations/20261006234158_whatsapp_default_connection_rpc_atomica.sql` (RPC `set_default_whatsapp_connection`, SECURITY DEFINER, `search_path` fixo, nasce fechada), `scripts/db-audit/whatsapp-default-connection-atomicity.test.sh` (nova) e o passo correspondente no `.github/workflows/db-guard.yml` (registro do teste no db-guard).

## Prova
- vermelho antes (guarda com a chave obsoleta de volta): `node scripts/db-audit/supabase-usage-guard.mjs` → `Entradas obsoletas no baseline (a violacao sumiu - remova-as): rpc:set_default_whatsapp_connection:src/hooks/inbox/useConnectionsManager.ts` — EXIT=1
- verde depois (estado do diff): `node scripts/db-audit/supabase-usage-guard.mjs` → `Violacoes totais: 1 | no baseline: 1 | novas: 0` / `OK: nenhuma violacao nova.` — EXIT=0
- prova do banco (migrations REAIS, papeis authenticated/anon, Postgres descartavel):
  `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/whatsapp-default-connection-atomicity.test.sh`
  → todos os blocos A (defeito) e B (RPC) PASS, incluindo B.5b (o gatilho regrava updated_at em exatamente 2 linhas), B.8/B.9 (falha aborta tudo, padrao anterior permanece), B.14 (sem oráculo), B.15 (anon sem EXECUTE), B.18–B.21 (serializacao por advisory lock, termina com exatamente UMA padrao) — saída final `PASS: TRA-004 ...` e EXIT=0.
- `git diff --stat dia/2026-10-13` mostra só os 4 arquivos do #174; nenhum marcador de conflito restante.

## O que NÃO fiz e por quê
- Não toquei na chave `rpc:talkx_campaign_window_open:*` nem na NOTA 2026-10-11: são de outro cartão (t_7457095e) e continuam válidas enquanto a migration do talkx estiver fora de `dia/`.
- Não alterei a migration do #174 além do stack: o corpo e o rollback vieram dos commits originais, inclusive a linha `-- Rollback (SQL executavel, na ordem)` já no formato do modelo.
- Regras de 07–08/10 respeitadas: nada de push/PR/deploy, nada de produção; só banco local descartável.
