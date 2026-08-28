# Auditoria Exaustiva de Migração de Banco de Dados — ZAPP WEB V2 (28/08/2026)

**Data:** 28/08/2026
**Origem:** `vpkmqeumtxhrwgawxdrl.supabase.co` (Lovable Cloud, acesso read-only via MCP de auditoria)
**Destino:** `tnnnlkbymytvtqngbbqh.supabase.co` (Supabase Cloud, PG 17.6 — ambiente vivo)
**Repositório:** `adm01-debug/zapp-web-v2` (branch `claude/database-migration-audit-0b2nhm`)
**Método:** mesma query de catálogo executada nos dois bancos; assinatura MD5 por objeto; set-diff bidirecional por nome + hash de definição; probe HTTP não-invasivo para edge functions; cross-reference com 100% de `src/` + `supabase/functions/`.
**Relação com a auditoria anterior:** este documento **revalida do zero** o estado pós-correções de 27/08 (`AUDITORIA_MIGRACAO_DB_2026-08-27.md`, execução em `EXECUCAO_MELHORIAS_2026-08-27.md` e migrations `20260826210100`…`20260827210200`). Nada foi assumido do relatório anterior — todos os números abaixo foram remedidos em 28/08.

> **Garantia de não-mutação:** nenhuma tabela, coluna, constraint, índice, policy, função, trigger, view, enum, extensão, grant, job ou migration foi criado, alterado ou removido em qualquer um dos dois bancos durante esta auditoria. Origem é read-only por guardrail do gateway; no destino executei exclusivamente `SELECT`s de catálogo. As edge functions foram sondadas apenas com requisições `OPTIONS`/`GET` sem payload (preflight CORS), sem executar lógica de negócio.

---

## 1. Veredito

**A migração está ÍNTEGRA. Perda real de objeto migrado: NENHUMA.**

O destino é **superconjunto estrito** da origem em todas as 20 categorias auditadas. As três únicas ausências no destino têm causa raiz identificada, documentada e intencional:

| Objeto ausente no destino | Causa | Classificação |
|---|---|---|
| Função `validate_reset_token(text)` | Removida pela migration `20260827170000_drop_dead_reset_token_subsystem.sql` — código morto (0 chamadores; fluxo substituído pelo GoTrue nativo) | **Remoção intencional documentada** |
| Trigger `profiles.on_profile_update_prevent_escalation` | Redundante com `prevent_privilege_escalation` (mesma tabela, mesma proteção). A origem tinha DOIS guards de escalação em `profiles`; o destino manteve o mais estrito (levanta exceção em vez de reverter silenciosamente) | **Dedup intencional — proteção mantida ou mais forte** |
| Trigger `user_devices.update_user_devices_last_seen` | Era **duplicata exata** de `on_device_update_last_seen` na origem (dois triggers BEFORE UPDATE chamando a mesma função) | **Dedup de bug da origem** |

Ponto essencial de contexto (confirmado hoje): **a origem é que está degradada**, não o destino. A tabela `contacts` foi dropada com `CASCADE` na origem em 26/08/2026 (teste de segurança), destruindo lá 34 FKs, 30 policies, 16 índices e 5 triggers, e a origem também não possui os triggers de `auth.users` (`on_auth_user_created*`). O destino preservou/restaurou todos esses objetos.

---

## 2. Placar geral (medido em 28/08/2026, mesma query nos dois bancos)

