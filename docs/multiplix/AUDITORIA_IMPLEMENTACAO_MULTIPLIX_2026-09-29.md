# Auditoria de implementação — Multiplix (2026-09-29)

**Objeto:** `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md` (v1.1) × o que existe de fato em `main` @ `a0002bb`, no banco oficial do ZAPP (`tnnnlkbymytvtqngbbqh`) e nas edge functions deployadas.
**Sucessor:** `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`.

## 1. Método e limites

- 3 auditores independentes (backend/edges, front, schema/CI/docs), cada um com a lista de etapas da sua área e a instrução de devolver `FEITO | PARCIAL | AUSENTE` com evidência `arquivo:linha` — sem evidência, a etapa é `AUSENTE`.
- Cruzamento com o banco vivo: catálogo de tabelas/colunas/enums/funções/policies/índices/triggers/grants/cron/publicação realtime, ledger `supabase_migrations.schema_migrations`, `talkx_settings`, `permissions`/`role_permissions`, contagem de linhas. Definições de `claim_multiplix_recipient` e `trigger_pending_multiplix_dispatches` lidas com `pg_get_functiondef`.
- Edges: `multiplix-send` e `multiplix-audience` respondem (`functions_ping` 200); `multiplix-audience` recusa service-role (`401 Invalid or expired token`) — correto, mas impede testar as RPCs do Singu a partir daqui.
- PRs abertas conferidas (7): nenhuma toca `multiplix*`. Duas branches remotas não mergeadas (`claude/fix-multiplix-send-auth-270927-1530`, `claude/feat-multiplix-auth-tests-260928-1900`) carregam o mesmo conteúdo que já entrou em `main` por `fb84831` — lixo de branch, não trabalho perdido.
- **Não verificável nesta sessão:** o banco do Singu (`pgxfvjmuubtbowutlide`) não tem MCP carregado. As 5 RPCs `multiplix_*` que a edge chama **não têm SQL em lugar nenhum do repo** — só existem, se existirem, criadas à mão no banco. Tudo que depende do corpo delas (guard, `deleted_at`, escopo, `is_primary`, `search_vector`) ficou como `PARCIAL` pela chamada, nunca `FEITO`.

## 2. Resumo executivo

| | FEITO | PARCIAL | AUSENTE |
|---|---|---|---|
| **200 etapas** | **11 (5,5%)** | **74 (37%)** | **115 (57,5%)** |

O plano marca `0/200`; o real é `11/200` feitos e `74` começados. O que está em produção é um **MVP de disparo de texto por empresa** (busca no Singu → selecionar até 500 empresas → 1 textarea → cron a cada 2 min → envio com claim/lease/backoff → monitor com realtime). Nunca foi usado: `multiplix_dispatches` e `multiplix_recipients` têm **0 linhas**.

O que o plano exigia e não existe: público como regra salva, blocos (voz IA / áudio gravado / arquivo), fila por item×bloco, prévia por destinatário, aptidão/supressão, congelamento na confirmação, agendamento funcional, voz, retornos, feature flag, pilotos, fechamento do GATE C.

**Portões:** nenhum dos 15 portões (F0–F14) fecha. F0 falha em E004 (sem `multiplix_max_recipients_default`, sem "conexão em risco"); F1 falha em E024/E025; F2 em E039; daí em diante todos.

### Por fase

```
Fase  0  [x]  5 / [~] 4 / [ ] 1  (10)     Fase  8  [x] 1 / [~] 7 / [ ]  2  (10)
Fase  1  [x]  2 / [~] 8 / [ ] 6  (16)     Fase  9  [x] 1 / [~] 5 / [ ]  8  (14)
Fase  2  [x]  0 / [~] 8 / [ ] 6  (14)     Fase 10  [x] 0 / [~] 2 / [ ] 10  (12)
Fase  3  [x]  0 / [~] 3 / [ ] 9  (12)     Fase 11  [x] 0 / [~] 2 / [ ]  8  (10)
Fase  4  [x]  0 / [~]10 / [ ]10  (20)     Fase 12  [x] 2 / [~] 1 / [ ]  7  (10)
Fase  5  [x]  0 / [~] 9 / [ ] 7  (16)     Fase 13  [x] 0 / [~] 6 / [ ]  2   (8)
Fase  6  [x]  0 / [~] 5 / [ ] 5  (10)     Fase 14  [x] 0 / [~] 3 / [ ]  7  (10)
Fase  7  [x]  0 / [~] 1 / [ ]15  (16)     Fase 15  [x] 0 / [~] 0 / [ ] 12  (12)
```

