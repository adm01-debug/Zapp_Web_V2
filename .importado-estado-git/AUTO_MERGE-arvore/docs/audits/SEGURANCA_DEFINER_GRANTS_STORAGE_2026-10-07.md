# Segurança (revisão em leitura) — funções SECURITY DEFINER, grants e buckets de storage

- **Cartão:** Y26 (PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md, seção 3.5)
- **Data:** 2026-10-07 · **Autor:** worker (banco/SQL) · **Modo:** SOMENTE LEITURA — nenhum arquivo de produto foi alterado e nada foi aplicado
- **Base:** branch local `dia/2026-10-07` do Zapp Web V2 (última migration do repo: `20261006160117_ai_context_version_atomic_persist.sql`)
- **Fontes usadas (só o repositório, sem tocar em produção):** `supabase/migrations/**` (800 arquivos, `_superseded/` e `_foreign/` ignorados), `supabase/schema-catalog.json` (funções/tabelas/views de 04/10), `supabase/schema-manifest.json` (ACL real capturada por `scripts/db-audit/manifest.sql`, 05/10), `src/**`.

## URGENTE

### SEC-DEFINER_GRANTS_STORAGE-01 — A URL da mensagem (controlada pelo cliente) é a prova de posse usada para liberar a leitura da mídia privada — **P1 (vira P0 se o caminho do objeto for conhecido)**

**Evidência (policy nova, 03/10):** `supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql:30-50`

```sql
CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media'::text, 'audio-messages'::text])
  AND EXISTS (SELECT 1 FROM public.messages m
              WHERE m.media_url IS NOT NULL
                AND ( right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
                        = '/' || objects.bucket_id || '/' || objects.name
                      OR position('/' || objects.bucket_id || '/' || objects.name || '?' IN m.media_url) > 0
                      ... ) )
);
```

**Evidência (a `media_url` é escolhida pelo cliente):** `supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql:21` (`p_media_url text DEFAULT NULL`), validação em `:54-58` (só exige `^https://` e ≤ 4096 caracteres) e `:161` (grava em `messages.media_url`); a RPC é executável por `authenticated` — `:193` `GRANT EXECUTE … TO authenticated`. Mesmo contrato em `20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:167,189-191` (`GRANT` em `:262`).

A policy (e o próprio cabeçalho dela, linhas 11-14) assume que "quem enxerga a linha em `messages` enxerga o objeto", mas a linha de `messages` que o atacante insere é dele mesmo: a `media_url` não é vinculada a nenhum caminho que ele possua.

**Cenário de exploração (3 passos, usuário autenticado, sem admin):**
1. O agente descobre (ou adivinha/recebe) o caminho `<contact_id>/<arquivo>` de uma mídia de outra conversa em `whatsapp-media`.
2. Chama a RPC `enqueue_outbound_message(p_contact_id => <contato atribuído a ele>, p_message_type => 'image', p_media_url => 'https://<projeto>.supabase.co/storage/v1/object/public/whatsapp-media/<contact_id>/<arquivo>')` — aceito, porque só se valida o prefixo `https://`.
3. Lê/baixa o objeto: a policy encontra a mensagem dele com aquela `media_url` exata e devolve o binário — mesmo sendo mídia de contato que ele não atende.

**Correção sugerida (NÃO aplicada) — vincular o caminho do objeto à identidade do chamador, em vez de confiar no texto da URL:**

```sql
-- opção A (mais simples): manter a policy aditiva, mas exigir que o caminho
-- pertença a um contato visível para o chamador (mesma regra da policy antiga).
DROP POLICY IF EXISTS "whatsapp media readable via visible message" ON storage.objects;
CREATE POLICY "whatsapp media readable via visible message"
ON storage.objects FOR SELECT TO authenticated
USING (
  objects.bucket_id = ANY (ARRAY['whatsapp-media','audio-messages'])
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.contacts c ON c.id = m.contact_id
    WHERE m.media_url IS NOT NULL
      AND c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
      AND right(m.media_url, length('/' || objects.bucket_id || '/' || objects.name))
          = '/' || objects.bucket_id || '/' || objects.name
  )
);

-- opção B (defesa na entrada): recusar em enqueue_outbound_message p_media_url
-- que não aponte para a pasta do próprio contato do chamador, no banco:
--   AND position('/storage/v1/object/' IN p_media_url) > 0
--   AND position('/' || p_contact_id::text || '/' IN p_media_url) > 0
```