| Categoria | Origem | Destino | Δ | Veredito |
|---|---:|---:|---:|---|
| Schemas (não-sistema) | 12 | 12 | 0 | ✅ listas idênticas |
| Extensões | 8 | 8 | 0 | ✅ apenas `pg_net` 0.20.0 → 0.20.4 (minor gerido pelo Supabase) |
| Tabelas `public` | 122 | 124 | +2 | ✅ extras: `contacts`, `email_attachments` |
| Colunas `public` | 1.280 | 1.313 | +33 | ✅ **hash de colunas idêntico nas 122 tabelas comuns** (nome, tipo, nullability, default — zero drift); +26 de `contacts`, +7 de `email_attachments` |
| Constraints | 324 | 368 | +44 | ✅ **324/324 presentes por nome e definição**; extras = 34 FKs→`contacts` + 6 da própria `contacts` + 3 de `email_attachments` + `whatsapp_connections_instance_id_key` |
| Índices | 288 | 416 | +128 | ✅ **288/288 presentes por nome e definição**; extras = backfill de índices de FK (`20260827120000`) + 17 índices de `contacts` (incl. trigram) |
| RLS habilitado | 122/122 | 124/124 | — | ✅ 100% nos dois; 0 tabelas sem policy; 0 sem INSERT/ALL no destino |
| Policies RLS `public` | 335 | 368 | +33 | ✅ **335/335 presentes por nome + cmd + roles + qual + with_check**; extras cobrem `contacts`, `email_attachments` e endurecimentos (`messages`, `message_reactions`, `contact_tags`, `contact_custom_fields` — que na origem ficaram com RLS ligado e **zero** policy após o CASCADE) |
| Funções `public` | 64 | 67 | +3 | ✅ 63/64 com corpo idêntico ou endurecido; 1 dropada com migration documentada; extras: `get_gmail_tokens`, `store_gmail_tokens`, `mcp_exec`, `mcp_exec_many` |
| Triggers `public` | 65 | 68 | +3 | ✅ 63/65 idênticos por definição; 2 ausências explicadas (acima); +5 triggers de `contacts` |
| Triggers `auth.users` | **0** | **2** | +2 | ✅ destino correto (`on_auth_user_created`, `on_auth_user_created_role`); a origem é que perdeu |
| Views | 7 | 7 | 0 | ✅ hash de definição **idêntico** nas 7; todas `security_invoker=true` no destino |
| Materialized views | 0 | 0 | 0 | ✅ |
| Enums | 4 | 4 | 0 | ✅ mesmos labels, mesma ordem (`ai_provider_type`, `app_role`, `channel_type`, `service_account_type`) |
| Sequences / Domains / Composites | 0 | 0 | 0 | ✅ (modelo 100% uuid) |
| Publications | 2 | 2 | 0 | ✅ `supabase_realtime` na origem publica 3 tabelas; destino publica 11 (⊇ origem) — decisão D5 documentada |
| Replica identity ≠ default | 4 | 12 | +8 | ✅ destino ⊇ origem (suporte ao realtime expandido) |
| Grants (`anon`/`authenticated`/`service_role`) | 7 privilégios × 129 relações | 7 × 131 | — | ✅ mesmo padrão default do Supabase; diferença = as 2 tabelas novas |
| Default ACL | idêntico | idêntico | — | ✅ exceto entradas do role `sandbox_exec` (infra do gateway de auditoria da origem, não é aplicação) |
| Roles custom | `sandbox_exec` | — | -1 | ✅ intencional — infra Lovable/gateway da origem |
| Jobs `pg_cron` | 1 | 1 | 0 | ✅ `cleanup-link-preview-cache` `0 3 * * *`, **hash do comando idêntico** |
| Migrations registradas | 10 (histórico truncado pela Lovable) | 277 | +267 | ✅ repo × destino: **277/277, set-diff vazio nos dois sentidos** |
| Storage buckets | 7 | 7 | 0 | ✅ mesmos ids/visibilidade; destino adiciona allowlist de MIME em `avatars` e `custom-emojis` (hardening) |
| Storage objects | 0 | 2 | +2 | ✅ origem não tinha NENHUM arquivo — nada a migrar |
| Storage policies | 23 | 29 | +6 | ✅ **23/23 presentes com hash idêntico**; extras cobrem `whatsapp-media` e `audio-messages` (buckets privados que na origem não tinham NENHUMA policy) |
| `auth.users` | 3 | 3 | 0 | ✅ **mesmos UUIDs** (hash da lista de ids idêntico); mesmos e-mails |
| Vault secrets | 0 | 2 | +2 | ✅ destino adotou vault (`gmail_encryption_key`, `sicoob_service_role_key`) |
| Edge functions deployadas | 60/60 | 60/60 | 0 | ✅ probe OPTIONS: todas as 60 do repo respondem 200 nos DOIS projetos (controle negativo: nome inexistente → 404) |
| Event triggers | 6 (padrão Supabase) | 6 | 0 | ✅ infra padrão |
| Foreign servers / FDW | 0 | 0 | 0 | ✅ |
| PostgreSQL | 17.6 | 17.6 | 0 | ✅ |

---

## 3. Metodologia (reprodutível)

1. **Identidade das conexões** confirmada por probe: origem `src_ref=vpkmqeumtxhrwgawxdrl` (role postgres, read-only), destino `https://tnnnlkbymytvtqngbbqh.supabase.co`.
2. **Assinatura por objeto**: para cada tabela, `md5()` agregado de colunas (`nome|tipo|udt|nullability|default`), constraints (`pg_get_constraintdef`), índices (`indexdef`), policies (`cmd|roles|qual|with_check`) e triggers (`pg_get_triggerdef`); para funções, `md5(pg_get_functiondef)` + `prosecdef` + `proconfig`; para views, `md5(definition)`.
3. **Set-diff bidirecional** por chave `(tabela, nome, hash8)` via script Python sobre os catálogos JSON dos dois bancos — detecta ausência, sobra E drift de definição com o mesmo nome. Resultado: `cons 324→368 (0 faltando, 0 drift)`, `idx 288→416 (0 faltando, 0 drift)`, `pol 335→368 (0 faltando, 0 drift)`, `trg 65→68 (2 faltando — explicados, 0 drift)`.
4. **Migrations**: array das 277 versões dos arquivos do repo embutido em query `EXCEPT` bidirecional contra `supabase_migrations.schema_migrations` do destino → vazio nos dois sentidos. (`_foreign/` e `_superseded/` corretamente fora do caminho do `db push`.)
5. **Edge functions**: probe `OPTIONS` nas 60 funções × 2 projetos + controle negativo (404 para nome inexistente).
6. **Dados**: contagem exata por tabela + `md5(string_agg(md5(row::text)))` nas 10 tabelas populadas da origem + verificação de presença por UUID no destino.
7. **Acoplamento com código**: grep exaustivo de `supabase.from('…')`, `.rpc('…')`, `functions.invoke('…')` e chamadas por URL `functions/v1/…` em `src/` e `supabase/functions/`, cruzado com uso interno no banco (policies, triggers, cron, corpo de outras funções via `prosrc`).

---

## 4. Diferenças de definição encontradas (todas intencionais, com evidência)

