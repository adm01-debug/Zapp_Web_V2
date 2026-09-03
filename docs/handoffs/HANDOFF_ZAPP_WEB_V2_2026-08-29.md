# HANDOFF — ZAPP WEB V2 · sessão de 29/08/2026

> **Para:** nova sessão Claude executando via MCP.
> **De:** sessão que executou a Sessão 1 do plano de 50 etapas (simulação + execução das etapas 1–13, 32, 48, 49).
> **Data de geração:** 29/08/2026 · HEAD do repo: `14ce881573f4197280f1516ef90383a3ce2aea47`
> **Critério de verdade:** tudo neste documento foi verificado ao vivo nesta sessão via MCP. Onde não foi verificado, está explicitamente marcado.

---

## 1. ESTADO ATUAL — SNAPSHOT VERIFICADO AO VIVO

```
Repo:         adm01-debug/zapp-web-v2, branch main
HEAD:         14ce881  fix(ci): adiciona verificação de proacl NULL no step ACL do db-guard (C2)
Migrations:   285 arquivos no repo = 285 registros no banco
Hash:         449736fe82733c8377b66e5f83a0b9d1  (idêntico repo ↔ banco)
uniq_d:       0 (sem colisão de versão)
Guard:        exit 0 · novas: 0 · no baseline: 0
Cron avatars: active=true · schedule="0 * * * *"
fk_sem_indice: 0
mcp_exec_acl: {postgres=X/postgres,service_role=X/postgres} ✅
rls_sem_select: 0 ✅ (todas as tabelas com RLS têm ao menos uma SELECT policy)
tsx_empty:    0
tsx_corrupt:  0 (com --include='*.tsx')
```

### Tudo que a sessão paralela (27-28/08) já fez — NÃO refazer:

| Etapa do plano | O que foi feito | Como verificar |
|---|---|---|
| Etapa 4 | `clear_login_attempts` — guard com `auth.role()` + coalesce | `SELECT prosrc FROM pg_proc WHERE proname='clear_login_attempts'` → deve conter `auth.role()` |
| Etapas 5-8 | 5 funções SECURITY DEFINER: `cleanup_expired_challenges`, `cleanup_link_preview_cache`, `reassign_absent_agents`, `reassign_overloaded_agents`, `skill_based_assign` — guards adicionados via migration `20260828000000_guard_secdef_batch` | Ler `supabase/migrations/20260828000000_guard_secdef_batch.sql` |
| Etapa 9 | RLS sem SELECT policy: 0 tabelas problemáticas | `SELECT count(*) FROM pg_class c ... WHERE c.relrowsecurity=true AND NOT EXISTS (SELECT policy...)` → 0 |
| Etapa 11 | REPLICA IDENTITY FULL para todas as tabelas do Realtime | Migration `20260828230000_realtime_replica_identity_full` |
| Etapa 12 | 6 arquivos corrompidos restaurados (command.tsx 135l, command-palette.tsx 209l, GlobalSearch.tsx 243l, CallDialog.tsx 274l, MFASettings.tsx 191l, StoryViewer.tsx 196l) | `for f in ...; do wc -l $f; done` |
| Etapa 13 | DialogTitle sr-only nos 6 componentes | Scanner de bloco → `sem DialogTitle: 0` |
| Etapa 10 | Step ACL mcp_exec no CI (`db-guard.yml`) | Já existia; nesta sessão adicionamos verificação de `proacl IS NULL` (commit `14ce881`) |

### Bug documentado mas não resolvido (pré-existente):

`reassign_absent_agents` referencia `p.last_seen_at` que NÃO existe na tabela `profiles`. A função compila (PG valida loops em runtime), mas falha ao ser invocada por admin/supervisor. O guard da migration `20260828000000` bloqueia não-admins antes de chegar no erro. Fix do schema de presença é rastreado separadamente — **não tocar sem entender o impact em todo o sistema de presença**.