**Esforço:** M (migration nova + teste com `set role authenticated`; a opção A é a que mantém o escopo do cartão de 03/10).

### SEC-DEFINER_GRANTS_STORAGE-02 — Policy de mídia usa `LIKE` montado com o nome do objeto (nome com `%`/`_` vira curinga) — **P2**

**Evidência:** `supabase/migrations/20260930700000_fix_whatsapp_storage_policies.sql:18` (e `:42`, para `audio-messages`):

```sql
CREATE POLICY "Users can read assigned whatsapp media" ON storage.objects FOR SELECT TO authenticated
USING ( bucket_id = 'whatsapp-media' AND ( is_admin_or_supervisor(auth.uid())
   OR (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.contacts c WHERE c.assigned_to IN (...))
   OR EXISTS ( SELECT 1 FROM public.messages m JOIN public.contacts c ON c.id = m.contact_id
               WHERE m.media_url LIKE '%/' || objects.name AND c.assigned_to IN (...) )
   OR (storage.foldername(name))[1] = auth.uid()::text ) );
```

`objects.name` entra cru dentro de um padrão `LIKE`: um objeto chamado `<pasta>/rel%2026.pdf` faz o padrão casar com URLs de outros objetos. É exatamente o defeito que a policy de 03/10 descreve no seu cabeçalho (`20261003142707…:17-18`) e corrige **só na policy nova** — esta continua viva, e as duas se somam por OR.

**Cenário (2 passos):** 1. o agente envia mídia e nomeia o arquivo com `%` (o nome é escolha dele no upload); 2. a leitura de objetos cujo caminho casa com o curinga passa a ser autorizada pela mesma mensagem dele.

**Correção sugerida (NÃO aplicada):** trocar `LIKE` pela comparação exata já usada na policy de 03/10 (`right(...) = ... OR position('...' ...) > 0`) e adicionar `JOIN contacts` com a regra de atribuição; opcionalmente apagar esta policy, deixando só a de 03/10 depois de corrigida a -01. **Esforço:** P.

## Demais achados

### SEC-DEFINER_GRANTS_STORAGE-03 — `get_profile_role_for_check(p_user_id)` devolve papel, `access_level` e `permissions` de QUALQUER usuário — **P2**

**Evidência:** `supabase/migrations/20260401003034_46580962-a5ba-41f5-b4b1-b05887b4b490.sql:2-7` (SECURITY DEFINER, `SET search_path = public`):

```sql
SELECT p.role, p.access_level, p.permissions FROM profiles p WHERE p.user_id = p_user_id LIMIT 1;
```

ACL atual: `EXECUTE` para `authenticated`, `postgres`, `service_role` (`supabase/schema-manifest.json`, chave `f:get_profile_role_for_check(p_user_id uuid)|authenticated|EXECUTE`). A função existe para as policies de `profiles` (usada em `:27-29`), e por isso precisa ser executável pelo chamador — mas nada impede a chamada direta via PostgREST com o `p_user_id` de terceiros.

**Cenário (2 passos):** 1. o agente chama `rpc/get_profile_role_for_check` com o `user_id` do alvo (uuid de `profiles`/`user_roles`); 2. recebe `role` + `access_level` + o array de `permissions` do alvo — reconhecimento direto para escalada. (A tabela `user_roles` **não** é mais visível a todos: a policy final é "Users view own roles, admins view all", `20260411110804_863265b0-05d5-40cf-96cb-f4d6014dfe3d.sql:7`.)

**Correção sugerida (NÃO aplicada):**

```sql
CREATE OR REPLACE FUNCTION public.get_profile_role_for_check(p_user_id uuid) RETURNS ... AS $$
  SELECT p.role, p.access_level, p.permissions FROM public.profiles p
  WHERE p.user_id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
```