Funções presentes nos dois bancos com corpo diferente — únicas 5 em 63 comuns:

| Função | O que mudou no destino | Evidência |
|---|---|---|
| `clear_login_attempts(text)` | Guard adicional (só limpa as próprias tentativas / service_role) | migration `20260827180000_guard_clear_login_attempts.sql` |
| `encrypt_gmail_token(text)` | `search_path=public, extensions` + chave vinda do vault | família `20260827*` (criptografia Gmail ligada ao vault) |
| `decrypt_gmail_token(bytea)` | idem | idem |
| `notify_sicoob_on_reply()` | Deixa de usar URL/`current_setting` hardcoded; passa a usar secret do vault (`sicoob_service_role_key`) | vault do destino + corpo da função |
| `search_contacts(…)` | Ajustada ao `contacts` local restaurado | D1 em `docs/migration/DECISIONS.md` |

Observação importante sobre a origem: as funções `auto_assign_contact`, `contacts_count_by_type`, `is_contact_visible_to_user`, `normalize_contact_phone`, `search_contacts` e `notify_sicoob_on_reply` **referenciam `public.contacts`, que não existe mais na origem** — na origem elas quebram em runtime. No destino, com `contacts` restaurada, voltaram a ser executáveis. Mais um indício de que o destino é o lado íntegro.

---

## 5. Dados — o que foi migrado, o que foi repopulado, o que foi descartado

O destino **não é réplica de dados** da origem: é o ambiente vivo (1.467 `messages`, 86 `contacts` reais em produção contra 7 mensagens-fixture e 0 contacts na origem). A validação linha a linha das 10 tabelas populadas da origem:

| Tabela | Origem | Destino | Situação |
|---|---:|---:|---|
| `auth.users` | 3 | 3 | ✅ **MIGRADOS — mesmos UUIDs, mesmos e-mails** |
| `user_roles` | 3 | 3 | ✅ pares (user_id → role) **semanticamente idênticos** (admin/admin/agent); ids de linha recriados |
| `profiles` | 3 | 3 | ✅ mesmos `user_id`; ⚠️ nomes editados no destino e `access_level` dos 2 admins mudou de `full` → `basic` (ver §7-P2) |
| `agent_stats` | 3 | 3 | ✅ recriados pelos triggers; drift de conteúdo é runtime normal |
| `global_settings` | 4 chaves | 5 chaves | ⚠️ **conjuntos diferentes** — origem: `app_env`, `evolution_api_url`, `evolution_instance`, `supabase_functions_url` (migraram para `.env.production`/instância `PRINCIPAL`); destino: `api_token` (vazia), `auto_reopen_hours`, `check_msg_is_group`, `group_tickets_enabled`, `user_creation` (ver §7-P3) |
| `ai_providers` | 3 (Anthropic Claude, Groq Llama, OpenAI GPT-5) | 2 (DeepSeek ✱default, Lovable AI) | ⚠️ **não migrados — substituídos** (ver §7-P1) |
| `channel_connections` | 1 (“Evolution wpp2”, disconnected) | 0 | ⚠️ não migrado; substituído por `whatsapp_connections` “Promo Brindes WhatsApp” conectada à instância `PRINCIPAL` (ver §7-P4) |
| `whatsapp_connections` | 1 | 1 | ✅ recriada para o ambiente novo (conexão real, `connected`) |
| `messages` | 7 (fixture: contatos sintéticos `c1111111-…`) | 1.467 reais | ✅ fixture descartada intencionalmente; 0 dos 7 UUIDs presentes no destino |
| `audit_logs` | 3 (`role_created`) | 5 próprios | ⚠️ trilha histórica da origem não copiada (ver §7-P5) |
| `link_preview_cache_metrics` | 51 | 51 | ✅ telemetria rolante do cron, gerada independentemente em cada banco — não é dado migrável |
| `storage.objects` | 0 | 2 | ✅ origem sem arquivos; nada a migrar |

**Conclusão de dados:** os únicos registros que existem na origem e não existem no destino são dados de teste (7 mensagens-fixture), telemetria regenerável, e três conjuntos de configuração **deliberadamente repopulados** para o ambiente novo — listados em §7 como pendências de decisão, não como perda silenciosa.

---

## 6. Diferenças intencionais × perdas reais — classificação final