## 3. Inventário do que existe (medido)

**Banco ZAPP (vivo):**
- Tabelas: `multiplix_dispatches` (30 col.), `multiplix_recipients` (22 col.), `multiplix_blocks` (11 col.). **Faltam 6 das 9 do plano** (`delivery_items`, `events`, `audiences`, `audience_members`, `voice_assets`, `voice_grants`).
- Enums: **nenhum** (`status`/`block_type` são `text` + CHECK, valores em inglês: `draft/scheduled/sending/paused/completed/failed/cancelled`; `pending/sending/sent/delivered/failed/skipped/outcome_unknown`).
- RLS: habilitada nas 3, **FORCE em nenhuma**. Policies de `dispatches`/`recipients` = `TO authenticated` + `is_admin_or_supervisor`; policies de `blocks` = `public`, sem gate de staff.
- Grants: **`anon` tem SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas 3 tabelas** (TRUNCATE não passa por RLS). `authenticated` idem.
- RPCs (13, todas `SECURITY DEFINER`, EXECUTE só `service_role`): `transition_`, `claim_`, `mark_..._dispatch_started`, `persist_..._snapshot`, `record_..._sent`, `record_..._delivered`, `complete_`, `release_`, `reschedule_`, `complete_..._if_drained`, `get_multiplix_cron_secret`, `trigger_pending_multiplix_dispatches`.
- Cron: `multiplix-send-trigger` `*/2 * * * *` → `trigger_pending_multiplix_dispatches()` → `net.http_post` com URL fixa do projeto e `zapp_anon_key` como Bearer, só `status='sending'`, até 10 dispatches por tick.
- Realtime: `multiplix_dispatches` (todas as colunas, inclusive `message_template`/`audience_filters`) e `multiplix_recipients` (sem `destino_e164`/`personalized_message`/`delivery_claim_token`).
- Permissões: 5 `multiplix.audience.*` no catálogo, **0 linhas em `role_permissions`**. `talkx_settings` sem chave `multiplix_*`.
- Ledger: 10 versions `multiplix` registradas, paridade com os 10 arquivos em `supabase/migrations/`.
- Dados: 0 dispatches, 0 recipients.

**Edges (deployadas, `verify_jwt=true`):** `multiplix-audience` (213 linhas — JWT do ZAPP → escopo por `user_has_permission`/`is_admin` → chama 5 RPCs do Singu com `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`, teto 500 IDs no resolve, timeout, rate limit 60/min sem `Retry-After`) e `multiplix-send` (483 linhas — fork do `talkx-send`; auth service-role/`x-cron-secret`/JWT admin-supervisor; ações start/pause/cancel; loop por destinatário com claim/lease 90 s, snapshot, `outcome_unknown` em timeout, backoff 30 s/2 min/10 min). Não existem `multiplix-dispatch`, `multiplix-dispatch-worker`, `multiplix-voices`, `multiplix-prepare-voice`.

**Front:** `MultiplixView.tsx` (353) — coluna única: recentes (8), filtros (papel único, ramo select simples, UF), tabela paginada de 50, "selecionar todas" até 500, botão "Criar disparo"; `MultiplixComposerDialog.tsx` (138) — nome + 1 textarea + chips `{{empresa}}`/`{{saudacao}}` + AlertDialog; `MultiplixMonitor.tsx` (210) — realtime + polling 5 s, pausar/retomar/cancelar, lista de até 500 destinatários. Hooks em `src/hooks/integrations/`. Entrada por `lazyViews.ts` + `?view=multiplix`, nav por `STAFF_ROLES` (sem permissão nomeada). Zero testes de componente/e2e.