**Esforço:** P (a policy que a consome já passa `auth.uid()`, então a mudança não quebra o uso interno).

### SEC-DEFINER_GRANTS_STORAGE-04 — 9 funções SECURITY DEFINER chamáveis por `authenticated` com `search_path` sem `pg_temp` e tabela referenciada sem schema — **P2**

O `pg_temp` é pesquisado **primeiro** para nomes de relação quando não está no caminho: um tabela temporária criada na sessão pode substituir a tabela real dentro da função DEFINER. As 9 abaixo são as que (a) não põem `pg_temp` no `search_path`, (b) citam uma tabela/visão real sem qualificar o schema e (c) têm `EXECUTE` para `authenticated`:

| Função | Evidência (arquivo:linha) | Tabelas sem schema |
|---|---|---|
| `is_within_business_hours(uuid)` | `20251215171815_3617ffab-ada8-49ba-bc2c-f61ed216d2d9.sql:1` | `business_hours` |
| `get_profile_role_for_check(uuid)` | `20260401003034_46580962-a5ba-41f5-b4b1-b05887b4b490.sql:2` | `profiles` |
| `update_own_profile(text×6)` | `20260404170153_bd513d5d-4f25-4f46-b2b6-496d4fbc815b.sql:1` | `profiles` |
| `reassign_overloaded_agents()` | `20261003272707_reconcile_local_replay_with_canonical.sql:1134` | `contacts`,`profiles`,`queue_members`,`conversation_events` |
| `reassign_absent_agents(integer)` | `20260829040000_fix_reassign_absent_agents_last_seen_at.sql:1` | `user_sessions`,`contacts`,`profiles`,`queue_members` |
| `grant_agent_achievement(uuid,text,text,text,integer)` | `20260928110000_fix_grant_agent_achievement_conflict_target.sql:16` | `profiles`,`agent_stats`,`agent_achievements` |
| `update_agent_streak(uuid,boolean)` | `20261003272707_reconcile_local_replay_with_canonical.sql:1704` | `profiles`,`agent_stats` |
| `increment_agent_resolutions(uuid)` | `20261003272707_reconcile_local_replay_with_canonical.sql:974` | `profiles`,`agent_stats` |
| `get_own_lockout_status(text)` | `20260401003515_b6d6758b-c178-4745-a462-cebfce318937.sql:5` | `login_attempts` (só `service_role`) |

**Cenário (3 passos):** 1. o agente abre uma sessão e cria `CREATE TEMP TABLE profiles (...)`/`agent_stats` com linhas forjadas (qualquer `authenticated` pode criar tabela temporária); 2. chama a RPC na mesma sessão/transação; 3. a função DEFINER lê a tabela **falsa** — em `update_own_profile`/`update_agent_streak`/`grant_agent_achievement` isso reescreve o próprio estado com dados escolhidos. Pela API pública o caminho depende de a sessão do PostgREST ser reaproveitada, por isso P2 (defesa em profundidade) e não P1.

**Correção sugerida (NÃO aplicada):** `ALTER FUNCTION … SET search_path = public, pg_temp;` em cada uma (ou `SET search_path = ''` + qualificação total, como já fazem 5 funções do repo). **Esforço:** P.

### SEC-DEFINER_GRANTS_STORAGE-05 — `EXECUTE` para `PUBLIC` sobrevive em 1 função (default do Postgres nunca revogado) — **P3**

**Evidência:** `supabase/migrations/20261001261230_f35_multiplix_audiences.sql:92` cria `public.multiplix_audiences_validate_shared_roles()` (trigger `BEFORE INSERT OR UPDATE`, `:127-132`) sem `REVOKE`. No ACL capturado em `supabase/schema-manifest.json` ela é a **única** rotina ainda com `EXECUTE` para `PUBLIC` (`f:multiplix_audiences_validate_shared_roles()|PUBLIC|EXECUTE`; as outras 324 foram revogadas por migrations em massa, ex. `20261001191230_revoke_execute_internal_trigger_functions.sql`).