| Diferença | Classificação |
|---|---|
| `contacts` (26 col, 6 cons, 17 idx, 4 pol, 5 trg) + 34 FKs + 26 policies dependentes só no destino | **Intencional (D1)** — restauração; a origem é que perdeu via DROP CASCADE |
| `email_attachments` só no destino | **Intencional** — evolução (migration `20260827210200`) |
| +128 índices (backfill de FK) | **Intencional** — correção de performance (`20260827120000`) |
| Policies extras em `messages`, `message_reactions`, `contact_tags`, `contact_custom_fields`, `link_preview_cache_metrics`, `email_attachments` | **Intencional** — hardening/restauração |
| Triggers de `auth.users` só no destino | **Intencional** — a origem é que perdeu; destino correto |
| `validate_reset_token` dropada no destino | **Intencional documentado** (`20260827170000`) |
| Trigger duplicado de `user_devices` removido | **Intencional** — dedup de bug da origem |
| Trigger `on_profile_update_prevent_escalation` removido (guard por exceção mantido) | **Intencional** — comportamento mais estrito; função `prevent_role_escalation` ficou órfã (§8) |
| `get_gmail_tokens`/`store_gmail_tokens` novas + vault | **Intencional** — segurança de tokens |
| `mcp_exec`/`mcp_exec_many` só no destino | **Intencional** — infra MCP (EXECUTE restrito a postgres/service_role desde `20260827000100`) |
| Role `sandbox_exec` só na origem | **Intencional** — infra do gateway de auditoria da origem |
| Realtime 3 → 11 tabelas; replica identity 4 → 12 | **Intencional (D5)** |
| MIME allowlist nos buckets; 6 storage policies extras | **Intencional** — hardening |
| `pg_net` 0.20.0 → 0.20.4 | **Intencional** — minor gerido pelo Supabase |
| Migrations 10 → 277 registradas | **Intencional** — histórico da origem truncado pela Lovable; repo×destino fecham 277/277 |
| Config repopulada (`ai_providers`, `global_settings`, `channel_connections`) | **Intencional com pendência de decisão** (§7) |
| Fixture (7 messages), trilha `audit_logs` antiga, telemetria de cache | **Descarte intencional / não-migrável** |
| **Perda real de objeto ou dado de negócio** | **NENHUMA** |

---

## 7. Pendências que exigem SUA decisão (nenhuma ação será tomada sem autorização)

- **P1 · `ai_providers` da origem.** As 3 configurações (Anthropic Claude, Groq Llama, OpenAI GPT-5 — esta era a default ativa) não foram trazidas; o destino opera com DeepSeek (default) + Lovable AI. Se as chaves/configs antigas ainda interessam, é preciso recadastrá-las **antes de congelar a origem** (as chaves de API são recuperáveis lá até o desligamento).
- **P2 · `access_level` dos administradores.** Na origem os 2 admins tinham `full`; no destino os 3 perfis estão `basic`. Se alguma feature depender de `access_level`, os admins podem estar sub-privilegiados. Confirmar se foi edição consciente.
- **P3 · `global_settings.api_token`** existe no destino com valor **vazio**. Confirmar se é placeholder aguardando preenchimento ou resquício a remover.
- **P4 · `channel_connections`.** O registro “Evolution wpp2” da origem (com `config`/`credentials`) não foi migrado. Se a segunda instância Evolution ainda for usada, recriar o registro; caso contrário, formalizar o descarte.
- **P5 · Trilha de `audit_logs` da origem** (3 eventos de criação de roles). Para compliance, exportar como JSON/CSV para `docs/audits/` antes do congelamento da origem — a trilha não existe no destino.
- **P6 · `prevent_role_escalation`** ficou sem trigger no destino. Manter como reserva documentada ou remover (remoção só com sua aprovação explícita — etapa 21 do plano).

---

## 8. Objetos parcialmente implementados (existem no banco, sem código interligado)

Contexto esperado: o sistema está em fase de criação — **110 das 124 tabelas do destino estão vazias**, o que é normal. O que se lista aqui é acoplamento de CÓDIGO, não volume de dados. Medição de 28/08 sobre 100% de `src/` + `supabase/functions/` + policies + triggers + cron + corpo de funções.

### 8.1 Tabelas sem NENHUMA referência de código (2)
`crisis_room_alerts` (sobrepõe conceitualmente `warroom_alerts`, que tem uso) e `webhook_rate_limits` (sobrepõe `rate_limit_configs`/`rate_limit_logs`, que têm uso). Candidatas a consolidação — decisão na etapa 71–72.

### 8.2 Tabelas com via de escrita ausente ou acoplamento mínimo (5)
- `link_preview_cache_metrics` — lida/limpa pelo cron, mas **nenhum código insere** nela hoje (as 51 linhas são legado); a policy `service_role inserts cache metrics` já existe esperando o produtor.
- `mfa_sessions` — 1 referência; fluxo MFA não implementado.
- `voice_command_logs` — 1 referência; `voice-copilot-action` existe mas nunca é invocada.
- `audio_meme_favorites` — acessada só via RPCs `fn_*` (que o app usa); UI de favoritos parcial.
- `email_attachments` — recém-criada, aguardando o produtor (`gmail-sync`).

### 8.3 Funções de banco órfãs (15 de app + 2 de infra)
Sem `.rpc()` no app, sem trigger, sem policy, sem view, sem cron e sem chamada interna de outra função (aparecem apenas no `types.ts` gerado):

| Bloco | Funções |
|---|---|
| Geo/IP blocking (banco pronto, app desligado) | `is_ip_blocked`, `is_ip_whitelisted`, `is_country_allowed`, `is_country_blocked` |
| Credenciais de canal | `get_channel_credentials`, `get_channel_credentials_safe`, `get_connection_instance`, `get_connection_qr_code`, `mask_channel_credentials` (**trigger function não anexada a nenhuma tabela**) |
| Lockout/reset | `get_own_lockout_status`, `get_own_reset_requests`, `get_reset_requests_safe` |
| Diversos | `get_profile_role_for_check`, `fn_list_audio_meme_categories`, `prevent_role_escalation` (órfã nova — ver §6) |
| Infra MCP (manter) | `mcp_exec`, `mcp_exec_many` |