---

## 2. COORDENADAS DO AMBIENTE

| O que | Valor |
|---|---|
| Repo | `adm01-debug/zapp-web-v2`, branch `main`, público |
| **Escrita no GitHub** | **SOMENTE** `GITHUB - MCP - FOREVER:github_push_files` com `text=` e `delete=[]`. O MCP padrão do GitHub retorna 403 em write. Um arquivo por vez ou lote via `files=[...]` — **NUNCA** `content_base64` fabricado à mão (armadilha A1). |
| Clone de trabalho | `/workspace/repos/zapp-web-v2` no container `claude-code`. Sempre: `git fetch -q origin main && git reset -q --hard origin/main` antes de ler qualquer arquivo. Clone temporário em `/tmp/zzv` para leitura rápida. |
| Container de trabalho | `claude-code` — **ID rotaciona a cada restart**. Sempre resolver fresco com `PORTAINER - MCP:portainer_list_containers`. Shell é `dash` (sem `[[ ]]`, arrays, `source`). **Sem python3** — usar Node. |
| Banco do projeto | `tnnnlkbymytvtqngbbqh.supabase.co` (PostgreSQL 17.6). MCP: `SUPABASE - ZAPP WEB V2 - MCP`. DDL via `db_batch_query` com array JSON. `db_query` multi-statement retorna só efeito do último — verificar em chamada SELECT separada. |
| CRM externo (segundo banco!) | `pgxfvjmuubtbowutlide.supabase.co` — Supabase Cloud, projeto "GESTÃO DE CLIENTES". MCP: `SUPABASE - GESTÃO DE CLIENTES:execute_sql` |
| Evolution API | Evolution GO, Hostinger (`evolution-go-rxj2.srv1481814.hstgr.cloud`). Instância: `PRINCIPAL`. |
| Deploy de edge functions | Workflow manual `deploy-functions.yml` via `GITHUB - MCP - FOREVER:github_dispatch_workflow`. Input `function_name` vazio = todas. **Não deploya no push.** |
| Supabase Management API | `https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/...` — para secrets de edge functions (diferente de GitHub secrets!) |

---

## 3. ARMADILHAS OBRIGATÓRIAS — leia antes de qualquer execução

### Herdadas (validadas em sessões anteriores)

| # | Armadilha | Contorno |
|---|---|---|
| A1 | `content_base64` fabricado à mão → lixo binário com tokens inválidos (`~>`, `HTMLStpelement`) | Sempre derivar de arquivo real: `base64 -w0 arquivo` no container, depois copiar do output |
| A2 | `text: ""` no `github_push_files` zera o arquivo silenciosamente, sem erro | Validar `[ -s "$f" ]` antes de todo push |
| A3 | `includes('DialogTitle')` dá falso positivo em arquivos com `AlertDialogTitle` | Usar scanner com escopo de bloco (seção 6.3) |
| A4 | `db_query` multi-statement retorna só o efeito do último statement | Verificação sempre em SELECT separado |
| A5 | `RAISE NOTICE` não devolve notices no gateway | Formular teste como `SELECT CASE WHEN ... THEN 'PASS' ELSE 'FAIL' END` |
| A6 | `CREATE INDEX CONCURRENTLY` falha (25001) no gateway | Usar `CREATE INDEX` simples |
| A7 | `supabase_apply_migration` bugado (coluna `executed_at` inexistente) | DDL via `db_batch_query` + INSERT manual em `supabase_migrations.schema_migrations` |
| A8 | `ON CONFLICT DO NOTHING` mascara colisão de migration | Sempre verificar com `RETURNING` ou SELECT do `name` |
| A9 | `functions_list` do MCP worker retorna falso negativo | Verificar via Management API diretamente |
| A10 | `github_push_files` retorna 403 no MCP padrão | Usar `GITHUB - MCP - FOREVER:github_push_files` |
| A11 | `VPS_createNewProjectV1` é replace total de envs | Fornecer todos os pares `environment` na chamada |
| A13 | `int[] @> smallint[]` não existe em pg_catalog | Castear `conkey`/`indkey` explicitamente |

