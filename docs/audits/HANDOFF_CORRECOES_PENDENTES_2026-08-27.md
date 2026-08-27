# HANDOFF — ZAPP WEB V2: correcoes pendentes pos-auditoria (27/08/2026)

> **Para:** nova sessao Claude executando via MCP.
> **De:** sessao que executou o plano da auditoria (`AUDITORIA_MIGRACAO_DB_2026-08-27.md`), rodou 3 rodadas de simulacao e 28 testes de validacao em 5 agentes.
> **Missao:** executar as tarefas 1–6 abaixo, na ordem, respeitando os protocolos das secoes 0–5. Cada tarefa traz evidencia, passos exatos e verificacao. Nada aqui e especulacao — tudo foi verificado no banco e no codigo em 27/08/2026.

---

## 0. Regras de trabalho (do Joaquim — nao negociaveis)

1. **Execucao end-to-end via MCP.** Nunca propor passo manual. Nunca "copie e cole".
2. **Diff minimo, causa raiz.** Nao refatorar, nao renomear, nao reescrever arquivo para mudar 3 linhas alem do que a ferramenta exigir (o `github_push_files` sobrescreve o arquivo — mande o conteudo integral com apenas a mudanca semantica).
3. **Verdade acima de validacao.** Nunca afirmar que testou o que nao rodou. Se falhou, dizer que falhou.
4. **Decisao de senior**, exceto: custo, mudanca de arquitetura, dado destrutivo em producao, trade-off real — nesses casos, apresentar e esperar.
5. **Resposta: resultado primeiro.** Fechar toda tarefa de execucao com bloco `Proximos passos` (exatamente 3, derivados do que viu, executaveis via MCP, menu — nao pergunta).
6. `APROVADO` do Joaquim = executar exatamente como descrito, sem reconfirmar.

## 1. Coordenadas

| O que | Valor |
|---|---|
| Banco DESTINO (o unico que importa) | `tnnnlkbymytvtqngbbqh.supabase.co`, PostgreSQL 17.6 |
| SQL no destino | MCP **`SUPABASE - ZAPP WEB V2 - MCP:db_query`** (service_role via `mcp_exec`; multi-statement = 1 transacao; timeout 120s) |
| Repo | `adm01-debug/zapp-web-v2`, branch `main`, PUBLICO (clona sem credencial) |
| Escrita no GitHub | **SOMENTE** MCP **`GITHUB - MCP - FOREVER`** (`github_push_files` com `text=`, `delete=[]`). O MCP padrao do GitHub retorna 403 em write. |
| Container de trabalho | `claude-code` via **`PORTAINER - MCP:portainer_exec_container`**. **O ID ROTACIONA a cada restart** — resolver fresco com `portainer_list_containers` antes do primeiro exec. Shell e `dash` (sem `[[ ]]`, sem arrays, sem `source`). **Sem python3** — usar Node. |
| Clone de leitura | `/tmp/zzv`. Se nao existir: `git clone --depth 50 https://github.com/adm01-debug/zapp-web-v2 /tmp/zzv`. Sempre `git fetch -q origin main && git reset -q --hard origin/main` antes de ler qualquer arquivo. |

## 2. Armadilhas do ambiente (todas confirmadas em 27/08)

1. **`db_query` multi-statement retorna so o efeito do ULTIMO statement** (`rows_affected`). Verificacao SEMPRE em chamada separada com SELECT unico.
2. **`DO $$ ... RAISE NOTICE` nao devolve os notices.** Teste comportamental deve ser formulado como SELECT que retorna PASS/FAIL (ex.: cripto testada com `set_config(..., true)` transaction-local + LATERAL).
3. **Queries com subqueries pesadas misturadas (scan de `pg_get_functiondef` em todas as funcs + `cron.job` no mesmo jsonb) estouram `42809 array_agg is an aggregate function`** no wrap do `mcp_exec`. Quebrar em chamadas menores; formato que sempre funciona: `SELECT jsonb_build_object(...) AS x` com subqueries escalares simples.
4. **`CREATE INDEX CONCURRENTLY` falha (25001)** — o gateway envolve tudo em transacao. Tabelas daqui sao minusculas (maior: 584 kB); `CREATE INDEX` simples resolve.
5. **`supabase_apply_migration` esta bugado** (referencia coluna `executed_at` inexistente). Procedimento manual obrigatorio na secao 5.
6. **Falso positivo de grep/ILIKE em comentarios**: nesta sessao, `ILIKE '%extensions.http_post%'` acusou FAIL numa funcao cujo COMENTARIO citava a string, e `grep store_reset_token` acusou o comentario do edge. Testes textuais devem mirar a construcao real (`PERFORM net.http_post`, `rpc("store_reset_token"`) ou excluir linhas de comentario.
7. **Bug de medicao de exit code**: `cmd; echo "exit=$?"` depois de um `cp` de restauracao mede o `cp`. Capturar imediatamente: `cmd; code=$?; ...; echo $code`.
8. **Erros 42809/42883 em queries de pg_catalog**: `int[] @> smallint[]` nao existe — castear `conkey`/`indkey` explicitamente.