Progresso desde 27/08: `encrypt_gmail_token`/`decrypt_gmail_token` **deixaram de ser órfãs** (agora chamadas por `store_gmail_tokens`/`get_gmail_tokens`, que o app usa) e `validate_reset_token` foi removida com migration documentada.

### 8.4 Views sem consumidor no frontend (4 de 7)
`gmail_accounts_safe`, `profiles_public`, `whatsapp_connections_agent`, `whatsapp_connections_public` — as views “safe” existem mas o código ainda lê as tabelas base (mitigado por RLS/policies; adoção nas etapas 40, 53–54).

### 8.5 Edge functions deployadas sem invocador no repositório (12 de 60)
- **Legítimas por natureza** (chamadas de fora — webhook/agendador externo): `whatsapp-webhook`, `elevenlabs-webhook`, `auto-close-conversations`, `cleanup-rate-limit-logs`, `talkx-scheduler`.
- **Aguardando fluxo**: `gmail-send`, `gmail-sync` (banco+cripto prontos, disparo ausente), `elevenlabs-agent-token` (par do `voice-agent`), `voice-copilot-action`, `send-rate-limit-alert`.
- **Ferramentais/pontuais**: `external-db-bridge`, `recover-corrupted-audios`.
- ⚠️ **Nenhum agendador interno existe**: o `pg_cron` do destino tem **1 job** (`cleanup-link-preview-cache`). `auto-close-conversations`, `talkx-scheduler`, `cleanup-rate-limit-logs`, `send-scheduled-report`, `connection-health-check` e a escalação de SLA (doc `SLA-ESCALATION-CRON.md`) dependem de agendamento que **não está configurado em lugar nenhum** — etapas 63–70.
- Dependência externa mapeada: `sicoob-bridge-reply` chama `chat-bridge` **no projeto `allrjhkpuscmgbsnmjlv`** (terceiro projeto Sicoob) — não é função deste banco; validar na etapa 76.
- RPCs externas do CRM (`get_contact_360_by_phone`, `search_contacts_advanced`, `get_companies_by_phones_batch`, `get_contact_intelligence_by_phone`, `sync_interaction_from_zapp`) pertencem ao projeto `pgxfvjmuubtbowutlide` (Gestão de Clientes) — fora do escopo deste par origem/destino, saudáveis no código (`src/hooks/crm/*`).

### 8.6 Situação dos guard-rails herdados do plano de 27/08 (remedidos hoje)
| Item do plano anterior | Estado em 28/08 |
|---|---|
| FKs de coluna única sem índice | **0** (era 108) ✅ |
| Tabelas sem policy de INSERT/ALL | **0** (era 1) ✅ |
| `security_invoker` inconsistente nas views | **0** — todas `true` ✅ |
| Drift de migrations repo × destino | **0** — 277/277 ✅ |
| `scripts/db-audit/` + CI `db-guard.yml` | ✅ existem e ativos |
| `COMMENT ON FUNCTION` nas órfãs | ✅ 17 comentários presentes |
| `docs/DB-INVENTORY.md` | ❌ ainda não criado (vira etapa 11) |
| Reconexão geo/IP, lockout-UI, Gmail, agendadores | ❌ pendentes (absorvidos no plano abaixo) |

---

## 9. PLANO DE MELHORIAS E CORREÇÕES — 100 ETAPAS

Regras do plano: **nenhuma etapa executa DROP/ALTER destrutivo sem sua aprovação individual e explícita** (etapas que dependem disso estão marcadas ⚠️APROVAÇÃO). Toda mudança de banco entra por migration versionada em `supabase/migrations/` (nunca DDL out-of-band — lição do A-05). Etapas são pequenas, verificáveis e ordenadas por risco/valor; ↔ indica dependência.

### Bloco A — Fechamento formal da migração e decisões pendentes (1–10)
1. Ratificar formalmente este relatório como fechamento da migração de schema (assinatura sua no PR desta auditoria).
2. **Decidir P1**: recuperar da origem as 3 configs de `ai_providers` (Anthropic/Groq/OpenAI) — exportar nomes, endpoints e chaves antes do congelamento, ou declarar descarte definitivo.
3. **Decidir P2**: confirmar `access_level` correto dos 2 admins (`full` × `basic`) e ajustar via UI/migration conforme sua resposta.
4. **Decidir P3**: preencher `global_settings.api_token` ou remover a chave vazia (⚠️APROVAÇÃO se remoção).
5. **Decidir P4**: recriar `channel_connections` “Evolution wpp2” no destino ou formalizar descarte em `DECISIONS.md`.
6. **Executar P5**: exportar os 3 `audit_logs` históricos da origem para `docs/audits/origem-audit-trail-final.json` (somente leitura na origem).
7. Exportar snapshot lógico final da origem (schema + dados) para arquivo de arquivamento morto, guardado fora dos dois projetos.
8. Registrar D8–D12 em `docs/migration/DECISIONS.md` com o resultado das etapas 2–7.
9. Definir e registrar a data-alvo de congelamento da origem (gate 98 do DECISIONS.md) — congelamento em si é a etapa 100.
10. Comunicar à equipe o veredito da auditoria e o cronograma do plano (mensagem curta com link para este doc).