### Novas desta sessão (29/08)

| # | Armadilha | Contorno |
|---|---|---|
| A14 | `grep -rlE '~>\|HTMLStpelement' src` sem `--include='*.tsx'` retorna 14 falsos positivos — são PNGs binários em `src/assets/emojis/` | Sempre adicionar `--include='*.tsx'` ao grep de integridade |
| A15 | Sessão paralela pode avançar HEAD durante o trabalho desta sessão | `git fetch + reset --hard` antes de cada edição. Verificar HEAD antes de editar e após push. |
| A16 | Secrets de edge functions ≠ GitHub Actions secrets — são APIs diferentes | Secrets de edge: `POST https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/secrets` com Supabase Management Token. GitHub secrets: `GITHUB - MCP - FOREVER:github_set_actions_secret`. |

---

## 4. PROTOCOLO DE EXECUÇÃO OBRIGATÓRIO

Antes de QUALQUER escrita, em toda sessão:

```sh
# 1. Re-sync
cd /workspace/repos/zapp-web-v2
git fetch -q origin main && git reset -q --hard origin/main
echo "HEAD=$(git rev-parse --short HEAD)"

# 2. max_version antes de qualquer INSERT de migration
# (via SUPABASE - ZAPP WEB V2 - MCP:db_batch_query)
# SELECT max(version) AS max_version FROM supabase_migrations.schema_migrations;

# 3. Guard
node scripts/db-audit/supabase-usage-guard.mjs 2>&1 | tail -3
# EXIT=0 obrigatório

# 4. Paridade repo=banco (contar arquivos)
ls supabase/migrations/*.sql | wc -l

# 5. Uniq-d (deve estar vazio)
ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d
```

### Fechamento triplo (toda mudança dispara os 3):

| Mudou | Obrigatório |
|---|---|
| DDL no banco | Arquivo em `supabase/migrations/YYYYMMDDHHMMSS_nome.sql` **+** `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(...) RETURNING *` |
| Função/tabela/view criada ou dropada | Atualizar `supabase/schema-catalog.json` via Node no container, preservando `how_to_regenerate` |
| Violação do guard resolvida ou criada | Atualizar `scripts/db-audit/known-violations.json` usando as chaves exatas que o próprio guard imprime |

---

## 5. TAREFAS PENDENTES — PRIORITIZADAS

### 5.1 🔒 GATES (aguardam decisão explícita do Joaquim)

#### GATE A — Gmail 3c: `app.encryption_key` — GUC vs Vault

**Estado verificado:** `app.encryption_key` não existe (0 em `pg_db_role_setting`). `gmail_accounts` tem **0 linhas** — zero ciphertext legado. Qualquer chave nova serve.

**Opção A — GUC (simples, risco de restore):**
```sql
ALTER DATABASE postgres SET app.encryption_key = '<32+ bytes aleatórios — NUNCA logar>';
```
Risco: o GUC vive fora do backup lógico. Um `pg_restore` sem `pg_dumpall -g` deixa o ciphertext ilegível.

**Opção B — Vault (padrão do projeto, recomendado):**
```sql
SELECT vault.create_secret('<32+ bytes>', 'gmail_encryption_key', 'Chave AES-256 para tokens Gmail');
```
Requer reescrita de `encrypt_gmail_token` e `decrypt_gmail_token` para ler do vault. Mesmo padrão de `notify_sicoob_on_reply`. Fechamento triplo.

