# HANDOFF — Migração ZAPP WEB V2 — fim da Sessão 4 (2026-08-27)

> Documento de continuidade para nova sessão de chat. Leia INTEIRO antes de agir.
> Regras do Joaquim valem sempre: diff mínimo, execução end-to-end via MCP, diagnóstico
> antes de patch, resultado primeiro, bloco "Próximos passos" com 3 itens ao fim de execução.

---

## 0. PRÓXIMA AÇÃO IMEDIATA (retomar exatamente aqui)

**Step 63-ENVIO, ~90% pronto.** O tradutor `supabase/functions/_shared/evolution-go-routes.ts`
está CRIADO (commitado neste mesmo commit e presente no workspace do container). Falta:

1. **Patch no `supabase/functions/_shared/evolution-api-proxy.ts`** (125 linhas, único ponto
   por onde TODAS as ~40 actions da function `evolution-api` passam). Editar via `node -e`
   no container (str_replace do sandbox NÃO alcança o container). Patch:
   - topo: `import { translateV2ToGo } from './evolution-go-routes.ts';`
   - dentro de `proxyToEvolution`, ANTES de montar `fullUrl`:
     ```ts
     const flavor = Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go';
     let apikey = evolutionApiKey;
     if (flavor !== 'v2') {
       const t = translateV2ToGo(path, method, body);
       if (t) {
         path = t.path; method = t.method; body = t.body; instanceInPath = undefined;
         if (t.auth === 'instance') apikey = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
         console.log(`[Evolution GO] traduzido -> ${method} ${path}`);
       }
     }
     ```
   - trocar `'apikey': evolutionApiKey` por `'apikey': apikey` no headers.
   - Obs: `path`/`method`/`body`/`instanceInPath` são params por assinatura — para reatribuir,
     renomear params para `pathIn/methodIn/bodyIn/instanceInPathIn` e criar `let path = pathIn`
     etc. no topo da função (diff mínimo).
2. **Deploy só da `evolution-api`** (única function que importa o proxy — verificado via grep):
   `export SUPABASE_ACCESS_TOKEN=$(cat /root/.secrets/zapp-v2-supabase-pat); cd /workspace/repos/zapp-web-v2 && npx supabase functions deploy evolution-api --project-ref tnnnlkbymytvtqngbbqh --use-api`
3. **Teste real de envio** via function. Número correto da instância: `551146375517`
   (teste anterior falhou por typo `5511463755170`, 0 extra no fim):
   ```sh
   curl -sS -X POST "https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-api" \
     -H "Authorization: Bearer <ANON_KEY, ver /root/.secrets/zapp-v2.env>" -H "Content-Type: application/json" \
     -d '{"action":"send-text","instanceName":"PRINCIPAL","number":"551146375517","text":"teste envio GO"}'
   ```
   Sucesso = `{message:success,data:{...}}` do GO + mensagem chega no WhatsApp.
4. **Commitar** `evolution-api-proxy.ts` patchado + `supabase/config.toml` (já reescrito no
   workspace: `project_id = \"tnnnlkbymytvtqngbbqh\"` + `verify_jwt = false` para
   evolution-webhook, whatsapp-webhook, gmail-webhook, elevenlabs-webhook, public-api,
   webhook-diagnostic). Ler conteúdo do container e commitar via `github_push_files` (text).
5. **Fetches diretos fora do proxy** em `evolution-api/index.ts` (actions `connect`, `status`,
   `disconnect` usam `fetch()` cru com paths v2 `/instance/connect/{i}`,
   `/instance/connectionState/{i}`, `/instance/logout/{i}` + apikey GLOBAL). NÃO passam
   pelo tradutor → status/connect/disconnect quebrados no GO (polling não atualiza
   `whatsapp_connections`). Fix curto: trocar os 3 fetches para chamar o proxy (que traduz),
   preservando os UPDATEs no banco que cada action faz com a resposta. Antes, conferir no
   Swagger o shape da resposta GO de `/instance/status` para mapear connected/disconnected.

---

## 1. Visão geral da migração

- **Origem:** Lovable Cloud, projeto Supabase `vpkmqeumtxhrwgawxdrl` (READ-ONLY, não tocar).
- **Destino:** Supabase Cloud `tnnnlkbymytvtqngbbqh` (us-west-2, PG 17.6) + VPS Hostinger.
- **VPS Hostinger:** `srv1481814.hstgr.cloud` / `187.77.151.129`, SSH key
  `/root/.ssh/hostinger_vps` (ou `~/.ssh/hostinger_vps` dentro do container claude-code).
- **Repo app:** `adm01-debug/zapp-web-v2`, branch de trabalho `feat/fresh-install-hostinger`.
- **Gates 0/1/2 APROVADOS. Fases 0–3 CONCLUÍDAS. Fase 5 (edge functions) ~95%.**
- Decisões D1–D9 em `docs/migration/DECISIONS.md`; plano em `docs/migration/PLANO.md`.

## 2. Credenciais (fonte da verdade = arquivos no container claude-code)