### Bloco B — Prevenção de regressão e governança contínua (11–18)
11. Criar `docs/DB-INVENTORY.md` (pendência do plano anterior): tabela → propósito → status (ativo/parcial/roadmap) → consumidores conhecidos, gerado a partir dos dados desta auditoria.
12. Adicionar regra de PR (template + CONTRIBUTING): criar/alterar objeto de banco exige atualizar `DB-INVENTORY.md` na mesma PR.
13. Agendar `scripts/db-audit` (manifesto+diff) como job semanal no `db-guard.yml` (hoje roda por push), com issue automática em caso de drift.
14. Adicionar ao `db-guard.yml` verificação de que `cron.job` do destino contém exatamente os jobs esperados (lista versionada no repo).
15. Adicionar teste automatizado que falha se `mcp_exec`/`mcp_exec_many` voltarem a ter EXECUTE para `anon`/`authenticated`/`PUBLIC`.
16. Adicionar lint de migration no CI: toda função nova deve ter `SET search_path` e SECURITY DEFINER justificado em comentário.
17. Adicionar verificação semanal de versão de extensões (alerta quando o Supabase atualizar `pg_net` etc., para registrar em DECISIONS).
18. Versionar no repo um manifesto mensal do destino (`scripts/db-audit/snapshots/AAAA-MM.json`) para histórico auditável.

### Bloco C — Segurança imediata no destino (19–30)
19. Anexar `mask_channel_credentials` como trigger BEFORE UPDATE/INSERT em `channel_connections` via migration (proteção escrita e nunca ativada) ↔5.
20. Escrever teste (SQL + app) provando que `credentials` de `channel_connections` nunca chega ao cliente com role `authenticated` (deve vir mascarado ou via view safe).
21. **Decidir destino de `prevent_role_escalation`** (⚠️APROVAÇÃO): remover por migration documentada (como foi feito com `validate_reset_token`) ou manter com `COMMENT` de reserva.
22. Rotacionar a `service_role key` do destino e registrar data/motivo em `SECURITY.md` (chave circulou em ferramentas durante migração e auditorias).
23. Rodar Supabase Security Advisor no destino e triar 100% dos apontamentos (aceitar/corrigir, com registro).
24. Habilitar proteção contra senhas vazadas e revisar política de senha no Auth do destino.
25. Revisar expiração de OTP/refresh token rotation no Auth (paridade com o que a origem tinha configurado).
26. Auditar as 6 edge functions com `verify_jwt=false` (`evolution-webhook`, `whatsapp-webhook`, `gmail-webhook`, `elevenlabs-webhook`, `public-api`, `webhook-diagnostic`): cada uma deve validar assinatura/secret próprio; documentar o mecanismo de cada uma em `docs/WEBHOOK_SECURITY.md`.
27. Smoke test de RLS por papel (admin, supervisor, agent, special_agent) sobre as 15 tabelas mais sensíveis (profiles, messages, contacts, gmail_accounts, password_reset_requests, whatsapp_connections, channel_connections, payment_links, audit_logs, user_roles, permissions, role_permissions, mfa_sessions, passkey_credentials, user_sessions).
28. Avaliar REVOKE de INSERT/UPDATE/DELETE/TRUNCATE de `anon` nas tabelas onde nenhum fluxo anônimo escreve (hoje `anon` tem 7 privilégios × 131 relações, contido só por RLS) — fazer em lote pequeno com teste de regressão (⚠️APROVAÇÃO).
29. Repetir a avaliação 28 para `REFERENCES`/`TRIGGER` de `anon`/`authenticated` (privilégios sem uso legítimo por PostgREST).
30. Documentar em `SECURITY.md` o modelo final de privilégios (quem pode o quê, e por quê).

### Bloco D — Reconectar o bloco geo/IP blocking (31–38)
31. ADR: ponto de aplicação do geo/IP blocking (edge function de login × trigger em `login_attempts` × middleware) — decidir e registrar.
32. Implementar chamada de `is_ip_blocked` no ponto decidido, com `is_ip_whitelisted` como bypass.
33. Implementar `is_country_blocked`/`is_country_allowed` respeitando `geo_blocking_settings.mode`.
34. Ligar a UI de `blocked_ips` e `ip_whitelist` a INSERT/DELETE reais.
35. Ligar a UI de `allowed_countries` e `blocked_countries` idem.
36. Validar a linha default de `geo_blocking_settings` (1 registro) e documentar os modos.
37. Registrar bloqueios efetivos em `security_alerts` (+ contadores para painel).
38. Teste de integração: IP bloqueado → login negado; whitelist → permitido; país bloqueado → negado.

### Bloco E — Autenticação: lockout, MFA, dispositivos, reset (39–46)
39. Ligar `get_own_lockout_status` à UI de login (“conta bloqueada até X”) — o backend de lockout (`record_failed_login`, `is_account_locked`, `clear_login_attempts`) já está ligado.
40. Adotar `get_reset_requests_safe`/`get_own_reset_requests` nas telas de admin/usuário OU aposentá-las com migration documentada (⚠️APROVAÇÃO se remoção) — hoje o fluxo usa GoTrue + `approve-password-reset`.
41. Implementar fluxo MFA usando `mfa_sessions` (tabela pronta, zero código) — enrolar, desafiar, lembrar sessão.
42. Validar E2E o fluxo WebAuthn/passkeys existente (`webauthn` function + `passkey_credentials` + `webauthn_challenges`) num ambiente de staging.
43. Ligar `detect-new-device` ao login (tabela `user_devices` e trigger prontos) com notificação em `notifications`.
44. Implementar painel admin de `login_attempts` (leitura já permitida por policy) com ação de desbloqueio via `clear_login_attempts`.
45. Implementar gestão de sessões (`user_sessions`): listar/encerrar sessões do próprio usuário.
46. Teste E2E de lockout: 5 falhas → bloqueio; expiração → desbloqueio; whitelist → sem lockout.