**Para gerar a chave (no container, nunca no chat):**
```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### GATE B — Edges órfãs: `analyze-external-db` e `evolution-health`

5 das 14 chaves do baseline são delas. Zero invocações no front. Chamam RPCs/tabelas inexistentes.

**Verificação antes de agir:**
```sh
grep -rn "invoke('analyze-external-db'\|invoke('evolution-health'" src --include='*.ts' --include='*.tsx'
# deve retornar 0 hits
```

**Opção A — Remover (recomendado):**
```sh
rm -rf supabase/functions/analyze-external-db supabase/functions/evolution-health
# verificar config.toml, rodar guard → 5 chaves obsoletas → remover do known-violations.json
```
Baseline: 14 → 9 chaves. Catálogo não muda. Sem DDL.

**Opção B — Manter cercadas:** adicionar `return new Response('deprecated', { status: 410 })` como primeiro statement.

#### GATE C — Auditoria guards internos das 5 RPCs do CRM

5 RPCs do CRM `pgxfvjmuubtbowutlide` grantadas a `anon`. Expõem 57k empresas e 48k clientes pela anon key pública.

**Verificar (via `SUPABASE - GESTÃO DE CLIENTES:execute_sql`):**
```sql
SELECT proname, left(prosrc, 500) AS corpo
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND proname IN (
    'get_contact_360_by_phone', 'get_contact_intelligence_by_phone',
    'get_companies_by_phones_batch', 'sync_interaction_from_zapp',
    'search_contacts_advanced'
  );
```
Verificar se cada função tem filtro por `auth.uid()` ou `auth.role()` interno.

#### GATE D — Cutover formal wpp2 → Evolution GO

`wpp2` (Evolution v2) em estado `close` há vários dias. Sistema já usa GO (`PRINCIPAL`).

**Investigar antes de decidir:**
```
n8n_search_workflows com query "wpp2" (via N8N - MCP - V.JUCA)
```
Identificar workflows que referenciam `wpp2` e o impacto do cutover.

---

### 5.2 🟠 ALTO — Executar sem gate

#### TAREFA 1 — Gmail 3a: drift `profile_id → user_id` no gmail-oauth

**PRIMEIRO:** ler commit `55639dc` (sessão paralela, "fix(email-chat): destravar conexao Gmail Fase 1"):
```sh
git show 55639dc --stat | head -30
git show 55639dc -- supabase/functions/gmail-oauth/index.ts | head -80
```

**Estado esperado do schema:** `gmail_accounts` usa `user_id` (UUID), sem `profile_id`, sem coluna `scopes`. UNIQUE key: `gmail_accounts_email_address_key`.

**Verificar estado atual:**
```sh
grep -n "profile_id\|user_id\|scopes\|onConflict\|profile\.id" \
  supabase/functions/gmail-oauth/index.ts | head -30
```

**Se não corrigido (ainda referencia `profile_id`):**
- Upsert: `profile_id: profile.id` → `user_id: user.id`
- Remover `scopes: tokens.scope.split(" ")`
- `onConflict: "profile_id,email_address"` → `onConflict: "email_address"`
- Todos os `.eq("profile_id", profile.id)` → `.eq("user_id", user.id)`
- Se lookup de `profiles` ficar sem uso, remover a query morta

**Verificar também:**
```sh
grep -n "profile_id" \
  supabase/functions/gmail-send/index.ts \
  supabase/functions/gmail-webhook/index.ts \
  supabase/functions/gmail-sync/index.ts \
  supabase/functions/_shared/gmail-helpers.ts 2>/dev/null
```

**Verificar coluna watch (pode silenciar bug após 7 dias):**
```sh
grep -n "watch_expir" supabase/functions/gmail-sync/index.ts | head -5
```
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='gmail_accounts' AND column_name LIKE 'watch%';
```
Se nome no código ≠ nome na tabela → watch renewal falha silenciosamente. Corrigir.

**Fechamento:** sem DDL. Deploy de todas as edges gmail via `deploy-functions.yml`.

#### TAREFA 2 — Gmail 3b: criar `get_gmail_tokens` / `store_gmail_tokens`

**Pré-requisito:** GATE A aprovado e `app.encryption_key` existindo.

