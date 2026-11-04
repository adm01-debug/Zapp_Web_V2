# 07 · REGRAS DE NEGÓCIO

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `5f3f7bd289` · branch `main` · 2026-11-04 20:31 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## A. Regras escritas por humanos (`manual/` — prioridade máxima, nunca sobrescrito)

### regras.md

# Regras de negócio — decididas pelo dono do produto

> Escrito por humanos (entrevista com o dono, 2026-11-03). Entra em `07-REGRAS-DE-NEGOCIO.md` seção A com
> prioridade sobre o que foi extraído do código. Cada regra diz se **já existe no código** (com a evidência)
> ou se é **decisão pendente de implementação** — agente que for mexer nesses fluxos deve respeitar a
> decisão, não o comportamento atual.

## 2. Atores / perfis e o que cada um pode fazer

Papéis reais do sistema (enum `app_role`, `src/lib/appRole.ts:13`): **`admin` · `supervisor` · `agent` · `special_agent`**.
`leader`, `owner` e `customer` **não são papéis**: `owner`/`admin`/`member` são papéis *dentro de um grupo do Team Chat*
(`team_conversation_members.member_role`, migration `20260927270019`); "líder" = supervisor. Medido em 2026-11-03:
4 admins, 3 supervisores, 4 agentes, 0 `special_agent`.

| Perfil | Pode | Não pode |
|---|---|---|
| **admin** | **Só ele** cria e remove a infraestrutura do atendimento: conexões WhatsApp, filas e membros, usuários e seus papéis (`user_roles`), horário comercial, SLA (`sla_configurations`), limites de campanha (`talkx_settings`), automações, chatbot, templates, blacklist, `app_settings`, provedores de IA, bloqueio de IP/país, logs de auditoria. **Único** que apaga dados em massa (contatos, campanhas, playbooks, logs). | — |
| **supervisor** | Tudo do agente **mais**: enxerga e intervém em **qualquer** conversa e contato (reatribui, muda status, encerra — `is_admin_or_supervisor` em ~120 funções); configura regras de SLA, automações e relatórios agendados; amplia a visibilidade de um agente (`agent_visibility_grants`); vê tentativas de login; **dispara campanhas** (`confirm_talkx_campaign_launch` → `talkx_confirm_launch_unauthorized` para quem não é admin/supervisor). | Criar ou apagar conexão, fila ou usuário; mexer em configuração global. |
| **agent** | Só o que é dele ou da sua fila (`can_edit_contact` = atendente dono **ou** membro da fila): cria contato, envia mensagem, cria/edita suas tarefas, agendamentos e **rascunhos** de campanha. | Ver ou mexer em conversa que não é sua nem da sua fila; mudar o próprio papel/permissões (`prevent_profile_privilege_escalation`); apagar contato ou mensagem; alterar qualquer configuração; **disparar** campanha. |
| **special_agent** | **Papel excluído por decisão do dono (2026-11-03).** Era agent + flag `profiles.can_download`; a flag continua existindo no agente comum (protegida por `20261012032331`). Nenhum agente de IA deve atribuir, tratar ou exibir esse papel; a tarefa pendente é removê-lo (enum `app_role`, CHECK de `profiles.role`, `effective_role`, 16 arquivos em `src/`, 4 edge functions — DDL em produção, PR aguardando o dono). | **pendente de remoção** — 0 usuários hoje |

Evidência: 18 policies RLS citam só `admin`, 10 tabelas só admin lê; funções `effective_role`, `is_admin`,
`is_admin_or_supervisor`, `can_edit_contact`, `require_contact_edit_permission` (banco ao vivo, 2026-11-03).

## 4. Ciclo de vida / estados e transições permitidas

### 4.1 Conversa (`contacts.conversation_status`)

| Regra | Estado | Evidência |
|---|---|---|
| Estados: `open`, `waiting`, `resolved`, `archived`. Transições permitidas: open → waiting/resolved/archived · waiting → open/resolved · resolved → open/archived · archived → open. | **existe** | `supabase/migrations/20260905090000_contacts_fsm_trigger.sql` |
| Quem muda status: admin/supervisor, ou o atendente dono da conversa / membro da fila dela (`can_edit_contact`). | **existe** | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` (`set_conversation_status`, `require_contact_edit_permission`) |
| Cliente manda mensagem em conversa `resolved`/`archived` → reabre sozinha: volta para `open` **com o mesmo atendente** se ela tinha dono; sem dono vai para `waiting`. Decisão do dono: manter — as conversas tendem a ficar sempre com os mesmos atendentes, e isso é desejado. | **existe** | `supabase/migrations/20261013210003_reabre_conversa_com_nova_mensagem.sql` (`trg_conversation_reopen_on_inbound`) |
| Tempo sem resposta do atendente **não** muda o status para `waiting`. Continua como está. | **decisão** (nada a implementar) | — |
| **SLA de primeira resposta** (decisão 2026-11-03): padrão quando a fila não tem configuração = **amarelo aos 15 min, vermelho aos 30 min**, contando **só em horário comercial** (seg–sex 08:00–18:00; fora dele o relógio para). Amarelo: só a tela do atendente. Vermelho: **push para atendente e supervisor**. **1 h** sem resposta: **e-mail ao supervisor**. **Admin** é avisado quando a **mesma fila** tem **3 ou mais** conversas no vermelho ao mesmo tempo (fila sem gente, não atendente lento). | **parcial** — alertas na tela existem; minutos padrão, pausa fora do horário, push/e-mail e regra do admin são **pendentes** | `sla_alert_events` (`20261011180337`, severidades `warning`/`breached`, visíveis para dono + admin/supervisor); minutos por fila em `sla_configurations` (`20261005151753`); horário comercial em `talkx_settings.business_hours` |
| Conversa sem nenhuma interação (nem cliente, nem atendente) por **30 dias** → arquivada automaticamente (`archived`). Cliente que escrever depois reabre pela regra acima. | **pendente de implementação** (job `pg_cron` — DDL em produção, exige PR aberta para o dono) | hoje não há job de arquivamento (NÃO VERIFICADO em `cron.job` ao vivo; grep nas migrations não achou) |
| Fechar de novo uma conversa **sem ela ter sido reaberta** desde o último fechamento é rejeitado (`conversation_closure_requires_reopen`). Reabrir e fechar no mesmo dia **é permitido** — o limite "um fechamento por dia" foi removido da operação e vale só nos indicadores. | **existe** | `supabase/migrations/20261007013217_conversation_closures_reopen_same_day.sql:143` (drop do índice diário) e `:175-179` (guarda) |

### 4.2 Conexão WhatsApp (`whatsapp_connections`) — regra dos três níveis

Princípio: **o atendente nunca pode mandar mensagem sem saber que a conexão caiu**, mas queda rápida não
vira alerta para ninguém. A sonda `connection-health-check` roda a cada 5 min (pg_cron) e classifica
`healthy` / `degraded` / `disconnected` com motivos `phantom_session` / `stale_session` / `webhook_silent`
(`supabase/functions/connection-health-check/index.ts`); reconexão automática por conexão usa
`auto_reconnect_enabled`, `reconnect_max_attempts`, `reconnect_interval_seconds` (migration `20261012134000`).

| Nível | Quando | O que acontece | Estado |
|---|---|---|---|
| **0 — queda rápida** | `disconnected`/`degraded` enquanto a reconexão automática ainda tem tentativas (~15 min) | Ninguém recebe push/e-mail. Na tela, conexão em **amarelo** e a caixa de mensagem avisa "sem conexão com o WhatsApp — o envio vai falhar até a conexão voltar". **Hoje o envio falha** (não existe fila offline): `enqueue_outbound_message` recusa com `no_connected_whatsapp_connection` quando não há conexão `connected`. | **implementado** (PR #2677, merge em 2026-11-03): aviso amarelo/vermelho em `src/components/inbox/chat/ConnectionHealthBanner.tsx` + `src/hooks/inbox/useConnectionHealthBanner.ts`. **Lacuna:** o atendente só vê o aviso quando a RPC `get_contact_connection_health` entrar (RLS de `whatsapp_connections` é só admin/supervisor) — DDL pendente |
| **1 — queda confirmada** | reconexão esgotou as tentativas **ou** motivo `phantom_session` (celular desvinculou; precisa de QR Code) | **Admin e supervisores recebem push + e-mail sempre**, independentemente das preferências (`alert_on_disconnected` etc. só **adicionam** gente, nunca tiram). Atendentes e supervisores da conexão veem bloqueio **vermelho**: "WhatsApp desconectado — precisa de um novo QR Code (só o admin conecta). Envios falham até reconectar." | **implementado** (PR #2677, merge em 2026-11-03): `connection-health-check` escala por nível (`decideEscalation`), push + e-mail obrigatórios para admin/supervisor via `user_roles`, opt-in só adiciona; marcadores por canal em `notifications` (`conn-l1:v1:<tipo>:<id>`) |
| **2 — persistente** | > 1 h desconectada | Repete o aviso **de hora em hora só para o admin** (nível 2 implica nível 1). Campanhas pausadas por `connection_lost` **retomam** quando a conexão volta (`onConnectionRecovered` → `transition_talkx_campaign` `start`). | **implementado** (PR #2677, merge em 2026-11-03): chave `conn-l2:v1:<tipo>:<id>:<hora>`. Pausa automática ao cair: já existia (`connection_lost`), NÃO VERIFICADO neste PR |

Regra adicional: `degraded` (webhook mudo) conta como nível 0; se durar **mais de 30 min**, sobe para nível 1 —
webhook mudo por meia hora significa que mensagens de clientes não estão chegando, tão grave quanto não enviar.

Tempos decididos: **15 min** (esgota reconexão) · **30 min** (`degraded` vira nível 1) · **1 h** (nível 2).

Reconexão por QR Code (nível 1 em diante): **só o admin** conecta/escaneia — supervisor e atendente **não** (decisão 2026-11-03, corrigida pelo dono). **Pendente de implementação:** hoje o supervisor ainda vê conexões e consegue pedir QR (`get_connection_qr_code` e `get_connection_instance` usam `is_admin_or_supervisor`; policy `whatsapp_connections: Admin supervisor view connections`). O bloqueio vermelho do atendente/supervisor diz "avise o admin", não oferece o QR. Alerta de nível 1 continua indo para admin **e** supervisor (supervisor precisa saber, mesmo sem poder reconectar).

## 6. Prazos, limites e quotas — Talk X / campanhas

Valores de consentimento: `granted` / `unknown` / `revoked` (não existe `opt_in`;
`supabase/migrations/20261016010744_consent_status_guard.sql:40`).

| Regra | Estado | Evidência |
|---|---|---|
| **Consentimento:** `unknown` **recebe** campanha; `revoked` **nunca** recebe. O setting `require_granted_consent` fica **desligado** (base é de clientes/leads da própria empresa; legítimo interesse com saída fácil). Ligar esse setting hoje zeraria toda campanha: 100% dos contatos ativos estão `unknown`. | **existe** (decisão: manter) | `20261003232707_talkx_lgpd_consentimento_expurgo.sql:32,163`; banco `talkx_settings.require_granted_consent = false` (medido 2026-11-03) |
| **Toda campanha inclui instrução de saída.** Contato que pedir saída ("sair"/"parar") vira `revoked` e entra na supressão por **contato e por telefone** — **nunca mais** entra em campanha, nem se for reimportado com outro cadastro. | **existe** (supressão por telefone); instrução de saída no texto é **regra de uso**, não validada pelo sistema | `20261003232707…sql:449,469` (`talkx_suppress_contact`, eixos `contact_id` e `phone`) |
| **Limite diário: 500 envios por conexão por dia.** Não há limite por hora — o ritmo vem do `speed_profile` (`slow`/`moderate`/`fast`) + intervalo entre envios. | **existe** | banco `talkx_settings.daily_limit_per_connection = 500`; `supabase/functions/talkx-send/index.ts:513-530`; `20260908120000_talkx_segments_templates_events.sql:82` |
| **Horário comercial é o padrão:** seg–sex 08:00–18:00 (America/Sao_Paulo). **Campanha nova nasce com `business_hours_only = true`**; quem quiser enviar fora do horário desliga de propósito. | **pendente de implementação** — hoje o padrão é `false` no banco e no formulário | `20260908120000…sql:74` (`DEFAULT false`); `src/components/talkx/TalkXCampaignScheduled.tsx:204` (`?? false`); janela avaliada por `talkx_engine_window_open` |
| **Legado / telefone inválido nunca entra em campanha:** `deleted_at`, `is_lid_legacy` ou telefone fora de `^[0-9]{10,15}$` ficam fora da audiência. O toggle "Mostrar legados" da tela de contatos **não** os faz entrar em campanha. | **existe** | `20261003232707…sql:347-349` (`talkx_audience_query`) |

Lacuna registrada: `number_reputation.daily_limit` (200, migration `20260409014536…sql:151`) é um contador de
aquecimento de número que **`talkx-send` não consulta** (grep vazio em 2026-11-03) — coluna morta; o único
limite efetivo é o `daily_limit_per_connection`.

## 7. Dados pessoais, retenção e LGPD

| Regra | Estado | Evidência |
|---|---|---|
| **Dados de atendimento** (contato, mensagens, mídia, gravação de chamada em `calls`) **não expiram**: ficam até um admin excluir (`delete_contact` / `delete_contacts` = soft-delete, registrado em `contact_deletion_audit`; eliminação física só via o fluxo LGPD abaixo). Nenhum agente cria job de expurgo nessas tabelas. | **existe** (não há expurgo; decisão: manter) | cron ao vivo 2026-11-03: só logs técnicos têm retenção (`reconnection-logs-retention-30d`, `search-events-retention`, `purge-qr-attempts`, caches) |
| **Histórico de campanha Talk X também fica para sempre** (`talkx_recipients`, cliques, IA, mídia, `talkx_delivery_log`). O expurgo `purge_talkx_expired_data` (chamado por `trigger_talkx_engine_tick`, 1×/dia) obedece os prazos em `talkx_settings`: `retention_days_message/clicks/ai = 36.500` dias (a função não tem "0 = desligado"; NULL cai no padrão 180 — **não** zere nem apague essas chaves) e, desde 2026-11-03, `talkx_delivery_log` segue `retention_days_message` (antes: 30 dias fixos). **Exceção deliberada:** `retention_days_test_sends = 90` — `talkx_test_send_claims` é idempotência operacional (sem `idempotencyKey` do front, `talkx-send` deriva a chave de instância+telefone+template+mídia; guardar o claim para sempre impediria repetir o mesmo teste). Prazo ≤ 0 em qualquer chave é tratado como 1 dia. | **existe** | migrations `20261102042200` (aplicada 2026-11-03, `delivery_log` sem prazo fixo) e `20261102052200` (guarda ≤ 0 + `test_sends` 90; PR #2686) |
| **Pedido de exclusão (LGPD, art. 18): atender em até 15 dias**, eliminando **de verdade** contato + mensagens + mídia + gravações. **Atenção:** a exclusão de admin na tela é **soft-delete** — `delete_contact`/`delete_contacts` só fazem `UPDATE contacts SET deleted_at = now()`; mensagens, mídia e `calls` continuam no banco. Hoje **não existe** eliminação definitiva — é **implementação pendente** (função de purga por contato, só admin, registrada em `contact_deletion_audit`). Até lá, o pedido LGPD **não** pode ser dado como atendido só com a exclusão da tela. "Sair" de campanha (`revoked`) não apaga dados — só bloqueia envio. | **pendente** (hoje só oculta) | `20260929810000_contacts_can_edit_contact_hoisted_params.sql:143-151,177-185`; `src/components/contacts/useContactsCRUD.ts:244-274` |
| **Encerramento automático por inatividade (24 h) fica desligado** — coerente com "sem `waiting`/fechamento por tempo" (§4.1). Único fechamento automático é o arquivamento aos 30 dias (§4.1, pendente). | **existe** (desligado) | `auto_close_config.is_enabled = false`, `inactivity_hours = 24` (banco ao vivo) |

## 8. Decisões já tomadas (o que NÃO mudar e por quê)

- Reabertura automática mantém o atendente anterior — o dono quer continuidade de atendimento.
- Não existe "waiting por inatividade" — `waiting` é só ação humana ou reabertura sem dono.
- Alerta de desconexão nível 1 para admin/supervisor **não é opt-out**.
- **Alerta de conexão sem preferência cadastrada = ligado** (comportamento herdado, `connection-health-check/index.ts` `buildConnectionAlertPrefs`): hoje `connection_alert_preferences` está vazia e os 4 atendentes também recebem push + e-mail no nível 1. **Decisão pendente do dono:** manter (todos avisados) ou padrão desligado para atendente (só admin/supervisor obrigatórios + quem ligar o cartão).
- **Envio com WhatsApp caído: hoje falha, não enfileira** (medido 2026-11-03: `enqueue_outbound_message` → `no_connected_whatsapp_connection`). **Decisão pendente do dono:** (A) manter — aviso na tela + erro de envio, zero DDL; ou (B) fila offline — guardar a mensagem e enviar quando voltar (exige DDL + worker + regra de expiração). Até decidir, a tela diz a verdade: "o envio vai falhar".
- SLA: 15/30 min em horário comercial; push atendente+supervisor no vermelho; e-mail supervisor após 1 h; admin só com 3+ no vermelho na mesma fila.
- **Nenhuma área congelada** (decisão 2026-11-03): qualquer módulo pode ser alterado por agente de IA, seguindo o fluxo de PR do `AGENTS.md` (regra 8 continua valendo para DDL, CI, segredos e deleção).
- Papel `special_agent` **excluído** — só existem admin, supervisor e agent; exportar/baixar é a flag `can_download` do agente.
- Campanhas: `require_granted_consent` fica desligado; `revoked` nunca recebe; 500/dia por conexão; sem limite por hora.
- **Pagamentos (`payment_links`, `contact_purchases`) será removido do sistema** (decisão 2026-11-03). Nenhum agente corrige, estende ou constrói sobre esse módulo; a tarefa pendente é a remoção. Estado medido: as duas tabelas têm **0 linhas** (`inventario/estado/banco.json`), não há edge function de pagamento, e a UI vive em `src/components/inbox/ContactPurchasesPanel.tsx` (aba vendas do inbox), `src/components/contacts/ContactPurchaseHistory.tsx` (painel do contato), `src/hooks/crm/useContactPurchases.ts` e a leitura em `src/hooks/crm/useContactCrm360.ts:181`. Moeda, desconto, expiração e permissões: **não se aplicam**.
- **ZAPP é de uma empresa só (single-tenant)** — decisão 2026-11-03. Não existe isolamento por empresa e **não deve ser criado**: RLS significa só **papel** (admin / supervisor / agent) e **propriedade** (atendente dono ou membro da fila, `can_edit_contact`). Nenhuma policy nova filtra por `company_id` e nenhuma tabela nova o exige. Estado medido: `company_id` existe só em `multiplix_recipients`, **0 policies** o usam e não há tabela `companies` — a coluna é resíduo, não propagar.
- Convites de departamento: só admin cria e apaga (decisão 2026-11-01; `src/hooks/team-chat/README.md`).
- Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + telefone `^[0-9]{10,15}$` (decisão D4; `CLAUDE.md` §6).

## 9. Dúvidas em aberto

1. **Mensagem enviada com WhatsApp caído: falhar (A) ou guardar em fila offline (B)?** — ver §8. Hoje falha.
2. **Atendente recebe push/e-mail de queda de conexão por padrão?** — ver §8. Hoje recebe (padrão ligado sem preferência).

Demais dúvidas: nenhuma (entrevista concluída em 2026-11-03). Novas dúvidas: adicionar aqui e avisar o dono.

## B. Quem pode ver/alterar o quê (RLS — conforme migrations do repo; schema real em `06`)

| Tabela | Política | Comando | Roles | Modo | USING | WITH CHECK |
|---|---|---|---|---|---|---|
| `client_wallet_rules` | Authenticated users can view wallet rules | SELECT | authenticated | permissive | `true` |  |
| `calls` | Users can update their calls | UPDATE | authenticated | permissive | `agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` |  |
| `whatsapp_groups` | Authenticated users can view groups | SELECT | public | permissive | `true` |  |
| `whatsapp_groups` | Authenticated users can insert groups | INSERT | public | permissive |  | `true` |
| `whatsapp_groups` | Authenticated users can update groups | UPDATE | public | permissive | `true` |  |
| `whatsapp_groups` | Authenticated users can delete groups | DELETE | public | permissive | `true` |  |
| `whatsapp_groups` | Admins can manage groups | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `ip_whitelist` | Admins can view IP whitelist | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `whatsapp_groups` | Authenticated users can view whatsapp groups | SELECT | authenticated | permissive | `true` |  |
| `whatsapp_groups` | Admins can manage whatsapp groups | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `whatsapp_templates` | Authenticated users can view templates | SELECT | authenticated | permissive | `true` |  |
| `whatsapp_templates` | Admins can manage templates | ALL | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `scheduled_reports` | Admins can manage scheduled reports | ALL | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `auto_close_config` | Authenticated users can view auto-close config | SELECT | authenticated | permissive | `true` |  |
| `auto_close_config` | Admins can manage auto-close config | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `campaigns` | Authenticated can view campaigns | SELECT | authenticated | permissive | `true` |  |
| `campaigns` | Admins can manage campaigns | ALL | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `campaign_contacts` | Admins can manage campaign contacts | ALL | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `chatbot_flows` | Authenticated can view chatbot flows | SELECT | authenticated | permissive | `true` |  |
| `chatbot_flows` | Admins can manage chatbot flows | ALL | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `saved_filters` | Users can view own saved filters | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `saved_filters` | Users can insert own saved filters | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `saved_filters` | Users can update own saved filters | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `saved_filters` | Users can delete own saved filters | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `whatsapp_connection_queues` | Authenticated can view connection queues | SELECT | authenticated | permissive | `true` |  |
| `agent_skills` | Admins can manage skills | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `queue_skill_requirements` | Authenticated can view queue skills | SELECT | authenticated | permissive | `true` |  |
| `queue_skill_requirements` | Admins can manage queue skills | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `csat_auto_config` | Authenticated can view csat config | SELECT | authenticated | permissive | `true` |  |
| `csat_auto_config` | Admins can manage csat config | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `user_sessions` | Authenticated can insert own sessions | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `user_sessions` | Users can view their own sessions | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_sessions` | Users can update their own sessions | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_sessions` | Users can delete their own sessions | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `notifications` | Users can view own notifications | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `notifications` | Users can update own notifications | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `notifications` | Users can delete own notifications | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `webauthn_challenges` | Users can manage own challenges | ALL | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `security_alerts` | Admins can insert security alerts | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `security_alerts` | Admins can manage security alerts | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `geo_blocking_settings` | Authenticated can view geo settings | SELECT | authenticated | permissive | `true` |  |
| `geo_blocking_settings` | Admins can manage geo settings | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `allowed_countries` | Admins can view allowed countries | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `blocked_countries` | Admins can view blocked countries | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `away_messages` | Admins can manage away messages | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `away_messages` | Authenticated users can view away messages | SELECT | authenticated | permissive | `true` |  |
| `business_hours` | Admins can manage business hours | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `business_hours` | Authenticated users can view business hours | SELECT | authenticated | permissive | `true` |  |
| `contact_notes` | Authenticated users can insert notes | INSERT | authenticated | permissive |  | `author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())` |
| `contact_notes` | Users can update their own notes | UPDATE | authenticated | permissive | `author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())` |  |
| `contact_notes` | Users can delete their own notes | DELETE | authenticated | permissive | `author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())` |  |
| `contact_notes` | Users can view notes on accessible contacts | SELECT | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `sales_pipeline_stages` | Admins can manage pipeline stages | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `sales_pipeline_stages` | Authenticated can view pipeline stages | SELECT | authenticated | permissive | `true` |  |
| `knowledge_base_articles` | Admins can manage knowledge base | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `knowledge_base_articles` | Authenticated can view knowledge base | SELECT | authenticated | permissive | `is_published = true OR public.is_admin_or_supervisor(auth.uid())` |  |
| `knowledge_base_files` | Admins can manage kb files | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `followup_sequences` | Admins can manage followup sequences | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `followup_steps` | Admins can manage followup steps | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `whatsapp_flows` | Admins can manage whatsapp flows | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `whatsapp_flows` | Authenticated can view whatsapp flows | SELECT | authenticated | permissive | `true` |  |
| `chatbot_executions` | Admins can manage chatbot executions | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `meta_capi_events` | Admins can manage capi events | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `contact_custom_fields` | Authenticated can update own custom fields | UPDATE | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `contact_custom_fields` | Authenticated can delete own custom fields | DELETE | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `warroom_alerts` | Admins can update alerts | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `conversation_sla` | Admins can update SLA | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `whisper_messages` | Users can delete own whisper messages | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `queue_positions` | Admins can manage queue positions | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `sales_deals` | Users can update assigned deals | UPDATE | authenticated | permissive | `assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `sales_deals` | Admins can delete deals | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `followup_executions` | Admins can manage followup executions | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `ai_conversation_tags` | Admins can update ai tags | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `ai_conversation_tags` | Admins can delete ai tags | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `contact_tags` | Authenticated can delete contact tags | DELETE | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `campaigns` | Admins can insert campaigns | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `chatbot_flows` | Admins can insert chatbot flows | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `campaign_contacts` | Admins can insert campaign contacts | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `whatsapp_templates` | Admins can insert templates | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `scheduled_reports` | Admins can insert scheduled reports | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `warroom_alerts` | Admins can insert alerts | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `rate_limit_logs` | Admins can insert rate limit logs | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `goals_configurations` | Users can view their own goals | SELECT | authenticated | permissive | `profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `goals_configurations` | Users can manage their own goals | ALL | authenticated | permissive | `profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` | `profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |
| `ip_whitelist` | Admins can manage IP whitelist | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `message_templates` | Users can view their templates and global ones | SELECT | authenticated | permissive | `user_id = auth.uid() OR is_global = true` |  |
| `message_templates` | Users can create their own templates | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `message_templates` | Users can update their own templates | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `message_templates` | Users can delete their own templates | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `mfa_sessions` | Users can manage own MFA sessions | ALL | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `passkey_credentials` | Users can view own passkeys | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `passkey_credentials` | Users can update own passkeys | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `passkey_credentials` | Users can delete own passkeys | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `products` | Authenticated users can view products | SELECT | authenticated | permissive | `true` |  |
| `products` | Admins can manage products | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `products` | Admins can insert products | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `queue_goals` | Authenticated users can view queue goals | SELECT | authenticated | permissive | `true` |  |
| `queue_goals` | Admins can manage queue goals | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `queue_members` | Authenticated users can view queue members | SELECT | authenticated | permissive | `true` |  |
| `queue_members` | Admins can manage queue members | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `queues` | Authenticated users can view queues | SELECT | authenticated | permissive | `true` |  |
| `queues` | Admins can manage queues | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `rate_limit_logs` | Admins can view rate limit logs | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `scheduled_messages` | Users can view their scheduled messages | SELECT | authenticated | permissive | `created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `scheduled_messages` | Users can delete their scheduled messages | DELETE | authenticated | permissive | `created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `sla_configurations` | Authenticated users can view SLA configurations | SELECT | authenticated | permissive | `true` |  |
| `sla_configurations` | Admins can manage SLA configurations | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `tags` | Authenticated users can view tags | SELECT | authenticated | permissive | `true` |  |
| `tags` | Admins can manage tags | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `user_devices` | Users can view their own devices | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_devices` | Users can insert their own devices | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `user_devices` | Users can update their own devices | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_devices` | Users can delete their own devices | DELETE | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_settings` | Users can view their own settings | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `user_settings` | Users can insert their own settings | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `user_settings` | Users can update their own settings | UPDATE | authenticated | permissive | `user_id = auth.uid()` |  |
| `tags` | Users can insert tags | INSERT | authenticated | permissive |  | `created_by IS NULL OR created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |
| `csat_surveys` | Users can insert CSAT surveys | INSERT | authenticated | permissive |  | `agent_id IS NULL OR agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |
| `sales_deals` | Users can insert deals | INSERT | authenticated | permissive |  | `assigned_to IS NULL OR assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |
| `conversation_sla` | Admins can insert SLA | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `client_wallet_rules` | Admins can manage wallet rules | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `whisper_messages` | Users can view own whisper messages | SELECT | authenticated | permissive | `sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR target_agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `entity_versions` | Admins can view entity versions | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `calls` | Users can view own calls | SELECT | authenticated | permissive | `agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `csat_surveys` | Users can view own CSAT surveys | SELECT | authenticated | permissive | `agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `scheduled_reports` | Admins can view scheduled reports | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `ai_conversation_tags` | Users can insert ai tags for assigned contacts | INSERT | authenticated | permissive |  | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |
| `contact_custom_fields` | Users can insert custom fields for assigned contacts | INSERT | authenticated | permissive |  | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |
| `contact_tags` | Users can insert tags for assigned contacts | INSERT | authenticated | permissive |  | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid()) ) OR public.is_admin_or_supervisor(auth.uid())` |
| `stickers` | Authenticated users can view stickers | SELECT | authenticated | permissive | `true` |  |
| `automations` | Authenticated users can read automations | SELECT | authenticated | permissive | `true` |  |
| `automations` | Admin/supervisor can create automations | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `automations` | Admin/supervisor can delete automations | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `automations` | Admin/supervisor can update automations | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `contact_custom_fields` | Authenticated can view custom fields | SELECT | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN ( SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() ) ) OR is_admin_or_supervisor(auth.uid())` |  |
| `chatbot_executions` | Authenticated can view chatbot executions | SELECT | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) ) OR is_admin_or_supervisor(auth.uid())` |  |
| `deal_activities` | Admins can view deal activities | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `meta_capi_events` | Admins can view capi events | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `campaign_contacts` | Admins can view campaign contacts | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `followup_executions` | Authenticated can view followup executions | SELECT | authenticated | permissive | `contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) ) OR is_admin_or_supervisor(auth.uid())` |  |
| `rate_limit_configs` | Admins can read rate limit configs | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `contact_tags` | Users can view contact tags | SELECT | authenticated | permissive | `contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid())` |  |
| `queue_positions` | Users can view queue positions | SELECT | authenticated | permissive | `contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())) OR is_admin_or_supervisor(auth.uid())` |  |
| `agent_stats` | Users can view agent stats | SELECT | authenticated | permissive | `profile_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `warroom_alerts` | Admins can view warroom alerts | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `knowledge_base_files` | Users can view knowledge base files | SELECT | authenticated | permissive | `article_id IN (SELECT a.id FROM knowledge_base_articles a WHERE a.is_published = true) OR is_admin_or_supervisor(auth.uid())` |  |
| `stickers` | Sticker insert with ownership | INSERT | authenticated | permissive |  | `uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid())` |
| `stickers` | Sticker update with ownership | UPDATE | authenticated | permissive | `uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid())` | `uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid())` |
| `stickers` | Sticker delete with ownership | DELETE | authenticated | permissive | `uploaded_by = auth.uid()::text OR is_admin_or_supervisor(auth.uid())` |  |
| `channel_routing_rules` | Admins can manage routing rules | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `channel_routing_rules` | Authenticated can view routing rules | SELECT | authenticated | permissive | `true` |  |
| `audio_memes` | Authenticated users can read audio memes | SELECT | authenticated | permissive | `true` |  |
| `audio_memes` | Users can delete own audio memes | DELETE | authenticated | permissive | `uploaded_by = auth.uid() OR public.is_admin_or_supervisor(auth.uid())` |  |
| `custom_emojis` | Authenticated users can view custom emojis | SELECT | authenticated | permissive | `true` |  |
| `custom_emojis` | Users can delete own or admin custom emojis | DELETE | authenticated | permissive | `(uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `connection_health_logs` | Admins can view health logs | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `webhook_rate_limits` | Admins can view rate limits | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `whatsapp_connections` | Admins can insert connections | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `whatsapp_connections` | Admins can update connections | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `whatsapp_connections` | Admins can delete connections | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `audio_memes` | Authenticated users can insert audio memes | INSERT | authenticated | permissive |  | `uploaded_by = auth.uid()` |
| `audio_memes` | Authenticated users can update audio memes | UPDATE | authenticated | permissive | `(uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())` | `(uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |
| `custom_emojis` | Authenticated users can insert custom emojis | INSERT | authenticated | permissive |  | `uploaded_by = auth.uid()` |
| `custom_emojis` | Authenticated users can update custom emojis | UPDATE | authenticated | permissive | `(uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())` | `(uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |
| `sicoob_contact_mapping` | Authenticated users can insert sicoob mappings | INSERT | authenticated | permissive |  | `is_admin_or_supervisor(auth.uid())` |
| `query_telemetry` | Admins can delete telemetry | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `agent_visibility_grants` | Admins and supervisors can manage visibility grants | ALL | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin_or_supervisor(auth.uid())` |
| `messages` | Users can update messages from their assigned contacts | UPDATE | authenticated | permissive | `contact_id IN ( SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid())) ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `profiles` | Admin supervisor can view all profiles | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `query_telemetry` | Users can insert own telemetry | INSERT | authenticated | permissive |  | `user_id = auth.uid()` |
| `sales_deals` | Users can view assigned or admin deals | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid()) OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` |  |
| `whatsapp_connections` | Admin supervisor view connections | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `profiles` | Users can insert their own profile safely | INSERT | authenticated | permissive |  | `auth.uid() = user_id AND (role IS NULL OR role = 'agent') AND (access_level IS NULL OR access_level = 'basic') AND (permissions IS NULL OR permissions = '{}'::jsonb)` |
| `agent_achievements` | Users can view own or admin all achievements | SELECT | authenticated | permissive | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `agent_skills` | Users can view own or admin all skills | SELECT | authenticated | permissive | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `nps_surveys` | Admins can update NPS surveys | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `nps_surveys` | Admins can delete NPS surveys | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `saved_filters` | Users can view shared filters | SELECT | authenticated | permissive | `is_shared = true` |  |
| `nps_surveys` | Admins and own agents can view NPS surveys | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid()) OR agent_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |  |
| `email_threads` | Users can delete threads of own accounts | DELETE | authenticated | permissive | `EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())` |  |
| `email_labels` | Users can view labels of own accounts | SELECT | authenticated | permissive | `EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid())))` |  |
| `email_labels` | Users can manage labels of own accounts | ALL | authenticated | permissive | `EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND ga.user_id = auth.uid())` |  |
| `performance_snapshots` | Admins can view all performance snapshots | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `performance_snapshots` | Users can view own performance snapshots | SELECT | authenticated | permissive | `profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |  |
| `performance_snapshots` | Users can insert own performance snapshots | INSERT | authenticated | permissive |  | `profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |
| `performance_snapshots` | Admins can delete performance snapshots | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `user_service_accounts` | Users can view own service accounts | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `user_service_accounts` | Admins can view all service accounts | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `deal_activities` | Agents can view activities on their deals | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid()) OR performed_by = public.get_profile_id_for_user(auth.uid()) OR deal_id IN ( SELECT sd.id FROM public.sales_deals sd WHERE sd.assigned_to = public.get_profile_id_for_user(auth.uid()) )` |  |
| `login_attempts` | Block authenticated inserts on login_attempts | INSERT | authenticated | permissive |  | `false` |
| `login_attempts` | Block authenticated updates on login_attempts | UPDATE | authenticated | permissive | `false` |  |
| `login_attempts` | Only admins can delete login attempts | DELETE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `audit_logs` | Block authenticated inserts on audit_logs | INSERT | authenticated | permissive |  | `false` |
| `webauthn_challenges` | Block anon access to webauthn challenges | ALL | anon | permissive | `false` | `false` |
| `warroom_alerts` | Admins can delete warroom alerts | DELETE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `blocked_ips` | Only admins can view blocked IPs | SELECT | authenticated | permissive | `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') OR is_admin_or_supervisor(auth.uid())` |  |
| `user_devices` | Admins can view all user devices | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `user_roles` | Only admins can manage roles | ALL | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` | `public.has_role(auth.uid(), 'admin')` |
| `agent_stats` | Only admins can update agent stats | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `nps_surveys` | Users can create own NPS surveys | INSERT | authenticated | permissive |  | `agent_id IS NOT NULL AND agent_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )` |
| `team_conversations` | Members can view their conversations | SELECT | authenticated | permissive | `public.is_team_conversation_member(auth.uid(), id) OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |  |
| `team_conversations` | Authenticated users can create conversations | INSERT | authenticated | permissive |  | `created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |
| `team_messages` | Members can view conversation messages | SELECT | authenticated | permissive | `public.is_team_conversation_member(auth.uid(), conversation_id)` |  |
| `team_messages` | Members can send messages | INSERT | authenticated | permissive |  | `public.is_team_conversation_member(auth.uid(), conversation_id) AND sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |
| `team_messages` | Senders can delete own messages | DELETE | authenticated | permissive | `sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |  |
| `audit_logs` | Only admins can view audit logs | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `contacts` | Users can insert contacts | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid()) OR ( assigned_to IS NOT NULL AND assigned_to IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() ) )` |
| `audit_logs` | Block authenticated deletes on audit_logs | DELETE | authenticated | permissive | `false` |  |
| `audit_logs` | Block authenticated updates on audit_logs | UPDATE | authenticated | permissive | `false` |  |
| `notifications` | Block authenticated notification inserts | INSERT | authenticated | permissive |  | `false` |
| `entity_versions` | Block authenticated version inserts | INSERT | authenticated | permissive |  | `false` |
| `profiles` | Admins can update any profile | UPDATE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` | `is_admin_or_supervisor(auth.uid())` |
| `profiles` | Users can update own profile | UPDATE | authenticated | permissive | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `profiles` | Block sensitive field changes by non-admins | UPDATE | authenticated | restrictive |  | `is_admin_or_supervisor(auth.uid()) OR ( role = (SELECT p.role FROM profiles p WHERE p.user_id = auth.uid()) AND access_level = (SELECT p.access_level FROM profiles p WHERE p.user_id = auth.uid()) AND permissions = (SELECT p.permissions FROM profiles p WHERE p.user_id = auth.uid()) AND is_active = (S …` |
| `user_service_accounts` | Only admins can insert service accounts | INSERT | authenticated | permissive |  | `is_admin_or_supervisor(auth.uid())` |
| `user_service_accounts` | Only admins can update service accounts | UPDATE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `user_service_accounts` | Only admins can delete service accounts | DELETE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `ai_usage_logs` | Admins can view all AI usage logs | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `ai_usage_logs` | Service role can insert AI usage logs | INSERT | service_role | permissive |  | `true` |
| `ai_usage_logs` | Users can view own AI usage logs | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `voice_command_logs` | Users can insert own voice logs | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `voice_command_logs` | Users can read own voice logs | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `sla_rules` | Authenticated users can view SLA rules | SELECT | authenticated | permissive | `true` |  |
| `sla_rules` | Admins and supervisors can insert SLA rules | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `sla_rules` | Admins and supervisors can update SLA rules | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `sla_rules` | Admins and supervisors can delete SLA rules | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `ai_providers` | Admins can insert AI providers | INSERT | authenticated | permissive |  | `public.has_role(auth.uid(), 'admin')` |
| `ai_providers` | Admins can update AI providers | UPDATE | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `ai_providers` | Admins can delete AI providers | DELETE | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `talkx_campaigns` | Users can view own campaigns | SELECT | authenticated | permissive | `created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |  |
| `talkx_campaigns` | Admins can view all campaigns | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `talkx_recipients` | Users can view recipients of own campaigns | SELECT | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND (tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid())) )` |  |
| `talkx_recipients` | Users can insert recipients to own campaigns | INSERT | authenticated | permissive |  | `EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) )` |
| `talkx_recipients` | Users can update recipients of own campaigns | UPDATE | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) )` |  |
| `talkx_recipients` | Users can delete recipients of own campaigns | DELETE | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = campaign_id AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND tc.status = 'draft' )` |  |
| `conversation_snoozes` | Users can view own snoozes | SELECT | authenticated | permissive | `snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` |  |
| `conversation_snoozes` | Users can delete own snoozes | DELETE | authenticated | permissive | `snoozed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` |  |
| `reminders` | Users can manage own reminders | ALL | authenticated | permissive | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` |  |
| `playbooks` | Authenticated can view playbooks | SELECT | authenticated | permissive | `true` |  |
| `playbooks` | Admins can manage playbooks | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `playbooks` | Admins can update playbooks | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `playbooks` | Admins can delete playbooks | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `number_reputation` | Authenticated can view reputation | SELECT | authenticated | permissive | `true` |  |
| `conversation_memory` | Agents can insert memory for their contacts | INSERT | authenticated | permissive |  | `public.is_contact_visible_to_user(contact_id, auth.uid())` |
| `conversation_memory` | Agents can update memory for their contacts | UPDATE | authenticated | permissive | `public.is_contact_visible_to_user(contact_id, auth.uid())` |  |
| `conversation_closures` | Agents can create closures for their contacts | INSERT | authenticated | permissive |  | `public.is_contact_visible_to_user(contact_id, auth.uid())` |
| `number_reputation` | Admins can insert reputation | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `number_reputation` | Admins can update reputation | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `talkx_blacklist` | Admins can add to blacklist | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `talkx_blacklist` | Admins can remove from blacklist | DELETE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `training_sessions` | Users can view own training sessions | SELECT | authenticated | permissive | `profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `training_sessions` | Users can insert own training sessions | INSERT | authenticated | permissive |  | `profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())` |
| `training_sessions` | Users can update own training sessions | UPDATE | authenticated | permissive | `profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `training_sessions` | Users can delete own training sessions | DELETE | authenticated | permissive | `profile_id = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `crisis_room_alerts` | Authenticated can view crisis alerts | SELECT | authenticated | permissive | `auth.uid() IS NOT NULL` |  |
| `crisis_room_alerts` | Admins can insert crisis alerts | INSERT | authenticated | permissive |  | `is_admin_or_supervisor(auth.uid())` |
| `crisis_room_alerts` | Admins can update crisis alerts | UPDATE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `crisis_room_alerts` | Admins can delete crisis alerts | DELETE | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `campaign_ab_variants` | Authenticated can view AB variants | SELECT | authenticated | permissive | `auth.uid() IS NOT NULL` |  |
| `campaign_ab_variants` | Campaign owners or admins can insert AB variants | INSERT | authenticated | permissive |  | `EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())) )` |
| `campaign_ab_variants` | Campaign owners or admins can update AB variants | UPDATE | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())) )` |  |
| `campaign_ab_variants` | Campaign owners or admins can delete AB variants | DELETE | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND (c.created_by = get_profile_id_for_user(auth.uid()) OR is_admin_or_supervisor(auth.uid())) )` |  |
| `conversation_memory` | Agents or admins can view memory | SELECT | authenticated | permissive | `is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `conversation_closures` | Agents or admins can view closures | SELECT | authenticated | permissive | `is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `conversation_events` | Agents or admins can view conversation events | SELECT | authenticated | permissive | `is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())` |  |
| `followup_sequences` | Admins can view followup sequences | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `followup_steps` | Admins can view followup steps | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `ai_conversation_tags` | Agents can delete tags on assigned contacts | DELETE | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.contacts c JOIN public.profiles p ON p.id = c.assigned_to WHERE c.id = ai_conversation_tags.contact_id AND p.user_id = auth.uid() ) OR public.is_admin_or_supervisor(auth.uid())` |  |
| `talkx_blacklist` | Only admins can view blacklist | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `campaigns` | Campaigns visible to admins or creator | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid()) OR created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |  |
| `sla_rules` | SLA rules visible to admins only | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `geo_blocking_settings` | Geo blocking visible to admins only | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `client_wallet_rules` | Wallet rules visible to admins only | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `automations` | Automations visible to admins only | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `queue_members` | Queue members visible to admins or self | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid()) OR profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)` |  |
| `ai_providers` | Admins can view AI providers | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `audit_logs` | Block direct audit log inserts | INSERT | authenticated | permissive |  | `false` |
| `user_roles` | Users view own roles, admins view all | SELECT | authenticated | permissive | `user_id = auth.uid() OR is_admin_or_supervisor(auth.uid())` |  |
| `channel_connections` | Admins full access to channels | ALL | authenticated | permissive | `has_role(auth.uid(), 'admin')` | `has_role(auth.uid(), 'admin')` |
| `password_reset_requests` | Admins can update reset requests without token access | UPDATE | authenticated | permissive | `has_role(auth.uid(), 'admin')` | `has_role(auth.uid(), 'admin')` |
| `password_reset_requests` | Admins can delete password reset requests | DELETE | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `gmail_accounts` | Users can view their own gmail accounts | SELECT | authenticated | permissive | `user_id = auth.uid()` |  |
| `message_reactions` | Users can view reactions on accessible messages | SELECT | authenticated | permissive | `message_id IN ( SELECT m.id FROM messages m WHERE m.contact_id IN ( SELECT c.id FROM contacts c WHERE c.assigned_to IN ( SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() ) OR c.assigned_to IS NULL ) ) OR is_admin_or_supervisor(auth.uid())` |  |
| `storage.objects` | Admins can delete team chat files | DELETE | authenticated | permissive | `((bucket_id = 'team-chat-files'::text) AND is_admin_or_supervisor(auth.uid()))` |  |
| `storage.objects` | Anyone can view stickers | SELECT | authenticated | permissive | `(bucket_id = 'stickers'::text)` |  |
| `storage.objects` | Auth upload custom emojis owned | INSERT | authenticated | permissive |  | `((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text)))` |
| `storage.objects` | Auth upload stickers owned | INSERT | authenticated | permissive |  | `((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text)))` |
| `storage.objects` | Public read audio memes | SELECT | authenticated | permissive | `(bucket_id = 'audio-memes'::text)` |  |
| `storage.objects` | Public read for custom emojis | SELECT | authenticated | permissive | `(bucket_id = 'custom-emojis'::text)` |  |
| `storage.objects` | Users can delete own audio messages | DELETE | authenticated | permissive | `((bucket_id = 'audio-messages'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))` |  |
| `storage.objects` | Users can delete own custom emojis | DELETE | authenticated | permissive | `((bucket_id = 'custom-emojis'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))` |  |
| `storage.objects` | Users can delete own stickers | DELETE | authenticated | permissive | `((bucket_id = 'stickers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))` |  |
| `storage.objects` | Users can delete their own avatar | DELETE | authenticated | permissive | `((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))` |  |
| `storage.objects` | Users can delete their own or assigned media | DELETE | authenticated | permissive | `((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))) )) OR ((storage.foldername(name))[1] = (auth.uid())::te …` |  |
| `storage.objects` | Users can update own audio messages | UPDATE | authenticated | permissive | `((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))) ))))` |  |
| `storage.objects` | Users can update own custom emojis | UPDATE | authenticated | permissive | `((bucket_id = 'custom-emojis'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text)))` |  |
| `storage.objects` | Users can update own stickers | UPDATE | authenticated | permissive | `((bucket_id = 'stickers'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] = (auth.uid())::text)))` |  |
| `storage.objects` | Users can upload assigned audio messages | INSERT | authenticated | permissive |  | `((bucket_id = 'audio-messages'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))) )) OR ((storage.foldername(name))[1] = (auth.uid())::te …` |
| `storage.objects` | Users can upload assigned whatsapp media | INSERT | authenticated | permissive |  | `((bucket_id = 'whatsapp-media'::text) AND (is_admin_or_supervisor(auth.uid()) OR ((storage.foldername(name))[1] IN ( SELECT (c.id)::text AS id FROM contacts c WHERE (c.assigned_to IN (SELECT p.id FROM profiles p WHERE (p.user_id = auth.uid()))) )) OR ((storage.foldername(name))[1] = (auth.uid())::te …` |
| `audio_meme_favorites` | Users manage own meme favorites | ALL | authenticated | permissive | `user_id = auth.uid()` | `user_id = auth.uid()` |
| … +268 linhas — lista completa em `context.json` | | | | | | |

## C. Restrições de dados (obrigatório / único / default / CHECK / FK / calculada)

| Tabela | Coluna | Regra |
|---|---|---|
| `ai_conversation_tags` | `id` | PK; default gen_random_uuid() |
| `ai_conversation_tags` | `contact_id` | obrigatório; FK → contacts.id |
| `ai_conversation_tags` | `created_at` | default now() |
| `calls` | `id` | PK; default gen_random_uuid() |
| `calls` | `contact_id` | FK → contacts.id ON DELETE SET NULL |
| `calls` | `agent_id` | FK → profiles.id ON DELETE SET NULL |
| `calls` | `whatsapp_connection_id` | FK → whatsapp_connections.id ON DELETE SET NULL |
| `calls` | `direction` | obrigatório; CHECK direction IN ('inbound', 'outbound') |
| `calls` | `status` | default 'ringing'; CHECK status IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed') |
| `calls` | `started_at` | default now() |
| `calls` | `created_at` | default now() |
| `calls` | `recording_status` | obrigatório |
| `calls` | `(tabela)` | constraint calls_provider_event_id_length CHECK (provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 200) NOT VALID |
| `calls` | `(tabela)` | constraint calls_channel_check check (channel is null or channel in ('voip', 'whatsapp')) not valid |
| `calls` | `(tabela)` | constraint calls_recording_status_check check (recording_status in ('none', 'pending', 'available', 'failed')) not valid |
| `calls` | `(tabela)` | constraint calls_end_reason_check check (end_reason is null or end_reason in ( 'completed', 'hangup_local', 'hangup_remote', 'no_answer', 'busy', 'busy_here', 'cancelled', 'cancelled_remote', 'declined', 'failed', 'timeout' )) not valid |
| `calls` | `(tabela)` | constraint calls_status_check check (status = any (array[ 'ringing', 'answered', 'ended', 'missed', 'busy', 'failed', 'cancelled', 'declined' ])) not valid |
| `campaign_contacts` | `id` | PK; default gen_random_uuid() |
| `campaign_contacts` | `campaign_id` | obrigatório; FK → campaigns.id ON DELETE CASCADE |
| `campaign_contacts` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `campaign_contacts` | `status` | default 'pending'; CHECK status IN ('pending', 'sent', 'delivered', 'read', 'failed') |
| `campaign_contacts` | `created_at` | default now() |
| `chatbot_executions` | `id` | PK; default gen_random_uuid() |
| `chatbot_executions` | `flow_id` | obrigatório; FK → chatbot_flows.id ON DELETE CASCADE |
| `chatbot_executions` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `chatbot_executions` | `status` | default 'running'; CHECK status IN ('running', 'completed', 'failed', 'paused', 'cancelled') |
| `chatbot_executions` | `variables` | default '{}'::jsonb |
| `chatbot_executions` | `started_at` | default now() |
| `chatbot_executions` | `created_at` | default now() |
| `contact_custom_fields` | `id` | PK; default gen_random_uuid() |
| `contact_custom_fields` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `contact_custom_fields` | `field_name` | obrigatório |
| `contact_custom_fields` | `field_type` | default 'text' |
| `contact_custom_fields` | `created_at` | default now() |
| `contact_custom_fields` | `updated_at` | default now() |
| `contact_notes` | `id` | PK; default gen_random_uuid() |
| `contact_notes` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `contact_notes` | `author_id` | FK → profiles.id ON DELETE CASCADE |
| `contact_notes` | `category` | obrigatório |
| `contact_notes` | `content` | obrigatório |
| `contact_notes` | `created_at` | obrigatório |
| `contact_notes` | `is_done` | obrigatório |
| `contact_notes` | `is_pinned` | obrigatório |
| `contact_notes` | `updated_at` | obrigatório |
| `conversation_analyses` | `id` | PK; default gen_random_uuid() |
| `conversation_analyses` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `conversation_analyses` | `analyzed_by` | FK → profiles.id |
| `conversation_analyses` | `summary` | obrigatório |
| `conversation_analyses` | `status` | default 'pendente' |
| `conversation_analyses` | `key_points` | default '{}' |
| `conversation_analyses` | `next_steps` | default '{}' |
| `conversation_analyses` | `sentiment_score` | default null |
| `conversation_analyses` | `topics` | default '{}' |
| `conversation_analyses` | `customer_satisfaction` | default null |
| `conversation_analyses` | `message_count` | default 0 |
| `conversation_analyses` | `created_at` | default now() |
| `conversation_analyses` | `department` | default 'outros' |
| `conversation_analyses` | `analysis_version` | obrigatório |
| `conversation_analyses` | `analyzed_at` | obrigatório |
| `conversation_analyses` | `(tabela)` | constraint conversation_analyses_sentiment_canonical check (public.ai_is_canonical_sentiment(sentiment)) not valid |
| `conversation_analyses` | `(tabela)` | constraint conversation_analyses_urgency_canonical check (public.ai_is_canonical_urgency(urgency)) not valid |
| `conversation_analyses` | `(tabela)` | constraint conversation_analyses_churn_risk_canonical check (public.ai_is_canonical_churn_risk(churn_risk)) not valid |
| `conversation_closures` | `id` | PK; default gen_random_uuid() |
| `conversation_closures` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `conversation_closures` | `closed_by` | FK → profiles.id ON DELETE SET NULL |
| `conversation_closures` | `close_reason` | obrigatório |
| `conversation_closures` | `created_at` | default now() |
| `conversation_events` | `id` | PK; default gen_random_uuid() |
| `conversation_events` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `conversation_events` | `event_type` | obrigatório |
| `conversation_events` | `from_agent_id` | FK → profiles.id |
| `conversation_events` | `to_agent_id` | FK → profiles.id |
| `conversation_events` | `from_queue_id` | FK → queues.id |
| `conversation_events` | `to_queue_id` | FK → queues.id |
| `conversation_events` | `metadata` | default '{}' |
| `conversation_events` | `performed_by` | FK → profiles.id |
| `conversation_events` | `created_at` | default now() |
| `conversation_events` | `closure_id` | FK → conversation_closures.id ON DELETE CASCADE |
| `conversation_events` | `(tabela)` | constraint conversation_events_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES public.conversation_closures(id) ON DELETE CASCADE NOT VALID, ADD CONSTRAINT conversation_events_closure_type_check CHECK (closure_id IS NULL OR event_type = 'close') NOT VALID |
| `conversation_memory` | `id` | PK; default gen_random_uuid() |
| `conversation_memory` | `contact_id` | obrigatório; único; FK → contacts.id ON DELETE CASCADE |
| `conversation_memory` | `facts` | default '[]'::jsonb |
| `conversation_memory` | `objections_handled` | default '[]'::jsonb |
| `conversation_memory` | `promises_made` | default '[]'::jsonb |
| `conversation_memory` | `pending_items` | default '[]'::jsonb |
| `conversation_memory` | `updated_by` | FK → profiles.id ON DELETE SET NULL |
| `conversation_memory` | `created_at` | default now() |
| `conversation_memory` | `updated_at` | default now() |
| `conversation_sla` | `id` | PK; default gen_random_uuid() |
| `conversation_sla` | `created_at` | obrigatório |
| `conversation_sla` | `first_message_at` | obrigatório |
| `conversation_sla` | `updated_at` | obrigatório |
| `conversation_snoozes` | `id` | PK; default gen_random_uuid() |
| `conversation_snoozes` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `conversation_snoozes` | `snoozed_by` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `conversation_snoozes` | `snooze_until` | obrigatório |
| `conversation_snoozes` | `created_at` | default now() |
| `conversation_tasks` | `id` | PK; default gen_random_uuid() |
| `conversation_tasks` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `conversation_tasks` | `created_at` | obrigatório |
| `conversation_tasks` | `created_by` | obrigatório |
| `conversation_tasks` | `position` | obrigatório |
| `conversation_tasks` | `priority` | obrigatório |
| `conversation_tasks` | `status_changed_at` | obrigatório |
| `conversation_tasks` | `title` | obrigatório |
| `conversation_tasks` | `updated_at` | obrigatório |
| `csat_surveys` | `id` | PK; default gen_random_uuid() |
| `csat_surveys` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `csat_surveys` | `agent_id` | obrigatório; FK → profiles.id ON DELETE SET NULL |
| `csat_surveys` | `rating` | obrigatório |
| `csat_surveys` | `created_at` | default now() |
| `csat_surveys` | `send_at` | obrigatório |
| `csat_surveys` | `status` | obrigatório |
| `email_threads` | `id` | PK; default gen_random_uuid() |
| `email_threads` | `gmail_account_id` | obrigatório; FK → gmail_accounts.id ON DELETE CASCADE |
| `email_threads` | `gmail_thread_id` | obrigatório |
| `email_threads` | `contact_id` | FK → contacts.id ON DELETE SET NULL |
| `email_threads` | `subject` | default '' |
| `email_threads` | `snippet` | default '' |
| `email_threads` | `label_ids` | default '{}' |
| `email_threads` | `message_count` | default 0 |
| `email_threads` | `is_unread` | default true |
| `email_threads` | `is_starred` | default false |
| `email_threads` | `is_important` | default false |
| `email_threads` | `last_message_at` | default now() |
| `email_threads` | `status` | default 'open' |
| `email_threads` | `priority` | default 'medium' |
| `email_threads` | `tags` | default '{}' |
| `email_threads` | `created_at` | default now() |
| `email_threads` | `updated_at` | default now() |
| `email_threads` | `(tabela)` | UNIQUE(gmail_account_id, gmail_thread_id) |
| `favorite_contacts` | `id` | PK; default gen_random_uuid() |
| `favorite_contacts` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `favorite_contacts` | `user_id` | obrigatório; FK → users.id ON DELETE CASCADE |
| `favorite_contacts` | `created_at` | default now() |
| `favorite_contacts` | `(tabela)` | UNIQUE(contact_id, user_id) |
| `followup_executions` | `id` | PK; default gen_random_uuid() |
| `followup_executions` | `sequence_id` | obrigatório; FK → followup_sequences.id |
| `followup_executions` | `contact_id` | obrigatório; FK → contacts.id |
| `followup_executions` | `current_step` | default 0 |
| `followup_executions` | `status` | default 'pending' |
| `followup_executions` | `started_at` | default now() |
| `followup_executions` | `created_at` | default now() |
| `message_reactions` | `id` | PK; default gen_random_uuid() |
| `message_reactions` | `created_at` | obrigatório |
| `message_reactions` | `emoji` | obrigatório |
| `message_reactions` | `message_id` | obrigatório |
| `messages` | `id` | PK; default gen_random_uuid() |
| `messages` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `messages` | `content` | obrigatório |
| `messages` | `created_at` | obrigatório |
| `messages` | `delivery_attempt_count` | obrigatório |
| `messages` | `is_edited` | obrigatório |
| `messages` | `message_type` | obrigatório |
| `messages` | `sender` | obrigatório |
| `messages` | `updated_at` | obrigatório |
| `meta_capi_events` | `id` | PK; default gen_random_uuid() |
| `meta_capi_events` | `event_name` | obrigatório |
| `meta_capi_events` | `event_time` | default now() |
| `meta_capi_events` | `contact_id` | FK → contacts.id ON DELETE SET NULL |
| `meta_capi_events` | `action_source` | default 'chat' |
| `meta_capi_events` | `custom_data` | default '{}' |
| `meta_capi_events` | `sent_to_meta` | default false |
| `meta_capi_events` | `created_at` | default now() |
| `nps_surveys` | `id` | PK; default gen_random_uuid() |
| `nps_surveys` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `nps_surveys` | `agent_id` | FK → profiles.id |
| `nps_surveys` | `score` | obrigatório; CHECK score >= 0 AND score <= 10 |
| `nps_surveys` | `survey_type` | default 'manual'; CHECK survey_type IN ('periodic', 'post_resolution', 'manual') |
| `nps_surveys` | `created_at` | default now() |
| `pinned_conversations` | `id` | PK; default gen_random_uuid() |
| `pinned_conversations` | `contact_id` | obrigatório; FK → contacts.id ON DELETE CASCADE |
| `pinned_conversations` | `pinned_by` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `pinned_conversations` | `position` | default 0 |
| `pinned_conversations` | `created_at` | default now() |
| `pinned_conversations` | `(tabela)` | UNIQUE(contact_id, pinned_by) |
| `queue_positions` | `id` | PK; default gen_random_uuid() |
| `queue_positions` | `contact_id` | obrigatório |
| `queue_positions` | `position` | obrigatório |
| `queue_positions` | `queue_id` | obrigatório |
| `reminders` | `id` | PK; default gen_random_uuid() |
| `reminders` | `contact_id` | FK → contacts.id ON DELETE SET NULL |
| `reminders` | `profile_id` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `reminders` | `title` | obrigatório |
| `reminders` | `remind_at` | obrigatório |
| `reminders` | `is_dismissed` | default false |
| `reminders` | `created_at` | default now() |
| `reminders` | `migrated_task_id` | FK → conversation_tasks.id ON DELETE SET NULL |
| `sales_deals` | `id` | PK; default gen_random_uuid() |
| `sales_deals` | `title` | obrigatório |
| `sales_deals` | `value` | default 0 |
| `sales_deals` | `currency` | default 'BRL' |
| `sales_deals` | `stage_id` | FK → sales_pipeline_stages.id ON DELETE SET NULL |
| `sales_deals` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `sales_deals` | `assigned_to` | FK → profiles.id ON DELETE SET NULL |
| `sales_deals` | `priority` | default 'medium' |
| `sales_deals` | `tags` | default '{}' |
| `sales_deals` | `status` | default 'open' |
| `sales_deals` | `created_at` | default now() |
| `sales_deals` | `updated_at` | default now() |
| `scheduled_messages` | `id` | PK; default gen_random_uuid() |
| `scheduled_messages` | `contact_id` | obrigatório |
| `scheduled_messages` | `content` | obrigatório |
| `scheduled_messages` | `created_at` | obrigatório |
| `scheduled_messages` | `message_type` | obrigatório |
| `scheduled_messages` | `scheduled_at` | obrigatório |
| `scheduled_messages` | `status` | obrigatório |
| `scheduled_messages` | `updated_at` | obrigatório |
| `sicoob_contact_mapping` | `id` | PK; default gen_random_uuid() |
| `sicoob_contact_mapping` | `contact_id` | obrigatório |
| `sicoob_contact_mapping` | `sicoob_singular_id` | obrigatório |
| `sicoob_contact_mapping` | `sicoob_user_id` | obrigatório |
| `sicoob_contact_mapping` | `sicoob_vendedor_id` | obrigatório |
| `sla_rules` | `id` | PK; default gen_random_uuid() |
| `sla_rules` | `name` | obrigatório |
| `sla_rules` | `first_response_minutes` | default 5 |
| `sla_rules` | `resolution_minutes` | default 60 |
| `sla_rules` | `priority` | default 0 |
| `sla_rules` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `sla_rules` | `queue_id` | FK → queues.id ON DELETE CASCADE |
| `sla_rules` | `agent_id` | FK → profiles.id ON DELETE CASCADE |
| `sla_rules` | `is_active` | default true |
| `sla_rules` | `created_at` | default now() |
| `sla_rules` | `updated_at` | default now() |
| `sla_rules` | `metadata` | default '{}'::jsonb |
| `talkx_blacklist` | `created_at` | obrigatório |
| `talkx_blacklist` | `id` | obrigatório |
| `talkx_blacklist` | `origin` | obrigatório |
| `talkx_recipients` | `id` | PK |
| `talkx_recipients` | `campaign_id` | obrigatório; FK → talkx_campaigns.id |
| `talkx_recipients` | `status` | default 'pending' |
| `talkx_recipients` | `attempt_count` | default 0 |
| `talkx_recipients` | `created_at` | default statement_timestamp() |
| `talkx_recipients` | `updated_at` | default statement_timestamp() |
| `talkx_recipients` | `click_count` | obrigatório |
| `talkx_recipients` | `delivery_attempt_count` | obrigatório |
| `talkx_recipients` | `manual_retry_count` | obrigatório |
| `talkx_recipients` | `status_changed_at` | obrigatório |
| `whisper_messages` | `id` | PK; default gen_random_uuid() |
| `whisper_messages` | `contact_id` | obrigatório; FK → contacts.id |
| `whisper_messages` | `sender_id` | obrigatório; FK → profiles.id |
| `whisper_messages` | `target_agent_id` | obrigatório; FK → profiles.id |
| `whisper_messages` | `content` | obrigatório |
| `whisper_messages` | `is_read` | default false |
| `whisper_messages` | `created_at` | default now() |
| `whisper_messages` | `(tabela)` | constraint whisper_messages_audio_path_formato check ( audio_path is null or audio_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$' ) |
| `whisper_messages` | `(tabela)` | constraint whisper_messages_audio_path_do_remetente check ( audio_path is null or split_part(audio_path, '/', 2) = contact_id::text ) |
| `contacts` | `id` | PK; default gen_random_uuid() |
| `contacts` | `conversation_status` | obrigatório |
| `contacts` | `created_at` | obrigatório |
| `contacts` | `is_lid_legacy` | obrigatório |
| `contacts` | `name` | obrigatório |
| `contacts` | `phone` | obrigatório |
| `contacts` | `updated_at` | obrigatório |
| `email_labels` | `id` | PK; default gen_random_uuid() |
| `email_labels` | `gmail_account_id` | obrigatório; FK → gmail_accounts.id ON DELETE CASCADE |
| `email_labels` | `gmail_label_id` | obrigatório |
| `email_labels` | `name` | obrigatório |
| `email_labels` | `label_type` | default 'user' |
| `email_labels` | `message_count` | default 0 |
| `email_labels` | `unread_count` | default 0 |
| `email_labels` | `created_at` | default now() |
| `email_labels` | `(tabela)` | UNIQUE(gmail_account_id, gmail_label_id) |
| `email_messages` | `id` | PK; default gen_random_uuid() |
| `email_messages` | `thread_id` | obrigatório; FK → email_threads.id ON DELETE CASCADE |
| `email_messages` | `gmail_message_id` | obrigatório |
| `email_messages` | `gmail_account_id` | obrigatório; FK → gmail_accounts.id ON DELETE CASCADE |
| `email_messages` | `from_address` | default '' |
| `email_messages` | `to_addresses` | default '{}' |
| `email_messages` | `cc_addresses` | default '{}' |
| `email_messages` | `bcc_addresses` | default '{}' |
| `email_messages` | `subject` | default '' |
| `email_messages` | `body_text` | default '' |
| `email_messages` | `body_html` | default '' |
| `email_messages` | `snippet` | default '' |
| `email_messages` | `label_ids` | default '{}' |
| `email_messages` | `is_read` | default false |
| `email_messages` | `is_starred` | default false |
| `email_messages` | `has_attachments` | default false |
| `email_messages` | `internal_date` | default now() |
| `email_messages` | `direction` | default 'inbound' |
| `email_messages` | `created_at` | default now() |
| `email_messages` | `(tabela)` | UNIQUE(gmail_account_id, gmail_message_id) |
| `email_messages` | `(tabela)` | constraint email_messages_from_format CHECK ( from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' ) |
| `email_messages` | `(tabela)` | constraint email_messages_direction_check CHECK ( direction IN ('inbound', 'outbound') ) |
| `entity_versions` | `id` | PK; default gen_random_uuid() |
| `entity_versions` | `entity_type` | obrigatório |
| `entity_versions` | `entity_id` | obrigatório |
| `entity_versions` | `version_number` | obrigatório |
| `entity_versions` | `data` | default '{}'::jsonb |
| `entity_versions` | `created_at` | default now() |
| `entity_versions` | `(tabela)` | UNIQUE(entity_type, entity_id, version_number) |
| `gmail_accounts` | `id` | PK; default gen_random_uuid() |
| `gmail_accounts` | `created_at` | obrigatório |
| `gmail_accounts` | `email_address` | obrigatório |
| `gmail_accounts` | `error_count` | obrigatório |
| `gmail_accounts` | `is_active` | obrigatório |
| `gmail_accounts` | `sync_status` | obrigatório |
| `gmail_accounts` | `updated_at` | obrigatório |
| `saved_filters` | `id` | PK; default gen_random_uuid() |
| … +1346 linhas — lista completa em `context.json` | | |

## D. Automações no banco (triggers e funções — regras que rodam sozinhas)

| Trigger | Quando | Tabela | Executa | Condição |
|---|---|---|---|---|
| on_auth_user_created | AFTER INSERT | `auth.users` | `handle_new_user` |  |
| on_auth_user_created_role | AFTER INSERT | `auth.users` | `handle_new_user_role` |  |
| on_contact_created_auto_assign | BEFORE INSERT | `contacts` | `auto_assign_contact` |  |
| on_contact_queue_auto_assign | BEFORE INSERT | `contacts` | `auto_assign_to_queue_agent` |  |
| on_profile_created_init_stats | AFTER INSERT | `profiles` | `init_agent_stats` |  |
| on_device_update_last_seen | BEFORE UPDATE | `user_devices` | `update_device_last_seen` |  |
| update_contacts_updated_at | BEFORE UPDATE | `contacts` | `update_updated_at_column` |  |
| update_profiles_updated_at | BEFORE UPDATE | `profiles` | `update_updated_at_column` |  |
| update_tags_updated_at | BEFORE UPDATE | `tags` | `update_updated_at_column` |  |
| update_whatsapp_connections_updated_at | BEFORE UPDATE | `whatsapp_connections` | `update_updated_at_column` |  |
| update_whatsapp_groups_updated_at | BEFORE UPDATE | `whatsapp_groups` | `update_updated_at_column` |  |
| update_products_updated_at | BEFORE UPDATE | `products` | `update_updated_at_column` |  |
| update_campaigns_updated_at | BEFORE UPDATE | `campaigns` | `update_updated_at_column` |  |
| update_chatbot_flows_updated_at | BEFORE UPDATE | `chatbot_flows` | `update_updated_at_column` |  |
| update_sla_configurations_updated_at | BEFORE UPDATE | `sla_configurations` | `update_updated_at_column` |  |
| update_user_settings_updated_at | BEFORE UPDATE | `user_settings` | `update_updated_at_column` |  |
| update_business_hours_updated_at | BEFORE UPDATE | `business_hours` | `update_updated_at_column` |  |
| update_away_messages_updated_at | BEFORE UPDATE | `away_messages` | `update_updated_at_column` |  |
| update_scheduled_messages_updated_at | BEFORE UPDATE | `scheduled_messages` | `update_updated_at_column` |  |
| update_whatsapp_templates_updated_at | BEFORE UPDATE | `whatsapp_templates` | `update_updated_at_column` |  |
| update_contact_notes_updated_at | BEFORE UPDATE | `contact_notes` | `update_updated_at_column` |  |
| update_agent_stats_updated_at | BEFORE UPDATE | `agent_stats` | `update_updated_at_column` |  |
| update_queue_goals_updated_at | BEFORE UPDATE | `queue_goals` | `update_updated_at_column` |  |
| update_auto_close_config_updated_at | BEFORE UPDATE | `auto_close_config` | `update_updated_at_column` |  |
| update_scheduled_reports_updated_at | BEFORE UPDATE | `scheduled_reports` | `update_updated_at_column` |  |
| update_conversation_sla_updated_at | BEFORE UPDATE | `conversation_sla` | `update_updated_at_column` |  |
| update_goals_configurations_updated_at | BEFORE UPDATE | `goals_configurations` | `update_updated_at_column` |  |
| update_geo_blocking_settings_updated_at | BEFORE UPDATE | `geo_blocking_settings` | `update_updated_at_column` |  |
| update_message_templates_updated_at | BEFORE UPDATE | `message_templates` | `update_updated_at_column` |  |
| update_saved_filters_updated_at | BEFORE UPDATE | `saved_filters` | `update_updated_at_column` |  |
| ensure_single_default_filter_trigger | BEFORE INSERT OR UPDATE | `saved_filters` | `ensure_single_default_filter` |  |
| update_contact_custom_fields_updated_at | BEFORE UPDATE | `contact_custom_fields` | `update_updated_at_column` |  |
| trigger_global_settings_updated_at | BEFORE UPDATE | `global_settings` | `update_global_settings_updated_at` |  |
| update_sales_deals_updated_at | BEFORE UPDATE | `sales_deals` | `update_updated_at_column` |  |
| update_payment_links_updated_at | BEFORE UPDATE | `payment_links` | `update_updated_at_column` |  |
| update_kb_articles_updated_at | BEFORE UPDATE | `knowledge_base_articles` | `update_updated_at_column` |  |
| update_whatsapp_flows_updated_at | BEFORE UPDATE | `whatsapp_flows` | `update_updated_at_column` |  |
| update_pipeline_stages_updated_at | BEFORE UPDATE | `sales_pipeline_stages` | `update_updated_at_column` |  |
| update_automations_updated_at | BEFORE UPDATE | `automations` | `update_updated_at_column` |  |
| update_scheduled_report_configs_updated_at | BEFORE UPDATE | `scheduled_report_configs` | `update_updated_at_column` |  |
| prevent_privilege_escalation | BEFORE UPDATE | `profiles` | `prevent_profile_privilege_escalation` |  |
| update_channel_connections_updated_at | BEFORE UPDATE | `channel_connections` | `update_updated_at_column` |  |
| update_team_conversations_updated_at | BEFORE UPDATE | `team_conversations` | `update_updated_at_column` |  |
| update_team_messages_updated_at | BEFORE UPDATE | `team_messages` | `update_updated_at_column` |  |
| update_gmail_accounts_updated_at | BEFORE UPDATE | `gmail_accounts` | `update_updated_at_column` |  |
| update_email_threads_updated_at | BEFORE UPDATE | `email_threads` | `update_updated_at_column` |  |
| update_user_service_accounts_updated_at | BEFORE UPDATE | `user_service_accounts` | `update_updated_at_column` |  |
| clear_qr_on_connect_trigger | BEFORE UPDATE OF STATUS | `whatsapp_connections` | `clear_qr_on_connect` |  |
| update_sla_rules_updated_at | BEFORE UPDATE | `sla_rules` | `update_updated_at_column` |  |
| update_ai_providers_updated_at | BEFORE UPDATE | `ai_providers` | `update_updated_at_column` |  |
| ensure_single_default_ai_provider | BEFORE INSERT OR UPDATE | `ai_providers` | `ensure_single_default_ai_provider` |  |
| update_talkx_campaigns_updated_at | BEFORE UPDATE | `talkx_campaigns` | `update_updated_at_column` |  |
| update_talkx_recipients_updated_at | BEFORE UPDATE | `talkx_recipients` | `update_updated_at_column` |  |
| update_conversation_tasks_updated_at | BEFORE UPDATE | `conversation_tasks` | `update_updated_at_column` |  |
| update_conversation_memory_updated_at | BEFORE UPDATE | `conversation_memory` | `update_updated_at_column` |  |
| update_playbooks_updated_at | BEFORE UPDATE | `playbooks` | `update_updated_at_column` |  |
| update_number_reputation_updated_at | BEFORE UPDATE | `number_reputation` | `update_updated_at_column` |  |
| update_contact_purchases_updated_at | BEFORE UPDATE | `contact_purchases` | `update_updated_at_column` |  |
| trg_log_assignment_change | AFTER UPDATE | `contacts` | `log_assignment_change` |  |
| trg_normalize_contact_phone | BEFORE INSERT OR UPDATE OF PHONE | `contacts` | `normalize_contact_phone` |  |
| update_link_preview_cache_updated_at | BEFORE UPDATE | `link_preview_cache` | `update_updated_at_column` |  |
| audit_role_permissions_changes | AFTER INSERT OR DELETE | `role_permissions` | `audit_role_permissions_changes` |  |
| sync_profile_role | AFTER INSERT OR UPDATE OR DELETE | `user_roles` | `sync_profile_role_from_user_roles` |  |
| update_level_on_xp_insert | BEFORE INSERT | `agent_stats` | `update_agent_level` |  |
| trg_messages_sla_first_response | AFTER INSERT OR UPDATE OF STATUS | `messages` | `messages_sla_first_response_trigger` | `NEW.contact_id IS NOT NULL AND NEW.sender = 'agent' AND NEW.status = 'sent'` |
| feature_flags_set_updated_at | BEFORE UPDATE | `feature_flags` | `update_updated_at_column` |  |
| trg_contacts_fsm_transition | BEFORE UPDATE | `contacts` | `enforce_conversation_status_transition` | `OLD.conversation_status IS DISTINCT FROM NEW.conversation_status` |
| update_talkx_segments_updated_at | BEFORE UPDATE | `talkx_segments` | `update_updated_at_column` |  |
| trg_enqueue_crm_sync_from_closure | AFTER INSERT | `conversation_closures` | `enqueue_crm_sync_from_closure` |  |
| trg_redact_crm_sync_on_contact_delete | BEFORE DELETE | `contacts` | `redact_crm_sync_on_contact_delete` |  |
| trg_validate_talkx_template_input | BEFORE INSERT OR UPDATE | `talkx_templates` | `validate_talkx_template_input` |  |
| update_talkx_templates_updated_at | BEFORE UPDATE | `talkx_templates` | `set_talkx_template_updated_at` |  |
| trg_guard_talkx_template_update | BEFORE UPDATE | `talkx_templates` | `guard_talkx_template_update` |  |
| trg_guard_talkx_template_version_immutable | BEFORE INSERT OR UPDATE OR DELETE | `talkx_template_versions` | `guard_talkx_template_version_immutable` |  |
| trg_guard_message_delivery_internal_fields | BEFORE INSERT OR UPDATE | `messages` | `guard_message_delivery_internal_fields` |  |
| trg_guard_conversation_closure_request_id | BEFORE INSERT OR UPDATE | `conversation_closures` | `guard_conversation_closure_request_id` |  |
| trg_guard_conversation_event_closure_id | BEFORE INSERT OR UPDATE | `conversation_events` | `guard_conversation_event_closure_id` |  |
| enforce_talkx_recipient_snapshot_mutability | BEFORE INSERT OR UPDATE OR DELETE | `talkx_recipients` | `enforce_talkx_recipient_snapshot_mutability` |  |
| trg_talkx_template_use_count | AFTER INSERT OR UPDATE OF STATUS | `talkx_campaigns` | `trg_talkx_increment_template_use_count` |  |
| trg_talkx_replied_count | AFTER UPDATE OF REPLIED_AT | `talkx_recipients` | `trg_talkx_increment_replied_count` |  |
| trg_prevent_conversation_task_field_forgery | BEFORE UPDATE | `conversation_tasks` | `prevent_conversation_task_field_forgery` | `NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.created_by IS DISTINCT FROM OLD.created_by` |
| trg_prevent_contact_queue_hijack | BEFORE UPDATE | `contacts` | `prevent_contact_queue_hijack` | `NEW.queue_id IS DISTINCT FROM OLD.queue_id` |
| trg_prevent_contact_assignee_hijack | BEFORE UPDATE | `contacts` | `prevent_contact_assignee_hijack` | `NEW.assigned_to IS DISTINCT FROM OLD.assigned_to` |
| trg_gamification_on_message_sent | AFTER INSERT | `messages` | `handle_message_gamification` |  |
| trg_set_scheduled_report_config_owner | BEFORE INSERT | `scheduled_report_configs` | `set_scheduled_report_config_owner` |  |
| update_multiplix_dispatches_updated_at | BEFORE UPDATE | `multiplix_dispatches` | `update_updated_at_column` |  |
| update_multiplix_recipients_updated_at | BEFORE UPDATE | `multiplix_recipients` | `update_updated_at_column` |  |
| after_team_message_insert_bump_conversation | AFTER INSERT | `team_messages` | `bump_conversation_updated_at` |  |
| update_multiplix_blocks_updated_at | BEFORE UPDATE | `multiplix_blocks` | `update_updated_at_column` |  |
| trg_gamification_on_closure | AFTER INSERT OR UPDATE OF CLOSED_BY | `conversation_closures` | `handle_conversation_closure_gamification` |  |
| on_agent_stats_update_level | BEFORE UPDATE OF XP | `agent_stats` | `update_agent_level` |  |
| trg_sync_contact_status_on_closure | AFTER INSERT | `conversation_closures` | `sync_contact_status_on_closure` |  |
| trg_task_state_change | BEFORE UPDATE | `conversation_tasks` | `conversation_task_state_trigger` | `NEW.status IS DISTINCT FROM OLD.status` |
| trg_task_set_assignee | BEFORE INSERT | `conversation_tasks` | `conversation_task_set_assignee` |  |
| team_message_receipts_update_guard_trig | BEFORE UPDATE | `team_message_receipts` | `team_message_receipts_update_guard` |  |
| department_audit_logs_fill_profile_name_trig | BEFORE INSERT | `department_audit_logs` | `department_audit_logs_fill_profile_name` |  |
| team_messages_validate_reply_to_trig | BEFORE INSERT OR UPDATE | `team_messages` | `team_messages_validate_reply_to` |  |
| team_messages_edit_guard_trig | BEFORE UPDATE OF CONTENT | `team_messages` | `team_messages_edit_guard` |  |
| team_reactions_dedup_trig | BEFORE INSERT | `team_message_reactions` | `team_reactions_dedup_guard` |  |
| team_receipts_no_own_sender_trig | BEFORE INSERT | `team_message_receipts` | `team_receipts_no_own_sender` |  |
| enforce_multiplix_dispatch_mutability | BEFORE INSERT OR UPDATE OR DELETE | `multiplix_dispatches` | `enforce_multiplix_dispatch_mutability` |  |
| enforce_multiplix_recipient_mutability | BEFORE INSERT OR UPDATE OR DELETE | `multiplix_recipients` | `enforce_multiplix_recipient_mutability` |  |
| trg_audit_contact_deletion_change | AFTER UPDATE OF DELETED_AT | `contacts` | `audit_contact_deletion_change` |  |
| trg_audit_contact_purge | AFTER DELETE | `contacts` | `audit_contact_deletion_change` |  |
| update_multiplix_delivery_items_updated_at | BEFORE UPDATE | `multiplix_delivery_items` | `update_updated_at_column` |  |
| trg_guard_multiplix_event_immutable | BEFORE UPDATE OR DELETE | `multiplix_events` | `guard_multiplix_event_immutable` |  |
| trg_multiplix_audiences_validate_shared_roles | BEFORE INSERT OR UPDATE | `multiplix_audiences` | `multiplix_audiences_validate_shared_roles` |  |
| update_multiplix_audiences_updated_at | BEFORE UPDATE | `multiplix_audiences` | `update_updated_at_column` |  |
| trg_multiplix_bump_version_on_dispatch_edit | BEFORE UPDATE | `multiplix_dispatches` | `multiplix_bump_version_on_dispatch_edit` |  |
| trg_multiplix_bump_version_on_block_change | AFTER INSERT OR UPDATE OR DELETE | `multiplix_blocks` | `multiplix_bump_version_on_block_change` |  |
| record_talkx_campaign_lifecycle_event | AFTER INSERT OR UPDATE | `talkx_campaigns` | `record_talkx_campaign_lifecycle_event` |  |
| trg_user_sessions_auth_session_guard | BEFORE INSERT OR UPDATE OF AUTH_SESSION_ID | `user_sessions` | `trg_user_sessions_auth_session_guard` |  |
| trg_revoke_sessions_on_profile_deactivate | AFTER UPDATE OF IS_ACTIVE | `profiles` | `trg_revoke_sessions_on_profile_deactivate` |  |
| trg_guard_message_provenance_fields | BEFORE INSERT OR UPDATE | `messages` | `guard_message_provenance_fields` |  |
| trg_talkx_recipients_status_changed_at | BEFORE UPDATE OF STATUS | `talkx_recipients` | `set_talkx_recipient_status_changed_at` |  |
| enforce_talkx_campaign_mutability | BEFORE INSERT OR DELETE OR UPDATE | `talkx_campaigns` | `enforce_talkx_campaign_mutability` |  |
| guard_talkx_campaign_recurrence_series | BEFORE INSERT OR UPDATE | `talkx_campaigns` | `guard_talkx_campaign_recurrence_series` |  |
| message_reactions_normalize_author | BEFORE INSERT OR UPDATE | `message_reactions` | `message_reactions_normalize_author` |  |
| department_invitations_code_format_insert_trg | BEFORE INSERT | `department_invitations` | `enforce_department_invitations_code_format_on_insert` |  |
| trg_reject_repeated_conversation_closure_without_reopen | BEFORE INSERT | `conversation_closures` | `reject_repeated_conversation_closure_without_reopen` |  |
| talkx_segment_versions_trim | AFTER INSERT | `talkx_segment_versions` | `talkx_segment_versions_trim` |  |
| talkx_segments_usage_guard | BEFORE UPDATE OR DELETE | `talkx_segments` | `talkx_segment_block_in_use` |  |
| trg_prevent_call_contact_redirect | BEFORE UPDATE | `calls` | `prevent_call_contact_redirect` | `NEW.contact_id IS DISTINCT FROM OLD.contact_id` |
| team_receipts_fill_conversation_id_trig | BEFORE INSERT OR UPDATE | `team_message_receipts` | `team_receipts_fill_conversation_id` |  |
| trg_talkx_recipients_failed_at | BEFORE INSERT OR UPDATE OF STATUS | `talkx_recipients` | `trg_talkx_recipients_failed_at` |  |
| trg_conversation_events_default_performed_by | BEFORE INSERT | `conversation_events` | `conversation_events_default_performed_by` |  |
| trg_talkx_blacklist_audit | BEFORE INSERT OR UPDATE | `talkx_blacklist` | `talkx_blacklist_audit_trigger` |  |
| trg_talkx_blacklist_no_delete | BEFORE DELETE | `talkx_blacklist` | `talkx_blacklist_no_delete` |  |
| trg_conversation_event_assign_performed_by | BEFORE INSERT | `conversation_events` | `conversation_event_assign_performed_by` |  |
| message_pins_force_contact_id | BEFORE INSERT OR UPDATE | `message_pins` | `message_pins_force_contact_id` |  |
| sla_alert_preferences_set_updated_at | BEFORE UPDATE | `sla_alert_preferences` | `update_updated_at_column` |  |
| queues_prevent_overflow_cycle | BEFORE INSERT OR UPDATE OF OVERFLOW_QUEUE_ID | `queues` | `queues_prevent_overflow_cycle` |  |
| queue_overflow_rewrite | AFTER INSERT OR UPDATE OF QUEUE_ID | `contacts` | `queue_overflow_rewrite` |  |
| trg_task_rearm_on_remind_change | BEFORE UPDATE OF REMIND_AT | `conversation_tasks` | `conversation_task_rearm_on_remind_change` | `NEW.remind_at IS DISTINCT FROM OLD.remind_at` |
| prevent_can_download_escalation | BEFORE UPDATE | `profiles` | `prevent_can_download_escalation` |  |
| set_email_signatures_updated_at | BEFORE UPDATE | `email_signatures` | `update_updated_at_column` |  |
| trg_audit_contact_block_change | AFTER UPDATE OF BLOCKED_AT | `contacts` | `audit_contact_block_change` |  |
| set_connection_alert_preferences_updated_at | BEFORE UPDATE | `connection_alert_preferences` | `update_updated_at_column` |  |
| trg_conversation_reopen_on_inbound | AFTER INSERT | `messages` | `handle_inbound_message_reopen` | `new.sender = 'contact' and new.contact_id is not null and new.is_deleted is not true` |
| trg_voip_profile_credentials_updated_at | BEFORE UPDATE | `voip_profile_credentials` | `update_updated_at_column` |  |
| guard_contact_purchase_identity_insert | BEFORE INSERT | `contact_purchases` | `guard_contact_purchase_identity` |  |
| audit_queues_config | AFTER INSERT OR UPDATE OR DELETE | `queues` | `audit_operational_config` |  |
| audit_queue_members_config | AFTER INSERT OR UPDATE OR DELETE | `queue_members` | `audit_operational_config` |  |
| audit_connection_queues_config | AFTER INSERT OR UPDATE OR DELETE | `whatsapp_connection_queues` | `audit_operational_config` |  |
| audit_rate_limit_configs_config | AFTER INSERT OR UPDATE OR DELETE | `rate_limit_configs` | `audit_operational_config` |  |
| trg_contacts_consent_status_guard | BEFORE UPDATE OF CONSENT_STATUS | `contacts` | `enforce_contacts_consent_status_guard` |  |
| trg_messages_stamp_transcribed_at | BEFORE UPDATE | `messages` | `stamp_message_transcribed_at` |  |
| whisper_messages_valida_audio_path | BEFORE INSERT OR UPDATE OF AUDIO_PATH | `whisper_messages` | `whisper_messages_valida_audio_path` |  |
| enforce_saved_filters_inbox_limite_trigger | BEFORE INSERT OR UPDATE | `saved_filters` | `enforce_saved_filters_inbox_limite` |  |
| team_reactions_force_conversation_id_trig | BEFORE INSERT OR UPDATE | `team_message_reactions` | `team_reactions_force_conversation_id` |  |
| trg_copilot_sessions_updated_at | BEFORE UPDATE | `copilot_sessions` | `copilot_sessions_updated_at` |  |
| update_queues_updated_at | BEFORE UPDATE | `queues` | `update_updated_at_column` |  |
| update_rate_limit_configs_updated_at | BEFORE UPDATE | `rate_limit_configs` | `update_updated_at_column` |  |
| update_messages_updated_at | BEFORE UPDATE | `messages` | `update_updated_at_column` |  |
| sanitize_reset_request_trigger | BEFORE INSERT | `password_reset_requests` | `sanitize_reset_request` |  |
| trg_rate_limit_reset | BEFORE INSERT | `password_reset_requests` | `rate_limit_reset_requests` |  |

Erros lançados por funções SQL (`RAISE EXCEPTION` = regra de negócio no banco):

| Função | Mensagem | Origem |
|---|---|---|
| `get_channel_credentials_safe` | Access denied: admin role required | `supabase/migrations/20260404173531_a535b696-2e46-42d5-84bb-9ee0ed43fa83.sql` |
| `protect_reset_token` | Cannot modify reset_token via client | `supabase/migrations/20260411111338_3f9f51ba-865c-498d-92f2-dfa981aae78e.sql` |
| `fn_toggle_user_meme_favorite` | Not authenticated | `supabase/migrations/20260619191426_101f55ed-e160-462e-9c33-a7f8f2dae8cf.sql` |
| `fn_send_audio_meme` | Not authenticated | `supabase/migrations/20260619191426_101f55ed-e160-462e-9c33-a7f8f2dae8cf.sql` |
| `fn_send_audio_meme` | Meme not found | `supabase/migrations/20260619191426_101f55ed-e160-462e-9c33-a7f8f2dae8cf.sql` |
| `reassign_absent_agents` | reassign_absent_agents: requer perfil admin ou supervisor | `supabase/migrations/20260829040000_fix_reassign_absent_agents_last_seen_at.sql` |
| `decrypt_gmail_token` | gmail_encryption_key ausente no vault; decrypt_gmail_token abortado | `supabase/migrations/20260903180000_fix_gmail_pgcrypto_schema.sql` |
| `encrypt_gmail_token` | gmail_encryption_key ausente no vault; encrypt_gmail_token abortado | `supabase/migrations/20260903180000_fix_gmail_pgcrypto_schema.sql` |
| `mark_first_response` | nao autorizado para o contato % | `supabase/migrations/20260903225000_sla_first_response_v2.sql` |
| `get_identity_matrix` | Access denied: admin or supervisor role required | `supabase/migrations/20260904320000_fix_critical_security_functions.sql` |
| `complete_crm_sync_outbox` | crm_sync_outbox_lease_lost | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `get_crm_sync_health` | insufficient_privilege | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `upsert_crm_contact_link_guarded` | insufficient_privilege | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `upsert_crm_contact_link_guarded` | invalid_crm_link | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `upsert_crm_contact_link_guarded` | contact_not_found | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `upsert_crm_contact_link_guarded` | crm_contact_link_conflict | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `upsert_crm_contact_link_guarded` | crm_contact_link_conflict | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `fail_crm_sync_outbox` | crm_sync_outbox_lease_lost | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `cleanup_crm_sync_outbox` | insufficient_privilege | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `validate_talkx_template_input` | invalid_talkx_template | `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql` |
| `increment_talkx_template_use` | authentication_required | `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql` |
| `increment_talkx_template_use` | talkx_template_not_found | `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql` |
| `guard_talkx_template_update` | talkx_template_update_requires_authorized_rpc | `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql` |
| `guard_talkx_template_version_immutable` | talkx_template_history_requires_authorized_rpc | `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql` |
| `guard_conversation_closure_request_id` | closure_request_id_internal_field_forbidden | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `guard_conversation_event_closure_id` | event_closure_id_internal_field_forbidden | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `complete_outbound_message` | service_role_required | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `complete_outbound_message` | invalid_delivery_completion | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `complete_outbound_message` | outbound_message_not_found | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `complete_outbound_message` | outbound_delivery_claim_conflict | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `fail_outbound_message` | service_role_required | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `fail_outbound_message` | invalid_delivery_failure | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `fail_outbound_message` | outbound_message_not_found | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `fail_outbound_message` | outbound_delivery_claim_conflict | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | authentication_required | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | invalid_conversation_closure | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | contact_not_authorized | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | contact_not_authorized | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | contact_not_found | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | active_profile_not_found | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | contact_not_authorized | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | closure_request_id_reused_with_different_payload | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | closure_event_invariant_broken | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `close_conversation_atomic` | invalid_transition % -> resolved | `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql` |
| `guard_message_delivery_internal_fields` | message_delivery_internal_fields_forbidden | `supabase/migrations/20260909260000_add_atomic_rich_outbound_messages.sql` |
| `guard_message_delivery_internal_fields` | message_delivery_payload_immutable | `supabase/migrations/20260909260000_add_atomic_rich_outbound_messages.sql` |
| `talkx_recipient_is_suppressed` | service_role_required | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `record_talkx_recipient_sent` | service_role_required | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `record_talkx_recipient_sent` | invalid_talkx_delivery_receipt | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `record_talkx_recipient_sent` | talkx_provider_receipt_already_recorded | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `record_talkx_recipient_sent` | talkx_delivery_claim_conflict | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `release_talkx_recipient_claim` | service_role_required | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `release_talkx_recipient_claim` | invalid_talkx_delivery_claim_release | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `mark_talkx_recipient_dispatch_started` | service_role_required | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `mark_talkx_recipient_dispatch_started` | invalid_talkx_provider_dispatch | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `mark_talkx_recipient_dispatch_started` | talkx_delivery_claim_conflict | `supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql` |
| `persist_talkx_recipient_message_snapshot` | service_role_required | `supabase/migrations/20260912120000_snapshot_talkx_recipient_messages.sql` |
| `persist_talkx_recipient_message_snapshot` | invalid_talkx_recipient_message_snapshot | `supabase/migrations/20260912120000_snapshot_talkx_recipient_messages.sql` |
| `persist_talkx_recipient_message_snapshot` | talkx_delivery_claim_conflict | `supabase/migrations/20260912120000_snapshot_talkx_recipient_messages.sql` |
| `reschedule_talkx_recipient` | service_role_required | `supabase/migrations/20260916210000_talkx_e91_resilience.sql` |
| `reschedule_talkx_recipient` | talkx_delivery_claim_conflict | `supabase/migrations/20260916210000_talkx_e91_resilience.sql` |
| `persist_sentiment_alert` | sentiment alert details do not match analysis | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment notification title and message are required | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment audit identity conflict | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment notification identity conflict | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `admin_set_role` | jwt_session_required | `supabase/migrations/20260925100657_admin_set_role_last_admin_floor.sql` |
| `admin_set_role` | admin_required | `supabase/migrations/20260925100657_admin_set_role_last_admin_floor.sql` |
| `admin_set_role` | cannot_demote_self | `supabase/migrations/20260925100657_admin_set_role_last_admin_floor.sql` |
| `admin_set_role` | cannot_demote_last_admin | `supabase/migrations/20260925100657_admin_set_role_last_admin_floor.sql` |
| `get_instance_token` | service_role_required | `supabase/migrations/20260925190000_whatsapp_connections_instance_token_vault.sql` |
| `set_instance_token` | service_role_required | `supabase/migrations/20260925190000_whatsapp_connections_instance_token_vault.sql` |
| `set_instance_token` | invalid_instance_token | `supabase/migrations/20260925190000_whatsapp_connections_instance_token_vault.sql` |
| `mark_multiplix_recipient_dispatch_started` | service_role_required | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `mark_multiplix_recipient_dispatch_started` | invalid_multiplix_provider_dispatch | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `mark_multiplix_recipient_dispatch_started` | multiplix_delivery_claim_conflict | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `persist_multiplix_recipient_message_snapshot` | service_role_required | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `persist_multiplix_recipient_message_snapshot` | invalid_multiplix_recipient_message_snapshot | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `persist_multiplix_recipient_message_snapshot` | multiplix_delivery_claim_conflict | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `complete_multiplix_recipient` | service_role_required | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `complete_multiplix_recipient` | invalid_multiplix_delivery_completion | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `complete_multiplix_recipient` | multiplix_delivery_claim_conflict | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `release_multiplix_recipient_claim` | service_role_required | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `release_multiplix_recipient_claim` | invalid_multiplix_delivery_claim_release | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `reschedule_multiplix_recipient` | service_role_required | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `reschedule_multiplix_recipient` | multiplix_delivery_claim_conflict | `supabase/migrations/20260926180000_multiplix_send_engine.sql` |
| `record_multiplix_recipient_delivered` | service_role_required | `supabase/migrations/20260926430000_multiplix_delivery_receipts.sql` |
| `record_multiplix_recipient_delivered` | invalid_multiplix_delivery_ack | `supabase/migrations/20260926430000_multiplix_delivery_receipts.sql` |
| `upsert_my_call` | perfil nao encontrado para o usuario autenticado | `supabase/migrations/20260926800000_calls_telefonia_v2.sql` |
| `upsert_my_call` | direcao invalida | `supabase/migrations/20260926800000_calls_telefonia_v2.sql` |
| `upsert_my_call` | chamada pertence a outro agente | `supabase/migrations/20260926800000_calls_telefonia_v2.sql` |
| `set_call_agent_notes` | perfil nao encontrado para o usuario autenticado | `supabase/migrations/20260927100000_fix_set_call_agent_notes_null_owner.sql` |
| `set_call_agent_notes` | chamada nao encontrada | `supabase/migrations/20260927100000_fix_set_call_agent_notes_null_owner.sql` |
| `set_call_agent_notes` | not allowed | `supabase/migrations/20260927100000_fix_set_call_agent_notes_null_owner.sql` |
| `grant_agent_achievement` | permission denied | `supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql` |
| `grant_agent_achievement` | p_xp_reward cannot be negative, got % | `supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql` |
| `grant_agent_achievement` | p_xp_reward exceeds single-call maximum of 500, got % | `supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql` |
| `grant_agent_achievement` | achievement type % requires service_role or admin privileges | `supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql` |
| `enforce_conversation_status_transition` | Invalid conversation_status transition: % -> % | `supabase/migrations/20260929560000_contacts_conversation_status_and_grants.sql` |
| `claim_multiplix_recipient` | service_role_required | `supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql` |
| `claim_multiplix_recipient` | invalid_multiplix_delivery_claim | `supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql` |
| `sweep_multiplix_stuck_recipients` | service_role_required | `supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql` |
| `sweep_multiplix_stuck_recipients` | invalid_multiplix_sweep_limit | `supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql` |
| `delete_contact` | Sem sessao autenticada. | `supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql` |
| `delete_contact` | Contato nao encontrado ou sem permissao para excluir. | `supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql` |
| `delete_contacts` | Sem sessao autenticada. | `supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql` |
| `delete_contacts` | Nenhum contato excluido: sem permissao ou ja excluido. | `supabase/migrations/20260929810000_contacts_can_edit_contact_hoisted_params.sql` |
| `require_contact_global_admin` | authentication_required | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` |
| `require_contact_global_admin` | admin_required | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` |
| `add_wa_tag_if_not_exists` | permission denied | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` |
| `remove_wa_tag_by_prefix` | permission denied | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` |
| `notify_due_tasks` | service_role_required | `supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql` |
| `toggle_team_reaction` | not_authenticated | `supabase/migrations/20260930260000_team_reaction_membership_guard.sql` |
| `toggle_team_reaction` | not_member | `supabase/migrations/20260930260000_team_reaction_membership_guard.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_guard_auth_role_undefined | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_insert_must_be_draft | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_delivery_state_managed_by_worker | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_delete_denied | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_owner_immutable | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_transition_denied | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_content_locked | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_dispatch_schedule_locked | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_dispatch_mutability` | multiplix_delivery_state_managed_by_worker | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_recipient_mutability` | multiplix_guard_auth_role_undefined | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_recipient_mutability` | multiplix_recipient_update_denied | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `enforce_multiplix_recipient_mutability` | multiplix_recipient_%_requires_draft | `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql` |
| `talk_me_claim` | authentication_required | `supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql` |
| `talk_me_claim` | talk_me_unavailable | `supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql` |
| `talk_me_claim` | talk_me_unavailable | `supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql` |
| `talk_me_claim` | talk_me_unavailable | `supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql` |
| `talk_me_claim` | talk_me_unavailable | `supabase/migrations/20260930310000_harden_talk_me_authorization_and_groups.sql` |
| `enforce_talkx_recipient_snapshot_mutability` | talkx_guard_auth_role_undefined | `supabase/migrations/20260930420000_talkx_guards_fail_closed.sql` |
| `enforce_talkx_recipient_snapshot_mutability` | talkx_recipient_snapshot_required | `supabase/migrations/20260930420000_talkx_guards_fail_closed.sql` |
| `apply_zapp_cron_secrets_l5` | cron_secret_l5: connection_health_check_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres) | `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql` |
| `apply_zapp_cron_secrets_l5` | cron_secret_l5: avatars_refresh_cron_secret ausente ou fora do formato (esperado 32 bytes em hex = 64 caracteres) | `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql` |
| `apply_zapp_cron_secrets_l5` | cron_secret_l5: existe job (connection-health-check/avatars-refresh) de outro dono: % | `supabase/migrations/20260930430000_cron_sem_dml_direto_v2.sql` |
| `resolve_contact_guard_actor` | invalid_auth_context | `supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql` |
| `resolve_contact_guard_actor` | authentication_required | `supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql` |
| `prevent_contact_queue_hijack` | Sem permissao para mover contato para esta fila | `supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql` |
| `prevent_contact_assignee_hijack` | Sem permissao para atribuir contato a este agente | `supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql` |
| `prevent_contact_assignee_hijack` | Sem permissao para atribuir contato a este agente | `supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql` |
| `mark_team_conversation_read` | not_authenticated | `supabase/migrations/20260930470000_team_receipts_membership_guard.sql` |
| `mark_team_conversation_read` | not_member | `supabase/migrations/20260930470000_team_receipts_membership_guard.sql` |
| `talkx_campaign_report` | talkx_campaign_report: campanha % nao encontrada ou inacessivel | `supabase/migrations/20260930680000_talkx_v17_read_at.sql` |
| `talkx_campaign_report` | talkx_campaign_report: campanha % nao encontrada ou inacessivel | `supabase/migrations/20260930680000_talkx_v17_read_at.sql` |
| `multiplix_create_draft` | service_role_required | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_name_required | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_template_required | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_request_identity_required | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_owner_not_found | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_schedule_must_be_future | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_recipients_required | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_draft_no_eligible_recipients | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `multiplix_create_draft` | multiplix_over_recipient_limit: % acima do teto de % (confirme explicitamente) | `supabase/migrations/20261001211230_f31_multiplix_dispatch_recipient_columns.sql` |
| `claim_multiplix_item` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `claim_multiplix_item` | invalid_multiplix_delivery_claim | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `mark_multiplix_item_dispatch_started` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `mark_multiplix_item_dispatch_started` | invalid_multiplix_provider_dispatch | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `mark_multiplix_item_dispatch_started` | multiplix_delivery_claim_conflict | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `persist_multiplix_item_message_snapshot` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `persist_multiplix_item_message_snapshot` | invalid_multiplix_item_message_snapshot | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `persist_multiplix_item_message_snapshot` | multiplix_delivery_claim_conflict | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `record_multiplix_item_sent` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `record_multiplix_item_sent` | invalid_multiplix_delivery_receipt | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `record_multiplix_item_sent` | multiplix_provider_receipt_already_recorded | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `record_multiplix_item_sent` | multiplix_delivery_claim_conflict | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `complete_multiplix_item` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `complete_multiplix_item` | invalid_multiplix_delivery_completion | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `complete_multiplix_item` | multiplix_delivery_claim_conflict | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `release_multiplix_item_claim` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `release_multiplix_item_claim` | invalid_multiplix_delivery_claim_release | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `reschedule_multiplix_item` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `reschedule_multiplix_item` | multiplix_delivery_claim_conflict | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `sweep_multiplix_stuck_items` | service_role_required | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `sweep_multiplix_stuck_items` | invalid_multiplix_sweep_limit | `supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql` |
| `reorder_multiplix_blocks` | service_role_required | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | invalid_multiplix_block_reorder | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | multiplix_block_reorder_null_id | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | multiplix_block_reorder_duplicate_ids | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | multiplix_block_reorder_set_mismatch | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | multiplix_block_reorder_foreign_block | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `reorder_multiplix_blocks` | multiplix_block_reorder_range_overflow | `supabase/migrations/20261001241230_f33_multiplix_blocks_content.sql` |
| `guard_multiplix_event_immutable` | multiplix_event_delete_denied | `supabase/migrations/20261001251230_f34_multiplix_events_append_only.sql` |
| `guard_multiplix_event_immutable` | multiplix_event_immutable | `supabase/migrations/20261001251230_f34_multiplix_events_append_only.sql` |
| `multiplix_audiences_validate_shared_roles` | multiplix_audiences.shared_with_roles: papel "%" fora do catalogo app_role. Validos: % | `supabase/migrations/20261001261230_f35_multiplix_audiences.sql` |
| `claim_talkx_campaign_worker` | service_role_required | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `claim_talkx_campaign_worker` | invalid_talkx_campaign_claim | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `release_talkx_campaign_worker` | service_role_required | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `release_talkx_campaign_worker` | invalid_talkx_campaign_release | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `talkx_next_recipients` | service_role_required | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `talkx_next_recipients` | invalid_talkx_campaign_id | `supabase/migrations/20261001311230_talkx_campaign_worker_lease.sql` |
| `sweep_talkx_stuck_recipients` | service_role_required | `supabase/migrations/20261001391230_talkx_engine_tick.sql` |
| `sweep_talkx_stuck_recipients` | invalid_talkx_sweep_limit | `supabase/migrations/20261001391230_talkx_engine_tick.sql` |
| `kick_talkx_campaign` | service_role_required | `supabase/migrations/20261001391230_talkx_engine_tick.sql` |
| `kick_talkx_campaign` | invalid_talkx_campaign_id | `supabase/migrations/20261001391230_talkx_engine_tick.sql` |
| `ai_budget_reserve` | ai_budget_reserve: p_idempotency_key obrigatorio | `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` |
| `ai_budget_reserve` | ai_budget_reserve: p_function_name obrigatorio | `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` |
| `ai_budget_reserve` | ai_budget_reserve: p_estimated_tokens invalido | `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` |
| `ai_budget_reserve` | ai_budget_reserve: p_limit_tokens invalido | `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` |
| `ai_budget_reserve` | ai_budget_reserve: p_ttl_ms invalido | `supabase/migrations/20261002361230_ia043_ia044_rate_limit_e_orcamento.sql` |
| `enqueue_ai_job` | service_role_required | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `enqueue_ai_job` | invalid_ai_job_idempotency_key | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `enqueue_ai_job` | invalid_ai_job_kind | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `enqueue_ai_job` | invalid_ai_job_function_name | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `enqueue_ai_job` | invalid_ai_job_priority | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `enqueue_ai_job` | invalid_ai_job_max_attempts | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `heartbeat_ai_job` | service_role_required | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `heartbeat_ai_job` | invalid_ai_job_heartbeat | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `heartbeat_ai_job` | invalid_ai_job_lease | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `finish_ai_job` | service_role_required | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `finish_ai_job` | invalid_ai_job_finish | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `finish_ai_job` | invalid_ai_job_status | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `finish_ai_job` | invalid_ai_job_transition | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `cancel_ai_job` | service_role_required | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `cancel_ai_job` | invalid_ai_job_cancel | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `trigger_ai_jobs_tick` | service_role_required | `supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql` |
| `replace_talkx_draft_recipients` | authentication_required | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | invalid_talkx_recipient_snapshot | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | invalid_talkx_recipient_id | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | active_profile_not_found | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | talkx_campaign_role_required | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | talkx_campaign_not_authorized | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | talkx_recipients_locked | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | talkx_recipient_not_authorized | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `replace_talkx_draft_recipients` | talkx_recipient_not_eligible | `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` |
| `multiplix_confirm_dispatch` | service_role_required | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | invalid_multiplix_confirm | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_dispatch_not_found | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_dispatch_scope_denied | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_dispatch_already_confirmed | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_dispatch_not_confirmable | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_dispatch_review_stale | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_confirm_no_recipients | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_confirm_no_eligible_recipients | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_confirm_no_blocks | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_confirm_connection_required | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `multiplix_confirm_dispatch` | multiplix_confirm_connection_unavailable | `supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql` |
| `transition_multiplix_dispatch` | service_role_required | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | invalid_multiplix_dispatch_transition | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_not_found | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_already_running | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_start_denied_from_% | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_message_required | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_recipients_required | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_pause_denied_from_% | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `transition_multiplix_dispatch` | multiplix_dispatch_cancel_denied_from_% | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `record_incoming_call_event` | invalid incoming call status | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `record_incoming_call_event` | provider event id exceeds 200 characters | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `record_incoming_call_event` | only ringing calls can create notifications | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `record_incoming_call_event` | incoming call contact not found | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `record_incoming_call_event` | incoming call connection does not match contact | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `record_incoming_call_event` | incoming call notification identity conflict | `supabase/migrations/20261002531230_t26_record_incoming_call_event_direction.sql` |
| `talkx_campaign_pace` | talkx_campaign_role_required | `supabase/migrations/20261002551230_talkx_limits_ritmo.sql` |
| `record_multiplix_item_delivered` | service_role_required | `supabase/migrations/20261002561230_f58_reconcile_item_receipts.sql` |
| `record_multiplix_item_delivered` | invalid_multiplix_delivery_ack | `supabase/migrations/20261002561230_f58_reconcile_item_receipts.sql` |
| `record_multiplix_item_delivered` | invalid_multiplix_delivery_event | `supabase/migrations/20261002561230_f58_reconcile_item_receipts.sql` |
| `list_multiplix_claimable_items` | service_role_required | `supabase/migrations/20261002621230_f55_claimable_items_por_bloco.sql` |
| `list_multiplix_claimable_items` | invalid_multiplix_claimable_list | `supabase/migrations/20261002621230_f55_claimable_items_por_bloco.sql` |
| `heartbeat_multiplix_item` | service_role_required | `supabase/migrations/20261002621230_f55_claimable_items_por_bloco.sql` |
| `heartbeat_multiplix_item` | invalid_multiplix_item_heartbeat | `supabase/migrations/20261002621230_f55_claimable_items_por_bloco.sql` |
| `list_multiplix_dead_letters` | multiplix_dead_letters_forbidden | `supabase/migrations/20261002651230_f59_dead_letters_consultavel.sql` |
| `count_multiplix_dead_letters` | multiplix_dead_letters_forbidden | `supabase/migrations/20261002651230_f59_dead_letters_consultavel.sql` |
| `pause_dispatches_for_connection` | multiplix_connection_required | `supabase/migrations/20261002671230_f60_conexao_capacidades_e_risco.sql` |
| `register_multiplix_connection_failure` | multiplix_connection_required | `supabase/migrations/20261002671230_f60_conexao_capacidades_e_risco.sql` |
| `talkx_upsert_link` | talkx_link_not_authorized | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_upsert_link` | talkx_link_campaign_not_found | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_upsert_link` | talkx_link_campaign_not_editable | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_upsert_link` | talkx_link_invalid_label | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_upsert_link` | talkx_link_invalid_target | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_upsert_link` | talkx_link_not_found | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_delete_link` | talkx_link_not_authorized | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_delete_link` | talkx_link_not_found | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_delete_link` | talkx_link_campaign_not_editable | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_delete_link` | talkx_link_has_clicks | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_set_campaign_investment` | talkx_investment_not_authorized | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_set_campaign_investment` | talkx_investment_negative | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `talkx_set_campaign_investment` | talkx_investment_campaign_not_found | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `link_email_crm_contact_guarded` | insufficient_privilege | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` |
| `link_email_crm_contact_guarded` | invalid_crm_link | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` |
| `link_email_crm_contact_guarded` | contact_not_found | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` |
| `link_email_crm_contact_guarded` | crm_contact_link_conflict | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` |
| `link_email_crm_contact_guarded` | crm_contact_link_conflict | `supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql` |
| `get_conversation_tab_counts` | contact is not visible to current user | `supabase/migrations/20261003162707_fix_conversation_tab_counts_files_total.sql` |
| `complete_talkx_campaign_if_drained` | service_role_required | `supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql` |
| `complete_talkx_campaign_if_drained` | invalid_talkx_campaign_id | `supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql` |
| `complete_talkx_campaign_if_drained` | talkx_campaign_not_found | `supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql` |
| `claim_talkx_recipient` | service_role_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `claim_talkx_recipient` | invalid_talkx_delivery_claim | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `complete_talkx_recipient` | service_role_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `complete_talkx_recipient` | invalid_talkx_delivery_completion | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `complete_talkx_recipient` | talkx_delivery_claim_conflict | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | authentication_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | active_profile_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | invalid_talkx_checklist_payload | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | invalid_talkx_checklist_payload | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | invalid_talkx_checklist_payload | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | talkx_campaign_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `log_talkx_campaign_checklist` | talkx_campaign_not_authorized | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `duplicate_talkx_campaign` | authentication_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `duplicate_talkx_campaign` | active_profile_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `duplicate_talkx_campaign` | talkx_campaign_role_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| … +646 linhas — lista completa em `context.json` | | |

## E. Estados, máquinas de estado e transições

### E.1 Colunas de status no banco

| Tabela | Coluna | Valores permitidos (enum/CHECK) | Default |
|---|---|---|---|
| `calls` | `status` | `answered`, `busy`, `cancelled`, `declined`, `ended`, `failed`, `missed`, `ringing` | `ringing` |
| `calls` | `recording_status` | `available`, `failed`, `none`, `pending` |  |
| `campaign_contacts` | `status` | `delivered`, `failed`, `pending`, `read`, `sent` | `pending` |
| `chatbot_executions` | `status` | `cancelled`, `completed`, `failed`, `paused`, `running` | `running` |
| `conversation_analyses` | `status` | **livre (sem enum/CHECK)** | `pendente` |
| `conversation_tasks` | `status` | **livre (sem enum/CHECK)** |  |
| `csat_surveys` | `status` | **livre (sem enum/CHECK)** |  |
| `email_threads` | `status` | **livre (sem enum/CHECK)** | `open` |
| `followup_executions` | `current_step` | **livre (sem enum/CHECK)** | `0` |
| `followup_executions` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `messages` | `status` | **livre (sem enum/CHECK)** |  |
| `messages` | `transcription_status` | **livre (sem enum/CHECK)** |  |
| `sales_deals` | `status` | **livre (sem enum/CHECK)** | `open` |
| `scheduled_messages` | `status` | **livre (sem enum/CHECK)** |  |
| `talkx_recipients` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `contacts` | `consent_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `conversation_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `presence_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `state` | **livre (sem enum/CHECK)** |  |
| `gmail_accounts` | `sync_status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections` | `health_status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections` | `status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_flows` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `followup_steps` | `step_order` | **livre (sem enum/CHECK)** | `1` |
| `campaigns` | `status` | `cancelled`, `completed`, `draft`, `paused`, `scheduled`, `sending` | `draft` |
| `knowledge_base_articles` | `embedding_status` | **livre (sem enum/CHECK)** | `pending` |
| `channel_connections` | `status` | **livre (sem enum/CHECK)** | `disconnected` |
| `whatsapp_templates` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `knowledge_base_files` | `processing_status` | **livre (sem enum/CHECK)** | `pending` |
| `team_messages` | `status` | `delivered`, `failed`, `read`, `sent` | `sent` |
| `training_sessions` | `status` | **livre (sem enum/CHECK)** | `in_progress` |
| `connection_health_logs` | `status` | **livre (sem enum/CHECK)** | `unknown` |
| `talkx_campaigns` | `status` | **livre (sem enum/CHECK)** |  |
| `talkx_campaigns` | `draft_step` | **livre (sem enum/CHECK)** |  |
| `number_reputation` | `warmup_status` | **livre (sem enum/CHECK)** | `none` |
| `password_reset_requests` | `status` | `approved`, `pending`, `rejected` | `pending` |
| `ai_usage_logs` | `status` | **livre (sem enum/CHECK)** | `success` |
| `department_invitations` | `status` | `accepted`, `expired`, `pending`, `revoked` | `pending` |
| `ops.hermes_change_log` | `status` | **livre (sem enum/CHECK)** | `planejado` |
| `talkx_segments` | `status` | `active`, `draft`, `inactive` | `active` |
| `talkx_templates` | `status` | `approved`, `draft`, `review` | `approved` |
| `crm_sync_outbox` | `status` | `dead_letter`, `failed`, `pending`, `processing`, `succeeded` | `pending` |
| `talkx_template_versions` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `catalog_send_events` | `status` | `failed`, `partial`, `sent` |  |
| `agent_presence` | `status` | `away`, `offline`, `online` | `online` |
| `multiplix_dispatches` | `status` | `cancelled`, `completed`, `draft`, `failed`, `paused`, `scheduled`, `sending` |  |
| `multiplix_recipients` | `status` | `delivered`, `failed`, `pending`, `sending`, `sent`, `skipped` |  |
| `team_message_receipts` | `status` | `delivered`, `read` | `delivered` |
| `multiplix_delivery_items` | `status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` | `pending` |
| `ai_budget_reservations` | `status` | `expired`, `released`, `reserved`, `settled` | `reserved` |
| `ai_jobs` | `status` | `cancelled`, `failed`, `outcome_unknown`, `partial`, `queued`, `running`, `succeeded` | `queued` |
| `talkx_campaign_segments` | `status` | `done`, `paused`, `pending`, `sending` | `pending` |
| `talkx_delivery_log` | `stage` | `claim`, `complete`, `dispatch`, `reconcile`, `suppress_check` |  |
| `talkx_delivery_log` | `http_status` | **livre (sem enum/CHECK)** |  |
| `gmail_oauth_states` | `state` | **livre (sem enum/CHECK)** |  |
| `searchbox_budget_alert_emails` | `status` | `failed`, `pending`, `sent`, `uncertain` | `pending` |
| `searchbox_budget_alert_emails` | `http_status` | **livre (sem enum/CHECK)** |  |
| `talkx_contact_attributes` | `state` | **livre (sem enum/CHECK)** |  |
| `talkx_contact_attributes` | `funnel_stage` | **livre (sem enum/CHECK)** |  |
| `talkx_test_sends` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `talkx_ddd_regions` | `state` | **livre (sem enum/CHECK)** |  |
| `message_attempts` | `provider_status` | **livre (sem enum/CHECK)** |  |
| `message_reports` | `status` | `dismissed`, `open`, `resolved` | `open` |
| `qr_attempts` | `status` | `connected`, `error`, `expired`, `pending` |  |
| `copilot_sessions` | `sale_stage` | `apresentando`, `fechando`, `negociando`, `novo_contato`, `perdido`, `pos_venda`, `qualificando` | `novo_contato` |
| `copilot_sessions` | `state_version` | **livre (sem enum/CHECK)** | `1` |
| `copilot_insights` | `state_version` | **livre (sem enum/CHECK)** | `1` |
| `copilot_objection_catalog` | `status` | **livre (sem enum/CHECK)** | `pending_review` |
| `_zapp_mig133_log` | `status` | **livre (sem enum/CHECK)** |  |
| `channel_connections_safe` | `status` | **livre (sem enum/CHECK)** |  |
| `gmail_accounts_safe` | `sync_status` | **livre (sem enum/CHECK)** |  |
| `password_reset_requests_safe` | `status` | **livre (sem enum/CHECK)** |  |
| `talkx_campaign_metrics` | `status` | **livre (sem enum/CHECK)** |  |
| `talkx_engine_health` | `status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections_agent` | `status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections_public` | `status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections_safe` | `health_status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections_safe` | `status` | **livre (sem enum/CHECK)** |  |

### E.2 Mapas de transição declarados no código

- **contactsFichaTransition** (`src/components/contacts/contactsMotion.ts`):
  ```ts
  duration: contactsDurations.hover, ease: contactsEase.standard,
  ```
- **routeTransitions** (`src/components/transitions/transitionConfig.ts`):
  ```ts
  '/auth': { variant: 'fade', duration: 0.25 }, '/forgot-password': { variant: 'fade', duration: 0.2 }, '/reset-password': { variant: 'fade', duration: 0.2 }, '/verify-email': { variant: 'fade', duration: 0.2 }, '/2fa': { variant: 'zoom', duration: 0.25 }, '/install': { variant: 'slide', direction: 'up', duration: 0.3 }, '/queue': { variant: 'slide', direction: 'right', duration: 0.28 }, '/queues': { variant: 'slide', direction: 'right', duration: 0.28 }, '/sla': { variant: 'zoom', duration: 0.3 }, '/admin': { variant: 'slide', direction: 'left', duration: 0.28 }, '/chat-popup': { variant: 'zoom', duration: 0.25 },
  ```
- **defaultTransition** (`src/components/transitions/transitionConfig.ts`):
  ```ts
  variant: 'fade', duration: 0.2,
  ```
- **zappTransition** (`src/lib/motion.ts`):
  ```ts
  fast: { duration: zappMotion.duration.fast, ease: zappMotion.ease.standard, } satisfies Transition, normal: { duration: zappMotion.duration.normal, ease: zappMotion.ease.enter, } satisfies Transition, panel: { duration: zappMotion.duration.moderate, ease: zappMotion.ease.enter, } satisfies Transition,
  ```
- **AI_JOB_TRANSITIONS** (`src/lib/aiJobs/status.ts`):
  ```ts
  queued: ['running', 'cancelled'], running: ['partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'], partial: ['running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'], succeeded: [], failed: [], cancelled: [], outcome_unknown: [],
  ```
- **NEXT_STEPS_TOOL_SCHEMA** (`supabase/functions/_shared/ai-conversation-pipeline.ts`):
  ```ts
  type: "array", items: { type: "string" }, description: "Actionable next steps",
  ```
- **AI_JOB_TRANSITIONS** (`supabase/functions/_shared/ai-jobs.ts`):
  ```ts
  queued: ["running", "cancelled"], running: ["partial", "succeeded", "failed", "cancelled", "outcome_unknown"], partial: ["running", "succeeded", "failed", "cancelled", "outcome_unknown"], succeeded: [], failed: [], cancelled: [], outcome_unknown: [],
  ```
- **allowedParams** (`supabase/functions/_shared/crm-integration-contract.ts`):
  ```ts
  get_companies_by_phones_batch: new Set(['p_phones']), get_contact_360_by_phone: new Set(['p_phone']), get_contact_intelligence_by_phone: new Set(['p_phone']), get_contact_sidebar_by_phone: new Set(['p_phone']), search_contacts_advanced: new Set([ 'p_search', 'p_vendedor', 'p_ramo', 'p_rfm_segment', 'p_estado', 'p_cliente_ativado', 'p_ja_comprou', 'p_sort_by', 'p_page', 'p_page_size', ]),
  ```

### E.3 Valores de status usados no código (escreve / compara / filtra)

| Campo | Valor | Uso | Onde |
|---|---|---|---|
| `type` | `ACCEPT` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `ADD_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `CANCEL_REMOTE` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `CLAIM` | compara, escreve | `src/components/admin/dedupeEntreAbas.ts`<br>`src/lib/calls/tabLeaderStore.ts`<br>`src/lib/crossTabDrainLock.ts`<br>`src/lib/crossTabSendDedupe.ts` |
| `type` | `CLEAR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `CLOSE` | compara, escreve | `src/components/inbox/ChatPanel.tsx` |
| `type` | `CheckboxGroup` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `DEFAULT` | escreve | `src/components/tasks/board/boardInteracao.ts` |
| `type` | `DIAL` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `DISMISS_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `DatePicker` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `Dropdown` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `ESTABLISHED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `FAILED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `Footer` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `HANGUP_LOCAL` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `HANGUP_REMOTE` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `HEARTBEAT` | compara, escreve | `src/lib/calls/tabLeaderStore.ts` |
| `type` | `HIGHLIGHT` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `INVITE_RECEIVED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `NOTIFICATION_CLICK` | compara | `src/hooks/chat/useTeamChatNotifications.ts`<br>`src/hooks/system/useSecurityPushNotifications.ts` |
| `type` | `OPEN` | compara, escreve | `src/components/inbox/ChatPanel.tsx` |
| `type` | `REJECT` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `RELEASE` | compara, escreve | `src/lib/calls/tabLeaderStore.ts`<br>`src/lib/crossTabDrainLock.ts`<br>`src/lib/crossTabSendDedupe.ts` |
| `type` | `REMOVE_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `RESET` | compara, escreve | `src/components/calls/PostCallSummary.tsx`<br>`src/components/inbox/ChatPanel.tsx`<br>`src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `RETRIEVE_END` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRIEVE_ERROR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRIEVE_START` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRY` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RINGING` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `RadioButtonsGroup` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `SECURITY_ACTION` | compara | `src/hooks/system/useSecurityPushNotifications.ts` |
| `type` | `SET_QUERY` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_BLOCKED` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_ERROR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_START` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_SUCCESS` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `TIMEOUT` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `TOGGLE` | compara, escreve | `src/components/inbox/ChatPanel.tsx` |
| `type` | `TextArea` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `TextBody` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `TextHeading` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `TextInput` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `TextSubheading` | compara | `src/components/whatsapp-flows/FlowComponentPreview.tsx` |
| `type` | `UPDATE_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `achievements` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `action` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/chatbot/chatbotNodeConfig.ts`<br>`src/components/inbox/search/GlobalSearchResults.tsx` |
| `type` | `activateGroup` | compara, escreve | `src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `activity` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `addGroup` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `addRule` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `add_tag` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `advanced` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `agent` | compara, escreve | `src/components/inbox/BulkActionsToolbar.tsx`<br>`src/components/inbox/ChatPanel.tsx`<br>`src/hooks/chat/useConversationActions.ts`<br>`src/hooks/inbox/useInboxBulkActions.ts` |
| `type` | `ai-stats` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `all` | compara, escreve | `src/components/contacts/useContactsViewState.ts`<br>`src/components/inbox/tabs/journey/JourneyFilters.tsx`<br>`src/hooks/chat/useConversationHistoryTimeline.ts` |
| `type` | `array` | escreve | `supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts` |
| `type` | `asset` | escreve | `vite.config.ts` |
| `type` | `assign_agent` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `assigned` | escreve | `src/components/contacts/ContactActivityTimeline.tsx` |
| `type` | `audio` | compara | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/chat/useChatPanelHandlers.ts`<br>`src/components/inbox/media-gallery/MediaPreviewDialog.tsx`<br>… +11 |
| `type` | `audio_meme` | compara | `src/components/team-chat/teamChatParts.tsx` |
| `type` | `audio_memes` | compara | `src/components/settings/MediaLibraryAdmin.tsx`<br>`src/components/settings/media-library/useMediaLibrary.ts`<br>`src/components/settings/media-library/useMediaUpload.ts` |
| `type` | `audio_recorded` | compara | `supabase/functions/_shared/multiplix-content.ts`<br>`supabase/functions/multiplix-dispatch/actions/inspect.ts` |
| `type` | `authentication` | escreve, filtra | `supabase/functions/webauthn/index.ts` |
| `type` | `avatar` | compara | `src/components/ui/micro-interactions/skeletons.tsx` |
| `type` | `bold` | compara, escreve | `src/components/inbox/MessagePreview.tsx` |
| `type` | `boolean` | escreve | `supabase/functions/voice-agent/index.ts` |
| `type` | `broadcast` | escreve | `src/hooks/team-chat/useTeamTyping.ts`<br>`supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `type` | `business_hours` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `button` | escreve | `src/types/chat.ts` |
| `type` | `buttons` | compara | `src/components/inbox/InteractiveMessage.tsx` |
| `type` | `call` | compara, escreve | `src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>`src/lib/journey/mappers.ts`<br>… +1 |
| `type` | `card` | compara, escreve | `src/components/ui/micro-interactions/skeletons.tsx`<br>`src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `category` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `cep` | escreve | `src/hooks/copilot/useDataMasking.ts` |
| `type` | `challenges` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/components/dashboard/overview/GamificationSection.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `chat` | compara | `src/components/performance/LazyRoutes.tsx` |
| `type` | `circle` | compara | `src/components/effects/Confetti.tsx` |
| `type` | `clear` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx`<br>`src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts`<br>`src/hooks/tasks/useTasksFilters.ts` |
| `type` | `close_conversation` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `cnpj` | escreve | `src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `code` | compara, escreve | `src/components/inbox/MessagePreview.tsx` |
| `type` | `company` | compara, escreve | `src/components/contacts/ContactSearchWithSuggestions.tsx` |
| `type` | `complete_tasks` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `condition` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/chatbot/chatbotNodeConfig.ts` |
| `type` | `confetti` | compara, escreve | `src/components/effects/Confetti.tsx` |
| `type` | `connection` | compara, escreve | `src/hooks/chat/useConversationActions.ts`<br>`src/hooks/system/useDiagnosticsData.ts` |
| `type` | `connection_alert` | escreve | `supabase/functions/connection-health-check/index.ts` |
| `type` | `contact` | compara, escreve | `src/components/inbox/chat/useChatPanelHandlers.ts`<br>`src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts`<br>`src/hooks/chat/useForwardMedia.ts`<br>`src/hooks/chat/useForwardMessage.ts`<br>… +1 |
| `type` | `counter` | escreve | `supabase/functions/_shared/observability.ts` |
| `type` | `cpf` | escreve | `src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `created` | escreve | `src/components/contacts/ContactActivityTimeline.tsx` |
| `type` | `critical` | compara, escreve | `src/components/dashboard/WarRoomDashboard.tsx`<br>`src/components/dashboard/war-room/WarRoomAlertRow.tsx`<br>`src/hooks/business/useWarRoomData.ts` |
| `type` | `crm` | compara, escreve | `src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts` |
| `type` | `crosssell` | escreve | `src/hooks/copilot/useUpsellSuggestion.ts` |
| `type` | `csp-violation` | compara, escreve | `supabase/functions/csp-report/index.ts` |
| `type` | `custom_emojis` | compara | `src/components/settings/media-library/useMediaLibrary.ts` |
| `type` | `customer_escalation` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `dashboard` | compara | `src/components/performance/LazyRoutes.tsx` |
| `type` | `data_unavailable` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `date` | compara, escreve | `src/components/email/EmailChatThread.tsx` |
| `type` | `deal` | escreve | `src/lib/journey/mappers.ts` |
| `type` | `delay` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx` |
| `type` | `delete` | compara, escreve | `src/components/team-chat/useTeamChatPanel.ts`<br>`src/hooks/team-chat/useTeamMessages.ts` |
| `type` | `department` | compara | `src/components/team-chat/useTeamChatPanel.ts`<br>`src/hooks/team-chat/useTeamChatMutations.ts`<br>`src/lib/teamChatRules.ts` |
| `type` | `description` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `detail` | escreve | `src/lib/journey/mappers.ts` |
| `type` | `direct` | compara, escreve | `src/components/inbox/AISuggestions.tsx`<br>`src/components/team-chat/TeamConversationList.tsx`<br>`src/components/team-chat/TeamMemberDetails.tsx`<br>`src/hooks/team-chat/useTeamChatMutations.ts`<br>`src/hooks/team-chat/useTeamConversations.ts`<br>… +1 |
| `type` | `document` | compara | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/MediaPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/chat/useChatPanelHandlers.ts`<br>… +7 |
| `type` | `due` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `duplicateGroup` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `email` | escreve | `src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts`<br>`src/lib/journey/mappers.ts` |
| `type` | `email_change` | compara | `src/pages/VerifyEmail.tsx` |
| `type` | `emoji` | compara | `src/components/team-chat/teamChatParts.tsx` |
| `type` | `empathetic` | compara | `src/components/inbox/AISuggestions.tsx` |
| `type` | `error` | compara, escreve | `src/hooks/ui/useLoadingState.ts` |
| `type` | `escalate` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `event` | escreve | `src/lib/web-vitals.ts` |
| `type` | `explicit` | compara, escreve | `src/components/copilot/RadarPhase10Panel.tsx`<br>`src/hooks/copilot/usePurchaseSignals.ts` |
| `type` | `featured` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `file` | compara | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| `type` | `filtered-empty` | compara | `src/components/contacts/ContactEmptyState.tsx` |
| `type` | `first-input` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `follow_up` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `followup` | compara | `src/components/inbox/AISuggestions.tsx` |
| `type` | `form` | compara | `src/components/performance/LazyRoutes.tsx` |
| `type` | `fulfill_promise` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `function` | escreve | `supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/voice-agent/index.ts` |
| `type` | `gauge` | escreve | `supabase/functions/metrics/index.ts` |
| `type` | `ghosted` | escreve | `src/hooks/copilot/useStallDetector.ts` |
| `type` | `goal` | escreve | `src/hooks/analytics/useGoalNotifications.ts` |
| `type` | `group` | compara | `src/components/team-chat/TeamChatHeader.tsx`<br>`src/components/team-chat/TeamConversationList.tsx`<br>`src/components/team-chat/TeamMemberDetails.tsx`<br>`src/hooks/chat/useForwardMessage.ts`<br>`src/hooks/team-chat/useTeamMemberDetails.ts`<br>… +1 |
| `type` | `health_fail` | compara | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| `type` | `health_ok` | compara | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| `type` | `hour` | compara | `src/lib/localDay.ts` |
| `type` | `hydrate` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `idle` | compara, escreve | `src/hooks/ui/useLoadingState.ts` |
| `type` | `image` | compara, escreve | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/LinkPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>… +12 |
| `type` | `image_url` | escreve | `supabase/functions/_shared/ai-image-input.ts`<br>`supabase/functions/classify-emoji/index.ts`<br>`supabase/functions/classify-sticker/index.ts` |
| `type` | `implicit` | escreve | `src/hooks/copilot/usePurchaseSignals.ts` |
| `type` | `incoming_call` | compara, escreve | `src/hooks/communication/useIncomingCallListener.ts`<br>`supabase/functions/_shared/notification-events.ts` |
| `type` | `info` | escreve | `src/hooks/system/useNotifications.ts` |
| `type` | `input_audio` | escreve | `supabase/functions/_shared/ai-audio-input.ts`<br>`supabase/functions/classify-audio-meme/index.ts` |
| `type` | `interactive` | compara | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx` |
| `type` | `isNew` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `italic` | compara, escreve | `src/components/inbox/MessagePreview.tsx` |
| `type` | `keyword` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `konami` | compara, escreve | `src/components/effects/EasterEggs.tsx` |
| `type` | `largest-contentful-paint` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `layout-shift` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `leaderboard` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/components/dashboard/overview/GamificationSection.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `level_up` | escreve | `src/components/gamification/AchievementToast.tsx` |
| `type` | `link` | compara, escreve | `src/components/inbox/MessagePreview.tsx`<br>`src/components/talkx/TalkXInteractiveEditor.tsx`<br>`src/components/talkx/talkxInteractive.ts` |
| `type` | `links` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `list` | compara | `src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/chat/RichTextToolbar.tsx`<br>`src/components/inbox/chat/useChatPanelHandlers.ts`<br>`src/components/performance/LazyRoutes.tsx` |
| `type` | `list-item` | compara | `src/components/ui/micro-interactions/skeletons.tsx` |
| `type` | `load` | compara, escreve | `src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `loading` | compara, escreve | `src/components/ui/accessible-toast.tsx`<br>`src/components/ui/micro-interactions/feedback.tsx`<br>`src/hooks/ui/useLoadingState.ts` |
| `type` | `location` | compara | `src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx` |
| `type` | `longtask` | escreve | `src/lib/web-vitals.ts` |
| `type` | `lowStock` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `magiclink` | escreve | `src/hooks/auth/useAuthForm.ts`<br>`supabase/functions/webauthn/index.ts` |
| `type` | `message` | compara, escreve | `src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/email/EmailChatThread.tsx`<br>`src/components/inbox/RealtimeInboxView.tsx`<br>`src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts`<br>… +3 |
| `type` | `message_in` | compara | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| `type` | `message_out` | compara | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| `type` | `message_sent` | escreve | `src/components/contacts/ContactActivityTimeline.tsx` |
| `type` | `mini-games` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `missed_upsell` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `moveGroup` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `name` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `new_message` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `new_objection` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `no-contacts` | compara, escreve | `src/components/contacts/ContactEmptyState.tsx` |
| `type` | `no-results` | compara | `src/components/contacts/ContactEmptyState.tsx` |
| `type` | `note` | escreve | `src/components/contacts/ContactActivityTimeline.tsx`<br>`src/lib/journey/mappers.ts` |
| `type` | `number` | escreve | `supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts` |
| `type` | `object` | escreve | `supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts`<br>`supabase/functions/voice-agent/index.ts` |
| `type` | `onlyInStock` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `ordered-list` | compara | `src/components/inbox/chat/RichTextToolbar.tsx` |
| `type` | `paint` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `party` | compara | `src/components/effects/EasterEggs.tsx` |
| `type` | `phone` | compara, escreve | `src/components/inbox/InteractiveMessage.tsx`<br>`src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `price_negotiation_won` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `prio` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `ptt` | escreve | `supabase/functions/_shared/evolution-go-routes.ts` |
| `type` | `ptv` | escreve | `supabase/functions/_shared/evolution-go-routes.ts` |
| `type` | `public-key` | compara, escreve | `supabase/functions/webauthn/index.ts` |
| `type` | `question` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx` |
| `type` | `queue` | compara | `src/components/inbox/ChatPanel.tsx`<br>`src/hooks/chat/useConversationActions.ts`<br>`src/hooks/inbox/useInboxBulkActions.ts` |
| `type` | `queues` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `reactivation` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `redo` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `registration` | escreve, filtra | `supabase/functions/webauthn/index.ts` |
| `type` | `reminder_due` | compara, escreve | `src/components/notifications/NotificationItem.tsx`<br>`src/hooks/system/useNotifications.ts`<br>`src/hooks/tasks/useWorkItemNotifications.ts` |
| `type` | `remove` | compara | `supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `type` | `removeGroup` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `removeRule` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `reply` | compara, escreve | `src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>`src/components/talkx/TalkXInteractiveEditor.tsx`<br>… +3 |
| `type` | `reset` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `resolve_pending` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `respond` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `right_to_be_forgotten` | escreve | `src/components/compliance/LGPDComplianceView.tsx` |
| `type` | `sales` | compara, escreve | `src/components/admin/TrainingMode.tsx` |
| `type` | `script` | compara | `src/hooks/performance/useDataOptimization.ts` |
| `type` | `search` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `security` | escreve | `supabase/functions/send-rate-limit-alert/index.ts` |
| `type` | `select` | escreve | `src/lib/zappSchemas.ts` |
| `type` | `send_message` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `send_notification` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `sentiment_alert` | compara, escreve | `src/hooks/inbox/useRealtimeSentimentAlerts.ts`<br>`supabase/functions/_shared/notification-events.ts`<br>`supabase/functions/sentiment-alert/index.ts` |
| `type` | `setMatch` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `signup` | compara, escreve | `src/pages/VerifyEmail.tsx` |
| `type` | `silent` | escreve | `src/hooks/copilot/useStallDetector.ts` |
| `type` | `sort` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `spring` | escreve | `src/components/calls/IncomingCallAlert.tsx`<br>`src/components/contacts/ContactDetailPanel.tsx`<br>`src/components/contacts/ContactDialogs.tsx`<br>`src/components/contacts/ContactTypeTabs.tsx`<br>`src/components/contacts/ContactViewSwitcher.tsx`<br>… +50 |
| `type` | `star` | compara | `src/components/effects/Confetti.tsx` |
| `type` | `start` | compara, escreve | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/hooks/integrations/useChatbotFlows.ts` |
| `type` | `stat` | compara | `src/components/ui/micro-interactions/skeletons.tsx` |
| `type` | `stats` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `sticker` | compara | `src/components/inbox/MediaPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/media-gallery/MediaPreviewDialog.tsx`<br>`src/components/inbox/tabs/FileDetailPanel.tsx`<br>… +3 |
| `type` | `stickers` | compara | `src/components/settings/media-library/useMediaLibrary.ts`<br>`src/components/settings/media-library/useMediaUpload.ts` |
| `type` | `string` | compara, escreve | `supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts`<br>`supabase/functions/ai-proxy/index.ts`<br>`supabase/functions/evolution-api/index.ts`<br>… +2 |
| `type` | `style` | compara | `src/hooks/performance/useDataOptimization.ts` |
| `type` | `success` | compara, escreve | `src/components/ui/micro-interactions/feedback.tsx`<br>`src/hooks/ui/useLoadingState.ts` |
| `type` | `successful_close` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `suggestion` | escreve | `supabase/functions/copilot-live/index.ts` |
| `type` | `supplier` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `support` | escreve | `src/components/admin/TrainingMode.tsx` |
| `type` | `svg` | escreve | `supabase/functions/evolution-api/index.ts` |
| `type` | `system` | compara, escreve | `src/hooks/system/useDiagnosticsData.ts`<br>`supabase/functions/_shared/gmail-helpers.ts`<br>`supabase/functions/gmail-sync/index.ts` |
| `type` | `tag` | escreve | `src/components/contacts/ContactSearchWithSuggestions.tsx` |
| `type` | `tag_added` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `task` | escreve | `src/lib/journey/mappers.ts` |
| `type` | `team_chat` | compara, escreve | `src/hooks/chat/useTeamChatNotifications.ts` |
| `type` | `template` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `text` | compara, escreve | `src/components/inbox/AdvancedMessageMenu.tsx`<br>`src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/MessageContextActions.tsx`<br>`src/components/inbox/MessagePreview.tsx`<br>… +12 |
| `type` | `time_inactive` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `timing` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `toggleAlarm` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `toggleDone` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `totp` | escreve | `src/hooks/auth/useMFA.ts` |
| `type` | `transcription` | compara, escreve | `src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts` |
| `type` | `transfer` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/chatbot/chatbotNodeConfig.ts` |
| `type` | `undo` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `unsupported` | compara | `src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/chat/MessageBubbleUnsupported.tsx`<br>`src/types/chat.ts` |
| `type` | `update` | escreve | `src/hooks/team-chat/useTeamMessages.ts` |
| `type` | `updateRule` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `upsell` | compara, escreve | `src/components/copilot/UpsellCard.tsx`<br>`src/hooks/chat/useNextBestAction.ts`<br>`src/hooks/copilot/useUpsellSuggestion.ts` |
| `type` | `urgent_conversation` | escreve | `supabase/functions/ai-auto-tag/index.ts` |
| `type` | `url` | compara, escreve | `src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>`supabase/functions/message-delivery/index.ts` |
| `type` | `video` | compara, escreve | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/LinkPreview.tsx`<br>`src/components/inbox/MediaPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>… +8 |
| `type` | `voice_ai` | compara | `supabase/functions/_shared/multiplix-content.ts`<br>`supabase/functions/multiplix-dispatch/actions/inspect.ts` |
| `type` | `waiting_contacts` | escreve | `src/hooks/business/useQueueGoals.ts` |
| `type` | `websearch` | escreve | `supabase/functions/promogifts-catalog/index.ts` |
| `type` | `website` | escreve | `src/components/inbox/LinkPreview.tsx` |
| `type` | `whatsapp` | escreve | `src/components/inbox/contact-details/ContactActionButtons.tsx` |
| `consent_status` | `opt_in` | escreve | `src/adapters/evolutionAdapter.ts` |
| `conversation_status` | `archived` | compara, escreve | `src/components/inbox/ContactDetails.tsx`<br>`src/components/inbox/VirtualizedRealtimeList.tsx`<br>`src/components/inbox/conversation-list/StatusChips.tsx`<br>`src/hooks/inbox/chipCounts.ts`<br>`src/hooks/inbox/conversationArchive.ts`<br>… +2 |
| `conversation_status` | `open` | compara, escreve, filtra | `src/adapters/evolutionAdapter.ts`<br>`src/components/omnichannel/OmnichannelInbox.tsx`<br>`src/features/talk-me/useTalkMeQueue.ts`<br>`src/hooks/analytics/useDashboardData.ts`<br>`src/hooks/business/useQueueAnalytics.ts`<br>… +3 |
| `conversation_status` | `resolved` | compara, filtra | `src/components/inbox/CloseConversationDialog.tsx`<br>`src/components/inbox/VirtualizedRealtimeList.tsx`<br>`src/hooks/analytics/useGoalNotifications.ts`<br>`src/hooks/analytics/useGoalsDashboard.ts`<br>`src/hooks/business/useQueueAnalytics.ts`<br>… +2 |
| `conversation_status` | `waiting` | compara, filtra | `src/features/talk-me/useTalkMeQueue.ts`<br>`src/hooks/agents/useAgentPendingCounts.ts`<br>`src/hooks/inbox/chipCounts.ts` |
| `status` | `403` | compara | `src/lib/rlsError.ts` |
| `status` | `CHANNEL_ERROR` | compara | `src/hooks/communication/useAudioMemes.ts`<br>`src/hooks/realtime/useSupabaseRealtime.ts`<br>`src/hooks/team-chat/useTeamConversations.ts`<br>`src/hooks/team-chat/useTeamMessageReactions.ts`<br>`src/hooks/team-chat/useTeamMessages.ts`<br>… +1 |
| `status` | `CLOSED` | compara | `src/hooks/realtime/useSupabaseRealtime.ts` |
| `status` | `SUBSCRIBED` | compara | `src/components/inbox/collaboration/ViewersIndicator.tsx`<br>`src/hooks/analytics/useRealtimeDashboard.ts`<br>`src/hooks/chat/useTypingPresence.ts`<br>`src/hooks/communication/useAudioMemes.ts`<br>`src/hooks/gamification/useAgentCelebrations.ts`<br>… +7 |
| `status` | `TIMED_OUT` | compara | `src/hooks/communication/useAudioMemes.ts`<br>`src/hooks/realtime/useSupabaseRealtime.ts`<br>`src/hooks/team-chat/useTeamConversations.ts`<br>`src/hooks/team-chat/useTeamMessageReactions.ts`<br>`src/hooks/team-chat/useTeamMessages.ts`<br>… +1 |
| `status` | `action` | escreve | `src/components/security/SecuritySettingsPanel.tsx` |
| `status` | `active` | compara, escreve | `src/components/calls/CallDialog.tsx`<br>`src/components/calls/NewCallPanel.tsx`<br>`src/components/payments/PaymentLinksView.tsx`<br>`src/components/talkx/TalkXCampaignWizard.tsx`<br>`src/components/talkx/TalkXSegments.tsx`<br>… +5 |
| `status` | `all` | compara, escreve | `src/components/talkx/TalkXOverview.tsx`<br>`src/components/talkx/segments/SegmentSideList.tsx`<br>`src/hooks/integrations/useTalkXSegments.ts` |
| `status` | `ambiguous` | compara, escreve | `src/components/email/EmailContactPanel.tsx`<br>`src/hooks/crm/useEmailContactContext.ts`<br>`src/types/emailContactContext.ts`<br>`supabase/functions/crm-integration/index.ts` |
| `status` | `answered` | compara, escreve | `src/components/calls/CallDialog.tsx`<br>`src/hooks/communication/useCallEngineSink.ts`<br>`src/lib/calls/WhatsAppCallAdapter.ts`<br>`src/lib/calls/callStatus.ts` |
| `status` | `approved` | compara, escreve | `src/components/security/PasswordResetRequestsPanel.tsx`<br>`src/components/talkx/TalkXCampaignWizard.tsx`<br>`src/components/talkx/TalkXTemplates.tsx`<br>`src/components/talkx/TalkXWizardDelivery.tsx`<br>`supabase/functions/approve-password-reset/index.ts` |
| `status` | `approved_email_failed` | escreve | `supabase/functions/approve-password-reset/index.ts` |
| `status` | `archived` | escreve | `supabase/functions/gmail-send/index.ts` |
| `status` | `atencao` | compara | `src/components/dashboard/overview/QueueHealthTable.tsx` |
| `status` | `ativo` | escreve | `src/components/crm360/CompanyFormDialog.tsx` |
| `status` | `attention` | compara, escreve | `src/components/talkx/tracking/TalkXResumeChecklist.tsx`<br>`src/hooks/integrations/useTalkXResumeChecklist.ts` |
| `status` | `available` | compara, escreve | `src/components/integrations/IntegrationsHub.tsx`<br>`src/hooks/crm/useEmailContactContext.ts`<br>`src/types/emailContactContext.ts`<br>`supabase/functions/crm-integration/index.ts` |
| `status` | `away` | compara, escreve | `src/components/agents/AgentsView.tsx`<br>`src/components/inbox/TransferDialog.tsx`<br>`src/components/inbox/WhisperMode.tsx`<br>`src/components/inbox/collaboration/HandoffDialog.tsx`<br>`src/components/layout/ProfileMenuContent.tsx`<br>… +2 |
| `status` | `backlog` | compara, escreve | `src/components/inbox/tabs/TasksTab.tsx`<br>`src/components/tasks/board/BoardColumn.tsx`<br>`src/components/tasks/board/TasksBoardMode.tsx`<br>`src/components/tasks/shared/NewTaskDialog.tsx`<br>`src/components/tasks/shared/new-task/TaskPreview.tsx`<br>… +1 |
| `status` | `bad` | escreve | `src/components/dashboard/systemHealth.ts` |
| `status` | `block` | compara, escreve | `src/hooks/integrations/useEvolutionApi.ts` |
| `status` | `breached` | compara, escreve | `src/components/inbox/SLAIndicator.tsx`<br>`src/hooks/sla/useSLACalculation.ts`<br>`src/lib/slaTimeline.ts` |
| `status` | `busy` | compara | `src/hooks/business/useWarRoomData.ts`<br>`src/lib/calls/callStatus.ts` |
| `status` | `cancelled` | compara, escreve | `src/components/multiplix/MultiplixMonitor.tsx`<br>`src/components/talkx/TalkXLiveMonitor.tsx`<br>`src/components/talkx/talkxRoute.ts`<br>`src/components/talkx/useCampaignRowActions.tsx`<br>`src/components/tasks/list/taskRowCells.tsx`<br>… +9 |
| `status` | `checking` | compara, escreve | `src/components/auth/ProtectedRoute.tsx`<br>`src/hooks/system/useSupabaseConnectivity.ts`<br>`src/pages/TwoFactorAuth.tsx` |
| `status` | `completed` | compara, escreve, filtra | `src/components/admin/TrainingMode.tsx`<br>`src/components/chatbot/ChatbotExecutionsDashboard.tsx`<br>`src/components/knowledge/KnowledgeBaseView.tsx`<br>`src/components/multiplix/MultiplixMonitor.tsx`<br>`src/components/talkx/TalkXLiveMonitor.tsx`<br>… +8 |
| `status` | `completed_with_failures` | compara | `src/components/multiplix/MultiplixMonitor.tsx` |
| `status` | `connected` | compara, escreve, filtra | `src/components/connections/ConnectionCard.tsx`<br>`src/components/connections/ConnectionsView.tsx`<br>`src/components/dashboard/systemHealth.ts`<br>`src/components/diagnostics/ConnectionHealthPanel.tsx`<br>`src/components/diagnostics/DiagnosticsView.tsx`<br>… +35 |
| `status` | `connecting` | compara, escreve | `src/components/calls/CallDialog.tsx`<br>`src/components/calls/NewCallPanel.tsx`<br>`src/components/connections/ConnectionCard.tsx`<br>`src/components/diagnostics/DiagnosticsView.tsx`<br>`src/components/inbox/RealtimeTranscription.tsx`<br>… +6 |
| `status` | `critical` | compara | `src/components/performance/PerformanceMonitor.tsx` |
| `status` | `declined` | compara, escreve | `src/lib/calls/WhatsAppCallAdapter.ts`<br>`src/lib/calls/callStatus.ts` |
| `status` | `degraded` | compara, escreve | `src/components/monitoring/MonitoringHealthLogs.tsx`<br>`src/components/ui/supabase-connectivity-banner.tsx`<br>`src/hooks/integrations/useTalkXLiveChannel.ts`<br>`src/hooks/system/useSupabaseConnectivity.ts` |
| `status` | `deleted` | escreve | `supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| `status` | `delivered` | compara, escreve, filtra | `src/components/inbox/chat/messageUtils.tsx`<br>`src/hooks/system/useDiagnosticsData.ts`<br>`src/hooks/team-chat/useParticipantStats.ts`<br>`src/hooks/team-chat/useTeamConversations.ts` |
| `status` | `demo` | compara, escreve | `src/components/integrations/IntegrationsHub.tsx` |
| `status` | `dialing` | compara, escreve | `src/components/calls/CallDialog.tsx`<br>`src/components/calls/NewCallPanel.tsx`<br>`src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `status` | `disabled` | compara | `src/components/email/EmailContactPanel.tsx`<br>`src/components/inbox/contact-details/sidebar/ContactSidebarSections.tsx`<br>`src/components/inbox/contact-details/sidebar/PersonalSection.tsx`<br>`src/components/inbox/contact-details/sidebar/SinguProfileSection.tsx`<br>`src/components/security/SecuritySettingsPanel.tsx` |
| … +221 linhas — lista completa em `context.json` | | | |

### E.4 Enums e listas de valores

| Nome | Valores | Onde |
|---|---|---|
| ai_provider_type | `lovable_ai`, `openai_compatible`, `google_gemini`, `custom_webhook`, `custom_agent` | banco |
| app_role | `admin`, `supervisor`, `special_agent`, `agent` | banco |
| channel_type | `whatsapp`, `instagram`, `telegram`, `messenger`, `webchat`, `email` | banco |
| service_account_type | `google_sheets`, `google_docs`, `google_calendar`, `google_drive`, `dropbox` | banco |
| multiplix_dispatch_status | `draft`, `scheduled`, `sending`, `paused`, `completed`, `completed_with_failures`, `failed`, `cancelled` | banco |
| multiplix_recipient_status | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `skipped`, `cancelled`, `outcome_unknown` | banco |
| multiplix_item_status | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` | banco |
| multiplix_block_type | `text`, `voice_ai`, `audio_recorded`, `file` | banco |
| multiplix_eligibility | `eligible`, `no_destination`, `suppressed`, `out_of_scope`, `media_pending`, `connection_unavailable`, `requires_template` | banco |
| talkx_blacklist_reason | `opt_out`, `bounce`, `spam`, `manual`, `other` | banco |
| CHAVE_TAREFAS_AGENDADAS | 'admin-cron-jobs' | `src/components/admin/useTarefasAgendadas.ts` |
| TriggerConfigInput | keywords \| number \| text | `src/components/automations/automationConstants.ts` |
| CanalDeSaida | voip \| whatsapp | `src/components/calls/NewCallPanel.tsx` |
| PERIODOS | { value: 'hoje', label: 'Hoje' }, { value: 'ontem', label: 'Ontem' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'mes', label: 'Este mês' }, { value: 'mes_passado', label: 'Mês passado' }, | `src/components/calls/periodos.ts` |
| CatalogRailAlertId | sync \| low_stock | `src/components/catalog/CatalogRail.tsx` |
| CatalogRailFilterKey | in_stock \| featured \| new_30d | `src/components/catalog/CatalogRail.tsx` |
| CATALOG_RAIL_TIPS | 'Use "Enviar" no card para mandar o produto direto no WhatsApp do contato.', 'Filtre por "Em destaque" para montar uma seleção pronta antes da reunião.', 'O filtro "Novidades" mostra o que entrou nos últimos 30 dias — bom para prospecção.', 'Estoque baixo aparece no rail: priorize esses brindes ante … | `src/components/catalog/CatalogRail.tsx` |
| ProductBadgeKind | out \| bestseller \| new \| featured \| instock | `src/components/catalog/catalogShared.tsx` |
| MessageTemplate | formal \| informal \| promo | `src/components/catalog/sendProductUtils.ts` |
| SendMode | product \| variant | `src/components/catalog/sendProductUtils.ts` |
| EDGE_CONDITIONS | { value: 'true', label: 'Verdadeiro' }, { value: 'false', label: 'Falso' }, | `src/components/chatbot/chatbotNodeConfig.ts` |
| ContactViewMode | grid \| list \| table \| map \| kanban \| analytics | `src/components/contacts/ContactViewSwitcher.tsx` |
| AlertLevel | ok \| warning \| critical | `src/components/copilot/SpeedToLeadAlert.tsx` |
| TransparencyLabelVariant | inline \| banner \| badge | `src/components/copilot/TransparencyLabel.tsx` |
| SystemHealthGrade | excelente \| bom \| atencao \| critico | `src/components/dashboard/systemHealth.ts` |
| SystemHealthTone | success \| info \| warning \| danger | `src/components/dashboard/systemHealth.ts` |
| SystemHealthItemStatus | ok \| warn \| bad | `src/components/dashboard/systemHealth.ts` |
| SystemHealthItemId | connections \| failures \| stalled | `src/components/dashboard/systemHealth.ts` |
| GoalStatusTone | success \| primary \| warning \| destructive | `src/components/dashboard/goals/goalsStatus.ts` |
| TrendDirection | up \| down \| neutral | `src/components/dashboard/metrics/types.ts` |
| MetricSize | sm \| md \| lg \| xl | `src/components/dashboard/metrics/types.ts` |
| MetricVariant | default \| success \| warning \| danger \| info | `src/components/dashboard/metrics/types.ts` |
| MOTIVATION_PHRASES | 'Disciplina hoje, resultados amanhã.', 'Cada conversa é uma oportunidade.', 'Constância vence intensidade.', 'Um passo de cada vez, sempre em frente.', 'Excelência é hábito, não acidente.', 'Foco no cliente, resultado garantido.', 'Hoje é um bom dia para superar ontem.', | `src/components/dashboard/overview/motivationPhrases.ts` |
| SLARateTone | success \| warning \| destructive | `src/components/dashboard/sla/slaRate.ts` |
| FeatureState | active \| disabled | `src/components/docs/featuresSectionsData.ts` |
| AchievementType | fast_response \| streak \| first_message \| resolution \| perfect_rating \| level_up \| daily_goal \| speed_demon \| achievement | `src/components/gamification/AchievementToast.tsx` |
| GameType | speed-typing \| quiz \| response-match \| emoji-decode | `src/components/gamification/miniGamesData.ts` |
| MediaVolumeControlVariant | bubble \| overlay \| sidebar | `src/components/inbox/MediaVolumeControl.tsx` |
| TransferTargetType | agent \| queue | `src/components/inbox/TransferDialog.tsx` |
| ResultType | message \| contact \| transcription \| action \| crm | `src/components/inbox/useGlobalSearchData.ts` |
| DateFilter | all \| today \| 7days \| 30days \| 90days | `src/components/inbox/useGlobalSearchData.ts` |
| MediaTypeFilter | all \| text \| image \| video \| audio \| document \| link | `src/components/inbox/useGlobalSearchData.ts` |
| AnalysisPeriod | all \| last_interaction \| today \| 3d \| 7d \| 14d \| 30d \| 90d \| custom | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| ConversationTab | chat \| files \| ia \| crm \| orders \| history \| tasks \| notes | `src/components/inbox/chat/ConversationTabs.tsx` |
| DialogKey | quickReplies \| slashCommands \| transferDialog \| scheduleDialog \| callDialog \| globalSearch \| chatSearch \| interactiveBuilder \| forwardDialog \| locationPicker \| aiAssistant \| catalogDirect \| whisper \| templatesWithVars \| realtimeTranscription \| closeDialog | `src/components/inbox/chat/dialogKeys.ts` |
| ActiveTool | chatSearch \| objections \| university \| aiAssistant \| summary | `src/components/inbox/chat/dialogKeys.ts` |
| SendTimelineState | done \| current \| pending \| error | `src/components/inbox/chat/messageSendTimeline.ts` |
| EstadoDeEnvio | queued \| inFlight \| failed | `src/components/inbox/chat/messageSendTimeline.ts` |
| MorphState | idle \| loading \| success \| error | `src/components/inbox/chat/motion/MorphButton.tsx` |
| MotionTone | info \| primary \| success \| warning \| destructive \| whatsapp | `src/components/inbox/chat/motion/tone.ts` |
| StoryMediaKind | image \| video \| text | `src/components/inbox/contact-details/storyUtils.ts` |
| SidebarSectionTone | blue \| purple \| green | `src/components/inbox/contact-details/sidebar/SidebarSection.tsx` |
| SinguDetailKind | metaprograms \| fears \| decision \| budget \| influencers \| rapport \| objections | `src/components/inbox/contact-details/sidebar/SinguProfileDetailSheet.tsx` |
| SIDEBAR_SECTIONS | 'professional', 'personal', 'singu', 'intelligence', 'delivery' | `src/components/inbox/contact-details/sidebar/sidebarSections.ts` |
| ReopenAction | reopen \| unarchive | `src/components/inbox/conversation-list/ConversationReopenDialog.tsx` |
| MainTab | open \| resolved \| search | `src/components/inbox/conversation-list/StatusChips.tsx` |
| SubTab | attending \| waiting | `src/components/inbox/conversation-list/StatusChips.tsx` |
| ChipTab | all \| unread \| attending \| waiting \| resolved \| archived | `src/components/inbox/conversation-list/StatusChips.tsx` |
| SearchStatus | idle \| typing \| loading \| ok \| empty \| error \| paused | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| LocationOrigin | suggest \| forward \| click \| gps | `src/components/inbox/location-picker/useLocationPicker.ts` |
| FileThumbSize | card \| row \| cell | `src/components/inbox/tabs/FileThumb.tsx` |
| KpiTone | blue \| green \| purple \| yellow \| red | `src/components/inbox/tabs/KpiStrip.tsx` |
| SenderAvatarSize | sm \| md | `src/components/inbox/tabs/SenderAvatar.tsx` |
| DocumentFamily | pdf \| sheet \| doc \| ppt \| archive \| generic | `src/components/inbox/tabs/fileDisplay.ts` |
| GlowToken | primary \| success \| warning \| info \| muted | `src/components/inbox/tabs/journey/motion/presets.ts` |
| TimePeriod | 1h \| 6h \| 12h \| 24h \| 7d | `src/components/monitoring/hooks/types.ts` |
| AlertSeverity | critical \| warning | `src/components/monitoring/hooks/useConnectionIncidents.ts` |
| MetricStatus | good \| warning \| critical | `src/components/performance/metricThresholds.ts` |
| PeriodOption | 7d \| 14d \| 30d \| custom | `src/components/queues/PeriodSelector.tsx` |
| ProviderType | lovable_ai \| openai_compatible \| google_gemini \| custom_webhook \| custom_agent | `src/components/settings/ai-providers/types.ts` |
| MediaType | stickers \| audio_memes \| custom_emojis | `src/components/settings/media-library/useMediaLibrary.ts` |
| PRESET_FIXED_OVERRIDES | 'gradient-success' | `src/components/settings/theme/presets.ts` |
| AudienceFilterKey | contact_status \| company \| funnel_stage \| seller \| rfm \| location | `src/components/talkx/TalkXAudienceFilters.tsx` |
| TalkXPreviewMode | raw \| resolved | `src/components/talkx/TalkXMessagePreview.tsx` |
| TalkXTopView | tabs \| wizard \| monitor \| scheduled \| running \| paused | `src/components/talkx/TalkXView.tsx` |
| AnalyticsPeriod | 7d \| 30d \| 90d \| month \| custom | `src/components/talkx/talkxAnalyticsFilters.ts` |
| TalkxInteractiveButtonType | reply \| link | `src/components/talkx/talkxInteractive.ts` |
| TalkxInteractiveMode | none \| buttons \| poll | `src/components/talkx/talkxInteractive.ts` |
| TalkXScreen | monitor \| scheduled \| running \| paused | `src/components/talkx/talkxRoute.ts` |
| TALKX_TABS | 'overview', 'segments', 'templates', 'suppression', 'analytics' | `src/components/talkx/talkxRoute.ts` |
| TalkXTemplateTab | conteudo \| ab \| historico | `src/components/talkx/talkxTemplateRoute.ts` |
| AudienceSource | contacts \| segment \| crm360 | `src/components/talkx/useCampaignEditor.ts` |
| CampaignRowActionId | view \| edit \| start \| pause \| resume \| duplicate \| cancel \| delete | `src/components/talkx/useCampaignRowActions.tsx` |
| CampaignRowConfirmKind | start \| pause \| resume \| duplicate \| cancel \| delete | `src/components/talkx/useCampaignRowActions.tsx` |
| TalkXLifecycleKind | start \| pause \| resume \| cancel \| schedule | `src/components/talkx/useTalkXLifecycle.tsx` |
| TalkxMediaType | image \| video \| document \| audio | `src/components/talkx/useTalkXMediaUpload.ts` |
| TALKX_MEDIA_MIME_TYPES | 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'audio/ogg', 'audio/mpeg', 'audio/mp4', | `src/components/talkx/useTalkXMediaUpload.ts` |
| PerformancePeriod | 7d \| 30d \| 90d | `src/components/talkx/analytics/AnalyticsPerformanceChart.tsx` |
| TalkXHelpKind | artigo \| guia | `src/components/talkx/help/talkxHelpIndex.ts` |
| TalkXHelpLevel | Iniciante \| Intermediário \| Avançado | `src/components/talkx/help/talkxHelpIndex.ts` |
| PillTone | success \| danger \| warning \| info \| violet \| muted | `src/components/talkx/kit/constants.ts` |
| TileColor | blue \| red \| green \| violet \| amber | `src/components/talkx/kit/constants.ts` |
| TEMPLATE_CATEGORIES | 'boas-vindas', 'vendas', 'promocao', 'follow-up', 'pos-venda', 'reativacao', 'catalogo', 'sazonal', 'financeiro', 'geral', | `src/components/talkx/kit/constants.ts` |
| VARIABLE_KEYS | '{{nome}}', '{{nome_completo}}', '{{apelido}}', '{{empresa}}', '{{saudacao}}', '{{vendedor}}', '{{data_atual}}', '{{link}}' | `src/components/talkx/kit/constants.ts` |
| TalkXTone | primary \| danger \| success \| violet | `src/components/talkx/kit/dialogs.tsx` |
| TALKX_FORCED_STATES | 'empty', 'loading', 'error', 'crm', 'wa', 'perm' | `src/components/talkx/kit/forcedState.ts` |
| InsightType | timing \| template \| reactivation \| links | `src/components/talkx/kit/insight.tsx` |
| InsightPriority | high \| medium \| low | `src/components/talkx/kit/insight.tsx` |
| KpiComparisonKind | relative \| points | `src/components/talkx/kit/kpi.tsx` |
| KpiVisual | bars \| ring \| none | `src/components/talkx/kit/kpi.tsx` |
| TalkXSortDir | asc \| desc | `src/components/talkx/kit/table.tsx` |
| TalkXReportGranularity | day \| hour | `src/components/talkx/report/talkxReportCharts.ts` |
| TalkXReportFunnelStepKey | sent \| delivered \| replied \| clicked \| converted | `src/components/talkx/report/talkxReportCharts.ts` |
| TalkXReportHeatmapMetric | replied \| sent \| clicked | `src/components/talkx/report/talkxReportCharts.ts` |
| TalkXWorkerState | sending \| stalled \| paused_manual \| paused_auto \| done | `src/components/talkx/tracking/talkxHealth.ts` |
| SUMMARY_WINDOWS | { id: '24h', label: 'Últimas 24 horas', minutes: 1440 }, { id: '12h', label: 'Últimas 12 horas', minutes: 720 }, { id: '6h', label: 'Últimas 6 horas', minutes: 360 }, | `src/components/talkx/tracking/talkxSentSummary.ts` |
| TaskMode | list \| board \| agenda | `src/components/tasks/shared/ModeSwitcher.tsx` |
| TasksDensity | comfortable \| compact | `src/components/tasks/shared/TasksKpiStrip.tsx` |
| KpiDueRecorte | overdue \| today | `src/components/tasks/shared/TasksKpiStrip.tsx` |
| TasksDensity | comfortable \| compact | `src/components/tasks/shared/tasksUi.ts` |
| TomAviso | success \| warning \| destructive | `src/components/tasks/shared/sheet/planejamento.ts` |
| TransitionVariantName | none \| fade \| slide \| zoom \| flip \| parallax | `src/components/transitions/transitionVariants.ts` |
| SlideDirection | left \| right \| up \| down | `src/components/transitions/transitionVariants.ts` |
| FlipAxis | x \| y | `src/components/transitions/transitionVariants.ts` |
| CommandCategory | navigation \| action \| search \| recent \| talkx | `src/components/ui/command-palette-data.tsx` |
| OPEN_CONVERSATION_STATUSES | 'open', 'waiting', 'pending' | `src/hooks/admin/useSupervisorQueue.ts` |
| AGENT_PENDING_COUNTS_KEY | 'agents-pending-counts' | `src/hooks/agents/useAgentPendingCounts.ts` |
| AGENT_RECENT_SENDS_KEY | 'agents-recent-sends' | `src/hooks/agents/useAgentRecentSends.ts` |
| TimeFilter | 1h \| 6h \| 24h \| 7d \| 30d | `src/hooks/analytics/useAIUsageDashboard.ts` |
| WidgetSize | small \| medium \| large \| full | `src/hooks/analytics/useDashboardWidgets.ts` |
| InsightPeriod | 24h \| 7d \| 30d | `src/hooks/analytics/useRecentAnalyses.ts` |
| MFA_TOTP_QUERY_KEY | 'mfa-verified-totp' | `src/hooks/auth/useMFA.ts` |
| ReauthMotivo | senha_incorreta \| conta_bloqueada \| indisponivel \| rede \| codigo_necessario \| codigo_incorreto | `src/hooks/auth/useReauthentication.ts` |
| QUEUE_GOAL_BANDS | 50, 75, 100 | `src/hooks/business/useQueueGoals.ts` |
| QUEUE_GOAL_BANDS_INVERTED | 25, 50, 75 | `src/hooks/business/useQueueGoals.ts` |
| SNOOZE_DURATIONS | '1h', '3h', 'tomorrow', 'nextweek' | `src/hooks/chat/snoozeDurations.ts` |
| AutomationSuggestionFailure | quota \| network \| other | `src/hooks/chat/useAutomationSuggestions.ts` |
| SearchFilter | all \| text \| image \| video \| audio \| document \| link | `src/hooks/chat/useChatSearch.ts` |
| DatePreset | all \| last_interaction \| today \| 3d \| 7d \| 14d \| 30d \| 90d \| custom | `src/hooks/chat/useChatSearch.ts` |
| ContactMediaKind | image \| video \| audio \| document \| sticker | `src/hooks/chat/useContactMedia.ts` |
| TimelineEventKind | message_in \| message_out \| note \| transfer \| assign \| file \| task \| deal \| close \| reopen \| call | `src/hooks/chat/useConversationHistoryTimeline.ts` |
| TimelineTypeFilter | all \| messages \| notes \| tasks \| transfers \| files \| deals \| calls | `src/hooks/chat/useConversationHistoryTimeline.ts` |
| FilesViewMode | grid \| list \| table | `src/hooks/chat/useFilesViewState.ts` |
| FilesSort | recent \| old \| biggest \| alpha | `src/hooks/chat/useFilesViewState.ts` |
| FILES_COLUMNS | 3, 4, 5, 6, 8 | `src/hooks/chat/useFilesViewState.ts` |
| ForwardTargetType | contact \| group | `src/hooks/chat/useForwardMedia.ts` |
| ForwardMediaKind | image \| video \| audio \| document | `src/hooks/chat/useForwardMedia.ts` |
| PdfThumbnailEstado | loading \| ready \| sem-previa \| erro | `src/hooks/chat/usePdfThumbnail.ts` |
| ProductAvailability | disponivel \| confirmar | `src/hooks/chat/useRecommendedProducts.ts` |
| ScheduledMessageStatus | pending \| sent \| failed \| cancelled | `src/hooks/chat/useScheduledMessages.ts` |
| REPORT_TYPES | { value: 'dashboard_summary', label: 'Resumo do Dashboard', icon: 'BarChart3', description: 'Métricas gerais de atendimento' }, { value: 'agent_performance', label: 'Performance de Agentes', icon: 'Users', description: 'Relatório individual por agente' }, { value: 'conversation_analytics', label: 'A … | `src/hooks/chat/useScheduledReports.ts` |
| FREQUENCIES | { value: 'daily', label: 'Diário', description: 'Todos os dias às 8h' }, { value: 'weekly', label: 'Semanal', description: 'Toda segunda-feira às 8h' }, { value: 'monthly', label: 'Mensal', description: 'Primeiro dia do mês às 8h' }, | `src/hooks/chat/useScheduledReports.ts` |
| FORMATS | { value: 'pdf', label: 'PDF' }, { value: 'excel', label: 'Excel' }, | `src/hooks/chat/useScheduledReports.ts` |
| MotivoRecusaSussurro | contato_invalido \| sem_responsavel \| sem_perfil \| falha | `src/hooks/chat/useWhisperMessagesMutation.ts` |
| JourneyActorViewKind | self \| user \| contact \| system | `src/hooks/chat/journey/useJourneyActors.ts` |
| SpeechErrorCode | permission \| no-speech \| network \| device \| unknown | `src/hooks/communication/useSpeechToText.ts` |
| SinalConclusao | transicao_de_status \| carimbo_recente \| ausente | `src/hooks/communication/useTranscriptionNotifications.ts` |
| MotivoAviso | responsavel_proprio \| sem_responsavel \| responsavel_desconhecido \| consulta_sem_resposta \| outro_responsavel | `src/hooks/communication/useTranscriptionNotifications.ts` |
| CONTACTS_V2_AREAS | 'toolbar', 'cards', 'detalhe', 'empresa', 'edicao', 'protecao' | `src/hooks/contacts/useContactsV2Flags.ts` |
| AttachmentType | catalog \| product_photo \| price_table \| mockup | `src/hooks/copilot/useAttachmentSuggestion.ts` |
| AudioToneType | angry \| frustrated \| enthusiastic \| neutral \| uncertain | `src/hooks/copilot/useAudioTone.ts` |
| BiasCategory | unrealistic_promise \| competitor_derogation \| excessive_informality \| pressure_tactic \| exclusionary_language | `src/hooks/copilot/useBiasChecker.ts` |
| EditLevel | igual \| pouco \| muito | `src/hooks/copilot/useCopilotFeedback.ts` |
| FeedbackRating | positive \| negative | `src/hooks/copilot/useCopilotFeedback.ts` |
| FeedbackReason | errou_fato \| tom_errado \| fora_de_hora \| generica | `src/hooks/copilot/useCopilotFeedback.ts` |
| SuggestionOutcome | accepted \| edited \| rejected \| ignored | `src/hooks/copilot/useCopilotLearning.ts` |
| InsightPriority | critical \| high \| medium \| low | `src/hooks/copilot/useCopilotSupervisor.ts` |
| InsightSource | objection \| purchase_signal \| speed_to_lead \| guardrail \| silence \| loss_risk \| discount_guardrail \| deadline | `src/hooks/copilot/useCopilotSupervisor.ts` |
| DeadlineFeasibility | ok \| tight \| impossible | `src/hooks/copilot/useDeadlineCalculator.ts` |
| LeadTemperature | cold \| warm \| hot | `src/hooks/copilot/useLeadThermometer.ts` |
| LearningMomentType | new_objection \| unknown_product \| successful_close \| missed_upsell \| price_negotiation_won \| customer_escalation | `src/hooks/copilot/useLearningMoment.ts` |
| LogoFormat | vector \| raster_hq \| raster_lq \| unknown | `src/hooks/copilot/useLogoAnalysis.ts` |
| LogoComplexity | simple \| medium \| complex | `src/hooks/copilot/useLogoAnalysis.ts` |
| LossRiskLevel | low \| medium \| high | `src/hooks/copilot/useLossRiskDetector.ts` |
| PrivacyRisk | none \| low \| medium \| high | `src/hooks/copilot/useMediaPrivacy.ts` |
| ObjeçãoType | preco \| prazo \| quantidade_minima \| concorrente \| chefe \| qualidade \| frete \| generica | `src/hooks/copilot/useObjectionHandler.ts` |
| PIIType | cpf \| cnpj \| phone \| email \| card \| address | `src/hooks/copilot/usePIIDetector.ts` |
| ResponseUrgency | ok \| slow \| critical | `src/hooks/copilot/useSpeedToLead.ts` |
| StallType | thinking \| busy \| silent \| ghosted | `src/hooks/copilot/useStallDetector.ts` |
| EscalationLevel | none \| high \| critical | `src/hooks/copilot/useUrgencyEscalation.ts` |
| VendorLevel | junior \| pleno \| senior \| supervisor | `src/hooks/copilot/useVendorAuthorization.ts` |
| SensitiveAction | discount_above_10 \| discount_above_20 \| payment_extension \| price_history_view \| bulk_negotiation \| competitor_price_match \| free_mockup | `src/hooks/copilot/useVendorAuthorization.ts` |
| DictationState | idle \| recording \| transcribing \| generating \| error | `src/hooks/copilot/useVoiceDictation.ts` |
| PresenceStatus | online \| away \| offline | `src/hooks/crm/useAgentPresence.ts` |
| ContactNoteCategory | note \| fact \| objection \| promise | `src/hooks/crm/useContactNotes.ts` |
| EmailContactContextStatus | disabled \| loading \| not_linked \| ambiguous \| permission_denied \| error \| available | `src/hooks/crm/useEmailContactContext.ts` |
| DAILY_KPIS_PERIODS | 7, 30, 90 | `src/hooks/dashboard/useDailyMetricsKpis.ts` |
| HttpMethod | GET \| POST \| PUT \| PATCH \| DELETE | `src/hooks/evolution/useEvolutionApiCore.ts` |
| FeedbackType | success \| error \| warning \| info \| loading | `src/hooks/feedback/feedbackTypes.ts` |
| GmailSyncStatus | pending \| syncing \| synced \| error \| reauth_required | `src/hooks/gmail/gmailTypes.ts` |
| ContactUnreadEmailsStatus | idle \| loading \| ok \| erro | `src/hooks/gmail/useContactUnreadEmails.ts` |
| UnreadEmailCountStatus | loading \| ok \| erro | `src/hooks/gmail/useUnreadEmailCount.ts` |
| GROUP_CATEGORIES | { value: 'orcamentos', label: 'Orçamentos \| Fornecedores', color: 'text-info', icon: '📋' }, { value: 'aprovacao', label: 'Aprovação \| Fornecedores', color: 'text-success', icon: '✅' }, { value: 'os', label: 'O.S. \| Fornecedores', color: 'text-warning', icon: '🔧' }, { value: 'acerto', label: 'Acerto … | `src/hooks/groups/types.ts` |
| ConversationStatus | open \| waiting \| resolved \| archived | `src/hooks/inbox/conversationArchive.ts` |
| ConnectionBannerLevel | ok \| warn \| down | `src/hooks/inbox/useConnectionHealthBanner.ts` |
| INBOX_FILTER_PRESETS_QUERY_KEY | 'saved-filters', INBOX_FILTER_PRESET_ENTITY, | `src/hooks/inbox/useInboxFilterPresets.ts` |
| CatalogSendStatus | sent \| partial \| failed | `src/hooks/integrations/useCatalogContactSearch.ts` |
| CatalogSendTemplate | formal \| informal \| promo \| custom | `src/hooks/integrations/useCatalogContactSearch.ts` |
| CATALOG_SEND_EVENTS_KEY | 'catalog-send-events' | `src/hooks/integrations/useCatalogRecentSends.ts` |
| EmailThreadForContactStatus | loading \| found \| none \| error | `src/hooks/integrations/useEmailThreadForContact.ts` |
| CatalogErrorCode | CATALOG_UPSTREAM_ERROR \| CATALOG_NOT_CONFIGURED \| CATALOG_CREDENTIALS_INVALID \| CATALOG_INTERNAL_ERROR \| CATALOG_RATE_LIMITED | `src/hooks/integrations/useExternalCatalog.ts` |
| EmailThreadStatusFilter | open \| pending \| resolved \| archived | `src/hooks/integrations/useGmail.ts` |
| GmailLabelListVisibility | labelShow \| labelShowIfUnread \| labelHide | `src/hooks/integrations/useGmailLabels.ts` |
| GmailLabelMessageListVisibility | show \| hide | `src/hooks/integrations/useGmailLabels.ts` |
| MultiplixReplyAttribution | linked \| inferred | `src/hooks/integrations/useMultiplixReplies.ts` |
| MultiplixRepliesStatus | idle \| loading \| error \| empty \| ready | `src/hooks/integrations/useMultiplixReplies.ts` |
| QuarantineFilter | all \| pending \| allowed \| deleted \| whitelisted | `src/hooks/integrations/useQuarantineMedia.ts` |
| QuarantineDecision | allowed \| deleted \| whitelisted | `src/hooks/integrations/useQuarantineMedia.ts` |
| TalkXRecurrenceFrequency | daily \| weekly | `src/hooks/integrations/useTalkX.ts` |
| TalkXCampaignSortField | name \| status \| sent_count \| scheduled_at \| created_at | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TALKX_CAMPAIGN_PAGE_SIZES | 10, 20, 50 | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TALKX_CAMPAIGN_SEARCH_COLUMNS | 'name', 'description', 'message_template' | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TalkXEventType | created \| updated \| scheduled \| started \| paused \| resumed \| cancelled \| completed \| note | `src/hooks/integrations/useTalkXEvents.ts` |
| TalkXClientEventType | note \| checklist \| segments_reviewed | `src/hooks/integrations/useTalkXEvents.ts` |
| TalkXInsightAction | new-campaign \| templates \| campaigns | `src/hooks/integrations/useTalkXInsights.ts` |
| TalkXLiveStatus | connecting \| live \| degraded \| offline | `src/hooks/integrations/useTalkXLiveChannel.ts` |
| TalkXResumeChecklistItemKey | segments \| templates \| limits \| schedule \| autoresponse | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| TalkXResumeChecklistVerification | auto \| manual | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| TalkXResumeChecklistStatus | ok \| attention \| pending \| done \| unknown | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| RuleField | tags \| company \| contact_type \| conversation_status \| channel_type \| consent_status \| lead_score \| risk_score \| ai_priority \| ai_sentiment \| lead_origin \| updated_at \| created_at \| email \| city \| state \| assigned_to \| group_category \| real_sector \| real_uf | `src/hooks/integrations/useTalkXSegments.ts` |
| RuleOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| in_last_days \| not_in_last_days \| is_set \| is_empty | `src/hooks/integrations/useTalkXSegments.ts` |
| SegmentJoin | and \| or | `src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentBulkAction | draft \| activate \| deactivate \| archive \| tag | `src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentsViewMode | list \| grid | `src/hooks/integrations/useTalkXSegments.ts` |
| LIBRARY_STATS_QUERY_KEY | 'talkx-segment-library-stats', SEGMENT_TIMEZONE | `src/hooks/integrations/useTalkXSegments.ts` |
| SEGMENT_LIBRARY_PAGE_SIZES | 8, 10, 20, 50 | `src/hooks/integrations/useTalkXSegments.ts` |
| TalkXResumeBlocker | connection_not_connected \| outside_send_window \| recipients_suppressed | `src/hooks/integrations/useTalkXServerResumePrecheck.ts` |
| SuppressionActivityAction | add \| remove \| update \| import \| export | `src/hooks/integrations/useTalkXSuppression.ts` |
| SUPPRESSION_ACTIVITY_EVENT_TYPES | 'suppression_add', 'suppression_remove', 'suppression_update', 'suppression_import', 'suppression_export', | `src/hooks/integrations/useTalkXSuppression.ts` |
| TALKX_TEMPLATE_STATS_PERIODS | 7, 30, 90 | `src/hooks/integrations/useTalkXTemplateStats.ts` |
| RealtimeChannelHealth | connecting \| connected \| error | `src/hooks/realtime/realtimeStatusStore.ts` |
| RealtimeStatus | idle \| connecting \| connected \| disconnected | `src/hooks/realtime/realtimeStatusStore.ts` |
| SipStatus | idle \| connecting \| registered \| reconnecting \| unavailable | `src/hooks/sip/useSipConnection.ts` |
| FirstResponseOutcome | on_time \| breached \| pending | `src/hooks/sla/slaFirstResponse.ts` |
| SLAStatus | ok \| warning \| breached | `src/hooks/sla/useSLACalculation.ts` |
| HistoryPeriod | 7d \| 14d \| 30d \| 90d | `src/hooks/sla/useSLAHistory.ts` |
| PeriodFilter | today \| week \| month \| all | `src/hooks/sla/useSLAMetrics.ts` |
| SLARuleScope | contact \| company \| job_title \| contact_type \| queue \| agent | `src/hooks/sla/useSLARules.ts` |
| ConnectionAlertKind | degraded \| disconnected | `src/hooks/system/useConnectionAlertPreferences.ts` |
| HealthStatus | healthy \| degraded \| down \| unauthorized \| unknown | `src/hooks/system/useDiagnosticsData.ts` |
| FEATURE_FLAGS_QUERY_KEY | 'feature-flags' | `src/hooks/system/useFeatureFlag.ts` |
| MotivoRecusaTrocaDeModo | pais-nao-detectado \| whitelist-sem-pais-do-admin \| blacklist-com-pais-do-admin | `src/hooks/system/useGeoBlocking.ts` |
| GLOBAL_SETTINGS_QUERY_KEY | 'global-settings' | `src/hooks/system/useGlobalSettings.ts` |
| SoundTypeOption | beep \| chime \| bell \| alert \| soft | `src/hooks/system/useNotificationSettings.ts` |
| RateLimitSortKey | created_at \| ip_address \| endpoint \| request_count \| blocked | `src/hooks/system/useRateLimitLogs.ts` |
| RateLimitSortDir | asc \| desc | `src/hooks/system/useRateLimitLogs.ts` |
| SupabaseConnectivityStatus | checking \| online \| degraded \| offline | `src/hooks/system/useSupabaseConnectivity.ts` |
| WorkItemStatus | backlog \| todo \| doing \| waiting \| done \| cancelled | `src/hooks/tasks/workItem.types.ts` |
| Priority | low \| medium \| high \| urgent | `src/hooks/tasks/workItem.types.ts` |
| TransitionBlockReason | wip_full \| waiting_reason_required \| invalid_transition | `src/hooks/tasks/workItem.types.ts` |
| BoardDueColumnKey | atrasadas \| paraHoje \| fazendo \| concluidas | `src/hooks/tasks/workItemBoardGroups.ts` |
| DueFilter | all \| overdue \| today \| week \| none | `src/hooks/tasks/workItemFilters.ts` |
| WorkItemDateFormat | datetime \| day | `src/hooks/tasks/workItemFormat.ts` |
| MES_CURTO_PT_BR | 'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.', | `src/hooks/tasks/workItemFormat.ts` |
| DuePreset | today \| tomorrow \| nextWeek | `src/hooks/tasks/workItemPresets.ts` |
| RemindPreset | in1h \| tomorrow9 \| nextMonday9 | `src/hooks/tasks/workItemPresets.ts` |
| RemindCoherenceState | ok \| in_past \| after_due \| no_due | `src/hooks/tasks/workItemPresets.ts` |
| TeamConversationType | direct \| group \| department | `src/hooks/team-chat/teamChatTypes.ts` |
| TeamMemberRole | owner \| admin \| member | `src/hooks/team-chat/teamChatTypes.ts` |
| DEPARTMENT_AUDIT_ACTIONS | 'accept_invite', 'create_invite', 'join_department', 'leave_department', 'remove_member', 'update_settings', 'delete_department', 'create_department', 'update_role', 'kick_member', 'create_group', 'delete_group', 'whatsapp_updated', 'access_requested', 'invite_created', 'invite_revoked', 'invite_acc … | `src/hooks/team-chat/teamChatTypes.ts` |
| TeamMessageStatusType | sending \| sent \| delivered \| read \| failed \| deleted | `src/hooks/team-chat/teamMessageStatus.ts` |
| TeamFileKind | image \| document \| audio \| other | `src/hooks/team-chat/useTeamFiles.ts` |
| TEAM_FILE_REACTION_MEDIA_TYPES | 'sticker', 'emoji', 'audio_meme' | `src/hooks/team-chat/useTeamFiles.ts` |
| DensityMode | comfortable \| compact \| dense | `src/hooks/ui/useDensity.ts` |
| Theme | light \| dark \| system | `src/hooks/ui/useTheme.ts` |
| ResolvedTheme | light \| dark | `src/hooks/ui/useTheme.ts` |
| VoiceAgentPhase | idle \| booting \| listening \| processing \| speaking \| error | `src/hooks/voice/types.ts` |
| VoiceActionLevel | success \| info \| warning | `src/hooks/voice/voiceActionPlan.ts` |
| FILTER_PARAM_KEYS | 'q', 'status', 'tags', 'agent', 'from', 'to', 'type' | `src/hooks/voice/voiceActionPlan.ts` |
| VoiceSessionEndReason | inactivity \| duration \| hidden | `src/hooks/voice/voiceSessionLimits.ts` |
| AuditAction | login \| logout \| message_sent \| message_received \| contact_created \| contact_updated \| connection_created \| connection_deleted \| call_started \| call_ended \| transfer \| settings_changed \| client_error \| searchbox_session \| searchbox_cost_guard \| searchbox_budget_warning \| searchbox_selected \| location_sent \| unauthorized_access | `src/lib/audit.ts` |
| CHART_PALETTE | CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary, CHART_COLORS.quaternary, CHART_COLORS.quinary, CHART_COLORS.senary, CHART_COLORS.septenary, CHART_COLORS.octonary, CHART_COLORS.nonary, CHART_COLORS.denary, | `src/lib/chartColors.ts` |
| CHART_PALETTE_MINI | CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary, CHART_COLORS.quaternary, CHART_COLORS.quinary, | `src/lib/chartColors.ts` |
| STATUS_PALETTE | CHART_COLORS.resolved, CHART_COLORS.pending, CHART_COLORS.waiting, CHART_COLORS.open, | `src/lib/chartColors.ts` |
| SENTIMENT_PALETTE | CHART_COLORS.positive, CHART_COLORS.neutral, CHART_COLORS.negative, | `src/lib/chartColors.ts` |
| ContactHealthFieldKey | name \| phone \| email \| company \| job_title \| contact_type \| address \| assigned_to | `src/lib/contactHealth.ts` |
| ContactHealthLevel | completo \| bom \| incompleto \| critico \| indefinido | `src/lib/contactHealth.ts` |
| CRMIntegrationAction | rpc \| select \| mutate \| contactLookup \| contactLookupBatch \| emailContactContext \| linkEmailContactCompany \| enqueueSync \| health \| companyNames \| roleNames | `src/lib/crmIntegration.ts` |
| AcaoNaAtualizacao | recarregar-agora \| avisar-e-recarregar-ao-esconder | `src/lib/deployment-update.ts` |
| EmailErrorKind | offline \| permission \| authentication \| rate-limit \| server \| unknown | `src/lib/emailErrorState.ts` |
| EmailThreadStateFilter | all \| unread \| starred | `src/lib/emailThreadQuery.ts` |
| EmailThreadPeriodFilter | all \| today \| 7d \| 30d | `src/lib/emailThreadQuery.ts` |
| SenderKind | self \| agent \| contact \| team | `src/lib/fileSenderIdentity.ts` |
| GoalPeriodKey | today \| week \| month | `src/lib/localDay.ts` |
| GeoFailureKind | aborted \| timeout \| rate_limited \| http \| network \| not_found | `src/lib/mapboxGeocode.ts` |
| MapboxFailureKind | timeout \| unauthorized \| rate_limited \| server_error \| network \| invalid_token \| forbidden \| unknown | `src/lib/mapboxToken.ts` |
| NavegadorDetectado | Edge \| Opera \| Firefox \| Samsung Internet \| Chrome \| Safari \| Unknown | `src/lib/parseUserAgent.ts` |
| SistemaDetectado | Windows \| macOS \| iPadOS \| iOS \| Android \| Linux \| Unknown | `src/lib/parseUserAgent.ts` |
| SENTIMENT_CLASSES | 'positivo', 'neutro', 'negativo' | `src/lib/sentiment-classes.ts` |
| SENTIMENT_LEVELS | 'positive', 'neutral', 'negative', 'critical' | `src/lib/sentiment-level.ts` |
| ServerLoginMode | login \| verify | `src/lib/serverLogin.ts` |
| SlaTimelineStatus | ok \| warning \| breached \| na | `src/lib/slaTimeline.ts` |
| SlaMilestoneKind | opened \| first_response \| resolution \| transfer \| closed_no_response | `src/lib/slaTimeline.ts` |
| SlaTimelinePeriod | 24h \| 7d \| 30d \| all | `src/lib/slaTimeline.ts` |
| SLA_TRANSFER_EVENT_TYPES | 'transfer', 'queue_transfer', 'overload_reassign', 'absence_reassign', | `src/lib/slaTimeline.ts` |
| SLA_ASSIGN_EVENT_TYPES | 'assign' | `src/lib/slaTimeline.ts` |
| PRIVATE_MEDIA_BUCKETS | 'audio-messages', 'team-chat-files', 'whatsapp-media', | `src/lib/storage_object_reference.ts` |
| PriorityLevel | critical \| high \| medium \| normal | `src/lib/supervisorPriority.ts` |
| PRIORITY_RULES_TEXT | 'P1 Crítica → sem atendente há 30 min ou mais, ou risco ≥ 80, ou marcação de urgência da IA.', 'P2 Alta → aguardando há 15 min ou mais, ou risco ≥ 60.', 'P3 Média → aguardando há 5 min ou mais, ou risco ≥ 40.', 'P4 Normal → demais conversas em atendimento.', | `src/lib/supervisorPriority.ts` |
| TeamChatFileSizeError | empty \| too-large | `src/lib/teamChatRules.ts` |
| AI_JOB_STATUSES | 'queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown', | `src/lib/aiJobs/status.ts` |
| AI_JOB_TERMINAL_STATUSES | 'succeeded', 'failed', 'cancelled', 'outcome_unknown', | `src/lib/aiJobs/status.ts` |
| ExecutorDaAcao | whatsapp \| sip | `src/lib/calls/acaoDoAlerta.ts` |
| CallChannel | voip \| whatsapp | `src/lib/calls/callStatus.ts` |
| CallDirection | inbound \| outbound | `src/lib/calls/callStatus.ts` |
| PersistedStatus | ringing \| answered \| ended \| missed \| busy \| failed \| cancelled \| declined | `src/lib/calls/callStatus.ts` |
| CallResult | completed \| missed \| no_answer \| busy \| failed \| cancelled \| declined \| in_progress \| ringing | `src/lib/calls/callStatus.ts` |
| EndReason | completed \| busy \| no_answer \| cancelled \| declined \| failed \| cancelled_remote \| timeout \| busy_here \| hangup_local \| hangup_remote | `src/lib/calls/callStatus.ts` |
| EndedBy | hangup_local \| hangup_remote \| reject \| cancel_remote \| timeout \| failure | `src/lib/calls/callStatus.ts` |
| ResultTone | success \| destructive \| warning \| muted \| primary | `src/lib/calls/callStatus.ts` |
| … +113 linhas — lista completa em `context.json` | | |

## F. Validações de entrada

### F.1 Schemas Zod

- **loginSchema** (`src/hooks/auth/useAuthForm.ts`, z.object):
  ```ts
  { email: z.string().email('Email inválido'), password: z.string().min(1, 'Senha é obrigatória'), }
  ```
- **slaRowSchema** (`src/hooks/sla/useSLANotifications.ts`, z.object):
  ```ts
  { id: z.string().uuid(), contact_id: z.string().uuid().nullable(), first_message_at: z.string(), first_response_at: z.string().nullable(), first_response_breached: z.boolean().nullable(), sla_configuration_id: z.string().uuid().nullable().optional(), }
  ```
- **slaRuleScopeSchema** (`src/hooks/sla/useSLANotifications.ts`, z.object):
  ```ts
  { contact_id: z.string().uuid().nullable().optional(), company: z.string().nullable().optional(), job_title: z.string().nullable().optional(), contact_type: z.string().nullable().optional(), queue_id: z.string().uuid().nullable().optional(), agent_id: z.string().uuid().nullable().optional(), metadata: z .object({ notify_on_warning: z.boolean().nullish(), escalation_notes: z.string().nullish(), }) .nullish(), }
  ```
- **contatoSchema** (`src/lib/zappSchemas.ts`, z.object):
  ```ts
  { nome: z.string().min(1), telefone: z.string().min(10), email: z.string().email().optional(), tags: z.array(z.string()).optional(), grupo_id: z.string().uuid().optional(), ativo: z.coerce.boolean().default(true), ultimo_contato: z.string().optional(), }
  ```
- **campanhaSchema** (`src/lib/zappSchemas.ts`, z.object):
  ```ts
  { nome: z.string().min(1), descricao: z.string().optional(), mensagem: z.string().min(1), data_envio: z.string().optional(), status: z.enum(['rascunho', 'agendada', 'enviando', 'concluida', 'cancelada']).default('rascunho'), total_contatos: z.coerce.number().int().min(0).default(0), enviados: z.coerce.number().int().min(0).default(0), erros: z.coerce.number().int().min(0).default(0), }
  ```
- **emailSchema** (`src/pages/ForgotPassword.tsx`, z.string):
  ```ts
  
  ```
- **passwordSchema** (`src/pages/ResetPassword.tsx`, z.string):
  ```ts
  
  ```
- **departmentSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.enum):
  ```ts
  DEPARTMENT_VALUES
  ```
- **conversationStatusSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.enum):
  ```ts
  CONVERSATION_STATUS_VALUES
  ```
- **churnRiskSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.enum):
  ```ts
  CHURN_RISK_VALUES
  ```
- **sentimentSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.enum):
  ```ts
  asEnumValues(SENTIMENT_VALUES)
  ```
- **urgencySchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.enum):
  ```ts
  asEnumValues(URGENCY_VALUES)
  ```
- **AgentPerformanceSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { empathy: z.number().min(1).max(10), clarity: z.number().min(1).max(10), efficiency: z.number().min(1).max(10), knowledge: z.number().min(1).max(10), }
  ```
- **ConversationAnalysisOutput** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { department: departmentSchema, relationshipType: z.string(), summary: z.string().min(1), status: conversationStatusSchema, keyPoints: z.array(z.string()).max(5), nextSteps: z.array(z.string()), sentiment: sentimentSchema, sentimentScore: z.number().min(0).max(100).optional(), customerSatisfaction: z.number().min(1).max(5).optional(), topics: z.array(z.string()).max(5), urgency: urgencySchema, agentPerformance: AgentPerformanceSchema.optional(), churnRisk: churnRiskSchema.optional(), salesOpportunity: z.string().nullable().optional(), }
  ```
- **SuggestedReplyItemSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { type: z.string(), text: z.string().min(1), emoji: z.string().optional(), // `source` é pedido pelo prompt (título do artigo da KB) e exibido pela // interface. Sem a chave aqui, o parse o descartaria em silêncio e a fonte // sumiria da tela — sem erro nenhum. source: z.string().nullable().optional(), }
  ```
- **SuggestedRepliesOutput** (`supabase/functions/_shared/ai-response-contracts.ts`, z.array):
  ```ts
  SuggestedReplyItemSchema
  ```
- **SuggestedRepliesEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { suggestions: SuggestedRepliesOutput, }
  ```
- **AutoTagItemSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { name: z.string().min(1), // Confiança OPCIONAL: ausente é ausente. O consumidor grava `null` (a coluna // aceita null) em vez de inventar 0 — o código antigo coagia // `Number(t.confidence) || 0`. Quando vem, é número em 0-1 (não percentual). confidence: z.number().min(0).max(1).optional(), }
  ```
- **AutoTagOutput** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { tags: z.array(AutoTagItemSchema), }
  ```
- **ChatbotL1Output** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { handled: z.boolean(), response: z.string().min(1), transfer_to_human: z.boolean(), transfer_reason: z.string().nullable().optional(), confidence: z.number().min(0).max(1).optional(), matched_article: z.string().nullable().optional(), detected_intent: z.string().nullable().optional(), detected_sentiment: sentimentSchema.optional(), }
  ```
- **UUIDSchema** (`supabase/functions/_shared/schemas.ts`, z.string):
  ```ts
  
  ```
- **EmailSchema** (`supabase/functions/_shared/schemas.ts`, z.string):
  ```ts
  
  ```
- **MessageSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { id: z.string().max(100).optional(), sender: z.string().max(50).optional(), content: z.string().max(5000).optional(), created_at: z.string().max(40).optional(), /** O front envia `type`; `message_type` é aceito como legado. */ type: z.string().max(50).optional(), message_type: z.string().max(50).optional(), mediaUrl: z.string().max(2048).optional(), }
  ```
- **AiSuggestReplySchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50).optional(), contactName: z.string().max(200).optional().default('Cliente'), contactId: z.string().uuid().optional().nullable(), context: z.string().max(500).optional(), requestId: z.string().uuid("requestId must be a valid UUID").optional(), }
  ```
- **AiEnhanceMessageSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { message: z.string().min(1, "Mensagem é obrigatória").max(4096), tone: z.enum(['professional', 'casual', 'persuasive', 'empathetic', 'concise', 'detailed']).optional().default('professional'), contactName: z.string().max(200).optional(), requestId: z.string().uuid("requestId must be a valid UUID").optional(), }
  ```
- **AiAutoTagSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(100).optional(), }
  ```
- **AiChurnAnalysisSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { contactIds: z.array(z.string().uuid()).min(1, "contactIds é obrigatório").max(50), }
  ```
- **AiClassifyTicketsSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { limit: z.number().int().min(1).max(200).optional().default(50), }
  ```
- **ElevenLabsTTSSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { text: z.string().min(1, "Text is required").max(5000), voiceId: z.string().max(100).refine(isAllowedElevenLabsVoiceId, { message: ELEVENLABS_VOICE_NOT_ALLOWED }).optional(), modelId: z.string().max(100).refine(isAllowedElevenLabsTtsModel, { message: ELEVENLABS_MODEL_NOT_ALLOWED }).optional(), languageCode: z.string().max(10).optional(), applyTextNormalization: z.string().max(20).optional(), }
  ```
- **ElevenLabsSFXSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { prompt: z.string().min(1, "Prompt is required").max(2000), duration: z.number().min(1).max(300).optional(), mode: z.enum(['sfx', 'music']).optional().default('sfx'), }
  ```
- **ElevenLabsDialogueSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { script: z.array(z.object({ voice_id: z.string().min(1, "voice_id is required").max(100).refine(isAllowedElevenLabsVoiceId, { message: ELEVENLABS_VOICE_NOT_ALLOWED }), text: z.string().min(1, "text is required").max(5000), })).min(1, "Script is required"), languageCode: z.string().max(10).optional().default('pt'), }
  ```
  - Regras cruzadas (refine): “text is required”
- **ElevenLabsVoiceDesignPreviewSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { action: z.literal('preview').optional(), description: z.string().min(1, "Voice description is required").max(1000), text: z.string().max(2000).optional(), }
  ```
- **ElevenLabsVoiceDesignCreateSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { action: z.literal('create'), voice_name: z.string().min(1, "Voice name is required").max(255), voice_description: z.string().max(1000).optional(), generated_voice_id: z.string().min(1, "Generated voice ID is required").max(255), labels: z.record(z.string()).optional(), }
  ```
- **TranscribeAudioSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { audioUrl: z.string().url("Invalid audio URL").max(2048), messageId: z.string().max(100).optional(), languageCode: z.enum(ALLOWED_LANGUAGES).optional().default('por'), enableDiarization: z.boolean().optional().default(false), tagAudioEvents: z.boolean().optional().default(true), }
  ```
- **ClassifyAudioMemeSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { audio_url: z.string().url().max(2048).optional().nullable(), file_name: z.string().max(500).optional().nullable(), }
  ```
- **ClassifyEmojiSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { image_url: z.string().url().max(2048).optional().nullable(), file_name: z.string().max(500).optional().nullable(), }
  ```
- **ClassifyStickerSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { image_url: z.string().url().max(2048).optional().nullable(), }
  ```
- **SendEmailSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]), subject: z.string().min(1, "Subject is required").max(500), html: z.string().max(100000).optional(), text: z.string().max(100000).optional(), from: z.string().max(255).optional(), reply_to: z.string().email().optional(), cc: z.array(z.string().email()).max(20).optional(), bcc: z.array(z.string().email()).max(20).optional(), attachments: z.array(z.object({ filename: z.string().max(255), content: z.string(), // base64 content_type: z.string().max(100).optional(), })).max(10).optional(), }
  ```
- **SentimentAlertSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { contactId: z.string().uuid(), contactName: z.string().max(200), sentimentScore: z.number().min(0).max(100), previousScore: z.number().min(0).max(100).optional(), analysisId: z.string().uuid(), agentEmail: z.string().email().optional(), threshold: z.number().min(0).max(100).optional().default(30), consecutiveRequired: z.number().int().min(1).max(10).optional().default(2), }
  ```
- **RateLimitAlertSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { ip_address: z.string().max(45), endpoint: z.string().max(500), request_count: z.number().int().min(1), blocked: z.boolean(), }
  ```
- **ApprovePasswordResetSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { requestId: z.string().uuid("requestId must be a valid UUID"), action: z.enum(["approve", "reject"]), rejectionReason: z.string().max(500).optional(), }
  ```
- **ChatbotL1Schema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { contactId: z.string().uuid("contactId must be a valid UUID"), message: z.string().min(1, "Message is required").max(5000), connectionId: z.string().uuid().optional().nullable(), }
  ```
- **DetectNewDeviceSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { device_fingerprint: z.string().min(1).max(500), browser: z.string().max(200), os: z.string().max(200), device_name: z.string().max(200), }
  ```
- **ScheduledReportSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { reportId: z.string().uuid("reportId must be a valid UUID"), }
  ```
- **GmailHeaderValueSchema** (`supabase/functions/_shared/schemas.ts`, z.string, encadeia refine):
  ```ts
  
  ```
  - Regras cruzadas (refine): “Quebra de linha nao permitida em cabecalho”
- **GmailSendActionSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { action: z.enum(['send', 'reply', 'create-draft', 'update-draft', 'delete-draft', 'modify-labels', 'modify-thread-labels', 'mark-read', 'trash', 'trash-thread']), account_id: z.string().uuid("account_id must be a valid UUID"), to: z.union([GmailHeaderValueSchema, z.array(GmailHeaderValueSchema).max(100)]).optional(), cc: z.array(GmailHeaderValueSchema).max(100).optional(), bcc: z.array(GmailHeaderValueSchema).max(100).optional(), subject: GmailHeaderValueSchema.optional(), text_body: z.string().max(100000).optional(), html_body: z.string().max(500000).optional(), // IDs do Gmail sao interpolados direto na URL (/messages/{id}/modify, // /threads/{id}/trash, etc.) em varios cases do handler — regex fecha // injecao de path (/, ?, #, espaco) na validacao, uma vez, pra todos eles. thread_id: …
  ```
- **GmailOAuthActionSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { action: z.enum(['get-auth-url', 'exchange-code', 'refresh-token', 'disconnect', 'list-accounts']), code: z.string().max(2000).optional(), account_id: z.string().uuid().optional(), state: z.string().max(500).optional(), }
  ```
- **WebAuthnActionSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { action: z.enum(['registration-options', 'verify-registration', 'authentication-options', 'verify-authentication']), userId: z.string().uuid().optional(), userEmail: z.string().email().optional(), userName: z.string().max(200).optional(), credential: z.record(z.unknown()).optional(), friendlyName: z.string().max(200).optional(), }
  ```
- **ExternalDbBridgeSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { // Z019: insert/update/delete removidos — allowlist só permite select/rpc. action: z.enum(['select', 'rpc']), table: z.string().max(100).optional(), rpc: z.string().max(100).optional(), params: z.record(z.unknown()).optional(), limit: z.number().int().min(1).max(1000).optional(), offset: z.number().int().min(0).optional(), countMode: z.string().max(20).optional(), }
  ```
- **EvolutionWebhookEnvelopeV1Schema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { event: z.string().min(1, 'event is required').max(200), instance: z.string().min(1, 'instance is required').max(200), data: z.unknown().optional(), }
  ```
- **AiProxySchema** (`supabase/functions/ai-proxy/index.ts`, z.object):
  ```ts
  { messages: z.array(z.object({ role: z.string().max(50), // IA-036: partes não-textuais (vision) precisam CHEGAR aqui para serem recusadas // com código (`UNSUPPORTED_MODALITY`) em vez de virarem 400 genérico de schema. content: z.union([z.string().max(50000), z.array(z.any())]), })).min(1).max(100), // SL-014/B5 — o cliente não escolhe destino nem modelo: o campo `model` saiu do schema // (o modelo é o do cadastro do provedor) e `provider_id` só é destino no diagnóstico de // provedor (`test:true`, restrito a admin/supervisor). Fora dele a requisição é recusada // com 400 — nunca atendida por outro provedor em silêncio. use_for: z.enum(['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']).default('copilot'), provider_id: z.string().uuid().optional(), tools: z.any().optional(), tool …
  ```
- **BitrixBodySchema** (`supabase/functions/bitrix-api/index.ts`, z.object):
  ```ts
  { action: z.enum([ 'list', 'get', 'create', 'update', 'delete', 'register_call', 'finish_call', 'attach_record', 'sync_contacts', 'push_contact', 'create_lead_from_conversation', ]), entityType: z.enum(['lead', 'contact', 'deal', 'activity', 'call']).optional(), entityId: z.string().max(100).optional(), data: z.record(z.unknown()).optional(), filters: z.record(z.unknown()).optional(), }
  ```
- **bodySchema** (`supabase/functions/create-user/index.ts`, z.object):
  ```ts
  { email: z.string().email("Email inválido").max(255), // R2-AUTH-016c: a política de senha do app (ResetPassword.tsx / // useAuthForm.ts) é min 8 + maiúscula + minúscula + número + especial. // Antes o servidor só exigia 8 caracteres, então a tela aprovava e a Edge // criava conta com senha fora da política. Mesmas mensagens pt-BR do app, // na mesma ordem das regras. password: z .string() .min(8, "Mínimo 8 caracteres") .max(128) .regex(/[A-Z]/, "Deve conter letra maiúscula") .regex(/[a-z]/, "Deve conter letra minúscula") .regex(/[0-9]/, "Deve conter número") .regex(/[^A-Za-z0-9]/, "Deve conter caractere especial"), name: z.string().min(1, "Nome é obrigatório").max(255), nickname: z.string().max(100).optional(), signature: z.string().max(500).optional(), job_title: z.string().max(255).opti …
  ```
- **GmailLabelColorSchema** (`supabase/functions/gmail-sync/index.ts`, z.object):
  ```ts
  { backgroundColor: z.string().regex(GMAIL_LABEL_HEX_RE, "color.backgroundColor deve ser hex #RRGGBB"), textColor: z.string().regex(GMAIL_LABEL_HEX_RE, "color.textColor deve ser hex #RRGGBB"), }
  ```
- **GmailSyncActionSchema** (`supabase/functions/gmail-sync/index.ts`, z.object, encadeia superRefine):
  ```ts
  { message_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(), attachment_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(), action: z.enum(['sync-labels', 'sync-inbox', 'sync-incremental', 'get-thread', 'setup-watch', 'get-attachment', 'create-label', 'update-label', 'delete-label']), account_id: z.string().uuid("account_id must be a valid UUID"), query: z.string().max(500).optional(), maxResults: z.number().int().min(1).max(200).optional(), thread_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(), topic_name: z.string().max(500).optional(), // Gerenciamento de marcadores do Gmail (create/update/delete-label). label_id: z.string().max(200).regex(GMAIL_RESOURCE_ID_RE).optional(), name: z.string().max(GMAIL_LABEL_NAME_MAX).optional(), color: GmailLabelCo …
  ```
  - Regras cruzadas (refine): “name é obrigatório para criar um marcador”
- **PubSubSchema** (`supabase/functions/gmail-webhook/index.ts`, z.object):
  ```ts
  { message: z.object({ data: z.string().min(1), messageId: z.string().optional(), publishTime: z.string().optional(), }), subscription: z.string().optional(), }
  ```
- **bodySchema** (`supabase/functions/invite-user/index.ts`, z.object):
  ```ts
  { email: z.string().email("Email inválido").max(255), role: z.enum(INVITABLE_ROLES).optional().default("agent"), }
  ```
- **AudienceRole** (`supabase/functions/multiplix-audience/index.ts`, z.enum):
  ```ts
  ['cliente', 'fornecedor', 'transportadora']
  ```
- **FiltersSchema** (`supabase/functions/multiplix-audience/index.ts`, z.object):
  ```ts
  { roles: z.array(AudienceRole).max(3).optional(), ramo: z.string().max(200).optional(), uf: z.string().length(2).optional(), search: z.string().max(200).optional(), }
  ```
- **ResolveParamsSchema** (`supabase/functions/multiplix-audience/index.ts`, z.object, encadeia refine):
  ```ts
  { company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), }
  ```
  - Regras cruzadas (refine): “Informe ao menos um company_id ou contact_id”
- **CreateDraftParamsSchema** (`supabase/functions/multiplix-audience/index.ts`, z.object, encadeia refine):
  ```ts
  { name: z.string().trim().min(1).max(200), message_template: z.string().min(1).max(65_536), company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), client_request_id: z.string().uuid(), whatsapp_connection_id: z.string().uuid().nullish(), scheduled_at: z.string().datetime({ offset: true }).nullish(), confirm_over_limit: z.boolean().optional().default(false), }
  ```
  - Regras cruzadas (refine): “Informe ao menos um company_id ou contact_id”
- **RequestSchema** (`supabase/functions/multiplix-audience/index.ts`, z.object):
  ```ts
  { action: z.enum(['list_ramos', 'list_ufs', 'search', 'count', 'resolve', 'create_draft']), params: z.record(z.unknown()).optional().default({}), }
  ```
- **DraftCreateSchema** (`supabase/functions/multiplix-dispatch/index.ts`, z.object, encadeia refine):
  ```ts
  { name: z.string().trim().min(1).max(200), message_template: z.string().min(1).max(65_536), company_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), contact_ids: z.array(z.string().uuid()).max(RESOLVE_REQUEST_MAX_IDS).default([]), client_request_id: z.string().uuid(), whatsapp_connection_id: z.string().uuid().nullish(), scheduled_at: z.string().datetime({ offset: true }).nullish(), confirm_over_limit: z.boolean().optional().default(false), }
  ```
  - Regras cruzadas (refine): “Informe ao menos um company_id ou contact_id”
- **DraftGetSchema** (`supabase/functions/multiplix-dispatch/index.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid() }
  ```
- **DraftUpdateSchema** (`supabase/functions/multiplix-dispatch/index.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), name: z.string().min(1).max(200).optional(), whatsapp_connection_id: z.string().uuid().nullish(), scheduled_at: z.string().datetime().nullish(), }
  ```
- **DraftDiscardSchema** (`supabase/functions/multiplix-dispatch/index.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid() }
  ```
- **envelope** (`supabase/functions/multiplix-dispatch/index.ts`, z.object):
  ```ts
  { action: z.string().min(1).max(64), payload: z.record(z.unknown()).default({}) }
  ```
- **UUID** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.string):
  ```ts
  
  ```
- **UuidArray** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.array):
  ```ts
  UUID
  ```
- **IdSetSchema** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.object):
  ```ts
  { company_ids: UuidArray.optional().default([]), contact_ids: UuidArray.optional().default([]), }
  ```
- **AudienceFiltersSchema** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.object):
  ```ts
  { roles: z.array(z.enum(['cliente', 'fornecedor', 'transportadora'])).max(3).optional(), ramo: z.string().max(200).optional(), uf: z.string().length(2).optional(), search: z.string().max(200).optional(), }
  ```
- **AudienceSelectSchema** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.object):
  ```ts
  { manual: IdSetSchema.optional(), publics: z.array(PublicSchema).max(50).optional().default([]), filters: AudienceFiltersSchema.optional(), exclude: IdSetSchema.optional(), primary_per_company: z.boolean().optional().default(false), select_all: z.boolean().optional().default(false), }
  ```
- **AudienceSaveSchema** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.object, encadeia superRefine):
  ```ts
  { name: z.string().trim().min(1).max(200), kind: z.enum(['rule', 'static_list']), definition: AudienceFiltersSchema.optional(), members: IdSetSchema.optional(), }
  ```
  - Regras cruzadas (refine): “kind=rule exige definition com ao menos um filtro”
- **AudienceApplySchema** (`supabase/functions/multiplix-dispatch/actions/audience.ts`, z.object):
  ```ts
  { audience_id: UUID, manual: IdSetSchema.optional(), filters: AudienceFiltersSchema.optional(), exclude: IdSetSchema.optional(), primary_per_company: z.boolean().optional().default(false), select_all: z.boolean().optional().default(false), }
  ```
- **BlockTypeSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.enum):
  ```ts
  ['text', 'voice_ai', 'audio_recorded', 'file']
  ```
- **PersonalizationModeSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.enum):
  ```ts
  ['same_audio', 'personalized']
  ```
- **VoiceSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { script: z.string().max(20_000).nullish(), voice_id: z.string().max(200).nullish(), }
  ```
- **MediaSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { url: z.string().max(4_000).nullish(), caption: z.string().max(4_000).nullish(), }
  ```
- **AssetSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { asset_id: z.string().uuid().nullish() }
  ```
- **ContentSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { text: z.string().max(20_000).nullish(), voice: VoiceSchema.nullish(), media: MediaSchema.nullish(), asset: AssetSchema.nullish(), }
  ```
- **BlocksUpsertSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), block_id: z.string().uuid().optional(), block_type: BlockTypeSchema.optional(), content: ContentSchema.optional(), personalization_mode: PersonalizationModeSchema.nullish(), asset_id: z.string().uuid().nullish(), }
  ```
- **BlocksDeleteSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), block_id: z.string().uuid(), }
  ```
- **BlocksReorderSchema** (`supabase/functions/multiplix-dispatch/actions/blocks.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), block_ids: z.array(z.string().uuid()).min(1), }
  ```
- **UuidSchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.string):
  ```ts
  
  ```
- **PreviewSchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.object):
  ```ts
  { dispatch_id: UuidSchema, recipient_id: UuidSchema, }
  ```
- **ValidateSchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.object):
  ```ts
  { dispatch_id: UuidSchema, /** Destinatario de amostra; sem ele, o primeiro do disparo. */ recipient_id: UuidSchema.optional(), }
  ```
- **AudienceSchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.object, encadeia optional):
  ```ts
  { roles: z.array(z.enum(['cliente', 'fornecedor', 'transportadora'])).max(3).optional(), uf: z.string().length(2).optional(), ramo: z.string().max(200).optional(), search: z.string().max(200).optional(), /** Nome da lista de exclusao (a "lista X" que a frase cita). */ exclude_list: z.string().max(200).optional(), }
  ```
- **SummarySchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.object):
  ```ts
  { dispatch_id: UuidSchema, audience: AudienceSchema, }
  ```
- **EstimateSchema** (`supabase/functions/multiplix-dispatch/actions/inspect.ts`, z.object):
  ```ts
  { dispatch_id: UuidSchema, audience: AudienceSchema, }
  ```
- **ConfirmSchema** (`supabase/functions/multiplix-dispatch/actions/lifecycle.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), dispatch_version: z.coerce.number().int().positive(), // `datetime()` do zod nao aceita offset; aceitamos o que o front manda (ISO // com `Z` ou com offset) e deixamos o Postgres normalizar. scheduled_at: z .string() .refine((value) => !Number.isNaN(Date.parse(value)), 'scheduled_at invalido') .nullish(), client_request_id: z.string().uuid().nullish(), }
  ```
  - Regras cruzadas (refine): “scheduled_at invalido”
- **StatusSchema** (`supabase/functions/multiplix-dispatch/actions/lifecycle.ts`, z.object):
  ```ts
  { dispatch_id: z.string().uuid(), include_recipients: z.boolean().optional(), include_blocks: z.boolean().optional(), }
  ```
- **Uuid** (`supabase/functions/multiplix-dispatch/actions/listing.ts`, z.string):
  ```ts
  
  ```
- **DispatchListSchema** (`supabase/functions/multiplix-dispatch/actions/listing.ts`, z.object):
  ```ts
  { limit: z.coerce.number().int().min(1).max(200).optional().default(50), offset: z.coerce.number().int().min(0).optional().default(0), // `dispatch_id` e OPCIONAL e nao cria uma acao nova: permite pedir UM disparo // especifico pela MESMA rota de listagem, para o front resolver o caso de um // disparo que nao esta entre os `limit` mais recentes (ele faz `find(id)` sobre // `data`). O filtro entra no MESMO WHERE do recorte de dono (ver handler), nunca // como um filtro pos-leitura sobre uma pagina ja recortada. dispatch_id: Uuid.optional(), }
  ```
- **RecipientsListSchema** (`supabase/functions/multiplix-dispatch/actions/listing.ts`, z.object):
  ```ts
  { dispatch_id: Uuid, // `status` e um filtro livre sobre o enum `multiplix_recipient_status` // (pending|sending|sent|delivered|read|failed|skipped|cancelled|outcome_unknown); // fica como string limitada para nao travar a resposta se o enum ganhar valor. status: z.string().min(1).max(40).optional(), limit: z.coerce.number().int().min(1).max(1000).optional().default(500), offset: z.coerce.number().int().min(0).optional().default(0), }
  ```
- **requestSchema** (`supabase/functions/multiplix-voices/index.ts`, z.object):
  ```ts
  { action: z.enum(['voices.list', 'assets.sign']), params: z.record(z.unknown()).optional(), }
  ```
- **signParamsSchema** (`supabase/functions/multiplix-voices/index.ts`, z.object):
  ```ts
  { asset_id: z.string().uuid() }
  ```
- **ColorOrMaterialValue** (`supabase/functions/promogifts-catalog/index.ts`, z.union):
  ```ts
  [z.string().max(60), z.array(z.string().max(60)).min(1).max(20)]
  ```
- **ListProductsSchema** (`supabase/functions/promogifts-catalog/index.ts`, z.object, encadeia default):
  ```ts
  { search: z.string().max(200).optional(), category_id: z.string().uuid().optional(), supplier_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0), order_by: z.enum(ALLOWED_ORDER_FIELDS).default("name"), ascending: z.boolean().default(true), only_active: z.boolean().default(true), only_in_stock: z.boolean().default(false), // CT-73 — `true` por padrão: a grade chama `list_products` SEM `compact`, e // era exatamente esse caminho padrão que a medição de 02/10/2026 pegou com // 81,5 KB por página de 24. O payload enxuto tem de valer por PADRÃO, não só // quando o chamador lembrar de pedir. Quem precisa do payload completo pede // `compact: false` (o detalhe não passa por aqui: usa `get_product`). compact: z.boolean( …
  ```
- **GetProductSchema** (`supabase/functions/promogifts-catalog/index.ts`, z.object):
  ```ts
  { product_id: z.string().uuid("product_id must be a valid UUID"), }
  ```
- **ActionSchema** (`supabase/functions/promogifts-catalog/index.ts`, z.object):
  ```ts
  { action: z.enum(["list_products", "get_product", "list_categories", "list_suppliers", "catalog_stats", "bootstrap"]), params: z.record(z.unknown()).optional().default({}), }
  ```
- **RevokeAuthSessionsSchema** (`supabase/functions/revoke-auth-sessions/index.ts`, z.object):
  ```ts
  { scope: z.enum(["global", "local", "others"]), target_user_id: z.string().uuid().optional(), target_session_id: z.string().uuid().optional(), }
  ```
- **InviteAgentSchema** (`supabase/functions/send-email/index.ts`, z.object):
  ```ts
  { email: z.string().email("Invalid email").max(255), name: z.string().max(200).optional(), role: z.enum(["agent", "supervisor", "admin"]).optional().default("agent"), }
  ```
- **TranscriptSchema** (`supabase/functions/voice-agent/index.ts`, z.object):
  ```ts
  { transcript: z.string().min(1).max(2000).transform(s => s.trim()), }
  ```
- **WhatsAppStatusSchema** (`supabase/functions/whatsapp-webhook/index.ts`, z.object):
  ```ts
  { id: z.string().max(500), status: z.enum(['sent', 'delivered', 'read', 'failed']), timestamp: z.string(), recipient_id: z.string().optional(), errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(), }
  ```
- **WhatsAppWebhookSchema** (`supabase/functions/whatsapp-webhook/index.ts`, z.object):
  ```ts
  { object: z.string(), entry: z.array(z.object({ id: z.string(), changes: z.array(z.object({ value: z.object({ messaging_product: z.string().optional(), metadata: z.object({ display_phone_number: z.string(), phone_number_id: z.string(), }).optional(), statuses: z.array(WhatsAppStatusSchema).optional(), // `profile.name` NÃO é obrigatório no payload da Meta: sem ele o // schema derrubava o lote inteiro para "Invalid payload format" // (200 + warning) e a mensagem nunca era persistida. Sem nome, o // push_name vira null e o RPC cai no telefone. contacts: z.array(z.object({ profile: z.object({ name: z.string().optional() }).optional(), })).optional(), messages: z.array(z.object({ id: z.string(), from: z.string(), timestamp: z.string(), type: z.string(), text: z.object({ body: z.string() }).opt …
  ```

### F.2 react-hook-form (register/rules)

| Campo | Regras | Arquivo |
|---|---|---|
| `priority` | `setValueAs: (v: string) => Number.parseInt(v, 10) \|\| 0` | `src/components/settings/sla/SLARuleFormDialog.tsx` |

### F.3 Restrições em inputs HTML (required/min/max/pattern)

| Campo | Restrições | Arquivo |
|---|---|---|
| `audit_de` | type=date | `src/components/admin/AdminView.tsx` |
| `audit_ate` | type=date | `src/components/admin/AdminView.tsx` |
| `edit_avatar` | accept=image/* | `src/components/admin/AdminView.tsx` |
| `edit_maxchats` | type=number, min=LIMITE_CHATS_MIN, max=LIMITE_CHATS_MAX | `src/components/admin/AdminView.tsx` |
| `add_email` | type=email | `src/components/admin/AdminView.tsx` |
| `add_senha` | type=password | `src/components/admin/AdminView.tsx` |
| `edit_ramal` | max | `src/components/admin/VoipRamalField.tsx` |
| `edit_sip_senha` | type=password, max | `src/components/admin/VoipRamalField.tsx` |
| `invite-agent-email` | type=email | `src/components/agents/InviteAgentDialog.tsx` |
| `reauth-codigo` | max | `src/components/auth/ReauthDialog.tsx` |
| `email` | type=email | `src/components/contacts/ContactForm.tsx` |
| `capital_social` | type=number | `src/components/crm360/CompanyFormDialog.tsx` |
| `data_fundacao` | type=date | `src/components/crm360/CompanyFormDialog.tsx` |
| `data_nascimento` | type=date | `src/components/crm360/ContactFormDialog.tsx` |
| `relationship_score` | type=number, min=0, max=100 | `src/components/crm360/ContactFormDialog.tsx` |
| `poll-selectable` | type=number, min=1, max=maxSelectable | `src/components/inbox/AdvancedMessageMenu.tsx` |
| `inbox-preset-name` | max | `src/components/inbox/InboxSavedFiltersMenu.tsx` |
| `date` | type=date | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `purge-gmail-confirm-email` | disabled=purge.isPending | `src/components/integrations/GmailIntegrationCard.tsx` |
| `code` | max | `src/components/mfa/MFAEnroll.tsx` |
| `mfa-code` | max | `src/components/mfa/MFAVerify.tsx` |
| `inbox-silence-minutes` | min, type=number, min=INBOX_SILENCE_MIN_MINUTES, max=INBOX_SILENCE_MAX_MINUTES, step=1 | `src/components/monitoring/MonitoringInboxSilence.tsx` |
| `edit-queue-max-wait` | max, type=number, min=1, max | `src/components/queues/EditQueueDialog.tsx` |
| `duration` | type=number | `src/components/security/BlockedIPDialogs.tsx` |
| `inactivity-hours` | type=number, min=1, max=168 | `src/components/settings/AutoCloseSettings.tsx` |
| `custom-sound-upload` | accept=audio/mp3,audio/wav,audio/ogg,audio/mpeg | `src/components/settings/SoundCustomizationPanel.tsx` |
| `sla-name` | max | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `sla-fr` | type=number, min=1, max=5, disabled | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `sla-priority` | type=number, min=0, max=100 | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `sla-notes` | min, max | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `talkx-schedule-date` | type=date, min=minimumDate | `src/components/talkx/TalkXCampaignScheduled.tsx` |
| `talkx-repeat-end` | type=date, min=localDate \|\| minimumDate | `src/components/talkx/TalkXCampaignScheduled.tsx` |
| `new-ta` | type=date | `src/components/tasks/shared/new-task/PrazoField.tsx` |
| `nt-lembrete-data` | type=date | `src/components/tasks/shared/new-task/RemindField.tsx` |
| `id` | max | `src/components/tasks/shared/new-task/TaskTitleField.tsx` |
| `evo-key` | type=password | `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx` |
| `official-token` | type=password | `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx` |
| `login-email` | type=email, max | `src/pages/Auth.tsx` |
| `email` | type=email | `src/pages/ForgotPassword.tsx` |
| `reason` | min | `src/pages/ForgotPassword.tsx` |
| `confirmPassword` | type=password | `src/pages/ResetPassword.tsx` |

## G. Fórmulas e derivações (como valores são calculados)

### G.1 Colunas calculadas no banco

| Tabela | Coluna | Expressão |
|---|---|---|
| `ai_usage_logs` | `total_tokens` | `input_tokens + output_tokens` |

### G.2 Views (consultas derivadas)

| View | SELECT |
|---|---|
| `whatsapp_connections_public` | `SELECT id, name, status, is_default FROM public.whatsapp_connections` |
| `whatsapp_connections_safe` | `select id, name, phone_number, status, is_default, case when public.has_role(auth.uid(), 'admin') then qr_code else null end as qr_code, case when public.has_role(auth.uid(), 'admin') then instance_id else null end as instance_id, farewell_message, farewell_enabled, battery_level, is_plugged, retry_ …` |
| `whatsapp_connections_agent` | `SELECT id, name, status, phone_number, is_default FROM public.whatsapp_connections` |
| `profiles_public` | `SELECT id, user_id, name, avatar_url, is_active, department, job_title FROM public.profiles` |
| `channel_connections_safe` | `SELECT id, channel_type, name, status, is_active, external_account_id, external_page_id, webhook_url, whatsapp_connection_id, created_at, updated_at, created_by FROM public.channel_connections` |
| `gmail_accounts_safe` | `SELECT id, user_id, email_address, is_active, sync_status, last_sync_at, last_error, token_expires_at, created_at, updated_at FROM public.gmail_accounts` |
| `password_reset_requests_safe` | `SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at, ip_address, user_agent, created_at, updated_at FROM public.password_reset_requests` |
| `login_attempts_safe` | `SELECT id, email, attempt_count, locked_until, last_attempt_at, created_at, updated_at FROM public.login_attempts` |
| `talkx_campaign_metrics` | `SELECT id AS campaign_id, segment_id, template_id, status, total_recipients, sent_count, delivered_count, COALESCE(replied_count, 0) AS replied_count, outcome_unknown_count, round( CASE WHEN sent_count > 0 THEN delivered_count::numeric / sent_count::numeric * 100::numeric ELSE 0::numeric END, 1) AS …` |
| `catalog_send_stats` | `with base as ( select created_at::date as dia, agent_id, product_id, product_name, coalesce(status, '') as status from public.catalog_send_events where created_at >= (now() - interval '30 days') ), por_dia as ( select 'dia'::text as grao, dia::text as chave, dia::text as rotulo, count(*) as total, c …` |
| `searchbox_usage_daily` | `SELECT (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) FILTER (WHERE a.action = 'searchbox_session')::integer AS sessoes, count(*) FILTER (WHERE a.action = 'searchbox_cost_guard')::integer AS degradacoes, max(a.created_at) AS ultimo_evento_em FROM public.audit_logs a WHERE a.a …` |
| `talkx_campaign_optouts` | `SELECT b.campaign_id, count(*)::bigint AS optout_count, count(*) FILTER (WHERE b.origin = 'auto_optout')::bigint AS auto_optout_count, max(b.created_at) AS last_optout_at FROM public.talkx_blacklist AS b WHERE b.campaign_id IS NOT NULL AND b.reason_code = 'opt_out' GROUP BY b.campaign_id` |
| `talkx_engine_health` | `WITH sending_activity AS ( SELECT c.id AS campaign_id, COALESCE( (SELECT max(r.sent_at) FROM public.talkx_recipients AS r WHERE r.campaign_id = c.id AND r.sent_at IS NOT NULL), c.started_at, c.updated_at ) AS last_activity_at FROM public.talkx_campaigns AS c WHERE c.status = 'sending' ) SELECT 'stal …` |
| `team_message_read_state` | `SELECT m.id AS message_id, m.conversation_id, COUNT(DISTINCT tcm.profile_id) AS member_count, COUNT(DISTINCT CASE WHEN r.status = 'read' AND r.profile_id <> m.sender_id THEN r.profile_id END) AS read_count, COUNT(DISTINCT CASE WHEN r.status = 'read' AND r.profile_id <> m.sender_id THEN r.profile_id …` |

### G.3 Funções de cálculo/decisão no código

- **generateBundle()** — `vite.config.ts`
  ```
  (this as unknown as import('vite').Rollup.PluginContext).emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId }), });
  ```
- **applyServerClassifications(list: ClassifiedTicket[], results: ServerClassification[],)** — `src/components/ai/AutoTicketClassifier.tsx`
  ```
  tickets: ClassifiedTicket[]; appliedCount: number
  ```
- **computeStats(list: ChurnRisk[])** — `src/components/ai/ChurnPredictionDashboard.tsx`
  ```
  total: list.length, critical: list.filter(r => r.riskLevel === 'critical').length, high: list.filter(r => r.riskLevel === 'high').length, medium: list.filter(r => r.riskLevel === 'medium').length, low: list.filter(r => r.riskLevel === 'low').length,
  ```
- **applyAiResults(results: AiChurnResult[])** — `src/components/ai/ChurnPredictionDashboard.tsx`
  ```
  const byContact = new Map(results.map(r => [r.contactId, r])); let appliedCount = 0; const merged = risks.map(risk => { const ai = byContact.get(risk.contactId); if (!ai) return risk; appliedCount += 1; return { ...risk, riskScore: ai.riskScore, riskLevel: ai.riskLevel, daysSinceLastMessage: ai.daysSinceLastMessage, totalMessages: ai.totalMessageCount ?? risk.totalMessages, reasons: ai.reasons && ai.reasons.length > 0 ? ai.reasons : risk.reasons, }; }); if (appliedCount === 0) return 0; merged.s …
  ```
- **validateTriggerConfig(triggerType: string, config: Record<string, unknown>)** — `src/components/automations/automationConstants.ts`
  ```
  for (const field of triggerConfigFields(triggerType)) { const value = config[field.key]; if (field.input === 'keywords') { if (!Array.isArray(value) || value.length === 0) return field.required; continue; } if (field.input === 'number') { if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return field.required; continue; } if (typeof value !== 'string' || value.trim() === '') return field.required; } return null;
  ```
- **applySort(key: string)** — `src/components/catalog/ExternalProductManagement.tsx`
  ```
  const opt = SORT_OPTIONS.find((o) => o.order_by + ':' + String(o.ascending) === key); if (!opt) return; dispatch({ type: 'sort', orderBy: opt.order_by, ascending: opt.ascending }); sessionStorage.setItem('catalog.order_by', opt.order_by); sessionStorage.setItem('catalog.ascending', String(opt.ascending)); setPage(0);
  ```
- **formatPrice(price: number)** — `src/components/catalog/catalogShared.tsx`
  ```
  
  ```
- **PriceTag({ value, suggested, size = 'md' }: PriceTagProps)** — `src/components/catalog/catalogShared.tsx`
  ```
  return ( <span className="inline-flex items-baseline gap-2"> <span className={`catalog-price tabular-nums ${PRICE_SIZE_CLASS[size]}`}>{formatPrice(value)}</span> {suggested != null && suggested !== value && ( <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(suggested)}</span> )} </span> );
  ```
- **applyWeekdayTemplate()** — `src/components/connections/BusinessHoursDialog.tsx`
  ```
  setLocalHours((prev) => prev.map((h) => ({ ...h, is_open: h.day_of_week >= 1 && h.day_of_week <= 5, open_time: '08:00', close_time: '18:00', })) ); toast.success('Template de dias úteis aplicado');
  ```
- **telefoneValido(valor: string)** — `src/components/connections/ConnectionsView.tsx`
  ```
  const texto = valor.trim(); if (!texto.startsWith('+')) return false; const digitos = texto.replace(/\D/g, ''); return digitos.startsWith('55') ? digitos.length >= 12 : digitos.length >= 7;
  ```
- **validarUrlFoto(valor: string)** — `src/components/connections/InstanceSettingsDialog.tsx`
  ```
  const url = valor.trim(); if (!url) return 'Informe a URL da foto de perfil.'; if (url.length > URL_FOTO_MAX) return `A URL da foto não pode passar de ${URL_FOTO_MAX} caracteres.`; let parsed: URL; try { parsed = new URL(url); } catch { return 'URL inválida: use um endereço http:// ou https://.'; } if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { return 'A URL da foto precisa começar com http:// ou https://.'; } return null;
  ```
- **aplicarFoto()** — `src/components/connections/InstanceSettingsDialog.tsx`
  ```
  const problema = validarUrlFoto(profile.pictureUrl); if (problema) { toast.error(problema); return; } try { await updateProfilePicture(instanceName, profile.pictureUrl.trim()); toast.success('Foto atualizada!'); } catch { toast.error('Erro ao atualizar foto'); }
  ```
- **formatCurrency(v: number | null)** — `src/components/contacts/CRMContactCard.tsx`
  ```
  
  ```
- **calculateEngagement(messageCount: number, lastMessageAt?: string | null, createdAt?: string)** — `src/components/contacts/ContactEngagementScore.tsx`
  ```
  score: number; level: 'hot' | 'warm' | 'cold' | 'frozen'; label: string; color: string; bgColor: string;
  ```
- **recalcularCoordenada()** — `src/components/contacts/ContactForm.tsx`
  ```
  const alvo = [ values.address, values.address_number, values.neighborhood, values.city, values.state, values.postal_code, ] .filter(Boolean) .join(', '); if (!alvo.trim() || recalculandoCoordenada) return; // A busca fica amarrada ao endereço que a disparou: se o operador reescrever qualquer campo de // endereço enquanto ela está em voo, a resposta perde a correspondência e é descartada (item 2). const assinaturaConsultada = assinaturaEndereco(values); setRecalculandoCoordenada(true); try { cons …
  ```
- **computeDefaults(contacts: Contact[], primaryId: string)** — `src/components/contacts/ContactMergeDialog.tsx`
  ```
  const primaryIdx = contacts.findIndex((c) => c.id === primaryId); const init = {} as Record<FieldKey, number>; FIELDS.forEach((f) => { if (primaryIdx >= 0 && valueOf(contacts[primaryIdx], f.key) !== '') { init[f.key] = primaryIdx; return; } const idx = contacts.findIndex((c) => valueOf(c, f.key) !== ''); init[f.key] = idx >= 0 ? idx : Math.max(primaryIdx, 0); }); return init;
  ```
- **hasValidType(p: FilterPreset)** — `src/components/contacts/FilterPresets.tsx`
  ```
  p.filters.type === undefined || VALID_TAB_TYPES.has(p.filters.type);
  ```
- **canDeleteContact(contact: Pick<Contact, 'can_delete'>)** — `src/components/contacts/contactPermissions.ts`
  ```
  return contact.can_delete !== false;
  ```
- **canDeleteSelectedContacts(selectedIds: string[], contacts: Pick<Contact, 'id' | 'can_delete'>[],)** — `src/components/contacts/contactPermissions.ts`
  ```
  if (selectedIds.length === 0) return undefined; const conhecidos = contacts.filter(c => selectedIds.includes(c.id)); if (conhecidos.length === 0) return undefined; return conhecidos.some(c => canDeleteContact(c));
  ```
- **canMergeContacts(adminAccess: boolean | null | undefined)** — `src/components/contacts/contactPermissions.ts`
  ```
  return adminAccess !== false;
  ```
- **canChangeSelectedContactsType(selectedIds: string[], contacts: Pick<Contact, 'id' | 'can_delete'>[],)** — `src/components/contacts/contactPermissions.ts`
  ```
  return canDeleteSelectedContacts(selectedIds, contacts);
  ```
- **validateEmail(email: string)** — `src/components/contacts/useContactFormValidation.ts`
  ```
  if (!email) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  ```
- **validatePhone(phone: string)** — `src/components/contacts/useContactFormValidation.ts`
  ```
  const cleaned = phone.replace(/\D/g, ''); return cleaned.length >= 10 && cleaned.length <= 15;
  ```
- **DiscountGuardrailBanner({ result, onSelectAlternative, onDismiss, className }: DiscountGuardrailBannerProps)** — `src/components/copilot/DiscountGuardrailBanner.tsx`
  ```
  if (!result.detected) return null; return ( <div className={cn('rounded-lg border border-red-400/30 bg-red-50/50 dark:bg-red-900/10 p-3', className)}> <div className="flex items-start justify-between"> <div className="flex items-center gap-1.5"> <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" /> <span className="text-xs font-medium text-red-700 dark:text-red-400"> {result.warningMessage} </span> </div> <button type="button" onClick={onDismiss} className="text-muted-foreground hover:te …
  ```
- **validateGoal(goal: GoalConfig)** — `src/components/dashboard/GoalsConfigDialog.tsx`
  ```
  const errors: string[] = []; const { daily_target: daily, weekly_target: weekly, monthly_target: monthly } = goal; if (goal.goal_type === 'resolution_rate' && [daily, weekly, monthly].some((v) => v > MAX_PERCENT_TARGET)) { errors.push('A taxa de resolução deve ficar entre 0% e 100%.'); } if (weekly < daily) { errors.push('A meta semanal não pode ser menor que a diária.'); } if (monthly < weekly) { errors.push('A meta mensal não pode ser menor que a semanal.'); } return errors;
  ```
- **scoreValue(raw: unknown)** — `src/components/dashboard/SentimentTabContent.tsx`
  ```
  return normalizeScore(raw, { min: 0, max: 100, scale: 'percent' }).value;
  ```
- **ScoreText({ score }: { score: number | null })** — `src/components/dashboard/SentimentTabContent.tsx`
  ```
  return score === null ? <span className="text-muted-foreground">—</span> : <>{score}%</>;
  ```
- **sentimentScoreValue(raw: unknown)** — `src/components/dashboard/useSentimentData.ts`
  ```
  return normalizeScore(raw, { min: 0, max: 100, scale: 'percent' }).value;
  ```
- **RankIndicator({ index }: { index: number })** — `src/components/dashboard/overview/TeamHighlightCard.tsx`
  ```
  if (index < 3) { return <Medal className={cn('w-5 h-5 shrink-0', MEDAL_CLASS[index])} />; } return <span className="w-5 h-5 flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">{index + 1}</span>;
  ```
- **apply(user: LoggedAgentUser | null | undefined)** — `src/components/inbox/ChatPanel.tsx`
  ```
  if (!user?.id) { if (!cancelled) setIdentity(null); return; } const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : ''; let name = metadataName || user.email || ''; try { const { data } = await supabase.from('profiles').select('name').eq('user_id', user.id).maybeSingle(); if (data?.name) name = data.name; } catch (err) { // Sem o nome do perfil a identidade continua correta e o rótulo cai nos // metadados (ou no e-mail); a falha não é engolida em si …
  ```
- **computeStats(conversations: ConversationWithMessages[], options: FilterOption[],)** — `src/components/inbox/ContactTypeFilter.tsx`
  ```
  const stats: Record<string, FilterStats> = {}; for (const opt of options) { stats[opt.value] = { count: 0, unread: 0 }; } for (const c of conversations) { for (const opt of options) { if (opt.match(c)) { stats[opt.value].count++; if (c.unreadCount > 0) stats[opt.value].unread++; } } } return stats;
  ```
- **generateSummary()** — `src/components/inbox/ConversationSummary.tsx`
  ```
  if (!canGenerateSummary) { toast.error('O período selecionado precisa ter pelo menos 10 mensagens.'); return; } const request = beginRequest(); setIsLoading(true); try { const { data, error } = await supabase.functions.invoke('ai-conversation-summary', { body: { messages: filteredMessages.map(m => ({ sender: m.sender, content: m.content, created_at: m.created_at })), contactName, contactId, requestId: request.requestId }, }); // IA-048 — a resposta só vale se contato/período ainda forem os do cl …
  ```
- **applyFormat(type: FormatType)** — `src/components/inbox/chat/RichTextToolbar.tsx`
  ```
  const input = inputRef.current; if (!input) return; const { prefix, suffix } = FORMAT_MAP[type]; const start = input.selectionStart ?? inputValue.length; const end = input.selectionEnd ?? inputValue.length; const selectedText = inputValue.substring(start, end); let newValue: string; let newCursorPos: number; if (type === 'list' || type === 'ordered-list') { const lineStart = inputValue.lastIndexOf('\n', start - 1) + 1; newValue = inputValue.substring(0, lineStart) + prefix + inputValue.substring …
  ```
- **podeReenviarComoTexto(mensagem: Message | null | undefined)** — `src/components/inbox/chat/SendErrorBanner.tsx`
  ```
  return mensagem?.type === 'text';
  ```
- **engagementScore(()** — `src/components/inbox/contact-details/ContactHeaderSection.tsx`
  ```
  let s = 50; if (sentiment.value === 'positivo') s += 25; if (priority.value === 'high') s += 15; if (enrichedData?.company) s += 5; if (contactType === 'customer') s += 5; return Math.min(s, 100);
  ```
- **validValues(parsed: unknown)** — `src/components/inbox/contact-details/sidebar/sidebarSections.ts`
  ```
  if (!Array.isArray(parsed)) return []; return parsed.filter((v): v is string => typeof v === 'string' && KNOWN.has(v));
  ```
- **recalcular()** — `src/components/inbox/location-picker/SuggestionList.tsx`
  ```
  const topo = cascaRef.current?.getBoundingClientRect().top ?? 0; const disponivel = vv.height - topo - 12; setTetoTeclado(disponivel > 0 ? Math.round(disponivel) : null);
  ```
- **Ranking({ ranking }: { ranking: JourneyStatsHeroRankingEntry[] })** — `src/components/inbox/tabs/journey/JourneyStatsHero.tsx`
  ```
  const topo = ranking.slice(0, 3); return ( <div data-testid="journey-stats-hero-ranking" className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3" > <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground"> <Users aria-hidden="true" className="h-3.5 w-3.5" /> Quem atendeu </p> {topo.length === 0 ? ( <p className="text-xs text-muted-foreground">Sem atendimentos no período.</p> ) : ( <ol className="flex flex-col gap-2"> {topo …
  ```
- **RankBadge({ rank, previousRank }: { rank: number; previousRank: number })** — `src/components/leaderboard/LeaderboardHelpers.tsx`
  ```
  const rankChange = previousRank - rank; const getRankStyle = () => { switch (rank) { case 1: return { bg: 'bg-gradient-to-br from-primary to-warning', shadow: 'shadow-glow-primary-sm', icon: Crown, iconColor: 'text-primary-foreground' }; case 2: return { bg: 'bg-gradient-to-br from-slate-400 to-slate-500', shadow: '', icon: Medal, iconColor: 'text-muted-foreground' }; case 3: return { bg: 'bg-gradient-to-br from-warning to-warning/80', shadow: '', icon: Medal, iconColor: 'text-warning-foreground …
  ```
- **generateBackupCodes(count: number = 10)** — `src/components/mfa/MFABackupCodes.tsx`
  ```
  const codes: string[] = []; for (let i = 0; i < count; i++) { const part1 = secureRandomChars(4, BASE36_MAIUSCULO); const part2 = secureRandomChars(4, BASE36_MAIUSCULO); codes.push(`${part1}-${part2}`); } return codes;
  ```
- **ScoreGauge({ score }: { score: number })** — `src/components/monitoring/MonitoringDiagnosticPanel.tsx`
  ```
  const color = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-destructive'; const pc = score >= 80 ? '[&>div]:bg-emerald-500' : score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-destructive'; return ( <div className="flex items-center gap-4"> <motion.div className={cn('text-5xl font-bold tabular-nums', color)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}> {score} </motion.div> <div className="fl …
  ```
- **computeUptime24h(rows: HealthLogRow[], now: Date)** — `src/components/monitoring/hooks/useConnectionIncidents.ts`
  ```
  const groups = groupByConnection(inWindow(rows, now)); return Array.from(groups.entries()) .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) .map(([connectionId, group]) => { const ordered = [...group].sort(byCheckedAsc); const healthy = ordered.filter((r) => isHealthy(r.status)); const fails = ordered.filter((r) => !isHealthy(r.status)); const lastFail = fails.length > 0 ? fails[fails.length - 1] : null; return { connectionId, instanceId: ordered[0].instance_id, percentage: ordered.leng …
  ```
- **computeIncidents(rows: HealthLogRow[], now: Date)** — `src/components/monitoring/hooks/useConnectionIncidents.ts`
  ```
  const groups = groupByConnection(inWindow(rows, now)); const incidents: ConnectionIncident[] = []; for (const [connectionId, group] of Array.from(groups.entries())) { const ordered = [...group].sort(byCheckedAsc); let run: HealthLogRow[] = []; const close = (endedAt: string | null) => { if (run.length === 0) return; const startedAt = run[0].checked_at; const durationMs = Math.max( 0, (endedAt ? Date.parse(endedAt) : now.getTime()) - Date.parse(startedAt), ); incidents.push({ id: `${connectionId} …
  ```
- **computeActiveAlerts(incidents: ConnectionIncident[], rows: HealthLogRow[],)** — `src/components/monitoring/hooks/useConnectionIncidents.ts`
  ```
  return incidents .filter((i) => i.ongoing) .map((incident) => ({ id: incident.id, connectionId: incident.connectionId, instanceId: incident.instanceId, severity: severityFor(incident, rows), title: severityFor(incident, rows) === 'critical' ? 'Conexão indisponível' : 'Conexão instável', since: incident.startedAt, }));
  ```
- **computeUptime(logs: HealthLog[], now: Date)** — `src/components/monitoring/hooks/useMonitoringData.ts`
  ```
  // R2-INF-027: o SLA é das últimas 24h, independente do período selecionado. const dayAgo = new Date(now.getTime() - SLA_WINDOW_MS); const recent = logs.filter(l => new Date(l.checked_at) >= dayAgo); const healthy = recent.filter(l => HEALTHY_STATUSES.includes(l.status)); const lastFail = recent.find(l => !HEALTHY_STATUSES.includes(l.status)); return { // Sem checks na janela não há SLA a aprovar: dado insuficiente (null), nunca 100%. percentage: recent.length > 0 ? Math.round((healthy.length / …
  ```
- **computeInstanceUptimes(logs: HealthLog[], now: Date)** — `src/components/monitoring/hooks/useMonitoringData.ts`
  ```
  const dayAgo = new Date(now.getTime() - SLA_WINDOW_MS); const recent = logs.filter(l => new Date(l.checked_at) >= dayAgo); const map = new Map<string, HealthLog[]>(); recent.forEach(l => map.set(l.instance_id, [...(map.get(l.instance_id) || []), l])); return Array.from(map.entries()).map(([instanceId, instLogs]) => { const h = instLogs.filter(l => HEALTHY_STATUSES.includes(l.status)); const lats = instLogs.filter(l => l.response_time_ms != null).map(l => l.response_time_ms!); const lastErr = ins …
  ```
- **computeSparklines(logs: HealthLog[], msgs: { sender: string; created_at: string }[], now: Date, period: TimePeriod)** — `src/components/monitoring/hooks/useMonitoringData.ts`
  ```
  const r: SparklineData = { messages: [], latency: [], uptime: [] }; const ms = periodMs[period]; const bucketSize = ms / 8; for (let i = 7; i >= 0; i--) { const s = new Date(now.getTime() - (i + 1) * bucketSize); const e = new Date(now.getTime() - i * bucketSize); const hl = logs.filter(l => { const t = new Date(l.checked_at); return t >= s && t < e; }); const hh = hl.filter(l => HEALTHY_STATUSES.includes(l.status)); r.uptime.push(hl.length > 0 ? Math.round((hh.length / hl.length) * 100) : 100); …
  ```
- **ScoreGauge({ score }: { score: number })** — `src/components/nps/NPSDashboard.tsx`
  ```
  const color = score >= 50 ? 'text-success' : score >= 0 ? 'text-warning' : 'text-destructive'; const bg = score >= 50 ? 'bg-success/10' : score >= 0 ? 'bg-warning/10' : 'bg-destructive/10'; const label = score >= 70 ? 'Excelente' : score >= 50 ? 'Bom' : score >= 0 ? 'Neutro' : 'Crítico'; return ( <div className={`flex flex-col items-center justify-center p-6 rounded-xl ${bg}`}> <span className={`text-5xl font-bold ${color}`}>{score}</span> <span className="text-sm text-muted-foreground mt-1">NPS …
  ```
- **shouldSkipPrefetch()** — `src/components/performance/hotRoutePrefetch.ts`
  ```
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean }; }; const conn = nav.connection; if (!conn) return false; return Boolean(conn.saveData) || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  ```
- **computeOverallScore(metrics: Array<{ status: MetricStatus }>)** — `src/components/performance/metricThresholds.ts`
  ```
  return Math.round((metrics.filter(m => m.status === 'good').length / Math.max(metrics.length, 1)) * 100);
  ```
- **calculateTrend(current: number, previous: number)** — `src/components/reports/useReportsData.ts`
  ```
  if (!compareEnabled || previous === 0) return undefined; return ((current - previous) / previous) * 100;
  ```
- **aplicarSom(category: CategoryKey, soundId: SoundTypeOption)** — `src/components/settings/SoundCustomizationPanel.tsx`
  ```
  const campo = CATEGORY_SOUND_FIELD[category]; const alteracao: Partial<NotificationSettings> = {}; alteracao[campo] = soundId; updateSettings(alteracao);
  ```
- **applyGxDarkSurfaces(preset: ThemePreset)** — `src/components/settings/theme/presets.ts`
  ```
  const d = preset.dark; d.background = '265 22% 8%'; d.card = '265 22% 12%'; d['card-elevated'] = '265 18% 17%'; d.popover = '265 22% 14%'; d.muted = '265 18% 17%'; d.input = '265 18% 17%'; d.border = '265 18% 22%'; d.secondary = '265 18% 17%'; d.accent = '265 18% 17%'; d.surface = '265 22% 10%'; d['surface-hover'] = '265 18% 17%'; d.divider = '265 18% 22%'; d['sidebar-background'] = '265 24% 10%'; d['sidebar-accent'] = '265 18% 17%'; d['sidebar-border'] = '265 18% 20%'; d.elevated = '265 18% 17% …
  ```
- **applyGxNeonGlow(preset: ThemePreset)** — `src/components/settings/theme/presets.ts`
  ```
  const { light, dark } = preset; light['shadow-glow-primary'] = boostGlowAlpha(light['shadow-glow-primary'], 0.45); light['shadow-glow-secondary'] = boostGlowAlpha(light['shadow-glow-secondary'], 0.4); dark['shadow-glow-primary'] = boostGlowAlpha(dark['shadow-glow-primary'], 0.7); dark['shadow-glow-secondary'] = boostGlowAlpha(dark['shadow-glow-secondary'], 0.65); return preset;
  ```
- **applyGxGlass(preset: ThemePreset, h: number, s: number, l: number)** — `src/components/settings/theme/presets.ts`
  ```
  preset.dark['glass-bg'] = '265 22% 12% / 0.55'; preset.light['glass-bg'] = '0 0% 100% / 0.55'; preset.dark['glass-border'] = `${h} ${Math.min(100, s + 5)}% ${l}% / 0.5`; preset.light['glass-border'] = `${h} ${Math.min(100, s + 5)}% ${l}% / 0.5`; return preset;
  ```
- **applyThemePreset(presetId: string, mode: 'light' | 'dark', opts: { persistCache?: boolean } = {},)** — `src/components/settings/theme/presets.ts`
  ```
  const preset = getPresetById(presetId); if (!preset) return; const root = document.documentElement; root.classList.add('theme-transitioning'); root.dataset.presetId = presetId; const colors = preset[mode]; const cache: Record<string, string> = {}; // Alto contraste manda nas CORES (`.high-contrast`, em src/styles/accessibility.css). // Escrever os tokens do preset aqui — inline, no mesmo `<html>` — venceria a classe e // anularia o modo; então, com o HC ligado, a cor sai do inline e fica só na c …
  ```
- **applyRadius(px: number)** — `src/components/settings/theme/presets.ts`
  ```
  const safe = clampRadius(px); document.documentElement.style.setProperty('--radius', `${safe / 16}rem`);
  ```
- **applyLink(url: string)** — `src/components/talkx/TalkXMediaDropzone.tsx`
  ```
  setLinkUrl(url); const trimmed = url.trim(); if (!trimmed) { onChange(null); return; } onChange({ media_url: trimmed, media_type: mediaTypeFromFileName(trimmed), media_file_name: null, media_size_bytes: null, media_width: null, media_height: null, });
  ```
- **valor(c: TalkXCampaign)** — `src/components/talkx/TalkXOverview.tsx`
  ```
  switch (sort.key) { case 'name': return c.name.toLocaleLowerCase('pt-BR'); case 'segment': return (segments.find((sg) => sg.id === c.segment_id)?.name ?? (c.audience_source === 'crm360' ? 'CRM 360°' : 'Seleção manual')).toLocaleLowerCase('pt-BR'); case 'status': return CAMPAIGN_STATUS[c.status]?.label ?? c.status; case 'progress': return pct(c.sent_count + c.failed_count, c.total_recipients); case 'results': return c.sent_count; case 'date': return new Date(c.scheduled_at ?? c.started_at ?? c.cr …
  ```
- **invalidateList()** — `src/components/talkx/TalkXSuppression.tsx`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-blacklist'] }); qc.invalidateQueries({ queryKey: ['talkx-suppression-activity'] });
  ```
- **validateTalkxInteractive(value: TalkxInteractive | null | undefined)** — `src/components/talkx/talkxInteractive.ts`
  ```
  const errors: string[] = []; if (!value) return { ok: true, errors }; const hasButtons = Array.isArray(value.buttons) && value.buttons.length > 0; const hasPoll = !!value.poll; if (hasButtons && hasPoll) { errors.push('Escolha botões ou enquete, não os dois.'); } if (Array.isArray(value.buttons)) { if (value.buttons.length > MAX_INTERACTIVE_BUTTONS) { errors.push(`No máximo ${MAX_INTERACTIVE_BUTTONS} botões.`); } value.buttons.forEach((button, index) => { const label = (button?.label ?? '').trim …
  ```
- **validateTalkxMediaFile(file: { name: string; type: string; size: number })** — `src/components/talkx/useTalkXMediaUpload.ts`
  ```
  if (!mediaTypeFromMime(file.type)) { const extension = file.name.split('.').pop()?.toLowerCase(); const hint = extension ? `.${extension}` : 'este tipo'; return { ok: false, error: `Arquivo ${hint} não é aceito. Use imagem, vídeo MP4, PDF, DOCX, XLSX ou áudio.` }; } if (file.size > TALKX_MEDIA_MAX_BYTES) { return { ok: false, error: `O arquivo tem ${formatMediaBytes(file.size)} e passa do limite de 16 MB.` }; } return { ok: true };
  ```
- **rankHelpDoc(doc: TalkXHelpDoc, tokens: string[])** — `src/components/talkx/help/useTalkXHelpSearch.ts`
  ```
  if (tokens.length === 0) return 0; const title = foldHelpText(doc.title); const keywords = foldHelpText(doc.keywords.join(' ')); const body = foldHelpText(doc.body); if (tokens.every((token) => title.includes(token))) return 3; if (tokens.every((token) => title.includes(token) || keywords.includes(token))) return 2; if (tokens.every((token) => title.includes(token) || keywords.includes(token) || body.includes(token))) return 1; return 0;
  ```
- **computeVariation(value: number | string | null | undefined, comparison?: KpiComparison,)** — `src/components/talkx/kit/kpi.tsx`
  ```
  if (!comparison) return null; const cur = comparison.current !== undefined ? comparison.current : value; if (typeof cur !== 'number') return null; const prev = comparison.previous; if (prev == null || prev <= 0) return null; const base = comparison.baseValue ?? prev; if (base < (comparison.minBase ?? 0)) return null; const raw = comparison.kind === 'points' ? cur - prev : ((cur - prev) / base) * 100; const up = raw >= 0; const good = comparison.goodWhen === 'down' ? !up : up; const magnitude = c …
  ```
- **round(n: number)** — `src/components/talkx/report/talkxReportCharts.ts`
  ```
  Math.round(n * 100) / 100;
  ```
- **applyEdit(state: SegmentBuilderState, next: Partial<SegmentBuilderContent>, editKey: string, at: number,)** — `src/components/talkx/segments/segmentBuilderReducer.ts`
  ```
  const current = builderContent(state); const target: SegmentBuilderContent = { ...current, ...next }; if (sameContent(current, target)) return state; const coalesce = state.lastEditKey === editKey && at - state.lastEditAt <= COALESCE_MS; return { ...state, ...target, past: coalesce ? state.past : pushPast(state.past, current), future: [], lastEditKey: editKey, lastEditAt: at, };
  ```
- **validateSegmentName(name: string, existingNames: string[] = [])** — `src/components/talkx/segments/segmentValidation.ts`
  ```
  const trimmed = (name ?? '').trim(); if (trimmed.length < SEGMENT_NAME_MIN) return `O nome precisa ter ao menos ${SEGMENT_NAME_MIN} caracteres.`; if (trimmed.length > SEGMENT_NAME_MAX) return `O nome pode ter no máximo ${SEGMENT_NAME_MAX} caracteres.`; if (existingNames.some((n) => normalize(n) === normalize(trimmed))) return 'Já existe um segmento com este nome.'; return null;
  ```
- **validateSegmentDescription(description: string)** — `src/components/talkx/segments/segmentValidation.ts`
  ```
  if ((description ?? '').length > SEGMENT_DESCRIPTION_MAX) { return `A descrição pode ter no máximo ${SEGMENT_DESCRIPTION_MAX} caracteres.`; } return null;
  ```
- **validateSegmentRules(rules: SegmentRules)** — `src/components/talkx/segments/segmentValidation.ts`
  ```
  const { incompleteCount } = splitRules(rules); if (incompleteCount > 0) return `Complete ou remova ${incompleteCount} condição(ões) antes de publicar.`; return null;
  ```
- **validateSegment(input: SegmentValidationInput)** — `src/components/talkx/segments/segmentValidation.ts`
  ```
  const errors: SegmentValidationErrors = {}; const name = validateSegmentName(input.name, input.existingNames ?? []); const description = validateSegmentDescription(input.description); const rules = validateSegmentRules(input.rules); if (name) errors.name = name; if (description) errors.description = description; if (rules) errors.rules = rules; return errors;
  ```
- **canRetry(recipient: { status: string; manual_retry_count: number | null })** — `src/components/talkx/tracking/TalkXRecipientRowActions.tsx`
  ```
  return (recipient.status === 'failed' || recipient.status === 'skipped') && (recipient.manual_retry_count ?? 0) < 3;
  ```
- **summaryTotals(points: TalkXSentSummaryPoint[])** — `src/components/talkx/tracking/talkxSentSummary.ts`
  ```
  return points.reduce( (acc, p) => ({ sent: acc.sent + (p.sent ?? 0), delivered: acc.delivered + (p.delivered ?? 0), replied: acc.replied + (p.replied ?? 0), }), { sent: 0, delivered: 0, replied: 0 }, );
  ```
- **podeReabrir(status: WorkItemStatus)** — `src/components/tasks/shared/sheet/rodape.ts`
  ```
  return status === 'done' || status === 'cancelled';
  ```
- **aplicarTamanhoDoChat(nivel: string)** — `src/components/theme/useChatTextSize.ts`
  ```
  document.documentElement.style.setProperty(CHAT_FONT_SIZE_VAR, `${pxDoNivel(nivel)}px`);
  ```
- **aplicarTamanhoDoChatSalvo()** — `src/components/theme/useChatTextSize.ts`
  ```
  aplicarTamanhoDoChat(nivelSalvo());
  ```
- **valorDoAngulo(angulo: number, min: number, max: number, step: number)** — `src/components/ui/VolumeDial.tsx`
  ```
  const t = posicaoNoArco(angulo); if (t > ARCO_GRAUS) return null; const fracao = t / ARCO_GRAUS; return quantizar(min + fracao * (max - min), min, max, step);
  ```
- **aplicar(proximo: number)** — `src/components/ui/VolumeDial.tsx`
  ```
  const v = limitar(proximo, min, max); if (v !== value) onChange(v);
  ```
- **FeedbackAnimation({ type, show, size = 48 }: FeedbackAnimationProps)** — `src/components/ui/micro-interactions/feedback.tsx`
  ```
  const path = type === 'success' ? 'M7 13l3 3 7-7' : 'M18 6L6 18M6 6l12 12'; return ( <AnimatePresence> {show && ( <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className={cn('rounded-full flex items-center justify-center', type === 'success' ? 'bg-success/20' : 'bg-destructive/20')} style={{ width: size, height: size }} > <motion.svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={type === 'success' ? 'hsl(var(--success))' : 'hsl(var …
  ```
- **generateDialogue()** — `src/components/voice/ElevenLabsDialogue.tsx`
  ```
  const validLines = lines.filter(l => l.text.trim()); if (validLines.length < 2) { toast.error('Adicione pelo menos 2 falas com texto'); return; } setGenerating(true); try { const { data: { session } } = await supabase.auth.getSession(); const response = await fetch( `${SUPABASE_URL}/functions/v1/elevenlabs-dialogue`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, }, body: JSON.stri …
  ```
- **generateVoice()** — `src/components/voice/ElevenLabsVoiceDesign.tsx`
  ```
  if (!name.trim()) { toast.error('Dê um nome para a voz'); return; } setGenerating(true); try { const { data: { session } } = await supabase.auth.getSession(); const response = await fetch( `${SUPABASE_URL}/functions/v1/elevenlabs-voice-design`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, }, body: JSON.stringify({ action: 'generate', name, description: `${description}. Gender: ${ …
  ```
- **calculateTrend(current: number | null, previous: number | null)** — `src/hooks/analytics/useAIStats.ts`
  ```
  // Sem amostra válida de um dos lados não há variação a afirmar (IA-023): // estável/0 em vez de inventar um número para a média que não existe. if (current === null || previous === null) return { direction: 'stable', change: 0, percentage: 0 }; if (previous === 0 && current === 0) return { direction: 'stable', change: 0, percentage: 0 }; if (previous === 0) return { direction: 'up', change: current, percentage: 100 }; const change = current - previous; const percentage = (change / previous) * 1 …
  ```
- **computeAbandonmentRate(messages: AbandonmentMessage[], windowEnd: Date,)** — `src/hooks/business/useAbandonmentRate.ts`
  ```
  const byContact = new Map<string, AbandonmentMessage[]>(); for (const message of messages) { if (!message.contact_id || !message.created_at) continue; const list = byContact.get(message.contact_id); if (list) list.push(message); else byContact.set(message.contact_id, [message]); } let responded = 0; let abandoned = 0; let waiting = 0; for (const contactMessages of byContact.values()) { for (const session of sessionsOf(contactMessages)) { const clientMessages = session.filter(m => m.sender === 'c …
  ```
- **generatePredictionFromHistory(messageHistory: { hour: number; count: number }[])** — `src/hooks/business/useDemandPrediction.ts`
  ```
  const now = new Date(); const data: PredictionPoint[] = []; const hourlyAvg = new Map<number, number>(); messageHistory.forEach(({ hour, count }) => hourlyAvg.set(hour, count)); for (let i = -4; i <= 0; i++) { const time = new Date(now.getTime() + i * 60 * 60 * 1000); const hourCount = hourlyAvg.get(time.getHours()) || 0; data.push({ time: time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), actual: hourCount, predicted: hourCount, lower: hourCount, upper: hourCount, isPredi …
  ```
- **generateEmptyDailyData(range: DateRange)** — `src/hooks/business/useQueueAnalytics.ts`
  ```
  const days = eachDayOfInterval({ start: range.from, end: range.to }); return days.map(date => ({ day: format(date, 'dd/MM', { locale: ptBR }), date: format(date, 'yyyy-MM-dd'), mensagens: 0, resolvidos: 0, novos: 0, }));
  ```
- **generateEmptyHourlyData()** — `src/hooks/business/useQueueAnalytics.ts`
  ```
  return Array.from({ length: 12 }, (_, i) => ({ hora: `${8 + i}h`, atendimentos: 0, }));
  ```
- **calculateNextSendAt(frequency: string)** — `src/hooks/chat/useScheduledReports.ts`
  ```
  const now = new Date(); const next = new Date(now); switch (frequency) { case 'daily': next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break; case 'weekly': next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break; case 'monthly': next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break; } return next.toISOString();
  ```
- **aplicarDoStore()** — `src/hooks/communication/useMediaElementVolume.ts`
  ```
  const atual = getSnapshot(); if (manageMuted) applyMediaVolume(element, toGain(atual.volume), atual.muted); else applyMediaVolumeGain(element, toGain(atual.volume));
  ```
- **applyConnections(rows: ConnectionHealth[])** — `src/hooks/connections/useConnectionsHealth.ts`
  ```
  const dropped: DisconnectEvent[] = []; for (const row of rows) { if (!row.healthy && previousStatuses.get(row.id) === HEALTHY_STATUS) { dropped.push({ connectionId: row.id, instanceId: row.instanceId, name: row.name, at: now(), }); } } previousStatuses = new Map(rows.map((row) => [row.id, row.status])); if (dropped.length > 0) { history = [...dropped, ...history].slice(0, HISTORY_MAX_ENTRIES); } setState({ connections: rows, history });
  ```
- **usePriceAnchoring({ clientText }: { clientText: string })** — `src/hooks/copilot/usePriceAnchoring.ts`
  ```
  return useMemo(() => { if (!clientText) return { triggered: false, anchorScript: '', costPerUseScript: '' }; const lower = clientText.toLowerCase(); const triggered = PRICE_SENSITIVITY_TRIGGERS.some((t) => lower.includes(t)); if (!triggered) return { triggered: false, anchorScript: '', costPerUseScript: '' }; return { triggered: true, anchorScript: 'Comparando com o impacto que o brinde vai gerar no evento, o investimento por pessoa fica muito pequeno. Posso mostrar o cálculo?', costPerUseScript …
  ```
- **scoreTemplate(template: QuickReplyTemplate, context: SaleContext,)** — `src/hooks/copilot/useSmartTemplates.ts`
  ```
  let score = 0; const text = `${template.title} ${template.content}`.toLowerCase(); const stage = (context.salesStage ?? '').toLowerCase(); const lastMsg = (context.lastClientMessage ?? '').toLowerCase(); // Pontuação por estágio — Bug 6: hasOwnProperty para evitar prototype pollution if (stage && Object.prototype.hasOwnProperty.call(TEMPLATE_STAGE_HINTS, stage)) { for (const kw of TEMPLATE_STAGE_HINTS[stage]) { if (text.includes(kw)) score += 2; } } // Pontuação por palavras da última mensagem d …
  ```
- **invalidateContactsAggregates(queryClient: Pick<QueryClient, 'invalidateQueries'>)** — `src/hooks/crm/contactsAggregates.ts`
  ```
  for (const queryKey of CONTACTS_AGGREGATE_QUERY_KEYS) { queryClient.invalidateQueries({ queryKey: [...queryKey] }); }
  ```
- **recompute()** — `src/hooks/crm/useAgentPresence.ts`
  ```
  const now = Date.now(); const next: Record<string, PresenceStatus> = {}; for (const [userId, row] of Object.entries(rows)) { const stale = now - Date.parse(row.updated_at) > STALE_MS; next[userId] = stale ? 'offline' : row.status; } // Batimento de cada agente (~25s) e o timer de expiração chamam isto o tempo // todo sem que o status mude. Comparação rasa: se nada mudou, mantemos o // MESMO objeto e não emitimos -- senão cada evento re-renderizava // useDashboardData, useWarRoomData, useAgents e …
  ```
- **invalidarAfetadas()** — `src/hooks/crm/useAgentReassignment.ts`
  ```
  
  ```
- **invalidate()** — `src/hooks/crm/useContactNotes.ts`
  ```
  queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId, user?.id) }); queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  ```
- **avgScore(row: SentimentTrendRow)** — `src/hooks/dashboard/useSentimentTrend.ts`
  ```
  const media = toNumberOrNull(row.media); if (media !== null) return media / 50 - 1; return toNumberOrNull(row.indice) ?? 0;
  ```
- **calculateLevel(xp: number)** — `src/hooks/gamification/levelUtils.ts`
  ```
  return Math.max(1, Math.floor(Math.sqrt(xp / 50.0)) + 1);
  ```
- **canTouchSupabaseClient()** — `src/hooks/gmail/useUnreadEmailCount.ts`
  ```
  if (import.meta.env.MODE !== 'test') return true; return isVitestMock(supabase.from) || isVitestMock(supabase.channel);
  ```
- **generateInstanceName(name: string)** — `src/hooks/inbox/useConnectionsManager.ts`
  ```
  
  ```
- **validateInboxPresetName(name: string, presets: InboxFilterPreset[] = [], ignoreId?: string)** — `src/hooks/inbox/useInboxFilterPresets.ts`
  ```
  const value = (name ?? '').trim(); if (value.length === 0) { return { ok: false, value: '', error: 'Informe um nome para o filtro.' }; } if (value.length > PRESET_NAME_MAX_LENGTH) { return { ok: false, value, error: `O nome deve ter no máximo ${PRESET_NAME_MAX_LENGTH} caracteres.`, }; } if (CONTROL_CHARS.test(value)) { return { ok: false, value, error: 'O nome contém caracteres inválidos.' }; } const duplicated = presets.some( (p) => p.id !== ignoreId && (p.name ?? '').trim().toLowerCase() === v …
  ```
- **invalidate()** — `src/hooks/inbox/useInboxUnreadTotal.ts`
  ```
  if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { debounce = undefined; void queryClient.invalidateQueries({ queryKey: inboxUnreadTotalQueryKey }); }, DEBOUNCE_MS);
  ```
- **applyMultiplixAudience(input: MultiplixAudienceApplyInput,)** — `src/hooks/integrations/useMultiplixDispatches.ts`
  ```
  const data = await invokeMultiplixDispatch('audience.apply', buildMultiplixAudienceApplyPayload(input)); return readMultiplixAudienceSelection(data);
  ```
- **invalidateCampaignViews()** — `src/hooks/integrations/useTalkXCampaignList.ts`
  ```
  // O prefixo alcança a lista paginada, a lista legada (`useTalkX().campaigns`, // que ainda alimenta os KPIs da Visão geral e o indicador "Em andamento") e o // detalhe roteado. void queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  ```
- **validateTalkxLinkLabel(raw: string)** — `src/hooks/integrations/useTalkXLinks.ts`
  ```
  const label = normalizeTalkxLinkLabel(raw); if (!label) return 'Informe um rótulo para o link.'; if (!TALKX_LINK_LABEL_PATTERN.test(label)) { return 'Use até 40 caracteres: letras minúsculas sem acento, números, "-" ou "_", começando por letra ou número.'; } return null;
  ```
- **validateTalkxLinkTargetUrl(raw: string)** — `src/hooks/integrations/useTalkXLinks.ts`
  ```
  const target = raw.trim(); if (!target) return 'Informe o destino do link.'; if (!target.startsWith('https://')) return 'O destino precisa começar com https://.'; return null;
  ```
- **invalidate()** — `src/hooks/integrations/useTalkXLinks.ts`
  ```
  qc.invalidateQueries({ queryKey });
  ```
- **valorDoDominio(valor: string | null, dominio: readonly string[])** — `src/hooks/integrations/useTalkXSegments.ts`
  ```
  return valor && dominio.includes(valor) ? valor : 'all';
  ```
- **applySegmentBulkAction(input: { action: TalkXSegmentBulkAction; ids: string[]; tag?: string; })** — `src/hooks/integrations/useTalkXSegments.ts`
  ```
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem // resposta" na hora de casar as linhas devolvidas. const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== ''))); if (ids.length === 0) throw new Error('Selecione ao menos um segmento.'); const tag = input.tag?.trim(); // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada. if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em m …
  ```
- **invalidate()** — `src/hooks/integrations/useTalkXSegments.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-segments'] }); // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem // isto o total do topo fica velho até o próximo recarregamento. qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  ```
- **invalidate()** — `src/hooks/integrations/useTalkXTemplates.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-templates'] });
  ```
- **computeStatus()** — `src/hooks/realtime/realtimeStatusStore.ts`
  ```
  if (channels.size === 0) return 'idle'; let connected = false; for (const health of channels.values()) { if (health === 'error') return 'disconnected'; if (health === 'connected') connected = true; } return connected ? 'connected' : 'connecting';
  ```
- **applyStatus(next: RealtimeStatus)** — `src/hooks/realtime/realtimeStatusStore.ts`
  ```
  if (next === status) return; status = next; if (next === 'disconnected') { // Um timer só: enquanto o estado não muda, novas quedas não reiniciam a // carência nem acumulam timers. if (graceTimer === null && !notice) { graceTimer = setTimeout(() => { graceTimer = null; notice = true; notify(); }, REALTIME_STALE_GRACE_MS); } } else { clearGrace(); } notify();
  ```
- **calculateStatus(remainingMs: number, totalMs: number, warningMs: number, completed: boolean, completedAt?: Date | null, deadline?: Date)** — `src/hooks/sla/useSLACalculation.ts`
  ```
  status: SLAStatus; remainingMs: number; breached: boolean
  ```
- **compute(params: UseSLACalculationParams, nowMs: number)** — `src/hooks/sla/useSLACalculation.ts`
  ```
  const now = new Date(nowMs); const frDeadline = new Date(params.firstMessageAt.getTime() + params.firstResponseMinutes * 60_000); const totalMs = params.firstResponseMinutes * 60_000; const warningMs = resolveWarningMs(params.warningMinutes, totalMs); const firstResponse = calculateStatus( frDeadline.getTime() - now.getTime(), totalMs, warningMs, !!params.firstResponseAt, params.firstResponseAt, frDeadline ); return { firstResponse, worstStatus: firstResponse.status };
  ```
- **calcTrend(firstHalf: DailyViolation[], secondHalf: DailyViolation[], getVal: (d: DailyViolation)** — `src/hooks/sla/useSLAHistory.ts`
  ```
  number
  ```
- **shouldNotifyConnectionAlert(preferences: ConnectionAlertPreferences, kind: ConnectionAlertKind,)** — `src/hooks/system/useConnectionAlertPreferences.ts`
  ```
  return kind === 'degraded' ? preferences.alert_on_degraded : preferences.alert_on_disconnected;
  ```
- **apply()** — `src/hooks/system/useDocumentBadge.ts`
  ```
  const base = stripBadgeTitle(document.title); document.title = document.hidden ? formatBadgeTitle(count, base) : base;
  ```
- **calculateStats(data: RateLimitLog[])** — `src/hooks/system/useRateLimitLogs.ts`
  ```
  const totalRequests = data.reduce((sum, log) => sum + log.request_count, 0); const blockedRequests = data.filter(log => log.blocked).length; const uniqueIPs = new Set(data.map(log => log.ip_address)).size; const endpointCounts: Record<string, number> = {}; data.forEach(log => { endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + log.request_count; }); const topEndpoints = Object.entries(endpointCounts) .map(([endpoint, count]) => ({ endpoint, count })) .sort((a, b) => b.count - …
  ```
- **generateClientTaskId()** — `src/hooks/tasks/useMyWorkItems.ts`
  ```
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto; return typeof c?.randomUUID === 'function' ? c.randomUUID() : null;
  ```
- **invalidate()** — `src/hooks/tasks/useMyWorkItems.ts`
  ```
  queryClient.invalidateQueries({ queryKey: listKey }); queryClient.invalidateQueries({ queryKey: ['work-items-badge', profileId] });
  ```
- **applySavedFields(item: WorkItem, patch: Partial<WorkItemInput>, status: WorkItemStatus, waitingReason: string | null,)** — `src/hooks/tasks/useWorkItemDraft.ts`
  ```
  return { ...fieldsFromItem(item), ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}), ...(patch.priority !== undefined ? { priority: patch.priority } : {}), ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}), ...(patch.remindAt !== undefined ? { remindAt: patch.remindAt } : {}), ...(patch.waitingReason !== undefined ? { waitingReason: patch.waitingReason } : {}), status, ...(status === 'wait …
  ```
- **invalidateTasks()** — `src/hooks/tasks/useWorkItemNotifications.ts`
  ```
  void queryClient.invalidateQueries({ queryKey: ['work-items'] }); void queryClient.invalidateQueries({ queryKey: ['work-items-badge'] });
  ```
- **canTransition(from: WorkItemStatus, to: WorkItemStatus, ctx: TransitionCtx,)** — `src/hooks/tasks/workItemMachine.ts`
  ```
  // done → só pode reabrir para 'todo' if (from === 'done') { if (to === 'todo') return { ok: true }; return { ok: false, reason: 'invalid_transition' }; } // cancelled → sem transições (arquivo morto) if (from === 'cancelled') { return { ok: false, reason: 'invalid_transition' }; } // transições proibidas explícitas if (to === 'backlog' && from !== 'backlog') { // voltar para backlog só permitido de todo/waiting if (!['todo', 'waiting'].includes(from)) { return { ok: false, reason: 'invalid_tran …
  ```
- **revalidar()** — `src/hooks/team-chat/useTeamMessageReactions.ts`
  ```
  void qc.invalidateQueries({ queryKey: qKey });
  ```
- **revalidar()** — `src/hooks/team-chat/useTeamMessages.ts`
  ```
  void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }); void queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
  ```
- **aplicarGravados(bindings: StoredBindings)** — `src/hooks/ui/useCustomShortcuts.ts`
  ```
  return DEFAULT_SHORTCUTS.map(shortcut => { const custom = bindings?.[shortcut.id]; if (!custom) return shortcut; return { ...shortcut, customKey: custom.key, customModifiers: custom.modifiers }; });
  ```
- **applyThemeToDocument(resolvedTheme: ResolvedTheme, animate = true)** — `src/hooks/ui/useTheme.ts`
  ```
  if (typeof window === 'undefined') return; const root = window.document.documentElement; const body = window.document.body; if (animate) { root.style.setProperty('--theme-transition', '0.3s'); body.classList.add('theme-transitioning'); } root.classList.remove('light', 'dark'); root.classList.add(resolvedTheme); root.style.colorScheme = resolvedTheme; if (animate) { if (transitionTimeout) { window.clearTimeout(transitionTimeout); } transitionTimeout = window.setTimeout(() => { root.style.removePr …
  ```
- **aplicarAtalhoDeVolume(event: AtalhoDeVolume, acoes: AcoesDoAtalho)** — `src/hooks/ui/useVolumeRocker.ts`
  ```
  const { enabled, step, onAdjust, onToggleMute, setOpen } = acoes; if (!enabled) return; // O mesmo teclado chega pelos dois caminhos quando o foco está no botão (o nativo no // container roda antes do React, que escuta na raiz). Sem esta guarda, um ArrowUp // andaria duas casas. if (event.defaultPrevented) return; // Não sequestrar as setas quando o foco está num campo de texto. const target = event.target as HTMLElement | null; if ( target && (target.isContentEditable || target instanceof HTMLI …
  ```
- **gerarImpressaoDispositivo()** — `src/lib/avisoDispositivo.ts`
  ```
  let impressaoCanvas = ''; try { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); if (ctx) { ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fingerprint', 2, 2); } impressaoCanvas = canvas.toDataURL(); } catch { // Ambiente sem canvas: os demais componentes ainda identificam o dispositivo. impressaoCanvas = ''; } const componentes = [ navigator.userAgent, navigator.language, screen.colorDepth, `${screen.width}x${screen.height}`, new Date().get …
  ```
- **generateChartConfig(keys: string[], labels?: Record<string, string>)** — `src/lib/chartColors.ts`
  ```
  label: string; color: string
  ```
- **calcCnpjDigit(digits: number[], weights: number[])** — `src/lib/cnpjUtils.ts`
  ```
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0); const remainder = sum % 11; return remainder < 2 ? 0 : 11 - remainder;
  ```
- **calculateContactHealth(input: ContactHealthInput | null | undefined)** — `src/lib/contactHealth.ts`
  ```
  let filledWeight = 0; let evaluatedWeight = 0; let filledCount = 0; let evaluatedCount = 0; const missing: ContactHealthMissingField[] = []; for (const field of CONTACT_HEALTH_FIELDS) { const value = input ? input[field.key] : undefined; // Chave ausente = não avaliado (não pune, não entra em "faltam"). if (value === undefined) continue; evaluatedWeight += field.weight; evaluatedCount += 1; if (isFieldFilled(field.key, value)) { filledWeight += field.weight; filledCount += 1; } else { missing.pu …
  ```
- **generateTabId()** — `src/lib/crossTabDrainLock.ts`
  ```
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') { const sorte = crypto.getRandomValues(new Uint32Array(1))[0]; return `tab-${sorte.toString(36)}`; } } catch { // `crypto` bloqueado: cai no último recurso abaixo. } contadorSemCrypto += 1; return `tab-${Date.now().toString(36)}-${contadorSemCrypto.toString(36)}`;
  ```
- **generateTabId()** — `src/lib/crossTabSendDedupe.ts`
  ```
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') { const sorte = crypto.getRandomValues(new Uint32Array(1))[0]; return `tab-${sorte.toString(36)}`; } } catch { // `crypto` bloqueado: cai no último recurso abaixo. } contadorSemCrypto += 1; return `tab-${Date.now().toString(36)}-${contadorSemCrypto.toString(36)}`;
  ```
- **canPreviewEmailAttachment(mimeType: string | null | undefined)** — `src/lib/emailAttachmentPreview.ts`
  ```
  const normalized = (mimeType || '').toLowerCase(); return isSafeEmailAttachmentImage(normalized) || normalized === 'text/plain' || normalized === 'application/pdf';
  ```
- **validateEmailAttachments(files: File[], additional: EmailAttachmentDescriptor[] = [])** — `src/lib/emailAttachments.ts`
  ```
  if (files.length + additional.length > MAX_EMAIL_ATTACHMENT_COUNT) return `Selecione no máximo ${MAX_EMAIL_ATTACHMENT_COUNT} anexos.`; const total = files.reduce((sum, file) => sum + file.size, 0) + additional.reduce((sum, file) => sum + file.size, 0); if (total > MAX_EMAIL_ATTACHMENT_BYTES) return 'Tamanho total dos anexos excede 25MB'; if ([...files.map(file => file.name), ...additional.map(file => file.name)].some(name => /\r|\n|[\\/"
  ```
- **invalidEmailTokens(value: string)** — `src/lib/emailRecipients.ts`
  ```
  return splitOutsideQuotes(value).filter(token => !extractEmailAddress(token));
  ```
- **engagementScore(stats: ContactStats | null | undefined)** — `src/lib/engagementScore.ts`
  ```
  if (!stats) return null; const totalMessages = stats.totalMessages ?? 0; const totalConversations = stats.totalConversations ?? 0; // Sem histórico de conversa não há o que medir — não inventa pontuação. if (totalMessages <= 0 && totalConversations <= 0) return null; const volumePoints = (Math.min(totalMessages, 200) / 200) * 40; const conversationPoints = Math.min(totalConversations, 10) * 2.5; const responsePoints = responseSpeedPoints(stats.avgResponseTimeMinutes ?? 0); const hasCsat = (stats …
  ```
- **toValidDate(value: Date | string | number | null | undefined)** — `src/lib/formatters.ts`
  ```
  if (value === null || value === undefined) return null; if (typeof value === 'string' && value.trim() === '') return null; const d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? null : d;
  ```
- **generateCorrelationId(prefix = 'req')** — `src/lib/logger.ts`
  ```
  return `${prefix}_${++requestCounter}_${Date.now().toString(36)}`;
  ```
- **shouldLog(level: LogLevel)** — `src/lib/logger.ts`
  ```
  if (!isDev && (level === 'debug' || level === 'info')) { return false; } return true;
  ```
- **applyMediaVolumeGain(element: HTMLMediaElement, gain: number)** — `src/lib/mediaVolumeElement.ts`
  ```
  if (detectNativeVolumeSupport()) { element.volume = gain; return; } const gainNode = getElementGainNode(element); if (gainNode) { gainNode.gain.value = gain; return; } // Sem `AudioContext` disponível (ou antes do primeiro play, no caminho do iOS) não há // como reduzir o volume neste agente: fica no volume do sistema em vez de fingir que // aplicou — o `play` reaplica e a partir daí o ganho entra. element.volume = gain;
  ```
- **applyMediaVolume(element: HTMLMediaElement, gain: number, muted: boolean)** — `src/lib/mediaVolumeElement.ts`
  ```
  applyMediaVolumeGain(element, gain); element.muted = muted;
  ```
- **applyExternalState(payload: unknown)** — `src/lib/mediaVolumeStore.ts`
  ```
  if (!payload || typeof payload !== 'object') return; // A identidade pode ter mudado desde o último evento (login/logout em outra aba). syncIdentity(false); const { userId, volume, muted } = payload as { userId?: unknown; volume?: unknown; muted?: unknown }; // Outra conta no mesmo navegador não manda no meu volume (é o B7 de novo, agora entre abas). if (userId !== currentUserId) return; const patch: Partial<MediaVolumeState> = {}; if (isValidVolume(volume)) patch.volume = volume; if (typeof mut …
  ```
- **shouldRetryQuery(failureCount: number, error: unknown)** — `src/lib/queryRetry.ts`
  ```
  if (isPermanentQueryError(error)) return false; return failureCount < 2;
  ```
- **precisaConverterParaWebp(file: File)** — `src/lib/stickerImage.ts`
  ```
  return ( file.type.startsWith('image/') && file.type !== STICKER_WEBP_TYPE && file.type !== 'image/gif' );
  ```
- **converterFigurinhaParaWebp(file: File)** — `src/lib/stickerImage.ts`
  ```
  if (!precisaConverterParaWebp(file)) return file; // Sem `createImageBitmap` não há decodificação confiável: segue o original. if (typeof createImageBitmap !== 'function') return file; let bitmap: ImageBitmap | null = null; try { bitmap = await createImageBitmap(file); if (!bitmap.width || !bitmap.height) return file; const { width, height } = dimensoesDaFigurinha(bitmap.width, bitmap.height); const blob = await codificarWebp(bitmap, width, height); if (!blob) return file; return new File([blob] …
  ```
- **canCreateTeamConversation({ type, selectedMemberCount, selectedDepartmentId, }: { type: ConversationType; selectedMemberCount: number; selectedDep)** — `src/lib/teamChatRules.ts`
  ```
  if (type === 'department') return selectedDepartmentId !== null; if (type === 'group') return selectedMemberCount >= 2; return selectedMemberCount >= 1;
  ```
- **shouldNotifyTeamMessage({ senderId, profileId, documentHidden, activeConversationId, conversationId, membership, }: { senderId: string; profileI)** — `src/lib/teamChatRules.ts`
  ```
  if (senderId === profileId) return false; if (!documentHidden && activeConversationId === conversationId) return false; return membership !== null && !membership.is_muted;
  ```
- **canTransitionAiJob(from: AiJobStatus, to: AiJobStatus)** — `src/lib/aiJobs/status.ts`
  ```
  const allowed = AI_JOB_TRANSITIONS[from]; if (!Array.isArray(allowed)) return false; return (allowed as readonly AiJobStatus[]).includes(to);
  ```
- **validatePttBlob(blob: Blob, limits: PttLimits = {})** — `src/lib/audio/pttLimits.ts`
  ```
  const maxBytes = limits.maxBytes ?? MAX_PTT_SIZE_BYTES; const maxDuration = limits.maxDurationSec ?? MAX_PTT_DURATION_SEC; const minDuration = limits.minDurationSec ?? MIN_PTT_DURATION_SEC; if (!blob || blob.size === 0) { return { ok: false, message: 'Áudio vazio. Tente gravar novamente.' }; } if (blob.size > maxBytes) { return { ok: false, message: `Áudio muito grande (${formatBytes(blob.size)}). Limite: ${formatBytes(maxBytes)}.`, }; } const durationSec = await probeAudioDuration(blob); if (du …
  ```
- **invalid(state: CallSessionState, event: CallSessionEvent)** — `src/lib/calls/session.ts`
  ```
  console.warn( `${INVALID_TRANSITION_PREFIX}: ${state.status} + ${event.type} (sessionId=${state.sessionId ?? 'null'})`, ); return state;
  ```
- **generateTabId()** — `src/lib/calls/tabLeaderStore.ts`
  ```
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') { return `tab-${secureRandomChars(10, BASE36_MAIUSCULO).toLowerCase()}`; } } catch { // `crypto` bloqueado pelo navegador: cai no ultimo recurso abaixo. } // Ultimo recurso, sem fonte aleatoria nenhuma. Duas abas abertas no mesmo // milissegundo colidiriam — cenario que nao existe em navegador suport …
  ```
- **diaValido(key: string | null | undefined)** — `src/lib/journey/periodRange.ts`
  ```
  const parsed = parseDayKey(key); // `parseDayKey` monta `new Date(ano, mês - 1, dia)` e o JS ROLA 31/02 para 03/03: o dia só vale // se voltar igual ao que foi pedido. if (!parsed || localDayKey(parsed) !== key) return null; return parsed;
  ```
- **round1(value: number)** — `src/lib/journey/stats.ts`
  ```
  return Math.round(value * 10) / 10;
  ```
- **totalsOf(buckets: Buckets)** — `src/lib/journey/stats.ts`
  ```
  let messagesSent = 0; let messagesReceived = 0; for (const item of buckets.messages) { if (item.row.sender === 'agent') messagesSent += 1; else messagesReceived += 1; } let emailsSent = 0; let emailsReceived = 0; for (const item of buckets.emails) { if (item.row.direction === 'outbound') emailsSent += 1; else emailsReceived += 1; } const totals: JourneyTotals = { messages: buckets.messages.length, messagesSent, messagesReceived, emails: buckets.emails.length, emailsSent, emailsReceived, calls: b …
  ```
- **computeTopOffenders(rows: { rpc_name: string | null; table_name: string | null; duration_ms: number }[])** — `src/pages/admin-telemetria/telemetryUtils.tsx`
  ```
  const tableStats = new Map<string, { count: number; totalMs: number; maxMs: number }>(); for (const r of rows) { const key = r.rpc_name || r.table_name || "unknown"; const prev = tableStats.get(key) || { count: 0, totalMs: 0, maxMs: 0 }; tableStats.set(key, { count: prev.count + 1, totalMs: prev.totalMs + r.duration_ms, maxMs: Math.max(prev.maxMs, r.duration_ms), }); } return [...tableStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  ```
- **computeQueueMetrics(counts: QueueMetricCounts, slaSamples: SlaSample[])** — `src/pages/queue-details/queueMetrics.ts`
  ```
  const durations = slaSamples .filter((r) => r.first_message_at && r.first_response_at) .map((r) => new Date(r.first_response_at as string).getTime() - new Date(r.first_message_at as string).getTime()) .filter((ms) => Number.isFinite(ms) && ms >= 0); const avgResponseTime = durations.length ? formatDuration(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : 'Sem dados'; return { totalContacts: counts.totalContacts, assignedContacts: counts.assignedContacts, waitingContacts: Math.max …
  ```
- **applyContactFieldUpdate(ids: string[], payload: ContactUpdate,)** — `src/services/contact-bulk.service.ts`
  ```
  const wanted = [...new Set(ids)]; if (wanted.length === 0) return emptyOutcome(); const { data, error } = await supabase .from('contacts') .update(payload) .in('id', wanted) .select('id'); if (error) { return { succeeded: [], refused: [], failed: wanted.map((id) => ({ id, error })) }; } const changed = new Set((data ?? []).map((row) => row.id)); return { succeeded: wanted.filter((id) => changed.has(id)), refused: wanted.filter((id) => !changed.has(id)), failed: [], };
  ```
- **applyContactTagChange(ids: string[], change: { add?: string[]; remove?: string[] },)** — `src/services/contact-bulk.service.ts`
  ```
  const wanted = [...new Set(ids)]; if (wanted.length === 0) return emptyOutcome(); const { data, error } = await supabase .from('contacts') .select('id, tags') .in('id', wanted); if (error) { return { succeeded: [], refused: [], failed: wanted.map((id) => ({ id, error })) }; } const rows = (data ?? []) as { id: string; tags: string[] | null }[]; const readIds = new Set(rows.map((row) => row.id)); // Invisível no SELECT = recusado pelo RLS (nunca inventamos estado para ele). const refused = wanted …
  ```
- **canAccess(viewId: string, userRoles: AppRole[], userPermissions: string[] = [])** — `src/services/navigation.service.ts`
  ```
  const all = [ ...this.getPrimaryNav(), ...this.getGroups().flatMap(g => g.items), ...this.getAdvancedNav(), ]; const item = all.find(i => i.id === viewId); if (!item) return false; if (item.permission) return userPermissions.includes(item.permission); if (!item.roles) return true; return item.roles.some(role => userRoles.includes(role));
  ```
- **convertAudioToMp3(file: File | Blob, originalName: string)** — `src/utils/audioToMp3.ts`
  ```
  let lamejs: LamejsModule; try { lamejs = await loadLamejs(); } catch (err) { return { ok: false, reason: 'encoder-unavailable', detail: String(err) }; } let arrayBuffer: ArrayBuffer; try { arrayBuffer = await file.arrayBuffer(); } catch (err) { return { ok: false, reason: 'decode-failed', detail: String(err) }; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return { ok: false, reason: 'encoder-unavailable', detail: 'AudioContext indisponível' }; const audioCtx = new AC() …
  ```
- **calculateDimensions(width: number, height: number, maxWidth: number, maxHeight: number)** — `src/utils/imageCompression.ts`
  ```
  width: number; height: number
  ```
- **validateFile(file: File)** — `src/utils/whatsappFileTypes.ts`
  ```
  const mimeType = file.type.toLowerCase(); const extension = '.' + getFileExtensionWithDefault(file.name, ''); const fileSizeMB = file.size / (1024 * 1024); // Find matching file type config for (const [key, config] of Object.entries(WHATSAPP_FILE_TYPES)) { const matchesMime = config.mimeTypes.includes(mimeType); const matchesExt = config.extensions.includes(extension); if (matchesMime || matchesExt) { if (fileSizeMB > config.maxSizeMB) { return { valid: false, error: `Arquivo muito grande. O lim …
  ```
- **validateFileContent(file: File)** — `src/utils/whatsappFileTypes.ts`
  ```
  const head = await readFileHead(file, 16); const signature = detectFileSignature(head); if (!signature) return { valid: true }; const declared = getFileCategory(file.type) ?? categoryFromFileName(file.name); if (!declared || signature.categories.includes(declared)) { return { valid: true, category: declared ?? undefined }; } const declaredLabel = file.type || ('.' + getFileExtensionWithDefault(file.name, '')); return { valid: false, category: declared, error: `Arquivo recusado: o conteúdo não co …
  ```
- **applyVocabularyConversion(target: Record<string, unknown>, field: string, match: { value: string | null }, conversions: Array<{ field: string; fro)** — `supabase/functions/_shared/ai-conversation-pipeline.ts`
  ```
  if (!match.value || match.value === target[field]) return; conversions.push({ field, from: target[field], to: match.value }); target[field] = match.value;
  ```
- **generateWithRouting(params: GenerateParams)** — `supabase/functions/_shared/ai-generate.ts`
  ```
  const startedAt = Date.now(); // --- (10) validação: só isto lança ------------------------------------------ const functionName = requireText(params?.functionName, "functionName"); // Não-string é erro de programação; string desconhecida segue para `resolveProvider`, // que devolve BAD_PURPOSE como `ok:false` (400) — nunca um lançamento para o chamador. const purpose = requireText(params?.purpose, "purpose") as AiPurpose; const messages = params?.messages; if (!Array.isArray(messages)) { throw …
  ```
- **canTransitionAiJob(from: AiJobStatus, to: AiJobStatus)** — `supabase/functions/_shared/ai-jobs.ts`
  ```
  const allowed = AI_JOB_TRANSITIONS[from]; if (!Array.isArray(allowed)) return false; return (allowed as readonly AiJobStatus[]).includes(to);
  ```
- **cancel(motivo)** — `supabase/functions/_shared/ai-providers.ts`
  ```
  desarmar(); try { await leitor.cancel(motivo); } catch { /* já encerrado */ }
  ```
- **calcularCusto(tarifas: TarifaDeModelo[], consulta: { model: string; unit: UnidadeCobravel; em: string | Date; quantidade: number },)** — `supabase/functions/_shared/ai-usage.ts`
  ```
  if (!Number.isFinite(consulta.quantidade) || consulta.quantidade < 0) { return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "quantidade_invalida" }; } const tarifa = tarifaAplicavel(tarifas, consulta); if (tarifa === null) { return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "sem_tarifa_vigente" }; } if (!Number.isFinite(tarifa.unitPrice) || tarifa.unitPrice < 0) { return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "tarifa_invalida" }; } // …
  ```
- **cancel(motivo)** — `supabase/functions/_shared/ai-usage.ts`
  ```
  try { await leitor.cancel(motivo); } catch { // Cancelar um stream já encerrado não é falha para quem cancela. } await encerrar({ cancelled: true });
  ```
- **normalizeScore(raw: unknown, opts: NormalizeScoreOptions)** — `supabase/functions/_shared/ai-values.ts`
  ```
  if (isAbsent(raw)) return { value: null, issue: 'absent' }; if (typeof raw !== 'number' || !Number.isFinite(raw)) return { value: null, issue: 'not_a_number' }; const v = raw; if (opts.scale === 'ratio') { if (v > 1 && v <= 100) return { value: null, issue: 'wrong_scale' }; // veio em percentual if (v < 0 || v > 1) return { value: null, issue: 'out_of_range' }; return { value: v, issue: null }; } // percent / integer: fração entre 0 e 1 é escala trocada (0,7 → 70%) if (v > 0 && v < 1) return { v …
  ```
- **aggregateScores(values: Array<number | null | undefined>)** — `supabase/functions/_shared/ai-values.ts`
  ```
  const valid: number[] = []; let discarded = 0; for (const raw of values) { if (typeof raw === 'number' && Number.isFinite(raw)) valid.push(raw); else discarded += 1; } if (valid.length === 0) return { average: null, sampleSize: 0, discarded }; const sum = valid.reduce((acc, n) => acc + n, 0); return { average: Math.round((sum / valid.length) * 100) / 100, sampleSize: valid.length, discarded, };
  ```
- **validIdentifier(value: unknown)** — `supabase/functions/_shared/crm-integration-contract.ts`
  ```
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value);
  ```
- **validateMutation(table: unknown, action: unknown, data: unknown, match: unknown)** — `supabase/functions/_shared/crm-integration-contract.ts`
  ```
  if (action !== 'insert' && action !== 'update') return 'Mutation action is not allowed'; if (typeof table !== 'string' || !MUTABLE_FIELDS[table]) return 'Table is not mutable'; if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Mutation data is invalid'; const fields = Object.keys(data as Record<string, unknown>); if (fields.length === 0 || fields.some((field) => !MUTABLE_FIELDS[table].has(field))) return 'Mutation field is not allowed'; const values = Object.values(data as Re …
  ```
- **validateRpc(rpc: unknown, params: unknown)** — `supabase/functions/_shared/crm-integration-contract.ts`
  ```
  if (typeof rpc !== 'string' || !CRM_RPC_ALLOWLIST.has(rpc)) return 'RPC is not allowed'; if (!params || typeof params !== 'object' || Array.isArray(params)) return 'RPC params are invalid'; const p = params as Record<string, unknown>; const allowedParams: Record<string, ReadonlySet<string>> = { get_companies_by_phones_batch: new Set(['p_phones']), get_contact_360_by_phone: new Set(['p_phone']), get_contact_intelligence_by_phone: new Set(['p_phone']), get_contact_sidebar_by_phone: new Set(['p_pho …
  ```
- **cbIsOpen(key: string)** — `supabase/functions/_shared/evolution-api-proxy.ts`
  ```
  const state = cbState.get(key); if (!state) return false; if (Date.now() < state.openUntil) return true; if (state.openUntil > 0) { state.openUntil = 0; state.failures = 0; } return false;
  ```
- **shouldUpdateStatus(currentStatus: string | null, newStatus: string)** — `supabase/functions/_shared/evolution-helpers.ts`
  ```
  if (!currentStatus) return true; if (newStatus === 'deleted' || newStatus === 'failed') return true; const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0; const newPriority = STATUS_PRIORITY[newStatus] ?? 0; return newPriority > currentPriority;
  ```
- **invalidateConnectionCache(instance?: string)** — `supabase/functions/_shared/evolution-helpers.ts`
  ```
  if (instance) { connectionCache.delete(instance); } else { connectionCache.clear(); }
  ```
- **generatePhoneVariants(phone: string)** — `supabase/functions/_shared/evolution-helpers.ts`
  ```
  const clean = phone.replace(/\D/g, '').replace(/^\+/, ''); const variants = new Set<string>([clean, `+${clean}`, phone]); // Brazilian number handling (country code 55) if (clean.startsWith('55') && clean.length >= 12) { const ddd = clean.substring(2, 4); const rest = clean.substring(4); // If has 9th digit (9 digits after DDD = total 13 with country code) if (clean.length === 13 && rest.startsWith('9')) { // Add variant WITHOUT 9th digit const without9 = `55${ddd}${rest.substring(1)}`; variants …
  ```
- **validContact(s)** — `supabase/functions/_shared/evolution-sync-actions.ts`
  ```
  phone: string; name: string; avatar_url: string | null; whatsapp_connection_id: string
  ```
- **ensureValidToken(supabase: SupabaseClient, account: GmailAccountForToken, log: Logger, onUpdatedAt?: (updatedAt: string)** — `supabase/functions/_shared/gmail-helpers.ts`
  ```
  void,
  ```
- **validateRequest(req: Request)** — `supabase/functions/_shared/hmac-validation.ts`
  ```
  valid: boolean; payload: string | null; error?: string; signatureFound: boolean; signatureValid: boolean;
  ```
- **isSinguEligibility(token: string)** — `supabase/functions/_shared/multiplix-eligibility.ts`
  ```
  return Object.prototype.hasOwnProperty.call(SINGU_TO_ZAPP, token);
  ```
- **shouldNotifyIncomingCall(value: unknown)** — `supabase/functions/_shared/notification-events.ts`
  ```
  if (typeof value !== 'string') return false; const status = value.trim().toLowerCase(); return status === 'offer' || status === 'ringing';
  ```
- **revalidateContextBeforeEffect(input: { expectedContactId: string; declaredVersion?: string | null; versionAtRequestStart?: string | null; reloadVisibl)** — `supabase/functions/_shared/schemas.ts`
  ```
  Promise<string | null>;
  ```
- **validationErrorResponse(source: { issues?: FieldError[]; error?: string } | z.ZodError | FieldError[], req?: Request, contractVersion: 1 | 2 = 1)** — `supabase/functions/_shared/schemas.ts`
  ```
  let fields: FieldError[]; if (Array.isArray(source)) fields = source; else if (source instanceof z.ZodError) fields = toFieldErrors(source); else fields = source.issues ?? (source.error ? [{ path: '(root)', message: source.error, code: 'custom' }] : []); return new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Payload inválido: um ou mais campos falharam na validação.', fields, }, }), { status: 422, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Ori …
  ```
- **validProxyEndpoint(value: string)** — `supabase/functions/_shared/secure-egress.ts`
  ```
  try { const endpoint = new URL(value); if ( endpoint.protocol !== "https:" || endpoint.username !== "" || endpoint.password !== "" || endpoint.port !== "" ) { return null; } return endpoint.toString(); } catch { return null; }
  ```
- **validateStsUpload(file: File, maxBytes: number = MAX_STS_AUDIO_BYTES,)** — `supabase/functions/_shared/sts-upload.ts`
  ```
  if (file.size === 0) { return { status: 400, error: "Arquivo de áudio vazio" }; } if (file.size > maxBytes) { return { status: 413, error: `Arquivo de áudio grande demais (máximo ${maxBytes} bytes)`, }; } if (!sniffStsAudioFormat(await readHead(file))) { return { status: 415, error: "Conteúdo não é um áudio reconhecido" }; } return null;
  ```
- **computeTag(cipher: Uint8Array, secret: string)** — `supabase/functions/_shared/talkx-tracking-token.ts`
  ```
  const key = await crypto.subtle.importKey( "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"], ); const domain = new TextEncoder().encode(MAC_DOMAIN); const data = new Uint8Array(domain.length + cipher.length); data.set(domain, 0); data.set(cipher, domain.length); const mac = await crypto.subtle.sign("HMAC", key, data); return new Uint8Array(mac).slice(0, 8);
  ```
- **invalidBusinessHours(reason: string)** — `supabase/functions/_shared/talkx-window.ts`
  ```
  return { invalid: true, invalidReason: reason };
  ```
- **invalidDnd(reason: string)** — `supabase/functions/_shared/talkx-window.ts`
  ```
  return { start: "", end: "", sundays: false, holidays: [], invalid: true, invalidReason: reason };
  ```
- **eligibility(recipient: EligibilityRecipient | null | undefined, ctx?: EligibilityContext | null,)** — `supabase/functions/_shared/messaging/eligibility.ts`
  ```
  const context = ctx ?? {}; const destination = typeof recipient?.destination === "string" ? recipient.destination.trim() : ""; // 1) Sem destino (ou marcado inválido): nada mais é avaliável. if (destination === "") { return { class: "no_destination", reason: "missing_destination" }; } if (context.destinationValid === false) { return { class: "no_destination", reason: "invalid_destination" }; } // 2) Opt-out (talkx_blacklist) — bloqueio duro, domina o transitório. if (isBlacklisted(destination, c …
  ```
- **validExternalId(value: unknown)** — `supabase/functions/crm-integration/index.ts`
  ```
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
  ```
- **canManageEmailContactLink()** — `supabase/functions/crm-integration/index.ts`
  ```
  return userHasPermission('crm.email_contact_link.manage');
  ```
- **validIdentifier(value: unknown)** — `supabase/functions/external-db-proxy/index.ts`
  ```
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value)
  ```
- **applyExclusions(set: AudienceIdSet, exclude: AudienceIdSet)** — `supabase/functions/multiplix-dispatch/actions/audience.ts`
  ```
  const excludedCompanies = new Set(exclude.company_ids); const excludedContacts = new Set(exclude.contact_ids); return idSet( set.company_ids.filter((id) => !excludedCompanies.has(id)), set.contact_ids.filter((id) => !excludedContacts.has(id)), );
  ```
- **validateBlock(block: BlockRow, recipient: RecipientRow | null, timezone: string,)** — `supabase/functions/multiplix-dispatch/actions/inspect.ts`
  ```
  const type: BlockType = isBlockType(block.block_type) ? block.block_type : 'text'; const sharedAudio = isSharedAudio(block); const company = sharedAudio ? null : (asString(recipient?.company_name_snapshot) ?? null); const variables = sharedAudio ? {} : variablesOf(recipient); const isVoice = type === 'voice_ai' || type === 'audio_recorded'; const templates: string[] = []; if (isVoice) { const script = type === 'voice_ai' ? voiceScriptOf(block) : null; if (script) templates.push(script); } else { …
  ```
- **handleEligibilitySummary(ctx: ActionContext)** — `supabase/functions/multiplix-dispatch/actions/inspect.ts`
  ```
  const parsed = SummarySchema.safeParse(ctx.payload); if (!parsed.success) { return errorResponse('eligibility.summary: dispatch_id obrigatorio (uuid)', 400, ctx.req); } const { dispatch_id, audience } = parsed.data; await loadOwnedDispatch(ctx, dispatch_id); const recipients = await loadRecipientsOrNamedError(ctx, dispatch_id); if (recipients instanceof Response) return recipients; const summary = summarize(recipients, audience); // Invariante do F49: os numeros TEM de somar o total. Se nao soma …
  ```
- **canManageDispatch(createdBy: string | null)** — `supabase/functions/multiplix-send/index.ts`
  ```
  if (!authUserId) return true; if (hasManageAll) return true; const profileId = await authProfile(); return Boolean(profileId && createdBy && profileId === createdBy);
  ```
- **canRecoverAsset(asset: VoiceAssetRow, grants: VoiceGrantRow[], caller: CallerContext,)** — `supabase/functions/multiplix-voices/index.ts`
  ```
  if (asset.invalidated_at) return false; if (caller.isStaff) return true; if (asset.created_by !== null && caller.profileId !== null && asset.created_by === caller.profileId) { return true; } return grants.some((grant) => grant.voice_id === asset.voice_id && grantReachesCaller(grant, caller));
  ```
- **calculateNextSend(frequency: string)** — `supabase/functions/send-scheduled-report/index.ts`
  ```
  const next = new Date(); switch (frequency) { case "daily": next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break; case "weekly": next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break; case "monthly": next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break; } return next.toISOString();
  ```
- **validarEntrada(kind: TalkxAiKind, input: unknown)** — `supabase/functions/talkx-ai/index.ts`
  ```
  if (!input || typeof input !== "object" || Array.isArray(input)) { return { ok: false, reason: "invalid_input" }; } const entrada = input as Record<string, unknown>; if (kind === "insight_text") { const regra = entrada.regra; if (!regra || typeof regra !== "object" || Array.isArray(regra)) { return { ok: false, reason: "invalid_input" }; } return { ok: true, kind, regra }; } const campo = kind === "message_variation" ? entrada.texto : entrada.pedido; if (typeof campo !== "string" || campo.trim() …
  ```
- **validarSaida(kind: TalkxAiKind, entrada: EntradaValida & { ok: true }, saida: string)** — `supabase/functions/talkx-ai/index.ts`
  ```
  if (kind === "message_variation" && entrada.kind === "message_variation") { const esperadas = [...new Set([...entrada.texto.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]))]; const faltando = esperadas.filter((variavel) => !saida.includes(variavel)); if (faltando.length > 0) return { ok: false, reason: "missing_variable", variaveis: faltando }; return { ok: true, output: saida }; } if (kind === "segment_suggestion") { try { const objeto: unknown = JSON.parse(saida); if (!objeto || typeof objeto != …
  ```
- **generateChallenge()** — `supabase/functions/webauthn/index.ts`
  ```
  const array = new Uint8Array(32); crypto.getRandomValues(array); return base64URLEncode(array.buffer);
  ```

### G.4 Percentuais e multiplicadores no código

| Trecho | Arquivo |
|---|---|
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `playwright.config.ts` |
| `// Skip gzip size reporting to speed up production builds by ~15-25%.` | `vite.config.ts` |
| `// mapboxLoader.ts: era 0% (os testes de UI mockam o módulo inteiro); 100% com` | `vitest.config.ts` |
| `// que não têm teste e entram a 0% na rodada completa.` | `vitest.config.ts` |
| `transition={{ duration: 0.3, delay: index * 0.1 }}` | `src/components/agents/AgentsView.tsx` |
| `{...enter(reduceMotion ? 0 : 0.9 + index * 0.1)}` | `src/components/auth/HeroBenefits.tsx` |
| `transition={{ delay: index * 0.05 }}` | `src/components/auth/PasswordStrengthMeter.tsx` |
| `delay: reduzirMovimento ? 0 : 0.9 + index * 0.1,` | `src/components/auth/SocialProof.tsx` |
| `* O toque soa em `soundVolume/100 * RING_GAIN_CAP` — no MÁXIMO 20 % de ganho, bem` | `src/components/calls/IncomingCallAlert.tsx` |
| `* `0.15` passou a acompanhar `settings.soundVolume` — `soundVolume/100 * 0.2`. Nem o` | `src/components/calls/IncomingCallAlert.tsx` |
| `// fica como segunda camada (idempotente, sem custo real: já bate 100% com` | `src/components/catalog/ExternalProductManagement.tsx` |
| `transition={{ delay: hour.day_of_week * 0.05 }}` | `src/components/connections/BusinessHoursDialog.tsx` |
| `transition={{ delay: index * 0.04 }}` | `src/components/contacts/ContactActivityTimeline.tsx` |
| `transition={{ delay: i * 0.03, duration: 0.4 }}` | `src/components/contacts/ContactAnalyticsDashboard.tsx` |
| `transition={{ delay: i * 0.05 + 0.2, duration: 0.5 }}` | `src/components/contacts/ContactAnalyticsDashboard.tsx` |
| `transition={{ delay: i * 0.05 }}` | `src/components/contacts/ContactAnalyticsDashboard.tsx` |
| `transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}` | `src/components/contacts/ContactContentArea.tsx` |
| `transition={{ delay: gi * 0.03 }}` | `src/components/contacts/ContactGroupedList.tsx` |
| `transition={{ delay: colIndex * 0.08 }}` | `src/components/contacts/ContactKanbanView.tsx` |
| `transition={{ delay: i * 0.04 + 0.2, duration: 0.5 }}` | `src/components/contacts/ContactMapView.tsx` |
| `transition={{ delay: i * 0.04 }}` | `src/components/contacts/ContactMapView.tsx` |
| `transition={{ delay: i * 0.03 }}` | `src/components/contacts/ContactNotes.tsx` |
| `transition={{ delay: index * 0.015 }}` | `src/components/contacts/ContactsTable.tsx` |
| `// Média ausente é "sem dado" (—), nunca 0% nem 50% (IA-023); 0 continua 0%.` | `src/components/dashboard/AIStatsWidget.tsx` |
| `// Proporcional: 180s de meta com 360s medidos = 50% do caminho andado.` | `src/components/dashboard/DashboardWidgetRenderer.tsx` |
| `transition={{ delay: 0.1 + i * 0.05 }}` | `src/components/dashboard/DashboardWidgetRenderer.tsx` |
| `transition={{ duration: 1, delay: 0.2 + i * 0.1 }}` | `src/components/dashboard/DashboardWidgetRenderer.tsx` |
| `A área sombreada indica o intervalo de confiança de 95%.` | `src/components/dashboard/DemandPrediction.tsx` |
| `/** Teto das metas percentuais (taxa de resolução): 0% a 100%. */` | `src/components/dashboard/GoalsConfigDialog.tsx` |
| `// Nunca 100% sem amostra: sem 1ª resposta avaliada a taxa não existe (o hook expõe `hasSample`).` | `src/components/dashboard/SLAMetricsDashboard.tsx` |
| `transition={{ delay: index * 0.1 }}` | `src/components/dashboard/SatisfactionAgentRanking.tsx` |
| `// 10% de falha sobre os envios do agente nas últimas 24h.` | `src/components/dashboard/systemHealth.ts` |
| `const score = Math.round((CONNECTIONS_MAX * (healthy + degraded * 0.5)) / total);` | `src/components/dashboard/systemHealth.ts` |
| `/** Pill de status/tipo dos mockups: h-6 rounded-full text-12 font-semibold, fundo 15% + texto na cor. */` | `src/components/dashboard/overview/DashboardCard.tsx` |
| `transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}` | `src/components/dashboard/overview/DashboardCard.tsx` |
| `/** Classe extra no valor — ex.: cor por faixa (SLA 32% vermelho). */` | `src/components/dashboard/overview/DashboardKpiCard.tsx` |
| `transition={reducedMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(i, 12) * 0.02 }}` | `src/components/dashboard/overview/DashboardKpiCard.tsx` |
| `transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}` | `src/components/dashboard/overview/DashboardKpiCard.tsx` |
| `/** `false` quando o período não tem nenhuma 1ª resposta avaliada: a taxa não existe (nunca 0%/100% sem amostra). */` | `src/components/dashboard/sla/SLASummaryCard.tsx` |
| `// Sem amostra não há taxa: o número vira travessão e a barra some — nada de 0% pintado de crítico.` | `src/components/dashboard/sla/SLASummaryCard.tsx` |
| `delay: i * 0.4,` | `src/components/effects/AuroraBorealis.tsx` |
| `delay: 0.3 + i * 0.05,` | `src/components/effects/Confetti.tsx` |
| `0% { filter: hue-rotate(0deg); }` | `src/components/effects/EasterEggs.tsx` |
| `0%, 100% { filter: brightness(1); }` | `src/components/effects/EasterEggs.tsx` |
| `100% { filter: hue-rotate(360deg); }` | `src/components/effects/EasterEggs.tsx` |
| `50% { filter: brightness(1.3) saturate(1.5); }` | `src/components/effects/EasterEggs.tsx` |
| `delay: i * 0.2,` | `src/components/effects/EasterEggs.tsx` |
| `<Particle key={i} delay={i * 0.05} config={config} />` | `src/components/gamification/AchievementToast.tsx` |
| `// Nota ausente/inválida fica `null` — a UI omite em vez de mostrar 50% (IA-023).` | `src/components/inbox/AIConversationAssistant.tsx` |
| `transition={{ delay: index * 0.1 }}` | `src/components/inbox/AISuggestions.tsx` |
| `transition={{ duration: 0.5, repeat: isPlaying && isActive ? Infinity : 0, delay: i * 0.02 }}` | `src/components/inbox/AudioMessagePlayer.tsx` |
| `delay: i * 0.02,` | `src/components/inbox/AudioRecorder.tsx` |
| `* No celular o painel ocupa 100% da largura do sheet (`w-full` na raiz de` | `src/components/inbox/ContactDetailsResponsive.tsx` |
| `transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}` | `src/components/inbox/ConversationListSidebar.tsx` |
| `transition={{ delay: index * 0.05 }}` | `src/components/inbox/InteractiveMessage.tsx` |
| `transition={{ delay: rowIndex * 0.03 }}` | `src/components/inbox/InteractiveMessage.tsx` |
| `transition={{ delay: prefersReducedMotion ? 0 : idx * 0.1 }}` | `src/components/inbox/NextBestActionEngine.tsx` |
| `delay: i * 0.12,` | `src/components/inbox/TypingIndicator.tsx` |
| `transition={reduceMotion ? { duration: 0 } : { duration: 0.8, repeat: Infinity, delay: i * 0.2 }}` | `src/components/inbox/TypingIndicator.tsx` |
| `delay: i * 0.05,` | `src/components/inbox/chat/MessageBubbleUnsupported.tsx` |
| `const isNearLimit = charCount > CHAR_LIMIT * 0.9;` | `src/components/inbox/chat/useChatInputLogic.ts` |
| `/** Fundo tonal suave — 15% do token, para o realce não virar bloco de cor. */` | `src/components/inbox/chat/motion/tone.ts` |
| `// 35% (mesmo tom/saturação) só neste hover, sem tocar o token` | `src/components/inbox/contact-details/ContactActionButtons.tsx` |
| `// (auditoria 2026-09-26: 22% vs 46% dos nomes comuns testados), então um` | `src/components/inbox/contact-details/ContactHeaderSection.tsx` |
| `// --destructive 0 84% 60% → ~3.6:1. Ajuste só no badge, sem tocar tokens globais.` | `src/components/inbox/contact-details/ContactHeaderSection.tsx` |
| `// Os tokens brutos falham: --warning 38 92% 50% → ~2.1:1; --success 160 70% 42% → ~3.8:1;` | `src/components/inbox/contact-details/ContactHeaderSection.tsx` |
| `o vídeo/áudio abria em 100% do sistema e sem listener de `play`/`loadedmetadata`. */}` | `src/components/inbox/media-gallery/MediaPreviewDialog.tsx` |
| `{/* V01: janela do arquivo 40% mais estreita (896 -> 538px) e 20% mais baixa (80vh -> 64vh).` | `src/components/inbox/media-gallery/MediaPreviewDialog.tsx` |
| `transition={{ delay: index * 0.02 }}` | `src/components/inbox/search/GlobalSearchResults.tsx` |
| `transition={{ delay: idx * 0.05, duration: 0.2 }}` | `src/components/inbox/tabs/ContactStatsStrip.tsx` |
| `transition={{ delay: index * 0.1 }}` | `src/components/keyboard/KeyboardShortcutsDialog.tsx` |
| `delay: secureRandomFloat() * 0.5, duration: 1 + secureRandomFloat() * 0.5, size: 4 + secureRandomFloat() * 8,` | `src/components/leaderboard/LeaderboardHelpers.tsx` |
| `transition: { delay: i * 0.02, duration: 0.2, ease: 'easeOut' as const },` | `src/components/mobile/MobileDrawerMenu.tsx` |
| `transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}` | `src/components/mobile/MobileFAB.tsx` |
| `// R2-INF-027: sem checks na janela não há uptime a aprovar — "dado insuficiente", nunca 100%.` | `src/components/monitoring/MonitoringIncidents.tsx` |
| `transition={{ delay: i * 0.05 }}` | `src/components/monitoring/MonitoringSLAPanel.tsx` |
| `// R2-INF-027: sem checks na janela não há uptime a exibir — neutro, nunca 100%.` | `src/components/monitoring/MonitoringStatsCards.tsx` |
| `transition={{ delay: i * 0.05, duration: 0.25 }}` | `src/components/monitoring/MonitoringStatsCards.tsx` |
| `/** Uptime de 24 h por conexão, derivado do histórico. Não fabrica 100%. */` | `src/components/monitoring/hooks/useConnectionIncidents.ts` |
| `// Sem checks na janela não há SLA a aprovar: dado insuficiente (null), nunca 100%.` | `src/components/monitoring/hooks/useMonitoringData.ts` |
| `// pulados nunca chega a 100% e "Restantes" fica preso contando quem ja foi` | `src/components/multiplix/MultiplixMonitor.tsx` |
| `transition={{ delay: index * 0.05 }}` | `src/components/omnichannel/OmnichannelManager.tsx` |
| `delay: i * 0.3,` | `src/components/onboarding/WelcomeModal.tsx` |
| `duration: 3 + i * 0.5,` | `src/components/onboarding/WelcomeModal.tsx` |
| `transition={{ delay: 0.5 + index * 0.1 }}` | `src/components/onboarding/WelcomeModal.tsx` |
| `transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}` | `src/components/performance/LazyRoutes.tsx` |
| `transition={{ delay: colIndex * 0.05 }}` | `src/components/performance/VirtualizedList.tsx` |
| `transition={{ duration: 0.2, delay: index * 0.05 }}` | `src/components/queues/QueueAlertsDisplay.tsx` |
| `/** Sem conversa avaliada não existe taxa: o número vira travessão e a tinta, neutra (nada de 0% vermelho). */` | `src/components/queues/SLAMetricCards.tsx` |
| `const variance = Math.round(avgForDay * 0.15);` | `src/components/reports/DemandForecast.tsx` |
| `// Nunca inventa +100% nem 0 falso.` | `src/components/reports/PeriodComparison.tsx` |
| `transition={{ delay: index * 0.05 }}` | `src/components/schedule/ScheduleCalendarView.tsx` |
| `// A escala visual é do teto medido (maxScore), não de 100: 75/75 é 100%.` | `src/components/security/SecurityOverview.tsx` |
| `transition={{ delay: index * 0.1 }}` | `src/components/security/SecuritySettingsPanel.tsx` |
| `transition={{ delay: index * 0.05, duration: 0.2 }}` | `src/components/settings/SLAConfigurationManager.tsx` |
| `<motion.div key={preset.id} initial={motionInitial} animate="visible" variants={fadeUp} custom={2.5 + i * 0.05}>` | `src/components/settings/ThemeCustomizer.tsx` |
| `transition={{ delay: index * 0.05, duration: 0.3 }}` | `src/components/settings/ai-providers/AIProviderCard.tsx` |
| `transition={{ delay: i * 0.05 }}` | `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` |
| `transition={{ delay: index * 0.05, duration: 0.2 }}` | `src/components/settings/sla/SLARuleRow.tsx` |
| `transition={{ delay: i * 0.03 }}` | `src/components/settings/theme/PresetCard.tsx` |
| `* fórmula do foreground — é imperceptível a 4-7% de opacidade e não` | `src/components/settings/theme/presets.ts` |
| `// Sem 1ª resposta avaliada a taxa não existe: nada de 0%/100% no resumo nem nos gráficos.` | `src/components/sla/SLAHistoryDashboard.tsx` |
| `return <Cell key={entry.name} fill={`hsl(var(--primary) / ${0.3 + intensity * 0.7})`} />;` | `src/components/talkx/TalkXAnalytics.tsx` |
| `return `hsl(var(--primary) / ${(0.12 + intensity * 0.8).toFixed(2)})`;` | `src/components/talkx/report/talkxReportCharts.ts` |
| `* Barra + percentual do público. Verde quando o segmento está 100% processado.` | `src/components/talkx/tracking/TalkXSegmentProgressTable.tsx` |
| `* Percentual inteiro do público. Trunca (não arredonda): 398 de 400 é 99%, não 100%.` | `src/components/talkx/tracking/talkxSegmentProgress.ts` |
| `/** Barra verde: público 100% processado. */` | `src/components/talkx/tracking/talkxSegmentProgress.ts` |
| `transition={{ duration: reduceMotion ? 0 : 0.15, delay: reduceMotion ? 0 : Math.min(index, 12) * 0.02 }}` | `src/components/tasks/list/TasksListMode.tsx` |
| `// Etapa 146: o "expandir" do cabeçalho alarga o painel (≈70% da janela) e a` | `src/components/tasks/shared/WorkItemSheet.tsx` |
| `* Etapa 146: expandido ≈ 70% da largura da janela (descrição ampla); recolhido` | `src/components/tasks/shared/sheet/painel.ts` |
| `transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}` | `src/components/team-chat/TeamConversationList.tsx` |
| `// E34 — era um `autoPlay` a 100% do sistema (o pior caso de susto em open space):` | `src/components/transcriptions/TranscriptionContactGroup.tsx` |
| `* `VolumeDial` (dial circular, padrão slider-08) no lugar do slider vertical, ficou ~30%` | `src/components/ui/VolumeSliderPopoverContent.tsx` |
| `transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}` | `src/components/ui/micro-interactions/feedback.tsx` |
| `const envelope = 1 - distFromCenter * 0.6;` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `const randomFactor = 0.3 + secureRandomFloat() * 0.7;` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `const lineAlpha = (1 - dist / 120) * 0.12;` | `src/components/voice/FloatingParticles.tsx` |
| `0 0 ${size * 0.15}px ${colors.glow1},` | `src/components/voice/VoiceOrb.tsx` |
| `0 0 ${size * 0.3}px ${colors.glow2},` | `src/components/voice/VoiceOrb.tsx` |
| `const coreSize = size * 0.325;` | `src/components/voice/VoiceOrb.tsx` |
| `const highlightSize = size * 0.16;` | `src/components/voice/VoiceOrb.tsx` |
| `inset 0 0 ${size * 0.1}px rgba(255,255,255,0.1)` | `src/components/voice/VoiceOrb.tsx` |
| `transition={{ duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}` | `src/components/voice/VoiceOrb.tsx` |
| `transition={{ delay: prefersReduced ? 0 : i * 0.06 }}` | `src/components/voice/VoiceSuggestions.tsx` |
| `// 0/0 não é 0%: sem atendimento no período não há taxa. Marca a` | `src/hooks/analytics/useGoalNotifications.ts` |
| `* (50/75/100 % do limite para "quanto menor melhor"; 25/50/75 % do mínimo para a taxa de` | `src/hooks/analytics/useQueueGoalAlerts.ts` |
| `// Marca TODAS as faixas já cruzadas: um salto de 40 % para 100 % anuncia só a faixa mais` | `src/hooks/analytics/useQueueGoalAlerts.ts` |
| `/** % do dia sobre o total real do dia (pode somar menos de 100% por causa dos unknowns). */` | `src/hooks/analytics/useSentimentTrend.ts` |
| `const variance = Math.max(2, Math.round(predicted * 0.2)) + i;` | `src/hooks/business/useDemandPrediction.ts` |
| `* SUBIR para 50/75/100 % do limite. `min` = quanto MAIOR melhor (taxa de atribuição): a faixa é` | `src/hooks/business/useQueueGoals.ts` |
| `* cruzada ao CAIR para 25/50/75 % do mínimo — as faixas invertidas do cartão.` | `src/hooks/business/useQueueGoals.ts` |
| `/** Faixas do cartão: quem sobe cruza 50/75/100 % do limite; quem cai cruza 25/50/75 % do mínimo. */` | `src/hooks/business/useQueueGoals.ts` |
| `const isNearLimit = charCount > CHAR_LIMIT * 0.9;` | `src/hooks/chat/useTeamChatDraft.ts` |
| `osc.start(now + i * 0.05); // Slight stagger for richness` | `src/hooks/chat/useTeamChatNotifications.ts` |
| `* o novo a 100%. Rodar a cada commit também reaplica depois de qualquer mudança do` | `src/hooks/communication/useMediaElementVolume.ts` |
| `const score = Math.max(0, 1 - flags.length * 0.2);` | `src/hooks/copilot/useAiJudge.ts` |
| `if (/garantimos\|100%/i.test(suggestionText)) flags.push('Evitar garantias absolutas');` | `src/hooks/copilot/useAiJudge.ts` |
| `const score = Math.min(hits * 0.25, 1);` | `src/hooks/copilot/useAttachmentSuggestion.ts` |
| `const confidence = bestHits === 0 ? 0.5 : Math.min(bestHits * 0.3, 1);` | `src/hooks/copilot/useAudioTone.ts` |
| `return { flags, hasIssues: flags.length > 0, riskScore: Math.min(flags.length * 0.25, 1) };` | `src/hooks/copilot/useBiasChecker.ts` |
| `.map((t) => ({ type: t.type, description: t.description, actionSuggestion: t.action, relevance: Math.min(t.patterns.filter((p) => p.test(lower)).length * 0.4, 1 …` | `src/hooks/copilot/useLearningMoment.ts` |
| `* (IA-SENTIMENT-001), então a soma dos baldes pode ficar abaixo de 100%.` | `src/hooks/dashboard/useSentimentTrend.ts` |
| `* vazio seria um 0% inventado, que o gráfico mostraria como "nada positivo"` | `src/hooks/dashboard/useSentimentTrend.ts` |
| `// Nota ausente ou inválida fica `null` — nunca 0%, que afirmaria um` | `src/hooks/inbox/useRealtimeSentimentAlerts.ts` |
| `* histórico 90%, sem nenhuma mudança no dado. A regra passa a viver aqui, num lugar só:` | `src/hooks/sla/slaFirstResponse.ts` |
| `* prazo". Com dez registros — um respondido fora do prazo e nove pendentes — o painel dizia 0% e o` | `src/hooks/sla/slaFirstResponse.ts` |
| `* Se omitido, o alerta dispara quando restam 30% do prazo, com pelo menos` | `src/hooks/sla/useSLACalculation.ts` |
| `* restam 30% do prazo, com pelo menos 1 minuto de antecedencia.` | `src/hooks/sla/useSLACalculation.ts` |
| `/** Agenda o aviso de risco para o instante em que a linha cruza 70% do prazo. */` | `src/hooks/sla/useSLANotifications.ts` |
| `/** Avisos de risco agendados: id da linha de SLA → timer do limiar (70% do prazo). */` | `src/hooks/sla/useSLANotifications.ts` |
| `setPullDistance(Math.min(delta * 0.5, threshold * 1.5));` | `src/hooks/ui/usePullToRefresh.ts` |
| `setPullDistance(threshold * 0.5);` | `src/hooks/ui/usePullToRefresh.ts` |
| `border-radius: 50%;` | `src/hooks/ui/useSwipeNavigation.ts` |
| `return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';` | `src/lib/emailHtml.ts` |
| `* E49 — aviso antecipado: a partir de 80% do teto efetivo, gravar UM evento` | `src/lib/mapboxCostGuard.ts` |
| `/** Limiar em sessões: 80% do teto, em aritmética inteira (evita ruído de ponto flutuante). */` | `src/lib/mapboxCostGuard.ts` |
| `// E49 — aviso antecipado a 80% do teto. Só quando AINDA liberado (`budgetOk`): depois de` | `src/lib/mapboxCostGuard.ts` |
| `// degradar, quem fala é o evento do E47, e o aviso de 80% para de fazer sentido.` | `src/lib/mapboxCostGuard.ts` |
| `// `toBlob` (e não `toDataURL`, que devolveria uma string base64 ~33% maior): qualquer` | `src/lib/pdfThumbnail.ts` |
| `// contatos medidos) guarda 44% em `55`+DDD+**sem** o nono dígito (12 dígitos)` | `src/lib/calls/phone.ts` |
| ``55${withoutNine}`, // 55DDDXXXXXXXX ← 44% da base real` | `src/lib/calls/phone.ts` |
| `* da resposta eram byte a byte iguais. O SonarCloud mediu 4,6% de duplicação em` | `supabase/functions/_shared/ai-conversation-pipeline.ts` |
| `else if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.5) riskScore += 20;` | `supabase/functions/ai-churn-analysis/churn-risk.ts` |
| `else if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.7) riskScore += 10;` | `supabase/functions/ai-churn-analysis/churn-risk.ts` |
| `if (avgMonthly > 0 && recentMessageCount < avgMonthly * 0.3) riskScore += 30;` | `supabase/functions/ai-churn-analysis/churn-risk.ts` |
| `// só Content-Type) — strictMode=true rejeitaria 100% do tráfego GO.` | `supabase/functions/evolution-webhook/index.ts` |
| `// FTS real (search_vector, 100% preenchido — trigger BEFORE INSERT` | `supabase/functions/promogifts-catalog/index.ts` |
| `// null) derrubava 100% dos destinatários com unknown_placeholder. Busca` | `supabase/functions/talkx-send/index.ts` |

## H. Parâmetros de negócio (constantes, prazos, limites)

### H.1 Constantes

| Constante | Valor | Arquivo |
|---|---|---|
| `MAX_RECENT` | `5` | `src/components/CommandPalette.tsx` |
| `LIMITE_CHATS_MIN` | `1` | `src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_MAX` | `50` | `src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_PADRAO` | `5` | `src/components/admin/AdminView.tsx` |
| `MIGRATION_ACTION` | `'media_migration'` | `src/components/admin/MediaMigrationTool.tsx` |
| `HISTORY_LIMIT` | `10` | `src/components/admin/MediaMigrationTool.tsx` |
| `MIN_DETALHE` | `60` | `src/components/admin/TrainingMode.tsx` |
| `RAMAL_MAX_LENGTH` | `64` | `src/components/admin/VoipRamalField.tsx` |
| `MAX_ACOES_DISPUTADAS` | `50` | `src/components/admin/dedupeEntreAbas.ts` |
| `MAX_ROTULOS` | `200` | `src/components/admin/dedupeEntreAbas.ts` |
| `AVATAR_BUCKET` | `'avatars'` | `src/components/admin/useAdminData.ts` |
| `AUDIT_PAGE_SIZE` | `50` | `src/components/admin/useAdminData.ts` |
| `ESPERA_BUSCA_MS` | `300` | `src/components/calls/ContactPicker.tsx` |
| `LIMITE` | `6` | `src/components/calls/ContactPicker.tsx` |
| `RING_GAIN_CAP` | `0.2` | `src/components/calls/IncomingCallAlert.tsx` |
| `CHAVE_CANAL` | `'tel:new-call-channel'` | `src/components/calls/NewCallPanel.tsx` |
| `POS_CHAMADA_MS` | `3000` | `src/components/calls/PostCallSummary.tsx` |
| `JANELA_PAGINAS` | `7` | `src/components/calls/paginas.ts` |
| `JANELA` | `7` | `src/components/calls/paginas.ts` |
| `FALLBACK_PRICE_CEILING` | `2000` | `src/components/catalog/CatalogAdvancedFilters.tsx` |
| `CATALOG_BULK_SEND_MAX` | `10` | `src/components/catalog/CatalogBulkBar.tsx` |
| `CATALOG_RAIL_SYNC_ALERT_DAYS` | `3` | `src/components/catalog/CatalogRail.tsx` |
| `RECENT_SENDS_LIMIT` | `5` | `src/components/catalog/ContactSelectionStep.tsx` |
| `PAGE_SIZE` | `24` | `src/components/catalog/ExternalProductCatalog.tsx` |
| `LIST_ROW_HEIGHT` | `72` | `src/components/catalog/ExternalProductCatalog.tsx` |
| `LIST_COLUMNS` | `5` | `src/components/catalog/ExternalProductCatalog.tsx` |
| `VIRTUALIZE_MIN_PAGE_SIZE` | `48` | `src/components/catalog/ExternalProductCatalog.tsx` |
| `LIST_OVERSCAN` | `6` | `src/components/catalog/ExternalProductCatalog.tsx` |
| `MAX_MESSAGE_LENGTH` | `2000` | `src/components/catalog/SendProductDialog.tsx` |
| `MAX_IMAGES` | `10` | `src/components/catalog/SendProductDialog.tsx` |
| `DRAFT_DEBOUNCE_MS` | `500` | `src/components/catalog/SendProductDialog.tsx` |
| `UNKNOWN_PRICE_LABEL` | `'Preço a confirmar'` | `src/components/catalog/catalogShared.tsx` |
| `UNKNOWN_STOCK_LABEL` | `'Estoque a confirmar'` | `src/components/catalog/catalogShared.tsx` |
| `PHOTO_MIN_INTERVAL_MS` | `800` | `src/components/catalog/useSendProduct.ts` |
| `PHOTO_INTERVAL_JITTER_MS` | `700` | `src/components/catalog/useSendProduct.ts` |
| `DEFAULT_CONDITION_OPERATOR` | `'equals'` | `src/components/chatbot/chatbotNodeConfig.ts` |
| `MULTI_CONNECTION_LOCKED_MESSAGE` | `'Múltiplas conexões ainda não estão habilitadas neste sistema'` | `src/components/connections/ConnectionsView.tsx` |
| `ERRO_CONFIG` | `'Não foi possível ler as configurações desta conexão.'` | `src/components/connections/InstanceSettingsDialog.tsx` |
| `ERRO_PERFIL` | `'Não foi possível ler o perfil desta conexão.'` | `src/components/connections/InstanceSettingsDialog.tsx` |
| `NOTA_MAX` | `120` | `src/components/contacts/ContactActivityTimeline.tsx` |
| `MAX_CONTATOS` | `3` | `src/components/contacts/ContactCompareDialog.tsx` |
| `ADDRESS_SEARCH_TYPES` | `'address,street,place'` | `src/components/contacts/ContactForm.tsx` |
| `MAX_RECENT` | `5` | `src/components/contacts/ContactSearchWithSuggestions.tsx` |
| `CONTACTS_FICHA_DISTANCE` | `12` | `src/components/contacts/contactsMotion.ts` |
| `COUNT_LABEL` | `'mensagens'` | `src/components/dashboard/ActivityHeatmap.tsx` |
| `OVERVIEW_TAB` | `'overview'` | `src/components/dashboard/DashboardView.tsx` |
| `MAX_PERCENT_TARGET` | `100` | `src/components/dashboard/GoalsConfigDialog.tsx` |
| `CONNECTIONS_MAX` | `40` | `src/components/dashboard/systemHealth.ts` |
| `FAILURES_MAX` | `30` | `src/components/dashboard/systemHealth.ts` |
| `STALLED_MAX` | `30` | `src/components/dashboard/systemHealth.ts` |
| `FAILURE_ZERO_RATE` | `0.1` | `src/components/dashboard/systemHealth.ts` |
| `STALLED_STEP` | `10` | `src/components/dashboard/systemHealth.ts` |
| `PAGE` | `1000` | `src/components/dashboard/useSentimentData.ts` |
| `RADIUS` | `42` | `src/components/dashboard/overview/DailyGoalsCard.tsx` |
| `CIRCUMFERENCE` | `2` | `src/components/dashboard/overview/DailyGoalsCard.tsx` |
| `PAGE_SIZE` | `8` | `src/components/dashboard/sla/SLAAgentTable.tsx` |
| `MIN_INTERVALO_ENTRE_CHECKS_MS` | `60` | `src/components/diagnostics/ConnectionHealthPanel.tsx` |
| `INITIAL_LIST_SIZE` | `5` | `src/components/email/EmailContactPanel.tsx` |
| `CHAVE_RECORDES` | `'miniGameHighScores'` | `src/components/gamification/TrainingMiniGames.tsx` |
| `SEARCH_DEBOUNCE_MS` | `300` | `src/components/gmail/GmailInboxView.tsx` |
| `INACTIVE_MINUTES` | `30` | `src/components/inbox/AgentReassignmentPanel.tsx` |
| `SIDEBAR_MIN_WIDTH` | `280` | `src/components/inbox/ConversationListSidebar.tsx` |
| `SIDEBAR_MAX_WIDTH` | `600` | `src/components/inbox/ConversationListSidebar.tsx` |
| `SIDEBAR_DEFAULT_WIDTH` | `350` | `src/components/inbox/ConversationListSidebar.tsx` |
| `SIDEBAR_WIDTH_STEP` | `16` | `src/components/inbox/ConversationListSidebar.tsx` |
| `SIDEBAR_RESERVED_WIDTH` | `60` | `src/components/inbox/ConversationListSidebar.tsx` |
| `LOW_VOLUME_THRESHOLD` | `30` | `src/components/inbox/MediaVolumeControl.tsx` |
| `HEADER_HEIGHT` | `32` | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| `FALLBACK_FIRST_RESPONSE_MINUTES` | `5` | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| `PLAYBACK_BLOCKED` | `'O navegador bloqueou a reprodução. Toque no botão de novo.'` | `src/components/inbox/VoiceChanger.tsx` |
| `PLAYBACK_BLOCKED` | `'O navegador bloqueou a reprodução. Toque no botão de novo.'` | `src/components/inbox/VoiceChangerPicker.tsx` |
| `MAX_RECORDING_MS` | `60` | `src/components/inbox/VoiceChangerPicker.tsx` |
| `BUCKET` | `'audio-messages'` | `src/components/inbox/WhisperAudioPlayer.tsx` |
| `BUCKET_AUDIO` | `'audio-messages'` | `src/components/inbox/WhisperMode.tsx` |
| `CONEXAO_WHATSAPP_INDISPONIVEL` | `'Conexão WhatsApp não disponível.'` | `src/components/inbox/useChatMediaSending.ts` |
| `MAX_FILES` | `10` | `src/components/inbox/useFileUploadLogic.ts` |
| `MIN_SEARCH_EVENT_TERM_LENGTH` | `3` | `src/components/inbox/useGlobalSearchData.ts` |
| `DAY_MS` | `24` | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| `SESSION_GAP_MS` | `4` | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| `BOTTOM_FOLLOW_THRESHOLD_PX` | `100` | `src/components/inbox/chat/ChatMessagesArea.tsx` |
| `SELO_ENVIADA_MS` | `1000` | `src/components/inbox/chat/ChatMessagesArea.tsx` |
| `DEFAULT_FIRST_RESPONSE_MINUTES` | `5` | `src/components/inbox/chat/ChatPanelHeader.tsx` |
| `PREVIEW_LIMIT` | `5` | `src/components/inbox/chat/ChatSearchResultsList.tsx` |
| `STAGGER_MS` | `0.03` | `src/components/inbox/chat/ChatSearchResultsList.tsx` |
| `PRESENCE_ONLINE_WINDOW_MS` | `2` | `src/components/inbox/chat/contactPresence.ts` |
| `PRESENCE_UNKNOWN_LABEL` | `'Presença do contato não informada'` | `src/components/inbox/chat/contactPresence.ts` |
| `JANELA_AGRUPAMENTO_MS` | `5` | `src/components/inbox/chat/groupWindow.ts` |
| `CHAR_LIMIT` | `4096` | `src/components/inbox/chat/useChatInputLogic.ts` |
| `EDIT_WINDOW_MINUTES` | `15` | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| `STORY_DURATION_MS` | `5000` | `src/components/inbox/contact-details/storyUtils.ts` |
| `DEBOUNCE_MS` | `300` | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `RATE_LIMIT_BACKOFF_MS` | `60` | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `SKELETON_ROWS` | `6` | `src/components/inbox/tabs/FilesContent.tsx` |
| `SIDE_BY_SIDE_MIN_WIDTH` | `1100` | `src/components/inbox/tabs/FilesTab.tsx` |
| `DETAIL_PANEL_WIDTH` | `260` | `src/components/inbox/tabs/FilesTab.tsx` |
| `DETAIL_PANEL_GAP` | `16` | `src/components/inbox/tabs/FilesTab.tsx` |
| `MAX_PAGES_TO_LOAD_ALL` | `500` | `src/components/inbox/tabs/FilesTab.tsx` |
| `AREA_DE_TOQUE` | `"[@media(pointer:coarse)]:after:content-['` | `src/components/inbox/tabs/fileActionButton.ts` |
| `TEXTO_QUALQUER_DATA` | `'Qualquer data'` | `src/components/inbox/tabs/journey/JourneyFilters.tsx` |
| `MIN_USUARIOS_PARA_BUSCA` | `8` | `src/components/inbox/tabs/journey/JourneyFilters.tsx` |
| `CONSULTA_MOVIMENTO_REDUZIDO` | `'(prefers-reduced-motion: reduce)'` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `DURACAO_CONTAGEM_MS` | `600` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `MAX_ESCALONADOS` | `8` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `PASSO_ESCALONADO_MS` | `60` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `SERIE_LARGURA` | `320` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `SERIE_ALTURA` | `64` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `SERIE_MARGEM` | `6` | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| `DISTANCIA_PX` | `8` | `src/components/inbox/tabs/journey/motion/FadeSlideIn.tsx` |
| `HIGHLIGHT_DURATION_MS` | `1500` | `src/components/inbox/tabs/journey/motion/HighlightPulse.tsx` |
| `STAGGER_PER_ITEM_MS` | `60` | `src/components/inbox/tabs/journey/motion/presets.ts` |
| `STAGGER_MAX_ITEMS` | `8` | `src/components/inbox/tabs/journey/motion/presets.ts` |
| `COUNT_UP_DURATION_MS` | `600` | `src/components/inbox/tabs/journey/motion/useCountUp.ts` |
| `MAX_RECENTS` | `5` | `src/components/mobile/MobileDrawerMenu.tsx` |
| `SWIPE_THRESHOLD` | `60` | `src/components/mobile/SwipeableMessage.tsx` |
| `DAYS` | `7` | `src/components/monitoring/MonitoringAvailabilityHeatmap.tsx` |
| `INBOX_SILENCE_MIN_MINUTES` | `1` | `src/components/monitoring/MonitoringInboxSilence.tsx` |
| `INBOX_SILENCE_MAX_MINUTES` | `1440` | `src/components/monitoring/MonitoringInboxSilence.tsx` |
| `INBOX_SILENCE_DEFAULT_MINUTES` | `10` | `src/components/monitoring/MonitoringInboxSilence.tsx` |
| `UPTIME_TARGET` | `99.5` | `src/components/monitoring/MonitoringIncidents.tsx` |
| `SLA_TARGET` | `99.5` | `src/components/monitoring/MonitoringSLAPanel.tsx` |
| `SLA_WINDOW_MS` | `24` | `src/components/monitoring/hooks/types.ts` |
| `AVAILABILITY_WINDOW_MS` | `7` | `src/components/monitoring/hooks/types.ts` |
| `HEALTH_LOGS_LIMIT` | `2000` | `src/components/monitoring/hooks/types.ts` |
| `REALTIME_DEBOUNCE_MS` | `500` | `src/components/monitoring/hooks/useEvolutionMonitoring.ts` |
| `INBOX_SILENCE_POLL_MS` | `60` | `src/components/monitoring/hooks/useInboxSilence.ts` |
| `RPC_TIMEOUT_MS` | `15` | `src/components/monitoring/hooks/useInboxSilence.ts` |
| `HOUR_MS` | `60` | `src/components/monitoring/hooks/useMonitoringData.ts` |
| `DAY_MS` | `24` | `src/components/monitoring/hooks/useMonitoringData.ts` |
| `RAMO_NAO_INFORMADO` | `'Não informado'` | `src/components/multiplix/MultiplixView.tsx` |
| `PAGE_SIZE` | `50` | `src/components/multiplix/MultiplixView.tsx` |
| `SERVER_PAGE_MAX` | `200` | `src/components/multiplix/MultiplixView.tsx` |
| `POLICY_MAX_IDS` | `10` | `src/components/multiplix/MultiplixView.tsx` |
| `PREVIEW_OPTIONS_MAX` | `200` | `src/components/multiplix/MultiplixView.tsx` |
| `AUDIENCE_ROW_ESTIMATE` | `56` | `src/components/multiplix/MultiplixView.tsx` |
| `SOUND_VOLUME_STEP` | `5` | `src/components/notifications/SoundVolumeControl.tsx` |
| `SOUND_VOLUME_MIN` | `10` | `src/components/notifications/SoundVolumeControl.tsx` |
| `SOUND_VOLUME_MAX` | `100` | `src/components/notifications/SoundVolumeControl.tsx` |
| `LOW_VOLUME_THRESHOLD` | `30` | `src/components/notifications/SoundVolumeControl.tsx` |
| `SAVE_DEBOUNCE_MS` | `400` | `src/components/notifications/SoundVolumeControl.tsx` |
| `SEARCH_MIN_LENGTH` | `2` | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `SEARCH_DEBOUNCE_MS` | `300` | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `SEARCH_RESULT_LIMIT` | `50` | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `SEARCH_MESSAGES_LIMIT` | `500` | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `HISTORY_NOT_LOADED_LABEL` | `'Histórico não carregado'` | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `PAUSA_ENTRE_CHUNKS_MS` | `150` | `src/components/performance/hotRoutePrefetch.ts` |
| `SEM_AMOSTRA_LABEL` | `'Sem dados avaliados no período'` | `src/components/queues/SLAMetricCards.tsx` |
| `EMPTY` | `'—'` | `src/components/reports/PeriodComparison.tsx` |
| `ACL_ALERTS_TABLE` | `'security_acl_alerts'` | `src/components/security/AclAlertsPanel.tsx` |
| `ACL_ALERTS_LIMIT` | `200` | `src/components/security/AclAlertsPanel.tsx` |
| `ACL_ALERTS_REFRESH_MS` | `30` | `src/components/security/AclAlertsPanel.tsx` |
| `ROLE_FILTER_VALUE` | `'role_events'` | `src/components/security/AuditLogDashboard.tsx` |
| `LOGS_PAGE_LIMIT` | `200` | `src/components/security/AuditLogDashboard.tsx` |
| `DISMISS_TTL_MS` | `24` | `src/components/security/MfaAdminNudge.tsx` |
| `MAX_TIMEOUT_MS` | `2` | `src/components/security/MfaAdminNudge.tsx` |
| `VISIBLE_LIMIT` | `3` | `src/components/security/RateLimitRealtimeAlerts.tsx` |
| `CHAVE_TRANSCRICAO` | `'auto_transcription_enabled'` | `src/components/settings/AutomationSettings.tsx` |
| `DEFAULT_OPEN_TIME` | `'09:00'` | `src/components/settings/ScheduleSettings.tsx` |
| `DEFAULT_CLOSE_TIME` | `'18:00'` | `src/components/settings/ScheduleSettings.tsx` |
| `HORAS_DA_JANELA` | `24` | `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` |
| `MAX_UPLOAD_SIZE_MB` | `10` | `src/components/settings/media-library/useMediaLibrary.ts` |
| `FIRST_RESPONSE_MINUTES` | `5` | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `RESOLUTION_MINUTES_PADRAO` | `60` | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `PRIDE_RED` | `'0 85% 55%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_ORANGE` | `'30 90% 55%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_YELLOW` | `'55 90% 50%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_GREEN` | `'130 70% 45%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_BLUE` | `'210 80% 55%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_PURPLE` | `'280 80% 58%'` | `src/components/settings/theme/presets.ts` |
| `PRIDE_PINK` | `'330 85% 52%'` | `src/components/settings/theme/presets.ts` |
| `NO_DATA_LABEL` | `'sem dados ainda'` | `src/components/talkx/TalkXAudienceFilters.tsx` |
| `ANY_VALUE` | `'all'` | `src/components/talkx/TalkXAudienceFilters.tsx` |
| `INSIGHT_REPLY_GROWTH_MIN` | `30` | `src/components/talkx/TalkXCampaignRunning.tsx` |
| `NO_VALUE` | `'—'` | `src/components/talkx/TalkXCampaignWizard.tsx` |
| `CONTACT_ROW_ESTIMATE` | `56` | `src/components/talkx/TalkXContactSelector.tsx` |
| `CONTACT_OVERSCAN` | `6` | `src/components/talkx/TalkXContactSelector.tsx` |
| `FIELD` | `'h-9 text-xs bg-input/40 border-border/70'` | `src/components/talkx/TalkXInteractiveEditor.tsx` |
| `REFETCH` | `4000` | `src/components/talkx/TalkXLiveMonitor.tsx` |
| `ADD_CONTACT_LIST_LIMIT` | `50` | `src/components/talkx/TalkXSuppression.tsx` |
| `CONTACT_SEARCH_DEBOUNCE_MS` | `300` | `src/components/talkx/TalkXSuppression.tsx` |
| `PHONE_MIN_DIGITS` | `10` | `src/components/talkx/TalkXSuppression.tsx` |
| `PHONE_MAX_DIGITS` | `15` | `src/components/talkx/TalkXSuppression.tsx` |
| `ACTIVITY_RAIL_LIMIT` | `5` | `src/components/talkx/TalkXSuppression.tsx` |
| `ACTIVITY_HISTORY_PAGE_SIZE` | `20` | `src/components/talkx/TalkXSuppression.tsx` |
| `CONSULTA_PAINEL_LARGO` | `'(min-width: 1280px)'` | `src/components/talkx/TalkXTemplateEditor.tsx` |
| `REVIEW_STALE_DAYS` | `3` | `src/components/talkx/TalkXTemplates.tsx` |
| `FORECAST_MIN_CAMPAIGNS` | `5` | `src/components/talkx/TalkXWizardDelivery.tsx` |
| `FORECAST_MIN_SENT` | `100` | `src/components/talkx/TalkXWizardDelivery.tsx` |
| `FORECAST_WINDOW_DAYS` | `90` | `src/components/talkx/TalkXWizardDelivery.tsx` |
| `MAX_INTERACTIVE_BUTTONS` | `3` | `src/components/talkx/talkxInteractive.ts` |
| `MAX_BUTTON_LABEL` | `20` | `src/components/talkx/talkxInteractive.ts` |
| `MAX_POLL_QUESTION` | `255` | `src/components/talkx/talkxInteractive.ts` |
| `MIN_POLL_OPTIONS` | `2` | `src/components/talkx/talkxInteractive.ts` |
| `MAX_POLL_OPTIONS` | `12` | `src/components/talkx/talkxInteractive.ts` |
| `LIMITS_MIN_S` | `3` | `src/components/talkx/talkxLimits.ts` |
| `LIMITS_MAX_S` | `600` | `src/components/talkx/talkxLimits.ts` |
| `TEMPLATE_TAB` | `'templates'` | `src/components/talkx/talkxTemplateRoute.ts` |
| `MESSAGE_LIMIT` | `4096` | `src/components/talkx/useCampaignEditor.ts` |
| `DEFAULT_SCHEDULE_TIMEZONE` | `'America/Sao_Paulo'` | `src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_FILTER_DEBOUNCE_MS` | `350` | `src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_PREVIEW_LIMIT` | `5000` | `src/components/talkx/useCampaignEditor.ts` |
| `TAG_FIELD` | `'tags'` | `src/components/talkx/useCampaignEditor.ts` |
| `ENVIO_NAO_ACEITO` | `'O envio não foi aceito. Tente novamente.'` | `src/components/talkx/useTalkXLifecycle.tsx` |
| `TALKX_MEDIA_BUCKET` | `'talkx-media'` | `src/components/talkx/useTalkXMediaUpload.ts` |
| `TALKX_MEDIA_MAX_BYTES` | `16` | `src/components/talkx/useTalkXMediaUpload.ts` |
| `VIEW_W` | `320` | `src/components/talkx/analytics/AnalyticsFunnel.tsx` |
| `STEP_H` | `34` | `src/components/talkx/analytics/AnalyticsFunnel.tsx` |
| `GAP` | `8` | `src/components/talkx/analytics/AnalyticsFunnel.tsx` |
| `FUNNEL_TITLE` | `'Entrega → Leitura → Resposta → Conversão'` | `src/components/talkx/analytics/AnalyticsFunnel.tsx` |
| `HELP_GUIDES_SLUG` | `'guias'` | `src/components/talkx/help/talkxHelpIndex.ts` |
| `HELP_ALL_TOPICS` | `'all'` | `src/components/talkx/help/talkxHelpIndex.ts` |
| `HELP_WORDS_PER_MINUTE` | `200` | `src/components/talkx/help/talkxHelpIndex.ts` |
| `HELP_SCREEN` | `'help'` | `src/components/talkx/help/talkxHelpRoute.ts` |
| `LIMIT` | `5` | `src/components/talkx/kit/ActiveCampaignIndicator.tsx` |
| `PREVIEW_DEFAULT_TIMEZONE` | `"America/Sao_Paulo"` | `src/components/talkx/kit/personalize.ts` |
| `DEFAULT_TIMEZONE` | `'America/Sao_Paulo'` | `src/components/talkx/report/TalkXCampaignReport.tsx` |
| `REPORT_SAMPLE_LIMIT` | `20` | `src/components/talkx/report/talkxReportData.ts` |
| `HISTORY_LIMIT` | `50` | `src/components/talkx/segments/segmentBuilderReducer.ts` |
| `COALESCE_MS` | `800` | `src/components/talkx/segments/segmentBuilderReducer.ts` |
| `SEGMENT_DESCRIPTION_MAX` | `160` | `src/components/talkx/segments/segmentValidation.ts` |
| `GAUGE_RADIUS` | `34` | `src/components/talkx/suppression/ProtectionGauge.tsx` |
| `GAUGE_CIRCUMFERENCE` | `2` | `src/components/talkx/suppression/ProtectionGauge.tsx` |
| `SPARK_POINTS` | `7` | `src/components/talkx/tracking/TalkXLiveKpiRow.tsx` |
| `PAGE_SIZE` | `50` | `src/components/talkx/tracking/TalkXRecipientsTable.tsx` |
| `TALKX_STALL_MIN_MS` | `180` | `src/components/talkx/tracking/talkxHealth.ts` |
| `TALKX_RATE_WINDOW_MIN` | `5` | `src/components/talkx/tracking/talkxHealth.ts` |
| `SEGMENT_PREVIEW_SIZE` | `4` | `src/components/talkx/tracking/talkxSegmentProgress.ts` |
| `MANUAL_SEGMENT_LABEL` | `'Seleção manual'` | `src/components/talkx/tracking/talkxSegmentProgress.ts` |
| `SUMMARY_BUCKET` | `'hour'` | `src/components/talkx/tracking/talkxSentSummary.ts` |
| `HOUR_MS` | `3` | `src/components/talkx/tracking/talkxSentSummary.ts` |
| `ID_PAINEL_ABAS` | `'board-tabpanel'` | `src/components/tasks/board/TasksBoardMode.tsx` |
| `UMA_HORA_MS` | `3` | `src/components/tasks/shared/new-task/CoerenciaLembrete.tsx` |
| `HORA_PADRAO` | `'09:00'` | `src/components/tasks/shared/new-task/RemindField.tsx` |
| `TITLE_MAX` | `200` | `src/components/tasks/shared/new-task/TaskTitleField.tsx` |
| `COR_APOIO` | `'text-2xs text-muted-foreground'` | `src/components/tasks/shared/sheet/PlanejamentoSection.tsx` |
| `CHAVE_PAINEL_EXPANDIDO` | `'tasks-painel-expandido'` | `src/components/tasks/shared/sheet/painel.ts` |
| `VALOR_EXPANDIDO` | `'1'` | `src/components/tasks/shared/sheet/painel.ts` |
| `TEXTO_AGENDADO` | `'Agendado'` | `src/components/tasks/shared/sheet/planejamento.ts` |
| `MIN_SEARCH_CHARS` | `2` | `src/components/team-chat/useTeamChatPanel.ts` |
| `SEARCH_LIMIT` | `100` | `src/components/team-chat/useTeamChatPanel.ts` |
| `CHAT_FONT_SIZE_VAR` | `'--chat-font-size'` | `src/components/theme/useChatTextSize.ts` |
| `DEFAULT_CHAT_TEXT_SIZE` | `'padrao'` | `src/components/theme/useChatTextSize.ts` |
| `MAX_DURATION` | `0.4` | `src/components/transitions/transitionVariants.ts` |
| `ARCO_GRAUS` | `270` | `src/components/ui/VolumeDial.tsx` |
| `INICIO_GRAUS` | `135` | `src/components/ui/VolumeDial.tsx` |
| `RAIO` | `42` | `src/components/ui/VolumeDial.tsx` |
| `ESPESSURA` | `8` | `src/components/ui/VolumeDial.tsx` |
| `DURACAO_CONTAGEM` | `0.25` | `src/components/ui/VolumeDial.tsx` |
| `TAMANHO_BASE` | `96` | `src/components/ui/VolumeDial.tsx` |
| `KNOB_BASE` | `14` | `src/components/ui/VolumeDial.tsx` |
| `FONTE_BASE` | `24` | `src/components/ui/VolumeDial.tsx` |
| `RAIO_MINIMO_ARRASTE` | `0.6` | `src/components/ui/VolumeDial.tsx` |
| `FOCAVEIS` | `'button:not([disabled]), [role="` | `src/components/ui/VolumeSliderPopoverContent.tsx` |
| `DURACAO_SAIDA_MS` | `300` | `src/components/ui/accessible-toast.tsx` |
| `BALLOON_GAP` | `8` | `src/components/ui/quick-peek.tsx` |
| `BAR_COUNT` | `24` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `MIN_HEIGHT` | `3` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `MAX_HEIGHT` | `32` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `BAR_WIDTH` | `3` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `BAR_GAP` | `2` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `TARGET_UPDATE_INTERVAL_MS` | `120` | `src/components/voice/AudioFrequencyVisualizer.tsx` |
| `PAGE_SIZE` | `50` | `src/features/talk-me/useTalkMeQueue.ts` |
| `MAX_RECONCILE_PAGES` | `3` | `src/features/talk-me/useTalkMeQueue.ts` |
| `REALTIME_DEBOUNCE_MS` | `350` | `src/features/talk-me/useTalkMeQueue.ts` |
| `REALTIME_MAX_WAIT_MS` | `2` | `src/features/talk-me/useTalkMeQueue.ts` |
| `ELIGIBILITY_RECONCILE_INTERVAL_MS` | `60` | `src/features/talk-me/useTalkMeQueue.ts` |
| `RESOLVED_CONFLICT_MESSAGE` | `'Este atendimento já foi resolvido'` | `src/features/talk-me/useTalkMeQueue.ts` |
| `DEFAULT_SEARCH_INSIGHTS_PERIOD` | `30` | `src/hooks/admin/useSearchInsights.ts` |
| `SUPERVISOR_PAGE_SIZE` | `200` | `src/hooks/admin/useSupervisorQueue.ts` |
| `DEFAULT_REFRESH_MS` | `60` | `src/hooks/admin/useSupervisorQueue.ts` |
| `RECENT_SENDS_WINDOW_DAYS` | `30` | `src/hooks/agents/useAgentRecentSends.ts` |
| `DAY_MS` | `24` | `src/hooks/agents/useAgentRecentSends.ts` |
| `LOGS_PER_PAGE` | `50` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `MESMO_CICLO_MS` | `1` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `QUEUE_GOAL_ALERTS_INTERVAL_MS` | `5` | `src/hooks/analytics/useQueueGoalAlerts.ts` |
| `MAX_HISTORY` | `60` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `JANELA_HORA_MS` | `60` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `MAX_IDS_CONTABILIZADOS` | `500` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `FLUSH_MS` | `4000` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `MAX_LOGIN_ATTEMPTS` | `5` | `src/hooks/auth/useAuthForm.ts` |
| `SESSION_SILENCE_MS` | `4` | `src/hooks/business/useAbandonmentRate.ts` |
| `CSAT_PAGE_SIZE` | `1000` | `src/hooks/business/useCSAT.ts` |
| `CSAT_MAX_PAGES` | `50` | `src/hooks/business/useCSAT.ts` |
| `NPS_SURVEY_LIMIT` | `500` | `src/hooks/business/useNPSSurveys.ts` |
| `ANALYTICS_PAGE_SIZE` | `1000` | `src/hooks/business/useQueueAnalytics.ts` |
| `SLA_MONITOR_SOURCE` | `'sla-monitor'` | `src/hooks/business/useWarRoomAlerts.ts` |
| `SLA_BREACH_PAGE` | `1000` | `src/hooks/business/useWarRoomAlerts.ts` |
| `WARROOM_MAX_ROWS` | `200` | `src/hooks/business/useWarRoomData.ts` |
| `CANAL_VOIP` | `'voip'` | `src/hooks/calls/useCallChannels.ts` |
| `CANAL_WHATSAPP` | `'whatsapp'` | `src/hooks/calls/useCallChannels.ts` |
| `PAGE_SIZE` | `8` | `src/hooks/calls/useMyCalls.ts` |
| `SNOOZE_HOUR` | `9` | `src/hooks/chat/snoozeDurations.ts` |
| `AUTOMATION_SUGGESTIONS_DEBOUNCE_MS` | `400` | `src/hooks/chat/useAutomationSuggestions.ts` |
| `MAX_CACHED_MESSAGES` | `50` | `src/hooks/chat/useAutomationSuggestions.ts` |
| `GAP_MS` | `4` | `src/hooks/chat/useChatSearch.ts` |
| `AGENT_SENDER_LABEL` | `'Atendente'` | `src/hooks/chat/useContactMedia.ts` |
| `MEDIA_PAGE_SIZE` | `60` | `src/hooks/chat/useContactMedia.ts` |
| `NOT_DELETED_OR` | `'is_deleted.is.null,is_deleted.eq.false'` | `src/hooks/chat/useContactMedia.ts` |
| `NOT_DELETED_OR` | `'is_deleted.is.null,is_deleted.eq.false'` | `src/hooks/chat/useContactMediaCounts.ts` |
| `NOTA_MAX` | `120` | `src/hooks/chat/useConversationHistoryTimeline.ts` |
| `CONVERSATION_PANEL_INVALIDATION_WINDOW_MS` | `2000` | `src/hooks/chat/useConversationPanelInvalidation.ts` |
| … +615 linhas — lista completa em `context.json` | | |

### H.2 Prazos, expirações e janelas de tempo

| Trecho | Arquivo |
|---|---|
| `staleTime: 10 * 60 * 1000,` | `src/components/admin/AdminCRMDashboard.tsx` |
| `staleTime: 15 * 60 * 1000,` | `src/components/admin/AdminCRMDashboard.tsx` |
| `staleTime: 5 * 60 * 1000,` | `src/components/admin/AdminCRMDashboard.tsx` |
| `const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);` | `src/components/admin/CrisisRoom.tsx` |
| `const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();` | `src/components/admin/SupervisorCopilot.tsx` |
| `return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), now };` | `src/components/admin/SupervisorCopilot.tsx` |
| `: 6 * 60 * 60_000;` | `src/components/admin/telemetry/TelemetryCharts.tsx` |
| `const permTimeout = setTimeout(() => { if (hasPermission === null) { log.warn('[ProtectedRoute] Permission check timed out'); setHasPermission(false); } }, 5000 …` | `src/components/auth/ProtectedRoute.tsx` |
| `const timer = setTimeout(() => setSaidaLiberada(true), 5000);` | `src/components/auth/ProtectedRoute.tsx` |
| `return Date.now() - new Date(lastSyncAt).getTime() < 24 * 60 * 60 * 1000;` | `src/components/catalog/ExternalProductManagement.tsx` |
| `const accountAgeDays = Math.max(1, (now - created) / (1000 * 60 * 60 * 24));` | `src/components/contacts/ContactEngagementScore.tsx` |
| `const daysSinceLastMsg = lastMsg ? (now - lastMsg) / (1000 * 60 * 60 * 24) : 999;` | `src/components/contacts/ContactEngagementScore.tsx` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/copilot/QuoteDraftCard.tsx` |
| `staleTime: 10 * 60 * 1000,` | `src/components/crm360/CRM360StatsCards.tsx` |
| `staleTime: 5 * 60 * 1000,` | `src/components/dashboard/ActivityHeatmap.tsx` |
| `.gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());` | `src/components/dashboard/ConversationHeatmap.tsx` |
| `staleTime: 5 * 60 * 1000,` | `src/components/dashboard/ConversationHeatmap.tsx` |
| `const timer = setTimeout(() => { setShow(false); onComplete?.(); }, 3500);` | `src/components/effects/Confetti.tsx` |
| `setTimeout(() => setMatrixMode(false), 8000);` | `src/components/effects/EasterEggs.tsx` |
| `setTimeout(() => setPartyMode(false), 10000);` | `src/components/effects/EasterEggs.tsx` |
| `setTimeout(() => { document.body.classList.remove('disco-mode'); }, 8000);` | `src/components/effects/EasterEggs.tsx` |
| `setTimeout(() => { document.body.classList.remove('rainbow-mode'); }, 5000);` | `src/components/effects/EasterEggs.tsx` |
| `return new Date(earnedAt) > new Date(Date.now() - 60 * 60 * 1000);` | `src/components/gamification/AchievementsStats.tsx` |
| `setTimeout(() => { if (currentQuestion < QUIZ_QUESTIONS.length - 1) { setCurrentQuestion(c => c + 1); setAnswered(null); } else { setShowResult(true); onComplet …` | `src/components/gamification/MiniGameDialogs.tsx` |
| `destaqueTimerRef.current = setTimeout(() => { destaqueTimerRef.current = null; setDeliveryFocusId(null); }, 1200);` | `src/components/inbox/ChatPanel.tsx` |
| `const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));` | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `{ label: 'Amanhã 14h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },` | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `{ label: 'Amanhã 9h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },` | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `{ label: 'Em 1 semana', getDate: () => setMinutes(setHours(addDays(new Date(), 7), 9), 0) },` | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `{ label: 'Em 2 dias', getDate: () => setMinutes(setHours(addDays(new Date(), 2), 9), 0) },` | `src/components/inbox/ScheduleMessageDialog.tsx` |
| `enviadoTimerRef.current = window.setTimeout(() => { if (isMountedRef.current) setEnviadoOk(false); }, 1500);` | `src/components/inbox/WhisperMode.tsx` |
| `// Fecha SÓ quando tudo passou (antes o setTimeout(handleClose, 1000) descartava` | `src/components/inbox/useFileUploadLogic.ts` |
| `case '30days': return subMonths(now, 1);` | `src/components/inbox/useGlobalSearchData.ts` |
| `case '7days': return subDays(now, 7);` | `src/components/inbox/useGlobalSearchData.ts` |
| `case '90days': return subMonths(now, 3);` | `src/components/inbox/useGlobalSearchData.ts` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/inbox/ai-tools/AIResponseCard.tsx` |
| `const DAY_MS = 24 * 60 * 60 * 1000;` | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| `const SESSION_GAP_MS = 4 * 60 * 60 * 1000;` | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| `export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;` | `src/components/inbox/chat/contactPresence.ts` |
| `{ enableHighAccuracy: true, timeout: 10000 }` | `src/components/inbox/location-picker/useLocationPicker.ts` |
| `const timer = setTimeout(() => setShowCelebration(false), 2000);` | `src/components/leaderboard/LeaderboardHelpers.tsx` |
| `setTimeout(() => setCopied(false), 2000);` | `src/components/mfa/MFABackupCodes.tsx` |
| `'12h': 12 * 60 * 60 * 1000,` | `src/components/monitoring/hooks/types.ts` |
| `'1h': 60 * 60 * 1000,` | `src/components/monitoring/hooks/types.ts` |
| `'24h': 24 * 60 * 60 * 1000,` | `src/components/monitoring/hooks/types.ts` |
| `'6h': 6 * 60 * 60 * 1000,` | `src/components/monitoring/hooks/types.ts` |
| `'7d': 7 * 24 * 60 * 60 * 1000,` | `src/components/monitoring/hooks/types.ts` |
| `export const AVAILABILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;` | `src/components/monitoring/hooks/types.ts` |
| `export const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;` | `src/components/monitoring/hooks/types.ts` |
| `await new Promise(r => setTimeout(r, 1000));` | `src/components/monitoring/hooks/useMonitoringActions.ts` |
| `const HOUR_MS = 60 * 60 * 1000;` | `src/components/monitoring/hooks/useMonitoringData.ts` |
| `setTimeout(() => setIsTestingSound(false), 1000);` | `src/components/notifications/NotificationSettingsPanel.tsx` |
| `setTimeout(() => setIsTesting(false), 1000);` | `src/components/notifications/NotificationTypeCards.tsx` |
| `const timer = setTimeout(() => setIsExpanded(false), 8000);` | `src/components/onboarding/OnboardingChecklist.tsx` |
| `await new Promise((resolve) => setTimeout(resolve, 2000));` | `src/components/performance/Prefetcher.tsx` |
| `staleTime: 5 * 60 * 1000, // 5 minutes` | `src/components/performance/Prefetcher.tsx` |
| `const [dateRange, setDateRange] = useState(() => ({ from: subDays(new Date(), 6), to: new Date() }));` | `src/components/queues/QueueCharts.tsx` |
| `const from = subDays(now, 6);` | `src/components/queues/QueuesComparisonDashboard.tsx` |
| `const since = subDays(new Date(), 28);` | `src/components/reports/DemandForecast.tsx` |
| `currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);` | `src/components/reports/PeriodComparison.tsx` |
| `currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);` | `src/components/reports/PeriodComparison.tsx` |
| `previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);` | `src/components/reports/PeriodComparison.tsx` |
| `previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);` | `src/components/reports/PeriodComparison.tsx` |
| `onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}` | `src/components/schedule/ScheduleCalendarView.tsx` |
| `onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}` | `src/components/schedule/ScheduleCalendarView.tsx` |
| `const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;` | `src/components/security/MfaAdminNudge.tsx` |
| `setTimeout(() => setSaved(null), 2000);` | `src/components/talkx/TalkXSettings.tsx` |
| `return new Date(now + Number(choice) * 24 * 60 * 60 * 1000).toISOString();` | `src/components/talkx/TalkXSuppression.tsx` |
| `destaqueTimer.current = window.setTimeout(() => setDestaqueId(null), 1200);` | `src/components/tasks/TasksModule.tsx` |
| `setTimeout(() => el.classList.remove('animate-pulse-subtle'), 2000);` | `src/components/team-chat/TeamMessageItem.tsx` |
| `setTimeout(() => setCopiedId(null), 2000);` | `src/components/team-chat/department-management/DepartmentInvitesView.tsx` |
| `wasOfflineTimerRef.current = setTimeout(() => { wasOfflineTimerRef.current = null; setWasOffline(false); }, 3000);` | `src/components/ui/offline-indicator.tsx` |
| `const t4 = setTimeout(() => setProgress(90), 1500);` | `src/components/ui/route-loading-bar.tsx` |
| `indicatorTimerRef.current = window.setTimeout(() => { indicatorTimerRef.current = null; setShowIndicator(false); }, 3000);` | `src/components/ui/skip-link.tsx` |
| `const timer = setTimeout(() => setRestored(false), 4000);` | `src/components/ui/supabase-connectivity-banner.tsx` |
| `const DAY_MS = 24 * 60 * 60 * 1000;` | `src/hooks/agents/useAgentRecentSends.ts` |
| `const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `src/hooks/analytics/useAIStats.ts` |
| `case '1h': return subHours(agora, 1);` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `case '24h': return subDays(agora, 1);` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `case '30d': return subDays(agora, 30);` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `case '6h': return subHours(agora, 6);` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `case '7d': return subDays(agora, 7);` | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `export function useIdleCallback(callback: () => void, timeout = 1000) {` | `src/hooks/analytics/usePerformanceOptimizations.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `src/hooks/analytics/usePerformanceSnapshots.ts` |
| `const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();` | `src/hooks/analytics/usePerformanceSnapshots.ts` |
| `export const QUEUE_GOAL_ALERTS_INTERVAL_MS = 5 * 60 * 1000;` | `src/hooks/analytics/useQueueGoalAlerts.ts` |
| `const JANELA_HORA_MS = 60 * 60 * 1000;` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `useVisiblePolling(fetchInitialData, 5 * 60 * 1000);` | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `'24h': () => subHours(new Date(), 24),` | `src/hooks/analytics/useRecentAnalyses.ts` |
| `'30d': () => subDays(new Date(), 30),` | `src/hooks/analytics/useRecentAnalyses.ts` |
| `'7d': () => subDays(new Date(), 7),` | `src/hooks/analytics/useRecentAnalyses.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/analytics/useSentimentTrend.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/auth/useMFA.ts` |
| `const since = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);` | `src/hooks/business/useAbandonmentRate.ts` |
| `export const SESSION_SILENCE_MS = 4 * 60 * 60 * 1000;` | `src/hooks/business/useAbandonmentRate.ts` |
| `.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());` | `src/hooks/business/useDemandPrediction.ts` |
| `const time = new Date(now.getTime() + i * 60 * 60 * 1000);` | `src/hooks/business/useDemandPrediction.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/business/useDemandPrediction.ts` |
| `const dayEnd = nextBucket ? startOfDay(nextBucket) : addDays(startOfDay(range.to), 1);` | `src/hooks/business/useQueueAnalytics.ts` |
| `* Antes, `nextweek` era `addDays(now, 7 - now.getDay() + 1)` + `setHours(9)`,` | `src/hooks/chat/snoozeDurations.ts` |
| `return addHours(now, 1);` | `src/hooks/chat/snoozeDurations.ts` |
| `return addHours(now, 3);` | `src/hooks/chat/snoozeDurations.ts` |
| `const GAP_MS = 4 * 60 * 60 * 1000; // 4 hours` | `src/hooks/chat/useChatSearch.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/chat/useContactMedia.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/chat/useMediaSenderProfiles.ts` |
| `gcTime: 10 * 60 * 1000,` | `src/hooks/chat/useMessageReactions.ts` |
| `gcTime: 5 * 60 * 1000,` | `src/hooks/chat/useMessageReactions.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/chat/useMessageReactions.ts` |
| `const hoursSinceLastMsg = (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60);` | `src/hooks/chat/useNextBestAction.ts` |
| `contactTypingTimeoutRef.current = setTimeout(() => { setIsContactTyping(false); }, 5000);` | `src/hooks/chat/useTypingPresence.ts` |
| `typingTimeoutRef.current = setTimeout(() => { setTyping(false); }, 3000);` | `src/hooks/chat/useTypingPresence.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/chat/journey/useJourneyActors.ts` |
| `setTimeout(resolve, 3000);` | `src/hooks/communication/useAudioMemes.ts` |
| `const SIGNED_URL_REFRESH_AFTER_MS = 50 * 60 * 1000;` | `src/hooks/communication/useAudioPlayer.ts` |
| `const cutoff = Date.now() - 5 * 60 * 1000;` | `src/hooks/copilot/useWhisperChannel.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useAgentsLite.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useCRMAdminAccess.ts` |
| `gcTime: 15 * 60 * 1000,` | `src/hooks/crm/useEmailContactContext.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useEmailContactContext.ts` |
| `gcTime: 1000 * 60 * 60,` | `src/hooks/crm/useExternalCargos.ts` |
| `gcTime: 1000 * 60 * 60,` | `src/hooks/crm/useExternalEmpresas.ts` |
| `const since = subHours(new Date(), 24).toISOString();` | `src/hooks/dashboard/useRecentConversationEvents.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/dashboard/useSentimentTrend.ts` |
| `export const BROADCAST_ACTION_TTL_MS = 2 * 60 * 1000;` | `src/hooks/groups/actions.ts` |
| `setTimeout(() => setCopiedIdx(null), 2000);` | `src/hooks/inbox/useObjectionDetector.ts` |
| `const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();` | `src/hooks/integrations/useCatalogRecentSends.ts` |
| `gcTime: 10 * 60 * 1000,` | `src/hooks/integrations/useExternalCatalog.ts` |
| `gcTime: 30 * 60 * 1000,` | `src/hooks/integrations/useExternalCatalog.ts` |
| `staleTime: 10 * 60 * 1000,` | `src/hooks/integrations/useExternalCatalog.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/integrations/useExternalCatalog.ts` |
| `const { table, select, filters, order, limit = 50, offset = 0, countMode, enabled = true, staleTime = 5 * 60 * 1000 } = options;` | `src/hooks/integrations/useExternalDB.ts` |
| `staleTime: 2 * 60 * 1000,` | `src/hooks/integrations/useExternalDB.ts` |
| `staleTime: options.staleTime ?? 10 * 60 * 1000,` | `src/hooks/integrations/useExternalDB.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/integrations/useMultiplixAudience.ts` |
| `gcTime: 60 * 60 * 1000,` | `src/hooks/integrations/useTalkXInsights.ts` |
| `staleTime: 60 * 60 * 1000,` | `src/hooks/integrations/useTalkXInsights.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/integrations/useTalkXSettings.ts` |
| `const HORA = 60 * 60 * 1000;` | `src/hooks/security/useAuditLogDashboard.ts` |
| `export const SLA_ALERT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;` | `src/hooks/sla/useSLANotifications.ts` |
| `const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;` | `src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;` | `src/hooks/system/useDiagnosticsData.ts` |
| `const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();` | `src/hooks/system/useDiagnosticsData.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `src/hooks/system/useDiagnosticsData.ts` |
| `refetchInterval: 5 * 60 * 1000,` | `src/hooks/system/useFeatureFlag.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/system/useFeatureFlag.ts` |
| `gcTime: 10 * 60 * 1000,` | `src/hooks/system/useGlobalSettings.ts` |
| `staleTime: 5 * 60 * 1000, // 5 min — deduplica entre todos os consumidores` | `src/hooks/system/useGlobalSettings.ts` |
| `const scheduleIdle = useCallback((work: () => void, timeout = 5000) => {` | `src/hooks/system/useIdleCallback.ts` |
| `const { timeout = 2000, enabled = true } = options;` | `src/hooks/system/useIdleCallback.ts` |
| `gcTime: 10 * 60 * 1000,` | `src/hooks/system/useNotificationSettings.ts` |
| `staleTime: 5 * 60 * 1000, // 5 min — deduplicate across all consumers` | `src/hooks/system/useNotificationSettings.ts` |
| `cacheDuration = 5 * 60 * 1000, // 5 minutes` | `src/hooks/system/useResourcePrefetch.ts` |
| `timeoutId = setTimeout(prefetchAll, 1000);` | `src/hooks/system/useResourcePrefetch.ts` |
| `const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;` | `src/hooks/system/useSystemHealthSignals.ts` |
| `const STALL_WINDOW_MS = 5 * 60 * 1000;` | `src/hooks/system/useSystemHealthSignals.ts` |
| `inactivity_timeout: 30,` | `src/hooks/system/useUserSettings.ts` |
| `const day2Start = startOfDay(addDays(now, 2));` | `src/hooks/tasks/workItemAggregates.ts` |
| `const sevenDayLimit = startOfDay(addDays(now, 7));` | `src/hooks/tasks/workItemAggregates.ts` |
| `const tomorrowStart = startOfDay(addDays(now, 1));` | `src/hooks/tasks/workItemAggregates.ts` |
| `if (filtro === 'today') return due < startOfDay(addDays(now, 1));` | `src/hooks/tasks/workItemAggregates.ts` |
| `return due < startOfDay(addDays(now, 7)); // filtro === 'week'` | `src/hooks/tasks/workItemAggregates.ts` |
| `const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();` | `src/hooks/team-chat/useTeamPerformance.ts` |
| `const timeout = setTimeout(() => controller.abort(), 15000);` | `src/hooks/voice/processTranscript.ts` |
| `export const AUDIO_STATE_TTL_MS = 30 * 60 * 1000;` | `src/lib/audioPlayerState.ts` |
| `const CHECK_INTERVAL_MS = 10 * 60 * 1000;` | `src/lib/deployment-update.ts` |
| `const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;` | `src/lib/emailDraftSession.ts` |
| `setTimeout(() => resolve(load()), 1000 * attempt)` | `src/lib/lazyWithRetry.ts` |
| `const POLL_INTERVAL_MS = 5 * 60 * 1000;` | `src/lib/mapboxCostGuard.ts` |
| `export const MESSAGE_GROUP_WINDOW_MS = 10 * 60 * 1000;` | `src/lib/journey/mappers.ts` |
| `const DIA_MS = 24 * 60 * 60 * 1000;` | `src/lib/journey/periodRange.ts` |
| `const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `src/pages/AdminTelemetriaPage.tsx` |
| `const t = setTimeout(() => setNotifReady(true), 2000);` | `src/pages/Index.tsx` |
| `const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);` | `src/pages/ResetPassword.tsx` |
| `const timer = setTimeout(() => { if (statusRef.current === 'loading') { statusRef.current = 'error'; setStatus('error'); setErrorMessage('Tempo esgotado. Tente …` | `src/pages/SSOCallback.tsx` |
| `setTimeout(() => navigate(destinoPosLogin), 1500);` | `src/pages/SSOCallback.tsx` |
| `return { start: start.toISOString(), end: addDays(start, 1).toISOString() };` | `src/pages/queue-details/queueMetrics.ts` |
| `setTimeout(() => setErrorKey(prev => prev + 1), 2000 * retryCountRef.current);` | `src/providers/AppProviders.tsx` |
| `const DAY_MS = 24 * 60 * 60 * 1000;` | `src/services/contact.service.ts` |
| `export const PENDING_ACTION_TTL_MS = 2 * 60 * 1000;` | `src/services/outbound-message.service.ts` |
| `if (!options?.requireInteraction) { setTimeout(() => notification.close(), 5000); }` | `src/utils/notificationSounds.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/_shared/ai-guards.ts` |
| `const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;` | `supabase/functions/_shared/evolution-instance-token.ts` |
| `const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/_shared/evolution-webhook-messages.ts` |
| `if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token;` | `supabase/functions/_shared/gmail-helpers.ts` |
| `const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;` | `supabase/functions/_shared/hmac-validation.ts` |
| `const DAY_MS = 24 * 60 * 60 * 1000;` | `supabase/functions/ai-churn-analysis/churn-risk.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/batch-fetch-avatars/index.ts` |
| `if (i + 5 < contacts.length) await new Promise(r => setTimeout(r, 1000));` | `supabase/functions/batch-fetch-avatars/index.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/cleanup-rate-limit-logs/index.ts` |
| `const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/cleanup-rate-limit-logs/index.ts` |
| `const STALE_SESSION_MS = 6 * 60 * 60 * 1000;` | `supabase/functions/connection-health-check/index.ts` |
| `const WEBHOOK_SILENT_MS = 30 * 60 * 1000;` | `supabase/functions/connection-health-check/index.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/connection-health-check/index.ts` |
| `export const LEVEL1_DEGRADED_MS = 30 * 60 * 1000;` | `supabase/functions/connection-health-check/index.ts` |
| `export const LEVEL1_DISCONNECTED_MS = 15 * 60 * 1000;` | `supabase/functions/connection-health-check/index.ts` |
| `export const LEVEL2_MS = 60 * 60 * 1000;` | `supabase/functions/connection-health-check/index.ts` |
| `expires_at: new Date(args.now.getTime() + 24 * 60 * 60 * 1000).toISOString(),` | `supabase/functions/detect-new-device/index.ts` |
| `await new Promise((r) => setTimeout(r, 1500));` | `supabase/functions/evolution-api/index.ts` |
| `await new Promise((r) => setTimeout(r, 2000));` | `supabase/functions/evolution-api/index.ts` |
| `const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h for hits` | `supabase/functions/fetch-link-preview/index.ts` |
| `const WINDOW_MS = 24 * 60 * 60 * 1000;` | `supabase/functions/metrics/index.ts` |
| `const NEW_PRODUCT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;` | `supabase/functions/promogifts-catalog/index.ts` |
| `export const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;` | `supabase/functions/recover-message-media/index.ts` |
| `const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);` | `supabase/functions/send-scheduled-report/index.ts` |
| `const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `supabase/functions/sync-call-records/index.ts` |
| `const CACHE_TTL_MS = 24 * 60 * 60 * 1000;` | `supabase/functions/talkx-ai/index.ts` |
| `const CONVERT_WINDOW_MS = 5 * 60 * 1000; // x-talkx-timestamp tolera ±5 min` | `supabase/functions/talkx-link/index.ts` |
| `const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();` | `supabase/functions/talkx-send/index.ts` |
| `options: { challenge, rpId, timeout: 60000, userVerification: 'required' },` | `supabase/functions/webauthn/index.ts` |
| `timeout: 60000, attestation: 'none', excludeCredentials,` | `supabase/functions/webauthn/index.ts` |
| `const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();` | `supabase/functions/webhook-diagnostic/index.ts` |
| `expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')` | `supabase/migrations/20251231115910_4da9c2d9-f6a8-4dc8-90ad-6efa0e1c9de0.sql` |
| `expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),` | `supabase/migrations/20251231123128_44dfe57a-e66d-4ffe-ad25-544966e4b9a3.sql` |
| `expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes')` | `supabase/migrations/20251231124607_b7b9f19a-a6cf-43d2-9ddf-5f87f4a84244.sql` |
| `AND created_at > now() - interval '1 hour';` | `supabase/migrations/20260410105209_872755b9-b0b5-4338-a541-688258a70ae9.sql` |
| `AND attempt_time < now() - interval '15 minutes';` | `supabase/migrations/20260829080000_fix_guard_session_user.sql` |
| `AND m.created_at > now() - interval '30 days'` | `supabase/migrations/20260902100005_e24_backfill_assigned_to_active_contacts.sql` |
| `first_response_breached = v_now > first_message_at + interval '5 minutes'` | `supabase/migrations/20260903120000_register_first_response.sql` |
| `v_now > v_first_message_at + interval '5 minutes'` | `supabase/migrations/20260903120000_register_first_response.sql` |
| `first_response_breached = v_now > first_message_at + interval '5 minutes'` | `supabase/migrations/20260903160000_harden_mark_first_response.sql` |
| `v_now > v_first_message_at + interval '5 minutes'` | `supabase/migrations/20260903160000_harden_mark_first_response.sql` |
| `p_responded_at > v_first_message_at + interval '5 minutes'` | `supabase/migrations/20260903225000_sla_first_response_v2.sql` |
| `p_responded_at > v_first_message_at + interval '5 minutes'` | `supabase/migrations/20260903233000_sla_base_only_valid_messages.sql` |
| `SELECT cron.schedule('cleanup-edge-rate-limits', '15 4 * * *', $cron$DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 day'$cron$);` | `supabase/migrations/20260905020000_edge_rate_limits.sql` |
| `SELECT cron.schedule('cleanup-edge-rate-limits', '*/15 * * * *', $cron$DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 hour'$cron$);` | `supabase/migrations/20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql` |
| `OR (q.status = 'processing' AND q.locked_at < now() - interval '5 minutes')` | `supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql` |
| `OR (status = 'processing' AND locked_at < now() - interval '5 minutes')` | `supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql` |
| `WHERE status = 'succeeded' AND completed_at >= now() - interval '24 hours'` | `supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql` |
| `AND locked_at < now() - interval '5 minutes'` | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `OR (q.status = 'processing' AND q.locked_at < now() - interval '5 minutes')` | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `OR (status = 'processing' AND locked_at < now() - interval '5 minutes')` | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `WHERE status = 'succeeded' AND completed_at >= now() - interval '24 hours'` | `supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql` |
| `AND locked_at < now() - interval '5 minutes'` | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `WHERE status = 'processing' AND locked_at < now() - interval '5 minutes'` | `supabase/migrations/20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql` |
| `v_cutoff timestamptz := now() - interval '90 days';` | `supabase/migrations/20260916150000_talkx_e89_benchmarks.sql` |
| `v_cutoff timestamptz := now() - interval '90 days';` | `supabase/migrations/20260916220000_fix_talkx_benchmarks_anon_grant_and_e90_execute.sql` |
| `AND updated_at < now() - interval '90 seconds';` | `supabase/migrations/20260925100542_agent_presence_server_ttl.sql` |
| `ELSE (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'` | `supabase/migrations/20260926112500_dashboard_leaderboard_rpc.sql` |
| `WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'` | `supabase/migrations/20260926112500_dashboard_leaderboard_rpc.sql` |
| `p_since timestamptz DEFAULT now() - interval '1 day',` | `supabase/migrations/20260927120000_dashboard_kpi_p_since_default_null_guard.sql` |
| `IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN` | `supabase/migrations/20260927600000_fix_multiplix_dispatch_start_sending.sql` |
| `CREATE OR REPLACE FUNCTION public.team_messages_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN IF OLD.send …` | `supabase/migrations/20260929180000_team_chat_e28_edit_guard_trigger.sql` |
| `ALTER TABLE public.team_conversation_members ADD CONSTRAINT team_conv_members_last_read_at_check CHECK (last_read_at IS NULL OR last_read_at <= now() + interval …` | `supabase/migrations/20260929210000_team_chat_e31_conversation_members_constraints.sql` |
| `IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN` | `supabase/migrations/20260929600000_multiplix_send_engine_fixes.sql` |
| `date_trunc('day', p_to) - interval '1 day',` | `supabase/migrations/20260930670000_talkx_v16_time_series_sent_delivered.sql` |
| `interval '1 day'` | `supabase/migrations/20260930670000_talkx_v16_time_series_sent_delivered.sql` |
| `where created_at >= (now() - interval '30 days')` | `supabase/migrations/20260930740000_catalogo_send_stats.sql` |
| `IF v_dispatch.status = 'sending' AND v_dispatch.updated_at > now() - interval '3 minutes' THEN` | `supabase/migrations/20261002521230_f59_transition_dispatch_enum_cast.sql` |
| `v_minute_start := statement_timestamp() - interval '1 minute';` | `supabase/migrations/20261002551230_talkx_limits_ritmo.sql` |
| `v_next_day_at := v_day_start + interval '1 day';` | `supabase/migrations/20261002551230_talkx_limits_ritmo.sql` |
| `((p_to - interval '1 microsecond') AT TIME ZONE p_timezone)::date,` | `supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql` |
| `interval '1 day'` | `supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql` |
| `AND d.paused_at >= statement_timestamp() - interval '5 seconds';` | `supabase/migrations/20261002671230_f60_conexao_capacidades_e_risco.sql` |
| `IF p_occurred_at > now() + interval '1 hour' THEN` | `supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql` |
| `now() - interval '1 minute'` | `supabase/migrations/20261003192707_fixture_e2e_aba_arquivos_segunda_midia.sql` |
| `AND r.updated_at >= now() - interval '24 hours'` | `supabase/migrations/20261003242707_talkx_log_saude_alertas.sql` |
| `WHERE a.last_activity_at < now() - interval '15 minutes'` | `supabase/migrations/20261003242707_talkx_log_saude_alertas.sql` |
| `WHERE log.created_at < v_now - interval '30 days'` | `supabase/migrations/20261003242707_talkx_log_saude_alertas.sql` |
| `WHERE r.updated_at >= now() - interval '15 minutes'` | `supabase/migrations/20261003242707_talkx_log_saude_alertas.sql` |
| `ELSE (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '6 days') AT TIME ZONE 'America/Sao_Paulo'` | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `IF OLD.created_at < now() - interval '48 hours' THEN` | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `WHEN 'month' THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '29 days') AT TIME ZONE 'America/Sao_Paulo'` | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `IF v_purge_attempt_at IS NULL OR v_purge_attempt_at <= now() - interval '1 hour' THEN` | `supabase/migrations/20261004173439_talkx_tick_nao_aborta_no_expurgo.sql` |
| `WHERE log.created_at < v_now - interval '30 days'` | `supabase/migrations/20261004173439_talkx_tick_nao_aborta_no_expurgo.sql` |
| `expires_at timestamptz not null default (now() + interval '10 minutes'),` | `supabase/migrations/20261004195051_gmail_oauth_state_attempts.sql` |
| `IF v_purge_attempt_at IS NULL OR v_purge_attempt_at <= now() - interval '1 hour' THEN` | `supabase/migrations/20261005111026_talkx_storage_purge_drain.sql` |
| `-- CREATE OR REPLACE FUNCTION public.register_first_response_internal(p_contact_id uuid, p_responded_at timestamptz, p_before_created_at timestamptz DEFAULT NUL …` | `supabase/migrations/20261005151753_sla_first_response_granular.sql` |
| `ai_projection_updated_at = greatest(p_analyzed_at, v_current_projection + interval '1 microsecond'),` | `supabase/migrations/20261006160117_ai_context_version_atomic_persist.sql` |
| `-- and r.updated_at >= now() - interval '24 hours'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `-- where a.last_activity_at < now() - interval '15 minutes'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `-- where r.updated_at >= now() - interval '15 minutes'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `AND r.status_changed_at >= now() - interval '24 hours'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `WHERE a.last_activity_at < now() - interval '15 minutes'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `WHERE r.status_changed_at >= now() - interval '15 minutes'` | `supabase/migrations/20261006193547_talkx_purge_nao_falsa_falha_recente.sql` |
| `-- Rollback: UPDATE public.talkx_settings SET description = 'X032: dias de retencao de linhas terminais de IA (ai_jobs).' WHERE key = 'retention_days_ai'; CREAT …` | `supabase/migrations/20261006205053_talkx_expurgo_escopo_ai_jobs.sql` |
| `WHERE log.created_at < v_now - interval '30 days'` | `supabase/migrations/20261006205053_talkx_expurgo_escopo_ai_jobs.sql` |
| `-- CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = …` | `supabase/migrations/20261006211601_mx04_cota_conexao_itens_e_legado.sql` |
| `v_minute_start := statement_timestamp() - interval '1 minute';` | `supabase/migrations/20261006211601_mx04_cota_conexao_itens_e_legado.sql` |
| `v_next_day_at := v_day_start + interval '1 day';` | `supabase/migrations/20261006211601_mx04_cota_conexao_itens_e_legado.sql` |
| `AND created_at > now() - interval '1 hour';` | `supabase/migrations/20261006221242_recuperacao_anonima_pedido_reset.sql` |
| `-- Rollback: IF p_occurred_at > now() + interval '1 hour' THEN` | `supabase/migrations/20261006222007_talkx_conversion_defaults_webhook.sql` |
| `IF v_occurred_at > now() + interval '1 hour' THEN` | `supabase/migrations/20261006222007_talkx_conversion_defaults_webhook.sql` |
| `v_window := interval '60 seconds';` | `supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql` |
| `v_minute_start := statement_timestamp() - interval '1 minute';` | `supabase/migrations/20261009031223_talkx_multiplix_consumo_compartilhado.sql` |
| `v_next_day_at := v_day_start + interval '1 day';` | `supabase/migrations/20261009031223_talkx_multiplix_consumo_compartilhado.sql` |
| `-- create or replace function public.record_talkx_conversion(p_campaign_id uuid, p_external_ref text, p_value numeric, p_source text, p_currency text default 'B …` | `supabase/migrations/20261009031958_talkx_v4_x041_atribuicao_negocio_ganho_receita_roi.sql` |
| `IF p_occurred_at > now() + interval '1 hour' THEN` | `supabase/migrations/20261009031958_talkx_v4_x041_atribuicao_negocio_ganho_receita_roi.sql` |
| `AND hh.counted_on < (m.month_start + interval '1 month')::date` | `supabase/migrations/20261009063248_talkx_segment_library_stats.sql` |
| `v_end := (v_start + interval '1 month')::date;` | `supabase/migrations/20261009063248_talkx_segment_library_stats.sql` |
| `v_previous := (v_month - interval '1 month')::date;` | `supabase/migrations/20261009063248_talkx_segment_library_stats.sql` |
| `v_to := ((p_month_start + interval '1 month')::timestamp AT TIME ZONE v_tz);` | `supabase/migrations/20261009063248_talkx_segment_library_stats.sql` |
| `IF v_purge_attempt_at IS NULL OR v_purge_attempt_at <= now() - interval '1 hour' THEN` | `supabase/migrations/20261009160000_talkx_storage_purge_drain.sql` |
| `AND replied_at < v_now - interval '10 minutes'),` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| `LEAST(((p_day + 1)::timestamp AT TIME ZONE v_tz) - interval '1 microsecond', v_now), v_tz);` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| `count(*) FILTER (WHERE replied_at >= v_now - interval '10 minutes'),` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| `count(*) FILTER (WHERE replied_at >= v_now - interval '20 minutes'` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| `count(*) FILTER (WHERE sent_at < v_now - interval '10 minutes' AND delivered_at IS NOT NULL),` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| `count(*) FILTER (WHERE sent_at < v_now - interval '10 minutes'),` | `supabase/migrations/20261010060000_talkx_monitor_panel.sql` |
| … +64 linhas — lista completa em `context.json` | |

### H.3 Limites de paginação

| Limite | Arquivo |
|---|---|
| 20 | `src/components/admin/SupervisorCopilot.tsx` |
| 50 | `src/components/admin/SupervisorCopilot.tsx` |
| 10 | `src/components/admin/TrainingMode.tsx` |
| 500 | `src/components/ai/ChurnPredictionDashboard.tsx` |
| 200 | `src/components/chatbot/ChatbotExecutionsDashboard.tsx` |
| 1 | `src/components/connections/BusinessHoursIndicator.tsx` |
| 10 | `src/components/contacts/ContactActivityTimeline.tsx` |
| 20 | `src/components/contacts/ContactActivityTimeline.tsx` |
| 1 | `src/components/contacts/ContactCRMDialog.tsx` |
| 1 | `src/components/contacts/useContactFormValidation.ts` |
| 50 | `src/components/diagnostics/ConnectionHealthPanel.tsx` |
| 20 | `src/components/inbox/WhisperMode.tsx` |
| 1 | `src/components/inbox/useChatMediaSending.ts` |
| 1 | `src/components/inbox/useFileUploadLogic.ts` |
| 10 | `src/components/inbox/useGlobalSearchData.ts` |
| 15 | `src/components/inbox/useGlobalSearchData.ts` |
| 20 | `src/components/inbox/useGlobalSearchData.ts` |
| 50 | `src/components/inbox/chat/MentionAutocomplete.tsx` |
| 50 | `src/components/inbox/collaboration/InternalNotesPanel.tsx` |
| 15 | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| 20 | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| 1 | `src/components/onboarding/checklistSteps.ts` |
| 1000 | `src/components/reports/ConversationHeatmap.tsx` |
| 1000 | `src/components/reports/DemandForecast.tsx` |
| 10 | `src/components/security/RateLimitRealtimeAlerts.tsx` |
| 5 | `src/components/security/SecurityOverview.tsx` |
| 1 | `src/components/settings/CSATAutoConfig.tsx` |
| 1 | `src/components/settings/ChatbotL1Config.tsx` |
| 100 | `src/components/settings/FollowUpExecutionsHistory.tsx` |
| 1 | `src/components/settings/SkillBasedRoutingSettings.tsx` |
| 50 | `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` |
| 1000 | `src/components/settings/media-library/useMediaLibrary.ts` |
| 20 | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| 200 | `src/components/talkx/TalkXAnalytics.tsx` |
| 2000 | `src/components/talkx/TalkXCampaignPaused.tsx` |
| 100 | `src/components/talkx/TalkXCampaignRunning.tsx` |
| 2000 | `src/components/talkx/TalkXCampaignRunning.tsx` |
| 50 | `src/components/talkx/TalkXCampaignRunning.tsx` |
| 200 | `src/components/talkx/TalkXLiveMonitor.tsx` |
| 60 | `src/components/team-chat/useTeamChatPanel.ts` |
| 1000 | `src/hooks/admin/useSupervisorQueue.ts` |
| 500 | `src/hooks/admin/useSupervisorQueue.ts` |
| 5 | `src/hooks/analytics/useAIStats.ts` |
| 1 | `src/hooks/analytics/useActiveAIProvider.ts` |
| 500 | `src/hooks/analytics/usePerformanceSnapshots.ts` |
| 5000 | `src/hooks/analytics/useRealtimeDashboard.ts` |
| 400 | `src/hooks/analytics/useRecentSentimentAlerts.ts` |
| 400 | `src/hooks/analytics/useSentimentTrend.ts` |
| 1000 | `src/hooks/business/useAbandonmentRate.ts` |
| 50 | `src/hooks/business/useWarRoomAlerts.ts` |
| 1 | `src/hooks/calls/useCallChannels.ts` |
| 20 | `src/hooks/chat/useConversationAnalyses.ts` |
| 1 | `src/hooks/chat/useForwardMedia.ts` |
| 1 | `src/hooks/chat/useLatestAnalysis.ts` |
| 10 | `src/hooks/chat/useNewConversation.ts` |
| 1 | `src/hooks/chat/useNextBestAction.ts` |
| 20 | `src/hooks/chat/useRecommendedProducts.ts` |
| 1 | `src/hooks/chat/useTeamChatNotifications.ts` |
| 5 | `src/hooks/communication/useSipClient.ts` |
| 20 | `src/hooks/crm/useContactCrm360.ts` |
| 5000 | `src/hooks/dashboard/useQueueHealth.ts` |
| 20 | `src/hooks/gamification/useAgentGamification.ts` |
| 1 | `src/hooks/inbox/useAutoCloseConversations.ts` |
| 20 | `src/hooks/inbox/useMentionableProfiles.ts` |
| 15 | `src/hooks/integrations/useCatalogContactSearch.ts` |
| 500 | `src/hooks/integrations/useCatalogSendHistory.ts` |
| 1 | `src/hooks/integrations/useCatalogSendReadiness.ts` |
| 0 | `src/hooks/integrations/useCustomEmojis.ts` |
| 1 | `src/hooks/integrations/useEmailThreadForContact.ts` |
| 200 | `src/hooks/integrations/useGmail.ts` |
| 100 | `src/hooks/integrations/useMetaCAPIData.ts` |
| 50 | `src/hooks/integrations/useTalkXEvents.ts` |
| 500 | `src/hooks/integrations/useTalkXInsights.ts` |
| 2000 | `src/hooks/integrations/useTalkXMonitor.ts` |
| 1 | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| 1 | `src/hooks/integrations/useTalkXServiceStatus.ts` |
| 10 | `src/hooks/integrations/useTalkXTemplates.ts` |
| 1 | `src/hooks/integrations/useWhatsAppStatus.ts` |
| 50 | `src/hooks/queues/useQueueDetails.ts` |
| 200 | `src/hooks/security/useAuditLogDashboard.ts` |
| 1 | `src/hooks/sla/useApplicableSLA.ts` |
| 1000 | `src/hooks/sticker-picker/useStickerPicker.ts` |
| 1 | `src/hooks/system/useDiagnosticsData.ts` |
| 10 | `src/hooks/system/useDiagnosticsData.ts` |
| 20 | `src/hooks/system/useDiagnosticsData.ts` |
| 1 | `src/hooks/system/useGeoBlocking.ts` |
| 1 | `src/hooks/system/useLoginBlockedLog.ts` |
| 100 | `src/hooks/system/useNotifications.ts` |
| 1 | `src/hooks/system/useSecurityPushNotifications.ts` |
| 100 | `src/hooks/team-chat/useDepartmentManagement.ts` |
| 500 | `src/hooks/team-chat/useParticipantStats.ts` |
| 200 | `src/hooks/team-chat/useTeamMessages.ts` |
| 1 | `src/hooks/ui/useOnboardingChecklist.ts` |
| 500 | `src/pages/AdminTelemetriaPage.tsx` |
| 1 | `src/services/contact.service.ts` |
| 200 | `src/services/contact.service.ts` |
| 3 | `supabase/functions/_shared/ai-conversation-pipeline.ts` |
| 1 | `supabase/functions/_shared/ai-usage.ts` |
| 1 | `supabase/functions/_shared/evolution-helpers.ts` |
| 500 | `supabase/functions/_shared/evolution-sync-actions.ts` |
| 1 | `supabase/functions/_shared/evolution-webhook-handlers.ts` |
| 1 | `supabase/functions/_shared/evolution-webhook-messages.ts` |
| 1 | `supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| 20 | `supabase/functions/ai-auto-tag/index.ts` |
| 5 | `supabase/functions/ai-auto-tag/index.ts` |
| 1 | `supabase/functions/ai-churn-analysis/churn-risk.ts` |
| 5 | `supabase/functions/ai-suggest-reply/index.ts` |
| 500 | `supabase/functions/batch-fetch-avatars/index.ts` |
| 1 | `supabase/functions/chatbot-l1/index.ts` |
| 15 | `supabase/functions/chatbot-l1/index.ts` |
| 5 | `supabase/functions/chatbot-l1/index.ts` |
| 1 | `supabase/functions/connection-health-check/index.ts` |
| 1 | `supabase/functions/create-user/index.ts` |
| 1 | `supabase/functions/crm-integration/index.ts` |
| 100 | `supabase/functions/crm-integration/index.ts` |
| 20 | `supabase/functions/crm-integration/index.ts` |
| 3 | `supabase/functions/crm-integration/index.ts` |
| 5000 | `supabase/functions/evolution-api/index.ts` |
| 10 | `supabase/functions/migrate-media-storage/index.ts` |
| 1 | `supabase/functions/multiplix-dispatch/actions/blocks.ts` |
| 1 | `supabase/functions/multiplix-send/index.ts` |
| 1 | `supabase/functions/talkx-ai/index.ts` |
| 1 | `supabase/functions/voice-copilot-action/index.ts` |
| 10 | `supabase/functions/voice-copilot-action/index.ts` |
| 20 | `supabase/functions/voice-copilot-action/index.ts` |
| 5 | `supabase/functions/voice-copilot-action/index.ts` |
| 1 | `supabase/functions/webauthn/index.ts` |
| 1 | `supabase/functions/whatsapp-webhook/index.ts` |
| 1000 | `supabase/migrations/20261003072707_ia056_agregacao_no_servidor.sql` |
| 1 | `supabase/migrations/20261005151753_sla_first_response_granular.sql` |

## I. Regras implícitas em mensagens de erro/validação

| Mensagem | Arquivo |
|---|---|
| ,persisted_action_present: | `docs/reconciliation/reaudit/2026-10-03/probes/auth/second-pass-probes.cjs` |
| Unexpected import  | `docs/reconciliation/reaudit/2026-10-03/probes/auth/second-pass-probes.cjs` |
| }];  const saveRules=expression(file, | `docs/reconciliation/reaudit/2026-10-03/probes/auth/second-pass-probes.cjs` |
| Unexpected import  | `docs/reconciliation/reaudit/2026-10-03/probes/auth/source-probes.cjs` |
| ,metadata:{contact_id: | `docs/reconciliation/reaudit/2026-10-03/reports/inbox/probes/pass5/run.mjs` |
| NETWORK_DISABLED_BY_PROBE | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe-ai-review.mjs` |
| Import denied: ${name} | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe-observability.mjs` |
| synthetic rejected promise | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe-observability.mjs` |
| Network forbidden by offline probe | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe-second-pass.mjs` |
| );   assert.match(nullOutput.props.className,/min-h-screen/u);   assert.match(words(nullOutput),/Ops! Algo deu errado/u);   const explicit = { type: | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe-telemetry-error.mjs` |
| Network prohibited in infra re-audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/infra/probe.mjs` |
| Committed server-side, response lost (synthetic) | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Controlled failure | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Unexpected preview/create path | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Unexpected schema response | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Unmocked import: ${p} | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Unused query | `docs/reconciliation/reaudit/2026-10-03/reports/modules/offline_probes.cjs` |
| Formatted parser diagnostics | `docs/reconciliation/reaudit/2026-10-03/reports/modules/vendor_prepare.cjs` |
| Function traversal mismatch | `docs/reconciliation/reaudit/2026-10-03/reports/modules/vendor_prepare.cjs` |
| Original parser diagnostics | `docs/reconciliation/reaudit/2026-10-03/reports/modules/vendor_prepare.cjs` |
| Fixture has one final target | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| Group mounting disabled | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| No DB expected in group fixture | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| No provider call expected during maintenance | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| Not part of fixture | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| Real network forbidden | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| Unspecified Omni query ${table} | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| fixture transient server error | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-channel-consumers.mjs` |
| Fallback not expected | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-final-endpoints.mjs` |
| Network forbidden in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-final-endpoints.mjs` |
| Unexpected network boundary in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-final-endpoints.mjs` |
| Unexpected table ${table} | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-final-endpoints.mjs` |
| Use explicit DI boundary | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-final-endpoints.mjs` |
| Network forbidden in audit | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-persistence.mjs` |
| No toast should run in this path | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-persistence.mjs` |
| Unexpected table ${table} | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-persistence.mjs` |
| Effects/timers must not run in this fixture | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| Lifecycle DB effect intentionally not executed | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| Network forbidden in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| No write expected for failed sync | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| Not exercised | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| One recipient should not invoke delay | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-frontend-providers.mjs` |
| Network forbidden in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-media-ai-control.mjs` |
| No permission RPC expected in this source path | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-media-ai-control.mjs` |
| No stream in fixture | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-media-ai-control.mjs` |
| Valid fixture only | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-media-ai-control.mjs` |
| fixture quota denied | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-media-ai-control.mjs` |
| Network forbidden in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-multiplix-review.mjs` |
| Real fetch forbidden in audit probe | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-privileged-effects.mjs` |
| Unexpected authorization denial | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-privileged-effects.mjs` |
| , metadata: { mes:  | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| Invalid-input fixture was not part of these probes | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| Missing fixture ${name} | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| Real network forbidden | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| Unspecified network boundary | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| unauthorized | `docs/reconciliation/reaudit/2026-10-03/reports/providers/reproduce-security-maintenance.mjs` |
| Invalid manifest path | `docs/reconciliation/reaudit/2026-10-03/reports/providers/verify-source.mjs` |
| Refusing audit: checkout HEAD differs from the pinned commit | `docs/reconciliation/reaudit/2026-10-03/reports/providers/verify-source.mjs` |
| Refusing audit: root source integrity manifest is incompatible | `docs/reconciliation/reaudit/2026-10-03/reports/providers/verify-source.mjs` |
| Refusing audit: source integrity mismatch at ${entry.path} | `docs/reconciliation/reaudit/2026-10-03/reports/providers/verify-source.mjs` |
| Refusing audit: unexpectedly incomplete backend manifest | `docs/reconciliation/reaudit/2026-10-03/reports/providers/verify-source.mjs` |
| Unexpected runtime dependency | `docs/reconciliation/reaudit/2026-10-03/tools/call_engine_probes.cjs` |
| Usage: node call_engine_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/call_engine_probes.cjs` |
| Unexpected retry | `docs/reconciliation/reaudit/2026-10-03/tools/call_lifecycle_probes.cjs` |
| Usage: node call_lifecycle_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/call_lifecycle_probes.cjs` |
| Usage: node call_overlay_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/call_overlay_probes.cjs` |
| Invalid source path | `docs/reconciliation/reaudit/2026-10-03/tools/catalog_microfunctions.mjs` |
| Snapshot drift:  | `docs/reconciliation/reaudit/2026-10-03/tools/catalog_microfunctions.mjs` |
| Usage: node catalog_microfunctions.mjs SOURCE INTEGRITY_JSON TYPESCRIPT_JS OUT_DIR | `docs/reconciliation/reaudit/2026-10-03/tools/catalog_microfunctions.mjs` |
| Network is forbidden in these offline probes | `docs/reconciliation/reaudit/2026-10-03/tools/communication_probes.cjs` |
| SOURCE, INTEGRITY_JSON, TYPESCRIPT_JS and OUTPUT required | `docs/reconciliation/reaudit/2026-10-03/tools/communication_probes.cjs` |
| Unexpected new send | `docs/reconciliation/reaudit/2026-10-03/tools/communication_probes.cjs` |
| synthetic denial | `docs/reconciliation/reaudit/2026-10-03/tools/communication_probes.cjs` |
| Unexpected invalid fixture | `docs/reconciliation/reaudit/2026-10-03/tools/gmail_oauth_probes.cjs` |
| Unexpected mocked URL | `docs/reconciliation/reaudit/2026-10-03/tools/gmail_oauth_probes.cjs` |
| Usage: node gmail_oauth_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/gmail_oauth_probes.cjs` |
| Source changed: ${file} | `docs/reconciliation/reaudit/2026-10-03/tools/import_graph.mjs` |
| Usage: node mobile_shell_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/mobile_shell_probes.cjs` |
| Usage: node platform_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/platform_probes.cjs` |
| Usage: node queue_tail_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/queue_tail_probes.cjs` |
| Four arguments required | `docs/reconciliation/reaudit/2026-10-03/tools/root_source_probes.cjs` |
| Usage: node sla_navigation_probe.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT | `docs/reconciliation/reaudit/2026-10-03/tools/sla_navigation_probe.cjs` |
| Node is required; --repo also requires Git with the pinned revisions locally available | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/run_probes.py` |
| Original-validator reproduction failed:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/run_probes.py` |
| Pinned Git object unavailable:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/run_probes.py` |
| Source hash mismatch; refusing execution:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/run_probes.py` |
| Source path escapes its declared directory | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/run_probes.py` |
| Audit root cannot be a symlink | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Bundle file set mismatch; extra= | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Bundle root cannot be a symlink | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Byte count mismatch:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Composed R2 + extension file set mismatch | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Duplicate, invalid or self-referential manifest path | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Extension must be at its declared path under audit_root | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Git blob mismatch:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Historical manifest differs from pinned R2; reconciliation required | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Invalid SHA256:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Invalid relative path | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Manifest bytes_of_hashed_files mismatch | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Manifest file_count mismatch | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Manifest requires a nonempty files list | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Missing file:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Noncanonical or escaping path:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| SHA256 mismatch:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Symlink rejected:  | `docs/reconciliation/reaudit/2026-10-04-delta-65679f3/verify_bundle.py` |
| Git source ref: expected a pinned 7-to-40-character hexadecimal ID | `docs/reconciliation/reproduce/validate_package.py` |
| Source checkout: expected a directory | `docs/reconciliation/reproduce/validate_package.py` |
| Source validation requires system Git at /usr/bin/git or /bin/git | `docs/reconciliation/reproduce/validate_package.py` |
| Validation report: evidence must be a real directory and target must not be a symlink | `docs/reconciliation/reproduce/validate_package.py` |
| Network is forbidden in these audit probes | `docs/reconciliation/reproduce/cross-module/reproduce_cross_module.mjs` |
| attested source must be a regular file: ${relativePath} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| cannot verify checkout HEAD at ${checkout} (${error.message}) | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| cannot verify checkout HEAD at ${root} (${error.message}) | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| checkout HEAD ${observedHead} is not the audited baseline ${expected.baseline_sha} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| invalid expected hash for ${relativePath} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| missing attested source ${relativePath} (${error.message}) | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| network request observed while the offline probe runs: ${url} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| only fixed relative source paths are accepted: ${relativePath} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| pins must declare baseline_sha and source_sha256 | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| pins must list at least one attested source | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| source escapes the checkout: ${relativePath} | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| unattested source bytes for ${relativePath} (expected ${expectedHash}, observed ${observed}) | `docs/reconciliation/reproduce/lib/source-provenance.mjs` |
| Expected a regular ${kind} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Expected at most one repository root argument | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Invalid pinned source boundaries | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Invalid repository root | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Media forbidden in text probe | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Network forbidden in audit probe | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Path must be canonical | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Pinned source marker must occur exactly once | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Real DB client forbidden | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Repository HEAD must equal audited baseline ${BASELINE} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Repository root must equal the canonical Git toplevel | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Source SHA-256 mismatch: ${source.path} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Source byte length mismatch: ${source.path} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Source changed while opening: ${source.path} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Source changed while reading: ${source.path} | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Source escapes the attested repository root | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Storage forbidden in this text probe | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Symlink paths are forbidden in this probe | `docs/reconciliation/reproduce/multiplix/reproduce_multiplix.mjs` |
| Baseline SHA256 mismatch: ${relativePath} | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Missing CSS block: ${header} | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Missing inline boot script in pinned source | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Network is disabled in the offline Skins probe | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Source escapes checkout: ${relativePath} | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Unterminated CSS block: ${header} | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Unterminated CSS comment in pinned source | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Unterminated static import in pinned source | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| simulated quota exhausted | `docs/reconciliation/reproduce/skins/skins_probe.mjs` |
| Unattested module: ${p} | `docs/reconciliation/reproduce/volume/volume_offline_probe.mjs` |
| storage denied | `docs/reconciliation/reproduce/volume/volume_offline_probe.mjs` |
| REMOTE_FULL_SUITE_BLOCKED | `e2e/auth-diagnostics.ts` |
| TARGET_CREDENTIALS | `e2e/auth-diagnostics.ts` |
| TARGET_DOMAIN_UNVERIFIED | `e2e/auth-diagnostics.ts` |
| TARGET_HTTPS_REQUIRED | `e2e/auth-diagnostics.ts` |
| TARGET_INVALID | `e2e/auth-diagnostics.ts` |
| TARGET_NOT_ORIGIN | `e2e/auth-diagnostics.ts` |
| TARGET_ORIGIN_REJECTED | `e2e/auth-diagnostics.ts` |
| ) generico: o app dispara toasts alheios ao login   // (ex.:  | `e2e/auth.setup.ts` |
| E2E_TEST_EMAIL e/ou E2E_TEST_PASSWORD nao estao definidas. Os testes que dependem de  | `e2e/auth.setup.ts` |
| [E2E setup/${diagnostic.code}] ${diagnostic.message} | `e2e/auth.setup.ts` |
| [E2E setup/${diagnostic.code}] ${diagnostic.message} Tentativas realizadas: ${tentativa}. | `e2e/auth.setup.ts` |
| [E2E setup/${diagnostic.code}] ${diagnostic.message} Veja o trace do Playwright. | `e2e/auth.setup.ts` |
| [E2E setup] O app nao respondeu em 15 s ao navegar para /auth.  | `e2e/auth.setup.ts` |
| Sessão Supabase não encontrada no localStorage | `e2e/fixtures/contacts-page.ts` |
| consulta de contacts falhou: HTTP ${res.status()} | `e2e/fixtures/contacts-page.ts` |
| limpeza E97: consulta de contacts falhou HTTP ${res.status()} | `e2e/fixtures/contacts-page.ts` |
| limpeza E97: delete_contact falhou HTTP ${del.status()} | `e2e/fixtures/contacts-page.ts` |
| storageState sem access_token: rode o projeto  | `e2e/fixtures/contacts-page.ts` |
| Falha ao inserir mensagem de fixture: HTTP ${msgResponse.status()}  | `e2e/fixtures/e2e-contact.ts` |
| Sessão do Supabase não encontrada no localStorage — e2e/auth.setup.ts deveria  | `e2e/fixtures/e2e-contact.ts` |
| set_conversation_status falhou: HTTP ${rpcResponse.status()} ${body} | `e2e/fixtures/e2e-contact.ts` |
| Recusado: UUID do usuário inválido para cleanup de draft E2E. | `e2e/fixtures/e2e-talkx.ts` |
| Recusado: nome de draft não corresponde a esta execução E2E. | `e2e/fixtures/e2e-talkx.ts` |
| Recusado: projeto e ID do teste são obrigatórios para nomear um draft E2E. | `e2e/fixtures/e2e-talkx.ts` |
| Sessão autenticada válida (token e UUID do usuário) não encontrada no localStorage —  | `e2e/fixtures/e2e-talkx.ts` |
| [e2e-talkx] cleanup exato do draft falhou: HTTP ${response.status()} | `e2e/fixtures/e2e-talkx.ts` |
| ambiguous | `e2e/fixtures/fixture-conversation.ts` |
| not-visible | `e2e/fixtures/fixture-conversation.ts` |
| [E2E tour/${code}] | `e2e/fixtures/onboarding-isolated.ts` |
| [e2e/isolated-fixture] configuração local incompleta ou divergente | `e2e/fixtures/supabase-env.ts` |
| [e2e] ${name} nao encontrada em .env.production. Esse arquivo e a fonte PRIMARIA  | `e2e/fixtures/supabase-env.ts` |
| seed arquivos-local: ${rotulo} aponta para host não-local (${host}). Proibido. | `e2e/fixtures/arquivos-local/seed.ts` |
| seed arquivos-local: variável ${nome} ausente (rode via env de zapp-db-local) | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: assinatura como usuário falhou (${signRes.status}): ${signJson.error ?? signRes.statusText} | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: contagem como usuário falhou (${res.status}): ${await res.text()} | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: corpo de referência vazio | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: download assinado falhou (${getRes.status}) | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: esperadas ${E2E_ARQUIVOS.contagens.todos} mídias visíveis, RLS devolveu ${totalMidia} | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: esperadas ${TOTAL_PAGINACAO} mídias de paginação, RLS devolveu ${totalPaginacao} | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: login do usuário sintético falhou (${res.status}): ${json.error_description ?? res.statusText} | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: objeto privado acessível via rota pública — fixture inseguro | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: objeto privado baixado difere do esperado (${baixado.length} bytes vs ${esperado.length}) | `e2e/fixtures/arquivos-local/seed.ts` |
| seed: upload ${caminho} falhou (${res.status}): ${await res.text()} | `e2e/fixtures/arquivos-local/seed.ts` |
| ${msg}: esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)} | `scripts/ai-context/cenarios.mjs` |
| Argumento desconhecido: ${arg} | `scripts/ci/a11y-button-name-ratchet.mjs` |
| Valor ausente para ${arg}. | `scripts/ci/a11y-button-name-ratchet.mjs` |
| ${metodo} ${caminho} -> ${r.status} | `scripts/ci/actions-kpi.mjs` |
| --level invalido: ${args.level} | `scripts/ci/audit-prod.mjs` |
| Argumento desconhecido: ${argv[index]} | `scripts/ci/audit-prod.mjs` |
| network disabled in fixture | `scripts/ci/branch-hygiene-runtime.unit.mjs` |
| PR sem headRefName | `scripts/ci/branch-podaveis.mjs` |
| a lista de PRs abertas não é um array | `scripts/ci/branch-podaveis.mjs` |
| a lista de PRs abertas veio cheia (${dados.length} >= limite ${limite}); pode haver PR que não veio | `scripts/ci/branch-podaveis.mjs` |
| argumento inválido: ${chave} | `scripts/ci/branch-podaveis.mjs` |
| falta --${obrigatorio} | `scripts/ci/branch-podaveis.mjs` |
| Argumento desconhecido: ${argv[index]} | `scripts/ci/bundle-budget.mjs` |
| asset referenciado no index.html nao existe: ${href} | `scripts/ci/bundle-budget.mjs` |
| vite.config.ts: bloco codeSplitting.groups nao encontrado | `scripts/ci/bundle-budget.unit.mjs` |
| vite.config.ts: fecho do bloco groups nao encontrado | `scripts/ci/bundle-budget.unit.mjs` |
| vite.config.ts: nenhum grupo com name/priority/test foi lido | `scripts/ci/bundle-budget.unit.mjs` |
| audit_report.pdf is timezone-dependent: ${zones.join( | `scripts/ci/check-audit-pdf-determinism.mjs` |
| Argumento desconhecido: ${argv[i]} | `scripts/ci/check-bundle-secrets.mjs` |
| ), { recursive: true });   mkdirSync(path.join(raiz,  | `scripts/ci/check-edge-error-exposure.unit.mjs` |
| fonte única de versões ausente ou ilegível em ${TOOLCHAIN_PATH}: ${error.message} | `scripts/ci/check-workflow-pins.mjs` |
| fonte única de versões incompleta em ${TOOLCHAIN_PATH}: falta a versão de  | `scripts/ci/check-workflow-pins.mjs` |
| fonte única de versões inválida em ${TOOLCHAIN_PATH}: o arquivo precisa ser um objeto JSON | `scripts/ci/check-workflow-pins.mjs` |
| contexto sem  | `scripts/ci/ci-artifacts.unit.mjs` |
| expressao incompleta em  | `scripts/ci/ci-artifacts.unit.mjs` |
| falta  | `scripts/ci/ci-artifacts.unit.mjs` |
| funcao desconhecida em  | `scripts/ci/ci-artifacts.unit.mjs` |
| operando nao booleano em  | `scripts/ci/ci-artifacts.unit.mjs` |
| sobrou token em  | `scripts/ci/ci-artifacts.unit.mjs` |
| Artifact-id sem arquivo correspondente | `scripts/ci/contexto-publicacao.unit.mjs` |
| Download simulado falhou: ${failDownload} | `scripts/ci/contexto-publicacao.unit.mjs` |
| ).   assert.doesNotMatch(readme, /não mais\s+lido direto pelo dashboard/,  | `scripts/ci/dashboard-readme-drift.unit.mjs` |
| I/O não permitido | `scripts/ci/e2e-auth-diagnostics.unit.mjs` |
| credential-canary password-canary | `scripts/ci/e2e-auth-isolation.unit.mjs` |
| leitura proibida: ${key} | `scripts/ci/e2e-auth-isolation.unit.mjs` |
| password-canary | `scripts/ci/e2e-auth-isolation.unit.mjs` |
| I/O externo proibido nesta simulação | `scripts/ci/e2e-auth-setup.unit.mjs` |
| Leitura de dados sensiveis proibida | `scripts/ci/e2e-auth-setup.unit.mjs` |
| [E2E setup/ISOLATION_PROOF] prova recusada | `scripts/ci/e2e-auth-setup.unit.mjs` |
| prazo simulado | `scripts/ci/e2e-auth-setup.unit.mjs` |
| forbidden- | `scripts/ci/e2e-email-navigation-diagnostics.unit.mjs` |
| rede proibida neste teste | `scripts/ci/e2e-isolated-alert.unit.mjs` |
| controlled missing file | `scripts/ci/e2e-isolated-fixtures.unit.mjs` |
| unexpected file read | `scripts/ci/e2e-isolated-fixtures.unit.mjs` |
| unexpected mutation:  | `scripts/ci/e2e-isolated-images.unit.mjs` |
| bad JWT | `scripts/ci/e2e-isolated-loader.unit.mjs` |
| bad signature | `scripts/ci/e2e-isolated-loader.unit.mjs` |
| bundle denied | `scripts/ci/e2e-isolated-loader.unit.mjs` |
| stat denied | `scripts/ci/e2e-isolated-loader.unit.mjs` |
| worker error | `scripts/ci/e2e-isolated-loader.unit.mjs` |
| credentials read before gateway verification | `scripts/ci/e2e-isolated-login-seed.unit.mjs` |
| credentials read before isolation | `scripts/ci/e2e-isolated-login-seed.unit.mjs` |
| Unexpected controlled boundary:  | `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| diagnostic-write-failed | `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| disk-full | `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| must-not-read-service-role | `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| synthetic transport rejection | `scripts/ci/e2e-isolated-runtime-probe.unit.mjs` |
| private-sentinel write failure | `scripts/ci/e2e-isolated-runtime.unit.mjs` |
| helper must not open SQL | `scripts/ci/e2e-isolated-seed-diagnostic.unit.mjs` |
| synthetic EPIPE | `scripts/ci/e2e-isolated-seed-diagnostic.unit.mjs` |
| credential read too early | `scripts/ci/e2e-isolated-seed.unit.mjs` |
| sensitive-file-content | `scripts/ci/e2e-isolated-seed.unit.mjs` |
| sensitive-response-content | `scripts/ci/e2e-isolated-seed.unit.mjs` |
| ECONNREFUSED | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| Timeout 10000ms exceeded | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| connection refused | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| context failed | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| controlled invalid JSON | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| frame unavailable | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| invalid peer certificate:  | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| must-not-fetch | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| operation timed out | `scripts/ci/e2e-isolated-tls.unit.mjs` |
| ISOLATION_BROWSER | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| assertion-failed-canary | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| click blocked | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| credential-getter-reached | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| not-visible | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| private-file-canary | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| synthetic-login-failure | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| tour absent | `scripts/ci/e2e-isolated-tour.unit.mjs` |
| blocked | `scripts/ci/e2e-media-volume-fixture.unit.mjs` |
| seed-exit- | `scripts/ci/e2e-media-volume-fixture.unit.mjs` |
| rede proibida neste teste | `scripts/ci/e2e-recovery.unit.mjs` |
| R1_SKIP | `scripts/ci/e2e-tarefas-project.unit.mjs` |
| RPC ${rpc} recusada (HTTP ${resposta.status}) | `scripts/ci/e2e-teardown.mjs` |
| login do usuario de teste nao devolveu access_token | `scripts/ci/e2e-teardown.mjs` |
| login do usuario de teste recusado (HTTP ${login.status}) | `scripts/ci/e2e-teardown.mjs` |
| deno coverage falhou: ${cobertura.stderr} | `scripts/ci/edge-coverage-authz.unit.mjs` |
| deno coverage não executou: ${cobertura.error.message} | `scripts/ci/edge-coverage-authz.unit.mjs` |
| não gero docs com teste vermelho: ${falhas.join( | `scripts/ci/edge-coverage-authz.unit.mjs` |
| HTTP 502 | `scripts/ci/fila-merge.unit.mjs` |
| GitHub API ${method} ${path} → ${res.status}: ${text} | `scripts/ci/github-settings-guard.mjs` |
| TypeScript local nao encontrado em ${tscEntry}.  | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} (falha de CLI, nao lista de diagnosticos): ${snippet(output)} | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} com diagnostico GLOBAL (config/CLI quebrada), que nao e uma  | `scripts/ci/implicit-any-ratchet.mjs` |
| tsc saiu com exit ${status} sem nenhum diagnostico TypeScript reconhecivel  | `scripts/ci/implicit-any-ratchet.mjs` |
| gh mock não coberto: ${method} ${path} | `scripts/ci/issue-rotativa.unit.mjs` |
| ${label} falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)} | `scripts/ci/lint-ratchet.mjs` |
| --base nao combina com --staged. | `scripts/ci/lint-ratchet.mjs` |
| --base nao combina com --update-baseline. | `scripts/ci/lint-ratchet.mjs` |
| --staged nao combina com --update-baseline. | `scripts/ci/lint-ratchet.mjs` |
| Argumento desconhecido: ${argument} | `scripts/ci/lint-ratchet.mjs` |
| Baseline ESLint invalido ou com schema diferente de ${SCHEMA_VERSION}. | `scripts/ci/lint-ratchet.mjs` |
| ESLint falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)} | `scripts/ci/lint-ratchet.mjs` |
| ESLint local nao encontrado. Execute a instalacao das dependencias primeiro. | `scripts/ci/lint-ratchet.mjs` |
| ESLint nao produziu JSON valido: ${error.message} | `scripts/ci/lint-ratchet.mjs` |
| … +1646 linhas — lista completa em `context.json` | |

## J. Controle de acesso no código (checagens de perfil/permissão)

| Valor comparado | Arquivo |
|---|---|
| `agent` | `src/components/admin/TrainingMode.tsx` |
| `customer` | `src/components/admin/TrainingMode.tsx` |
| `admin` | `src/components/agents/AgentsView.tsx` |
| `supervisor` | `src/components/agents/AgentsView.tsx` |
| `null` | `src/components/auth/ProtectedRoute.tsx` |
| `admin` | `src/components/calls/TelefoniaView.tsx` |
| `supervisor` | `src/components/calls/TelefoniaView.tsx` |
| `undefined` | `src/components/contacts/BulkActionsBar.tsx` |
| `admin` | `src/components/inbox/WhisperMode.tsx` |
| `supervisor` | `src/components/inbox/WhisperMode.tsx` |
| `granted` | `src/components/monitoring/hooks/useMonitoringNotifications.ts` |
| `value` | `src/components/multiplix/MultiplixView.tsx` |
| `denied` | `src/components/notifications/PushNotificationCard.tsx` |
| `admin` | `src/components/permissions/PermissionMatrix.tsx` |
| `permissionId` | `src/components/permissions/PermissionMatrix.tsx` |
| `role` | `src/components/permissions/PermissionMatrix.tsx` |
| `denied` | `src/components/security/SecurityNotificationsPanel.tsx` |
| `granted` | `src/components/security/SecurityNotificationsPanel.tsx` |
| `admin` | `src/components/security/SecurityOverview.tsx` |
| `admin` | `src/components/security/SecurityView.tsx` |
| `profileId` | `src/hooks/gamification/useAgentCelebrations.ts` |
| `denied` | `src/hooks/system/usePushNotifications.ts` |
| `granted` | `src/hooks/system/usePushNotifications.ts` |
| `granted` | `src/hooks/system/useSecurityPushNotifications.ts` |
| `admin` | `src/hooks/system/useUserRole.ts` |
| `role` | `src/hooks/system/useUserRole.ts` |
| `rolePermission` | `src/hooks/system/useUserRole.ts` |
| `supervisor` | `src/hooks/system/useUserRole.ts` |
| `leader` | `src/lib/calls/tabLeaderStore.ts` |
| `next` | `src/lib/calls/tabLeaderStore.ts` |
| `admin` | `src/pages/admin/useRolesPageState.ts` |
| `agent` | `src/pages/admin/useRolesPageState.ts` |
| `supervisor` | `src/pages/admin/useRolesPageState.ts` |
| `admin` | `src/providers/QuarantineMonitorProvider.tsx` |
| `supervisor` | `src/providers/QuarantineMonitorProvider.tsx` |
| `boolean` | `src/types/emailContactContext.ts` |
| `undefined` | `src/types/emailContactContext.ts` |
| `denied` | `src/utils/notificationSounds.ts` |
| `granted` | `src/utils/notificationSounds.ts` |
| `anon` | `supabase/functions/_shared/crm-integration-contract.ts` |
| `service_role` | `supabase/functions/_shared/crm-integration-contract.ts` |
| `true` | `supabase/functions/ai-kb-ingest/index.ts` |
| `true` | `supabase/functions/approve-password-reset/index.ts` |
| `true` | `supabase/functions/elevenlabs-voice-design/index.ts` |
| `true` | `supabase/functions/external-db-bridge/index.ts` |
| `admin` | `supabase/functions/invite-user/index.ts` |
| `agent` | `supabase/functions/invite-user/index.ts` |
| `supervisor` | `supabase/functions/invite-user/index.ts` |
| `true` | `supabase/functions/migrate-media-storage/index.ts` |
| `true` | `supabase/functions/multiplix-dispatch/index.ts` |
| `customers_own` | `supabase/functions/multiplix-dispatch/actions/audience.ts` |
| `string` | `supabase/functions/multiplix-dispatch/actions/audience.ts` |
| `true` | `supabase/functions/multiplix-dispatch/actions/lifecycle.ts` |
| `true` | `supabase/functions/multiplix-dispatch/actions/listing.ts` |
| `true` | `supabase/functions/multiplix-send/index.ts` |
| `true` | `supabase/functions/recover-corrupted-audios/index.ts` |
| `admin` | `supabase/migrations/20260830080000_fn_is_admin_and_fix_permissions_rls.sql` |
| `admin` | `supabase/migrations/20260902023200_consolidate_rls_select_messages_contacts.sql` |
| `postgres` | `supabase/migrations/20260925120000_fix_messages_insert_rls_contact_visibility.sql` |
| `owner` | `supabase/migrations/20260927270018_team_chat_e28_fix_find_or_create_race.sql` |
| `anon` | `supabase/migrations/20260927340000_fix_add_agent_xp_negative_and_guard.sql` |

## K. Testes como especificação (21093 testes em 2243 arquivos — nomes completos em `context.json`)

| Arquivo | Testes | Exemplos do que o sistema DEVE fazer |
|---|---|---|
| `src/components/catalog/__tests__/catalogShared.test.tsx` | 80 | catalogShared · formatPrice formata em BRL pt-BR · formatPrice arredonda para 2 casas · formatStock adiciona sufixo  … |
| `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` | 80 | MediaLibraryAdmin · Main Component Rendering · renders the main title · renders the description … |
| `src/components/talkx/__tests__/useCampaignEditor.test.tsx` | 80 | useCampaignEditor — draft integrity · rejects a nonexistent local DST time instead of silently moving the scheduled instant · converts a valid time after the DST transition using the offset in effect at that time · rejects an ambiguous local DST time instead of arbitrarily choosing one occurrence … |
| `src/components/team-chat/__tests__/team-chat-exhaustive-audit.test.ts` | 80 | Team Chat — Exhaustive Audit · Input Area Edge Cases · should not send empty/whitespace-only messages · should have character limit enforcement … |
| `src/hooks/__tests__/useExternalCatalog.test.ts` | 80 | useExternalCatalog · Initialization · initializes with empty state · exposes all expected methods … |
| `src/hooks/tasks/__tests__/workItemAggregates.test.ts` | 80 | Fase F — correções da auditoria · a busca ignora acento e caixa:  · lista nula não derruba o recorte (guarda  · concluída SEM carimbo entra nos 7 dias da Lista (mesma regra do Quadro) … |
| `supabase/functions/multiplix-send/index.test.ts` | 80 | personalize resolve {{empresa}} com o nome da empresa · personalize resolve {{saudacao}} para um período válido do dia · personalize mantém o texto byte a byte E reporta {{empresa}} sem valor em missing (MX06) · personalize usa fallback [variavel] para placeholder fora do conjunto fixo (nunca lança) … |
| `scripts/db-audit/check-migration-drift.test.mjs` | 72 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `src/lib/__tests__/emailHtml.test.ts` | 70 | sanitizeEmailHtml — XSS básico · remove <script> · remove event handlers (onclick, onerror, onload) · remove javascript: em href … |
| `src/hooks/__tests__/useEvolutionApi.test.ts` | 69 | useEvolutionApi - Exhaustive Test Suite · Initialization · starts with isLoading = false · exposes all supported functions … |
| `supabase/functions/talkx-send/index.test.ts` | 69 | personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao) · personalize falls back to a bracket placeholder for an unresolved variable instead of throwing · personalize substitutes the real value when the contact has that custom field · personalize resolves multiple custom values in the same message … |
| `src/lib/journey/__tests__/mappers.test.ts` | 66 | mapMessages · agrupa mensagens seguidas do MESMO autor em até 10 min · na virada de 10 min: exatamente 10 min agrupa, 10 min + 1 ms não agrupa · autores diferentes não entram na mesma rajada … |
| `src/lib/journey/__tests__/periodRange.test.ts` | 64 | resolveRange — atalhos (D04) · any devolve intervalo aberto e não marca inválido · today cobre o dia inteiro do relógio do aparelho · ${preset} começa em (hoje − ${dias - 1}) 00:00 e vai até o fim de hoje … |
| `src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx` | 62 | useAddressAutocomplete · proximidade depende das coordenadas, não da identidade do objeto · %s: centro equivalente conserva destaque e seleção sem repetir a busca · novo objeto com coordenadas zero não aborta nem substitui a consulta em voo … |
| `src/hooks/__tests__/useSipClient.test.ts` | 55 | useSipClient · should start with disconnected status · should set connecting status when connect is called · should become registered when registerer fires Registered … |
| `src/components/settings/theme/__tests__/presets.test.ts` | 54 | §1 catálogo · tem 19 presets com ids únicos · corporate é o primeiro · ordem é clássicas (10) seguidas de GX (9) … |
| `supabase/functions/_shared/ai-usage.test.ts` | 53 | logAiUsageDetached: com EdgeRuntime.waitUntil, entrega a promessa ao runtime sem bloquear · registrarConsumoDeDiagnostico: export do ai-proxy preserva o consumo provider_test · logAiUsageDetached: sem EdgeRuntime.waitUntil, AGUARDA a promessa até o insert concluir · ai-proxy: os logs de consumo usam  … |
| `src/lib/calls/adapters/__tests__/CallEngine.test.ts` | 52 | SipCallAdapter.setMuted (T18) · muteia a track de áudio e devolve o estado LIDO (não o pedido) · desmuta a track e devolve o estado lido · sem mídia devolve null, para o chamador decidir pela intenção … |
| `src/components/tasks/__tests__/TasksModule.test.tsx` | 50 | TasksModule — etapa 57 (QuickAdd da Agenda) · na Agenda existe um único QuickAdd, já apontando para o dia selecionado · TasksModule — etapa 45 (barra de filtros) · traz o toggle de concluídas na linha de captura e deixa a barra sem duplicar … |
| `src/lib/journey/__tests__/stats.test.ts` | 50 | computeJourneyStats — totais por categoria (S074) · conta cada categoria separada e a soma em  · linha com data inválida não entra na conta nem produz NaN · entrada vazia devolve zeros sem estourar … |
| `src/components/ai/__tests__/AutoTicketClassifier.test.tsx` | 49 | AutoTicketClassifier · Rendering · renders title · renders auto-classify switch … |
| `src/components/omnichannel/__tests__/OmnichannelInbox.test.tsx` | 49 | OmnichannelInbox · Projeção canônica de conversas · mostra a última mensagem de cada conversa em vez de só o cadastro · marca não lidas com a contagem vinda da projeção … |
| `src/hooks/system/__tests__/useDiagnosticsData.test.ts` | 48 | useDiagnosticsData — mensagens da janela de 24 h · conta só as mensagens do agente dentro da janela e calcula as taxas · as falhas recentes trazem só id, horário e motivo — sem nome nem conteúdo · base vazia: taxas 0 (sem divisão por zero) e nenhuma busca de contato … |
| `src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx` | 47 | ContactHeaderSection · renders contact first name · renders company name · does not render phone number or WhatsApp link … |
| `tests/contracts/ai-routing.contract.test.ts` | 47 | IA-031/034 — resolveProvider: um padrão por finalidade, nunca arbitrário · exatamente 1 padrão ativo para a finalidade → resolve para ele · 0 padrões → NO_PROVIDER (a ausência vira indisponibilidade explícita) · 2+ padrões para a mesma finalidade → AMBIGUOUS_PROVIDER (jamais escolher uma) … |
| `src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx` | 46 | ChurnPredictionDashboard · Rendering · renders title · renders subtitle … |
| `src/components/performance/__tests__/PerformanceMonitor.test.tsx` | 46 | PerformanceMonitor · Rendering · renders title · renders subtitle … |
| `src/components/catalog/__tests__/ExternalProductManagement.test.tsx` | 43 | ExternalProductManagement · mostra o título e a contagem total de produtos · E32: chip de sync recente mostra  · E32: chip de sync com mais de 24h mostra data/hora (tom neutro) … |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 43 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `src/components/catalog/__tests__/CatalogRail.test.tsx` | 42 | CatalogRail — E51 banner · renderiza a copy do banner e nao inclui o placeholder do mock · usa o 1o produto em destaque COM imagem (ignora destaque sem foto) · le a foto de primary_image_url (campo canonico do ExternalProduct) … |
| `src/components/catalog/__tests__/SendProductDialog.test.tsx` | 42 | SendProductDialog — Fase 7 (E72-E75 parcial) · mostra o contador de caracteres da mensagem (E73) · acima de 2000 caracteres, desabilita  · dentro do limite,  … |
| `src/components/security/__tests__/AuditLogDashboard.test.tsx` | 42 | AuditLogDashboard · Query columns · selects explicit columns instead of * for audit_logs · a lista de 200 pede ordem determinística, com desempate por id … |
| `src/hooks/__tests__/useNotificationSettings.test.tsx` | 42 | useNotificationSettings · loads settings on mount · has default settings when no user · exposes updateSettings function … |
| `src/hooks/integrations/__tests__/useTalkXInsights.test.ts` | 42 | pickBestHour (IA-167) · usa a hora em America/Sao_Paulo e expõe a amostra · abstém-se quando nenhuma hora alcança a amostra mínima · pickBestTemplate (IA-168) … |
| `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` | 42 | rulesToPostgrest · fails closed instead of dropping an unknown rule · keeps a valid rule as a PostgREST filter · escapes a trailing backslash before quoting, so the filter string cannot stay open … |
| `src/providers/__tests__/CallSessionProvider.test.tsx` | 42 | CallSessionProvider (T10) · aceite:  · openDialer emite zapp:navigate e sincroniza useNavigationHistory para voip · mantém os campos que a UI antiga consome (TelefoniaView/DialPad/ActiveCallBar) … |
| `supabase/functions/crm-integration/index.test.ts` | 42 | sidebar lookup resolves the expected RPC and logs only bounded telemetry · sidebar lookup returns 409 when the stable identity differs · intelligence lookup returns 409 when the stable identity differs · intelligence lookup resolves when the external identity matches the stable link … |
| `tests/contracts/ai-vision-classifiers-mock.contract.test.ts` | 41 | (1) visão: imagem embutida em DATA URL, download autenticado e modelo do servidor · classify-emoji baixa no servidor e envia  · classify-sticker segue a MESMA rota: data URL embutida e endpoint de visão · o endpoint do provedor de TEXTO padrão NUNCA é chamado quando a modalidade é visão … |
| `src/hooks/chat/__tests__/useForwardMessage.test.ts` | 40 | useForwardMessage — carga dos destinos ao abrir · só consulta o banco quando  · com allowGroups=false não busca a tabela de grupos · erro de rede/RLS ao buscar contatos: lista vazia, erro registrado e isLoading de volta a false … |
| `src/hooks/integrations/__tests__/useTalkXTemplates.test.ts` | 40 | useTalkXTemplates — listagem · carrega a lista com o select do criador e a ordem por uso/atualizacao · expoe lista vazia quando o banco responde null · propaga o erro de RLS/rede da listagem (nao engole) … |
| `src/lib/calls/adapters/__tests__/SipCallAdapter.test.ts` | 40 | SipCallAdapter — host, destino e validação do número (T09) · o host da URI vem do UA, não da sessão · é discável quando a URI resolve, e a URI leva o número com o host do UA · número malformado (a URI não resolve) não é discável … |
| `supabase/functions/connection-health-check/index.test.ts` | 40 | E24: cada conexão consulta o provedor com o token DELA, nunca com a chave global · E24: sem token próprio no Vault a instância não é consultada com a credencial de outra · E24: falha ao LER a credencial do Vault não usa a rede e registra o motivo · E25: GO logada SEM socket (Connected:false, LoggedIn:true) → degraded, nunca healthy … |
| `src/components/catalog/__tests__/ProductDetailDialog.test.tsx` | 39 | ProductDetailDialog — Fase 6 (galeria, SKU, rodapé) · mostra o contador  · com 1 imagem so nao mostra contador · seta → avanca a galeria e atualiza o contador … |
| `tests/contracts/ai-generate.contract.test.ts` | 39 | (1) interface congelada: o despacho existe com a forma do desenho · o módulo existe no caminho congelado e exporta generateWithRouting · GenerateParams carrega os 11 campos do desenho (lista pinada) · GenerateResult carrega os 10 campos do desenho (lista pinada) … |
| `tests/contracts/ai-jobs-estados-e-durabilidade.contract.test.ts` | 39 | (1) vocabulário congelado: os 7 estados nos três artefatos (IA-046) · worker  · interface  · banco: o check de ai_jobs.status contém exatamente os 7 congelados (e nada mais) … |
| `tests/contracts/ai-rate-limit-e-orcamento.contract.test.ts` | 39 | (1) sharedRateLimit: contador atômico com decisão inclusiva (IA-043) · dentro do limite → allowed · no limite EXATO → allowed (limite é inclusivo) · acima do limite → bloqueado … |
| `src/components/calls/__tests__/DialPad.test.tsx` | 38 | DialPad · renders all 12 dial buttons · renders sub-labels for digits 2-9 and 0 · renders number input when not in call … |
| `src/components/inbox/__tests__/template-utils.test.ts` | 38 | AVAILABLE_VARIABLES · lista as 7 variáveis oferecidas ao usuário, sem chave repetida · não oferece {{protocolo}}: não existe protocolo real e inventado é pior que nenhum · toda variável tem rótulo, exemplo e ícone … |
| `src/hooks/chat/__tests__/useScheduledReports.test.tsx` | 38 | useScheduledReports — leitura · carrega os relatórios do mais recente para o mais antigo · erro de leitura (RLS/rede) avisa o usuário e encerra o carregamento · useScheduledReports — destinatários … |
| `supabase/functions/_shared/__tests__/evolution-go-routes.test.ts` | 38 | sendText mapeia para /send/text com auth de instância · sendText traduz mentionsEveryOne e mentioned apenas quando presentes · sendMedia mapeia media→url e mediatype→type · sendWhatsAppAudio força type ptt e aceita audio ou media … |
| `src/components/talkx/__tests__/TalkX.test.tsx` | 37 | useTalkX · initializes with empty campaigns · has null selectedCampaignId by default · setSelectedCampaignId updates state … |
| `src/lib/__tests__/mediaVolumeStore.test.ts` | 37 | mediaVolumeStore · default e leitura · nasce com 80 e sem mute (E01) · mantém a identidade do snapshot quando nada muda (exigência do useSyncExternalStore) … |
| `src/services/__tests__/evolution.service.test.ts` | 37 | getEvolutionInstances · traduz a view segura: instance_name vem de  · devolve lista vazia quando a view volta vazia ou null (nunca undefined) · propaga o erro de leitura (RLS 42501) em vez de devolver lista vazia … |
| `supabase/functions/auth-login/index.test.ts` | 37 | negação por IP (403) responde ANTES de body/credenciais/efeitos · negação por país (403) não chama autenticação nem grava tentativa · erro de decisão responde 503 (indecidível, sem vazar regras) · bloqueio por país registra log_login_block com IP, país, motivo e user-agent … |
| `src/components/security/__tests__/RateLimitConfigPanel.test.tsx` | 36 | RateLimitConfigPanel · Rendering · renders title · renders description … |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | 36 | TalkXView wizard route integration · restores the routed draft and its requested step on first render · handles browser history changes without retaining the previous campaign · clears an inaccessible campaign route instead of opening an arbitrary editor … |
| `src/features/talk-me/__tests__/TalkMeView.test.tsx` | 36 | TalkMeView · mostra os dados reais e mantém o atendimento mais antigo selecionado · navega manualmente sem autoplay e oferece fallback para áudio e cadastro incompleto · aceita uma única identidade e só abre o chat depois da confirmação do servidor … |
| `src/lib/__tests__/slaTimeline.test.ts` | 36 | slaStatusForDuration · sem duração não há situação · sem prazo válido não há situação · dentro do prazo com folga é  … |
| `src/components/email/__tests__/EmailChatThread.test.tsx` | 35 | EmailChatThread · preserva a leitura antiga, avisa sobre nova mensagem e desce sob comando · não usa rolagem animada quando movimento reduzido está ativo · lifecycle: setSelectedThreadId … |
| `src/components/inbox/__tests__/linkPreviewUtils.test.ts` | 35 | isImageUrl · aceita as extensões de imagem conhecidas · ignora maiúsculas/minúsculas · aceita quando a extensão vem antes de query string … |
| `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` | 35 | TaskCheckbox — um checkbox circular para o módulo inteiro · é CIRCULAR (D16) e alterna pelo clique · guardado: aria-checked=true, nome  · desabilitado não dispara e sai do tab … |
| `src/lib/__tests__/chartColors.test.ts` | 35 | chartColors · CHART_COLORS · has primary colors · has semantic colors … |
| `tests/contracts/ai-image-input.contract.test.ts` | 35 | toInlineImage — caminho autenticado do Storage · baixa o objeto %s com service role e monta a data URL byte a byte · normaliza o mime com parâmetros do content-type · codifica cada segmento do caminho sem quebrar a URL do objeto … |
| `src/components/inbox/contact-details/__tests__/EditContactDialog.test.tsx` | 34 | EditContactDialog · renders dialog title · pre-fills contact name · pre-fills contact phone … |
| `src/features/talk-me/__tests__/useTalkMeQueue.test.tsx` | 34 | useTalkMeQueue · não consulta as RPCs enquanto a feature flag está desabilitada · carrega apenas a fila autorizada, normaliza os dados e remove o contato após o aceite · bloqueia duplo clique local enquanto o primeiro aceite aguarda o servidor … |
| `src/lib/__tests__/formatters.test.ts` | 34 | formatRelativeTime · usa o sufixo e o locale pt-BR em minutos · aceita string ISO e epoch (número) · formatSmartDate … |
| `src/lib/__tests__/mapboxGeocode.test.ts` | 34 | reverseGeocodeAddress · consulta lng,lat em pt com o token e devolve o place_name · coordenadas praticamente iguais (~1 m) e chamadas simultâneas compartilham uma consulta · estoura o timeout, aborta a requisição e devolve null … |
| `src/lib/__tests__/zappSchemas.test.ts` | 34 | zappSchemas · contatoSchema · validates valid contact · rejects missing nome … |
| `src/lib/calls/__tests__/phone.test.ts` | 34 | normalizeE164BR · normaliza os 10 formatos de entrada para a mesma forma E.164 · mantém fixo de 10 dígitos (assinante começando em 2–5) · recompõe o nono dígito em vários DDDs … |
| `supabase/functions/talkx-link/index.test.ts` | 34 | mergeUtm adiciona os UTM ao destino sem query · mergeUtm não sobrescreve parâmetro existente do destino · mergeUtm preserva URL sem link e URL inválida · GET registra clique e redireciona com UTM do link … |
| `tests/contracts/ai-capabilities.contract.test.ts` | 34 | IA-036 — BASE_CAPABILITIES: cada tipo anuncia apenas o que garante · lovable_ai: texto + tools/json/streaming · openai_compatible: texto + tools/json/streaming · google_gemini: texto + tools/json/streaming … |
| `src/components/catalog/__tests__/ExternalProductCatalog.test.tsx` | 33 | ExternalProductCatalog — CT-15 (primitivos da tela principal) · renderiza a grade com CatalogProductCard e a paginação do Talk X · mostra o estado vazio do Talk X quando não há produtos · mostra o estado de dados indisponíveis quando a edge falha (CATALOG_UPSTREAM_ERROR) … |
| `src/components/inbox/__tests__/LocationPicker.test.tsx` | 33 | LocationPicker · não oferece localização em tempo real (o provedor só entrega localização pontual) · mantém  · envia só coordenadas, nome e endereço — sem o campo isLive — e fecha o diálogo … |
| `src/components/mfa/__tests__/MFABackupCodes.test.tsx` | 33 | MFABackupCodes · Rendering · renders title and description · renders exactly 10 backup codes by default … |
| `src/hooks/analytics/__tests__/useGoalsDashboard.test.tsx` | 33 | useGoalsDashboard — funções de cor (limites) · progresso %i%% usa %s · fundo do progresso %i%% usa %s · oferece exatamente os três períodos do produto … |
| `src/lib/calls/__tests__/session.test.ts` | 33 | session — estado inicial · devolve um objeto novo, ocioso e sem sessão · session — transições válidas (Apêndice C) · ${caso.de} + ${caso.evento.type} → ${caso.para} … |
| `supabase/functions/multiplix-audience/index.test.ts` | 33 | F08: só destinatário classificado como eligible entra no disparo · F08: linha sem company_id não vira destinatário · F08: sem classificação explícita o destinatário entra como eligible · F08: campos que não existem no contrato não passam para a RPC … |
| `src/components/onboarding/__tests__/OnboardingTour.test.tsx` | 32 | TourProvider · provides default inactive state · starts tour with steps · navigates forward through steps … |
| `src/hooks/__tests__/useResourcePrefetch.test.ts` | 32 | usePrefetch · exposes prefetch function · exposes schedulePrefetch function · exposes cancelPrefetch function … |
| `src/hooks/integrations/__tests__/useGmail.test.ts` | 32 | useGmail · accounts query · retorna lista via callGmailFunction · fallback para supabase.rpc quando callGmailFunction lança … |
| `src/lib/__tests__/accessError.test.ts` | 32 | isAccessDeniedError — entradas inválidas · false para null · false para undefined · false para string … |
| `src/lib/__tests__/pdfThumbnail.test.ts` | 32 | renderPdfThumbnail — pdfjs-dist só sob demanda · não carrega pdfjs-dist no import do módulo e só o carrega na primeira miniatura · não tem import estático de pdfjs-dist no arquivo-fonte (o contrato M03 varre o resto) · aponta o worker para o asset resolvido com ?url e manda os BYTES baixados ao getDocument … |
| `src/lib/calls/__tests__/callStatus.test.ts` | 32 | normalizeStatus · mantém o status persistido  · traduz o legado completed → ended · traduz o legado ongoing → answered … |
| `src/components/inbox/__tests__/PlaybackSpeed.test.tsx` | 31 | AudioMessagePlayer - Playback Speed Controls · renders speed button with default 1x · speed button is visible for sent messages · speed button is visible for received messages … |
| `src/components/inbox/__tests__/useInteractiveMessage.test.ts` | 31 | useInteractiveMessage — limites do WhatsApp · aceita 3 botões e recusa o 4º com aviso · aceita 10 seções e recusa a 11ª com aviso · aceita 10 itens numa seção e recusa o 11º com aviso … |
| `src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx` | 31 | useLocationPicker · carrega o mapa e limpa o spinner no evento load · container que só aparece depois da troca de aba ainda cria o mapa e arma o watchdog · timeout do token vira mensagem de timeout e é reportado … |
| `src/components/notifications/__tests__/SoundVolumeControl.test.tsx` | 31 | SoundVolumeControl — sobe e desce o volume dos alertas · com o painel aberto, sobe o volume de 5 em 5 com a roda para cima · com o painel aberto, desce o volume de 5 em 5 com a roda para baixo · com o painel FECHADO a roda não mexe no volume (B5 — rolar a sidebar não ajusta) … |
| `src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx` | 31 | Tela 10 — configurações de agendamento (X137) · separa data e horário na parede local do fuso da campanha · o mínimo da data é hoje NO FUSO DA CAMPANHA, não hoje em UTC · salvar grava o mesmo instante e o mesmo fuso que foram lidos, com o perfil e a supressão … |
| `src/components/gmail/__tests__/EmailComposer.test.tsx` | 30 | EmailComposer — inicialização e comportamento de envio · modo new: campo Para vazio e botão Enviar desabilitado · restaura rascunho isolado da conta e sinaliza anexos que precisam ser selecionados novamente · remove a sessão local e o draft remoto ao confirmar descarte de conteúdo restaurado … |
| `src/components/inbox/chat/motion/__tests__/chat-motion.test.tsx` | 30 | AnimatedNumber · (1) com movimento reduzido entrega o valor final na hora, em pt-BR · (2) sem redução conta de 0 até o valor EXATO (não para em  · ShimmerSkeleton … |
| `src/components/inbox/tabs/__tests__/FileCard.test.tsx` | 30 | FileCard — layout do mockup (R04, S28–S31) · S28: a linha 1 e o nome; o nome completo/tecnico fica na dica · S29: a linha 2 e so tipo · tamanho, com virgula no decimal · S30: a linha 3 e a data curta do cartao … |
| `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` | 30 | TasksKpiStrip — etapa 017 (Atrasadas) · com atrasadas: tile vermelho e subtítulo  · sem atrasadas: tile neutro e subtítulo  · TasksKpiStrip — etapa 018 (Para hoje) … |
| `src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` | 30 | useWorkItemDraft — rascunho e patch mínimo (148/149) · o rascunho nasce dos campos do item (sem alterações pendentes) · sem item o rascunho é null e salvar é no-op · patch mínimo: alterar só o título envia SÓ o título … |
| `src/lib/__tests__/supervisorPriority.test.ts` | 30 | computePriority (regras P1-P4) · P1: sem atendente há exatamente 30 min (fronteira) · P1: 29 min sem atendente NÃO é P1 (fronteira abaixo) · P1: com atendente, 30 min de espera não dispara a regra de  … |
| `tests/contracts/ai-resilience-prazos-retry.contract.test.ts` | 30 | (1) classifyFailure: transitório × permanente × estado desconhecido (IA-042) · %s → transient (pode reenviar) · %s → permanent (NUNCA reenviar) · erro de REDE (sem resposta HTTP) → transient … |
| `src/components/catalog/__tests__/ContactSelectionStep.test.tsx` | 29 | ContactSelectionStep · botão de enviar fica desabilitado sem contato selecionado · com contato selecionado, o botão habilita e mostra o nome · sem busca e sem resultados, mostra o estado vazio de  … |
| `src/components/inbox/tabs/journey/__tests__/JourneyStatsHero.test.tsx` | 29 | JourneyStatsHero — estrutura e dados · renderiza os dois blocos com os valores do contato e do período · mantém a grade de 2 colunas no celular e 4 no desktop nos dois blocos de cartões · com dados vazios mostra traços e estados vazios, sem quebrar … |
| `src/components/tasks/__tests__/WorkItemSheet.test.tsx` | 29 | WorkItemSheet — FASE C (etapas 23–25) · 23: abre com os 8 campos e fecha no Esc · 25: Salvar só habilita com mudança, salva o patch e fecha · 24: após preencher o motivo, salvar leva o motivo pelo move … |
| `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts` | 29 | Team Chat — autenticação · useSendTeamMessage recusa o envio sem perfil e não chega ao banco · useSendTeamMessage grava a mensagem quando há perfil · Team Chat — regras usadas pela produção … |
| `src/hooks/__tests__/useChatSearch.test.ts` | 29 | useChatSearch · returns empty results initially · searches text content after debounce · excludes deleted messages … |
| `src/services/__tests__/contact-bulk.service.test.ts` | 29 | emptyOutcome / pendingIds · emptyOutcome devolve listas NOVAS a cada chamada (mutar uma não afeta a outra) · pendingIds junta recusados e falhos, na ordem (recusados primeiro) · applyContactFieldUpdate … |
| `src/components/contacts/__tests__/ExternalDataIntegration.test.tsx` | 28 | useExternalEmpresas · usa a ação estreita  · não cai mais no RPC admin-only nem no select genérico · sem  … |
| `src/components/email/__tests__/EmailContactPanel.test.tsx` | 28 | EmailContactPanel · renders only the safe company fields returned by the Email context · does not mistake a disabled CRM integration for a missing company · informs an authorized user when the explicit company link fails … |
| `src/components/layout/__tests__/Sidebar.test.tsx` | 28 | Sidebar — nav primária e grupos compartilham uma única área de rolagem · Multiplix continua entre Contatos e Catálogo, e todos os três estão dentro do mesmo container com scroll · staff SEM a permissão nomeada não vê Multiplix na nav primária (papel não basta — F25) · agente COM a permissão nomeada vê Multiplix na nav primária (F25) … |
| `src/components/ui/__tests__/VolumeDial.test.tsx` | 28 | VolumeDial — papel, nome e valores acessíveis · expõe role=slider focável com min/max/now/valuetext · usa valueLabel no centro e no texto falado quando informado · não tem violação de acessibilidade … |
| `src/hooks/system/__tests__/useGeoBlocking.test.ts` | 28 | useGeoBlocking — leitura dos dados · carrega settings e as duas listas, com ordem decrescente por created_at · lista vazia (data null) não quebra e vira lista vazia · exceção de rede na primeira leitura avisa e encerra o carregamento … |
| `supabase/functions/evolution-api/index.test.ts` | 28 | R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor · R2-API-001: admin conserva a operação (set-webhook chega ao provedor) · R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor · R2-API-001: ação desconhecida com admin passa o gate e cai no 404 do handler … |
| `supabase/functions/promogifts-catalog/index.actions.test.ts` | 28 | CT-77 sem Authorization devolve 401 e nem toca no client externo · CT-77 ação desconhecida devolve 400 Invalid request · CT-77 sem secrets do catálogo (e sem client injetado) devolve 503 CATALOG_NOT_CONFIGURED · CT-77 list_products devolve data + meta.total e aplica busca sem acento e OR de cores … |
| `supabase/functions/revoke-auth-sessions/index.test.ts` | 28 | global self: usuário comum pode revogar as próprias sessões sem ser admin · global de terceiro por usuário comum é recusado (403) · global de terceiro por admin é permitido (revoga por user_id) · local exige target_session_id … |
| `tests/contracts/ia131-audio-meme-conteudo.contract.test.ts` | 28 | (1) ai-audio-input: download AUTENTICADO e limites · baixa o objeto no endpoint autenticado e devolve base64 + formato mp3 · identidade de serviço usa a service role EXPLÍCITA (fluxo interno) · sem storageIdentity falha FECHADO, sem nenhuma rede … |
| `src/components/catalog/__tests__/useSendProduct.test.tsx` | 27 | useSendToContact — CT-04: caption na primeira foto, texto só sem foto · 3 fotos viram 3 mensagens (não 4), só a primeira com o texto como caption · sem foto, o texto vai como mensagem de texto (1 mensagem) · 1 foto usa o mesmo caminho de 1 mensagem (sem texto solto) … |
| `src/components/talkx/__tests__/talkxRoute.test.ts` | 27 | Talk X route contract (X052) · sem parâmetros abre a Visão geral e não normaliza nada · lê a aba e a sub-visão gravadas · tab=campaigns é alias de overview … |
| `src/hooks/analytics/__tests__/useAIStats.test.tsx` | 27 | calculateTrend — variação entre janelas · (%s -> %s) = %s/change %s/%% %s · variação abaixo de 1% é reportada como estável, sem número inventado · anterior zero com atual positivo é alta de 100% (não divisão por zero) … |
| `src/hooks/crm/__tests__/useContactsSearch.test.tsx` | 27 | useContactsSearch — parâmetros enviados ao banco · primeira carga manda os parâmetros default e NÃO manda include_legacy · trocar de aba vira contact_type_filter e volta para a página 0 · useContactsSearch — paginação e contagem … |
| `src/lib/__tests__/scenario-simulation.test.ts` | 27 | Simulação: computeChurnRisk (500 contatos aleatórios) · score sempre dentro de [0, 100] · riskLevel sempre coerente com o score · reasons nunca vazio e payload sempre completo … |
| `src/lib/journey/__tests__/model.test.ts` | 27 | KIND_TO_CATEGORY · cobre todos os tipos finos e só eles · CATEGORY_META · cobre todas as categorias e só elas … |
| `supabase/functions/_shared/__tests__/ai-response-contracts.test.ts` | 27 | análise bem formada passa e preserva os valores · sentiment fora do vocabulário canônico é rejeitado · sentimentScore em string é rejeitado (não vira 80) · sentimentScore fora da faixa 0-100 é rejeitado … |
| `tests/contracts/ai-conversation-summary-contract.test.ts` | 27 | ai-conversation-summary — sem fallback que invente análise (IA-023) · não inventa defaults numéricos para sentimento/satisfação ausentes · não usa o fallback textual que sintetizava um resumo · não aplica o default de churnRisk nem clamp em braço … |
| `e2e/skins-e2e.spec.ts` | 26 | CP8 — fidelidade das 19 skins · as 19 skins aplicam as vars exatas do catálogo e a cor pintada (sidebar/fundo, ΔE76 ≤ 6) · modo claro mantém a skin: corporate, gx-classic e diversity · raio: GX trava em 10px, clássica em 14px, presets rápidos seguem livres … |
| `src/components/gmail/__tests__/GmailInboxView.test.tsx` | 26 | GmailInboxView · exibe estado  · renderiza a lista de threads do inbox quando há conta ativa · pasta inicial (Inbox) consulta o rótulo INBOX e não filtra em memória … |
| `src/components/ui/__tests__/message-reactions.test.tsx` | 26 | ReactionBadge · mostra emoji e contagem no nome acessível (plural) · usa singular no nome acessível quando é só uma reação · aria-pressed=true quando eu já reagi … |
| `src/hooks/__tests__/useSearchHistory.test.ts` | 26 | useSearchHistory · initializes with empty history · adds item to history · ignores empty queries … |
| `src/hooks/chat/__tests__/useConversationActions.test.ts` | 26 | useConversationActions · archiveContact · arquiva pela RPC set_conversation_status (a mesma do diálogo de encerrar) e NÃO mexe no responsável · anuncia o novo estado no evento que atualiza chip/lista sem esperar refetch … |
| `src/hooks/integrations/__tests__/useExternalDB.test.ts` | 26 | useExternalSelect · usa limit 50 / offset 0 por padrão e devolve os dados · repassa select, filtros, ordem, paginacao e modo de contagem · não busca quando a flag do CRM está desligada … |
| `src/lib/__tests__/quarantineStore.test.ts` | 26 | subscribe / getSnapshot · chama o listener a cada mudança e para depois do unsubscribe · mantém a mesma referência de snapshot enquanto nada muda (contrato do useSyncExternalStore) · get … |
| `src/segments/__tests__/segmentRules.test.ts` | 26 | normalizeRules · returns an empty v2 set for null input · converts numeric text to number on number fields · keeps numeric-looking text as string on text fields … |
| `src/components/inbox/__tests__/MediaVolume.test.tsx` | 25 | volume das mídias — controle, aplicação e separação dos alertas · E38/E39: com a mídia em mudo, o alerta continua saindo no ganho de settings.soundVolume · E40: mexer no volume da mídia não cria nem altera nó WebAudio dos alertas · E38: mexer no volume da mídia não escreve nas configurações de notificação (soundVolume) … |
| `src/hooks/__tests__/useReauthentication.test.tsx` | 25 | useReauthentication · initializes with correct default state · reauthenticate succeeds with correct password · reauthenticate keeps AAL2 untouched when the session is already elevated … |
| `src/hooks/chat/__tests__/useContactMedia.test.tsx` | 25 | useContactMedia — paginacao por keyset (etapa 41) · pede 60+1 por pagina e para no fim quando a pagina vem incompleta · pagina cheia (61 linhas) tem proxima pagina e o cursor (created_at, id) entra no 2o .or() · aceite etapa 41: 201 itens em 4 paginas de 60 e o 201o aparece no fim … |
| `src/hooks/chat/__tests__/useFilesViewState.test.tsx` | 25 | useFilesViewState — preferencias (localStorage) · storage ausente: comeca no default decidido em D3 (grid, 4 colunas) · storage invalido: JSON quebrado, versao desconhecida e valores fora do dominio caem no default · sanitiza campo a campo: viewMode valido com columns invalido mantem o viewMode … |
| `src/hooks/gamification/__tests__/useLeaderboard.test.tsx` | 25 | useLeaderboard — leitura do servidor · pede o ranking à RPC com o período corrente e o teto da equipe inteira · refaz a consulta com o período escolhido na tela · mapeia a linha da RPC para o modelo da tela … |
| `src/lib/calls/__tests__/persistence.test.ts` | 25 | upsertMyCall — mapa p_* da RPC · grava a chamada tocando com os nomes exatos dos parâmetros · grava o fim com status/motivo/duração e OMITE o que não tem valor · upsertMyCall — retry idempotente … |
| `supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts` | 25 | F48 preview: cada bloco reproduz EXATAMENTE o payload do worker para o destinatario · F48 preview: conteudo com placeholders é identico ao worker para outro destinatario · F48 preview: sem blocos, cai no template do dispatch — o MESMO payload do worker atual · F48 preview: destinatario de outro dono/inexistente responde 404 nomeado … |
| `supabase/functions/send-scheduled-report/index.test.ts` | 25 | auth: sem identidade → 401 e zero lookup/Resend/service-role · auth: x-cron-secret errado → 401 sem efeito · auth: CRON_SECRET vazio → x-cron-secret não autoriza (fail closed) · auth: Bearer inválido → 401 sem efeito … |
| `src/components/inbox/__tests__/ConversationTabs.test.tsx` | 24 | etapa 75 — ConversationTabs (8 abas da fusão) · renderiza as 8 abas e nenhuma aba removida · badge de Tarefas mostra tasksOpen · não renderiza badge quando o contador é zero … |
| `src/components/inbox/chat/__tests__/ChatSearchBar.test.tsx` | 24 | ChatSearchBar · renders nothing when closed · renders input and filters when open · finds messages by text content … |
| `src/hooks/__tests__/useBitrixApi.test.ts` | 24 | useBitrixApi · initializes with loading false · initializes with error null · exposes listLeads function … |
| `src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts` | 24 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · envia a mensagem pelo caminho da edge function, nunca direto para a Evolution · expõe exatamente as funções do contrato (nada a mais, nada a menos) … |
| `src/hooks/system/__tests__/useSecurityPushNotifications.test.ts` | 24 | useSecurityPushNotifications — envio do alerta · com push disponível envia notificação com IP, urgência e vibração longa · severidade baixa não exige interação e usa vibração curta · descrição ausente cai no texto padrão … |
| `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` | 24 | useMyWorkItems — Fase B · create envia created_by e assigned_to do perfil autenticado · create recusa aviso no passado (remind_in_past) sem tocar no banco · complete move para done e oferece undo … |
| `src/services/__tests__/navigation.service.test.ts` | 24 | NavigationService integration maturity · keeps incomplete integrations out of production-ready groups · exposes every navigation id exactly once across primary and grouped menus · preserves the full-layout contract for workspace views … |
| `src/components/catalog/__tests__/sendProductUtils.test.ts` | 23 | groupVariantsByColor · agrupa variantes pela cor e coleta thumbs sem duplicar · usa  · lista vazia retorna array vazio … |
| `src/components/contacts/__tests__/useContactFormValidation.test.ts` | 23 | useContactFormValidation — checkEmailDuplicate · debounces query by 500 ms — no call before timeout · consecutive changes within 500 ms fire only one query (last value wins) · escapes % wildcard in email passed to ilike … |
| `src/components/email/__tests__/EmailChatReplyBar.test.tsx` | 23 | EmailChatReplyBar · resolvedTo display · reply inbound: mostra from_address no  · reply outbound: mostra to_addresses[0] no  … |
| `src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx` | 23 | ChatPanelHeader · renders contact name · renders avatar fallback initials · R2-INB-030: sem sinal de presença, não afirma Online e mostra estado neutro … |
| `src/components/inbox/location-picker/__tests__/SuggestionList.test.tsx` | 23 | SuggestionList — pausa de 429 (A3-04) · oferece  · espera acabada não mostra  · E57: a contagem de sugestões é anunciada em região viva (getByRole( … |
| `src/components/inbox/tabs/__tests__/AudioPlayButton.test.tsx` | 23 | AudioPlayButton (A02/D03/D04) · D03: montar não assina nem cria áudio; a URL sai no PRIMEIRO clique e o som toca · D04: mostra o tempo restante e a barra fina enquanto toca; ao terminar volta ao play · D03: erro de URL expirada renova UMA vez e volta a tocar, sem mensagem de falha … |
| `src/hooks/__tests__/useDashboardWidgets.test.ts` | 23 | useDashboardWidgets · initializes with default widgets · all widgets have required fields · visibleWidgets only contains visible widgets … |
| `src/hooks/__tests__/useSLACalculation.test.ts` | 23 | calculateStatus · returns ok when completed on time · returns breached when completed late · returns ok with plenty of time remaining … |
| `src/hooks/calls/__tests__/useCallChannels.test.ts` | 23 | capacidadesPorCanal — VoIP · registrado e sem problema de microfone: disca, recebe e recusa · reconectando: não disca nem recebe, motivo  · conectando cai na mesma família de reconexão … |
| `src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx` | 23 | useMultiplixDispatches — leituras via edge  · useMultiplixDispatchesList chama dispatch.list com JWT e entrega as linhas · useMultiplixDispatchesList aceita a lista direta em data · useMultiplixDispatch pede o disparo por id na edge (dispatch_id no payload) … |
| `src/lib/__tests__/filesPeriod.adversarial.test.ts` | 23 | filesPeriod (adversarial) — fuso: o corte é o dia LOCAL, não a fatia UTC do ISO · premissa: a suíte roda a oeste de UTC (UTC-3) · o último milissegundo do dia local entra, mesmo com a fatia UTC já no dia seguinte · o primeiro milissegundo do dia local entra (fatia UTC ainda é o MESMO dia, em UTC-3) … |
| `src/lib/calls/__tests__/events.test.ts` | 23 | events — constantes do contrato · usa os nomes de evento do Apêndice D (novo) e do legado · events — round-trip de dispatchStartCall/onStartCall · emite CustomEvent tipado em document e entrega o payload intacto … |
| `supabase/functions/get-call-recording/index.test.ts` | 23 | T73: sem tipo na origem assume audio/mpeg · T73: repassa faixa, tamanho e suporte a ranges · T73: sem tamanho/faixa, nao inventa cabecalho · T73: audio de cliente nunca e cacheado por intermediario … |
| `tests/contracts/ai-conversation-analysis-contract.test.ts` | 23 | IA-023 · a análise não inventa dado quando a IA não devolve · não tem mais os defaults fabricados (50 / 3 /  · não sintetiza análise a partir de texto livre ( · usa o contrato numérico em vez de clamp com fallback … |
| `e2e/email-navy-visual.spec.ts` | 22 | rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis · workspace do Email não introduz violações axe · superfícies do Email herdam os mesmos tokens do sistema em claro e escuro · busca, ajuda e foco do diálogo funcionam por teclado … |
| `src/__tests__/rls-boundary.test.ts` | 22 | RLS boundary - anon role (SELECT returns empty) · ${table}: anon SELECT returns [] (RLS filters all rows) · RLS boundary - anon role (writes blocked with 42501) · ${table}: anon INSERT -> 42501 … |
| `src/components/inbox/__tests__/CloseConversationDialog.test.tsx` | 22 | CloseConversationDialog — ações válidas por estado · estado open: oferece Encerrar e Arquivar, não oferece Reabrir · estado waiting: oferece Encerrar e Reabrir, não oferece Arquivar · estado resolved: oferece Reabrir e Arquivar, não oferece Encerrar … |
| `src/components/inbox/__tests__/StatusChips.test.tsx` | 22 | StatusChips · renderiza as contagens calculadas pelo filtro da Inbox, sem exigir a lista bruta · renders the 6 chips (no Spam — não existe no modelo) · maps  … |
| `src/components/talkx/__tests__/TalkXHealthCard.test.tsx` | 22 | TalkXHealthCard — status atual (X148) · envio recente:  · envio parado:  · sem ajuda para abrir, o card não renderiza botão sem ação … |
| `src/components/tasks/__tests__/cardAcoes.test.tsx` | 22 | FASE C2 — 28: o Sheet aberto por DnD/kebab já vem em Aguardando com o motivo pedido · 28: precisaMotivoDeEspera barra Aguardando sem motivo e libera o resto · focusField=waiting_reason inicia em Aguardando e mostra o motivo · sem focusField, um item em todo NÃO mostra o motivo … |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | 22 | Tarefas — componentes dos três modos · B9: a Lista rotula as seções com acento (Amanhã, Próximas, Concluídas) · B12: Backspace NÃO apaga a tarefa, Delete apaga · etapa 15: o Quadro leva o índice de destino no onMove … |
| `src/hooks/communication/__tests__/useCallEngineSink.test.ts` | 22 | useCallEngineSink — ponte para estado, timer e toast (T09) · status, mute e erro caem no setter/toast certos · onSession escreve a direção na REF (o sink é memoizado) e no estado · atendida liga o cronômetro e encerrada o para (nunca invertidos) … |
| `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` | 22 | tempo limite: 45 s com AbortController · aborta a chamada pendurada e sobe erro em pt-BR com  · não aborta antes da hora: em 44,999 s a chamada continua em voo e o signal segue vivo · resposta que chega antes do limite não é abortada depois: o timer não sobra … |
| `src/hooks/inbox/__tests__/chipCounts.test.ts` | 22 | countByChip — contadores pelas regras da lista · conta pelo estado persistido, não por  · exclui adiadas de todos os chips, como a lista · showAll acompanha a lista: Em atendimento passa a ser Todas … |
| `src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts` | 22 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · expõe exatamente as funções do contrato (nada a mais, nada a menos) · leitura devolve o dado da edge function … |
| `src/hooks/tasks/__tests__/workItemMachine.test.ts` | 22 | canTransition – WIP doing · bloqueia quando doingCount >= 3 · permite quando doingCount = 2 · permite mover dentro de doing (reordenação) … |
| `src/hooks/ui/__tests__/useSwipeNavigation.test.tsx` | 22 | zona de borda · arrasto que começa fora da borda não navega · borda esquerda com histórico volta ao arrastar além do limite · borda direita com histórico avança ao arrastar para a esquerda … |
| `src/hooks/voice/__tests__/voiceActionPlan.test.ts` | 22 | navigate · navega para a seção pedida · sem seção não anuncia navegação · search … |
| `src/styles/__tests__/cp1FidelidadeCarvao.test.ts` | 22 | SL181 · CP1 ΔE — page/card/sidebar em carvão (dark) · fundo da página é #0e0e10 (ΔE = 0) — o mesmo rgb(14,14,16) do ledger CP1 · card é hsl(240 5% 10%) (ΔE = 0 contra o alvo do plano) · sidebar fica na família carvão, um degrau mais fundo que a página (ΔE ≤ 1,5) … |
| `supabase/functions/create-user/index.test.ts` | 22 | R2-AUTH-016 (a): falha no upsert de user_roles -> erro + deleteUser · R2-AUTH-016b (a2): sem role no corpo grava  · R2-AUTH-016b (a3): domínio não confiável recebe o papel pedido · R2-AUTH-016 (b): update de profiles falha -> erro + deleteUser … |
| `supabase/functions/talkx-scheduler/index.test.ts` | 22 | X015 auth: sem x-cron-secret e sem Authorization → 401 · X015 auth: x-cron-secret errado → 401 · X015 auth: x-cron-secret correto → passa e o tick sem campanhas fecha 200 · X015 auth: Authorization Bearer com a service key → passa (não é 401) … |
| `tests/contracts/contraste-aa-componentes.contract.test.ts` | 22 | contraste AA — o parser de tokens não pode quebrar por causa do arquivo · acha o token no SEGUNDO bloco :root (tokens.css com 2 blocos) · ignora menção ao seletor dentro de comentário · não se perde com chave aninhada dentro do bloco … |
| `src/__tests__/a11y/icon-button-names.test.ts` | 21 | varredura de botões de ícone — casos sintéticos · detecta <Button size=\ · não acusa quando há aria-label · não acusa quando há title … |
| `src/components/calls/__tests__/calls-access.test.ts` | 21 | Telefonia — acesso e fronteiras (T07) · encontra a superfície de telefonia (o teste não passa por vacuidade) · nenhum arquivo da telefonia carrega a chave service_role · o hook de SIP não fala SIP direto: a fronteira é o adapter (invariante do T09) … |
| `src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx` | 21 | VirtualizedRealtimeList — badge de canal e mini-avatar do atendente · mostra o badge do canal para Instagram, mas não para WhatsApp · esconde o mini-avatar quando a conversa é do próprio usuário logado (compara com o profile.id, não com o auth id — #349) · sem entrada no agentsMap para o assigned_to, não quebra e não mostra mini-avatar … |
| `src/components/inbox/chat/__tests__/ConversationTabs.cp8.test.tsx` | 21 | CP8 · geometria das 8 abas · a barra mantém a altura do header do painel (53px) e não volta aos 48px do plano · a aba ativa mede 36px (h-9) — dentro do alvo 36±2 do E.2 · todas as 8 abas têm a mesma altura (nenhuma aba encolhe ao ser selecionada) … |
| `src/components/inbox/tabs/__tests__/fileDisplay.card.test.ts` | 21 | formatCardDate (S22) — data curta do cartão · mesmo dia local vira  · dia anterior vira  · virada de dia 23:59 → 00:01: a mensagem das 23:59 vira  … |
| `src/hooks/__tests__/useApplicableSLA.test.ts` | 21 | SLA Resolution Hierarchy · returns system default when no rules or configs exist · returns global config fallback when no granular rules match · prioritizes contact-level rule over company-level … |
| `src/hooks/business/__tests__/useClientWallet.test.tsx` | 21 | useClientWallet — carga das regras · ordena por prioridade decrescente e resolve agente e conexão por id · regra sem conexão não consulta a tabela de conexões para o join · erro de RLS na primeira leitura não derruba a tela: lista vazia e o resto carrega … |
| `src/hooks/crm/__tests__/useContactsKpi.test.ts` | 21 | aggregateKpi · conta novos30 e novosPrev30 corretamente e calcula o delta · deltaNovosPct = null quando prev < MIN_PREV 50 · deltaNovosPct = null quando não há registros em nenhuma janela e prev < 50 … |
| `src/hooks/evolution/__tests__/useEvolutionGroups.test.ts` | 21 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · expõe exatamente as funções do contrato (nada a mais, nada a menos) · leitura devolve o dado da edge function … |
| `src/hooks/sip/__tests__/useSipConnection.test.ts` | 21 | useSipConnection · registers the incoming-invitation delegate on connect · SL-002: as opções do SessionDescriptionHandler exigem RTCP muxado e bundle (mídia só pela sessão DTLS) · T15: 403 no REGISTER vira  … |
| `src/lib/__tests__/rlsConversationAccess.test.ts` | 21 | RLS real: contacts (schema resolvido das migrations) · o conjunto de policies bate com o manifest do schema real · SELECT delega ao predicado canonico can_edit_contact (dono, fila ou admin) · INSERT exige admin/supervisor OU auto-atribuicao (assigned_to = proprio perfil) … |
| `supabase/functions/_shared/__tests__/webhook-auth-gates.test.ts` | 21 | whatsapp-webhook: POST sem assinatura -> 401 antes de qualquer efeito (sem SUPABASE_URL configurada) · whatsapp-webhook: assinatura HMAC inválida -> 401 · whatsapp-webhook: replay — assinatura válida de OUTRO corpo -> 401 · whatsapp-webhook: sem WHATSAPP_APP_SECRET configurado -> 401 (falha fechada, mesmo com header bem formado) … |
| `supabase/functions/detect-new-device/index.test.ts` | 21 | extractAuthSessionId extrai session_id do claim JWT · extractAuthSessionId devolve null sem claim ou com token malformado · extractAuthSessionId ignora session_id fora do claim (só o token conta) · decideSessionUpsert atualiza linha existente da mesma sessão Auth … |
| `e2e/navegacao-modulos.spec.ts` | 20 | Navegação por todos os módulos (desktop) · abre as 42 entradas mapeadas, o modo Quadro de Tarefas e a busca global sem erro de console nem requisição falha · Navegação por todos os módulos (celular 390x844) · abre as 42 entradas mapeadas pelo menu móvel, o modo Quadro de Tarefas e a busca do cabeçalho sem erro de console nem requisição falha … |
| `src/components/calls/__tests__/CallDialog.test.tsx` | 20 | CallDialog — aceite T21: abrir o diálogo NÃO insere em  · disca pelo provider e não toca em nenhum caminho de escrita da tabela  · não disca de novo quando a chamada já existe ( · disca UMA única vez por abertura, mesmo com  … |
| `src/components/contacts/__tests__/useContactsCRUD.test.tsx` | 20 | useContactsCRUD — edição não apaga endereço (C1) · E01 — editar só o nome preserva endereço e coordenada da linha completa · E05 — abre a edição com 1 fetch pelo id · E05 — falha do getById não perde endereço: o update não escreve os campos de endereço … |
| `src/components/gmail/__tests__/EmailThreadView.test.tsx` | 20 | EmailThreadView · chama setSelectedThreadId com thread.id no mount · chama setSelectedThreadId(null) no unmount · exibe o subject da thread no header … |
| `src/components/inbox/__tests__/AdvancedMessageMenu.menu-avancado.test.tsx` | 20 | AdvancedMessageMenu — Status/Story só para quem pode publicar · o agente (não supervisor) não vê a opção Status/Story · enquanto os papéis carregam a opção fica escondida (não pisca para o agente) · o admin vê a opção e publicar exige confirmação de que todos os contatos verão … |
| `src/components/inbox/__tests__/SLAIndicator.test.tsx` | 20 | SLAIndicator · renders nothing when first response given and within SLA · shows first response countdown when waiting for response · renders nothing after on-time response even if conversation stays open (sem SLA de resolução) … |
| `src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx` | 20 | ContactActionButtons · abre o dropdown de  · abre o dropdown de  · desabilita o botão de e-mail quando o contato não tem e-mail … |
| `src/components/ui/__tests__/command-palette.a11y.test.tsx` | 20 | CommandPalette — campo e lista anunciados (combobox/listbox) · o campo é combobox nomeado que aponta para a lista e para o item ativo · as setas mudam o aria-activedescendant e o aria-selected para o item seguinte · ao navegar com as setas, o item realçado é rolado para dentro da vista … |
| `src/hooks/__tests__/useTextToSpeech.test.ts` | 20 | useTextToSpeech · initializes with isLoading false · initializes with isPlaying false · initializes with null currentMessageId … |
| `src/hooks/admin/__tests__/useSupervisorQueue.test.tsx` | 20 | useSupervisorQueue — leitura e priorização · lê conversas abertas com os filtros certos, resolve nomes e ordena P1→P4 · conversas resolvidas/fechadas/deletadas não entram na fila · corta em 200 mantendo as MAIS ANTIGAS e sinaliza  … |
| `src/hooks/chat/__tests__/useConversationHistoryTimeline.test.ts` | 20 | buildTimeline · agrupa mensagens consecutivas do mesmo remetente em <=10min numa unica rajada · nao agrupa mensagens do mesmo remetente além de 10 minutos · agrupa eventos por dia (yyyy-MM-dd) … |
| `src/hooks/realtime/__tests__/messageTypeClassification.test.ts` | 20 | classifyMessageType · enquete vira unsupported/poll · visualização única vira unsupported/view_once · contato compartilhado vira unsupported/contact … |
| `src/lib/__tests__/offlineQueue.test.ts` | 20 | createOfflineQueue · enfileira e drena na ordem de composição (3 mensagens offline, 3 na mesma ordem) · não duplica o mesmo envio: a mesma chave continua sendo uma mensagem só · para na primeira falha e mantém a ordem para a próxima tentativa … |
| `src/services/__tests__/outbound-message.service.test.ts` | 20 | sendOutboundMessage · enqueues first and only then asks the authenticated delivery gateway to dispatch · does not dispatch when authorization or validation prevents enqueueing · foto com URL inválida: o enqueue rejeitado impede o dispatch e propaga a falha … |
| `src/utils/__tests__/notificationSounds.test.ts` | 20 | notificationSounds · playNotificationSound · plays default message sound without error · plays with chime sound type … |
| `supabase/functions/_shared/messaging/__tests__/personalize.test.ts` | 20 | personalize resolves the built-in placeholders (nome/apelido/nome_completo/empresa) · personalize {{apelido}} cai no primeiro nome quando o contato nao tem apelido · personalize built-in sem valor entra em missing e mantem o texto vazio (X020) · personalize falls back to a bracket placeholder for an unresolved variable instead of throwing … |
| `scripts/db-audit/check-triple-parity.test.mjs` | 19 | paridade tripla verde quando as tres pernas batem (generated_at ignorado) · detecta divergencia arquivos↔ledger (sha256/count) · detecta edge em disco fora do manifesto e vice-versa · detecta grants-baseline desatualizado … |
| `src/components/contacts/__tests__/ContactEngagementScore.test.tsx` | 19 | calculateEngagement · retorna level=hot quando recência + frequência + volume >= 70 · retorna level=warm quando score >= 40 e < 70 · retorna level=cold quando score >= 15 e < 40 … |
| `src/components/contacts/__tests__/ContactFormEndereco.test.tsx` | 19 | ContactForm — endereço · mostra os seis campos de endereço · CEP é guardado só com dígitos e exibido com máscara · CEP ignora letras e para em 8 dígitos … |
| `src/components/inbox/__tests__/ContactDetails.mobile-iniciais-sentimento.test.tsx` | 19 | ContactDetailsResponsive — painel no celular · monta como sheet de altura definida e painel de largura total · anuncia o painel ao leitor de tela (título + descrição ligados ao diálogo) · no desktop não monta sheet — o painel lateral continua igual … |
| `src/components/inbox/__tests__/FileUploader.u4-u6-motivo-e-tokens.test.tsx` | 19 | U4 — o motivo da falha aparece em texto na fila · mostra o motivo do upload que falhou, não só o selo  · mostra o motivo do arquivo inválido (limite/tipo) também na fila · U4 — Esc e clique fora não descartam o envio em andamento … |
| `src/components/inbox/__tests__/GlobalSearchFilters.test.tsx` | 19 | GlobalSearchFilters — mostra e esconde · não renderiza nada quando show é false · mostra os três grupos de filtro quando show é true · GlobalSearchFilters — filtro por tipo … |
| `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | 19 | ToolPanel — diálogo modal com teclado · expõe role=dialog, aria-modal e nome pelo título · fecha com Esc a partir do painel · prende o foco: Tab no último controle volta ao primeiro e Shift+Tab no primeiro vai ao último … |
| `src/components/inbox/media-gallery/__tests__/MediaPreviewDialog.test.tsx` | 19 | MediaPreviewDialog (etapa 30 — visualizador único e navegável) · título = displayName e nome técnico no DialogDescription · abrir o 2º de 3: Próximo vai ao 3º, Anterior volta ao 2º · setas ← → percorrem a coleção filtrada … |
| `src/components/inbox/tabs/__tests__/FileDetailPanel.test.tsx` | 19 | FileDetailContent — SL-083 (G4/G5) · G5: mostra a URL assinada em lote sem pedir assinatura individual · G5: quando a URL em lote falha, renova UMA vez pelo locator durável · G4: não oferece  … |
| `src/components/inbox/tabs/__tests__/FilesToolbar.test.tsx` | 19 | FilesToolbar (etapa 11) · expõe busca, ordenação, o funil, Selecionar e Layout na ordem do plano · quebra em segunda linha em vez de rolar (flex-wrap) e a busca tem mínimo de 220px · digitar na busca avisa o hook … |
| `src/components/talkx/__tests__/useTalkXLifecycle.test.tsx` | 19 | useTalkXLifecycle — controlador único (X050) · pausa com motivo usando a operação existente  · pausa sem motivo envia  · cancela pela  … |
| `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx` | 19 | WorkItemSheet — etapas 141–144 (estado de edição, rodapé, proteção e foco) · 141: limpo mostra  · 141: Ctrl+Enter em qualquer campo salva a alteração · 142:  … |
| `src/hooks/__tests__/useAudioRecorder.mime.test.ts` | 19 | pickRecorderMime — formato suportado pelo MediaRecorder · escolhe webm;codecs=opus quando o navegador suporta tudo · cai para mp4/aac quando o navegador não grava webm (Safari/iOS antigo) · devolve undefined quando nenhum formato é suportado … |
| `src/hooks/__tests__/useQueueAnalytics.test.tsx` | 19 | useQueueAnalytics · fetches analytics data · returns daily data array · returns hourly data array … |
| `src/hooks/copilot/__tests__/radar-hooks-unificados.test.ts` | 19 | useLossRiskDetector (une useLossRiskAlert) · sinal do concorrente, que só a versão apagada tinha, é risco alto · separa a orientação do vendedor da mensagem para o cliente · considera o histórico recente do cliente … |
| `src/hooks/integrations/__tests__/useMultiplixDispatches.multiplix-audience.test.ts` | 19 | buildMultiplixAudienceSelectPayload — a intenção vai inteira e nada é expandido · omite o que não foi informado e não inventa chave nenhuma · público salvo viaja por referência (audience_id), nunca pelos membros · manual e exclude viram company_ids/contact_ids completos … |
| `src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx` | 19 | useContactSlaTimeline — marcos reais · monta os marcos das linhas gravadas, do mais recente para o mais antigo · aplica o prazo da hierarquia do contato (2min), não o padrão do sistema · lê só o contato pedido e só os eventos de transferência do TR1 … |
| `src/hooks/sla/__tests__/useSLAConfigurations.test.tsx` | 19 | useSLAConfigurations — leitura · carrega as configurações ordenando por prioridade crescente · leitura que volta nula sem erro deixa a lista vazia · erro de RLS na leitura deixa a lista vazia sem travar a tela … |
| `src/hooks/ui/__tests__/useVolumeRocker.test.tsx` | 19 | useVolumeRocker — painel, matriz de opções e fechamento · com enabled=false não muta, não ajusta, não abre e ignora a roda · com wheelEnabled=false a roda não ajusta nada (e a página pode rolar), mas as setas continuam · a roda ajusta ±step (com o painel aberto) e impede a rolagem da página junto … |
| `src/lib/__tests__/filesPeriod.test.ts` | 19 | filesPeriod — buildPeriodRange · all (Qualquer data) e last_interaction não filtram · Hoje vai da meia-noite ao fim do dia LOCAL · Últimos 7 dias começa no início do 7º dia anterior e termina no fim de hoje … |
| `src/lib/__tests__/postLoginRedirect.test.ts` | 19 | resolverDestinoPosLogin — destino interno preservado · usa ?next= e preserva query e hash · usa state.from como Location inteiro (shape do ProtectedRoute) · aceita state.from como string … |
| `supabase/functions/_shared/observability.test.ts` | 19 | correlation: ecoa o x-request-id válido do cliente · correlation: gera UUID quando o cabeçalho não veio · correlation: valor fora do formato é descartado (não ecoa espaço/meta-caractere) · correlation: valor curto demais é descartado … |
| `supabase/functions/recover-message-media/index.test.ts` | 19 | ok — baixa da Evolução, grava a URL permanente e atualiza a mensagem · ja_permanente — já no Storage: devolve a URL e NÃO chama a Evolução · indisponivel — a Evolução não devolve bytes: não grava media_url · indisponivel — sem conexão de origem: nem resolve instância nem chama a Evolução … |
| `tests/contracts/ai-response-contracts.behavior.contract.test.ts` | 19 | IA-025 · estrutura correta passa · aceita a saída completa · aceita a saída mínima e não inventa os opcionais · IA-025 · JSON válido com valor errado é rejeitado (não corrigido) … |
| `tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts` | 19 | (1) banco: três colunas novas NULLABLE (IA-047) · (2) banco: três índices únicos PARCIAIS com o where correto (IA-047) · a migration NÃO cria índice único TOTAL sobre a coluna nova (risco de colisão com histórico) · (3) banco: aditivo, idempotente, com rollback e sem transação explícita … |
| `tests/contracts/requireauth-network-policy.contract.test.ts` | 19 | canonicalEndpointFromUrl — endpoint canônico estável a partir da URL · extrai o nome da função do gateway /functions/v1/<nome> · descarta sub-path e devolve só o nome da função · usa o primeiro segmento quando não há a barra functions/v1 … |
| `scripts/db-audit/check-catalog-fresh.test.mjs` | 18 | aceita conjuntos identicos em ordem diferente · falha quando surge coluna nova no banco · falha quando o tipo de uma coluna muda · falha quando a nulabilidade de uma coluna muda … |
| `src/components/automations/__tests__/AutomationEditorDialog.test.tsx` | 18 | AutomationEditorDialog — estado por registro (R2-MOD-001) · mostra os dados do registro aberto · ao trocar de registro (mesmo componente montado), não reaproveita o estado do anterior · ao abrir  … |
| `src/components/groups/__tests__/GroupsView.test.tsx` | 18 | GroupsView · renders the page title · shows empty state when no groups · renders groups when data loads … |
| `src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx` | 18 | InboxSavedFiltersMenu — filtros salvos do inbox · lista vazia: orienta e mantém  · aplicar: o conteúdo do preset chega ao onApply e o menu fecha · salvar: grava o filtro que está na tela, com o nome digitado … |
| `src/hooks/__tests__/useChatKeyboardNavigation.test.ts` | 18 | useChatKeyboardNavigation · initializes with no selected message · initializes with isNavigating false · exposes exitNavigationMode function … |
| `src/hooks/__tests__/useIncomingCallListener.test.tsx` | 18 | useIncomingCallListener · subscribes to notifications scoped to the authenticated user · shows one ringing call from notification metadata and deduplicates replay · propagates the real call id from notification metadata (not the notification row id) … |
| `src/hooks/chat/__tests__/useAutomationSuggestions.test.tsx` | 18 | useAutomationSuggestions · não vai à Edge quando a última mensagem é do agente (lastInboundMessageId nulo) · chama a Edge com o contact_id e expõe as sugestões do contrato, com a fonte carimbada · espera o debounce antes de chamar (mensagem que ainda está chegando não gasta IA) … |
| `src/hooks/chat/journey/__tests__/useJourneyActors.test.tsx` | 18 | useJourneyActors — regras de quem agiu (S063) · usuário com perfil: nome e foto do perfil, em UMA consulta em lote · perfil ausente:  · erro/RLS negado não lança: o ator cai no  … |
| `src/hooks/communication/__tests__/useTranscriptionNotifications.filtros.test.ts` | 18 | sinalDeConclusao — não depende de payload.old · sem sinal de recência, evento com old só de id não é conclusão · carimbo antigo não passa; carimbo de agora passa · fronteira da janela (~30 s): 45 s já é antigo; 5 s ainda é recente … |
| `src/hooks/integrations/__tests__/useMultiplixAudience.test.ts` | 18 | useMultiplixAudience — listagens de apoio · busca os ramos com a acao list_ramos e o token da sessao · busca as UFs com a acao list_ufs · recusa sem sessao, sem chegar a chamar a Edge … |
| `src/hooks/system/__tests__/useSupabaseConnectivity.test.ts` | 18 | useSupabaseConnectivity — sonda leve, sem a Edge  · sonda a URL do projeto (auth/v1/health) e nunca uma Edge Function · respeita o timeout da sonda: sem resposta no prazo, conta falha · resposta HTTP não-2xx (o servidor respondeu) ainda conta como online … |
| `src/lib/__tests__/fileSenderIdentity.test.ts` | 18 | resolveSenderIdentity — quem enviou (R01 / D01) · sender= · sender= · agent_id do usuario logado vira  … |
| `src/lib/__tests__/localDay.test.ts` | 18 | localDayKey — dia no fuso LOCAL do navegador · usa o dia local, nao a fatia UTC do ISO · fim do dia local continua no proprio dia · devolve null para valor ausente ou invalido (nao estoura) … |
| `src/lib/calls/__tests__/duration.test.ts` | 18 | talkSeconds · usa talk_seconds quando existe · respeita talk_seconds = 0 (não recalcula pelos timestamps) · calcula answered_at → ended_at quando talk_seconds é null … |
| `supabase/functions/ai-transcribe-audio/index.test.ts` | 18 | SL-195a: magic bytes vencem metadado divergente — OGG servido como audio/mpeg vai como audio/ogg · SL-195a: magic bytes vencem metadado divergente — MPEG servido como audio/ogg vai como audio/mpeg · SL-195a: assinatura não reconhecida mantém o fallback do metadado declarado (não regride) · SL-195a: resolveTranscriptionAudioFormat marca a fonte da decisão … |
| `supabase/functions/gmail-oauth/index.test.ts` | 18 | get-auth-url sem state responde 400 e não registra tentativa · get-auth-url com state registra a tentativa vinculada ao usuário e devolve a URL · exchange-code sem state responde 400 sem tocar no Google · exchange-code com state divergente/não registrado responde 403 sem tocar no Google … |
| `tests/contracts/ai-endpoints-auth.contract.test.ts` | 18 | endpoints de IA — ordem entre autenticação e gasto de provedor (IA-011) · ${fn} autentica o chamador antes de chamar o provedor · o contrato não confunde import com chamada (guarda do próprio teste) · cliente do voice-agent — credencial da sessão (IA-011, regressão A1) … |
| `tests/contracts/crm-sentiment-boundary.contract.test.ts` | 18 | sentimentForExternalCrm — mapa canônico pt-BR → domínio EN do CRM · cobre exatamente os 4 canônicos (nem a mais, nem a menos) · aceita variação de caixa/espaço do valor canônico · ausência não vira token — nunca inventa sentimento … |
| `src/components/admin/__tests__/adminDownloadPermission.test.ts` | 17 | useAdminData - can_download no handleSaveUser · envia can_download no payload de update · envia can_download=false quando desabilitado · UserWithRole interface … |
| `src/components/calls/__tests__/NewCallPanel.test.tsx` | 17 | NewCallPanel (T56/T59/T60) · tem o segmentado VoIP/WhatsApp como radiogroup, independente das abas do historico · lembra o canal escolhido no localStorage · desabilita a opcao sem capacidade de discar … |
| `src/components/catalog/__tests__/CatalogAdvancedFilters.test.tsx` | 17 | CatalogAdvancedFilters — faixa de preço (slider real, E36) · sem stats, usa o teto de fallback (2000) — nunca hardcoded  · com stats.price_max, o teto vem dele (arredondado para cima) — nunca um valor fixo · inicializa o slider com priceMin/priceMax de filters, clampado ao teto real … |
| `src/components/connections/__tests__/InstanceSettingsDialog.config-perfil.test.tsx` | 17 | InstanceSettingsDialog — aba Config · carrega as configurações da instância e reflete os valores do provedor · salvar envia o estado completo da aba com o nome da instância · recusa do provedor não finge sucesso: mostra erro … |
| `src/components/dashboard/__tests__/DashboardCard.test.tsx` | 17 | DashboardCard · renderiza os filhos dentro do card · SectionHeader · renderiza título, subtítulo e tile no tamanho 44 … |
| `src/components/dashboard/__tests__/WarRoomDashboard.estado-a11y.test.tsx` | 17 | WarRoomDashboard — carregando e erro · mostra esqueleto enquanto carrega, sem apresentar zero como se fosse medido · falha de leitura vira estado de erro com “Tentar de novo”, e o retry recarrega · WarRoomDashboard — nomes acessíveis e movimento … |
| `src/components/email/__tests__/EmailChatBubble.test.tsx` | 17 | sanitizeEmailHtml (h538172) · remove width fixo px de table/td mas mantém cores · mantém img (antes removida) e adiciona lazy + no-referrer · força target=_blank + rel=noopener em links … |
| `src/components/gmail/__tests__/ThreadListItem.test.tsx` | 17 | ThreadListItem · renderiza como button clicável · displayName prioridade 1: contact.name sobrepõe last_from_name · displayName prioridade 2: last_from_name quando sem contact.name … |
| `src/components/inbox/__tests__/QuickReplyCardList.test.tsx` | 17 | QuickReplyCardList — carregando · mostra três esqueletos de carregamento e nenhum template · QuickReplyCardList — vazio · sem favoritos avisa e não oferece criação … |
| `src/components/inbox/__tests__/inboxA11yLoteReacoes.test.tsx` | 17 | BulkActionsToolbar — barra do lote · faz a animação de saída: a barra some DEPOIS do AnimatePresence, não de uma vez · expõe a barra como toolbar nomeada e anuncia a contagem · não tem violação de axe com a barra aberta … |
| `src/components/inbox/tabs/__tests__/FileThumb.test.tsx` | 17 | FileThumb (etapa 26) · loading: mostra skeleton enquanto a URL assinada resolve · ready: imagem do cartão usa object-contain; miniatura usa object-cover · E37: imagem do CF Images recebe srcSet com as variantes; sem srcSet para as demais … |
| `src/components/inbox/tabs/__tests__/FilesTab.test.tsx` | 17 | FilesTab · etapa 16: a grade vem do mapa literal de colunas, sem breakpoint de viewport · renderiza os chips com as contagens reais por tipo · #144/OTH-002: erro na contagem mostra indisponível, nao um zero confirmado … |
| `src/components/monitoring/__tests__/useConnectionIncidents.test.ts` | 17 | derivação — uptime 24 h por conexão · calcula o percentual saudável por conexão e ignora check fora da janela · sem nenhum check na janela, o percentual é null (nunca 100%) · derivação — incidentes … |
| `src/components/onboarding/__tests__/TourOverlay.a11y.test.tsx` | 17 | SHELL-05 — sem alvo de tour no DOM (casco do celular) o tour não abre · não abre cartão nenhum e não avança sozinho pelos passos vazios · o WelcomeModal esconde  · o WelcomeModal mostra o botão quando os alvos existem e ele dispara o tour … |
| `src/components/talkx/__tests__/TalkXAudienceFilters.test.tsx` | 17 | X126 · os filtros de audiência (mock 08) · na ordem do mock: Status do contato, Empresa, Estágio no funil, Vendedor, RFM, Localização · não oferece mais filtro de Tag: nenhum controle, nenhum checkbox e nenhum texto de tag · Status do contato usa a entrada do catálogo ( … |
| `src/components/talkx/__tests__/useCampaignRowActions.test.tsx` | 17 | campaignRowActions — matriz das ações por status (X080) · rascunho: ver, editar, iniciar (com público), duplicar e excluir · rascunho sem público não oferece  · agendada: ver agendamento, editar, iniciar, duplicar, cancelar e excluir … |
| `src/components/ui/__tests__/timers-unmount.test.tsx` | 17 | skip-link · não abre varredura por intervalo e limpa o aviso de Tab no unmount · não renderiza <nav> vazio quando nenhum alvo existe na tela · a detecção de alvo é por mutação do documento, não por intervalo … |
| `src/hooks/__tests__/useAudioRecorder.test.ts` | 17 | useAudioRecorder · initializes with isRecording false · initializes with duration 0 · initializes with audioUrl null … |
| `src/hooks/__tests__/useDeviceDetection.test.tsx` | 17 | useDeviceDetection · reusa o aviso único por sessão do provider de auth (sem segunda chamada a detect-new-device) · initializes with loading=true · returns empty devices initially … |
| `src/hooks/__tests__/useParallax.test.ts` | 17 | useParallax · initializes with zero offset · initializes scrollProgress at zero · getTransform returns translateY by default … |
| `src/hooks/__tests__/useSLANotifications.contract.test.ts` | 17 | useSLANotifications — contrato do payload · estouro marca o alerta de erro com a ação Abrir conversa e 10s de exibição · estouro já marcado no INSERT também avisa (dedupe é do hook, não do clique) · estouro que já vinha marcado na linha anterior não repete o aviso … |
| `src/hooks/chat/__tests__/useForwardMedia.test.ts` | 17 | forwardMediaMessages — etapa 36: copia por par e locator do path copiado · 2 arquivos x 2 destinos = 4 copias e 4 envios, mediaUrl = getPublicUrl do path copiado · item de áudio copia e gera locator no bucket audio-messages · item não resolvível é marcado como não encaminhável e NÃO tenta copiar … |
| `src/hooks/communication/__tests__/mediaVolume.players.test.tsx` | 17 | S41 — MediaPreviewDialog (janela do arquivo) obedece o volume das mídias · o vídeo do visualizador obedece ao volume global (S41) · o áudio do visualizador obedece ao volume global (S41) · S42 — AudioMessagePlayer (via useAudioPlayer) obedece … |
| `src/hooks/contacts/__tests__/useContactSearchV2.test.tsx` | 17 | useContactSearchV2 — busca na primeira letra, no debounce curto · consulta a RPC local no debounce (≤ 300 ms) e devolve o resultado · espaço em volta não vira busca e o campo vazio não consulta · useContactSearchV2 — corrida entre buscas … |
| `src/hooks/contacts/__tests__/useContainerColumns.test.ts` | 17 | resolveContainerColumns — regra do design nos 4 limites · largura >= 1200 usa a preferência do usuário · largura >= 900 nunca passa de 3, mesmo com preferência 4 · largura >= 560 devolve 2 (sem preferência que valha aqui) … |
| `src/hooks/integrations/__tests__/useCatalogContactSearch.test.ts` | 17 | logCatalogSendEvent — CT-78 (implementação real, sem mock da função) · grava em catalog_send_events com o payload snake_case completo · campos opcionais ausentes viram null (nunca undefined) · aceita os 3 status possíveis sem transformá-los … |
| `src/hooks/ui/__tests__/use-toast.test.tsx` | 17 | toast() + useToast() · registra o toast e o hook o enxerga aberto · devolve um id por chamada (não reaproveita id) · respeita o limite de um toast na tela: o novo substitui o antigo … |
| `src/lib/__tests__/serverLogin.test.ts` | 17 | serverLogin · chama a edge auth-login com apikey/bearer anon e devolve os tokens · nao forca regiao na invocacao: usa roteamento padrao do Supabase · 401 devolve a recusa com o estado do lock … |
| `src/lib/audio/__tests__/gravacaoFormato.test.ts` | 17 | escolherMimeGravacao · escolhe webm/opus quando o navegador suporta (Chrome/Edge/Firefox) · escolhe audio/mp4 no Safari, que recusa webm · devolve null quando nenhum formato da lista é suportado (navegador decide o padrão) … |
| `supabase/functions/_shared/__tests__/ai-context-revalidation.test.ts` | 17 | requestId válido é aceito nos quatro schemas · requestId malformado é rejeitado (não é ecoado como lixo) · cliente ANTIGO (sem requestId/contextVersion) continua aceito — compatibilidade · periodKey (nome canônico do frontend) é aceito como apelido da versão de contexto … |
| `supabase/functions/multiplix-dispatch/actions/__tests__/listing.test.ts` | 17 | dispatch.list escopo: sem permissao ampla so devolve os disparos do dono · dispatch.list escopo: usuario sem profile e sem permissao -> lista vazia (nao consulta a tabela) · dispatch.list escopo: a permissao ampla ve os disparos de qualquer dono · dispatch.list paginacao: limit/offset recortam na ordem created_at desc e total e exato … |
| `supabase/functions/talkx-ai/index.test.ts` | 17 | X076: flag ai_insights desligada recusa com 403 ai_disabled e não paga o proxy · X076: orçamento mensal no padrão (0 = desligado) recusa com 403 ai_disabled · X076: gasto do mês no teto recusa com 429 budget_exceeded e não paga o proxy · X076: gasto abaixo do teto passa (o teto não é desligamento geral) … |
| `tests/contracts/_adv_vocabulary-consumers-gaps.test.ts` | 17 | ADVERSARIAL — defeitos de consumidor (comparação morta / ausência → valor) · $file :: $what · ADVERSARIAL — chaves de vocabulário EN fora do módulo canônico · $file :: $what … |
| `tests/contracts/ai-values.contract.test.ts` | 17 | IA-023 · normalizeScore nunca inventa número · trata ausência como ausência (não como 50 nem 3) · rejeita string numérica em vez de coagir ( · rejeita NaN/Infinity … |
| `tests/contracts/ai-vision-modality.contract.test.ts` | 17 | IA-033 — texto puro segue o caminho de hoje (padrão por finalidade) · sem  · IA-033 — visão resolve no provedor que declara a modalidade · um candidato ativo declarando vision resolve NELE, mesmo sem is_default … |
| `scripts/db-audit/register-migration.test.mjs` | 16 | splitStatements respects dollar-quoted function bodies (does not split on internal semicolons) · splitStatements strips line comments but preserves them inside dollar-quoted bodies · buildInsertSql picks a dollar-quote tag that does not collide with the statement body · parseMigrationFile rejects a filename that does not match the version_name.sql convention … |
| `scripts/db-audit/talkx-e90-links-contract.test.mjs` | 16 | Talk X {{link}} resolves to a real per-recipient tracking URL at the real send call site · Talk X personalize() resolves every placeholder in a single pass over the original template · Talk X personalize() never lets a custom field with a reserved name override a built-in placeholder · Talk X custom-fields pagination orders by a stable unique key … |
| `src/components/calls/__tests__/CallHistoryCells.test.tsx` | 16 | CallContactCell (T48) · peer_name vence os outros dois · sem peer_name cai no contact_name · sem nome nenhum mostra o telefone formatado … |
| `src/components/calls/__tests__/RecordingPlayer.test.tsx` | 16 | RecordingPlayer (T67) · helpers reais de Edge recebem auth e anon key sinteticos do mock · nao renderiza nada quando a chamada nao tem gravacao · nao renderiza nem requisita quando a chamada nao diz que tem … |
| `src/components/contacts/__tests__/BulkActionsBar.test.tsx` | 16 | BulkActionsBar — ações em lote (etapa 81) · não renderiza sem seleção · Tag acrescenta a tag só em quem ainda não tem · Atribuir grava assigned_to em todos os selecionados … |
| `src/components/dashboard/__tests__/useSentimentData.test.tsx` | 16 | useSentimentData · monta sem lançar exceção e sai do loading (guarda contra TDZ de fetchData no useEffect) · erro na RPC é capturado — nunca escapa do hook e loading sempre volta a false · falha na leitura secundária de agentes mantém os dados principais e sinaliza leitura incompleta … |
| `src/components/mobile/__tests__/MiniChatPiP.test.tsx` | 16 | MiniChatPiP · renders contact name when visible · does not render when not visible · shows correct initials … |
| `src/components/talkx/__tests__/TalkXSuppression.add.test.tsx` | 16 | TalkXSuppression · Ações da lista no rail (X182/T06-053) · mostra o card  · não promete importar nem exportar em nenhum ponto do card · não oferece nenhuma ação de arquivo no card, nem desabilitada (regra: nada entra nem sai por arquivo) … |
| `src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx` | 16 | R2-MOD-024 — resposta atrasada não contamina o template seguinte · variantes: resposta lenta de A não sobrescreve o painel de B · histórico: resposta lenta de A não sobrescreve o histórico de B · loading: trocar A→B com o histórico de A pendente não deixa B em estado de carregamento … |
| `src/components/talkx/__tests__/segmentValidation.test.ts` | 16 | segmentValidation · nome (X099) · recusa nome menor que o mínimo · aceita nome no mínimo, ignorando espaços nas pontas · recusa nome maior que o máximo … |
| `src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx` | 16 | TalkXQueryBoundary (matriz de estados — X047) · carregando: mostra o esqueleto e marca aria-busy · erro: mostra o erro e NUNCA o vazio (nem com a lista vazia) · vazio sem erro: mostra o vazio … |
| `src/components/tasks/__tests__/WorkItemSheet.planejamento.test.tsx` | 16 | WorkItemSheet — etapas 137–140 (Planejamento) · 137: a seção traz os dois cartões e o Prazo mostra data e hora visíveis · 137: limpar o Prazo zera também a hora · 137: o Lembrete mostra a data e a hora agendadas … |
| `src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx` | 16 | etapa 094 — polimento do arrastar · o cartão levantado ganha o overlay elevado e o lugar da soltura fica tracejado · no toque o arrasto só pega depois da pressão longa; toque curto desarma · etapas 095/096 — alvo de soltura … |
| `src/hooks/__tests__/useActionFeedback.test.ts` | 16 | useActionFeedback · initializes without error · exposes success function · exposes error function … |
| `src/hooks/__tests__/useWarRoomAlerts.test.tsx` | 16 | useWarRoomAlerts · fetches unread alerts · exposes dismissAlert function · accepts soundEnabled parameter … |
| `src/hooks/integrations/__tests__/useTalkXCampaignList.test.ts` | 16 | useTalkXCampaignList — paginação no servidor (X078) · página 3 com 10 por página pede o intervalo 20–29 e traz colunas nomeadas com count exato · com 1.200 campanhas a 2ª página devolve 10 linhas e o total é 1.200 · ordenação e filtros (status, segmento, criador, período) vão na consulta … |
| `src/hooks/realtime/__tests__/realtimeUtils.puros.test.ts` | 16 | realtimeUtils — normalização da mensagem · preenche status/default de status_updated_at sem sobrescrever o que veio · traduz tipo cru sem suporte para unsupported carregando o motivo · realtimeUtils — ordenação … |
| `src/hooks/tasks/__tests__/workItemBoardGroups.test.ts` | 16 | boardByDue — colunas por prazo (etapa 101 / D1) · cada item cai em UMA coluna: nada some e nada duplica · prazo com hora que JÁ passou (hoje às 9h) é Atrasada, não Para hoje (R2-MOD-058) · prazo de dia inteiro de hoje (23:59) ainda vale como Para hoje ao meio-dia … |
| `src/lib/__tests__/emailThreadQuery.test.ts` | 16 | emailThreadQuery (OTH-005) · traduz estado, marcador, período, anexos e busca para o servidor · sem filtro nenhum não manda condição extra ao servidor · período  … |
| … +1943 linhas — lista completa em `context.json` | | |

## L. Eventos de webhook tratados (contratos com sistemas externos)

| Evento | Arquivo |
|---|---|
| `image` | `src/components/inbox/LinkPreview.tsx` |
| `video` | `src/components/inbox/LinkPreview.tsx` |
| `delete` | `src/components/team-chat/useTeamChatPanel.ts` |
| `string` | `src/hooks/integrations/useMultiplixDispatches.ts` |
| `NOTIFICATION_CLICK` | `src/hooks/system/useSecurityPushNotifications.ts` |
| `SECURITY_ACTION` | `src/hooks/system/useSecurityPushNotifications.ts` |
| `RELEASE` | `src/lib/crossTabDrainLock.ts` |
| `RELEASE` | `src/lib/crossTabSendDedupe.ts` |
| `INVITE_RECEIVED` | `src/lib/calls/session.ts` |
| `CLAIM` | `src/lib/calls/tabLeaderStore.ts` |
| `RELEASE` | `src/lib/calls/tabLeaderStore.ts` |
| `music.completed` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `quota.warning` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `sfx.completed` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `tts.completed` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `tts.failed` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `voice_clone.completed` | `supabase/functions/elevenlabs-webhook/index.ts` |
| `string` | `supabase/functions/evolution-api/index.ts` |
| `assets.sign` | `supabase/functions/multiplix-voices/index.ts` |
| `voices.list` | `supabase/functions/multiplix-voices/index.ts` |

## M. Efeitos colaterais (e-mail, SMS, cobrança, fila — não são idempotentes por padrão)

| Chamada | Arquivo |
|---|---|
| `invoke(` | `src/components/admin/ForceLogoutButton.tsx` |
| `invoke(` | `src/components/admin/SupervisorCopilot.tsx` |
| `invoke(` | `src/components/agents/InviteAgentDialog.tsx` |
| `invoke(` | `src/components/ai/AutoTicketClassifier.tsx` |
| `invoke(` | `src/components/ai/ChurnPredictionDashboard.tsx` |
| `invoke(` | `src/components/alerts/EvolutionDisconnectBanner.tsx` |
| `notifyDownloadBlocked` | `src/components/catalog/SendProductDialog.tsx` |
| `notifyDownloadBlocked` | `src/components/catalog/sendProductUtils.ts` |
| `invoke(` | `src/components/connections/ConnectionsView.tsx` |
| `messages.create` | `src/components/dashboard/ActivityHeatmap.tsx` |
| `invoke(` | `src/components/diagnostics/ConnectionHealthPanel.tsx` |
| `.add('disco-mode'` | `src/components/effects/EasterEggs.tsx` |
| `.add('rainbow-mode'` | `src/components/effects/EasterEggs.tsx` |
| `sendEmail` | `src/components/email/EmailChatReplyBar.tsx` |
| `sendEmail` | `src/components/gmail/EmailComposer.tsx` |
| `invoke(` | `src/components/inbox/AIConversationAssistant.tsx` |
| `invoke(` | `src/components/inbox/AISuggestions.tsx` |
| `invoke(` | `src/components/inbox/AudioMessagePlayer.tsx` |
| `invoke(` | `src/components/inbox/ConversationSummary.tsx` |
| `invoke(` | `src/components/inbox/RealtimeTranscription.tsx` |
| `invoke(` | `src/components/inbox/chat/AIEnhanceButton.tsx` |
| `invoke(` | `src/components/inbox/chat/AIRewriteButton.tsx` |
| `invoke(` | `src/components/inbox/chat/MessageBubble.tsx` |
| `enqueue(` | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| `notify` | `src/components/inbox/chat/motion/FlashRing.tsx` |
| `notify` | `src/components/inbox/chat/motion/PopBurst.tsx` |
| `notifyDownloadBlocked` | `src/components/inbox/media-gallery/mediaUtils.ts` |
| `notifyFailure` | `src/components/inbox/tabs/AudioPlayButton.tsx` |
| `invoke(` | `src/components/integrations/BitrixIntegrationView.tsx` |
| `invoke(` | `src/components/monitoring/MonitoringConnectionsList.tsx` |
| `invoke(` | `src/components/monitoring/hooks/useMonitoringActions.ts` |
| `notify_due_tasks` | `src/components/notifications/ReminderNotification.tsx` |
| `invoke(` | `src/components/security/PasswordResetRequestsPanel.tsx` |
| `invoke(` | `src/components/settings/ChatbotL1Config.tsx` |
| `invoke(` | `src/components/settings/ai-providers/useAIProviders.ts` |
| `invoke(` | `src/components/settings/media-library/AIGenerateDialog.tsx` |
| `invoke(` | `src/components/settings/media-library/useMediaLibrary.ts` |
| `invoke(` | `src/components/settings/media-library/useMediaUpload.ts` |
| `notify` | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `notify_on_warning` | `src/components/settings/sla/SLARuleFormDialog.tsx` |
| `notify_on_warning` | `src/components/settings/sla/SLARuleRow.tsx` |
| `.add('theme-transitioning'` | `src/components/settings/theme/presets.ts` |
| `notify_due_tasks` | `src/components/tasks/shared/WorkItemSheet.tsx` |
| `notify_due_tasks` | `src/components/tasks/shared/cardActions.ts` |
| `.add('animate-pulse-subtle'` | `src/components/team-chat/TeamMessageItem.tsx` |
| `.add('high-contrast'` | `src/components/theme/HighContrastToggle.tsx` |
| `.add('large-text'` | `src/components/theme/HighContrastToggle.tsx` |
| `.add('reduced-motion'` | `src/components/theme/HighContrastToggle.tsx` |
| `invoke(` | `src/hooks/auth/useWebAuthn.ts` |
| `invoke(` | `src/hooks/chat/useAutomationSuggestions.ts` |
| `notify` | `src/hooks/chat/useExclusiveAudio.ts` |
| `invoke(` | `src/hooks/chat/useNewConversation.ts` |
| `notifyAboutIncomingMessage` | `src/hooks/chat/useRealtimeMessages.ts` |
| `invoke(` | `src/hooks/chat/useScheduledReports.ts` |
| `notify` | `src/hooks/chat/useTeamChatNotifications.ts` |
| `invoke(` | `src/hooks/communication/useAudioMemes.ts` |
| `invoke(` | `src/hooks/communication/useVoiceAgent.ts` |
| `invoke(` | `src/hooks/connections/useConnectionsHealth.ts` |
| `invoke(` | `src/hooks/evolution/useEvolutionApiCore.ts` |
| `invoke(` | `src/hooks/gmail/gmailApi.ts` |
| `invoke(` | `src/hooks/groups/actions.ts` |
| `invoke(` | `src/hooks/inbox/useInboxBulkActions.ts` |
| `invoke(` | `src/hooks/inbox/useObjectionDetector.ts` |
| `notifyAboutIncomingMessage` | `src/hooks/inbox/useRealtimeInbox.ts` |
| `invoke(` | `src/hooks/inbox/useSentimentAlerts.ts` |
| `notifyCaller` | `src/hooks/inbox/useSentimentAlerts.ts` |
| `invoke(` | `src/hooks/integrations/useBitrixApi.ts` |
| `invoke(` | `src/hooks/integrations/useCatalogQuickSearch.ts` |
| `invoke(` | `src/hooks/integrations/useCustomEmojis.ts` |
| `invoke(` | `src/hooks/integrations/useExternalCatalog.ts` |
| `notifyDownloadBlocked` | `src/hooks/integrations/useGmail.ts` |
| `notifyGmailActionError` | `src/hooks/integrations/useGmail.ts` |
| `sendEmail` | `src/hooks/integrations/useGmail.ts` |
| `invoke(` | `src/hooks/integrations/useGmailOAuth.ts` |
| `invoke(` | `src/hooks/integrations/useKnowledgeBase.ts` |
| `invoke(` | `src/hooks/integrations/useMultiplixAudience.ts` |
| `invoke(` | `src/hooks/integrations/useMultiplixDispatches.ts` |
| `invoke(` | `src/hooks/integrations/useTalkX.ts` |
| `invoke(` | `src/hooks/integrations/useWhatsAppStatus.ts` |
| `notifyAboutIncomingMessage` | `src/hooks/realtime/incomingAlertScope.ts` |
| `notify` | `src/hooks/realtime/realtimeStatusStore.ts` |
| `notifyAboutIncomingMessage` | `src/hooks/realtime/useGlobalIncomingMessageAlerts.tsx` |
| `notifyAboutIncomingMessage` | `src/hooks/realtime/useRealtimeNotifications.ts` |
| `invoke(` | `src/hooks/security/usePasswordResetRequests.ts` |
| `notifyOnWarning` | `src/hooks/sla/useSLANotifications.ts` |
| `notify_on_warning` | `src/hooks/sla/useSLANotifications.ts` |
| `notify_on_warning` | `src/hooks/sla/useSLARules.ts` |
| `invoke(` | `src/hooks/sticker-picker/useStickerPicker.ts` |
| `messages.create` | `src/hooks/system/useCRUD.ts` |
| `notify` | `src/hooks/system/useSecurityPushNotifications.ts` |
| `notify_due_tasks` | `src/hooks/tasks/useWorkItemNotifications.ts` |
| `invoke(` | `src/hooks/ui/useDeviceDetection.ts` |
| `.add('theme-transitioning'` | `src/hooks/ui/useTheme.ts` |
| `notify` | `src/hooks/ui/useTheme.ts` |
| `invoke(` | `src/hooks/ui/useUniversityHelp.ts` |
| `notify_due_reminders` | `src/integrations/supabase/types.ts` |
| `notify_due_tasks` | `src/integrations/supabase/types.ts` |
| `notify_searchbox_budget` | `src/integrations/supabase/types.ts` |
| `invoke(` | `src/lib/avisoDispositivo.ts` |
| `invoke(` | `src/lib/crmIntegration.ts` |
| `publish(` | `src/lib/crossTabDrainLock.ts` |
| `publish(` | `src/lib/crossTabSendDedupe.ts` |
| `notifyDownloadBlocked` | `src/lib/downloadFile.ts` |
| `invoke(` | `src/lib/externalProxy.ts` |
| `invoke(` | `src/lib/invokeEdge.ts` |
| `invoke(` | `src/lib/mapboxToken.ts` |
| `enqueue(` | `src/lib/offlineQueue.ts` |
| `invoke(` | `src/lib/supabaseHelpers.ts` |
| `invoke(` | `src/lib/calls/sipProvisioning.ts` |
| `publish(` | `src/lib/calls/tabLeaderStore.ts` |
| `messages.create` | `src/lib/journey/rawRows.ts` |
| `notify_on_warning` | `src/lib/schemas/slaRule.ts` |
| `invoke(` | `src/pages/ResetPassword.tsx` |
| `invoke(` | `src/services/evolution.service.ts` |
| `enqueue(` | `src/services/outbound-message.service.ts` |
| `enqueue(` | `supabase/functions/_shared/ai-providers.ts` |
| `enqueue(` | `supabase/functions/_shared/ai-usage.ts` |
| `sendWhatsAppAudio` | `supabase/functions/_shared/evolution-go-routes.ts` |
| `sendWhatsAppAudio` | `supabase/functions/_shared/evolution-send.ts` |
| `notify` | `supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `sendWhatsAppAudio` | `supabase/functions/_shared/messaging/evolution-go.ts` |
| `.add("link"` | `supabase/functions/_shared/messaging/personalize.ts` |
| `notify` | `supabase/functions/ai-auto-tag/index.ts` |
| `notifyError` | `supabase/functions/ai-auto-tag/index.ts` |
| `notifyEscalation` | `supabase/functions/connection-health-check/index.ts` |
| `sendWhatsAppAudio` | `supabase/functions/evolution-api/index.ts` |
| `sendWhatsAppAudio` | `supabase/functions/message-delivery/index.ts` |
| `sendWhatsAppAudio` | `supabase/functions/multiplix-send/index.ts` |
| `notify_searchbox_budget` | `supabase/functions/searchbox-budget-alert/index.ts` |
| `notifyCaller` | `supabase/functions/sentiment-alert/index.ts` |
| `sendWhatsAppAudio` | `supabase/functions/talkx-send/index.ts` |
| `notify` | `supabase/migrations/20260319210215_7e6c3714-7ce1-4cd3-930c-f25b87b10103.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260319210215_7e6c3714-7ce1-4cd3-930c-f25b87b10103.sql` |
| `notify` | `supabase/migrations/20260319210228_f33bb285-7797-4bfe-93c6-94f4096b83a6.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260319210228_f33bb285-7797-4bfe-93c6-94f4096b83a6.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260827130100_fix_sicoob_channel_type_c02.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260827140000_fix_sicoob_bridge_url_official_db.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260827150000_sicoob_bridge_use_pg_net.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260827210000_gmail_crypto_vault.sql` |
| `notify_due_reminders` | `supabase/migrations/20260925153000_revoke_anon_execute_notify_due_reminders.sql` |
| `notify` | `supabase/migrations/20260925170100_add_notify_due_reminders.sql` |
| `notify_due_reminders` | `supabase/migrations/20260925170100_add_notify_due_reminders.sql` |
| `notify_due_reminders` | `supabase/migrations/20260925203000_revoke_anon_execute_cron_only_functions.sql` |
| `notify` | `supabase/migrations/20260928140100_tasks_notify_due_cron.sql` |
| `notify_due_reminders` | `supabase/migrations/20260928140100_tasks_notify_due_cron.sql` |
| `notify_due_tasks` | `supabase/migrations/20260928140100_tasks_notify_due_cron.sql` |
| `notify_sicoob_on_reply` | `supabase/migrations/20260929380000_disable_sicoob_bridge_trigger.sql` |
| `notify` | `supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql` |
| `notify_due_tasks` | `supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql` |
| `notify` | `supabase/migrations/20261002511230_cron_ai_jobs_tick_fora_do_minuto_zero.sql` |
| `notify` | `supabase/migrations/20261002541230_pg_cron_escalonar_jobs.sql` |
| `notify_due_tasks` | `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql` |
| `notify_searchbox_budget` | `supabase/migrations/20261002601230_searchbox_budget_alert_cron.sql` |
| `notify` | `supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql` |
| `notify_searchbox_budget` | `supabase/migrations/20261006235031_searchbox_budget_alert_email_ledger.sql` |
| `notify_searchbox_budget` | `supabase/migrations/20261007004545_secd_caller_check_13.sql` |
| `messages.create` | `supabase/migrations/20261009162228_messages_internal_stamps_guard.sql` |
| `notify` | `supabase/migrations/20261011173000_admin_cron_jobs.sql` |
| `notify` | `supabase/migrations/20261011205122_tasks_rearm_on_remind_change.sql` |
| `notify_due_tasks` | `supabase/migrations/20261011205122_tasks_rearm_on_remind_change.sql` |
| `messages.create` | `supabase/migrations/20261014133908_agent_workload.sql` |
| `notify_sicoob_on_reply` | `supabase-export/BLOCO_01_schema_completo.sql` |
| `notify_sicoob_on_reply` | `supabase-export/BLOCO_04_functions.sql` |
| `notify_sicoob_on_reply` | `supabase-export/BLOCO_05_triggers.sql` |
| `notify_sicoob_on_reply` | `supabase-export/BLOCO_10_functions.sql` |
| `notify_sicoob_on_reply` | `supabase-export/BLOCO_15_triggers.sql` |

## N. Regras citadas em comentários do código

| Comentário | Arquivo |
|---|---|
| Debuggers must never reach first-party production code. Third-party | `eslint.config.js` |
| function_logs do Supabase por console. A regra segue valendo no resto do | `eslint.config.js` |
| E87: quarentena formal. Schema em e2e/quarantine.js; a validacao da forma e a cobranca | `playwright.config.ts` |
| do prazo vivem em scripts/ci/check-quarantine.mjs. | `playwright.config.ts` |
| (E2E_TEST_EMAIL/E2E_TEST_PASSWORD) e o backend de verdade. Por isso valem 2 APENAS | `playwright.config.ts` |
| A regra e travada por scripts/ci/playwright-config-e81.unit.mjs. | `playwright.config.ts` |
| outro SO não pode ser comparada com o render do Linux do `e2e-logado.yml`. | `playwright.config.ts` |
| a propria porta e' o comportamento util. O que nao pode acontecer e' | `playwright.config.ts` |
| sem esta regra cai num chunk "dist-*" importado pelo ChatPanel. | `vite.config.ts` |
| carga 33 e mais de 5 s com a maquina em carga 46-51 — ou seja, reprovava por PRAZO e nao | `vitest.contracts.config.ts` |
| Unskewed requests must not pay the worst-case retention (nonce map capacity). | `infrastructure/preview-egress-proxy/main_test.go` |
| the app must remain usable even if a non-critical overlay fails to load. | `src/App.tsx` |
| Presenca real do WhatsApp: contato derivado apenas do historico nao tem | `src/adapters/evolutionAdapter.ts` |
| firstResponseAt DEVE ser null (cronometro conta). So usamos a linha | `src/adapters/inboxAdapter.ts` |
| * Global theme initializer — must be mounted at the app root. | `src/components/ThemeInitializer.tsx` |
| O campo "Limite de Chats" usa type=number, mas o navegador permite apagar o | `src/components/admin/AdminView.tsx` |
| grupos principais da navegação). A permissão `google_calendar` era oferecida aqui e | `src/components/admin/AdminView.tsx` |
| supervisor não deve nem ver a aba (evita abrir uma tela que só daria acesso negado). | `src/components/admin/AdminView.tsx` |
| `profiles.access_level` está DEPRECATED: o campo é registro, não permissão. */} | `src/components/admin/AdminView.tsx` |
| (`profiles.is_active`) é permissão de acesso, não presença — R2-AUTH-036/R2-MOD-030. | `src/components/admin/CrisisRoom.tsx` |
| TODAS as sessões do usuário alvo. NUNCA atualizar apenas | `src/components/admin/ForceLogoutButton.tsx` |
| qualquer uma delas nao pode sobrescrever o ultimo dado bom com zero. | `src/components/admin/GmailWebhookMonitor.tsx` |
| top 10 termos sem resultado. Leitura apenas — esta tela NÃO exporta, não | `src/components/admin/SearchInsightsView.tsx` |
| ler o relógio durante o render (regra react-hooks/purity). | `src/components/admin/SupervisorCopilot.tsx` |
| Limite do ramal no banco: `check (ramal ~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$')` | `src/components/admin/VoipRamalField.tsx` |
| em profiles.avatar_url (o bucket é privado e a URL assinada expira). */ | `src/components/admin/useAdminData.ts` |
| R2-AUTH-004 (item 6): desativar deve depender da operação server-side | `src/components/admin/useAdminData.ts` |
| Guarda o caminho do arquivo (não a URL assinada, que expira) | `src/components/admin/useAdminData.ts` |
| Guarda o caminho do arquivo (não a URL assinada, que expira) | `src/components/admin/useAdminData.ts` |
| não pode mostrá-lo. | `src/components/admin/useTarefasAgendadas.ts` |
| (regra `react-refresh/only-export-components` do lint do projeto). | `src/components/agents/inviteErrors.ts` |
| Testemunho — apenas no desktop */} | `src/components/auth/HeroBenefits.tsx` |
| * BUG-8 FIX: reset hasPermission whenever the user identity or the required | `src/components/auth/ProtectedRoute.tsx` |
| permission changes so stale permission state is never shown to a new user. | `src/components/auth/ProtectedRoute.tsx` |
| enquanto ainda estamos buscando permissão/MFA (o conteúdo segue fail closed). | `src/components/auth/ProtectedRoute.tsx` |
| só a rota tentada e o papel/permissão exigidos. `rotaNegada` muda quando a | `src/components/auth/ProtectedRoute.tsx` |
| condição vazia; a validação do save barra o campo obrigatório sem valor. | `src/components/automations/AutomationEditorDialog.tsx` |
| apenas a prop `automation` (o `open` só o esconde). Como os inicializadores de | `src/components/automations/AutomationEditorDialog.tsx` |
| somente dados comprovadamente incompatíveis com o novo tipo são removidos. | `src/components/automations/automationConstants.ts` |
| permissão de microfone à página (comportamento do navegador, não bug): nesse | `src/components/calls/CallDialog.tsx` |
| demorar (o navegador pergunta a permissão) e um clique sem resposta na | `src/components/calls/CallDialog.tsx` |
| O navegador recusou (saída desconectada, sem permissão): o motivo fica na | `src/components/calls/CallDialog.tsx` |
| * Só admin e supervisor escolhem o escopo; agente comum vê apenas "Minhas ligações". */ | `src/components/calls/CallHistoryCard.tsx` |
| * A busca é o único campo com atraso: digitar não pode disparar uma consulta por | `src/components/calls/CallHistoryToolbar.tsx` |
| efeito, que a regra react-hooks/set-state-in-effect (com razão) barra. | `src/components/calls/CallHistoryToolbar.tsx` |
| * Numero ja pedido pelo clique-para-discar (T29). Preenche o campo SOMENTE se | `src/components/calls/DialPad.tsx` |
| * O toque soa em `soundVolume/100 * RING_GAIN_CAP` — no MÁXIMO 20 % de ganho, bem | `src/components/calls/IncomingCallAlert.tsx` |
| nunca deve ser plugado neste componente: quem abaixa o áudio do cliente não pode, sem | `src/components/calls/IncomingCallAlert.tsx` |
| * Foto que não carrega não pode virar um quadrado vazio: a falha fica ancorada | `src/components/calls/IncomingCallAlert.tsx` |
| Play ringtone only if sound is enabled and not in quiet hours | `src/components/calls/IncomingCallAlert.tsx` |
| porque aqui o agente JA apertou o botao - o painel nao pode so preencher e esperar. | `src/components/calls/NewCallPanel.tsx` |
| `setState` no proprio corpo, que a regra `react-hooks/set-state-in-effect` recusa. | `src/components/calls/RecordingPlayer.tsx` |
| a regra, nao um estado de erro: com D3=b (sem servico de gravacao) nem requisicao sai, | `src/components/calls/RecordingPlayer.tsx` |
| este componente saiba nada sobre permissao. | `src/components/calls/TelefoniaTopActions.tsx` |
| reivindica no boot não pode derrubar quem já segura a linha. | `src/components/calls/TelefoniaView.tsx` |
| apenas as proprias ligacoes. | `src/components/calls/TelefoniaView.tsx` |
| * Mostra no maximo 7 botoes deslizando em volta da pagina atual, em vez de listar | `src/components/calls/paginas.ts` |
| (regra `react-refresh/only-export-components`), e a constante e consumida tambem | `src/components/calls/periodos.ts` |
| valor fixo na UI (placeholder do campo "Máximo" usa priceCeiling, que já | `src/components/catalog/CatalogAdvancedFilters.tsx` |
| CT-28 — além do envio, a barra favorita os selecionados e impõe o limite de | `src/components/catalog/CatalogBulkBar.tsx` |
| * CT-28 — limite de produtos por envio em massa. Acima disso o envio é | `src/components/catalog/CatalogBulkBar.tsx` |
| * CT-28 — limite de produtos por envio (default `CATALOG_BULK_SEND_MAX`). */ | `src/components/catalog/CatalogBulkBar.tsx` |
| CT-28 — "limite 10 por envio com mensagem clara": acima do limite o botão | `src/components/catalog/CatalogBulkBar.tsx` |
| inicial). `lazy()` fica em ESCOPO DE MÓDULO: a regra | `src/components/catalog/CatalogProductCard.tsx` |
| CatalogCategoryLike no catalogShared: o rail não precisa (nem deve) | `src/components/catalog/CatalogRail.tsx` |
| isso: o bootstrap hoje devolve apenas categories/suppliers/stats. */ | `src/components/catalog/CatalogRail.tsx` |
| botão que não faz nada (regra do plano: nada morto). */ | `src/components/catalog/CatalogRail.tsx` |
| não existe URL pública confirmada para elas no repo (a regra do plano é nada | `src/components/catalog/CatalogRail.tsx` |
| `lazy()` fica em ESCOPO DE MÓDULO: a regra `react-hooks/static-components` | `src/components/catalog/ExternalProductCatalog.tsx` |
| opção do `TalkXPagination` (8/10/20/50): o limite existe para o corte não | `src/components/catalog/ExternalProductCatalog.tsx` |
| novo `limit` (o efeito de filtros não observa `pageSize` de propósito). | `src/components/catalog/ExternalProductCatalog.tsx` |
| nova) e a UI não pode quebrar por causa de um atalho. | `src/components/catalog/ExternalProductCatalog.tsx` |
| em ESCOPO DE MÓDULO: a regra react-hooks/static-components rejeita lazy no | `src/components/catalog/ExternalProductManagement.tsx` |
| resultado de cada persistência, então o sucesso conta apenas o que o | `src/components/catalog/ExternalProductManagement.tsx` |
| não duplicar a regra. */ | `src/components/catalog/ExternalProductManagement.tsx` |
| falha dele (id inexistente/sem permissão) devolve null, caindo no | `src/components/catalog/ExternalProductManagement.tsx` |
| N-058 — alvo de toque: no celular cada aba tem no mínimo 44 px | `src/components/catalog/ExternalProductManagement.tsx` |
| CT-72 — as 4 capas acima da dobra saem eager + fetchpriority=high (mesma regra da grade do catálogo). */ | `src/components/catalog/ExternalProductManagement.tsx` |
| layout: MetaTile (Qtd. mínima / Prazo / Origem), SectionCard (Descrição / | `src/components/catalog/ProductDetailDialog.tsx` |
| * R2-MOD-046 — o override de navegação ‹ › não pode sobreviver ao | `src/components/catalog/ProductDetailDialog.tsx` |
| CT-31 — Qtd. mínima / Prazo / Origem em grade de 3 colunas (MetaTile) */} | `src/components/catalog/ProductDetailDialog.tsx` |
| produto com 11+ imagens abria acima do limite anunciado. | `src/components/catalog/SendProductDialog.tsx` |
| justamente para não entrarem na chave de reset — acrescentar foto não pode | `src/components/catalog/SendProductDialog.tsx` |
| máximo possível" (min entre as fotos visíveis e MAX_IMAGES). Sem isso, um | `src/components/catalog/SendProductDialog.tsx` |
| isso, um estado acima do limite (inicial ou restaurado) virava envio real | `src/components/catalog/SendProductDialog.tsx` |
| Y29 — sem permissão nem o fetch das fotos acontece: a porta única avisa e | `src/components/catalog/SendProductDialog.tsx` |
| R2-MOD-011 — o comando final revalida o teto: um estado acima do limite | `src/components/catalog/SendProductDialog.tsx` |
| (ex.: "Selecionar todas" com mais de 10 fotos visíveis) não pode virar | `src/components/catalog/SendProductDialog.tsx` |
| passo do contato) também recusa estado acima do limite. | `src/components/catalog/SendProductDialog.tsx` |
| A RLS permite escrita a admin e supervisor; agentes podem apenas consultar. | `src/components/catalog/WhatsAppTemplatesManager.tsx` |
| O gate acompanha essa permissão para não oferecer ações que falhariam no banco. | `src/components/catalog/WhatsAppTemplatesManager.tsx` |
| * O chamador deve substituir o endereco sem criar entrada de historico. */ | `src/components/catalog/catalogCategoryRoute.ts` |
| `null` = duplicado/malformado e nunca deve selecionar uma categoria. */ | `src/components/catalog/catalogCategoryRoute.ts` |
| Toda a exportação saiu do produto (regra do dono: nenhuma informação sai do | `src/components/catalog/catalogExport.ts` |
| * Tile de metadado do detalhe do produto (Qtd. mínima / Prazo / Origem), | `src/components/catalog/catalogShared.tsx` |
| * Constrói um `ExternalProduct` mínimo a partir de um `CatalogFavorite` | `src/components/catalog/catalogShared.tsx` |
| é conferido ANTES do `fetch` — sem permissão não há requisição de mídia nem | `src/components/catalog/sendProductUtils.ts` |
| * Jitter aleatório somado ao intervalo mínimo, para o ritmo não ser metronômico. */ | `src/components/catalog/useSendProduct.ts` |
| * Não é `Math.random()`: a regra S2245 do Sonar marca PRNG fraco como | `src/components/catalog/useSendProduct.ts` |
| CT-43 — debounce de 300 ms e mínimo de 2 caracteres: um único caractere | `src/components/catalog/useSendProduct.ts` |
| ou remount, porque staleTime apenas marca o cache como velho. | `src/components/catalog/useSendProduct.ts` |
| nenhum controle para definir a regra, a ação ou o destino — e `Salvar` | `src/components/chatbot/chatbotNodeConfig.ts` |
| fluxo usem a mesma regra. | `src/components/chatbot/chatbotNodeConfig.ts` |
| * Operadores oferecidos para a regra de um nó Condição. */ | `src/components/chatbot/chatbotNodeConfig.ts` |
| cartão, e alargar a validação para os tipos já configuráveis mudaria o | `src/components/chatbot/chatbotNodeConfig.ts` |
| limit(1) em vez de single(): single() força o header | `src/components/connections/BusinessHoursIndicator.tsx` |
| Check if current time is within business hours | `src/components/connections/BusinessHoursIndicator.tsx` |
| ja aciona o retry com backoff) nao deve esconder o badge — so !data | `src/components/connections/BusinessHoursIndicator.tsx` |
| Validação do telefone antes de criar: número brasileiro (DDI 55) precisa ter | `src/components/connections/ConnectionsView.tsx` |
| * Valida a URL da foto de perfil (http(s) e tamanho máximo). Devolve o problema em pt-BR, ou null. */ | `src/components/connections/InstanceSettingsDialog.tsx` |
| erro é o caso do atendente e não pode virar "Aquecimento iniciado". | `src/components/connections/NumberReputationMonitor.tsx` |
| precedência — é o dado do banco, não uma segunda cópia da regra. | `src/components/contacts/BulkActionsBar.tsx` |
| - `canChangeTypeSelection` (permissão por contato, do banco) tem precedência | `src/components/contacts/BulkActionsBar.tsx` |
| axe acusa TODO o texto dele com a regra `region` (fora de `<main>`). | `src/components/contacts/ContactActivityTimeline.tsx` |
| * Comparar é uma leitura lado a lado: no máximo 3 contatos (a CT-089 aplica o | `src/components/contacts/ContactCompareDialog.tsx` |
| mesmo limite na seleção do módulo). Menos de 2 não é comparação. | `src/components/contacts/ContactCompareDialog.tsx` |
| erro e vazio são explicitamente tratados — contato sem envio não pode | `src/components/contacts/ContactDetailPanel.tsx` |
| * Regra 3 (item 5): campos cuja edição MANUAL pode invalidar a coordenada já gravada. */ | `src/components/contacts/ContactForm.tsx` |
| digitando — a resposta de um endereço que saiu de cena não pode valer para o endereço vigente. | `src/components/contacts/ContactForm.tsx` |
| Regra 3 da decisão 20260930-122408-sem-tarefa (opção a): o operador reescreveu o endereço à | `src/components/contacts/ContactForm.tsx` |
| Regra 2: a coordenada nova acompanha o endereço escolhido — o aviso de "coordenada velha" sai. | `src/components/contacts/ContactForm.tsx` |
| snapshot da prop foi capturado antes dele e nao pode sobrescreve-lo — senao | `src/components/contacts/ContactKanbanView.tsx` |
| Item só aparece quando o usuário pode excluir ESTE contato (a permissão vem | `src/components/contacts/ContactListItem.tsx` |
| `total_count` vem do servidor sobre o filtro inteiro (antes do LIMIT), não | `src/components/contacts/ContactToolbar.tsx` |
| deve ser bloqueado -- mesma semântica do item avulso (`undefined` = segue | `src/components/contacts/ContactsView.tsx` |
| permissão habilita; seleção sem informação não bloqueia. | `src/components/contacts/ContactsView.tsx` |
| * Mesclar não tem permissão por contato: a RPC `merge_contacts_atomic` recusa | `src/components/contacts/ContactsView.tsx` |
| resumo do Singu, quando existe) no que a tela deve mostrar. Regra única: | `src/components/contacts/contactDisplay.ts` |
| * O item "Excluir" só deve ser oferecido quando o usuário pode excluir aquele | `src/components/contacts/contactPermissions.ts` |
| * Por que não replicar a regra no front: a condição depende de `assigned_to` e | `src/components/contacts/contactPermissions.ts` |
| uma segunda cópia da regra — foi assim que "Editar" e "Excluir" divergiram | `src/components/contacts/contactPermissions.ts` |
| bloqueado (mesma regra do item avulso — `undefined` = segue disponível). O bug | `src/components/contacts/contactPermissions.ts` |
| * Basta UM selecionado conhecido com permissão para habilitar — o lote é parcial | `src/components/contacts/contactPermissions.ts` |
| * Decide se o botão "Mesclar" da barra de ações em massa deve ser oferecido. | `src/components/contacts/contactPermissions.ts` |
| * Diferente de excluir, mesclar não tem permissão por contato: a RPC | `src/components/contacts/contactPermissions.ts` |
| segunda cópia da regra. Ele devolve `boolean \| null` (`null` = consulta em | `src/components/contacts/contactPermissions.ts` |
| cópia da regra no cliente (foi assim que "Editar" e "Excluir" divergiram, | `src/components/contacts/contactPermissions.ts` |
| * Semântica idêntica à série: basta UM selecionado conhecido com permissão para | `src/components/contacts/contactPermissions.ts` |
| (mesmo predicado de permissão do banco). `undefined` = ainda não respondeu | `src/components/contacts/types.ts` |
| * Exibe no máximo 2 sugestões ao mesmo tempo para não poluir a UI. | `src/components/copilot/AttachmentSuggestion.tsx` |
| * Motivos rápidos disponíveis (somente no thumbs down): | `src/components/copilot/CopilotFeedback.tsx` |
| * Card que exibe o resultado do cálculo de prazo de entrega. | `src/components/copilot/DeadlineCalcCard.tsx` |
| * Banner de aviso quando vendedor está prestes a dar desconto impulsivo. | `src/components/copilot/DiscountGuardrailBanner.tsx` |
| Deve ser filho do mesmo container relativo que envolve o textarea. | `src/components/copilot/GhostTextOverlay.tsx` |
| Aparece somente quando há ghost text ativo. | `src/components/copilot/GhostTextOverlay.tsx` |
| Desconto — alerta inline (sempre visível enquanto o draft tem desconto) */} | `src/components/copilot/RadarPhase8Panel.tsx` |
| Guardrail de desconto */} | `src/components/copilot/RadarPhase8to15Panel.tsx` |
| Prazo de entrega */} | `src/components/copilot/RadarPhase8to15Panel.tsx` |
| * Painel RADAR da Fase 9: catálogo, prazo reverso, orçamento, frete, upsell, kits, mockup. | `src/components/copilot/RadarPhase9Panel.tsx` |
| * Limite de aviso em segundos (padrão: 120 = 2 min). */ | `src/components/copilot/SpeedToLeadAlert.tsx` |
| * Limite crítico em segundos (padrão: 300 = 5 min). */ | `src/components/copilot/SpeedToLeadAlert.tsx` |
| * Exibe ao vendedor (e somente ao vendedor) um indicador discreto de que o | `src/components/copilot/TransparencyLabel.tsx` |
| Reforça a regra CV-064: sugestão vai para o rascunho, o vendedor decide o envio. | `src/components/copilot/TransparencyLabel.tsx` |
| CV-081-090 — Fase 9: catálogo, prazo, orçamento | `src/components/copilot/index.ts` |
| Enquanto a permissão de supervisor é checada, mostra um esqueleto do | `src/components/crm360/CRM360ExplorerView.tsx` |
| Mesma regra para o tempo de resposta: só entra na média quem teve 1ª resposta medida. | `src/components/dashboard/AgentPerformancePanel.tsx` |
| * Alvo de cada desafio = regra do jogo (o que a tela NÃO pode inventar é o | `src/components/dashboard/DashboardWidgetRenderer.tsx` |
| * R2-SLA-001 — "no prazo" no dia: o denominador é a conversa avaliada; a pendente NÃO é sucesso. */ | `src/components/dashboard/SLAMetricsDashboard.tsx` |
| `totalConversations - totalBreaches`, que contava a pendente como "no prazo". | `src/components/dashboard/SLAMetricsDashboard.tsx` |
| systemHealth.ts — regra pura da nota "Saúde do Sistema" (0-100) do painel principal. | `src/components/dashboard/systemHealth.ts` |
| Componente não pode exportar isto (lint react-refresh/only-export-components), por isso | `src/components/dashboard/systemHealth.ts` |
| a regra vive fora do .tsx. | `src/components/dashboard/systemHealth.ts` |
| * Pontos obtidos e o máximo do sinal. */ | `src/components/dashboard/systemHealth.ts` |
| gráfico diário e o ranking de agentes com apenas uma fatia. Agora a leitura | `src/components/dashboard/useSentimentData.ts` |
| 0-100 e o detalhe por sinal vêm da regra pura em ../systemHealth.ts, calculada no cliente | `src/components/dashboard/overview/SystemHealthCard.tsx` |
| de alerta do backend), então clique repetido não pode virar enxurrada. | `src/components/diagnostics/ConnectionHealthPanel.tsx` |
| * Detalhe por sinal: coleta falhada ou não executada não pode ser exibida como se | `src/components/diagnostics/DiagnosticsView.tsx` |
| Os mini-games NÃO creditam XP: o cliente não pode creditar XP (PB-18/D4) e | `src/components/gamification/miniGamesData.ts` |
| HTML sanitizado é a fonte visual da verdade quando existe (mesma regra do | `src/components/gmail/EmailThreadView.tsx` |
| Consulta fracassada nao e thread vazia: o array padrao vazio nao pode | `src/components/gmail/EmailThreadView.tsx` |
| Geração falhou: o chip não pode continuar marcado como se o tom tivesse | `src/components/inbox/AISuggestions.tsx` |
| * Telefone do cartão de contato: 8 a 15 dígitos — o MESMO limite que o | `src/components/inbox/AdvancedMessageMenu.tsx` |
| (regra react-hooks/purity): alem de impuro, o sorteio acontecia a cada re-render — e o timer da | `src/components/inbox/AudioRecorder.tsx` |
| contato, então o anexo agendado não pode ficar fora de `<contact_id>/...`. | `src/components/inbox/ChatPanel.tsx` |
| isContentEditable: mesma situação em divs/spans editáveis — Esc deve | `src/components/inbox/ContactDetails.tsx` |
| O teto acompanha a janela: a lista não pode engolir o painel da conversa. | `src/components/inbox/ConversationListSidebar.tsx` |
| * Setas ajustam de pouco em pouco; Home/End vão ao mínimo/máximo. */ | `src/components/inbox/ConversationListSidebar.tsx` |
| vivas ficam de fora: uma mensagem que chega não pode descartar o resumo em voo. | `src/components/inbox/ConversationSummary.tsx` |
| * R2-INB-018: operação REAL do host para as ações rápidas que não são apenas | `src/components/inbox/GlobalSearch.tsx` |
| apenas fechavam a busca, sem abrir conversa nem gestão de respostas. | `src/components/inbox/GlobalSearch.tsx` |
| passar por `handleSearch`: o índice não pode sobrar fora dela. | `src/components/inbox/GlobalSearch.tsx` |
| de gravar — a regra é a mesma função nos dois lugares). | `src/components/inbox/InboxSavedFiltersMenu.tsx` |
| `tecla`: a regra local/no-secret-compare confunde `.key` (tecla) com credencial. | `src/components/inbox/InboxSavedFiltersMenu.tsx` |
| Sem `load` nem `error` no prazo: vira erro com retry em vez de spinner eterno. | `src/components/inbox/LocationMessage.tsx` |
| useRef não pode ser lido/escrito durante o render (react-hooks/refs) - useState é o | `src/components/inbox/LocationPicker.tsx` |
| candidatos) — Enter com o campo vazio não pode abrir uma caixa vazia só com a atribuição. | `src/components/inbox/LocationPicker.tsx` |
| E26: falha do `/retrieve` (com o fallback do E16 já tentado) não pode fechar a lista — o | `src/components/inbox/LocationPicker.tsx` |
| Enquanto a lista visível é a da busca manual, o teclado não pode mexer no | `src/components/inbox/LocationPicker.tsx` |
| caminho de imagem (`profiles.can_download`); sem permissão, nem fetch nem anchor. | `src/components/inbox/MediaPreview.tsx` |
| fila, o guard só permite atribuir para o próprio usuário (mesma regra do | `src/components/inbox/RealtimeCollaboration.tsx` |
| retomá-la no vencimento do prazo (R2-INB-029). | `src/components/inbox/RealtimeInboxView.tsx` |
| já com conversas não lidas não é mensagem nova e não pode ser anunciado. | `src/components/inbox/RealtimeInboxView.tsx` |
| Esc é do diálogo: não pode vazar para o painel de baixo (inbox fecha por baixo). | `src/components/inbox/VideoFullscreen.tsx` |
| pré-visualização. Valor desconhecido NÃO vira rótulo inventado (mesma regra | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| R2-SLA-003: a linha enviava o prazo FIXO de 5 min ao badge compacto, | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| mesmo quando uma regra granular (por contato/empresa/cargo/tipo/fila/ | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| caimos no indicador com o prazo fixo anterior, sem chamar o hook e sem | `src/components/inbox/VirtualizedRealtimeList.tsx` |
| Regra 4 do cartao: nenhum setState depois de desmontar. | `src/components/inbox/VoiceChanger.tsx` |
| Regra 4: depois de desmontar, não entrega o blob nem mexe em estado. | `src/components/inbox/VoiceChanger.tsx` |
| desmontado) enquanto a permissão estava pendente. Nesse caso o stream | `src/components/inbox/VoiceChangerPicker.tsx` |
| O motivo real muda a ação do usuário: permissão negada, microfone | `src/components/inbox/VoiceChangerPicker.tsx` |
| Stop any current preview (e a geração anterior, que não pode tocar por baixo desta) | `src/components/inbox/VoiceSelector.tsx` |
| e um supervisor não pode marcar como lidos os sussurros endereçados a outro. | `src/components/inbox/WhisperMode.tsx` |
| * `HOVER_REVEAL_TAP` acrescenta o alvo de toque mínimo de 40 px | `src/components/inbox/hoverActions.ts` |
| muda de tamanho. Onde o ponto é um contêiner de ações, o mínimo vale para a | `src/components/inbox/hoverActions.ts` |
| * Regra (medida em produção em 03/10, item 6 do S41): | `src/components/inbox/resolveActiveTab.ts` |
| ausente (objeto orfao); `null` = estado indeterminado (a consulta falhou). Somente | `src/components/inbox/useFileUploadLogic.ts` |
| for incerto: o retry nao pode refazer o upload (URL novo mudaria a actionKey) nem criar | `src/components/inbox/useFileUploadLogic.ts` |
| * Mínimo de caracteres para a busca virar evento (abaixo disso é navegação, não consulta). */ | `src/components/inbox/useGlobalSearchData.ts` |
| A tag entra na CONSULTA, antes do `.limit(10)`: filtrar em JS depois do | `src/components/inbox/useGlobalSearchData.ts` |
| LIMIT devolvia zero quando o contato marcado era o 11º da ordem. | `src/components/inbox/useGlobalSearchData.ts` |
| Regra dos três níveis (regras.md §4.2): o atendente sempre sabe que a conexão caiu. */} | `src/components/inbox/chat/ChatInputArea.tsx` |
| apenas consumimos o contrato — nenhuma consulta e feita neste componente. | `src/components/inbox/chat/ChatMessagesArea.tsx` |
| lendo e nada pode mover o scroll. Mesmo limite do painel de equipe. */ | `src/components/inbox/chat/ChatMessagesArea.tsx` |
| * Prazo seguro de 1ª resposta enquanto o prazo aplicável ainda não chegou do hook. */ | `src/components/inbox/chat/ChatPanelHeader.tsx` |
| * Escalonamento máximo por item (cartão: no máximo 40 ms). */ | `src/components/inbox/chat/ChatSearchResultsList.tsx` |
| `event.key` comparado direto esbarra na regra local/no-secret-compare (o nome | `src/components/inbox/chat/ConversationTabs.tsx` |
| do membro tem "key"); o alias mantém a leitura e passa a regra. | `src/components/inbox/chat/ConversationTabs.tsx` |
| * Nº de e-mails não lidos do contato; o chip só deve ser montado com count > 0. */ | `src/components/inbox/chat/EmailUnreadChip.tsx` |
| * Acima de 99 o número visível vira `99+` (mesma regra do selo da sidebar — D01). */ | `src/components/inbox/chat/EmailUnreadChip.tsx` |
| embutido como `data:` URL. Prévia antiga guardada com URL remota não pode ser | `src/components/inbox/chat/LinkPreviewCard.tsx` |
| Code blocks (```...```) — must come before inline | `src/components/inbox/chat/MarkdownPreview.tsx` |
| não pode compartilhar o objeto da mensagem: apagar a mensagem/arquivo não pode quebrar o | `src/components/inbox/chat/MessageBubble.tsx` |
| então quem fala é o badge — o id cru não pode aparecer no balão. | `src/components/inbox/chat/MessageBubble.tsx` |
| * O balão não pode ficar vazio: sem ramo para `type === 'unsupported'` o `MessageBubble` | `src/components/inbox/chat/MessageBubbleUnsupported.tsx` |
| coluna/migration/Edge nova. O corte é a regra da casa `react-refresh/only-export-components` | `src/components/inbox/chat/MessageSendHistorySheet.tsx` |
| AA do E.3; `--info` só no ícone), animação apenas com `motion-safe:`, nada de exportar/baixar novo | `src/components/inbox/chat/MessageSendHistorySheet.tsx` |
| * Regra única (uma só fonte para o limiar): só afirma "Online" quando | `src/components/inbox/chat/contactPresence.ts` |
| 2 minutos — um `online` velho é sinal morto e não pode virar afirmação. | `src/components/inbox/chat/contactPresence.ts` |
| (regra react-refresh/only-export-components). | `src/components/inbox/chat/contactPresence.ts` |
| * O minimo que a regra de agrupamento precisa de uma mensagem. */ | `src/components/inbox/chat/groupWindow.ts` |
| `MessageSendHistorySheet.tsx`; o cálculo mora aqui porque a regra da casa | `src/components/inbox/chat/messageSendTimeline.ts` |
| entao nunca casa com pilula (volta `confirmed`). Mora aqui (e nao no `.tsx`) porque a regra | `src/components/inbox/chat/messageSendTimeline.ts` |
| * Limite de caracteres do editor de mensagem — fonte única (contador, botão e envio). */ | `src/components/inbox/chat/useChatInputLogic.ts` |
| * R2-INB-016 (item 312) — a assinatura de texto CONTA no limite de 4096: o limite representa | `src/components/inbox/chat/useChatInputLogic.ts` |
| `__tests__/ChatInputArea.limite-enter.test.tsx`, e não por convenção. | `src/components/inbox/chat/useChatInputLogic.ts` |
| * Grandeza do limite: corpo que vai ser enviado (sem espaços nas pontas, como o transporte | `src/components/inbox/chat/useChatInputLogic.ts` |
| (useChatPanelHandlers.handleSend), então lá o limite segue medindo o corpo do editor. | `src/components/inbox/chat/useChatInputLogic.ts` |
| ENVIO — com o editor aberto, o prazo pode vencer antes de o usuário salvar, e o | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| * R2-INB-016 (item 312) — limite de caracteres do editor. O botão Enviar já era | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| payload acima do limite anunciado saía sem resistência. A recusa (com aviso, sem | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| R2-INB-016 (item 312): o limite mede o payload REAL deste envio — o mesmo número do | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| R2-INB-016: os dois valores são os que o limite mediu no topo do comando. | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| R2-INB-014: `writeText` pode rejeitar (permissão negada / contexto inseguro). Sem | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| `zappMotion` (`deliberate` + `ease.standard`) — o kit não carrega prazo solto. | `src/components/inbox/chat/motion/DrawLine.tsx` |
| * Prazo do realce, em ms — derivado de `zappDurations` (nada solto no kit). */ | `src/components/inbox/chat/motion/FlashRing.tsx` |
| * Prazo do realce (ms) — encurtado nos testes. */ | `src/components/inbox/chat/motion/FlashRing.tsx` |
| * Prazo da celebração, em ms — derivado de `zappDurations` (nada solto no kit). */ | `src/components/inbox/chat/motion/PopBurst.tsx` |
| O atraso de cada item sai de `zappStaggerDelaySeconds` (a regra, com o teto, | `src/components/inbox/chat/motion/StaggerList.tsx` |
| * Regra do dono (11/10/2026): só as cores que o sistema já tem. Toda cor sai | `src/components/inbox/chat/motion/tone.ts` |
| Falha real (ID inválido, permissão negada, nada gravado): o diálogo | `src/components/inbox/collaboration/HandoffDialog.tsx` |
| apenas com quem casa o termo digitado, sem corte pela amostra de 20. | `src/components/inbox/collaboration/MentionInput.tsx` |
| * Acima de 99 o selo vira `99+` (mesma regra do selo da sidebar — D01). */ | `src/components/inbox/contact-details/ContactActionButtons.tsx` |
| abaixo do mínimo WCAG 1.4.11 (3:1) para ícones. L reduzido pra | `src/components/inbox/contact-details/ContactActionButtons.tsx` |
| mais etiquetas); o selo por etiqueta deve sumir quando a coluna dedicada | `src/components/inbox/contact-details/ContactHeaderSection.tsx` |
| APENAS risco de churn (nível + motivo) e melhores horários de contato. | `src/components/inbox/contact-details/ContactIntelligencePanel.tsx` |
| apenas mais um valor conhecido: a chave de storage NÃO muda, então a | `src/components/inbox/contact-details/sidebar/sidebarSections.ts` |
| 2026-10-16 e segue a MESMA regra de `intelligence`: valor conhecido a mais, | `src/components/inbox/contact-details/sidebar/sidebarSections.ts` |
| Sobe/desce a linha uma posição por vez, trocando apenas de lugar os objetos | `src/components/inbox/interactive-builder/useInteractiveMessage.ts` |
| * E27: a pausa é limite de uso, não ausência de resultado — o aviso diz quanto falta e lembra que | `src/components/inbox/location-picker/SuggestionList.tsx` |
| expira, o texto cai para o aviso genérico (o hook decide quando tentar de novo). | `src/components/inbox/location-picker/SuggestionList.tsx` |
| mês não ganha botão: nova tentativa não muda o limite, seria só ruído. | `src/components/inbox/location-picker/SuggestionList.tsx` |
| "Tentar novamente". Chegando ao fim do prazo, o próprio aviso pede a retomada (o hook vê o | `src/components/inbox/location-picker/SuggestionList.tsx` |
| morto, que dizia limite vigente quando não havia mais nenhum. Zero é "já pode tentar". | `src/components/inbox/location-picker/searchErrors.ts` |
| * F2/E15: causas de falha do `/suggest` que são **rota quebrada** (não limite de uso) e por isso | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| caem no `/forward`. `rate_limited` (429) e guarda de custo ficam de fora: são limite, não rota — | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| é limite de uso (429 / teto do mês). Com isso a UI nunca mais escreve "Nada encontrado" em | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| E54 · 429 do `/forward`: a rede de proteção também pode estar limitada. Pausa com prazo — | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| E27 · item 1: 429 não é "Falha ao buscar sugestões" — é pausa com prazo. Vai para o estado | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| novamente" é justamente o que a tela não pode fazer; digitação continua com o piso. | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| A3-03 (onda 2): o termo mudou — a resposta do termo anterior não pode mais virar estado, | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| E54 · 429 do `/forward` é limite de uso, não falha de rota: pausa com prazo, em vez de deixar | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| E54 · 429 do `/retrieve` também é limite de uso: liga o backoff de 60 s. Antes ele ficava | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| Sem `load` nem `error` no prazo (chunk, estilo ou tiles pendurados): vira erro com retry. | `src/components/inbox/location-picker/useLocationPicker.ts` |
| enquanto o endereço deste ponto carrega não pode vencer o ponto que o operador marcou. | `src/components/inbox/location-picker/useLocationPicker.ts` |
| Item sem nome fica com o rótulo genérico de antes; nome longo é truncado no mesmo limite | `src/components/inbox/tabs/AudioPlayButton.tsx` |
| com a permissao concedida — sem ela o botao e o cadeado com o motivo a vista. | `src/components/inbox/tabs/FileDetailPanel.tsx` |
| de `onError`. A imagem usa `object-contain` no cartao (print de planilha nao pode ser cortado), | `src/components/inbox/tabs/FileThumb.tsx` |
| de perfis que o `FilesTab` repassa por props (D04) — a Lista nao consulta o banco. A regra | `src/components/inbox/tabs/FilesListView.tsx` |
| * Etapa 39: motivo pelo qual o encaminhamento excede o limite (desabilita o botao). */ | `src/components/inbox/tabs/FilesSelectionBar.tsx` |
| * A varredura do periodo pode parar quando o item MAIS ANTIGO carregado ja cruzou o limite que | `src/components/inbox/tabs/FilesTab.tsx` |
| #144/OTH-002: erro na contagem nao pode virar "0" confirmado — vira "indisponivel" (—). | `src/components/inbox/tabs/FilesTab.tsx` |
| identidade de cada item sai de `resolveSenderIdentity` no cartao. D06: a permissao de | `src/components/inbox/tabs/FilesTab.tsx` |
| arquivos que estao nele. Enquanto o item mais antigo carregado nao cruzar o limite que | `src/components/inbox/tabs/FilesTab.tsx` |
| sincrona dentro do efeito) e o efeito nao pode chamar `setState` direto, entao o espelho e | `src/components/inbox/tabs/FilesTab.tsx` |
| Nao cruzou o limite ainda: pode haver arquivo do periodo em pagina mais antiga. Com so | `src/components/inbox/tabs/FilesTab.tsx` |
| "Ate" isso e a REGRA (as primeiras paginas podem ser todas posteriores ao `to`), nao excecao. | `src/components/inbox/tabs/FilesTab.tsx` |
| limite do periodo; ou o teto de paginas foi atingido. So entao da para afirmar "nenhum arquivo | `src/components/inbox/tabs/FilesTab.tsx` |
| recorte filtrado (`filtered`). Trocar o filtro/busca depois de selecionar não pode | `src/components/inbox/tabs/FilesTab.tsx` |
| cabe no `sort` do hook (que so conhece arquivo/tamanho/data): ela vive aqui e vale apenas | `src/components/inbox/tabs/FilesTableView.tsx` |
| R06 (S48): foto + nome de quem enviou (mesma regra do cartao). */} | `src/components/inbox/tabs/FilesTableView.tsx` |
| ja resolvidos pelo `FilesTab` (quem monta/rotula cada remetente e a regra D01, la), entao | `src/components/inbox/tabs/FilesToolbar.tsx` |
| Concluída reabre (volta para "A fazer"); aberta conclui. Mesma regra do módulo. | `src/components/inbox/tabs/TasksTab.tsx` |
| apenas o tipo — nunca "0 KB" nem separador solto. Acima de 1 GB o `formatSize` segue | `src/components/inbox/tabs/fileDisplay.ts` |
| medindo em MB (nao ha faixa de GB nele, e este cartao nao pode altera-lo). | `src/components/inbox/tabs/fileDisplay.ts` |
| A regra de nome tecnico continua sendo a `isTechnicalFilename` da consulta de midias. | `src/components/inbox/tabs/fileDisplay.ts` |
| * Componente de APRESENTAÇÃO: não consulta banco nem Supabase, não guarda dado de negócio e não | `src/components/inbox/tabs/journey/JourneyFilters.tsx` |
| 2) * (1 - ponto.count / maximo), | `src/components/inbox/tabs/journey/JourneyStatsHero.tsx` |
| estático que some no mesmo prazo. Em ambos os casos `onDone` avisa o fim para | `src/components/inbox/tabs/journey/motion/HighlightPulse.tsx` |
| * Prazo do realce (2 pulsos), em ms. */ | `src/components/inbox/tabs/journey/motion/HighlightPulse.tsx` |
| … +1644 linhas — lista completa em `context.json` | |