### Bloco F — Fechar a integração Gmail/E-mail (47–54)
47. Definir o disparo de `gmail-sync` (cron externo × `pg_cron`+`pg_net` × sob demanda na UI) e implementá-lo — banco, cripto (vault) e RPCs `store/get_gmail_tokens` já estão prontos.
48. Ligar `gmail-send` ao compose da UI de e-mail (hoje deployada sem chamador).
49. Confirmar que **nenhum** token Gmail existe em texto puro (colunas `*_encrypted bytea` + vault) com query de verificação no CI.
50. Popular `email_attachments` via `gmail-sync` (tabela nova criada em `20260827210200`, aguardando produtor).
51. Implementar CRUD real de `email_labels` (hoje só policies existem).
52. Adotar `gmail_accounts_safe` no frontend em vez da tabela base.
53. E2E com conta de teste: OAuth → sync de threads → mensagens → anexos → envio → labels.
54. Tratar refresh token expirado com alerta em `security_alerts` + aviso na UI.

### Bloco G — Canais, conexões e Evolution GO (55–62)
55. Adotar as views `whatsapp_connections_safe`/`_agent`/`_public` no código conforme o papel (4 das 7 views hoje sem consumidor).
56. Adotar `get_connection_qr_code`/`get_connection_instance` nos pontos que hoje leem QR/instância direto da tabela, OU aposentar as RPCs (⚠️APROVAÇÃO se remoção).
57. Agendar `connection-health-check` (function pronta) e exibir `connection_health_logs`/`number_reputation` no painel de conexões.
58. Implementar o motor de `channel_routing_rules` (tabela pronta, zero código de roteamento).
59. Ligar `whatsapp_connection_queues` à distribuição de conversas por conexão.
60. Corrigir gaps do adapter Evolution GO mapeados em `GO_GAPS.md`: eventos `SendMessage`, `Receipt` (tradução de formato), `PushName`, `LabelAssociationChat/Message`, `CallTerminate`.
61. Decidir multi-instância: se “Evolution wpp2” voltar (etapa 5), implementar seleção de instância por conversa/campanha.
62. Teste de resiliência: queda da instância → `health_status` atualiza → alerta → reconexão.

### Bloco H — Agendamentos ausentes (63–70)
63. Criar agendamento de `auto-close-conversations` (via `pg_cron`+`pg_net` chamando a function, ou scheduler externo documentado) + registrar em `cron.job` versionado.
64. Agendar `cleanup-rate-limit-logs` (retenção conforme `LGPD-RETENTION-POLICY.md`).
65. Agendar `talkx-scheduler` (motor de campanhas TalkX).
66. Implementar a escalação de SLA descrita em `docs/SLA-ESCALATION-CRON.md` (hoje só documento) usando `sla_rules`/`conversation_sla`.
67. Implementar o dispatcher de `scheduled_messages` (tabela pronta, sem executor).
68. Implementar o executor de `followup_sequences`/`followup_steps`/`followup_executions` (banco completo, código mínimo).
69. Ligar `send-scheduled-report` a `scheduled_report_configs`/`scheduled_reports` com agendamento.
70. Implementar disparo de `reminders` (notificação na hora marcada via realtime/notifications).

### Bloco I — Consolidações e módulos com banco pronto (71–88)
71. **Decidir** `crisis_room_alerts` × `warroom_alerts` (⚠️APROVAÇÃO): consolidar num único módulo ou implementar o war-room usando ambas com propósitos distintos; documentar no DB-INVENTORY.
72. **Decidir** `webhook_rate_limits` × `rate_limit_configs`/`rate_limit_logs` (⚠️APROVAÇÃO): consolidar ou ligar `webhook_rate_limits` ao pipeline de webhooks.
73. Ligar `send-rate-limit-alert` ao excedente de `rate_limit_logs` (function pronta, gatilho ausente).
74. Implementar o produtor de `link_preview_cache_metrics` (registrar hit/miss do `fetch-link-preview`) — policy de INSERT já existe.
75. Ligar `voice-copilot-action` + `voice_command_logs` ao copiloto de voz, e `elevenlabs-agent-token` ao `voice-agent`.
76. Validar a ponte Sicoob ponta a ponta (`sicoob-bridge`, `sicoob-bridge-reply`, `sicoob_contact_mapping`, secret no vault, `chat-bridge` no projeto externo `allrjhkpuscmgbsnmjlv`).
77. Implementar UI de favoritos de audio memes usando `fn_toggle_user_meme_favorite` + `fn_list_audio_meme_categories` (órfãs).
78. Implementar runner de A/B de campanhas (`campaign_ab_variants` pronta, zero código de sorteio/medição).
79. Implementar o emissor de `meta_capi_events` (Conversions API) ou marcar roadmap no inventário.
80. Ligar `payment_links` a um provedor de pagamento real (tabela e policies prontas).
81. Implementar catálogo de `products` na UI (integração com `promogifts-catalog` já deployada).
82. Implementar registro de `contact_purchases` (histórico de compras no CRM 360).
83. Implementar timeline de `deal_activities` no funil (`sales_deals` já tem uso).
84. Implementar módulo de `training_sessions` (gamificação/treinamento) ou marcar roadmap.
85. Implementar upload/consulta de `knowledge_base_files` (artigos já têm uso; arquivos não).
86. Implementar disparo e coleta de `nps_surveys` (CSAT já tem auto-config; NPS está órfão de fluxo).
87. Implementar leitura/restauração de `entity_versions` na UI (versionamento grava mas ninguém lê).
88. Revisar as 10 tabelas de acoplamento frágil do relatório anterior (1 único `.from()`) e elevar cobertura de uso/testes: `allowed_countries`, `blocked_countries`, `campaign_contacts`, `chatbot_executions`, `deal_activities`, `entity_versions`, `followup_executions`, `followup_steps`, `queue_positions`, `sales_pipeline_stages`.