**Pré-verificação (pode já existir):**
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN ('get_gmail_tokens','store_gmail_tokens');
-- 2 linhas → já existe, pular
```

**DDL exato (dos call sites em `_shared/gmail-helpers.ts:85-97`):**
```sql
CREATE FUNCTION public.get_gmail_tokens(p_account_id uuid)
RETURNS TABLE(access_token text, refresh_token text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT public.decrypt_gmail_token(access_token_encrypted),
         public.decrypt_gmail_token(refresh_token_encrypted)
  FROM public.gmail_accounts WHERE id = p_account_id;
$$;

CREATE FUNCTION public.store_gmail_tokens(
  p_account_id uuid, p_access_token text, p_refresh_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions' AS $$
BEGIN
  UPDATE public.gmail_accounts SET
    access_token_encrypted  = public.encrypt_gmail_token(p_access_token),
    refresh_token_encrypted = CASE WHEN p_refresh_token IS NULL OR p_refresh_token = ''
                                   THEN refresh_token_encrypted
                                   ELSE public.encrypt_gmail_token(p_refresh_token) END,
    updated_at = now()
  WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_gmail_tokens: account % nao existe', p_account_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_gmail_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_gmail_tokens(uuid,text,text) FROM PUBLIC, anon, authenticated;
```

**Nota crítica:** o oauth chama `storeTokens(..., tokens.refresh_token || "")`. O `CASE WHEN p_refresh_token = ''` preserva o refresh anterior quando o Google não retorna um novo — comportamento correto do OAuth 2.0.

**Fechamento obrigatório:**
1. Migration + registro
2. Catálogo: +2 funções
3. Baseline: remover as 8 chaves `rpc:get_gmail_tokens:*` e `rpc:store_gmail_tokens:*` usando as chaves **exatas que o guard imprime** — nunca de memória
4. Guard ANTES de commitar baseline

#### TAREFA 3 — Secrets críticos ausentes + revogar token exposto

**Sequência obrigatória (não inverter):**
1. Gerar novo Supabase Management token
2. Adicionar secrets via Management API (não GitHub secrets)
3. Revogar `sbp_0406...` (exposto em chat anterior)

**Endpoint correto para secrets de edge:**
```sh
curl -X POST "https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/secrets" \
  -H "Authorization: Bearer $SBP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name":"OPENAI_API_KEY","value":"..."},{"name":"ANTHROPIC_API_KEY","value":"..."},{"name":"BITRIX_WEBHOOK_URL","value":"..."}]'
```

**Identificar edges afetadas:**
```sh
grep -rln "OPENAI_API_KEY\|openai" supabase/functions --include='*.ts' | grep -v '_shared'
grep -rln "ANTHROPIC\|anthropic\|claude" supabase/functions --include='*.ts' | grep -v '_shared'
grep -rln "BITRIX\|bitrix" supabase/functions --include='*.ts' | grep -v '_shared'
```

**Anthropic ≠ OpenAI — requer tratamento diferente:**
- Header: `x-api-key: <ANTHROPIC_API_KEY>` (não `Authorization: Bearer`)
- Endpoint: `https://api.anthropic.com/v1/messages`
- Body: `max_tokens` é campo obrigatório
- Verificar: `SELECT id, name, base_url, config FROM public.ai_providers WHERE name ILIKE '%anthropic%';`

#### TAREFA 4 — Documentar GRANTs do CRM em arquivo permanente

Criar `docs/crm-external-grants.md` com o SQL abaixo (aplicado diretamente em `pgxfvjmuubtbowutlide` em 27/08/2026):
```sql
-- Aplicado diretamente em pgxfvjmuubtbowutlide em 27/08/2026
-- Replicar se o projeto for restaurado:
GRANT EXECUTE ON FUNCTION public.get_contact_360_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_companies_by_phones_batch(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_interaction_from_zapp(uuid, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.search_contacts_advanced(text, text, text, integer, integer) TO anon;
```