**Docs:** `ESTADO_INICIAL.md`, `CANAL.md`, `PERMISSOES.md`, `DESIGN_TOKENS_MAP.md`, dois `ADR-007` (divergentes, nenhum no índice `docs/adr/README.md`). Não existem `PONTE_SINGU.md`, `SCHEMA.md`, `ARQUITETURA.md`, `CHANGELOG_MULTIPLIX.md`, `COMPONENTES.md`, `docs/runbooks/multiplix-incidentes.md`, handoff.

## 4. Achados críticos (ordem de gravidade)

Cada item traz a evidência e a etapa do plano de 100 que o fecha (`Fxx`).

### Segurança

1. **`anon` com grant total (inclusive TRUNCATE) nas 3 tabelas** — `schema-manifest.json` `relation_grants`, `scripts/db-audit/grants-baseline.json:84-86`; confirmado ao vivo. Viola E037. → `F01`
2. **Sem `FORCE ROW LEVEL SECURITY`** em nenhuma tabela do módulo (nem do repo). → `F02`
3. **`multiplix_blocks` fora do hardening:** 4 policies `public`, sem `is_admin_or_supervisor` (`20260927280000:30-70`). → `F03`
4. **Migration desfaz a anterior:** `20260927130001` põe `TO authenticated`; `20260927210000` recria 6 policies de escrita sem `TO` (volta a `public`). Estado vivo é `authenticated` (aplicação fora de ordem); um replay limpo diverge. Cabeçalho da 130001 diz "preserving exact USING" e não preserva. → `F04`
5. **Dono staff edita a tabela direto, fora das RPCs:** UPDATE de `dispatches` sem restrição de coluna/status (`status='sending'` dribla `transition_multiplix_dispatch`; `message_template` editável durante o envio e o worker relê a cada item — `multiplix-send/index.ts:225`); UPDATE de `recipients` permite `sent→pending` (reenvio) e trocar `destino_e164`; INSERT de recipients não exige `draft`. Não há trigger de mutabilidade como `enforce_talkx_campaign_mutability`. → `F05`
6. **IDOR entre staff:** qualquer admin/supervisor inicia/pausa/cancela dispatch de outro (`multiplix-send/index.ts:103-111,142-143`, sem checar `created_by`). Bônus: `.in('role',[admin,supervisor]).maybeSingle()` devolve 403 a quem tem as duas roles. → `F06`, `F07`
7. **Destinatários e telefones vêm do navegador:** `useMultiplixDispatches.ts:139-146` insere `destino_e164`/`company_name_snapshot` do front; o servidor nunca revalida contra o Singu nem contra o escopo — staff manda para qualquer número. O front ainda descarta `elegibilidade` (`MultiplixComposerDialog.tsx:47-52`): `fora_do_escopo`/`destino_invalido` entram e contam em `total_recipients`. → `F08`, `F44`
8. **Supressão ignorada, contra o ADR-007 D3:** `multiplix-send/index.ts:5-6` e `20260926180000:9-11` declaram "sem lista de supressão". Quem respondeu "PARE" numa Campanha continua recebendo Multiplix. → `F09`
9. **Escopo por parâmetro confiado:** as RPCs do Singu recebem `p_scope_permissions`/`p_scope_vendedor_email` de quem tiver a service key (`multiplix-audience/index.ts:160-161`) — qualquer consumidor de `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` pode pedir `admin`. E as RPCs não estão versionadas: guard, `deleted_at`, escopo, nada auditável. → `F21`, `F22`
10. **Realtime publica `message_template` e `audience_filters`** de `dispatches` (o strip de PII foi só em `recipients`). → `F15`
11. **`elevenlabs-tts/index.ts:26` loga 50 caracteres do roteiro** (apontado em `CANAL.md` §3, não corrigido). → `F16`
12. **GATE C continua aberto:** 5 RPCs do Singu com `GRANT EXECUTE TO anon` (`docs/crm-external-grants.md:12-16,23`). → `F97`

### Correção / operação