## 3. Estado esperado ao iniciar (VERIFICAR antes de qualquer escrita)

Rodar e conferir; se divergir, investigar antes de prosseguir (a sessao paralela pode ter mexido — secao 4):

```sql
SELECT jsonb_build_object(
 'migrations', (SELECT count(*) FROM supabase_migrations.schema_migrations),                -- >= 272
 'hash', (SELECT md5(string_agg(version,'' ORDER BY version)) FROM supabase_migrations.schema_migrations),
 'validate_reset_token', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='validate_reset_token'),  -- 0
 'funcs', (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND pg_get_function_result(p.oid)<>'trigger'),  -- 44 (ou mais, se sessao paralela criou)
 'fk_sem_indice', (SELECT count(*) FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN unnest(co.conkey) k(att) ON true JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1 AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)),  -- 0
 'mcp_exec_acl', (SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='mcp_exec')  -- {postgres=X/postgres,service_role=X/postgres}
) AS x;
```

No container: `node scripts/db-audit/supabase-usage-guard.mjs` deve sair 0 com `14 | no baseline: 14 | novas: 0` (numeros podem ter mudado se tarefas ja avancaram — o invariante e `novas: 0` e exit 0). Em 27/08 19:40 o HEAD era `6effc7b`, paridade 272=272 hash `fe9dcd8b8d7487b7bf1a7fb7dddeda71`.

## 4. Sessao paralela — protocolo

Existe (ou existiu) OUTRA sessao Claude commitando no MESMO branch e banco. Nesta sessao ela causou: colisao de arquivo de migration (dois arquivos `20260827130500_*`), colisao de versao no registro (ela tomou `20260827140000` entre meu DROP e meu INSERT), e HEAD avancando durante o trabalho.

**Protocolo obrigatorio:**
1. Re-sync (`fetch+reset`) imediatamente antes de LER arquivo que vai editar; conferir `git log -1 -- <arquivo>` para saber se mudou.
2. Antes de registrar migration: `SELECT max(version) FROM supabase_migrations.schema_migrations;` e usar versao ESTRITAMENTE maior (proxima hora cheia). INSERT com `ON CONFLICT (version) DO NOTHING` e **conferir com `RETURNING` ou SELECT do `name`** — nesta sessao um DO NOTHING mascarou colisao (a versao existia com outro nome).
3. Apos qualquer push: re-sync e rodar `ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d` (deve ser vazio).

## 5. Regra de fechamento tripla (TODA mudanca dispara as tres)

| Mudou | Obrigatorio |
|---|---|
| DDL no banco | Arquivo em `supabase/migrations/` (mesmo prefixo 14 digitos) **+** `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)` manual (armadilha 5) |
| Funcao/tabela/view criada ou dropada | Atualizar `supabase/schema-catalog.json` (senao o job semanal `catalog-fresh` falha). Editar via node no container preservando `how_to_regenerate` — NAO usar regex generica de campos (nesta sessao um regex `/gener|at/` clobberou o campo) |
| Violacao do guard resolvida ou criada | Atualizar `scripts/db-audit/known-violations.json` (`known[]`). O guard sai 1 tanto com violacao NOVA quanto com entrada OBSOLETA. Se `novas=0`, vale: conjunto_novo = baseline − obsoletas_reportadas (matematicamente exato — usar as chaves que o proprio guard imprime) |