---

### 5.3 🟡 MÉDIO — Sessões seguintes

#### TAREFA 5 — `DialogDescription` / `aria-describedby` (Etapa 14)
`DialogTitle` já feito (scanner = 0). Warning restante: `"Missing Description or aria-describedby={undefined}"`.
Fix: adicionar `<DialogDescription className="sr-only">...</DialogDescription>` após o `<DialogTitle>`, ou `aria-describedby={undefined}` no `<DialogContent>`. Importar `DialogDescription` de `@/components/ui/dialog`.

#### TAREFA 6 — Scroll do virtualizador de chat (Etapa 15)
`"Failed to scroll to index N after 10 attempts"` (índices 9, 23, 73). Investigar lib:
```sh
grep -rn "scrollToIndex\|scroll.*index\|after.*attempt" src --include='*.ts' --include='*.tsx' | head -20
grep -rn "virtualiz\|useVirtual\|@tanstack/react-virtual" src --include='*.ts' --include='*.tsx' | head -10
```

#### TAREFA 7 — `voice-copilot-action`: escopar SERVICE_ROLE (Etapa 24)
Edge usa SERVICE_ROLE para query de contatos → bypassa RLS. Verificar:
```sh
grep -n "service_role\|SERVICE_ROLE\|createClient\|user_id\|agent_id" \
  supabase/functions/voice-copilot-action/index.ts | head -15
```
Fix: substituir por anon + JWT do usuário, ou adicionar filtro `WHERE user_id = (jwt->>'sub')::uuid`.

#### TAREFA 8 — Remover filtro morto `@lid` em batch-fetch-avatars (Etapa 25)
`phone_com_lid_literal = 0` na base. **ANTES de remover, testar GO:**
```sh
curl -s -X GET "https://evolution-go-rxj2.srv1481814.hstgr.cloud/chat/whatsappProfilePicture/PRINCIPAL" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"16927221121029"}' | jq '.profilePictureUrl // "FALHOU"'
# Se FALHOU → não remover. Se URL → remover o filtro.
```

#### TAREFA 9 — Provider Anthropic: headers corretos (Etapa 42)
```sql
SELECT id, name, base_url, config FROM public.ai_providers
WHERE name ILIKE '%anthropic%' OR base_url ILIKE '%anthropic%';
```
Se `base_url` for `/v1/chat/completions` ou header for `Bearer` → corrigir para `/v1/messages` e `x-api-key`.

#### TAREFA 10 — FKs sem índice: re-verificar após novas migrations
`fk_sem_indice = 0` verificado em 29/08. Re-rodar após qualquer nova migration da sessão paralela:
```sql
SELECT c.relname, a.attname,
       format('CREATE INDEX idx_%s_%s ON public.%I (%I);', c.relname, a.attname, c.relname, a.attname) AS fix
FROM pg_constraint co
JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN unnest(co.conkey::int[]) k(att) ON true
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att
WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)
ORDER BY c.relname;
-- Alvo: 0 linhas
```

---

### 5.4 🟢 BAIXO

- Spot-check `_foreign/` (7 arquivos) e `_superseded/` (4 arquivos)
- Regenerar `schema-catalog.json` (guard mostra "gerado em 2026-08-27" — pode estar velho com 46 funções catalogadas vs mais no banco)
- `types.ts`: declaração fantasma de `validate_reset_token` — remover em janela sem sessão paralela
- `LOVABLE_API_KEY`: Gate 60 pendente
- Monitoring de falhas do cron `avatars-refresh` via `net._http_response`
- Verificar sidecar `pg-backup` (dumps diários)
- Queries lentas, seq_scan, autovacuum (Etapas 44-46)

---

## 6. SCRIPTS DE VERIFICAÇÃO REUTILIZÁVEIS

### 6.1 Snapshot completo (início de sessão)