13. **Item preso para sempre:** o loop dura o público inteiro (~10 s/destinatário) numa invocação de edge → estoura o wall-clock. Se morrer entre `mark_..._dispatch_started` e `record/complete`, o item fica `sending` para sempre (claim exige `provider_dispatch_started_at IS NULL`, `20260926180000:145`), sem sweeper, `complete_if_drained` nunca conclui, cron reinvoca a cada 2 min indefinidamente. → `F11`
14. **Agendamento não dispara:** cron só pega `status='sending'` (confirmado ao vivo em `trigger_pending_multiplix_dispatches`); `scheduled`/`scheduled_at` nunca promovem. → `F10`
15. **Pausa por janela não retoma:** worker auto-pausa fora da janela (`index.ts:232,445`) e o cron não retoma `paused`. → `F10`
16. **`claim_multiplix_recipient` ignora `retry_after`** (confirmado ao vivo): o filtro existe só na edge (`index.ts:203`); um worker concorrente pode pegar item em backoff. → `F12`
17. **Parcial marcado como sucesso:** `complete_multiplix_dispatch_if_drained` marca `completed` com `failed`/`outcome_unknown` (`20260926180000:436-450`); não existe `concluido_com_falhas`. → `F13`
18. **Cancel não encerra pendentes** (ficam `pending`) e sem log explícito (`index.ts:126-136`). → `F14`
19. **`outcome_unknown` nunca reconciliado** (sem `external_id`, o ack não casa). → `F58`
20. **Cron com fan-out sem teto:** até 10 dispatches simultâneos na mesma conexão, URL do projeto fixa no SQL, anon key como Bearer; ignora `daily_limit_per_connection=500` e o teto de 200/dispatch (ADR D2). → `F17`, `F55`
21. **Sem UNIQUE `(dispatch_id, destino_e164)`** → envio duplicado ao mesmo número (E059). → `F31`
22. **`multiplix_blocks` é tabela morta:** o worker usa só `message_template`; nenhum código em `src/` ou `supabase/functions/` lê a tabela (comentário da migration `280000:3-5` sugere o contrário). Mídia de documento vai sem `fileName` (`index.ts:352`). → `F33`, `F56`
23. **Personalização contraria E043/E063:** `{{empresa}}` nulo vira `''` em silêncio (`index.ts:26`) e o teste `index.test.ts:20-23` consagra isso; `{{nome}}`/`{{nome_completo}}` não existem. → `F37`
24. **Fork em vez de `_shared`:** `multiplix-send` duplica `timingSafeStringEqual`, `getGreeting`, `randomBetween`, `sleep`, `getMediaEndpoint` e o loop do `talkx-send`. Toda correção do TalkX tem de ser portada à mão (Fase 3 inteira ausente). → `F36–F43`
25. **Criação não transacional:** dispatch + recipients em 2 chamadas PostgREST do front (`useMultiplixDispatches.ts:129-148`); falha no meio deixa dispatch com `total_recipients>0` e sem destinatários; sem idempotência (2 POSTs = 2 dispatches). → `F44`, `F51`
26. **Teto silencioso de 500** no back (`multiplix-audience/index.ts:41`) e no front (`MultiplixView.tsx:40`) — E058 é bloqueante. → `F27`, `F47`
27. **Seleção zera ao trocar filtro** (`MultiplixView.tsx:86`, `setSelected(new Set())`) — E131 é bloqueante. → `F73`
28. **Tokens inexistentes:** `border-[--zapp-border]`/`bg-[--zapp-surface-1]` (`MultiplixView.tsx:172,193,260,316,333`) só existem em `docs/design/*.css`, não em `src/styles/tokens.css` → fundo transparente e borda em `currentColor`. → `F70`
29. **Monitor sem estado de erro** (skeleton eterno se RLS negar, `MultiplixMonitor.tsx:108`); `isDraft` inclui `scheduled` e expõe "Iniciar" (burla agendamento, `:117-118`); recipients `limit(500)` sem paginação. → `F80`
30. **Ledger/guard:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-26.md:91-95` registra drift de conteúdo em `20260926180000` com DB Live Guard vermelho. Confirmar ao vivo antes de reconciliar. → `F18`

### Documentação

31. **Dois `ADR-007` em conflito:** `ADR-007-multiplix-ponte-singu.md` (curta, "Decidido") × `ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` (longa, "Aceito", citada no Adendo do plano e coerente com o código). Divergem em: nome do secret (`SINGU_SERVICE_KEY` × reuso de `EXTERNAL_SUPABASE_*` — o código usa o segundo), "sem parâmetro novo" × teto 200 + "conexão em risco", telefone da empresa só B2B × sem restrição. Nenhum no índice `docs/adr/README.md`. → `F19`
32. **E004 incompleto:** decisão registrada, mas `talkx_settings.multiplix_max_recipients_default` não existe e "conexão em risco" não foi implementada. → `F17`, `F60`
33. **E007 sem matriz perfil×papel** e sem perfil de operador (Adendo item 5); `role_permissions` vazio → só admin usa o módulo. → `F25`
34. **Plano marcado 0/200** apesar de 11 feitos e 74 parciais — corrigido nesta PR (checkboxes + bloco de progresso).

## 5. Matriz etapa a etapa

Legenda: `[x]` FEITO · `[~]` PARCIAL · `[ ]` AUSENTE. "Fecha em" = etapa do plano de 100.

### Fase 0 — Descoberta e decisões
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E001 | [ ] | `graphify-out/` não existe (`.gitignore:114`) | grafo não gerado | F99 |
| E002 | [x] | `ESTADO_INICIAL.md:99-109` | re-checagem por branch sem evidência | — |
| E003 | [x] | ADR-007 (2 arquivos) | secret diverge entre as ADRs | F19 |
| E004 | [~] | ADR D2; defaults em `161000:21-24` | sem `multiplix_max_recipients_default`; sem "conexão em risco" | F17, F60 |
| E005 | [x] | ADR longa D3 | supressão não implementada no worker | F09 |
| E006 | [x] | ADR D4 | ADRs divergem (só B2B ou não) | F19 |
| E007 | [~] | `PERMISSOES.md:60-73`; seed `150000` | sem matriz perfil×papel; `role_permissions` vazio; sem perfil operador | F25 |
| E008 | [x] | `CANAL.md` §1 | PTT/Opus pendente (E091) | F63 |
| E009 | [~] | `CANAL.md` §3 | `elevenlabs-webhook` não documentado | F66 |
| E010 | [~] | `ESTADO_INICIAL.md`, `DESIGN_TOKENS_MAP.md` | receita de módulo só cobre `lazyViews` | F94 |

### Fase 1 — Ponte Singu
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E011 | [~] | `multiplix-audience/index.ts:155-164` | SQL da RPC não versionado; sem prova de contagem | F21, F23 |
| E012 | [~] | `:167-180` | idem; UI não usa o total para materializar | F21, F47 |
| E013 | [~] | `:40-45,181-192` | teto 500 (plano: 1.000 < 1 s); sem papéis/`last_interaction_at` | F27 |
| E014 | [~] | `useMultiplixAudience.ts:27-28` (`destino_origem`) | regra dos 4 ramos só na RPC, sem teste | F21, F24 |
| E015 | [~] | `:96-127` | aplicação na RPC não verificável; `role_permissions` vazio | F22, F25 |
| E016 | [ ] | nenhuma | sem filtro `deleted_at`/`is_duplicate` verificável | F21 |
| E017 | [~] | `:143-146` | "Não informado"/ordenação não verificáveis | F21 |
| E018 | [~] | `:147-150` | definição não versionada | F21 |
| E019 | [x] | `deploy-functions.yml:145-146`; `:76-83` | reusa `EXTERNAL_SUPABASE_*` (ADR curta diz outro nome) | F19 |
| E020 | [x] | `:66-121,135-137` | falta teste de escopo forjado | F24 |
| E021 | [ ] | só `staleTime` no front | sem cache na edge | F26 |
| E022 | [ ] | nenhuma | `crm_contact_links` não usado | F84 |
| E023 | [~] | `motivo_inclusao` por linha | sem frase legível da consulta | F49 |
| E024 | [ ] | nenhuma | sem teste de escopo 3 perfis | F24 |
| E025 | [ ] | nenhuma | sem `EXPLAIN`/índices | F28 |
| E026 | [ ] | nenhuma | sem `PONTE_SINGU.md`; GATE C não atualizado | F29 |

### Fase 2 — Modelo de dados
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E027 | [ ] | `161000:18-19,53-54` (text CHECK) | nenhum enum; nada em `src/types/` | F30 |
| E028 | [~] | `161000:12-43` | `created_by` nullable; sem departamento/origem/versões | F31 |
| E029 | [~] | `280000:7-20` | sem jsonb versionado/asset_id/hash; worker ignora | F33 |
| E030 | [~] | `161000:45-65` | sem `singu_contact_id`/eligibility/motivo/versão; sem UNIQUE destino | F31 |
| E031 | [ ] | lease em `recipients` | sem `delivery_items`/`idempotency_key` | F32 |
| E032 | [ ] | nenhuma | sem `events` append-only | F34 |
| E033 | [ ] | nenhuma | sem `audiences` | F35 |
| E034 | [ ] | nenhuma | sem `voice_assets`/`voice_grants` | F64 |
| E035 | [~] | `161000:67-70` | sem índice parcial de fila, `(owner, created_at)`, `(dispatch, status)` | F32 |
| E036 | [~] | RLS em 3/8, sem FORCE | escopo por dono/admin, não departamento | F02–F05 |
| E037 | [~] | RPCs sem anon; tabelas com anon total | `anon` SELECT…TRUNCATE nas 3 | F01 |
| E038 | [~] | 10 arquivos versionados | drift documentado em `180000`; merge sem PR aguardando | F18 |
| E039 | [ ] | nenhum `*.test.sh` multiplix | sem teste negativo de RLS | F20 |
| E040 | [~] | `types.ts` tem `multiplix_*` | sem `SCHEMA.md` | F94 |

### Fase 3 — Serviços compartilhados
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E041 | [ ] | `_shared/` sem `messaging/` | módulo não existe | F36 |
| E042 | [ ] | `multiplix-send:295` `replace(/\D/g)` | não usa `normalizePhone` de `evolution-helpers.ts` | F38 |
| E043 | [~] | `multiplix-send:24-35` | local, 2 placeholders, `''` silencioso | F37 |
| E044 | [ ] | `:5-6` | sem `talkx_blacklist`/classes | F09, F39 |
| E045 | [~] | `:214-220` | só reassina URL | F40 |
| E046 | [ ] | `:298-363` `evoFetch` direto | sem adaptador | F41 |
| E047 | [~] | `:399-416` | backoff só pré-POST; sem classificação | F42 |
| E048 | [ ] | nenhuma | sem `correlation_id`; TTS loga roteiro | F16, F43 |
| E049 | [ ] | `talkx-send` intocado | não refatorado | F43 |
| E050 | [ ] | nenhuma | sem regressão porque não houve refatoração | F43 |
| E051 | [ ] | nenhuma | conexões sem capacidades | F60 |
| E052 | [ ] | nenhuma | sem `ARQUITETURA.md` | F94 |

### Fase 4 — API de domínio
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E053 | [ ] | nenhuma | sem `multiplix-dispatch` | F44 |
| E054 | [~] | `useMultiplixDispatches.ts:123-136` | PostgREST direto, sem API | F44 |
| E055 | [~] | `280000:7-19` | sem API/reordenação; worker ignora | F45 |
| E056 | [ ] | nenhuma | sem versão de bloco | F45 |
| E057 | [~] | `multiplix-audience:181-192` | só `company_ids`; sem ∪/− | F46 |
| E058 | [ ] | teto 500 back+front | não materializa | F47 |
| E059 | [ ] | `161000:45-65` | sem UNIQUE destino | F31 |
| E060 | [ ] | nenhuma | sem "principal por empresa" | F46 |
| E061 | [ ] | nenhuma | sem preview servidor | F48 |
| E062 | [~] | `:30-33` | só na hora do envio | F48 |
| E063 | [ ] | `:26` | `''` silencioso | F37 |
| E064 | [~] | `elegibilidade` por linha | sem agregado | F49 |
| E065 | [~] | `:304-329` | sem supressão/escopo | F09 |
| E066 | [ ] | nenhuma | sem `estimate` | F50 |
| E067 | [ ] | relê template a cada item | nada congela | F51 |
| E068 | [~] | `600000:39-41` | só `already_running` 3 min | F51 |
| E069 | [~] | `:126-136` | cancel não encerra pendentes | F14 |
| E070 | [~] | `430000` | só enviado×entregue | F52, F62 |
| E071 | [ ] | audience 60/min sem `Retry-After` | sem limite no send | F53 |
| E072 | [~] | `index.test.ts` | sem `tests/contracts` | F54 |

### Fase 5 — Fila e worker
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E073 | [ ] | 2 inserts do front | não transacional | F44 |
| E074 | [~] | `multiplix-send:222-471` | worker = a própria edge | F55 |
| E075 | [~] | `180000:133-150` | item a item, lista pré-carregada | F55 |
| E076 | [~] | `180000:140-146` | sem heartbeat; item com POST nunca expira | F11 |
| E077 | [ ] | nenhuma | worker não lê blocks | F56 |
| E078 | [~] | `:296,451` | sem teto/hora, sem 200, fan-out 10 | F17, F55 |
| E079 | [~] | `:400-403` | só pré-POST | F42 |
| E080 | [ ] | `:387-395` | 4xx = permanente sempre | F42 |
| E081 | [~] | `:340-341,366-386` | sem teste; item preso | F11, F57 |
| E082 | [ ] | nenhuma | `outcome_unknown` nunca reconcilia | F58 |
| E083 | [~] | `:228,316` | sem teste | F57 |
| E084 | [~] | `:126-136` | pendentes ficam `pending` | F14 |
| E085 | [ ] | `180000:445-450` | `completed` com falhas | F13 |
| E086 | [ ] | cron só `sending` | agendado não dispara | F10 |
| E087 | [ ] | nenhuma | 🔒 política de recálculo | F59 |
| E088 | [~] | cron drena `sending` | dead letter sem visão | F59 |

### Fase 6 — Canal e eventos
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E089 | [~] | `:358-362` | via fork | F41 |
| E090 | [~] | `:343-354` | sem `fileName`, sem E045 | F40, F56 |
| E091 | [ ] | `CANAL.md:17,68-74` | PTT/Opus não testado | F63 |
| E092 | [~] | `:151-183` | sem departamento/queues | F60 |
| E093 | [~] | `evolution-webhook-msg-handlers.ts:117,134-142` | só `DELIVERY_ACK`; sem `read_at` | F62 |
| E094 | [ ] | nenhuma | `talkx-reply` não estendido | F84 |
| E095 | [ ] | `:393` mensagem crua | sem mapa de erros | F61 |
| E096 | [~] | `evolution-webhook-messages.ts:292` | opt-out grava, Multiplix não lê | F09 |
| E097 | [ ] | nenhuma | sem `sync_interaction_from_zapp` | F85 |
| E098 | [ ] | nenhuma | sem contrato do adaptador | F54 |

### Fase 7 — Voz e áudio
E099–E103, E105–E114: `[ ]` — nada existe além das colunas `voice_id`/`voice_script` em `multiplix_blocks`. E104 `[~]` (`resolvePrivateBucketUrl` no bucket genérico). Fecha em F63–F69.

### Fase 8 — Front: fundação
| Etapa | Estado | Evidência | Lacuna | Fecha em |
|---|---|---|---|---|
| E115 | [x] | `lazyViews.ts:59`, `ViewRouter.tsx:99` | — | — |
| E116 | [~] | `navigation.service.ts:44` | nav primária, sem "NOVO", por role | F71 |
| E117 | [ ] | coluna única + Dialog | sem 3 regiões | F72 |
| E118 | [~] | sem hex; grep `#` casa "#958" | critério literal falha | F70 |
| E119 | [~] | `text-[13px]` | px fora da escala | F70 |
| E120 | [~] | `<button>` cru; imports de `talkx/` | fora de `ui/` | F70 |
| E121 | [~] | busca como `useMutation`; `useQuery` inline | sem `src/hooks/multiplix/` | F72 |
| E122 | [ ] | nenhuma | sem autosave | F78 |
| E123 | [~] | strings literais | sem i18n; monitor sem erro | F70, F80 |
| E124 | [~] | budget global | sem telemetria | F92 |