**Impacto:** baixo — função de trigger não pode ser chamada diretamente (o Postgres recusa: `trigger functions can only be called as triggers`; a migration `20261001191230_revoke_execute_internal_trigger_functions.sql:37-40` documenta isso ao revogar a mesma classe em 59 funções). É higiene e ruído na matriz de ACL.
**Por que escapou:** a varredura em massa é de `20261001191230` (01/10 19:12:30) e esta função nasceu depois, em `20261001261230` (01/10 26:12:30) — toda função de trigger criada após a varredura volta ao default `PUBLIC EXECUTE`. Vale incluir a checagem no portão de saída (matriz de ACL), não só revogar esta.

**Correção sugerida (NÃO aplicada):**
```sql
REVOKE EXECUTE ON FUNCTION public.multiplix_audiences_validate_shared_roles() FROM PUBLIC, anon, authenticated;
```
**Esforço:** P.

### SEC-DEFINER_GRANTS_STORAGE-06 — Buckets sem `file_size_limit` e sem `allowed_mime_types` — **P3**

**Evidência (estado final pelos arquivos):**

| Bucket | Público | Limite de tamanho | MIME permitido | Onde foi criado/ajustado |
|---|---|---|---|---|
| `avatars` | sim | 5 MB | jpeg/png/webp/gif | `20260306011524_6df1c3a6…sql:2-3` |
| `custom-emojis` | sim | 500 KB | png/webp/gif/jpeg/svg+xml | `20260319005455_7ef4d742…sql:36-37` |
| `team-chat-files` | não | 50 MB | lista ampla, sem `svg` | `20260927270012…sql:1` + `20260902100002…sql:13-28` |
| `audio-memes` | **sim** | **nenhum** | **nenhum** | `20260319004136_0c26601b…sql:44` / `20260511233306…sql:4` |
| `stickers` | **sim** | **nenhum** | **nenhum** | `20260317234558_b9744cb6…sql:43` / `20260511233306…sql:12` |
| `whatsapp-media` | não | **nenhum** | **nenhum** | `20251223002656_c427b632…sql:2` / `20260511233306…sql:16` / privado em `20260905030000_private_media_buckets.sql:11` |
| `audio-messages` | não | **nenhum** | **nenhum** | `20251215025014_fcc5bc79…sql:106` / `20260511233306…sql:6` |
| `multiplix-voice` | não | **nenhum** | **nenhum** | `20261003132707_f64_voz_assets_e_grants.sql:152-154` |

**Cenário (2 passos, requer agente/upload permitido pela policy do bucket):** 1. o agente envia um arquivo de tipo arbitrário (ex. `text/html` ou `application/octet-stream`) ao bucket `stickers`/`audio-memes`; 2. como o bucket é **público**, a URL do objeto serve o conteúdo sem JWT — HTML/SVG servido pelo domínio do storage é vetor de página hospedada. Sem `file_size_limit` também não há teto de custo/armazenamento por upload.

**Correção sugerida (NÃO aplicada):** para `stickers`/`audio-memes`, impor limites como já se fez em `custom-emojis` (`UPDATE storage.buckets SET file_size_limit = 512000, allowed_mime_types = ARRAY['image/png','image/webp','image/gif','image/jpeg'] WHERE id = 'stickers';` e `… ARRAY['audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/aac'] … 'audio-memes'`); para `whatsapp-media`/`audio-messages` a restrição de MIME depende do `application/octet-stream` da Evolution (já registrado em `20260902100002…sql:5-8`) — dá para fixar só `file_size_limit`. **Esforço:** P/M.

### SEC-DEFINER_GRANTS_STORAGE-07 — Policies de leitura duplicadas (e inócuas) nos buckets públicos; o bucket público ignora RLS — **P3**