```sql
-- Via SUPABASE - ZAPP WEB V2 - MCP:db_batch_query com queries=[...]
[
  "SELECT jsonb_build_object('migr_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),'migr_max',(SELECT max(version) FROM supabase_migrations.schema_migrations),'migr_hash',(SELECT md5(string_agg(version,'' ORDER BY version)) FROM supabase_migrations.schema_migrations),'mcp_exec_acl',(SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='mcp_exec'),'fk_sem_indice',(SELECT count(*) FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN unnest(co.conkey::int[]) k(att) ON true JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1 AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)),'rls_sem_select',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND (p.polcmd='r' OR p.polcmd='*')))) AS x",
  "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20260828000000' ORDER BY version"
]
```

**Valores baseline (29/08/2026):**
```
migr_count: 285
migr_max: 20260828230000
migr_hash: 449736fe82733c8377b66e5f83a0b9d1
mcp_exec_acl: {postgres=X/postgres,service_role=X/postgres}
fk_sem_indice: 0
rls_sem_select: 0
```

### 6.2 Checklist de encerramento

```sh
cd /workspace/repos/zapp-web-v2 && git fetch -q origin main && git reset -q --hard origin/main
echo '=== GUARD ===' && node scripts/db-audit/supabase-usage-guard.mjs 2>&1 | tail -3
echo '=== REPO ===' && ls supabase/migrations/*.sql | wc -l
echo '=== UNIQ_D ===' && ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d | wc -l
echo '=== HASH ===' && ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | tr -d '\n' | md5sum
echo '=== TSX_EMPTY ===' && find src -name '*.tsx' -empty | wc -l
echo '=== TSX_CORRUPT ===' && grep -rlE '~>|HTMLStpelement' src --include='*.tsx' 2>/dev/null | wc -l
```
```sql
["SELECT count(*) AS n, md5(string_agg(version,'' ORDER BY version)) AS hash FROM supabase_migrations.schema_migrations","SELECT active, schedule FROM cron.job WHERE jobname='avatars-refresh'"]
```
**Alvos:** guard exit 0 · novas:0 · repo_n=banco_n · hashes iguais · uniq_d:0 · tsx_empty:0 · tsx_corrupt:0 · cron active · schedule:"0 * * * *"

### 6.3 Scanner DialogTitle (escopo de bloco)

```sh
node -e "
const fs=require('fs'),{execSync}=require('child_process');
const files=execSync('find src -name \"*.tsx\"').toString().trim().split('\n');
let hits=[];
for(const f of files){
  const t=fs.readFileSync(f,'utf8');
  if(!t.includes('DialogContent'))continue;
  let i=0;
  while(true){
    const s=t.indexOf('<DialogContent',i);if(s===-1)break;
    const e=t.indexOf('</DialogContent>',s);if(e===-1){i=s+1;continue;}
    const b=t.slice(s,e+16);
    if(!b.includes('DialogTitle')&&!b.includes('VisuallyHidden')&&!b.includes('aria-labelledby'))
      hits.push(f+':'+t.slice(0,s).split('\n').length);
    i=e+1;
  }
}
console.log('sem DialogTitle:',hits.length);hits.forEach(h=>console.log(' ',h));
"
# Alvo: sem DialogTitle: 0
```

### 6.4 Integridade dos 6 arquivos restaurados

```sh
for f in \
  src/components/ui/command.tsx \
  src/components/ui/command-palette.tsx \
  src/components/inbox/GlobalSearch.tsx \
  src/components/calls/CallDialog.tsx \
  src/components/mfa/MFASettings.tsx \
  src/components/inbox/contact-details/StoryViewer.tsx; do
  lines=$(wc -l < "$f" 2>/dev/null || echo 0)
  corrupt=$(grep -cE '~>|HTMLStpelement' "$f" 2>/dev/null || echo 0)
  echo "$lines linhas | corrupt=$corrupt | $f"
done
# Alvos: >=130|>=208|>=240|>=270|>=188|>=194 linhas. Corrupt=0 em todos.
```

