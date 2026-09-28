# Runbook — Rotação do CRON_SECRET

> Fonte de verdade: este documento. Se algo aqui divergir do código/infra real,
> corrija ESTE arquivo no mesmo commit do fix.

O `CRON_SECRET` protege os endpoints de cron das edge functions (header
`x-cron-secret`). Ele existe em **3 cópias que precisam ser idênticas** — rodar a
rotação fora de ordem quebra o cron em produção.

## As 3 cópias

| # | Cópia | Onde vive | Quem consome |
|---|---|---|---|
| 1 | GitHub Actions secret `CRON_SECRET` | Repo → Settings → Secrets → Actions | (a) `deploy-functions.yml` empurra para o env das edges; (b) `crm-sync-worker.yml` usa direto como header ao chamar `crm-integration` |
| 2 | Env `CRON_SECRET` das edges | Supabase Cloud (secrets das functions) | Toda edge que valida `x-cron-secret` contra `Deno.env.get("CRON_SECRET")` — `gmail-cron-sync`, `crm-integration` |
| 3 | Vault `gmail_cron_secret` | Supabase Cloud, projeto `tnnnlkbymytvtqngbbqh` (`vault.secrets`) | O pg_cron do gmail lê em runtime e envia como header ao chamar `gmail-cron-sync` |

Referências no código:
- `.github/workflows/deploy-functions.yml:142-153` — seta o env da edge a partir do Actions secret (`supabase secrets set CRON_SECRET=...`).
- `.github/workflows/crm-sync-worker.yml:35,58,69` — usa o Actions secret direto como `x-cron-secret` chamando `crm-integration`.
- `supabase/functions/gmail-cron-sync/index.ts:11-12` — valida o header contra o env.
- `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql:23` — pg_cron lê o header do vault (`vault.decrypted_secrets WHERE name='gmail_cron_secret'`).

## O que NÃO faz parte desta rotação

**`multiplix_cron_secret` é autocontido** — não sincronize com o `CRON_SECRET`.
Ele vive só no vault (`multiplix_cron_secret`), é criado por
`supabase/migrations/20260927320000_multiplix_cron_scheduler.sql` via
`vault.create_secret`, e tanto o pg_cron quanto a edge `multiplix-send` leem o
mesmo vault (a edge via RPC `get_multiplix_cron_secret()`, service_role only).
Rotacionar o multiplix = atualizar só o vault, sem tocar Actions secret nem deploy.

## Ordem obrigatória da rotação

A ordem minimiza a janela em que o cron fica quebrado (as cópias divergem
temporariamente). Nunca atualize o vault antes de as edges terem redeployado.

1. **Gerar o novo valor** (hex de 32 bytes), fora do output/log:
   ```sh
   openssl rand -hex 32
   ```
2. **Atualizar o Actions secret** `CRON_SECRET` (via `github_set_actions_secret`).
   A partir daqui, até o passo 3, `crm-sync-worker` e o env das edges divergem —
   o cron do CRM que chama `crm-integration` fica quebrado nessa janela.
3. **Redeployar as edges**: disparar `deploy-functions.yml` (workflow_dispatch na
   `main`) e **aprovar o environment `producao-edge-functions`** na aba Actions.
   Só depois do deploy concluir o env das edges = novo valor. Agora o CRM volta a
   funcionar; o gmail-cron ainda usa o vault antigo (próximo passo).
4. **Atualizar o vault** `gmail_cron_secret` (via `SUPABASE - ZAPP WEB V2 - MCP`,
   `db_query`), só depois de o deploy do passo 3 ter concluído:
   ```sql
   SELECT vault.update_secret(
     (SELECT id FROM vault.secrets WHERE name = 'gmail_cron_secret'),
     '<NOVO_VALOR>'
   );
   ```
5. **Verificar** (abaixo).

## Verificação

- Deploy das edges concluído: `github_list_workflow_runs` → run `Deploy Edge Functions`
  com `conclusion: success`.
- Cron do gmail voltou a autenticar (200, não 403): checar as execuções do pg_cron
  ou os logs da edge `gmail-cron-sync` após o passo 4.
- CRM (se `CRM_SYNC_WORKER_ENABLED` ligado): run do `crm-sync-worker` com health 200.

## Notas

- O `deploy-functions.yml` pausa em `Waiting` no environment `producao-edge-functions`
  até aprovação humana — o passo 3 não conclui sozinho.
- Nunca imprima o valor do secret no output, em log ou em commit.
- Cadência recomendada: rotacionar a cada 90 dias, ou imediatamente após suspeita de vazamento.