### Bloco J — Performance e manutenção contínua (89–94)
89. Após 30 dias de produção, revisar `pg_stat_user_indexes` e listar índices nunca usados dos 128 novos — **relatório apenas**; qualquer DROP é ⚠️APROVAÇÃO.
90. Validar as métricas do tuning de autovacuum (`20260827130500_vacuum_maintenance_m05`) contra o crescimento real de `messages`/`contacts`.
91. Estabelecer revisão mensal de `pg_stat_statements` (top 10 por tempo total) com registro em `docs/audits/`.
92. Definir gatilho de particionamento futuro de `messages` (ex.: > 5 milhões de linhas ou > 10 GB) e o plano de execução — só planejamento agora.
93. Monitorar bloat (`db_table_bloat`) trimestralmente e agendar `VACUUM (FULL)`/`pg_repack` se exceder limiar definido.
94. Executar um drill completo de backup/restore conforme `BACKUP-RECOVERY-STRATEGY.md` num projeto descartável e cronometrar o RTO.

### Bloco K — Observabilidade, documentação e encerramento (95–100)
95. Completar `COMMENT ON TABLE` nas 124 tabelas (hoje 2 tabelas e 4 colunas comentadas) com propósito + status, sincronizado com o DB-INVENTORY.
96. Construir painel de observabilidade interno: `query_telemetry`, `performance_snapshots`, `connection_health_logs`, `link_preview_cache_metrics`, `ai_usage_logs` (tabelas prontas, sem leitor).
97. Regenerar `src/integrations/supabase/types.ts` e adicionar check no CI que falha quando os types divergirem do schema real (inclui remoção de types de objetos dropados, ex.: `validate_reset_token`).
98. Documentar em `docs/runbooks/` o runbook desta auditoria (queries do §10 + scripts/db-audit) como procedimento trimestral padrão.
99. Rodar auditoria de RLS orientada a papel (ferramenta `security-review` + smoke da etapa 27) e publicar resultado em `docs/audits/`.
100. **Congelar a origem** (⚠️APROVAÇÃO explícita): após 2–7 concluídos e período de observação sem regressão, pausar o projeto `vpkmqeumtxhrwgawxdrl`, revogar chaves, registrar em DECISIONS.md e encerrar formalmente a migração.

---

## 10. Anexo — verificação reprodutível

```sql
-- 1) Assinatura de colunas por tabela (rodar nos dois bancos e diffar)
SELECT table_name, count(*),
  md5(string_agg(column_name||'|'||data_type||'|'||udt_name||'|'||is_nullable||'|'||coalesce(column_default,'~'), ';' ORDER BY column_name))
FROM information_schema.columns WHERE table_schema='public' GROUP BY 1 ORDER BY 1;

-- 2) Set-diff de constraints/índices/policies/triggers por (tabela|nome|hash)
--    ver scripts/db-audit/ (manifest.sql + diff.mjs) — mesmo resultado desta auditoria:
--    cons 0 faltando/0 drift · idx 0/0 · pol 0/0 · trg 2 explicados/0 drift

-- 3) Migrations: repo × destino (esperado: vazio nos dois sentidos)
--    ls supabase/migrations/*.sql → 277 versões; EXCEPT bidirecional contra
--    supabase_migrations.schema_migrations → [] / []

-- 4) FKs de coluna única sem índice (esperado hoje: 0 linhas)
SELECT c.relname||'.'||a.attname
FROM pg_constraint co
JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN unnest(co.conkey) k(att) ON true
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att
WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum);

-- 5) Identidade dos usuários migrados (mesmo hash nos dois bancos)
SELECT md5(string_agg(id::text,',' ORDER BY id)) FROM auth.users;
-- 28/08/2026: ed0e05d723b9b2b512c41e9ae59df25e em AMBOS

-- 6) Edge functions: probe não-invasivo
-- curl -X OPTIONS https://<ref>.supabase.co/functions/v1/<nome> → 200 = deployada; 404 = ausente
```

---

*Auditoria executada em 28/08/2026 via MCP (origem read-only por guardrail; destino somente SELECT).
Nenhum objeto criado, alterado ou removido em nenhum dos dois bancos.*
