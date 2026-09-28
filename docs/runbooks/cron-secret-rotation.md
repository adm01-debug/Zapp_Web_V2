# Runbook: Rotação do CRON_SECRET (sincronização em 3 lugares)

**Última atualização:** 2026-09-28
**Scope:** `adm01-debug/Zapp_Web_V2` (Supabase Cloud `tnnnlkbymytvtqngbbqh`)

---

## O que é

`CRON_SECRET` é o segredo compartilhado que autentica chamadas de cron às edge functions
via header `x-cron-secret`. Diferente dos secrets cobertos em `secret-rotation.md`, ele
vive em **três lugares que precisam ser idênticos** — rotacionar um sem os outros quebra
a autenticação dos crons:

| # | Cópia | Onde | Quem usa |
|---|-------|------|----------|
| 1 | GitHub Actions secret `CRON_SECRET` | Settings → Secrets → Actions | `crm-sync-worker.yml` (linha 35, envia o header) e `deploy-functions.yml` (linhas 142/151–153, **reescreve a cópia 2 em todo deploy de edge**) |
| 2 | Edge env `CRON_SECRET` | Dashboard → Edge Functions → Manage secrets | `crm-integration/index.ts:85` e `gmail-cron-sync/index.ts:12` (comparam com o header recebido) |
| 3 | Vault do banco, secret `gmail_cron_secret` | `vault.secrets` no banco de produção | pg_cron job `gmail-incremental-sync` (a cada 5 min) lê o vault e envia como `x-cron-secret` ao `gmail-cron-sync` — ver `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql` |

Cadeia crítica: **vault (3) → header → edge env (2)**. Se 3 ≠ 2, o sync incremental do
Gmail falha com 401 a cada 5 minutos. Se 1 ≠ 2, o `crm-sync-worker` (dispatch manual;
schedule comentado) falha, e o próximo deploy de edge "conserta" ou "quebra" a cópia 2
com o que estiver na 1.

**Fora do escopo:** `multiplix_cron_secret` é **autocontido** — o pg_cron lê do vault e a
edge `multiplix-send` verifica via RPC `get_multiplix_cron_secret()` contra o **mesmo**
vault (`supabase/migrations/20260927320000_multiplix_cron_scheduler.sql`). Rotaciona num
único lugar, sem sincronização; não seguir este runbook para ele.

**Estado em 2026-09-28:** criado em 2026-08-29, nunca rotacionado.

## Quando rotar

- A cada 90 dias (recomendado), ou imediatamente se aparecer em log/artifact de Actions,
  ou se alguém com acesso aos secrets sair da equipe.

## Procedimento (ordem obrigatória)

**Tempo estimado:** 5–10 min. Janela de indisponibilidade: só o cron do Gmail, ≤1 ciclo
(~5 min) — ver aviso no passo 4.

1. **Gerar o novo valor:** `openssl rand -hex 32` (não colar em chat/issue/log).

2. **Actions secret primeiro** — Settings → Secrets and variables → Actions →
   `CRON_SECRET` → Update. Mesma razão do `PREVIEW_EGRESS_SHARED_SECRET` em
   `secret-rotation.md`: se um deploy de edge for disparado com o Actions ainda no valor
   antigo, o passo "Configurar secrets nas edges" sobrescreve a cópia 2 com o valor velho
   e desfaz a rotação.

3. **Edge env** — Dashboard → `tnnnlkbymytvtqngbbqh` → Edge Functions → Manage secrets →
   `CRON_SECRET` → novo valor. (Preferir o Dashboard ao CLI — ver nota de `argv` em
   `secret-rotation.md`.)

4. **Vault do banco** — via MCP `SUPABASE - ZAPP WEB V2 - MCP` (`db_query`):
   ```sql
   SELECT vault.update_secret(
     (SELECT id FROM vault.secrets WHERE name = 'gmail_cron_secret'),
     '<NOVO_VALOR>'
   );
   ```
   (Se o secret não existir — fresh db —, criar com
   `SELECT vault.create_secret('<NOVO_VALOR>', 'gmail_cron_secret');`.)

   ⚠️ **Janela de indisponibilidade:** nenhuma das pontas suporta dual-key. Entre os
   passos 3 e 4, o tick do pg_cron manda o valor antigo e o `gmail-cron-sync` responde
   401. Executar 3 → 4 sem pausa; impacto máximo é um ciclo de sync do Gmail atrasado
   ~5 min (o próximo tick recupera sozinho).

5. **Validar:**
   - Aguardar o próximo tick (≤5 min) e conferir os logs da edge `gmail-cron-sync`
     (Dashboard → Edge Functions → Logs): `200` = rotação ok; `401` persistente = alguma
     cópia divergiu (voltar aos passos 3–4 com o mesmo valor novo).
   - Conferência do lado do banco:
     ```sql
     SELECT status, start_time
     FROM cron.job_run_details
     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'gmail-incremental-sync')
     ORDER BY start_time DESC LIMIT 2;
     ```
     (`succeeded` aqui prova só que o `net.http_post` foi enviado — o 200/401 real está
     no log da edge, por isso os dois checks.)

6. **Registrar** data, operador e motivo (issue de segurança), sem incluir o valor.

## Rollback

Reaplicar os passos 2–4 com o valor anterior **apenas** se o novo valor foi perdido antes
de completar as três cópias. Se as três já receberam o valor novo e ainda há 401, o
problema não é a rotação — conferir se algum deploy de edge concorrente reescreveu a
cópia 2 (histórico do `deploy-functions.yml` na aba Actions).