**Evidência:** em `20260511233306_0e3f3b66…sql` existem, para o mesmo bucket, duas policies de SELECT com predicado idêntico:
`"Anyone can view avatars"` (`:25`) e `"Avatar images are publicly accessible"` (`:45`), ambas `FOR SELECT TO authenticated USING (bucket_id = 'avatars')`; mesma coisa em `"Anyone can view stickers"` (`:29`), `"Public read audio memes"` (`:49`) e `"Public read for custom emojis"` (`:53`). Também há dois DELETE iguais em `avatars` (`:85` e `:89`).
**Risco:** as policies são irrelevantes enquanto o bucket for `public=true` (o endpoint público serve o objeto sem passar por RLS), o que dá falsa sensação de controle: no dia em que alguém marcar o bucket como privado, uma policy "Public read" esquecida continua liberando leitura a todo `authenticated`. Além disso, policies permissivas se somam por OR e dificultam a revisão.
**Correção sugerida (NÃO aplicada):** apagar a policy redundante de cada par (`DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;`, `DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;`) — ou, se o bucket continuar público, trocar as policies de SELECT por comentário explicando que a leitura vem do bucket público. **Esforço:** P.

### SEC-DEFINER_GRANTS_STORAGE-08 — `team-chat-files`: quem cria não é quem lê/apaga (identidade inconsistente entre INSERT e SELECT/DELETE) — **P3 (funcional, não vazamento)**

**Evidência:** o INSERT grava na pasta `public.current_profile_id()` (`20260928560000_team_chat_e20_storage_team_chat_files.sql:12`), mas o SELECT compara com `auth.uid()` (`20260927270012_team_chat_e21_storage_select_policy.sql:3`) e o DELETE também (`20260511233306_0e3f3b66…sql:81`). `current_profile_id()` devolve `profiles.id`; `auth.uid()` devolve o id de `auth.users` — valores diferentes.
**Efeito:** o ramo "dono da pasta" do SELECT/DELETE nunca casa; a leitura do próprio arquivo só funciona pelo ramo que procura a mensagem da conversa (`team_messages.media_bucket/media_path`), e o DELETE do próprio arquivo fica bloqueado para o autor.
**Correção sugerida (NÃO aplicada):** usar a mesma identidade nos três verbos (`public.current_profile_id()::text`). **Esforço:** P.

## Resumo dos achados

| ID | Severidade | Assunto | Esforço |
|---|---|---|---|
| SEC-DEFINER_GRANTS_STORAGE-01 | **P1 (URGENTE)** | `media_url` do cliente autoriza leitura de mídia privada (policy de 03/10) | M |
| SEC-DEFINER_GRANTS_STORAGE-02 | P2 | `LIKE` com o nome do objeto como padrão na policy de mídia | P |
| SEC-DEFINER_GRANTS_STORAGE-03 | P2 | `get_profile_role_for_check` expõe papel/permissões de qualquer usuário | P |
| SEC-DEFINER_GRANTS_STORAGE-04 | P2 | 9 funções DEFINER sem `pg_temp` no `search_path` com tabela sem schema | P |
| SEC-DEFINER_GRANTS_STORAGE-05 | P3 | `EXECUTE` para `PUBLIC` remanescente (função de trigger) | P |
| SEC-DEFINER_GRANTS_STORAGE-06 | P3 | buckets sem limite de tamanho/MIME (`stickers`, `audio-memes`, mídia privada) | P/M |
| SEC-DEFINER_GRANTS_STORAGE-07 | P3 | policies de leitura duplicadas em buckets públicos | P |
| SEC-DEFINER_GRANTS_STORAGE-08 | P3 | identidade divergente entre INSERT e SELECT/DELETE em `team-chat-files` | P |

## Verificado e SEM problema (para provar cobertura)