- **`/root/.secrets/zapp-v2.env`**: DB destino, service_role, anon key, EVOLUTION_API_URL/
  KEY/INSTANCE_NAME/INSTANCE_TOKEN, WEBHOOK_SECRET, WHATSAPP_VERIFY_TOKEN,
  MAPBOX_PUBLIC_TOKEN, RESEND_API_KEY, ELEVENLABS_API_KEY.
  Carregar: `set -a; . /root/.secrets/zapp-v2.env; set +a`
- **`/root/.secrets/zapp-v2-pat`**: PAT GitHub.
- **`/root/.secrets/zapp-v2-supabase-pat`**: PAT Supabase (Gate 57) — **VALIDADE 1 DIA,
  recebido 2026-08-27 ~13h. Se expirado, PEDIR NOVO ao Joaquim antes de qualquer
  `npx supabase` ou Management API.**
- **Evolution GO GLOBAL_API_KEY**: em `/root/.secrets/zapp-v2.env` (EVOLUTION_API_KEY);
  rotação prevista etapa 97.
- **Instância PRINCIPAL:** id `c66e1968-fe9e-4686-8c31-ed64bf0d5de6`, token em
  EVOLUTION_INSTANCE_TOKEN, número `551146375517`, conectada, perfil "Promo Brindes".
  Row em `whatsapp_connections` id `3b0f7f2e-887a-4c00-97de-012313649f9b`.
- **Fase 8 rotaciona TUDO** que passou pelo chat (service_role, sb_secret_, senha PG,
  MCP_TOKEN, GLOBAL_API_KEY, PATs, MAPBOX, RESEND, ELEVENLABS, tokens de instância).

## 3. Evolution GO (VPS Hostinger) — modelo mental

- Diretório: `/docker/evolution-go-rxj2/`. Licença ATIVA (saga concluída, watchdog removido).
- **Porta da API rotaciona** a cada restart: `docker port evolution-go-rxj2-api-1 4000`.
  URL pública estável: `https://evolution-go-rxj2.srv1481814.hstgr.cloud` (Traefik).
- DB: `docker exec evolution-go-rxj2-postgres-1 psql -U evolution -d evogo_users`.
- **Auth (CRÍTICO):** rotas admin (`/instance/create|all|info/:id|delete/:id|logs/:id`)
  → header `apikey: GLOBAL_API_KEY`. Rotas per-instance (`/send/*`, `/instance/status|qr|
  connect|disconnect|logout`, `/message/*`, `/chat/*`, `/user/*`) → `apikey: TOKEN_DA_INSTÂNCIA`.
- **Webhook:** coluna `instances.webhook` no DB (já aponta para
  `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook`, events
  `MESSAGE,CONNECTED,DISCONNECTED,QRCODE,MESSAGES_UPSERT`). Lido fresco a cada evento,
  sem restart. NÃO usar WEBHOOK_URL global (duplica entrega). Retry 5x/30s.
- Fonte clonada em `/tmp/evgo` (container). Swagger: `<url>/swagger/index.html`.
- Payloads outbound GO (confirmados no fonte, `pkg/sendMessage/service/send_service.go` e
  `pkg/message/service/message_service.go`):
  TextStruct `{number,text,id?,delay?,mentionedJid?,mentionAll?,quoted{messageId,participant}?}`;
  MediaStruct `{number,url,type,caption?,filename?,delay?,...}` (áudio = type:'audio');
  PollStruct `{number,question,maxAnswer,options}`; ReactStruct `{number,reaction,id,fromMe,participant?}`;
  MarkReadStruct `{id[],number}`; EditMessageStruct `{chat,message,messageId}`;
  delete MessageStruct `{chat,messageId}` (POST, não DELETE).

## 4. O que a Sessão 4 entregou

| Item | Estado | Ref |
|---|---|---|
| Deploy 62/62 edge functions no destino | OK, 0 falhas | script `/tmp/deploy-functions.sh`, log `/tmp/deploy-functions.log` |
| config.toml reescrito (project_id + verify_jwt=false p/ 6 fn) | OK no workspace, NÃO commitado | `supabase/config.toml` |
| Secrets próprios (9): EVOLUTION_*(4), WEBHOOK_SECRET, WHATSAPP_VERIFY_TOKEN, MAPBOX, RESEND, ELEVENLABS_API_KEY | OK setados | `npx supabase secrets set` |
| Adapter INGESTÃO GO→v2 | OK, commit `91cbbd97`, **VALIDADO EM PRODUÇÃO** (10+ messages, 7+ contacts reais: texto, imagem, áudio) | `_shared/evolution-go-adapter.ts` + 2 linhas em `evolution-webhook/index.ts` |
| Seed `whatsapp_connections` (obrigatório: getConnectionByInstance retorna early sem row) | OK | id `3b0f7f2e-...` |
| Tradutor ENVIO v2→GO | OK criado+commitado (este commit) | `_shared/evolution-go-routes.ts` (99 linhas, `translateV2ToGo`) |
| Patch no proxy + deploy + teste envio | PENDENTE | seção 0 |

- `SUPABASE_FUNCTIONS_URL` como secret foi REJEITADO (prefixo reservado) — function que
  depender disso precisa de fallback no código.