### Fase 9 — Painel Público
| Etapa | Estado | Lacuna | Fecha em |
|---|---|---|---|
| E125 | [~] | tokens `--zapp-*` inexistentes | F70 |
| E126 | [~] | sem debounce | F73 |
| E127 | [~] | papel único (hook aceita array) | F73 |
| E128 | [~] | select simples, sem busca/"Não informado" | F73 |
| E129 | [x] | UF dinâmica | — |
| E130 | [ ] | sem virtualização | F74 |
| E131 | [ ] | seleção zera (`:86`) ⚠️ | F73 |
| E132 | [ ] | "todos" = carregados ≤500 | F47, F74 |
| E133 | [ ] | sem exclusões | F46, F75 |
| E134 | [ ] | sem "N fora do filtro" | F75 |
| E135 | [ ] | sem salvar público | F35, F75 |
| E136 | [ ] | sem "aplicar público" | F75 |
| E137 | [~] | sem popover completo | F75 |
| E138 | [ ] | sem entrada por CRM 360/Contatos | F75 |

### Fase 10 — Composição
E139 `[ ]`, E140 `[~]` (textarea fixa), E141 `[~]` (2 chips, sem validação), E142–E150 `[ ]`. Fecha em F76–F78.

### Fase 11 — Prévia e confirmação
E151–E156 `[ ]`; E157 `[~]` (AlertDialog sem congelamento); E158 `[~]` (`busy` sem idempotência); E159 `[ ]` (`scheduled` só rótulo); E160 `[ ]`. Fecha em F79, F51, F10.

