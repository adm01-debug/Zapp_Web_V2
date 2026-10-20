# Multiplix — Estado inicial (medições de 2026-09-26)

> Base para o plano de 200 etapas. Tudo abaixo foi medido nesta data por query direta nos dois bancos e por leitura de arquivos em `main` @ `b263550`. Números mudam; a data importa.

## 1. Bancos envolvidos

| Banco | Projeto | Papel no Multiplix |
|---|---|---|
| ZAPP Web V2 (self-hosted, VPS AtomicaBR) | — | Conversas, mensagens, conexões WhatsApp, TalkX, fila do Multiplix, supressão |
| Singu / Gestão de Clientes (Supabase Cloud) | `pgxfvjmuubtbowutlide` | Empresas, papéis (cliente/fornecedor/transportadora), ramo, UF, contatos e telefones |

Decisão de banco único já tomada (ver memória do projeto: consolidar o ZAPP no Singu). Até lá, o Multiplix lê o Singu por ponte (ADR-007 D1).

## 2. ZAPP — o que existe e o que não serve

| Medição | Valor | Leitura |
|---|---|---|
| `contacts` | 3.099 | todos com telefone |
| `contact_type` | 3.099 × `cliente` | não distingue fornecedor/transportadora |
| `company` preenchida | **0** | sem empresa |
| `state` preenchida | **0** | sem UF |
| `tags` preenchidas | 3 | irrelevante para segmentar |
| `consent_status` | 3.099 × `unknown` | sem dado de consentimento |
| `group_category` | 3.099 × NULL | — |
| `talkx_blacklist` | 0 linhas | mecanismo existe ("PARE para sair" em `talkx_settings`), nunca acionado |
| `whatsapp_connections` | tabela + `_agent`, `_public`, `_safe` (views) + `whatsapp_connection_queues` | seleção de conexão por fila/departamento é possível |
| `crm_contact_links`, `crm_sync_outbox` | existem | vínculo contato Singu ↔ contato ZAPP e outbox de sync |
| Áudio enviado por agente (`messages`) | 201 (159 `sent`, 25 `delivered`, 16 `read`, 1 `deleted`) · URLs `.ogg` | PTT com OGG funciona em produção |
| `talkx_settings` | `daily_limit_per_connection=500`, `default_speed_profile=balanced`, `reply_window_hours=72`, `optout_autoreply="PARE para sair"`, `ai_insights=false` | política de ritmo já existe |
| `talkx_campaigns` defaults | intervalo 5–15 s · digitação 1,5–4 s · `speed_profile=moderate` · `America/Sao_Paulo` | idem |

**Conclusão:** o banco do ZAPP não tem o público do Multiplix. Tem a infraestrutura de envio, supressão, ritmo e retorno.

## 3. Singu — o público existe

### Empresas (`companies`, `deleted_at IS NULL`)

| Medição | Valor |
|---|---|
| Ativas | 57.675 |
| `is_customer` | 55.813 |
| `is_supplier` | 754 |
| `is_carrier` | 114 |
| Mais de um papel | 388 |
| `ramo_atividade` preenchido | 50.698 (566 valores distintos) · ~6.977 "não informado" |
| `industry` preenchido | 50.698 (espelho de `ramo_atividade`) |
| `state` na própria linha | 31.064 |
| UF em `company_addresses.is_primary` | 55.750 |
| `company_cnaes` | 588 linhas (1.332 CNAEs no catálogo) — cobertura baixa, não usar como ramo |
| `suppliers.ramo_atividade` / `categoria` | **0** preenchidos — o ramo canônico está em `companies.ramo_atividade` |

Colunas úteis de `companies`: `id, is_customer, is_supplier, is_carrier, nome_crm, razao_social, nome_fantasia, cnpj, ramo_atividade, grupo_economico(_id), status, deleted_at, user_id (carteira), search_vector, lead_status, tags_array`.

### Pessoas e destinos

| Medição | Valor |
|---|---|
| `contacts` ativos | 4.748 |
| com `company_id` | 2.945 |
| com `whatsapp` na própria linha | 2.108 |
| `contact_phones` | 3.141 (todas com `numero_e164`; `is_whatsapp`, `is_primary` disponíveis) |
| `contacts.last_interaction_at` nos últimos 180 dias | **0** — campo não é alimentado |
| `contact_preferences` | 0 linhas |
| `company_phones` | 50.634 (`numero_e164`, `is_whatsapp`, `is_primary`, `departamento`) |
| `smart_segments` | 4 (`filters`, `entity_type`, `is_dynamic`, `cached_count`) |