Validacao final de toda tarefa: guard exit 0 + paridade arquivos=registros com hash igual + `uniq -d` vazio.

---

# TAREFAS (em ordem de impacto)

## TAREFA 1 — `clear_login_attempts`: guard interno (bug de seguranca real, PRONTA)

**Evidencia (verificada):** ACL atual `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. Corpo atual completo:
```sql
BEGIN
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
```
Qualquer usuario logado zera o lockout de forca bruta de QUALQUER email.

**Por que o fix NAO e `REVOKE FROM authenticated`:** o cliente chama legitimamente em `src/lib/loginAttempts.ts:66` (`supabase.rpc('clear_login_attempts', { p_email })`) apos signIn bem-sucedido — com JWT `authenticated`. Revogar quebra o fluxo. A migration C-01 (`20260827130600`) da sessao paralela revogou `PUBLIC, anon` de proposito e manteve `authenticated` — o que faltou foi o guard DENTRO da funcao.

**Fix (CREATE OR REPLACE, assinatura intacta):** so permitir limpar o PROPRIO email, exceto service_role:
```sql
CREATE OR REPLACE FUNCTION public.clear_login_attempts(p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- service_role (backend) pode limpar qualquer email; authenticated so o proprio.
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' IS DISTINCT FROM 'service_role'
     AND LOWER(p_email) IS DISTINCT FROM LOWER(coalesce(auth.jwt()->>'email','')) THEN
    RAISE EXCEPTION 'clear_login_attempts: so e permitido limpar o proprio email';
  END IF;
  DELETE FROM public.login_attempts WHERE email = LOWER(p_email);
END;
$$;
```
Antes de aplicar, confirmar no banco como o JWT expoe o role neste self-hosted (testar `SELECT auth.jwt()` como authenticated se possivel; alternativa robusta: `auth.role() = 'service_role'` se a funcao `auth.role()` existir — verificar com `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth'`).

**Passos:** (1) `SELECT max(version)`; (2) aplicar CREATE OR REPLACE via `db_query`; (3) INSERT no registro (versao nova, ex. `20260827180000_guard_clear_login_attempts`); (4) arquivo da migration com o racional; (5) verificacao: corpo contem o RAISE (`SELECT prosrc ILIKE '%RAISE EXCEPTION%' FROM pg_proc ...`); (6) fechamento triplo (catalogo NAO muda — funcao ja existia; baseline NAO muda).

**Teste comportamental** (formato SELECT, armadilha 2): simular claims com `set_config('request.jwt.claims', '{"role":"authenticated","email":"a@b.c"}', true)` e conferir que limpar `outro@email.com` estoura e limpar `a@b.c` passa.

## TAREFA 2 — Completar Agente 5 (validacao da cadeia de migrations)

A bateria de 28 testes cobriu agentes 1–4; o 5 nao rodou. Executar:
1. **Paridade**: count+hash dos arquivos (container) vs registro (banco) — queries da secao 3. PASS = iguais.
2. **Duplicata de versao**: `uniq -d` vazio.
3. **Spot-check `_foreign/`** (7 arquivos): para 2–3 deles, extrair a tabela-alvo e conferir `to_regclass('public.<tabela>') IS NULL` no destino — confirma que continuam estrangeiras. ATENCAO a colisao de nome de indice (caso real: `idx_contacts_name_trgm` existe aqui em `public.contacts`; a migration estrangeira dropava pensando em `evolution_contacts`).
4. **Spot-check `_superseded/`** (4 arquivos): para `saved_filters` e `gmail_integration`, conferir que os objetos existentes vieram das migrations registradas (`20260315163251`, `20260315172343`, `20260403105341`) e que a DDL do arquivo NAO bate com o objeto real (ex.: `gmail_accounts` real usa `bytea` cifrado; o arquivo superado usa `text` puro).
5. **Arquivos das migrations da sessao paralela**: para cada `version >= 20260827130100` no registro, conferir que existe arquivo com o mesmo prefixo.

Sem escrita — se algo falhar, reportar e corrigir pela secao 5.

## TAREFA 3 — Gmail (3 quebras independentes; ordem: 3a → 3c → 3b)

**Estado:** `gmail_accounts` tem 0 linhas PORQUE o oauth quebra antes de gravar. `encrypt/decrypt_gmail_token` ja foram corrigidas (search_path `public, extensions` + RAISE sem chave) e testadas (roundtrip OK com chave efemera).

### 3a — Drift codigo↔tabela no gmail-oauth (executavel JA, sem decisao)

**Fatos verificados:** a tabela real (e o `types.ts`) tem `user_id` (sem FK), SEM `profile_id`, SEM `scopes`; unico UNIQUE = `gmail_accounts_email_address_key` (so `email_address`). **Semantica de `user_id` = `auth.users.id`**, provada pela policy `"Users can view their own gmail accounts"` (`user_id = auth.uid()`) e pelo corpo de `get_own_gmail_accounts` (`WHERE user_id = auth.uid()`).

**Fix no `supabase/functions/gmail-oauth/index.ts`** (linhas de referencia do HEAD `6effc7b` — re-conferir apos re-sync):
- upsert (~l.127-133): `profile_id: profile.id` → `user_id: user.id`; REMOVER `scopes: tokens.scope.split(" ")`; `onConflict: "profile_id,email_address"` → `onConflict: "email_address"`.
- l.151 e l.167: `.select("id, profile_id, ...")` → `user_id`; `.eq("profile_id", profile.id)` → `.eq("user_id", user.id)`.
- l.189: `.eq("profile_id", profile.id)` → `.eq("user_id", user.id)`.
- Se o lookup de `profiles` (~l.103) ficar sem uso apos as trocas, remover a query morta — conferir antes se `profile` e usado em outro ponto do arquivo.
- Conferir tambem `gmail-send`, `gmail-webhook`, `gmail-sync` e `_shared/gmail-helpers.ts` por `profile_id` contra `gmail_accounts` (nesta sessao so o oauth acusou, mas re-grep: `grep -n profile_id supabase/functions/gmail-* supabase/functions/_shared/gmail-helpers.ts`).

Sem mudanca de banco em 3a — fechamento: nenhum (codigo apenas). Baseline nao muda (as chaves gmail sao de RPC ausente, nao de coluna).

### 3c — `app.encryption_key` (DECISAO DO JOAQUIM — apresentar, nao decidir)

A chave NAO existe em nenhum escopo (0 em `pg_db_role_setting`). Opcoes a apresentar:
- **GUC**: `ALTER DATABASE postgres SET app.encryption_key = '<gerada>'`. Simples; risco: vive fora do repo/backup logico — restore sem settings orfana o ciphertext.
- **Vault**: guardar em `vault.decrypted_secrets` e reescrever `encrypt/decrypt_gmail_token` para ler de la (o padrao ja usado por `notify_sicoob_on_reply`). Mais robusto; muda as duas funcoes (fechamento triplo se aprovado).
Como `gmail_accounts` tem 0 linhas, nao ha ciphertext legado — qualquer chave nova serve. Gerar com 32+ bytes aleatorios, NUNCA logar o valor.

### 3b — Criar `get_gmail_tokens` / `store_gmail_tokens` (apos 3c)

Contratos EXATOS derivados dos call sites (`_shared/gmail-helpers.ts:85-97` e copias inline em oauth/send/webhook):
```sql
-- retorno lido como data[0].access_token / .refresh_token; helper exige data.length>0
CREATE FUNCTION public.get_gmail_tokens(p_account_id uuid)
RETURNS TABLE(access_token text, refresh_token text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT public.decrypt_gmail_token(access_token_encrypted),
         public.decrypt_gmail_token(refresh_token_encrypted)
  FROM public.gmail_accounts WHERE id = p_account_id;
$$;

CREATE FUNCTION public.store_gmail_tokens(p_account_id uuid, p_access_token text, p_refresh_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  UPDATE public.gmail_accounts SET
    access_token_encrypted  = public.encrypt_gmail_token(p_access_token),
    refresh_token_encrypted = CASE WHEN p_refresh_token IS NULL OR p_refresh_token = ''
                                   THEN refresh_token_encrypted
                                   ELSE public.encrypt_gmail_token(p_refresh_token) END,
    updated_at = now()
  WHERE id = p_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_gmail_tokens: account % nao existe', p_account_id; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_gmail_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_gmail_tokens(uuid,text,text) FROM PUBLIC, anon, authenticated;
```
Notas: o oauth chama `storeTokens(..., tokens.refresh_token || "")` — o CASE acima preserva o refresh anterior quando vier vazio (refresh do Google nem sempre retorna). `token_expires_at` NAO entra aqui — o oauth ja o grava separadamente (upsert e l.159).

**Fechamento obrigatorio de 3b:** catalogo `functions` +2; baseline: remover as 8 chaves `rpc:get_gmail_tokens:*` e `rpc:store_gmail_tokens:*` e podar `_severidade` do gmail; migration + registro. Rodar o guard ANTES de commitar o baseline para copiar as chaves obsoletas exatas que ele imprimir.

## TAREFA 4 — Edges orfas `analyze-external-db` e `evolution-health` (decisao rapida)

5 das 14 chaves do baseline sao delas. Ambas existem em `supabase/functions/`, nunca sao invocadas pelo front (0 `functions.invoke` — re-verificar com `grep -rn "invoke('analyze-external-db'\|invoke('evolution-health'" src`), e chamam RPCs/tabelas inexistentes (`get_tables_info`, `get_all_table_names`, `system_logs`, `message_queue`, `messages_whatsapp`). Apresentar: **remover** (mesmo tratamento do inbox: deletar diretorios + baseline 14→9 + conferir `supabase/config.toml`) vs **manter cercadas**. Se `APROVADO` remover: fechamento = baseline; catalogo nao muda; sem DDL.

## TAREFA 5 — Assertion do ACL de `mcp_exec` no CI (etapa 76, pequena)

O job `catalog-fresh` (semanal, tem `DESTINO_URL`) e o lugar. Adicionar step apos o diff do catalogo em `.github/workflows/db-guard.yml`:
```yaml
      - name: \ud83d\udd12 ACL de mcp_exec inalterado
        env: { DESTINO_URL: ${{ secrets.DESTINO_URL }} }
        run: |
          acl=$(psql "$DESTINO_URL" -At -c "SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='mcp_exec'")
          echo "acl=$acl"
          case "$acl" in *authenticated=X*|*anon=X*) echo 'FALHA: mcp_exec executavel por authenticated/anon'; exit 1;; esac
```
(mesmo para `mcp_exec_many`). Query de referencia em `docs/DB-SECURITY.md` secao 1.

## TAREFA 6 — SECURITY DEFINER sem guard interno (review, prioridade baixa)

Alem de `clear_login_attempts` (Tarefa 1), estas tem `authenticated=X` e nenhum guard no corpo: `cleanup_expired_challenges`, `cleanup_link_preview_cache`, `reassign_absent_agents`, `reassign_overloaded_agents`, `skill_based_assign`. Na pratica so cron/service_role as chama — risco menor. Verificar call sites no front antes de propor REVOKE de `authenticated` (mesma armadilha da Tarefa 1: pode haver chamada legitima). Apresentar como lote unico ao Joaquim.

## NAO TOCAR sem decisao explicita do Joaquim

- **Bloco 3** (etapas 33–44, geo/IP blocking) e **Bloco 4** (45–56, lockout/MFA): mexem no caminho de auth; etapa 34 e ADR.
- Correcao das violacoes de `evolution-health`/`analyze-external-db` religando tabelas — nao existe tabela para religar.
- Regenerar `types.ts` inteiro (7.500 linhas) — a declaracao fantasma de `validate_reset_token` e inofensiva e documentada.
- Etapa 100 (`docs/DB-INVENTORY.md`): so se sobrar tempo, valor baixo.

## Checklist de encerramento de QUALQUER sessao

```sh
# container
node scripts/db-audit/supabase-usage-guard.mjs                       # exit 0, novas: 0
ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d   # vazio
ls supabase/migrations/*.sql | wc -l                                  # anotar N
ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | tr -d '\n' | md5sum
```
```sql
SELECT count(*), md5(string_agg(version,'' ORDER BY version)) FROM supabase_migrations.schema_migrations;  -- = N e mesmo hash
```
E fechar a resposta com o bloco `Proximos passos` (3 itens, menu).