---

## 7. TABELA-RESUMO DE PENDÊNCIAS

| # | Tarefa | Prio | Gate | Depende de |
|---|---|---|---|---|
| A | Gmail 3c: GUC vs Vault para encryption_key | 🔒 | Joaquim | — |
| B | Edges órfãs: remover vs manter | 🔒 | Joaquim | — |
| C | Auditoria guards RPCs CRM | 🔒 | Joaquim | T4 |
| D | Cutover wpp2 → GO | 🔒 | Joaquim | — |
| 1 | Gmail 3a: profile_id → user_id (ler 55639dc antes) | 🟠 | — | — |
| 2 | Gmail 3b: get/store_gmail_tokens | 🟠 | — | Gate A |
| 3 | Secrets OPENAI/ANTHROPIC/BITRIX + revogar sbp_0406 | 🟠 | — | Novo token primeiro |
| 4 | Documentar GRANTs CRM em docs/ | 🟠 | — | — |
| 5 | DialogDescription / aria-describedby | 🟡 | — | — |
| 6 | Scroll virtualizer: "Failed after 10 attempts" | 🟡 | — | — |
| 7 | voice-copilot-action: escopar RLS | 🟡 | — | — |
| 8 | Remover filtro morto @lid (testar GO antes) | 🟡 | — | — |
| 9 | Provider Anthropic: corrigir headers no ai_providers | 🟡 | — | T3 |
| 10 | FKs sem índice: re-verificar pós-novas-migrations | 🟡 | — | — |
| 11 | watch_expiry vs watch_expiration em gmail-sync | 🟡 | — | — |
| 12 | Catálogo: regenerar (gerado 27/08, pode estar velho) | 🟡 | — | Janela sem sessão paralela |
| 13 | types.ts: remover declaração fantasma validate_reset_token | 🟢 | Joaquim | — |
| 14 | Spot-check _foreign/ e _superseded/ | 🟢 | — | — |
| 15 | Queries lentas, seq_scan, autovacuum | 🟢 | — | — |
| 16 | pg-backup sidecar: verificar integridade | 🟢 | — | — |
| 17 | Monitoring cron avatars-refresh | 🟢 | — | — |
| 18 | LOVABLE_API_KEY: Gate 60 | 🔒 | Joaquim | — |

---

## 8. ORDEM DE EXECUÇÃO RECOMENDADA

**Chat A (sem gate):** T1 (Gmail 3a, ler 55639dc antes) + T4 (docs CRM) + T11 (watch column) + checklist

**Chat B (Gates):** Apresentar Gates A, B, C, D em bloco único para decisão do Joaquim

**Chat C (pós-gate A):** T2 (Gmail 3b) + T9 (Anthropic headers)

**Chat D (pós-gate B):** Se aprovado remover: `rm -rf` + baseline 14→9

**Chat E (secrets):** T3 (OPENAI/ANTHROPIC/BITRIX via Management API) + revogar sbp_0406

**Chat F (acessibilidade + performance):** T5, T6, T7, T8 + re-verificar FK índices

---

## 9. BUG `reassign_absent_agents` — NÃO TOCAR SEM INVESTIGAR

A migration `20260828000000_guard_secdef_batch` documentou:

> **BUG PRÉ-EXISTENTE:** `reassign_absent_agents` referencia `p.last_seen_at` que NÃO existe em `profiles`. A função compila mas falha ao ser invocada por admin/supervisor. O guard bloqueia não-admins antes do erro. Fix do schema de presença é rastreado separadamente.

Antes de corrigir: investigar se existe coluna de presença em alguma tabela (`last_active_at`, `online_at`, etc.) e qual é o modelo correto.

---

*Gerado em 29/08/2026 · HEAD `14ce881` · guard exit 0 · novas: 0 · 285 migrations*