**Funções e grants**
- `SECURITY DEFINER`: 299 funções no estado final das migrations; **nenhuma** sem `SET search_path` (0 de 299).
- `search_path` declarado (299 funções DEFINER): `public, pg_temp` 143 · `public` 144 · `''` (vazio) 5 · `pg_catalog, public` 2 · `public, vault, pg_temp` 2 · `public, extensions, pg_temp` 1 · `public, cron, vault` 1 · `pg_catalog, public, cron` 1. Nenhuma usa `$user` (0 ocorrências no repo) nem caminho gravável por terceiros.
- ACL de EXECUTE (capturado em `supabase/schema-manifest.json`, 724 entradas / 325 rotinas): `postgres` 325, `service_role` 259, `authenticated` 139, `PUBLIC` 1 (achado -05) e **`anon` 0**.
- Segredos e utilitários administrativos estão restritos a `postgres`/`service_role`, sem `authenticated`/`anon`: `get_multiplix_cron_secret`, `get_talkx_cron_secret`, `get_ai_jobs_cron_secret`, `get_connection_health_check_cron_secret`, `get_avatars_refresh_cron_secret`, `get_instance_token`, `set_instance_token`, `get_gmail_tokens`, `store_gmail_tokens`, `encrypt_gmail_token`, `decrypt_gmail_token`, `get_department_whatsapp_api_key`, `get_department_whatsapp_credentials`, `mcp_exec`, `mcp_exec_many`, `revoke_auth_sessions`, `purge_talkx_expired_data`, `consume_gmail_oauth_state`.
- SQL dinâmico: só 3 funções DEFINER usam `EXECUTE` dinâmico e **todas** montam o comando com `format(%I/%L)` — nenhuma concatenação de valor:
  `merge_contacts_atomic` (`20260909120000…sql:93`), `purge_talkx_expired_data` (`20261004173439…sql:77`), `talkx_engine_cron_runs` (`20261003242707…sql:215`).
- Funções DEFINER sensíveis conferem autorização no corpo antes de agir, com a assinatura exata revogada de `PUBLIC`/`anon`: `get_channel_credentials_safe` (`20260404173531…sql:40-51`, exige `has_role(auth.uid(),'admin')`), `set_department_whatsapp_config` (`20260928540000…sql:10-14`, exige admin/supervisor), `talk_me_claim` (`20260930310000…sql:302`), `mark_team_conversation_read` (`20260930470000…sql:1`), `toggle_team_reaction` (`20260930260000…sql:30`), `catalog_rate_limit_hit` (`20261003122707…sql:36`, recusa `p_user <> auth.uid()`), `close_conversation_atomic`, `enqueue_outbound_message` (`20260930200000…sql:45-58`, usa `user_has_permission` + escopo de conexão).
- `mcp_exec`/`mcp_exec_many` (execução de SQL arbitrário) publicadas apenas para `postgres`/`service_role`.

**Storage**
- Buckets que guardam dado de cliente estão **privados**: `whatsapp-media`, `audio-messages`, `team-chat-files` baixados de `public=true` para `false` em `20260905030000_private_media_buckets.sql:11` (e antes em `20260401002123…sql:3`, `20260401003147…sql:3`, `20260402214625…sql:46`); `multiplix-voice` nasce privado (`20261003132707…sql:152`). Os públicos são só de conteúdo compartilhado (`avatars`, `stickers`, `audio-memes`, `custom-emojis`).
- Nenhuma policy de `storage.objects` usa `USING (true)` nem concede a `anon`/`PUBLIC`; toda policy de bucket é escopada por `bucket_id` e por dono/pasta/conversa.
- Não há `GRANT`/`REVOKE`/`ALTER DEFAULT PRIVILEGES` novo fora dos cartões anteriores; `default_grants` do manifesto segue o padrão do Supabase e `schema_grants` não dá `CREATE` a `anon`/`authenticated`.
- Assinatura de URL em uso é de 1 hora: `src/hooks/chat/useContactMedia.ts:66` e `src/hooks/communication/useAudioPlayer.ts:19` (`SIGNED_URL_TTL_SECONDS = 3600`), usada em `createSignedUrls` no lugar de URL pública.
- `team-chat-files` tem limite de 50 MB e lista de MIME (sem `svg`); `avatars` 5 MB + imagens; `custom-emojis` 500 KB + imagens (achado -06 cobre os que faltam).

**Escopo/limitações:** revisão estática do repositório (a ACL vem do manifesto commitado, gerado em 05/10 por `scripts/db-audit/manifest.sql`); não houve execução em banco e nada foi aplicado. Os cartões de integração posteriores a `20261006160117` (ex. o contrato de mídia do Team Chat) não estão nesta base e podem alterar os achados -07/-08.