- Logs de function: MCP `Supabase:query_logs` NEGADO para esse projeto; usar Management API:
  ```sh
  curl -sS "https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/analytics/endpoints/logs.all" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" --get \
    --data-urlencode "sql=select timestamp, event_message from function_logs order by timestamp desc limit 25"
  ```

## 5. Secrets AINDA FALTANDO (pedir valores ao Joaquim quando chegar a hora)

ELEVENLABS_AGENT_ID, GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, BITRIX_WEBHOOK_URL,
SICOOB_GIFTS_URL/BRIDGE_SECRET, EXTERNAL_SUPABASE_URL/ANON_KEY,
PROMOGIFTS_SUPABASE_URL/ANON_KEY, SIP_PASSWORD, LOVABLE_API_KEY (Gate 60 = decisão de
arquitetura, precisa APROVADO explícito).

## 6. Armadilhas do ambiente (NÃO REDESCOBRIR DO ZERO)

1. `git push` de dentro do container está QUEBRADO → escrever no GitHub SEMPRE via
   `GITHUB - MCP - FOREVER` `github_push_files` (aceita `text` OU `content_base64` INLINE;
   NÃO aceita referência a arquivo).
2. **GitHub secret scanning BLOQUEIA push com secrets no conteúdo** (422 "Secret detected").
   Referenciar caminhos de `/root/.secrets/*` em docs, nunca valores.
3. MCP GitHub padrão dá 403 em write nos repos `adm01-debug`; usar o FOREVER.
4. `code_exec` >100s → erro 524 do gateway. Tarefa longa: `nohup ... &` + poll no log
   (padrão usado no deploy das functions).
5. Shell dos containers é `dash`: sem `[[ ]]`, arrays, `source` (usar `.`).
6. Sem `python3` no container claude-code → Node.js.
7. `str_replace`/`create_file` do sandbox NÃO alcançam o container → editar via `node -e`
   ou heredoc dentro de `code_exec`.
8. `supabase_apply_migration` (MCP self-hosted) bugado; para o DESTINO cloud usar
   `npx supabase` CLI (2.116.0 via npx) com o PAT.
9. SQL no destino: `set -a; . /root/.secrets/zapp-v2.env; set +a && node /workspace/tmp/pgcli/sql.js "SELECT ..."`.
10. Teste de envio anterior falhou por TYPO no número (`5511463755170`, 0 extra).
    Número correto: `551146375517`.
11. Portainer exec: IDs de container rotacionam → resolver fresco via `portainer_list_containers`.

## 7. Estado do destino `tnnnlkbymytvtqngbbqh`

258 migrations aplicadas (D9: zero divergências vs origem), 7 buckets storage,
cron `cleanup-link-preview-cache` (0 3 * * *), realtime em 11 tabelas, 62 functions
deployadas, 9 secrets próprios + automáticos, **JÁ RECEBE PRODUÇÃO** via webhook
(pipeline WhatsApp→GO→evolution-webhook→adapter→INSERT vivo desde 2026-08-27).
Tabela `messages`: id, contact_id, whatsapp_connection_id, sender, content, message_type,
media_url, is_read, agent_id, external_id, created_at, transcription, status.

## 8. Gates/tarefas pendentes (backlog ordenado)

- **Step 63-ENVIO** (seção 0 — AGORA)
- Step 61 — smoke das 62 functions; Step 39 — auth config destino (site_url, providers, redirects)
- Step 64 — trigger notify_sicoob_on_reply; Step 65 — validar cron 03:00 via `cron.job_run_details`
- Gate 51 — decidir migração de ~60 rows antigos da origem (3 auth users:
  ti@promobrindes.com.br email, ti02.promobrindes@gmail.com google, adm01@promobrindes.com.br google)
- Gate 60 — LOVABLE_API_KEY/provider próprio (mudança de arquitetura, exige APROVADO)
- Gate 16 — SSH hardening VPS; Gate 68 — remover clientesClient.ts; Gate 79 — budget GH Actions
- P23–P26, P28 (pré-checks formais), P29 (fp-dest), P30 (template Gate 3)
- Fase 6 — código app (steps 67–78); Fase 7 — deploy VPS (79–90); Fase 8 — cutover +
  ROTAÇÃO DE TODAS as credenciais expostas
- Endpoints v2 SEM equivalente GO (caem no passthrough → 404 amigável): `/webhook/set`,
  `/settings/*`, `/chat/findChats`, `/chat/findMessages`, restart-instance. Avaliar na Fase 6
  se o front usa e precisa de stub.

## 9. Docs no repo (branch feat/fresh-install-hostinger)

`docs/migration/`: HANDOFF.md (este), DECISIONS.md (D1–D9), PLANO.md (commit `8e65f8e9`),
secrets.md, source-ddl/ (10 sql + infra-deps.md), function-table-matrix.csv,
auth-storage-inventory.md, evolution-compat.md v2 (commit `b36a1a63` — Swagger real, auth
model, webhook, mapa v2×GO), scripts/apply-batch.js (`6661f790`). Adapter ingestão: `91cbbd97`.