### Cobertura por papel (o número que decide o D4 da ADR-007)

| Papel | Empresas | Com pessoa vinculada (qualquer) | Com pessoa + WhatsApp | Com telefone de empresa | Telefone de empresa já marcado WhatsApp |
|---|---|---|---|---|---|
| Fornecedor | 754 | 145 | **84** | 285 | 30 |
| Transportadora | 114 | 76 | **58** | 53 | — |

### Permissão

Tabelas `user_roles` (4 col.) e `role_permissions` (4 col.) existem no Singu; `companies.user_id` é a carteira. Matriz perfil × papel fica para E007.

## 4. Ponte atual ZAPP → Singu (GATE C)

5 RPCs do Singu com `GRANT EXECUTE TO anon` desde 27/08/2026: `get_contact_360_by_phone`, `get_contact_intelligence_by_phone`, `get_companies_by_phones_batch`, `sync_interaction_from_zapp`, `search_contacts_advanced`. Documentado em `docs/crm-external-grants.md` como pendência. O Multiplix não constrói sobre elas (ADR-007 D1); o rollout fecha o gate (E195).

## 5. Repositório — o que já existe para reaproveitar

| Peça | Onde | Uso no Multiplix |
|---|---|---|
| Envio humanizado, claim/lease, snapshot, backoff, `outcome_unknown` | `supabase/functions/talkx-send/index.ts` + RPCs `*_talkx_recipient*`, `transition_talkx_campaign` | extrair para `_shared/messaging/` (Fase 3) e parametrizar (Fase 5) — detalhado em `CANAL.md` §2 |
| Tradução v2 → GO, incl. PTT (`type: 'ptt'`), presença `recording`, `/user/check` | `_shared/evolution-go-routes.ts` | adaptador de canal (E046) |
| Janela de horário / timezone | `_shared/talkx-window.ts` | E086 |
| Ack de entrega/leitura e resposta por `external_id` | `evolution-webhook` + `_shared/talkx-reply.ts` | E093/E094 |
| Agendamento | `pg_cron` `talkx-scheduler-1min` → edge `talkx-scheduler` | E086/E088 |
| Supressão | `talkx_blacklist` + `talkx_recipient_is_suppressed` | E044/E096 |
| Mídia privada + signed URL 300 s | `_shared/evolution-api-proxy.ts` (`resolvePrivateBucketUrl`) | E045/E104 |
| TTS | `elevenlabs-tts` (JWT, 20/min/usuário, MP3) | E103 — contrato em `CANAL.md` §3 |
| Gravador de áudio do Chat | `public/vendor/lamejs-1.2.1.min.js` + componente do Chat | E111 |
| Entrada de módulo | `lazyViews.ts` (padrão do `TalkXView`) | E115 |
| Tokens de design | `src/styles/tokens.css`, `docs/design/ZAPP_DARKBLUE_PREMIUM_TOKENS.css`, `docs/design-system/glows.md` | E118/E119 |
| Padrão de migration | DDL via `db_query` + ledger `supabase_migrations.schema_migrations` + arquivo em `supabase/migrations/` + PR aberta (PRs #804/#805) | Fases 1–2 |

## 6. PRs abertas no momento da medição

| PR | Título | Toca o escopo do Multiplix? |
|---|---|---|
| #791 | chore(db): sincronizar artefatos derivados do banco | não |
| #802 | fix(testes): inclui tests/contracts no vitest run do CI | não (padrão de teste a seguir em E072) |
| #804 | fix(dashboard): revoga EXECUTE de anon/PUBLIC nas RPCs do Dashboard | não |
| #805 | fix(dashboard): XP de gamificação | não |
| #807 | fix(dashboard): label KPI | não |

Re-checar antes de cada branch nova (E002).

## 7. Pendências de descoberta (Fase 0)

- **E001** grafo (`graphify`) — não rodado nesta sessão.
- **E007** matriz de permissão (perfil × papel × escopo) — tabelas localizadas, matriz não escrita.
- **E091** MP3/Opus → PTT — hipótese e roteiro de teste em `CANAL.md` §5.