### Fase 12 — Monitor, histórico e retornos
| Etapa | Estado | Lacuna | Fecha em |
|---|---|---|---|
| E161 | [x] | realtime + polling (skipped só por polling) | — |
| E162 | [x] | "Iniciar" aparece em `scheduled` | F80 |
| E163 | [~] | sem `attempt_count`/`external_id`; `limit(500)` | F80 |
| E164–E167 | [ ] | sem bloco/histórico/repetir/export (CSV removido em `4704424`) | F81–F83 |
| E168–E170 | [ ] | sem sala de retornos/atribuição/tarefa | F84 |

### Fase 13 — Acessibilidade e performance
E171–E175, E178 `[~]` (só o que shadcn/Radix dá de graça; sem auditoria, sem Playwright); E176–E177 `[ ]`. Fecha em F86–F87.

### Fase 14 — Testes e observabilidade
E179 `[~]` (13 testes: 5 personalize + 8 auth); E187 `[~]`; E188 `[~]` (só `withTimeout`); E180–E186 `[ ]`. Fecha em F20, F54, F57, F88–F91.

### Fase 15 — Rollout
E189–E200 `[ ]`. Fecha em F92–F100.

## 6. Conclusão

O módulo em produção é um protótipo funcional de disparo de texto que **ninguém usou** (0 linhas) e que hoje tem 12 achados de segurança abertos — a maioria corrigível por migration e por 30 linhas no worker, sem depender de nenhuma decisão nova. O que separa isso do que o plano de 26/09 descreveu não é acabamento: é o modelo (público salvo, blocos, item×bloco, prévia, aptidão, voz) que ainda não foi construído.

O plano de 100 etapas que sucede este relatório começa pelo saneamento do que já está no ar (bloco A, 20 etapas, nenhuma depende do Joaquim exceto o DDL), depois fecha a ponte Singu de forma auditável, e só então constrói o que falta — na ordem em que cada peça destrava a seguinte.
