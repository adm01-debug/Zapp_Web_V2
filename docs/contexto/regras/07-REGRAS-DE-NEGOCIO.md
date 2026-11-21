# 07 · REGRAS DE NEGÓCIO

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `b3de24d38a` · branch `main` · 2026-11-21 15:11 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## A. Regras escritas por humanos (`manual/` — prioridade máxima, nunca sobrescrito)

### regras.md

# Regras de negócio — decididas pelo dono do produto

> Escrito por humanos (entrevista com o dono, 2026-11-03). Entra em `07-REGRAS-DE-NEGOCIO.md` seção A com
> prioridade sobre o que foi extraído do código. Cada regra diz se **já existe no código** (com a evidência)
> ou se é **decisão pendente de implementação** — agente que for mexer nesses fluxos deve respeitar a
> decisão, não o comportamento atual.

## 2. Atores / perfis e o que cada um pode fazer

Papéis reais do sistema (enum `app_role`, `src/lib/appRole.ts:13`): **`admin` · `supervisor` · `agent`**. O rótulo `special_agent` ainda existe no enum do banco até a migration `20261113172000_remove_enum_special_agent` ser aplicada (PR aguardando o dono); nenhuma função, policy ou tela o usa.
`leader`, `owner` e `customer` **não são papéis**: `owner`/`admin`/`member` são papéis *dentro de um grupo do Team Chat*
(`team_conversation_members.member_role`, migration `20260927270019`); "líder" = supervisor. Medido em 2026-11-03:
4 admins, 3 supervisores, 4 agentes, 0 `special_agent`.

| Perfil | Pode | Não pode |
|---|---|---|
| **admin** | **Só ele** cria e remove a infraestrutura do atendimento: conexões WhatsApp, filas e membros, usuários e seus papéis (`user_roles`), horário comercial, SLA (`sla_configurations`), limites de campanha (`talkx_settings`), automações, chatbot, templates, blacklist, `app_settings`, provedores de IA, bloqueio de IP/país, logs de auditoria. **Único** que apaga dados em massa (contatos, campanhas, playbooks, logs). | — |
| **supervisor** | Tudo do agente **mais**: enxerga e intervém em **qualquer** conversa e contato (reatribui, muda status, encerra — `is_admin_or_supervisor` em ~120 funções); configura regras de SLA, automações e relatórios agendados; amplia a visibilidade de um agente (`agent_visibility_grants`); vê tentativas de login; **dispara campanhas** (`confirm_talkx_campaign_launch` → `talkx_confirm_launch_unauthorized` para quem não é admin/supervisor). | Criar ou apagar conexão, fila ou usuário; mexer em configuração global. |
| **agent** | Só o que é dele ou da sua fila (`can_edit_contact` = atendente dono **ou** membro da fila): cria contato, envia mensagem, cria/edita suas tarefas, agendamentos e **rascunhos** de campanha. | Ver ou mexer em conversa que não é sua nem da sua fila; mudar o próprio papel/permissões (`prevent_profile_privilege_escalation`); apagar contato ou mensagem; alterar qualquer configuração; **disparar** campanha. |
| **special_agent** | **Papel excluído por decisão do dono (2026-11-03).** Era agent + flag `profiles.can_download`; a flag continua existindo no agente comum (protegida por `20261012032331`). Nenhum agente de IA deve atribuir, tratar ou exibir esse papel. Já removido de funções, policies, CHECK de `profiles.role`, `effective_role`, `src/` e edges (`20261103201500`, #2692); o último resíduo — o rótulo no enum `app_role` — sai com `20261113172000_remove_enum_special_agent` (DDL em produção, PR aguardando o dono). | **removido** — 0 usuários |

Evidência: 18 policies RLS citam só `admin`, 10 tabelas só admin lê; funções `effective_role`, `is_admin`,
`is_admin_or_supervisor`, `can_edit_contact`, `require_contact_edit_permission` (banco ao vivo, 2026-11-03).

## 4. Ciclo de vida / estados e transições permitidas

### 4.1 Conversa (`contacts.conversation_status`)

| Regra | Estado | Evidência |
|---|---|---|
| Estados: `open`, `waiting`, `resolved`, `archived`. Transições permitidas: open → waiting/resolved/archived · waiting → open/resolved · resolved → open/archived · archived → open. | **existe** | `supabase/migrations/20260905090000_contacts_fsm_trigger.sql` |
| **Conversa `waiting` (Aguardando) não pode ir direto para `archived`** (decisão do dono, 2026-11-13): sem atendente, ela sumiria da fila sem ninguém atender. Precisa ser atendida (`open`) ou encerrada (`resolved`) antes; só então pode ser arquivada. O banco recusa com `conversation_waiting_cannot_be_archived` (gatilho de FSM e `set_conversation_status`/`set_conversations_status`); a tela esconde "Arquivar" nas conversas aguardando e o arquivamento em lote pula essas conversas e avisa quantas ficaram de fora. Supera a ADR-005 neste ponto. | **existe** (PR #3037) | `supabase/migrations/20261113171300_conversation_status_regras_e_so_por_rpc.sql`; `src/hooks/inbox/conversationArchive.ts` (`canArchiveConversation`) |
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
- **Talk X — Retomar campanha pausada: um clique, sem confirmação (decisão do dono, 2026-11-13).** O botão "Retomar" dispara o envio direto, sem diálogo "Retomar campanha?"; o aviso é o do próprio envio (um toast só). Continuam pedindo confirmação: o primeiro disparo ("Confirmar disparo?"), pausar (motivo opcional) e cancelar (irreversível). Implementação: `request({ kind: 'resume' })` em `src/components/talkx/useTalkXLifecycle.tsx` executa sem abrir o diálogo, e o mesmo vale para `TalkXCampaignPaused.tsx` e para o caminho sem `onLifecycle` de `useCampaignRowActions.tsx`; trava E2E `e2e/talkx-launch.spec.ts` (passo 4).
- **Pagamentos (`payment_links`, `contact_purchases`) será removido do sistema** (decisão 2026-11-03). Nenhum agente corrige, estende ou constrói sobre esse módulo; a tarefa pendente é a remoção. Estado medido: as duas tabelas têm **0 linhas** (`inventario/estado/banco.json`), não há edge function de pagamento, e a UI vive em `src/components/inbox/ContactPurchasesPanel.tsx` (aba vendas do inbox), `src/components/contacts/ContactPurchaseHistory.tsx` (painel do contato), `src/hooks/crm/useContactPurchases.ts` e a leitura em `src/hooks/crm/useContactCrm360.ts:181`. Moeda, desconto, expiração e permissões: **não se aplicam**.
- **ZAPP é de uma empresa só (single-tenant)** — decisão 2026-11-03. Não existe isolamento por empresa e **não deve ser criado**: RLS significa só **papel** (admin / supervisor / agent) e **propriedade** (atendente dono ou membro da fila, `can_edit_contact`). Nenhuma policy nova filtra por `company_id` e nenhuma tabela nova o exige. Estado medido: `company_id` existe só em `multiplix_recipients`, **0 policies** o usam e não há tabela `companies` — a coluna é resíduo, não propagar.
- Convites de departamento: só admin cria e apaga (decisão 2026-11-01; `src/hooks/team-chat/README.md`).
- Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + telefone `^[0-9]{10,15}$` (decisão D4; `CLAUDE.md` §6).
- **Multiplix: retomar disparo pausado em um clique; iniciar continua com confirmação** (decisão do dono, 2026-11-13). Retomar só continua a fila que já existe; iniciar um rascunho congela público/blocos e gera a fila, sem volta (`src/components/multiplix/MultiplixMonitor.tsx`). Disparo legado sem fila (pausado com `legacy_queue_unmaterialized`, ou qualquer pausado que nunca gerou fila) não tem "Retomar": exige "Iniciar" com confirmação, pelo mesmo `confirm` do rascunho. O banco garante a regra: `transition_multiplix_dispatch` recusa `start` de rascunho ou pausado sem fila com `multiplix_dispatch_confirm_required` (migration `20261114130000`), e o "Iniciar agora" do composer também passa pelo `confirm`. O "Retomado" aparece quando o status vira "enviando" (espera de até 15 s), sem aguardar o lote do worker.
- **Talk X: pausar/cancelar mantêm o diálogo aberto até o servidor responder e mostram o erro no próprio diálogo** (decisão do dono, 2026-11-13). Retomar campanha pausada é um clique, sem diálogo.

## 9. Dúvidas em aberto

1. **Mensagem enviada com WhatsApp caído: falhar (A) ou guardar em fila offline (B)?** — ver §8. Hoje falha.
2. **Atendente recebe push/e-mail de queda de conexão por padrão?** — ver §8. Hoje recebe (padrão ligado sem preferência).

Demais dúvidas: nenhuma (entrevista concluída em 2026-11-03). Novas dúvidas: adicionar aqui e avisar o dono.

## B. Quem pode ver/alterar o quê (RLS — conforme migrations do repo; schema real em `06`)

| Tabela | Política | Comando | Roles | Modo | USING | WITH CHECK |
|---|---|---|---|---|---|---|
| `copilot_presence` | copilot_presence_own | ALL | authenticated | permissive | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())` | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND session_id IN ( SELECT id FROM public.copilot_sessions WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) ) AND expires_at <= now() + interval '5 minutes'` |
| `copilot_presence` | copilot_presence_service | ALL | service_role | permissive | `true` | `true` |
| `copilot_sessions` | copilot_sessions_own | ALL | authenticated | permissive | `profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )` |  |
| `copilot_sessions` | copilot_sessions_service | ALL | service_role | permissive | `true` | `true` |
| `copilot_insights` | copilot_insights_own | SELECT | authenticated | permissive | `session_id IN ( SELECT id FROM public.copilot_sessions WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) )` |  |
| `copilot_insights` | copilot_insights_service | ALL | service_role | permissive | `true` | `true` |
| `copilot_insight_feedback` | copilot_insight_feedback_own | ALL | authenticated | permissive | `profile_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )` | `profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND session_id IN ( SELECT id FROM public.copilot_sessions WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) ) AND ( insight_id IS NULL OR insight_id IN ( SELECT id FROM public.copilot_insights WH …` |
| `copilot_insight_feedback` | copilot_insight_feedback_service | ALL | service_role | permissive | `true` | `true` |
| `copilot_retention_aggregates` | copilot_retention_aggregates_service | ALL | service_role | permissive | `true` | `true` |
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
| `user_devices` | Admins can view all user devices | SELECT | authenticated | permissive | `is_admin_or_supervisor(auth.uid())` |  |
| `agent_stats` | Only admins can update agent stats | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `nps_surveys` | Users can create own NPS surveys | INSERT | authenticated | permissive |  | `agent_id IS NOT NULL AND agent_id IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() )` |
| `team_conversations` | Members can view their conversations | SELECT | authenticated | permissive | `public.is_team_conversation_member(auth.uid(), id) OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |  |
| `team_conversations` | Authenticated users can create conversations | INSERT | authenticated | permissive |  | `created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |
| `team_messages` | Members can view conversation messages | SELECT | authenticated | permissive | `public.is_team_conversation_member(auth.uid(), conversation_id)` |  |
| `team_messages` | Members can send messages | INSERT | authenticated | permissive |  | `public.is_team_conversation_member(auth.uid(), conversation_id) AND sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |
| `team_messages` | Senders can delete own messages | DELETE | authenticated | permissive | `sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)` |  |
| `contacts` | Users can insert contacts | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid()) OR ( assigned_to IS NOT NULL AND assigned_to IN ( SELECT id FROM public.profiles WHERE user_id = auth.uid() ) )` |
| `audit_logs` | Block authenticated deletes on audit_logs | DELETE | authenticated | permissive | `false` |  |
| `audit_logs` | Block authenticated updates on audit_logs | UPDATE | authenticated | permissive | `false` |  |
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
| `number_reputation` | Admins can insert reputation | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
| `number_reputation` | Admins can update reputation | UPDATE | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `talkx_blacklist` | Admins can add to blacklist | INSERT | authenticated | permissive |  | `public.is_admin_or_supervisor(auth.uid())` |
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
| `audit_logs` | Block direct audit log inserts | INSERT | authenticated | permissive |  | `false` |
| `user_roles` | Users view own roles, admins view all | SELECT | authenticated | permissive | `user_id = auth.uid() OR is_admin_or_supervisor(auth.uid())` |  |
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
| `link_preview_cache_metrics` | Admins/supervisors can read metrics | SELECT | authenticated | permissive | `public.is_admin_or_supervisor(auth.uid())` |  |
| `link_preview_cache_metrics` | service_role inserts cache metrics | INSERT | service_role | permissive |  | `true` |
| `email_attachments` | Users can view attachments of own accounts | SELECT | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.email_messages em JOIN public.gmail_accounts ga ON ga.id = em.gmail_account_id WHERE em.id = email_attachments.email_message_id AND (ga.user_id = auth.uid() OR is_admin_or_supervisor(auth.uid())) )` |  |
| `email_attachments` | service_role inserts email attachments | INSERT | service_role | permissive |  | `true` |
| `permissions` | Admins can manage permissions | ALL | authenticated | permissive | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| `role_permissions` | Admins can manage role permissions | ALL | authenticated | permissive | `is_admin(auth.uid())` | `is_admin(auth.uid())` |
| … +283 linhas — lista completa em `context.json` | | | | | | |

## C. Restrições de dados (obrigatório / único / default / CHECK / FK / calculada)

| Tabela | Coluna | Regra |
|---|---|---|
| `copilot_presence` | `session_id` | obrigatório; FK → copilot_sessions.id ON DELETE CASCADE |
| `copilot_presence` | `profile_id` | obrigatório; FK → profiles.id |
| `copilot_presence` | `expires_at` | default now() |
| `copilot_presence` | `(tabela)` | PRIMARY KEY (session_id, profile_id) |
| `copilot_sessions` | `id` | PK; default gen_random_uuid() |
| `copilot_sessions` | `conversation_id` | obrigatório |
| `copilot_sessions` | `contact_id` | obrigatório |
| `copilot_sessions` | `profile_id` | obrigatório; FK → users.id |
| `copilot_sessions` | `brinde_meter` | default 0; CHECK brinde_meter >= 0 AND brinde_meter <= 6 |
| `copilot_sessions` | `sale_stage` | default 'novo_contato'; CHECK sale_stage IN ( 'novo_contato','qualificando','apresentando','negociando', 'fechando','pos_venda','perdido' ) |
| `copilot_sessions` | `temperature` | default 0; CHECK temperature >= 0 AND temperature <= 100 |
| `copilot_sessions` | `state_version` | default 1 |
| `copilot_sessions` | `started_at` | default now() |
| `copilot_sessions` | `created_at` | default now() |
| `copilot_sessions` | `updated_at` | default now() |
| `copilot_sessions` | `brinde_evidence` | default '{"B":null |
| `copilot_sessions` | `comm_style` | default '{}' |
| `copilot_sessions` | `decision_role` | CHECK decision_role IN ('buyer','user','approver','intermediary','unknown') |
| `copilot_sessions` | `stakeholders` | default '[]' |
| `copilot_sessions` | `brinde_state` | default '{}'::jsonb |
| `copilot_sessions` | `(tabela)` | UNIQUE (conversation_id) |
| `copilot_insights` | `id` | PK; default gen_random_uuid() |
| `copilot_insights` | `session_id` | obrigatório; FK → copilot_sessions.id ON DELETE CASCADE |
| `copilot_insights` | `profile_id` | obrigatório; FK → users.id |
| `copilot_insights` | `insight_type` | obrigatório; CHECK insight_type IN ( 'suggestion','alert','next_action','objection','brinde_field', 'temperature_change','stage_change','attachment','follow_up','other' ) |
| `copilot_insights` | `content` | obrigatório |
| `copilot_insights` | `source` | default 'local'; CHECK source IN ('local','edge','cache') |
| `copilot_insights` | `state_version` | default 1 |
| `copilot_insights` | `created_at` | default now() |
| `copilot_insights` | `tier` | default 1; CHECK tier IN (1, 2) |
| `messages` | `id` | PK; default gen_random_uuid() |
| `messages` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `messages` | `content` | obrigatório |
| `messages` | `created_at` | obrigatório |
| `messages` | `delivery_attempt_count` | obrigatório |
| `messages` | `is_edited` | obrigatório |
| `messages` | `message_type` | obrigatório |
| `messages` | `sender` | obrigatório |
| `messages` | `updated_at` | obrigatório |
| `copilot_insight_feedback` | `id` | PK; default gen_random_uuid() |
| `copilot_insight_feedback` | `insight_id` | FK → copilot_insights.id ON DELETE SET NULL |
| `copilot_insight_feedback` | `session_id` | obrigatório; FK → copilot_sessions.id ON DELETE CASCADE |
| `copilot_insight_feedback` | `profile_id` | obrigatório; FK → profiles.id |
| `copilot_insight_feedback` | `action` | obrigatório; CHECK action IN ('used_as_is','edited_and_used','discarded','marked_wrong') |
| `copilot_insight_feedback` | `created_at` | default now() |
| `copilot_retention_aggregates` | `id` | PK; default gen_random_uuid() |
| `copilot_retention_aggregates` | `profile_id` | obrigatório; FK → users.id ON DELETE CASCADE |
| `copilot_retention_aggregates` | `agg_date` | obrigatório |
| `copilot_retention_aggregates` | `sessions_opened` | default 0 |
| `copilot_retention_aggregates` | `ticks_processed` | default 0 |
| `copilot_retention_aggregates` | `insights_gen` | default 0 |
| `copilot_retention_aggregates` | `brinde_complete` | default 0 |
| `copilot_retention_aggregates` | `created_at` | default now() |
| `copilot_retention_aggregates` | `updated_at` | default now() |
| `copilot_retention_aggregates` | `(tabela)` | UNIQUE (profile_id, agg_date) |
| `profiles` | `id` | PK; default gen_random_uuid() |
| `profiles` | `user_id` | obrigatório; único; FK → users.id ON DELETE CASCADE |
| `profiles` | `name` | obrigatório |
| `profiles` | `role` | default 'agent' |
| `profiles` | `permissions` | default '{}'::jsonb |
| `profiles` | `access_level` | default 'active' |
| `profiles` | `is_active` | default true |
| `profiles` | `can_download` | obrigatório |
| `profiles` | `created_at` | obrigatório |
| `profiles` | `updated_at` | obrigatório |
| `whatsapp_connections` | `id` | PK; default gen_random_uuid() |
| `whatsapp_connections` | `auto_reconnect_enabled` | obrigatório |
| `whatsapp_connections` | `capabilities` | obrigatório |
| `whatsapp_connections` | `created_at` | obrigatório |
| `whatsapp_connections` | `name` | obrigatório |
| `whatsapp_connections` | `phone_number` | obrigatório |
| `whatsapp_connections` | `reconnect_interval_seconds` | obrigatório |
| `whatsapp_connections` | `reconnect_max_attempts` | obrigatório |
| `whatsapp_connections` | `updated_at` | obrigatório |
| `contacts` | `id` | PK; default gen_random_uuid() |
| `contacts` | `conversation_status` | obrigatório |
| `contacts` | `created_at` | obrigatório |
| `contacts` | `is_lid_legacy` | obrigatório |
| `contacts` | `name` | obrigatório |
| `contacts` | `phone` | obrigatório |
| `contacts` | `updated_at` | obrigatório |
| `client_wallet_rules` | `id` | PK; default gen_random_uuid() |
| `client_wallet_rules` | `name` | obrigatório |
| `client_wallet_rules` | `agent_id` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `client_wallet_rules` | `whatsapp_connection_id` | FK → whatsapp_connections.id ON DELETE CASCADE |
| `client_wallet_rules` | `priority` | default 0 |
| `client_wallet_rules` | `is_active` | default true |
| `client_wallet_rules` | `created_at` | default now() |
| `user_roles` | `id` | PK; default gen_random_uuid() |
| `user_roles` | `user_id` | obrigatório |
| `user_roles` | `role` | obrigatório |
| `user_roles` | `created_at` | obrigatório |
| `user_roles` | `(tabela)` | UNIQUE (user_id, role) |
| `audit_logs` | `id` | PK; default gen_random_uuid() |
| `audit_logs` | `user_id` | FK → users.id ON DELETE SET NULL |
| `audit_logs` | `action` | obrigatório |
| `audit_logs` | `details` | default '{}' |
| `audit_logs` | `created_at` | default now() |
| `audit_logs` | `(tabela)` | constraint audit_logs_action_not_empty CHECK (length(btrim(action)) > 0) |
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
| `whatsapp_groups` | `id` | PK; default gen_random_uuid() |
| `whatsapp_groups` | `created_at` | obrigatório |
| `whatsapp_groups` | `group_id` | obrigatório |
| `whatsapp_groups` | `name` | obrigatório |
| `whatsapp_groups` | `updated_at` | obrigatório |
| `message_templates` | `id` | PK; default gen_random_uuid() |
| `message_templates` | `is_global` | default false |
| `message_templates` | `content` | obrigatório |
| `message_templates` | `created_at` | obrigatório |
| `message_templates` | `title` | obrigatório |
| `message_templates` | `updated_at` | obrigatório |
| `agent_stats` | `id` | PK; default gen_random_uuid() |
| `agent_stats` | `profile_id` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `agent_stats` | `xp` | default 0 |
| `agent_stats` | `level` | default 1 |
| `agent_stats` | `achievements_count` | default 0 |
| `agent_stats` | `messages_sent` | default 0 |
| `agent_stats` | `messages_received` | default 0 |
| `agent_stats` | `conversations_resolved` | default 0 |
| `agent_stats` | `customer_satisfaction_score` | default 0 |
| `agent_stats` | `current_streak` | default 0 |
| `agent_stats` | `best_streak` | default 0 |
| `agent_stats` | `created_at` | default now() |
| `agent_stats` | `updated_at` | default now() |
| `agent_stats` | `(tabela)` | UNIQUE(profile_id) |
| `agent_stats` | `(tabela)` | constraint chk_xp_non_negative CHECK (xp >= 0) NOT VALID |
| `agent_stats` | `(tabela)` | constraint chk_level_min_one CHECK (level >= 1) NOT VAFIDD |
| `agent_stats` | `(tabela)` | constraint chk_xp_non_negative CHECK (xp >= 0) NOT VALID |
| `agent_stats` | `(tabela)` | constraint chk_level_min_one CHECK (level >= 1) NOT VALID |
| `agent_achievements` | `id` | PK; default gen_random_uuid() |
| `agent_achievements` | `profile_id` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `agent_achievements` | `achievement_type` | obrigatório |
| `agent_achievements` | `achievement_name` | obrigatório |
| `agent_achievements` | `xp_earned` | default 0 |
| `agent_achievements` | `earned_at` | default now() |
| `sla_configurations` | `id` | PK; default gen_random_uuid() |
| `sla_configurations` | `created_at` | obrigatório |
| `sla_configurations` | `first_response_minutes` | obrigatório |
| `sla_configurations` | `name` | obrigatório |
| `sla_configurations` | `priority` | obrigatório |
| `sla_configurations` | `resolution_minutes` | obrigatório |
| `sla_configurations` | `updated_at` | obrigatório |
| `conversation_sla` | `id` | PK; default gen_random_uuid() |
| `conversation_sla` | `created_at` | obrigatório |
| `conversation_sla` | `first_message_at` | obrigatório |
| `conversation_sla` | `updated_at` | obrigatório |
| `queues` | `id` | PK; default gen_random_uuid() |
| `queues` | `color` | obrigatório |
| `queues` | `created_at` | obrigatório |
| `queues` | `distribution` | obrigatório |
| `queues` | `name` | obrigatório |
| `queues` | `paused` | obrigatório |
| `queues` | `sticky_enabled` | obrigatório |
| `queues` | `updated_at` | obrigatório |
| `queue_members` | `id` | PK; default gen_random_uuid() |
| `queue_members` | `queue_id` | obrigatório; FK → queues.id ON DELETE CASCADE |
| `queue_members` | `profile_id` | obrigatório; FK → profiles.id ON DELETE CASCADE |
| `queue_members` | `is_active` | default true |
| `queue_members` | `created_at` | obrigatório |
| `queue_goals` | `id` | PK; default gen_random_uuid() |
| `queue_goals` | `created_at` | obrigatório |
| `queue_goals` | `queue_id` | obrigatório |
| `queue_goals` | `updated_at` | obrigatório |
| `products` | `id` | PK; default gen_random_uuid() |
| `products` | `created_at` | obrigatório |
| `products` | `currency` | obrigatório |
| `products` | `name` | obrigatório |
| `products` | `price` | obrigatório |
| `products` | `updated_at` | obrigatório |
| `user_settings` | `id` | PK; default gen_random_uuid() |
| `user_settings` | `created_at` | obrigatório |
| `user_settings` | `onboarding_completed` | obrigatório |
| `user_settings` | `sound_volume` | obrigatório |
| `user_settings` | `updated_at` | obrigatório |
| `contact_notes` | `id` | PK; default gen_random_uuid() |
| `contact_notes` | `contact_id` | FK → contacts.id ON DELETE CASCADE |
| `contact_notes` | `author_id` | FK → profiles.id ON DELETE CASCADE |
| `contact_notes` | `category` | obrigatório |
| `contact_notes` | `content` | obrigatório |
| `contact_notes` | `created_at` | obrigatório |
| `contact_notes` | `is_done` | obrigatório |
| `contact_notes` | `is_pinned` | obrigatório |
| `contact_notes` | `updated_at` | obrigatório |
| `business_hours` | `id` | PK; default gen_random_uuid() |
| `business_hours` | `whatsapp_connection_id` | obrigatório; FK → whatsapp_connections.id ON DELETE CASCADE |
| `business_hours` | `day_of_week` | obrigatório; CHECK day_of_week >= 0 AND day_of_week <= 6 |
| `business_hours` | `is_open` | default true |
| `business_hours` | `open_time` | default '09:00:00' |
| `business_hours` | `close_time` | default '18:00:00' |
| `business_hours` | `created_at` | default now() |
| `business_hours` | `updated_at` | default now() |
| `business_hours` | `(tabela)` | UNIQUE(whatsapp_connection_id, day_of_week) |
| `away_messages` | `id` | PK; default gen_random_uuid() |
| `away_messages` | `whatsapp_connection_id` | obrigatório; único; FK → whatsapp_connections.id ON DELETE CASCADE |
| `away_messages` | `content` | default 'Estamos |
| `away_messages` | `is_enabled` | default true |
| `away_messages` | `created_at` | default now() |
| `away_messages` | `updated_at` | default now() |
| `message_reactions` | `id` | PK; default gen_random_uuid() |
| `message_reactions` | `created_at` | obrigatório |
| `message_reactions` | `emoji` | obrigatório |
| `message_reactions` | `message_id` | obrigatório |
| `scheduled_messages` | `id` | PK; default gen_random_uuid() |
| `scheduled_messages` | `contact_id` | obrigatório |
| `scheduled_messages` | `content` | obrigatório |
| `scheduled_messages` | `created_at` | obrigatório |
| `scheduled_messages` | `message_type` | obrigatório |
| `scheduled_messages` | `scheduled_at` | obrigatório |
| `scheduled_messages` | `status` | obrigatório |
| `scheduled_messages` | `updated_at` | obrigatório |
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
| `goals_configurations` | `id` | PK; default gen_random_uuid() |
| `goals_configurations` | `created_at` | obrigatório |
| `goals_configurations` | `daily_target` | obrigatório |
| `goals_configurations` | `goal_type` | obrigatório |
| `goals_configurations` | `monthly_target` | obrigatório |
| `goals_configurations` | `updated_at` | obrigatório |
| `goals_configurations` | `weekly_target` | obrigatório |
| `notifications` | `id` | PK; default gen_random_uuid() |
| `notifications` | `user_id` | obrigatório |
| `notifications` | `type` | obrigatório |
| `notifications` | `title` | obrigatório |
| `notifications` | `message` | obrigatório |
| `notifications` | `metadata` | default '{}'::jsonb |
| `notifications` | `dedupe_key` | único |
| `notifications` | `is_read` | default false |
| `notifications` | `created_at` | default now() |
| `rate_limit_configs` | `id` | PK; default gen_random_uuid() |
| `rate_limit_configs` | `block_duration_minutes` | obrigatório |
| `rate_limit_configs` | `created_at` | obrigatório |
| `rate_limit_configs` | `endpoint_pattern` | obrigatório |
| `rate_limit_configs` | `max_requests` | obrigatório |
| `rate_limit_configs` | `name` | obrigatório |
| `rate_limit_configs` | `updated_at` | obrigatório |
| `rate_limit_configs` | `window_seconds` | obrigatório |
| `rate_limit_logs` | `id` | PK; default gen_random_uuid() |
| `rate_limit_logs` | `created_at` | obrigatório |
| `rate_limit_logs` | `endpoint` | obrigatório |
| `rate_limit_logs` | `ip_address` | obrigatório |
| `rate_limit_logs` | `request_count` | obrigatório |
| `blocked_ips` | `id` | PK; default gen_random_uuid() |
| `blocked_ips` | `blocked_at` | obrigatório |
| `blocked_ips` | `created_at` | obrigatório |
| `blocked_ips` | `ip_address` | obrigatório |
| `blocked_ips` | `reason` | obrigatório |
| `ip_whitelist` | `id` | PK; default gen_random_uuid() |
| `ip_whitelist` | `created_at` | obrigatório |
| `ip_whitelist` | `ip_address` | obrigatório |
| `mfa_sessions` | `id` | PK; default gen_random_uuid() |
| `mfa_sessions` | `created_at` | obrigatório |
| `mfa_sessions` | `expires_at` | obrigatório |
| `mfa_sessions` | `factor_id` | obrigatório |
| `security_alerts` | `id` | PK; default gen_random_uuid() |
| `security_alerts` | `alert_type` | obrigatório |
| `security_alerts` | `severity` | default 'medium' |
| `security_alerts` | `title` | obrigatório |
| `security_alerts` | `user_id` | FK → users.id ON DELETE SET NULL |
| `security_alerts` | `metadata` | default '{}' |
| `security_alerts` | `is_resolved` | default false |
| `security_alerts` | `resolved_by` | FK → users.id ON DELETE SET NULL |
| `security_alerts` | `created_at` | default now() |
| `permissions` | `id` | PK; default gen_random_uuid() |
| `permissions` | `category` | obrigatório |
| `permissions` | `created_at` | obrigatório |
| `permissions` | `name` | obrigatório |
| `role_permissions` | `id` | PK; default gen_random_uuid() |
| `role_permissions` | `created_at` | obrigatório |
| `role_permissions` | `permission_id` | obrigatório |
| `role_permissions` | `role` | obrigatório |
| `user_devices` | `id` | PK; default gen_random_uuid() |
| … +1391 linhas — lista completa em `context.json` | | |

## D. Automações no banco (triggers e funções — regras que rodam sozinhas)

| Trigger | Quando | Tabela | Executa | Condição |
|---|---|---|---|---|
| trg_touch_copilot_sessions | BEFORE UPDATE | `copilot_sessions` | `touch_copilot_sessions_updated_at` |  |
| copilot_insight_feedback_retention_guard | BEFORE INSERT OR UPDATE | `copilot_insight_feedback` | `guard_copilot_insight_feedback_retained_at` |  |
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
| talkx_suppression_reasons_guard_trigger | BEFORE INSERT OR UPDATE | `talkx_suppression_reasons` | `talkx_suppression_reasons_guard` |  |
| trg_talkx_blacklist_reason_active | BEFORE INSERT OR UPDATE OF REASON_CODE | `talkx_blacklist` | `talkx_blacklist_reason_active_guard` |  |
| trg_talkx_blacklist_audit | BEFORE INSERT OR UPDATE | `talkx_blacklist` | `talkx_blacklist_audit_trigger` |  |
| trg_talkx_blacklist_no_delete | BEFORE DELETE | `talkx_blacklist` | `talkx_blacklist_no_delete` |  |
| trg_conversation_closures_force_author | BEFORE INSERT OR UPDATE OF CLOSED_BY | `conversation_closures` | `force_conversation_closure_author` |  |
| trg_contacts_conversation_status_rpc_only | BEFORE UPDATE OF CONVERSATION_STATUS | `contacts` | `guard_conversation_status_direct_update` | `OLD.conversation_status IS DISTINCT FROM NEW.conversation_status` |
| trg_copilot_tick_on_contact_message | AFTER INSERT | `messages` | `enqueue_copilot_tick_on_contact_message` | `NEW.sender = 'contact'` |
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
| `reschedule_talkx_recipient` | service_role_required | `supabase/migrations/20260916210000_talkx_e91_resilience.sql` |
| `reschedule_talkx_recipient` | talkx_delivery_claim_conflict | `supabase/migrations/20260916210000_talkx_e91_resilience.sql` |
| `persist_sentiment_alert` | sentiment alert details do not match analysis | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment notification title and message are required | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment audit identity conflict | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
| `persist_sentiment_alert` | sentiment notification identity conflict | `supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql` |
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
| `duplicate_talkx_campaign` | talkx_campaign_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `duplicate_talkx_campaign` | talkx_campaign_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `duplicate_talkx_campaign` | talkx_campaign_not_authorized | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | authentication_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | active_profile_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | talkx_campaign_role_required | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | talkx_campaign_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | talkx_campaign_not_found | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | talkx_campaign_not_authorized | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `delete_talkx_campaign` | talkx_campaign_not_deletable | `supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql` |
| `record_talkx_recipient_receipt` | service_role_required | `supabase/migrations/20261003212707_talkx_receipts_replies.sql` |
| `record_talkx_recipient_receipt` | invalid_talkx_delivery_ack | `supabase/migrations/20261003212707_talkx_receipts_replies.sql` |
| `record_talkx_recipient_receipt` | invalid_talkx_delivery_event | `supabase/migrations/20261003212707_talkx_receipts_replies.sql` |
| `talkx_campaign_reply_stats` | invalid_talkx_campaign | `supabase/migrations/20261003212707_talkx_receipts_replies.sql` |
| `talkx_campaign_reply_stats` | talkx_reply_stats_role_required | `supabase/migrations/20261003212707_talkx_receipts_replies.sql` |
| `talkx_audience_query` | talkx_audience_authentication_required | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rules | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rules | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_group | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_group_match | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_group_rules | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_field | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_operator | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule_value | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule_value | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule_value | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule_value | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `talkx_audience_query` | invalid_talkx_audience_rule_value | `supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql` |
| `add_agent_xp` | permission denied | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `add_agent_xp` | p_xp must be a positive integer, got % | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `add_agent_xp` | p_xp exceeds single-call maximum of 500, got % | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| `cleanup_expired_challenges` | cleanup_expired_challenges: operacao restrita a service_role | `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` |
| … +720 linhas — lista completa em `context.json` | | |

## E. Estados, máquinas de estado e transições

### E.1 Colunas de status no banco

| Tabela | Coluna | Valores permitidos (enum/CHECK) | Default |
|---|---|---|---|
| `copilot_sessions` | `sale_stage` | `apresentando`, `fechando`, `negociando`, `novo_contato`, `perdido`, `pos_venda`, `qualificando` | `novo_contato` |
| `copilot_sessions` | `state_version` | **livre (sem enum/CHECK)** | `1` |
| `copilot_sessions` | `brinde_state` | **livre (sem enum/CHECK)** |  |
| `copilot_insights` | `state_version` | **livre (sem enum/CHECK)** | `1` |
| `messages` | `status` | **livre (sem enum/CHECK)** |  |
| `messages` | `transcription_status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections` | `health_status` | **livre (sem enum/CHECK)** |  |
| `whatsapp_connections` | `status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `consent_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `conversation_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `presence_status` | **livre (sem enum/CHECK)** |  |
| `contacts` | `state` | **livre (sem enum/CHECK)** |  |
| `calls` | `status` | `answered`, `busy`, `cancelled`, `declined`, `ended`, `failed`, `missed`, `ringing` | `ringing` |
| `calls` | `recording_status` | `available`, `failed`, `none`, `pending` |  |
| `scheduled_messages` | `status` | **livre (sem enum/CHECK)** |  |
| `conversation_analyses` | `status` | **livre (sem enum/CHECK)** | `pendente` |
| `password_reset_requests` | `status` | `approved`, `pending`, `rejected` | `pending` |
| `whatsapp_templates` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `csat_surveys` | `status` | **livre (sem enum/CHECK)** |  |
| `campaigns` | `status` | `cancelled`, `completed`, `draft`, `paused`, `scheduled`, `sending` | `draft` |
| `campaign_contacts` | `status` | `delivered`, `failed`, `pending`, `read`, `sent` | `pending` |
| `chatbot_executions` | `status` | `cancelled`, `completed`, `failed`, `paused`, `running` | `running` |
| `sales_deals` | `status` | **livre (sem enum/CHECK)** | `open` |
| `knowledge_base_articles` | `embedding_status` | **livre (sem enum/CHECK)** | `pending` |
| `knowledge_base_files` | `processing_status` | **livre (sem enum/CHECK)** | `pending` |
| `whatsapp_flows` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `followup_steps` | `step_order` | **livre (sem enum/CHECK)** | `1` |
| `followup_executions` | `current_step` | **livre (sem enum/CHECK)** | `0` |
| `followup_executions` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `channel_connections` | `status` | **livre (sem enum/CHECK)** | `disconnected` |
| `connection_health_logs` | `status` | **livre (sem enum/CHECK)** | `unknown` |
| `team_messages` | `status` | `delivered`, `failed`, `read`, `sent` | `sent` |
| `gmail_accounts` | `sync_status` | **livre (sem enum/CHECK)** |  |
| `email_threads` | `status` | **livre (sem enum/CHECK)** | `open` |
| `ai_usage_logs` | `status` | **livre (sem enum/CHECK)** | `success` |
| `talkx_campaigns` | `status` | **livre (sem enum/CHECK)** |  |
| `talkx_campaigns` | `draft_step` | **livre (sem enum/CHECK)** |  |
| `talkx_recipients` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `conversation_tasks` | `status` | **livre (sem enum/CHECK)** |  |
| `number_reputation` | `warmup_status` | **livre (sem enum/CHECK)** | `none` |
| `training_sessions` | `status` | **livre (sem enum/CHECK)** | `in_progress` |
| `ops.hermes_change_log` | `status` | **livre (sem enum/CHECK)** | `planejado` |
| `talkx_segments` | `status` | `active`, `draft`, `inactive` | `active` |
| `talkx_templates` | `status` | `approved`, `draft`, `review` | `approved` |
| `crm_sync_outbox` | `status` | `dead_letter`, `failed`, `pending`, `processing`, `succeeded` | `pending` |
| `catalog_send_events` | `status` | `failed`, `partial`, `sent` |  |
| `agent_presence` | `status` | `away`, `offline`, `online` | `online` |
| `multiplix_dispatches` | `status` | `cancelled`, `completed`, `draft`, `failed`, `paused`, `scheduled`, `sending` |  |
| `multiplix_recipients` | `status` | `delivered`, `failed`, `pending`, `sending`, `sent`, `skipped` |  |
| `team_message_receipts` | `status` | `delivered`, `read` | `delivered` |
| `department_invitations` | `status` | `accepted`, `expired`, `pending`, `revoked` | `pending` |
| `multiplix_delivery_items` | `status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` | `pending` |
| `ai_jobs` | `status` | `cancelled`, `failed`, `outcome_unknown`, `partial`, `queued`, `running`, `succeeded` | `queued` |
| `talkx_campaign_segments` | `status` | `done`, `paused`, `pending`, `sending` | `pending` |
| `talkx_delivery_log` | `stage` | `claim`, `complete`, `dispatch`, `reconcile`, `suppress_check` |  |
| `talkx_delivery_log` | `http_status` | **livre (sem enum/CHECK)** |  |
| `gmail_oauth_states` | `state` | **livre (sem enum/CHECK)** |  |
| `talkx_template_versions` | `status` | **livre (sem enum/CHECK)** | `draft` |
| `ai_budget_reservations` | `status` | `expired`, `released`, `reserved`, `settled` | `reserved` |
| `searchbox_budget_alert_emails` | `status` | `failed`, `pending`, `sent`, `uncertain` | `pending` |
| `searchbox_budget_alert_emails` | `http_status` | **livre (sem enum/CHECK)** |  |
| `talkx_contact_attributes` | `state` | **livre (sem enum/CHECK)** |  |
| `talkx_contact_attributes` | `funnel_stage` | **livre (sem enum/CHECK)** |  |
| `talkx_test_sends` | `status` | **livre (sem enum/CHECK)** | `pending` |
| `talkx_ddd_regions` | `state` | **livre (sem enum/CHECK)** |  |
| `message_attempts` | `provider_status` | **livre (sem enum/CHECK)** |  |
| `message_reports` | `status` | `dismissed`, `open`, `resolved` | `open` |
| `qr_attempts` | `status` | `connected`, `error`, `expired`, `pending` |  |
| `copilot_objection_catalog` | `status` | **livre (sem enum/CHECK)** | `pending_review` |
| `_zapp_mig133_log` | `status` | **livre (sem enum/CHECK)** |  |

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
| `type` | `BODY` | escreve | `src/components/catalog/metaTemplatePayload.ts` |
| `type` | `CANCEL_REMOTE` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `CLAIM` | compara, escreve | `src/components/admin/dedupeEntreAbas.ts`<br>`src/lib/calls/tabLeaderStore.ts`<br>`src/lib/crossTabDrainLock.ts`<br>`src/lib/crossTabSendDedupe.ts` |
| `type` | `CLEAR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `CLOSE` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`src/components/inbox/ChatPanel.tsx` |
| `type` | `CheckboxGroup` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `DEFAULT` | escreve | `src/components/tasks/board/boardInteracao.ts` |
| `type` | `DIAL` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `DISMISS_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `DatePicker` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `Dropdown` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `ESTABLISHED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `FAILED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `FOOTER` | escreve | `src/components/catalog/metaTemplatePayload.ts` |
| `type` | `Footer` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `HANGUP_LOCAL` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `HANGUP_REMOTE` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `HEADER` | escreve | `src/components/catalog/metaTemplatePayload.ts` |
| `type` | `HEARTBEAT` | compara, escreve | `src/lib/calls/tabLeaderStore.ts` |
| `type` | `HIGHLIGHT` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `IDAT` | compara | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-tls.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `type` | `IHDR` | compara | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-tls.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `type` | `INVITE_RECEIVED` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `NOTIFICATION_CLICK` | compara | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/chat/useTeamChatNotifications.ts`<br>`src/hooks/chat/useTeamChatNotifications.ts`<br>… +1 |
| `type` | `OPEN` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`src/components/inbox/ChatPanel.tsx` |
| `type` | `REJECT` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `RELEASE` | compara, escreve | `src/lib/calls/tabLeaderStore.ts`<br>`src/lib/crossTabDrainLock.ts`<br>`src/lib/crossTabSendDedupe.ts` |
| `type` | `REMOVE_TOAST` | compara, escreve | `src/hooks/ui/use-toast.ts` |
| `type` | `RESET` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`src/components/calls/PostCallSummary.tsx`<br>`src/components/inbox/ChatPanel.tsx`<br>`src/lib/calls/session.ts`<br>… +1 |
| `type` | `RETRIEVE_END` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRIEVE_ERROR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRIEVE_START` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RETRY` | compara, escreve | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/mutation/run-mapa.mjs`<br>`src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `RINGING` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `RadioButtonsGroup` | compara, escreve | `src/components/whatsapp-flows/FlowComponentPreview.tsx`<br>`src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `type` | `SECURITY_ACTION` | compara | `src/hooks/system/useSecurityPushNotifications.ts` |
| `type` | `SET_QUERY` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_BLOCKED` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_ERROR` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_START` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `SUGGEST_SUCCESS` | compara, escreve | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `type` | `TIMEOUT` | compara, escreve | `src/lib/calls/session.ts`<br>`src/providers/CallSessionProvider.tsx` |
| `type` | `TOGGLE` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`src/components/inbox/ChatPanel.tsx` |
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
| `type` | `agent` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts`<br>`analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/chat/useConversationActions.ts`<br>… +5 |
| `type` | `ai-stats` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `all` | compara, escreve | `src/components/contacts/useContactsViewState.ts`<br>`src/components/inbox/tabs/journey/JourneyFilters.tsx`<br>`src/hooks/chat/useConversationHistoryTimeline.ts` |
| `type` | `array` | escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js`<br>`supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts` |
| `type` | `asset` | escreve | `vite.config.ts` |
| `type` | `assign_agent` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `assigned` | escreve | `src/components/contacts/ContactActivityTimeline.tsx` |
| `type` | `audio` | compara | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/chat/useChatPanelHandlers.ts`<br>`src/components/inbox/media-gallery/MediaPreviewDialog.tsx`<br>… +11 |
| `type` | `audio_meme` | compara | `src/components/team-chat/teamChatParts.tsx` |
| `type` | `audio_memes` | compara | `src/components/settings/MediaLibraryAdmin.tsx`<br>`src/components/settings/media-library/useMediaLibrary.ts`<br>`src/components/settings/media-library/useMediaUpload.ts` |
| `type` | `audio_recorded` | compara | `supabase/functions/_shared/multiplix-content.ts`<br>`supabase/functions/multiplix-dispatch/actions/inspect.ts` |
| `type` | `authentication` | escreve, filtra | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts`<br>`supabase/functions/webauthn/index.ts` |
| `type` | `avatar` | compara | `src/components/ui/micro-interactions/skeletons.tsx` |
| `type` | `bind` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs`<br>… +2 |
| `type` | `body` | escreve | `src/components/catalog/sendTemplatePayload.ts` |
| `type` | `bold` | compara, escreve | `src/components/inbox/MessagePreview.tsx` |
| `type` | `boolean` | compara, escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js`<br>`analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/connections/IntegrationsPanel.tsx`<br>`analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/connections/IntegrationsPanel.tsx`<br>`supabase/functions/voice-agent/index.ts` |
| `type` | `broadcast` | escreve | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`src/hooks/team-chat/useTeamTyping.ts`<br>`supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `type` | `business_hours` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `button` | escreve | `src/types/chat.ts` |
| `type` | `buttons` | compara | `src/components/inbox/InteractiveMessage.tsx` |
| `type` | `buy_signal` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `call` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>… +2 |
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
| `type` | `competitor_mention` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `complete_tasks` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `condition` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/chatbot/chatbotNodeConfig.ts` |
| `type` | `confetti` | compara, escreve | `src/components/effects/Confetti.tsx` |
| `type` | `connection` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/chat/useConversationActions.ts`<br>… +2 |
| `type` | `connection_alert` | escreve | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts`<br>`supabase/functions/connection-health-check/index.ts` |
| `type` | `contact` | compara, escreve | `src/components/inbox/chat/useChatPanelHandlers.ts`<br>`src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts`<br>`src/hooks/chat/useForwardMedia.ts`<br>`src/hooks/chat/useForwardMessage.ts`<br>… +1 |
| `type` | `counter` | escreve | `supabase/functions/_shared/observability.ts` |
| `type` | `cpf` | escreve | `src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `created` | escreve | `src/components/contacts/ContactActivityTimeline.tsx` |
| `type` | `critical` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/business/useWarRoomData.ts`<br>`src/components/dashboard/WarRoomDashboard.tsx`<br>`src/components/dashboard/war-room/WarRoomAlertRow.tsx`<br>`src/hooks/business/useWarRoomData.ts` |
| `type` | `crm` | compara, escreve | `src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts` |
| `type` | `cross_sell` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-product-recommendation/index.ts` |
| `type` | `crosssell` | escreve | `src/hooks/copilot/useUpsellSuggestion.ts` |
| `type` | `csp-violation` | compara, escreve | `supabase/functions/csp-report/index.ts` |
| `type` | `custom_emojis` | compara | `src/components/settings/media-library/useMediaLibrary.ts` |
| `type` | `customer_escalation` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `dashboard` | compara | `src/components/performance/LazyRoutes.tsx` |
| `type` | `data_unavailable` | escreve | `src/hooks/chat/useNextBestAction.ts` |
| `type` | `date` | compara, escreve | `src/components/email/EmailChatThread.tsx` |
| `type` | `deadline_request` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `deal` | escreve | `src/lib/journey/mappers.ts` |
| `type` | `delay` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx` |
| `type` | `delete` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts`<br>`src/components/team-chat/useTeamChatPanel.ts`<br>`src/hooks/team-chat/useTeamMessages.ts` |
| `type` | `department` | compara | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts`<br>`src/components/team-chat/useTeamChatPanel.ts`<br>`src/hooks/team-chat/useTeamChatMutations.ts`<br>`src/lib/teamChatRules.ts` |
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
| `type` | `fail` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
| `type` | `featured` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `file` | compara | `src/components/inbox/chat/useChatPanelHandlers.ts` |
| `type` | `filtered-empty` | compara | `src/components/contacts/ContactEmptyState.tsx` |
| `type` | `first-input` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `fixme` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs` |
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
| `type` | `image` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-provider-readiness.unit.mjs`<br>`src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/LinkPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>… +13 |
| `type` | `image_url` | compara, escreve | `analise-prs/resgate-regra8-261118/supabase/functions/ai-multimodal-analysis/index.ts`<br>`supabase/functions/_shared/ai-generate.ts`<br>`supabase/functions/_shared/ai-image-input.ts`<br>`supabase/functions/ai-multimodal-analysis/index.ts`<br>`supabase/functions/classify-emoji/index.ts`<br>… +1 |
| `type` | `implicit` | escreve | `src/hooks/copilot/usePurchaseSignals.ts` |
| `type` | `incoming_call` | compara, escreve | `src/hooks/communication/useIncomingCallListener.ts`<br>`supabase/functions/_shared/notification-events.ts` |
| `type` | `info` | escreve | `src/hooks/system/useNotifications.ts` |
| `type` | `input_audio` | escreve | `supabase/functions/_shared/ai-audio-input.ts`<br>`supabase/functions/classify-audio-meme/index.ts` |
| `type` | `insert` | escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts` |
| `type` | `integer` | escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js` |
| `type` | `interactive` | compara | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx` |
| `type` | `isNew` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `issue` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
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
| `type` | `logo_sent` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `longtask` | escreve | `src/lib/web-vitals.ts` |
| `type` | `lowStock` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `magiclink` | escreve | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts`<br>`src/hooks/auth/useAuthForm.ts`<br>`supabase/functions/webauthn/index.ts` |
| `type` | `message` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/RealtimeInboxView.tsx`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts`<br>… +8 |
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
| `type` | `number` | compara, escreve | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/connections/IntegrationsPanel.tsx`<br>`analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/connections/IntegrationsPanel.tsx`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts` |
| `type` | `object` | escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js`<br>`supabase/functions/_shared/ai-conversation-pipeline.ts`<br>`supabase/functions/ai-conversation-analysis/index.ts`<br>`supabase/functions/ai-conversation-summary/index.ts`<br>… +1 |
| `type` | `objection` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `onlyInStock` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `ordered-list` | compara | `src/components/inbox/chat/RichTextToolbar.tsx` |
| `type` | `owner` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
| `type` | `paint` | escreve | `src/hooks/analytics/usePerformanceOptimizations.ts`<br>`src/lib/web-vitals.ts` |
| `type` | `party` | compara | `src/components/effects/EasterEggs.tsx` |
| `type` | `phone` | compara, escreve | `src/components/inbox/InteractiveMessage.tsx`<br>`src/hooks/copilot/useDataMasking.ts`<br>`src/hooks/copilot/usePIIDetector.ts` |
| `type` | `price_negotiation_won` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `price_request` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `prio` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `product` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-multimodal-analysis/index.ts` |
| `type` | `ptt` | escreve | `supabase/functions/_shared/evolution-go-routes.ts` |
| `type` | `ptv` | escreve | `supabase/functions/_shared/evolution-go-routes.ts` |
| `type` | `public-key` | compara, escreve | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts`<br>`supabase/functions/webauthn/index.ts` |
| `type` | `question` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx` |
| `type` | `queue` | compara | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts`<br>`analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/chat/useConversationActions.ts`<br>… +4 |
| `type` | `queues` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `reactivation` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `readself` | compara | `supabase/functions/_shared/evolution-go-adapter.ts` |
| `type` | `redo` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `registration` | escreve, filtra | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts`<br>`supabase/functions/webauthn/index.ts` |
| `type` | `reminder_due` | compara, escreve | `src/components/notifications/NotificationItem.tsx`<br>`src/hooks/system/useNotifications.ts`<br>`src/hooks/tasks/useWorkItemNotifications.ts` |
| `type` | `remove` | compara | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `type` | `removeGroup` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `removeRule` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `reply` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>… +4 |
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
| `type` | `sent` | escreve | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/hooks/gamification/mutations.ts` |
| `type` | `sentiment_alert` | compara, escreve | `src/hooks/inbox/useRealtimeSentimentAlerts.ts`<br>`supabase/functions/_shared/notification-events.ts`<br>`supabase/functions/sentiment-alert/index.ts` |
| `type` | `setMatch` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `signup` | compara, escreve | `src/pages/VerifyEmail.tsx` |
| `type` | `silent` | escreve | `src/hooks/copilot/useStallDetector.ts` |
| `type` | `skip` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/results.mjs` |
| `type` | `sort` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `spring` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/SendErrorBanner.tsx`<br>`analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/UnconfirmedMessagesPanel.tsx`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx`<br>`analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/BulkActionsBar.tsx`<br>… +63 |
| `type` | `star` | compara | `src/components/effects/Confetti.tsx` |
| `type` | `start` | compara, escreve | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/hooks/integrations/useChatbotFlows.ts` |
| `type` | `stat` | compara | `src/components/ui/micro-interactions/skeletons.tsx` |
| `type` | `stats` | compara, escreve | `src/components/dashboard/DashboardWidgetRenderer.tsx`<br>`src/hooks/analytics/useDashboardWidgets.ts` |
| `type` | `sticker` | compara | `src/components/inbox/MediaPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/media-gallery/MediaPreviewDialog.tsx`<br>`src/components/inbox/tabs/FileDetailPanel.tsx`<br>… +3 |
| `type` | `stickers` | compara | `src/components/settings/media-library/useMediaLibrary.ts`<br>`src/components/settings/media-library/useMediaUpload.ts` |
| `type` | `string` | compara, escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js`<br>`analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/results.mjs`<br>`analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts`<br>… +7 |
| `type` | `style` | compara | `src/hooks/performance/useDataOptimization.ts` |
| `type` | `success` | compara, escreve | `src/components/ui/micro-interactions/feedback.tsx`<br>`src/hooks/ui/useLoadingState.ts` |
| `type` | `successful_close` | escreve | `src/hooks/copilot/useLearningMoment.ts` |
| `type` | `suggestion` | escreve | `src/components/inbox/copilot/InsightCard.tsx` |
| `type` | `supplier` | compara, escreve | `src/components/catalog/ExternalProductManagement.tsx` |
| `type` | `support` | escreve | `src/components/admin/TrainingMode.tsx` |
| `type` | `svg` | escreve | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts`<br>`supabase/functions/evolution-api/index.ts` |
| `type` | `system` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts`<br>`analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts`<br>… +5 |
| `type` | `tag` | escreve | `src/components/contacts/ContactSearchWithSuggestions.tsx` |
| `type` | `tag_added` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `task` | escreve | `src/lib/journey/mappers.ts` |
| `type` | `team_chat` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/chat/useTeamChatNotifications.ts`<br>`analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/chat/useTeamChatNotifications.ts`<br>`src/hooks/chat/useTeamChatNotifications.ts` |
| `type` | `template` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `text` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/SendErrorBanner.tsx`<br>`analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/inbox/MessageContextMenu.tsx`<br>`analise-prs/resgate-regra8-261118/supabase/functions/ai-multimodal-analysis/index.ts`<br>`src/components/catalog/sendTemplatePayload.ts`<br>`src/components/inbox/AdvancedMessageMenu.tsx`<br>… +17 |
| `type` | `time_inactive` | escreve | `src/components/automations/automationConstants.ts` |
| `type` | `timing` | escreve | `src/hooks/integrations/useTalkXInsights.ts` |
| `type` | `toggleAlarm` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `toggleDone` | compara, escreve | `src/hooks/tasks/useTasksFilters.ts` |
| `type` | `totp` | escreve | `src/hooks/auth/useMFA.ts` |
| `type` | `transcription` | compara, escreve | `src/components/inbox/search/GlobalSearchResults.tsx`<br>`src/components/inbox/useGlobalSearchData.ts` |
| `type` | `transfer` | compara | `src/components/chatbot/ChatbotFlowEditor.tsx`<br>`src/components/chatbot/ChatbotNodeDialogs.tsx`<br>`src/components/chatbot/chatbotNodeConfig.ts` |
| `type` | `unanswered_question` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`<br>`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`<br>`supabase/functions/_shared/copilot-tick.ts` |
| `type` | `undo` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `unsupported` | compara | `src/components/inbox/chat/MessageBubble.tsx`<br>`src/components/inbox/chat/MessageBubbleUnsupported.tsx`<br>`src/types/chat.ts` |
| `type` | `update` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts`<br>`analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts`<br>`src/hooks/team-chat/useTeamMessages.ts` |
| `type` | `updateRule` | compara, escreve | `src/components/talkx/segments/TalkXSegmentBuilder.tsx`<br>`src/components/talkx/segments/segmentBuilderReducer.ts` |
| `type` | `upsell` | compara, escreve | `src/components/copilot/UpsellCard.tsx`<br>`src/hooks/chat/useNextBestAction.ts`<br>`src/hooks/copilot/useUpsellSuggestion.ts` |
| `type` | `urgent_conversation` | escreve | `supabase/functions/ai-auto-tag/index.ts` |
| `type` | `url` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts`<br>`src/components/inbox/InteractiveMessage.tsx`<br>`src/components/inbox/InteractiveMessageBuilder.tsx`<br>`src/components/inbox/interactive-builder/ButtonTypeHelpers.tsx`<br>`src/components/inbox/interactive-builder/useInteractiveMessage.ts`<br>… +1 |
| `type` | `video` | compara, escreve | `src/components/inbox/ForwardMessageDialog.tsx`<br>`src/components/inbox/LinkPreview.tsx`<br>`src/components/inbox/MediaPreview.tsx`<br>`src/components/inbox/ReplyQuote.tsx`<br>`src/components/inbox/chat/MessageBubble.tsx`<br>… +8 |
| `type` | `voice_ai` | compara | `supabase/functions/_shared/multiplix-content.ts`<br>`supabase/functions/multiplix-dispatch/actions/inspect.ts` |
| `type` | `volume` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-runtime.unit.mjs`<br>… +1 |
| `type` | `waiting_contacts` | escreve | `src/hooks/business/useQueueGoals.ts` |
| `type` | `websearch` | escreve | `supabase/functions/promogifts-catalog/index.ts` |
| `type` | `website` | escreve | `src/components/inbox/LinkPreview.tsx` |
| `type` | `whatsapp` | escreve | `src/components/inbox/contact-details/ContactActionButtons.tsx` |
| `phase` | `Auditar` | escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js` |
| `phase` | `Confirmar` | escreve | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js`<br>`analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js` |
| `phase` | `booting` | compara | `src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceTranscriptArea.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `phase` | `error` | compara | `src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceSearchOverlay.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `phase` | `idle` | compara | `src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceSearchOverlay.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `phase` | `listening` | compara | `src/components/voice/AudioFrequencyVisualizer.tsx`<br>`src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceSearchOverlay.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `phase` | `preflight` | escreve | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs`<br>`analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `phase` | `processing` | compara | `src/components/voice/AudioFrequencyVisualizer.tsx`<br>`src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceSearchOverlay.tsx`<br>`src/components/voice/VoiceTranscriptArea.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `phase` | `speaking` | compara | `src/components/voice/AudioFrequencyVisualizer.tsx`<br>`src/components/voice/VoiceOrb.tsx`<br>`src/components/voice/VoiceSearchOverlay.tsx`<br>`src/components/voice/usePhaseColors.ts` |
| `status` | `403` | compara | `src/lib/rlsError.ts` |
| `status` | `CHANNEL_ERROR` | compara | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts`<br>`src/hooks/communication/useAudioMemes.ts`<br>`src/hooks/realtime/useSupabaseRealtime.ts`<br>`src/hooks/team-chat/useTeamConversations.ts`<br>`src/hooks/team-chat/useTeamMessageReactions.ts`<br>… +2 |
| `status` | `CLOSED` | compara | `src/hooks/realtime/useSupabaseRealtime.ts` |
| `status` | `COMPLETED` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/fila-merge.mjs`<br>`analise-prs/resgate-261118-lote3/claude_04/trusting-newton-duiglt/scripts/ci/fila-merge.mjs`<br>`analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.mjs`<br>`analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.unit.mjs`<br>`analise-prs/resgate-261118-lote3/f3/strict-false-baseline-20261018/scripts/ci/fila-merge.unit.mjs` |
| `status` | `DONE_VERIFIED` | compara, escreve | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.unit.mjs` |
| `status` | `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` | escreve | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude/wizardly-ride-dimxnt/scripts/ci/ci-docs-baseline.unit.mjs`<br>`analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/ci-docs-baseline.unit.mjs`<br>`analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/ci-docs-baseline.unit.mjs`<br>`analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/ci-docs-baseline.unit.mjs`<br>… +2 |
| `status` | `IN_PROGRESS` | compara, escreve | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.mjs`<br>`analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.unit.mjs`<br>`analise-prs/resgate-261118-lote3/f3/strict-false-baseline-20261018/scripts/ci/fila-merge.unit.mjs` |
| … +296 linhas — lista completa em `context.json` | | | |

### E.4 Enums e listas de valores

| Nome | Valores | Onde |
|---|---|---|
| app_role | `admin`, `supervisor`, `special_agent`, `agent` | banco |
| channel_type | `whatsapp`, `instagram`, `telegram`, `messenger`, `webchat`, `email` | banco |
| service_account_type | `google_sheets`, `google_docs`, `google_calendar`, `google_drive`, `dropbox` | banco |
| ai_provider_type | `lovable_ai`, `openai_compatible`, `google_gemini`, `custom_webhook`, `custom_agent` | banco |
| multiplix_dispatch_status | `draft`, `scheduled`, `sending`, `paused`, `completed`, `completed_with_failures`, `failed`, `cancelled` | banco |
| multiplix_recipient_status | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `skipped`, `cancelled`, `outcome_unknown` | banco |
| multiplix_item_status | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` | banco |
| multiplix_block_type | `text`, `voice_ai`, `audio_recorded`, `file` | banco |
| multiplix_eligibility | `eligible`, `no_destination`, `suppressed`, `out_of_scope`, `media_pending`, `connection_unavailable`, `requires_template` | banco |
| talkx_blacklist_reason | `opt_out`, `bounce`, `spam`, `manual`, `other` | banco |
| TalkXTone | primary \| danger \| success \| violet | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/talkx/kit/dialogs.tsx` |
| DeadlineFeasibility | ok \| tight \| impossible | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useDeadlineCalculator.ts` |
| LeadTemperature | cold \| warm \| hot | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useLeadThermometer.ts` |
| LossRiskLevel | low \| medium \| high | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useLossRiskDetector.ts` |
| ObjeçãoType | preco \| prazo \| quantidade_minima \| concorrente \| chefe \| qualidade \| frete \| generica | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useObjectionHandler.ts` |
| DeadlineFeasibility | ok \| tight \| impossible | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useDeadlineCalculator.ts` |
| LeadTemperature | cold \| warm \| hot | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useLeadThermometer.ts` |
| LossRiskLevel | low \| medium \| high | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useLossRiskDetector.ts` |
| ObjeçãoType | preco \| prazo \| quantidade_minima \| concorrente \| chefe \| qualidade \| frete \| generica | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useObjectionHandler.ts` |
| DeliveryErrorCode | invalid_number \| instance_unavailable \| provider_rejected \| provider_unavailable \| rate_limited \| in_progress \| receipt_unconfirmed \| media_invalid | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| TalkXWorkerState | sending \| stalled \| paused_manual \| paused_auto \| done | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| BrindeLetter | B \| R \| I \| N \| D \| E | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/src/hooks/copilot/useCopilotSession.ts` |
| SALE_STAGES | "novo_contato", "qualificando", "apresentando", "negociando", "fechando", "pos_venda", "perdido", | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| DECISION_ROLES | "buyer", "user", "approver", "intermediary", "unknown" | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| SUGGESTION_PATHS | "avancar", "descobrir", "relacionar" | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| TalkXTopView | tabs \| wizard \| monitor \| scheduled \| running \| paused | `analise-prs/resgate-261118-lote3/claude/feat-talkx-x054-cmdk-261108-0100/src/components/talkx/TalkXView.tsx` |
| SuppressionActivityAction | add \| remove \| update \| import \| export | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| SUPPRESSION_ACTIVITY_EVENT_TYPES | 'suppression_add', 'suppression_remove', 'suppression_update', 'suppression_import', 'suppression_export', | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| RadarPanelMode | mini \| normal \| focus | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/hooks/copilot/useRadarPanel.ts` |
| RuleField | tags \| company \| contact_type \| conversation_status \| channel_type \| consent_status \| lead_score \| risk_score \| ai_priority \| ai_sentiment \| lead_origin \| updated_at \| created_at \| email \| city \| state \| assigned_to \| group_category \| real_sector \| real_uf | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| RuleOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| in_last_days \| not_in_last_days \| is_set \| is_empty | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| SegmentJoin | and \| or | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentBulkAction | draft \| activate \| deactivate \| archive \| tag | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentsViewMode | list \| grid | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| LIBRARY_STATS_QUERY_KEY | 'talkx-segment-library-stats', SEGMENT_TIMEZONE | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| MainTab | open \| resolved \| search | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/conversation-list/StatusChips.tsx` |
| SubTab | attending \| waiting | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/conversation-list/StatusChips.tsx` |
| ChipTab | all \| unread \| attending \| waiting \| resolved \| archived | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/conversation-list/StatusChips.tsx` |
| TalkXTopView | tabs \| wizard \| monitor \| scheduled \| running \| paused | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXView.tsx` |
| AudienceSource | contacts \| segment \| crm360 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| RuleField | tags \| company \| contact_type \| conversation_status \| channel_type \| consent_status \| lead_score \| risk_score \| ai_priority \| ai_sentiment \| lead_origin \| updated_at \| created_at \| email \| city \| state \| assigned_to \| group_category \| real_sector \| real_uf | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| RuleOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| in_last_days \| not_in_last_days \| is_set \| is_empty | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| SegmentJoin | and \| or | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentBulkAction | draft \| activate \| deactivate \| archive \| tag | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentsViewMode | list \| grid | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| LIBRARY_STATS_QUERY_KEY | 'talkx-segment-library-stats', SEGMENT_TIMEZONE | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| HealthStatus | healthy \| degraded \| down \| unauthorized \| unknown | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| OutboundMessageType | text \| image \| audio \| video \| document \| sticker \| location | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| RuleField | tags \| company \| contact_type \| conversation_status \| channel_type \| consent_status \| lead_score \| risk_score \| ai_priority \| ai_sentiment \| lead_origin \| updated_at \| created_at \| email \| city \| state \| assigned_to \| group_category \| real_sector \| real_uf | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| RuleOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| in_last_days \| not_in_last_days \| is_set \| is_empty | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| SegmentJoin | and \| or | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentBulkAction | draft \| activate \| deactivate \| archive \| tag | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentsViewMode | list \| grid | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| LIBRARY_STATS_QUERY_KEY | 'talkx-segment-library-stats', SEGMENT_TIMEZONE | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| HealthStatus | healthy \| degraded \| down \| unauthorized \| unknown | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| HealthStatus | healthy \| degraded \| down \| unauthorized \| unknown | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| WorkItemDateFormat | datetime \| day | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/tasks/workItemFormat.ts` |
| MES_CURTO_PT_BR | 'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.', | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/tasks/workItemFormat.ts` |
| BrindeLetter | B \| R \| I \| N \| D \| E | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/src/hooks/copilot/useCopilotSession.ts` |
| SALE_STAGES | "novo_contato", "qualificando", "apresentando", "negociando", "fechando", "pos_venda", "perdido", | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| SUGGESTION_PATHS | "avancar", "descobrir", "relacionar" | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| HealthStatus | healthy \| degraded \| down \| unauthorized \| unknown | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| GmailHistoryResetOutcome | reset \| conflict | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| GmailAccountFailure | reauth_required \| error | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| AudienceSource | contacts \| segment \| crm360 | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| RuleField | tags \| company \| contact_type \| conversation_status \| channel_type \| consent_status \| lead_score \| risk_score \| ai_priority \| ai_sentiment \| lead_origin \| updated_at \| created_at \| email \| city \| state \| assigned_to \| group_category \| real_sector \| real_uf | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| RuleOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| in_last_days \| not_in_last_days \| is_set \| is_empty | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| SegmentJoin | and \| or | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentBulkAction | draft \| activate \| deactivate \| archive \| tag | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| TalkXSegmentsViewMode | list \| grid | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| LIBRARY_STATS_QUERY_KEY | 'talkx-segment-library-stats', SEGMENT_TIMEZONE | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| HealthLevel | healthy \| degraded \| disconnected | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| GmailHistoryResetOutcome | reset \| conflict | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/gmail-helpers.ts` |
| GmailAccountFailure | reauth_required \| error | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/gmail-helpers.ts` |
| HealthLevel | healthy \| degraded \| disconnected | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| PairingFlavor | go \| v2 | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
| GmailHistoryResetOutcome | reset \| conflict | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/gmail-helpers.ts` |
| GmailAccountFailure | reauth_required \| error | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/gmail-helpers.ts` |
| HealthLevel | healthy \| degraded \| disconnected | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| TargetType | all \| tag \| queue \| groups \| custom | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/campaigns/CampaignCreateDialog.tsx` |
| MessageType | text \| image \| video \| document | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/campaigns/CampaignCreateDialog.tsx` |
| CallResultFilter | ended_answered \| ended_missed \| missed \| busy \| failed \| ringing \| answered | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/hooks/communication/useCallHistory.ts` |
| BrindeLetter | B \| R \| I \| N \| D \| E | `analise-prs/resgate-261118-lote3/resolve-2381-from-main/src/hooks/copilot/useCopilotSession.ts` |
| SALE_STAGES | "novo_contato", "qualificando", "apresentando", "negociando", "fechando", "pos_venda", "perdido", | `analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts` |
| SUGGESTION_PATHS | "avancar", "descobrir", "relacionar" | `analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts` |
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
| PRESENCE_OPTIONS | { value: 'available', label: 'Disponível (online)' }, { value: 'unavailable', label: 'Indisponível (offline)' }, | `src/components/connections/instancePresenceOptions.ts` |
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
| EPHEMERAL_OPTIONS | { value: '0', label: 'Desligado' }, { value: '86400', label: '24 horas' }, { value: '604800', label: '7 dias' }, { value: '7776000', label: '90 dias' }, | `src/components/groups/groupEvolutionOptions.ts` |
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
| SIDEBAR_SECTIONS | 'professional', 'personal', 'singu', 'intelligence', 'delivery', 'memoria', 'atendimento', 'crm360' | `src/components/inbox/contact-details/sidebar/sidebarSections.ts` |
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
| INSTANCE_PAUSES_QUERY_KEY | 'instance-pauses' | `src/components/monitoring/hooks/useInstancePauses.ts` |
| MetricStatus | good \| warning \| critical | `src/components/performance/metricThresholds.ts` |
| PeriodOption | 7d \| 14d \| 30d \| custom | `src/components/queues/PeriodSelector.tsx` |
| ProviderType | lovable_ai \| openai_compatible \| google_gemini \| custom_webhook \| custom_agent | `src/components/settings/ai-providers/types.ts` |
| MediaType | stickers \| audio_memes \| custom_emojis | `src/components/settings/media-library/useMediaLibrary.ts` |
| PRESET_FIXED_OVERRIDES | 'gradient-success' | `src/components/settings/theme/presets.ts` |
| AudienceFilterKey | contact_status \| company \| funnel_stage \| seller \| rfm \| location | `src/components/talkx/TalkXAudienceFilters.tsx` |
| TalkXPreviewMode | raw \| resolved | `src/components/talkx/TalkXMessagePreview.tsx` |
| TalkXTopView | tabs \| wizard \| monitor \| scheduled \| running \| paused \| report | `src/components/talkx/TalkXView.tsx` |
| AnalyticsPeriod | 7d \| 30d \| 90d \| month \| custom | `src/components/talkx/talkxAnalyticsFilters.ts` |
| TalkxInteractiveButtonType | reply \| link | `src/components/talkx/talkxInteractive.ts` |
| TalkxInteractiveMode | none \| buttons \| poll | `src/components/talkx/talkxInteractive.ts` |
| TalkXScreen | monitor \| scheduled \| running \| paused \| report | `src/components/talkx/talkxRoute.ts` |
| TALKX_TABS | 'overview', 'segments', 'templates', 'suppression', 'analytics' | `src/components/talkx/talkxRoute.ts` |
| ConflictAction | skip \| overwrite \| copy | `src/components/talkx/talkxTemplateFile.ts` |
| TalkXTemplateTab | conteudo \| ab \| historico | `src/components/talkx/talkxTemplateRoute.ts` |
| AudienceSource | contacts \| segment \| crm360 | `src/components/talkx/useCampaignEditor.ts` |
| CampaignRowActionId | view \| edit \| start \| pause \| resume \| duplicate \| cancel \| delete | `src/components/talkx/useCampaignRowActions.tsx` |
| CampaignRowConfirmKind | start \| pause \| duplicate \| cancel \| delete | `src/components/talkx/useCampaignRowActions.tsx` |
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
| BrindeLetter | B \| R \| I \| N \| D \| E | `src/data/copilot/brinde-questions.ts` |
| FaseVenda | inicio \| meio \| fim | `src/data/copilot/sale-stages.ts` |
| SALE_STAGES | 'novo_contato', 'qualificando', 'apresentando', 'negociando', 'fechando', 'pos_venda', 'perdido', | `src/data/copilot/sale-stages.ts` |
| PlayCategory | descoberta \| ancoragem \| urgencia \| fechamento \| relacionamento \| objection | `src/data/copilot/winning-plays.ts` |
| SaleStage | E1 \| E2 \| E3 \| E4 \| E5 \| E6 | `src/data/copilot/winning-plays.ts` |
| BrindeLetter | B \| R \| I \| N \| D \| E | `src/data/copilot/winning-plays.ts` |
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
| INSTANCE_PAUSES_CONEXOES_KEY | ...INSTANCE_PAUSES_QUERY_KEY, 'conexoes' | `src/hooks/connections/useInstancePauseControls.ts` |
| CONTACTS_V2_AREAS | 'toolbar', 'cards', 'detalhe', 'empresa', 'edicao', 'protecao' | `src/hooks/contacts/useContactsV2Flags.ts` |
| AttachmentType | catalog \| product_photo \| price_table \| mockup | `src/hooks/copilot/useAttachmentSuggestion.ts` |
| AudioToneType | angry \| frustrated \| enthusiastic \| neutral \| uncertain | `src/hooks/copilot/useAudioTone.ts` |
| BiasCategory | unrealistic_promise \| competitor_derogation \| excessive_informality \| pressure_tactic \| exclusionary_language | `src/hooks/copilot/useBiasChecker.ts` |
| EditLevel | igual \| pouco \| muito | `src/hooks/copilot/useCopilotFeedback.ts` |
| FeedbackRating | positive \| negative | `src/hooks/copilot/useCopilotFeedback.ts` |
| FeedbackReason | errou_fato \| tom_errado \| fora_de_hora \| generica | `src/hooks/copilot/useCopilotFeedback.ts` |
| SuggestionOutcome | accepted \| edited \| rejected \| ignored | `src/hooks/copilot/useCopilotLearning.ts` |
| BrindeLetter | B \| R \| I \| N \| D \| E | `src/hooks/copilot/useCopilotSession.ts` |
| InsightPriority | critical \| high \| medium \| low | `src/hooks/copilot/useCopilotSupervisor.ts` |
| InsightSource | objection \| purchase_signal \| speed_to_lead \| guardrail \| silence \| loss_risk \| discount_guardrail \| deadline | `src/hooks/copilot/useCopilotSupervisor.ts` |
| DeadlineFeasibility | ok \| tight \| impossible | `src/hooks/copilot/useDeadlineCalculator.ts` |
| LeadTemperature | cold \| warm \| hot | `src/hooks/copilot/useLeadThermometer.ts` |
| LearningMomentType | new_objection \| unknown_product \| successful_close \| missed_upsell \| price_negotiation_won \| customer_escalation | `src/hooks/copilot/useLearningMoment.ts` |
| SuggestionPath | avancar \| descobrir \| relacionar | `src/hooks/copilot/useLiveSuggestions.ts` |
| LogoFormat | vector \| raster_hq \| raster_lq \| unknown | `src/hooks/copilot/useLogoAnalysis.ts` |
| LogoComplexity | simple \| medium \| complex | `src/hooks/copilot/useLogoAnalysis.ts` |
| LossRiskLevel | low \| medium \| high | `src/hooks/copilot/useLossRiskDetector.ts` |
| PrivacyRisk | none \| low \| medium \| high | `src/hooks/copilot/useMediaPrivacy.ts` |
| ObjeçãoType | preco \| prazo \| quantidade_minima \| concorrente \| chefe \| qualidade \| frete \| generica | `src/hooks/copilot/useObjectionHandler.ts` |
| PIIType | cpf \| cnpj \| phone \| email \| card \| address | `src/hooks/copilot/usePIIDetector.ts` |
| RadarMode | mini \| normal \| focus | `src/hooks/copilot/useRadarPanel.ts` |
| RADAR_CARD_IDS | 'stage', 'brinde', 'suggestions', 'next_step', 'alerts', 'products', 'decision_maker', | `src/hooks/copilot/useRadarPanel.ts` |
| ResponseUrgency | ok \| slow \| critical | `src/hooks/copilot/useSpeedToLead.ts` |
| StallType | thinking \| busy \| silent \| ghosted | `src/hooks/copilot/useStallDetector.ts` |
| EscalationLevel | none \| high \| critical | `src/hooks/copilot/useUrgencyEscalation.ts` |
| VendorLevel | junior \| pleno \| senior \| supervisor | `src/hooks/copilot/useVendorAuthorization.ts` |
| SensitiveAction | discount_above_10 \| discount_above_20 \| payment_extension \| price_history_view \| bulk_negotiation \| competitor_price_match \| free_mockup | `src/hooks/copilot/useVendorAuthorization.ts` |
| DictationState | idle \| recording \| transcribing \| generating \| error | `src/hooks/copilot/useVoiceDictation.ts` |
| PresenceStatus | online \| away \| offline | `src/hooks/crm/useAgentPresence.ts` |
| ContactNoteCategory | note \| fact \| objection \| promise | `src/hooks/crm/useContactNotes.ts` |
| ConversationMemoryStatus | loading \| ok \| empty \| error | `src/hooks/crm/useConversationMemory.ts` |
| EmailContactContextStatus | disabled \| loading \| not_linked \| ambiguous \| permission_denied \| error \| available | `src/hooks/crm/useEmailContactContext.ts` |
| EstadoSalvamento | parado \| salvando \| erro | `src/hooks/crm/useSalvarConversationMemory.ts` |
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
| TalkXAbMetric | reply_rate \| click_rate \| delivery_rate | `src/hooks/integrations/useTalkXAbStats.ts` |
| TalkXCampaignSortField | name \| status \| sent_count \| scheduled_at \| created_at | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TALKX_CAMPAIGN_PAGE_SIZES | 10, 20, 50 | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TALKX_CAMPAIGN_SEARCH_COLUMNS | 'name', 'description', 'message_template' | `src/hooks/integrations/useTalkXCampaignList.ts` |
| TalkXEventType | created \| updated \| scheduled \| started \| paused \| resumed \| cancelled \| completed \| note | `src/hooks/integrations/useTalkXEvents.ts` |
| TalkXClientEventType | note \| checklist \| segments_reviewed | `src/hooks/integrations/useTalkXEvents.ts` |
| TalkXInsightAction | new-campaign \| templates \| campaigns | `src/hooks/integrations/useTalkXInsights.ts` |
| TalkXLiveStatus | connecting \| live \| degraded \| offline | `src/hooks/integrations/useTalkXLiveChannel.ts` |
| TalkXResumeChecklistItemKey | segments \| templates \| limits \| schedule \| autoresponse | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| … +215 linhas — lista completa em `context.json` | | |

## F. Validações de entrada

### F.1 Schemas Zod

- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-deadline-calculator/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), latestMessage: z.string().max(2000).optional(), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-lead-temperature/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), silenceThresholdMinutes: z.number().min(0).optional().default(60), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-loss-risk/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), triggerThreshold: z.number().min(0).max(100).optional().default(50), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-multimodal-analysis/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), mediaUrl: z.string().url().max(2048), mediaType: z.enum(["image", "audio", "document", "video"]), analysisHint: z.string().max(500).optional(), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-objection-handler/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), latestMessage: z.string().max(2000).optional(), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-price-anchor/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), latestMessage: z.string().max(2000).optional(), sellerMaxDiscountPct: z.number().min(0).max(100).optional(), }
  ```
- **BodySchema** (`analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-product-recommendation/index.ts`, z.object):
  ```ts
  { conversationId: z.string().uuid(), contactId: z.string().uuid().optional().nullable(), messages: z.array(MessageSchema).max(30).optional().default([]), latestMessage: z.string().max(2000).optional(), currentFunnelStage: z.string().max(50).optional(), }
  ```
- **CopilotTier1Schema** (`analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { sale_stage: z.enum(SALE_STAGES).optional(), temperature: z.number().int().min(0).max(100).optional(), brinde: z.object({ budget: texto(120).optional(), responsible: texto(120).optional(), intention: texto(200).optional(), quantity: z.number().int().positive().max(10_000_000).optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), delivery: texto(200).optional(), }).partial().optional(), brinde_evidence: z.record(texto(300)).optional(), intent: texto(80).optional(), sentiment: texto(40).optional(), comm_style: texto(80).optional(), decision_role: texto(80).optional(), occasion: texto(120).optional(), stakeholders: z.array(z.object({ name: texto(120).optional(), role: texto(120).optional() })).max(10).optional(), key_moments: z.array(texto(40)).max(10).optional(), risks: …
  ```
- **CopilotTier2Schema** (`analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { next_action: texto(160).optional(), suggestions: z.array(z.object({ path: z.enum(SUGGESTION_PATHS), text: texto(300), play_name: texto(80).optional(), sources: z.array(z.object({ text: texto(300), letter: z.enum(["B", "R", "I", "N", "D", "E"]).optional(), })).max(6).optional(), split_messages: z.array(texto(300)).max(3).optional(), })).min(1).max(3), }
  ```
- **CopilotTier1Schema** (`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { sale_stage: z.enum(SALE_STAGES).optional(), temperature: z.number().int().min(0).max(100).optional(), brinde: z.object({ budget: texto(120).optional(), responsible: texto(120).optional(), intention: texto(200).optional(), quantity: z.number().int().positive().max(10_000_000).optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), delivery: texto(200).optional(), }).partial().optional(), brinde_evidence: z.record(texto(300)).optional(), intent: texto(80).optional(), sentiment: texto(40).optional(), comm_style: texto(80).optional(), decision_role: texto(80).optional(), occasion: texto(120).optional(), stakeholders: z.array(z.object({ name: texto(120).optional(), role: texto(120).optional() })).max(10).optional(), key_moments: z.array(texto(40)).max(10).optional(), risks: …
  ```
- **CopilotTier2Schema** (`analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { next_action: texto(160).optional(), suggestions: z.array(z.object({ path: z.enum(SUGGESTION_PATHS), text: texto(300), play_name: texto(80).optional(), sources: z.array(z.object({ text: texto(300), letter: z.enum(["B", "R", "I", "N", "D", "E"]).optional(), })).max(6).optional(), split_messages: z.array(texto(300)).max(3).optional(), })).min(1).max(3), }
  ```
- **CopilotTier1Schema** (`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { sale_stage: z.enum(SALE_STAGES).optional(), temperature: z.number().int().min(0).max(100).optional(), brinde: z.object({ budget: texto(120).optional(), responsible: texto(120).optional(), intention: texto(200).optional(), quantity: z.number().int().positive().max(10_000_000).optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), delivery: texto(200).optional(), }).partial().optional(), brinde_evidence: z.record(texto(300)).optional(), intent: texto(80).optional(), sentiment: texto(40).optional(), comm_style: texto(80).optional(), decision_role: texto(80).optional(), occasion: texto(120).optional(), stakeholders: z.array(z.object({ name: texto(120).optional(), role: texto(120).optional() })).max(10).optional(), key_moments: z.array(texto(40)).max(10).optional(), risks: …
  ```
- **CopilotTier2Schema** (`analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { next_action: texto(160).optional(), suggestions: z.array(z.object({ path: z.enum(SUGGESTION_PATHS), text: texto(300), play_name: texto(80).optional(), sources: z.array(z.object({ text: texto(300), letter: z.enum(["B", "R", "I", "N", "D", "E"]).optional(), })).max(6).optional(), split_messages: z.array(texto(300)).max(3).optional(), })).min(1).max(3), }
  ```
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
- **ObjectionHandlerEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { objectionType: z.enum(['preco', 'prazo', 'quantidade_minima', 'concorrente', 'chefe', 'qualidade', 'frete', 'generica']), isSmokescreen: z.boolean(), confidence: z.number().min(0).max(1), brindeLetter: z.enum(['B', 'R', 'I', 'N', 'D', 'E']).optional(), script: z.array(z.string().min(1)).min(1), suggestedReply: z.string().min(1), coaching: z.string().optional(), }
  ```
- **PriceAnchorEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { triggered: z.boolean(), strategy: z.string().optional(), anchorScript: z.string(), costPerUseScript: z.string(), reframing: z.string().optional(), confidence: z.number().min(0).max(1), }
  ```
- **LossRiskEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { level: z.enum(['low', 'medium', 'high']), riskScore: z.number().min(0).max(100), signals: z.array(z.string()), recoveryAction: z.string(), script: z.string(), urgency: z.enum(['now', 'today', 'this_week', 'monitor']), }
  ```
- **DeadlineCalculatorEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { feasibility: z.enum(['ok', 'tight', 'impossible']), productionDays: z.number().int().min(0), daysUntilEvent: z.number().int().nullable(), lastOrderDate: z.string().nullable(), message: z.string().min(1), alternatives: z.array(z.string()), urgencyLevel: z.enum(['low', 'medium', 'high', 'critical']), }
  ```
- **LeadTemperatureEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { temperature: z.number().min(0).max(100), temperatureLabel: z.enum(['cold', 'warm', 'hot']), interestScore: z.number().min(0).max(100), urgencyScore: z.number().min(0).max(100), capacityScore: z.number().min(0).max(100), signals: z.array(z.string()), recommendedAction: z.string().min(1), nextBestOffer: z.string(), }
  ```
- **ProductRecommendationItemSchema** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { product: z.string().min(1), category: z.string().min(1), reasoning: z.string(), estimatedPrice: z.string(), confidence: z.number().min(0).max(1), urgency: z.enum(['low', 'medium', 'high']), }
  ```
- **ProductRecommendationEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { recommendations: z.array(ProductRecommendationItemSchema).min(1).max(3), topPick: z.string().min(1), upsellOpportunity: z.string(), }
  ```
- **MultimodalAnalysisEnvelope** (`supabase/functions/_shared/ai-response-contracts.ts`, z.object):
  ```ts
  { description: z.string().min(1), extractedText: z.array(z.string()), dominantColors: z.array(z.string()), keyElements: z.array(z.string()), brandingOpportunity: z.string(), suggestedReply: z.string().min(1), confidence: z.number().min(0).max(1), }
  ```
- **CopilotTier1Schema** (`supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { sale_stage: z.enum(SALE_STAGES).optional(), temperature: z.number().int().min(0).max(100).optional(), brinde: z.object({ budget: texto(120).optional(), responsible: texto(120).optional(), intention: texto(200).optional(), quantity: z.number().int().positive().max(10_000_000).optional(), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), delivery: texto(200).optional(), }).partial().optional(), brinde_evidence: z.record(texto(300)).optional(), intent: texto(80).optional(), sentiment: texto(40).optional(), comm_style: texto(80).optional(), decision_role: texto(80).optional(), occasion: texto(120).optional(), stakeholders: z.array(z.object({ name: texto(120).optional(), role: texto(120).optional() })).max(10).optional(), key_moments: z.array(texto(40)).max(10).optional(), risks: …
  ```
- **CopilotTier2Schema** (`supabase/functions/_shared/copilot-tick.ts`, z.object):
  ```ts
  { next_action: texto(160).optional(), suggestions: z.array(z.object({ path: z.enum(SUGGESTION_PATHS), text: texto(300), play_name: texto(80).optional(), sources: z.array(z.object({ text: texto(300), letter: z.enum(["B", "R", "I", "N", "D", "E"]).optional(), })).max(6).optional(), split_messages: z.array(texto(300)).max(3).optional(), })).min(1).max(3), }
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
- **AiObjectionHandlerSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), clientText: z.string().max(2000).optional(), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiPriceAnchorSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), clientText: z.string().max(2000).optional(), productType: z.string().max(100).optional(), unitPrice: z.number().min(0).optional(), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiLossRiskSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), daysSinceLastContact: z.number().int().min(0).optional(), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiDeadlineCalculatorSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), eventDate: z.string().optional(), productType: z.string().max(100).optional(), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiLeadTemperatureSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiProductRecommendationSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { messages: z.array(MessageSchema).max(50), eventType: z.string().max(100).optional(), budget: z.number().min(0).optional(), quantity: z.number().int().min(1).optional(), context: z.string().max(500).optional(), requestId: z.string().uuid().optional(), }
  ```
- **AiMultimodalAnalysisSchema** (`supabase/functions/_shared/schemas.ts`, z.object):
  ```ts
  { imageUrl: z.string().url(), context: z.string().max(500).optional(), conversationContext: z.string().max(1000).optional(), requestId: z.string().uuid().optional(), }
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
| `audit_de` | type=date | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `audit_ate` | type=date | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `edit_avatar` | accept=image/* | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `edit_maxchats` | type=number, min=LIMITE_CHATS_MIN, max=LIMITE_CHATS_MAX | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `add_email` | type=email | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `add_senha` | type=password | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `audit_de` | type=date | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `audit_ate` | type=date | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `edit_avatar` | accept=image/* | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `edit_maxchats` | type=number, min=LIMITE_CHATS_MIN, max=LIMITE_CHATS_MAX | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `add_email` | type=email | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `add_senha` | type=password | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `campaign-media-url` | type=url, required=true | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/campaigns/CampaignCreateDialog.tsx` |
| `campaign-target-value` | required=true | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/campaigns/CampaignCreateDialog.tsx` |
| `campaign-interval` | type=number | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/campaigns/CampaignCreateDialog.tsx` |
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
| `pause-minutes` | min, type=number, min=MIN_MINUTES, max=MAX_MINUTES, min | `src/components/connections/InstancePausesPanel.tsx` |
| `pause-reason` | max | `src/components/connections/InstancePausesPanel.tsx` |
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
| `notesId` | max | `src/components/monitoring/MonitoringInstancePauses.tsx` |
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
| `ab-min-sample` | min, type=number, min=1, max=1000000 | `src/components/talkx/TalkXWizardDelivery.tsx` |
| `new-ta` | type=date | `src/components/tasks/shared/new-task/PrazoField.tsx` |
| `nt-lembrete-data` | type=date | `src/components/tasks/shared/new-task/RemindField.tsx` |
| `id` | max | `src/components/tasks/shared/new-task/TaskTitleField.tsx` |
| `evo-key` | type=password | `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx` |
| `official-token` | type=password | `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx` |
| `login-email` | type=email, max | `src/pages/Auth.tsx` |
| `email` | type=email | `src/pages/ForgotPassword.tsx` |
| `reason` | min | `src/pages/ForgotPassword.tsx` |
| `confirmPassword` | type=password | `src/pages/ResetPassword.tsx` |
| `verify-email-resend` | type=email | `src/pages/VerifyEmail.tsx` |

## G. Fórmulas e derivações (como valores são calculados)

### G.1 Colunas calculadas no banco

| Tabela | Coluna | Expressão |
|---|---|---|
| `ai_usage_logs` | `total_tokens` | `input_tokens + output_tokens` |

### G.2 Views (consultas derivadas)

| View | SELECT |
|---|---|
| `profiles_public` | `SELECT id, user_id, name, avatar_url, is_active, department, job_title FROM public.profiles` |
| `whatsapp_connections_public` | `SELECT id, name, status, is_default FROM public.whatsapp_connections` |
| `password_reset_requests_safe` | `SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at, rejection_reason, token_expires_at, ip_address, user_agent, created_at, updated_at FROM public.password_reset_requests` |
| `login_attempts_safe` | `SELECT id, email, attempt_count, locked_until, last_attempt_at, created_at, updated_at FROM public.login_attempts` |
| `gmail_accounts_safe` | `SELECT id, user_id, email_address, is_active, sync_status, last_sync_at, last_error, token_expires_at, created_at, updated_at FROM public.gmail_accounts` |
| `whatsapp_connections_agent` | `SELECT id, name, status, phone_number, is_default FROM public.whatsapp_connections` |
| `channel_connections_safe` | `SELECT id, channel_type, name, status, is_active, external_account_id, external_page_id, webhook_url, whatsapp_connection_id, created_at, updated_at, created_by FROM public.channel_connections` |
| `whatsapp_connections_safe` | `SELECT id, name, phone_number, status, is_default, CASE WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN qr_code ELSE NULL::text END AS qr_code, CASE WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN instance_id ELSE NULL::text END AS instance_id, farewell_message, farew …` |
| `talkx_campaign_metrics` | `SELECT id AS campaign_id, segment_id, template_id, status, total_recipients, sent_count, delivered_count, COALESCE(replied_count, 0) AS replied_count, outcome_unknown_count, round( CASE WHEN sent_count > 0 THEN delivered_count::numeric / sent_count::numeric * 100::numeric ELSE 0::numeric END, 1) AS …` |
| `catalog_send_stats` | `with base as ( select created_at::date as dia, agent_id, product_id, product_name, coalesce(status, '') as status from public.catalog_send_events where created_at >= (now() - interval '30 days') ), por_dia as ( select 'dia'::text as grao, dia::text as chave, dia::text as rotulo, count(*) as total, c …` |
| `searchbox_usage_daily` | `SELECT (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) FILTER (WHERE a.action = 'searchbox_session')::integer AS sessoes, count(*) FILTER (WHERE a.action = 'searchbox_cost_guard')::integer AS degradacoes, max(a.created_at) AS ultimo_evento_em FROM public.audit_logs a WHERE a.a …` |
| `team_message_read_state` | `SELECT m.id AS message_id, m.conversation_id, COUNT(DISTINCT tcm.profile_id) AS member_count, COUNT(DISTINCT CASE WHEN r.status = 'read' AND r.profile_id <> m.sender_id THEN r.profile_id END) AS read_count, COUNT(DISTINCT CASE WHEN r.status = 'read' AND r.profile_id <> m.sender_id THEN r.profile_id …` |
| `talkx_campaign_optouts` | `SELECT b.campaign_id, count(*)::bigint AS optout_count, count(*) FILTER (WHERE b.origin = 'auto_optout')::bigint AS auto_optout_count, max(b.created_at) AS last_optout_at FROM public.talkx_blacklist AS b WHERE b.campaign_id IS NOT NULL AND b.reason_code = 'opt_out' GROUP BY b.campaign_id` |
| `talkx_engine_health` | `WITH sending_activity AS ( SELECT c.id AS campaign_id, COALESCE( (SELECT max(r.sent_at) FROM public.talkx_recipients AS r WHERE r.campaign_id = c.id AND r.sent_at IS NOT NULL), c.started_at, c.updated_at ) AS last_activity_at FROM public.talkx_campaigns AS c WHERE c.status = 'sending' ) SELECT 'stal …` |

### G.3 Funções de cálculo/decisão no código

- **generateBundle()** — `vite.config.ts`
  ```
  (this as unknown as import('vite').Rollup.PluginContext).emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId }), });
  ```
- **valor(nome)** — `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs`
  ```
  const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1];
  ```
- **usePriceAnchoring({ clientText, messages = [], }: { clientText: string; messages?: Array<{ content: string; sender: string }>; })** — `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/usePriceAnchoring.ts`
  ```
  const [aiResult, setAiResult] = useState<AiPriceAnchorResult | null>(null); const [aiLoading, setAiLoading] = useState(false); const [aiError, setAiError] = useState<string | null>(null); const abortRef = useRef<AbortController | null>(null); const local = useMemo((): PriceAnchoringResult => { if (!clientText) return { triggered: false, anchorScript: '', costPerUseScript: '' }; const lower = clientText.toLowerCase(); const triggered = PRICE_SENSITIVITY_TRIGGERS.some((t) => lower.includes(t)); if …
  ```
- **usePriceAnchoring({ clientText, messages = [], }: { clientText: string; messages?: Array<{ content: string; sender: string }>; })** — `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/usePriceAnchoring.ts`
  ```
  const [aiResult, setAiResult] = useState<AiPriceAnchorResult | null>(null); const [aiLoading, setAiLoading] = useState(false); const [aiError, setAiError] = useState<string | null>(null); const abortRef = useRef<AbortController | null>(null); const local = useMemo((): PriceAnchoringResult => { if (!clientText) return { triggered: false, anchorScript: '', costPerUseScript: '' }; const lower = clientText.toLowerCase(); const triggered = PRICE_SENSITIVITY_TRIGGERS.some((t) => lower.includes(t)); if …
  ```
- **podeReenviarComoTexto(mensagem: Message | null | undefined)** — `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/SendErrorBanner.tsx`
  ```
  if (!mensagem || mensagem.type !== 'text') return false; // @ts-expect-error -- coluna adicionada por migration 20261101133000 (tipos regenerados no próximo types-sync) return !mensagem.delivery_post_started_at;
  ```
- **shouldUseTier2(keyMoments: string[])** — `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts`
  ```
  return keyMoments.some((m) => TIER2_MOMENTS.has(m));
  ```
- **invalidBusinessHours(reason: string)** — `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts`
  ```
  return { invalid: true, invalidReason: reason };
  ```
- **invalidDnd(reason: string)** — `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts`
  ```
  return { start: "", end: "", sundays: false, holidays: [], invalid: true, invalidReason: reason };
  ```
- **slugValido(slug)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs`
  ```
  return typeof slug === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug);
  ```
- **maisLentos(jobs, { limite = 5 } = {})** — `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs`
  ```
  return (jobs ?? []) .map((j) => ({ job: j.name, workflow: j.workflow_name ?? '', minutos: Math.round(duracaoMinutos({ run_started_at: j.started_at, updated_at: j.completed_at }) * 10) / 10, })) .sort((a, b) => b.minutos - a.minutos) .slice(0, limite);
  ```
- **maisNova(local, remota)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/bump-toolchain.mjs`
  ```
  const lp = semver(local).split('.').map((x) => parseInt(x, 10) || 0); const rp = semver(remota).split('.').map((x) => parseInt(x, 10) || 0); for (let i = 0; i < Math.max(lp.length, rp.length); i++) { const l = lp[i] ?? 0; const r = rp[i] ?? 0; if (r > l) return true; if (l > r) return false; } return false;
  ```
- **maisNova(local, remota)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/bump-toolchain.mjs`
  ```
  const lp = semver(local).split('.').map((x) => Number.parseInt(x, 10) || 0); const rp = semver(remota).split('.').map((x) => Number.parseInt(x, 10) || 0); for (let i = 0; i < Math.max(lp.length, rp.length); i++) { const l = lp[i] ?? 0; const r = rp[i] ?? 0; if (r > l) return true; if (l > r) return false; } return false;
  ```
- **validarFlags(tokens, origem)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs`
  ```
  if (tokens.length === 0) throw new Error(`contrato ${origem}: chamada sem flags de cliente`); const juntos = tokens.join(' '); if (!/(^|\s)-v\s+ON_ERROR_STOP=1(\s|$)/.test(juntos)) { throw new Error(`contrato ${origem}: falta -v ON_ERROR_STOP=1 (o SQL falharia em silencio)`); } for (const token of tokens) { if (!FLAGS_ACEITOS.has(token)) { throw new Error(`contrato ${origem}: flag nao declarada "${token}"`); } } return tokens;
  ```
- **validarSql(sql, origem)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs`
  ```
  const texto = desfazerAspasDuplasBash(sql, origem).trim(); if (!texto) throw new Error(`contrato ${origem}: -c sem SQL`); if (/RUNTIME=/.test(texto)) { throw new Error(`contrato ${origem}: o texto de -c tem substituicao de shell; nao e SQL`); } if (!/^(WITH|SELECT|VALUES)\b/i.test(texto)) { throw new Error(`contrato ${origem}: o texto de -c nao comeca por WITH/SELECT/VALUES`); } return texto;
  ```
- **computeStatus(etapas, elementos, doneSet)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs`
  ```
  // elemento -> conjunto de etapas que o citam em `fecha`. const citing = new Map(); for (const e of etapas) { for (const fid of e.fecha || []) { if (!/^T\d{2}-\d{3}$/.test(fid)) continue; // só elementos do mock são por tela if (!citing.has(fid)) citing.set(fid, new Set()); citing.get(fid).add(e.id); } } let doneCount = 0; const fases = new Map(); for (const e of etapas) { const concluida = doneSet.has(e.id); if (concluida) doneCount++; if (!fases.has(e.fase)) fases.set(e.fase, { total: 0, concl …
  ```
- **generateMarkdown(status)** — `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs`
  ```
  const L = []; L.push('# STATUS — Talk X · Plano V4 (placar)'); L.push(''); L.push('> Gerado por `scripts/talkx/v4-status.mjs`. Não editar à mão — o CI confere com `--check`.'); L.push( '> Etapas concluídas = estado `DONE_VERIFIED` na avaliação verificada de `docs/reconciliation/tasks/P046.json`, casada por ID `X<NNN>`.', ); L.push( '> Marcador histórico (`(X<NNN>)` em título de commit) registra apenas que houve uma entrega: não equivale a conclusão.', ); L.push(''); L.push('## Etapas concluídas' …
  ```
- **apply(user: LoggedAgentUser | null | undefined)** — `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx`
  ```
  if (!user?.id) { if (!cancelled) setIdentity(null); return; } const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : ''; let name = metadataName || user.email || ''; try { const { data } = await supabase.from('profiles').select('name').eq('user_id', user.id).maybeSingle(); if (data?.name) name = data.name; } catch (err) { // Sem o nome do perfil a identidade continua correta e o rótulo cai nos // metadados (ou no e-mail); a falha não é engolida em si …
  ```
- **applySegmentBulkAction(input: { action: TalkXSegmentBulkAction; ids: string[]; tag?: string; })** — `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts`
  ```
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem // resposta" na hora de casar as linhas devolvidas. const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== ''))); if (ids.length === 0) throw new Error('Selecione ao menos um segmento.'); const tag = input.tag?.trim(); // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada. if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em m …
  ```
- **invalidate()** — `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-segments'] }); // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem // isto o total do topo fica velho até o próximo recarregamento. qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  ```
- **maisLentos(jobs, { limite = 5 } = {})** — `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs`
  ```
  return (jobs ?? []) .map((j) => ({ job: j.name, workflow: j.workflow_name ?? '', minutos: Math.round(duracaoMinutos({ run_started_at: j.started_at, updated_at: j.completed_at }) * 10) / 10, })) .sort((a, b) => b.minutos - a.minutos) .slice(0, limite);
  ```
- **sentimentScoreValue(raw: unknown)** — `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/dashboard/useSentimentData.ts`
  ```
  return normalizeScore(raw, { min: 0, max: 100, scale: 'percent' }).value;
  ```
- **generateInstanceName(name: string)** — `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts`
  ```
  
  ```
- **applySegmentBulkAction(input: { action: TalkXSegmentBulkAction; ids: string[]; tag?: string; })** — `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts`
  ```
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem // resposta" na hora de casar as linhas devolvidas. const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== ''))); if (ids.length === 0) throw new Error('Selecione ao menos um segmento.'); const tag = input.tag?.trim(); // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada. if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em m …
  ```
- **invalidate()** — `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-segments'] }); // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem // isto o total do topo fica velho até o próximo recarregamento. qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  ```
- **revalidar()** — `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts`
  ```
  void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) }); void queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
  ```
- **applySegmentBulkAction(input: { action: TalkXSegmentBulkAction; ids: string[]; tag?: string; })** — `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts`
  ```
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem // resposta" na hora de casar as linhas devolvidas. const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== ''))); if (ids.length === 0) throw new Error('Selecione ao menos um segmento.'); const tag = input.tag?.trim(); // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada. if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em m …
  ```
- **invalidate()** — `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-segments'] }); // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem // isto o total do topo fica velho até o próximo recarregamento. qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  ```
- **shouldUseTier2(keyMoments: string[])** — `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts`
  ```
  return keyMoments.some((m) => TIER2_MOMENTS.has(m));
  ```
- **validId(value)** — `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/verify-providers.mjs`
  ```
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
  ```
- **validText(value)** — `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/verify-providers.mjs`
  ```
  typeof value === 'string' && value.length > 0;
  ```
- **validateEvidence(value)** — `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/verify-providers.mjs`
  ```
  if (!owns(value, PROVIDER_ORIGIN) || value.network_namespace !== networkNamespace || !Number.isSafeInteger(value.count) || value.count < 0 || !Array.isArray(value.message_ids) || value.message_ids.length !== value.count || new Set(value.message_ids).size !== value.count || !value.message_ids.every(id => typeof id === 'string' && /^local-[a-zA-Z0-9-]{1,100}$/.test(id)) || !Array.isArray(value.media_receipts) || new Set(value.media_receipts.map(row => row.message_id)).size !== value.media_receipts …
  ```
- **maisLentos(jobs, { limite = 5 } = {})** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/actions-kpi.mjs`
  ```
  return (jobs ?? []) .map((j) => ({ job: j.name, workflow: j.workflow_name ?? '', minutos: Math.round(duracaoMinutos({ run_started_at: j.started_at, updated_at: j.completed_at }) * 10) / 10, })) .sort((a, b) => b.minutos - a.minutos) .slice(0, limite);
  ```
- **maisNova(local, remota)** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/bump-toolchain.mjs`
  ```
  const lp = semver(local).split('.').map((x) => parseInt(x, 10) || 0); const rp = semver(remota).split('.').map((x) => parseInt(x, 10) || 0); for (let i = 0; i < Math.max(lp.length, rp.length); i++) { const l = lp[i] ?? 0; const r = rp[i] ?? 0; if (r > l) return true; if (l > r) return false; } return false;
  ```
- **validarEntrada({ sha, repo, workflow })** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/reuso-arvore.mjs`
  ```
  if (!REPO_RE.test(repo ?? '')) throw new Error('GITHUB_REPOSITORY com formato inválido'); if (!SHA_RE.test(sha ?? '')) throw new Error('GITHUB_SHA com formato inválido'); if (!WORKFLOWS_COM_REUSO.includes(workflow)) throw new Error('--workflow fora da lista de workflows com reuso');
  ```
- **valor(nome)** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/dry-run-plan.mjs`
  ```
  const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1];
  ```
- **validarFlags(tokens, origem)** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/run-runtime-contract.mjs`
  ```
  if (tokens.length === 0) throw new Error(`contrato ${origem}: chamada sem flags de cliente`); const juntos = tokens.join(' '); if (!/(^|\s)-v\s+ON_ERROR_STOP=1(\s|$)/.test(juntos)) { throw new Error(`contrato ${origem}: falta -v ON_ERROR_STOP=1 (o SQL falharia em silencio)`); } for (const token of tokens) { if (!FLAGS_ACEITOS.has(token)) { throw new Error(`contrato ${origem}: flag nao declarada "${token}"`); } } return tokens;
  ```
- **validarSql(sql, origem)** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/run-runtime-contract.mjs`
  ```
  const texto = desfazerAspasDuplasBash(sql, origem).trim(); if (!texto) throw new Error(`contrato ${origem}: -c sem SQL`); if (/RUNTIME=/.test(texto)) { throw new Error(`contrato ${origem}: o texto de -c tem substituicao de shell; nao e SQL`); } if (!/^(WITH|SELECT|VALUES)\b/i.test(texto)) { throw new Error(`contrato ${origem}: o texto de -c nao comeca por WITH/SELECT/VALUES`); } return texto;
  ```
- **ensureValidToken(supabase: SupabaseClient, account: GmailAccountForToken, log: Logger, onUpdatedAt?: (updatedAt: string)** — `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts`
  ```
  void,
  ```
- **valorRegistroMarkdown(valor)** — `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/docs-estado-registry-convention.unit.mjs`
  ```
  return valor === '—' ? null : valor.slice(1, -1);
  ```
- **validarRegrasDeAudiencia(rules: SegmentRules | null | undefined)** — `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts`
  ```
  for (const group of rules?.groups ?? []) { for (const rule of group.rules) { if (rule.field === 'real_sector' || rule.field === 'real_uf') { throw new Error(`Regra ${rule.field} requer pré-resolução em p_contact_ids`); } } }
  ```
- **applySegmentBulkAction(input: { action: TalkXSegmentBulkAction; ids: string[]; tag?: string; })** — `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts`
  ```
  // Ids únicos, como a própria RPC faz — sem isto um id repetido ficaria "sem // resposta" na hora de casar as linhas devolvidas. const ids = Array.from(new Set(input.ids.filter((id) => typeof id === 'string' && id.trim() !== ''))); if (ids.length === 0) throw new Error('Selecione ao menos um segmento.'); const tag = input.tag?.trim(); // Falha fechada ANTES de chamar o servidor: entrada inválida não aplica nada. if (input.action === 'tag' && !tag) throw new Error('Informe a tag para aplicar em m …
  ```
- **invalidate()** — `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts`
  ```
  qc.invalidateQueries({ queryKey: ['talkx-segments'] }); // Publicar/editar/excluir segmento muda o estoque e a origem dos KPIs: sem // isto o total do topo fica velho até o próximo recarregamento. qc.invalidateQueries({ queryKey: LIBRARY_STATS_QUERY_KEY });
  ```
- **apply(user: LoggedAgentUser | null | undefined)** — `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx`
  ```
  if (!user?.id) { if (!cancelled) setIdentity(null); return; } const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : ''; let name = metadataName || user.email || ''; try { const { data } = await supabase.from('profiles').select('name').eq('user_id', user.id).maybeSingle(); if (data?.name) name = data.name; } catch (err) { // Sem o nome do perfil a identidade continua correta e o rótulo cai nos // metadados (ou no e-mail); a falha não é engolida em si …
  ```
- **ensureValidToken(supabase: SupabaseClient, account: GmailAccountForToken, log: Logger)** — `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/gmail-helpers.ts`
  ```
  const storedTokens = await getTokens(supabase, account.id); if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token; log.info("Refreshing Gmail token"); const tokens = await requestGmailTokenRefresh(storedTokens.refresh_token, requireEnv("GOOGLE_CLIENT_ID"), requireEnv("GOOGLE_CLIENT_SECRET")); const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString(); await storeTokens(supabase, account.id, tokens.access_token, tok …
  ```
- **pairingValidity(payload: unknown, nowMs: number)** — `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts`
  ```
  expiresInSeconds: number; expiresAt: string
  ```
- **ensureValidToken(supabase: SupabaseClient, account: GmailAccountForToken, log: Logger)** — `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/gmail-helpers.ts`
  ```
  const storedTokens = await getTokens(supabase, account.id); if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token; log.info("Refreshing Gmail token"); const tokens = await requestGmailTokenRefresh(storedTokens.refresh_token, requireEnv("GOOGLE_CLIENT_ID"), requireEnv("GOOGLE_CLIENT_SECRET")); const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString(); await storeTokens(supabase, account.id, tokens.access_token, tok …
  ```
- **generateChallenge()** — `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts`
  ```
  const array = new Uint8Array(32); crypto.getRandomValues(array); return base64URLEncode(array.buffer);
  ```
- **calculateTrend(current: number, previous: number)** — `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/dashboard/TrendIndicator.tsx`
  ```
  percentage: number; direction: 'up' | 'down' | 'neutral'; absoluteChange: number;
  ```
- **shouldUseTier2(keyMoments: string[])** — `analise-prs/resgate-261118-lote3/resolve-2381-from-main/supabase/functions/_shared/copilot-tick.ts`
  ```
  return keyMoments.some((m) => TIER2_MOMENTS.has(m));
  ```
- **valor(nome)** — `analise-prs/resgate-regra8-261118/scripts/db-audit/dry-run-plan.mjs`
  ```
  const i = args.indexOf(nome); return i === -1 ? undefined : args[i + 1];
  ```
- **aplicarBranchProtection()** — `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs`
  ```
  const bl = baseline.branch_protection_main; const body = { required_status_checks: { strict: bl.strict, checks: bl.required_status_checks.map(i => typeof i === 'string' ? { context: i } : { context: i.context, app_id: i.app_id } ), }, enforce_admins: bl.enforce_admins, required_pull_request_reviews: null, restrictions: null, allow_force_pushes: bl.allow_force_pushes ?? false, required_linear_history: bl.required_linear_history ?? false, }; await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/branches/m …
  ```
- **aplicarMerge()** — `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs`
  ```
  const bl = baseline.merge; const body = { allow_squash_merge: bl.allow_squash_merge, allow_merge_commit: bl.allow_merge_commit, allow_rebase_merge: bl.allow_rebase_merge, allow_auto_merge: bl.allow_auto_merge, delete_branch_on_merge: bl.delete_branch_on_merge, squash_merge_commit_message: bl.squash_merge_commit_message, squash_merge_commit_title: bl.squash_merge_commit_title, }; await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}`, body); console.log(' ✓ configurações de merge aplicadas');
  ```
- **aplicarActions()** — `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs`
  ```
  const bl = baseline.actions; await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/actions/permissions`, { enabled: bl.enabled, allowed_actions: bl.allowed_actions, }); console.log(' ✓ actions permissions aplicadas');
  ```
- **aplicarWorkflowPermissions()** — `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs`
  ```
  const bwp = baseline.workflow_permissions; await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/workflow`, { default_workflow_permissions: bwp.default_workflow_permissions, can_approve_pull_request_reviews: bwp.can_approve_pull_request_reviews, }); console.log(' ✓ workflow permissions aplicadas');
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
- **aplicar()** — `src/components/connections/InstancePresenceTab.tsx`
  ```
  setEnviando(true); try { await setPresence(instanceName, presenca); toast.success('Presença atualizada'); } catch (err) { if (isEvolutionNotSupported(err)) { toast.warning(mensagemNaoSuportado('A troca de presença')); return; } toast.error(err instanceof Error && err.message ? err.message : 'Não foi possível atualizar a presença'); } finally { setEnviando(false); }
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
- **aplicar()** — `src/components/groups/GroupEvolutionDialogs.tsx`
  ```
  if (!instanceName) { toast.error('Este grupo não tem conexão vinculada.'); return; } if (!duracao) { toast.error('Escolha a duração.'); return; } setAplicando(true); try { await toggleEphemeral(instanceName, groupJid, Number(duracao)); toast.success(duracao === '0' ? 'Mensagens temporárias desligadas' : 'Mensagens temporárias ativadas'); onOpenChange(false); } catch (err) { if (isEvolutionNotSupported(err)) { toast.warning(mensagemNaoSuportado('Mensagens temporárias')); return; } toast.error(men …
  ```
- **apply(user: LoggedAgentUser | null | undefined)** — `src/components/inbox/ChatPanel.tsx`
  ```
  const mine = ++seq; if (!user?.id) { if (!cancelled) { setIdentity(null); setResolved(true); } return; } const userId = user.id; const metadataName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : ''; const fallbackName = metadataName || user.email || ''; // O canal abre assim que o `user.id` é conhecido: a chave da presença só // depende dele. O nome do perfil chega depois e atualiza o payload SEM // reabrir o canal — uma consulta lenta (ou travada) a `profiles` …
  ```
- **computeStats(conversations: ConversationWithMessages[], options: FilterOption[],)** — `src/components/inbox/ContactTypeFilter.tsx`
  ```
  const stats: Record<string, FilterStats> = {}; for (const opt of options) { stats[opt.value] = { count: 0, unread: 0 }; } for (const c of conversations) { for (const opt of options) { if (opt.match(c)) { stats[opt.value].count++; if (c.unreadCount > 0) stats[opt.value].unread++; } } } return stats;
  ```
- **generateSummary()** — `src/components/inbox/ConversationSummary.tsx`
  ```
  if (!canGenerateSummary) { toast.error('O período selecionado precisa ter pelo menos 10 mensagens.'); return; } const request = beginRequest(); setIsLoading(true); try { const { data, error } = await supabase.functions.invoke('ai-conversation-summary', { body: { messages: filteredMessages.map(m => ({ sender: m.sender, content: m.content, created_at: m.created_at })), contactName, contactId, requestId: request.requestId }, }); // IA-048 — a resposta só vale se contato/período ainda forem os do cl …
  ```
- **formatCurrency(v: number | null)** — `src/components/inbox/chat/CrmBadges.tsx`
  ```
  
  ```
- **applyFormat(type: FormatType)** — `src/components/inbox/chat/RichTextToolbar.tsx`
  ```
  const input = inputRef.current; if (!input) return; const { prefix, suffix } = FORMAT_MAP[type]; const start = input.selectionStart ?? inputValue.length; const end = input.selectionEnd ?? inputValue.length; const selectedText = inputValue.substring(start, end); let newValue: string; let newCursorPos: number; if (type === 'list' || type === 'ordered-list') { const lineStart = inputValue.lastIndexOf('\n', start - 1) + 1; newValue = inputValue.substring(0, lineStart) + prefix + inputValue.substring …
  ```
- **podeReenviarComoTexto(mensagem: Message | null | undefined)** — `src/components/inbox/chat/SendErrorBanner.tsx`
  ```
  return !!mensagem && mensagem.type === 'text';
  ```
- **formatCurrency(v: number | null)** — `src/components/inbox/contact-details/Contact360Helpers.tsx`
  ```
  v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null;
  ```
- **formatCurrency(v: number | null)** — `src/components/inbox/contact-details/Contact360Helpers.tsx`
  ```
  v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  ```
- **engagementScore(()** — `src/components/inbox/contact-details/ContactHeaderSection.tsx`
  ```
  let s = 50; if (sentiment.value === 'positivo') s += 25; if (priority.value === 'high') s += 15; if (enrichedData?.company) s += 5; if (contactType === 'customer') s += 5; return Math.min(s, 100);
  ```
- **scoreClass(score: number | null | undefined)** — `src/components/inbox/contact-details/ContactIntelligencePanel.tsx`
  ```
  if (score == null) return 'text-muted-foreground'; if (score >= 70) return 'text-success'; if (score >= 40) return 'text-warning'; return 'text-muted-foreground';
  ```
- **leadScoreClass(score: number)** — `src/components/inbox/contact-details/LeadRiskScorePanel.tsx`
  ```
  if (score >= 80) return 'text-success'; if (score >= 50) return 'text-warning'; return 'text-destructive';
  ```
- **riskScoreClass(score: number)** — `src/components/inbox/contact-details/LeadRiskScorePanel.tsx`
  ```
  if (score >= 70) return 'text-destructive'; if (score >= 40) return 'text-warning'; return 'text-success';
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
- **usePriceAnchoring({ clientText, messages, }: { clientText: string; messages?: Array<{ content: string; sender: string; created_at?: string)** — `src/hooks/copilot/usePriceAnchoring.ts`
  ```
  aiResult: AiPriceAnchoringResult | null; aiLoading: boolean; aiError: string | null; analyze: () => Promise<void>;
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
- **calculateNextSendAt(frequency: string)** — `src/hooks/dashboard/useScheduledReportConfigs.ts`
  ```
  const next = new Date(); switch (frequency) { case 'daily': next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break; case 'weekly': next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break; case 'biweekly': next.setDate(next.getDate() + 14); next.setHours(8, 0, 0, 0); break; case 'monthly': next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break; // custom é sob demanda (botão "Enviar agora") — nunca agenda. default: return nu …
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
- **canArchiveConversation(status: string | null | undefined)** — `src/hooks/inbox/conversationArchive.ts`
  ```
  return status !== 'waiting' && status !== 'archived';
  ```
- **generateInstanceName(name: string)** — `src/hooks/inbox/useConnectionsManager.ts`
  ```
  
  ```
- **validateInboxPresetName(name: string, presets: InboxFilterPreset[] = [], ignoreId?: string)** — `src/hooks/inbox/useInboxFilterPresets.ts`
  ```
  const value = (name ?? '').trim(); if (value.length === 0) { return { ok: false, value: '', error: 'Informe um nome para o filtro.' }; } if (value.length > PRESET_NAME_MAX_LENGTH) { return { ok: false, value, error: `O nome deve ter no máximo ${PRESET_NAME_MAX_LENGTH} caracteres.`, }; } if (CONTROL_CHARS.test(value)) { return { ok: false, value, error: 'O nome contém caracteres inválidos.' }; } const duplicated = presets.some( (p) => p.id !== ignoreId && (p.name ?? '').trim().toLowerCase() === v …
  ```
- **shouldRetryGmailSync(failureCount: number, error: unknown)** — `src/hooks/integrations/useGmail.ts`
  ```
  if (failureCount >= 1) return false; const status = error instanceof GmailFunctionError ? error.status : undefined; if (status !== undefined && status >= 400 && status < 500 && status !== 429) return false; return true;
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
- **eligibleFromRpc(value: unknown)** — `src/hooks/integrations/useTalkXSegments.ts`
  ```
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('Resposta inválida da consulta de audiência.'); } const raw = value as Record<string, unknown>; if (raw.mode !== undefined && raw.mode !== 'count') { throw new Error('Modo inválido na resposta da consulta de audiência.'); } // `typeof === 'number'` antes do inteiro: sem isso, `Number(null)`, // `Number('')`, `Number(false)` e `Number([])` são todos 0, e um `eligible` // nulo — o caso provável num jsonb — voltaria …
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
- **validateInvestigationNotes(notes: string)** — `src/services/instance-pauses.service.ts`
  ```
  const trimmed = notes.trim(); if (trimmed.length > PAUSE_NOTES_MAX_LENGTH) { return `As notas passam de ${PAUSE_NOTES_MAX_LENGTH} caracteres.`; } if (/[<>]/.test(trimmed)) { return 'As notas não podem conter os caracteres < ou >.'; } return null;
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
- **shouldUseTier2(keyMoments: string[])** — `supabase/functions/_shared/copilot-tick.ts`
  ```
  return keyMoments.some((m) => TIER2_MOMENTS.has(m));
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
- **generateLiveSuggestion(opts: { lastClientMessage?: string; draftText?: string; saleStage?: string; userId: string; })** — `supabase/functions/copilot-live/index.ts`
  ```
  content: string; modelVersion: string
  ```
- **validExternalId(value: unknown)** — `supabase/functions/crm-integration/index.ts`
  ```
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
  ```
- **canManageEmailContactLink()** — `supabase/functions/crm-integration/index.ts`
  ```
  return userHasPermission('crm.email_contact_link.manage');
  ```
- **invalidQueryParam(path: string, message: string)** — `supabase/functions/evolution-api/index.ts`
  ```
  
  ```
- **canSleepForQr()** — `supabase/functions/evolution-api/index.ts`
  ```
  qrDeadline - Date.now() > QR_RETRY_SLEEP_MS;
  ```
- **validIdentifier(value: unknown)** — `supabase/functions/external-db-bridge/index.ts`
  ```
  return typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/i.test(value) && !POSTGREST_RESERVED.has(value.toLowerCase());
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
  const next = new Date(); switch (frequency) { case "daily": next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break; case "weekly": next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break; case "biweekly": next.setDate(next.getDate() + 14); next.setHours(8, 0, 0, 0); break; case "monthly": next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break; } return next.toISOString();
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
| `// Verifica que o CLAUDE.md contém as seções obrigatórias e não encolheu >30%.` | `analise-prs/resgate-261118-lote2/scripts/ci/claude-md-guard.mjs` |
| `/** Stagger do plano: `i * 0.03` com teto de 5 itens (o resto entra junto, sem fila). */` | `analise-prs/resgate-261118-lote2/src/hooks/useMotionSeguro.ts` |
| `atraso: (indice) => (anima ? Math.min(indice, 4) * 0.03 : 0),` | `analise-prs/resgate-261118-lote2/src/hooks/useMotionSeguro.ts` |
| `transition={{ delay: i * 0.04 }}` | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/contacts/ContactPurchaseHistory.tsx` |
| `transition={{ delay: idx * 0.05 }}` | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| `// pulados nunca chega a 100% e "Restantes" fica preso contando quem ja foi` | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/multiplix/MultiplixMonitor.tsx` |
| `// 100% local"; `chromium-mapa`, travado em `ci-e2e-projects.unit.mjs`).` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| `// 2. os specs que NÃO precisam de produção já rodam 100% locais com custo de` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| `const DEFAULT_THRESHOLD = 0.10; // 10% de 5xx = falha` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `// 100% local"; `chromium-mapa`, travado em `ci-e2e-projects.unit.mjs`).` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| `// 2. os specs que NÃO precisam de produção já rodam 100% locais com custo de` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| `const DEFAULT_THRESHOLD = 0.10; // 10% de 5xx = falha` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `osc.start(now + i * 0.05); // Slight stagger for richness` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| `transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/InboxEmptyChat.tsx` |
| `// como 0% derrubaria o progresso de metas que têm dado de verdade.` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/analytics/useGoalsDashboard.ts` |
| `osc.start(now + i * 0.05); // Slight stagger for richness` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts` |
| `osc.start(now + i * 0.05); // Slight stagger for richness` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/chat/useTeamChatNotifications.ts` |
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/playwright.config.ts` |
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/playwright.config.ts` |
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/playwright.config.ts` |
| `osc.start(now + i * 0.05); // Slight stagger for richness` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/chat/useTeamChatNotifications.ts` |
| `// REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/playwright.config.ts` |
| `// autorização em `supabase/functions/_shared/` não pode ficar abaixo de 50%.` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `// está hoje em ~45% e a régua é um piso contra queda, não um teto por arquivo.` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `const DEFAULT_THRESHOLD = 0.10; // 10% de 5xx = falha` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `// 100% local"; `chromium-mapa`, travado em `ci-e2e-projects.unit.mjs`).` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/workflow-contracts.unit.mjs` |
| `// 2. os specs que NÃO precisam de produção já rodam 100% locais com custo de` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/workflow-contracts.unit.mjs` |
| `// autorização em `supabase/functions/_shared/` não pode ficar abaixo de 50%.` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/ci/edge-coverage-authz.unit.mjs` |
| `// está hoje em ~45% e a régua é um piso contra queda, não um teto por arquivo.` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/ci/edge-coverage-authz.unit.mjs` |
| `transition={{ delay: idx * 0.05 }}` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/inbox/ContactPurchasesPanel.tsx` |
| `if (newPercentage < snapPoints[0] * 0.5 && !preventClose) { haptics.light(); onClose(); }` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/mobile/BottomSheet.tsx` |
| `<motion.div ref={containerRef} animate={{ y: isPulling ? pullDistance * 0.3 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/mobile/SwipeGestures.tsx` |
| `const distance = Math.max(0, (e.touches[0].clientY - startY.current) * 0.5);` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/mobile/SwipeGestures.tsx` |
| `const vol = (notifSettings.soundVolume ?? 70) / 100 * 0.2;` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/calls/IncomingCallAlert.tsx` |
| `transition={{ delay: i * 0.03 }}` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/dashboard/RealtimeMetricsPanel.tsx` |
| `transition={{ delay: i * 0.05 }}` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/dashboard/RealtimeMetricsPanel.tsx` |
| `transition={{ delay: idx * 0.04 }}` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/inbox/ConversationTimeline.tsx` |
| `transition={{ delay: i * 0.05 }}` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/inbox/contact-details/SLAAndAITagsSection.tsx` |
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
| `// 100% (capacidade excedida no War Room); a barra deve representar "cheio",` | `src/components/ui/progress.tsx` |
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
| `// Inclui o perfil: as contagens só habilitam depois dele, então sem isto a tela mostraria 0% antes dos dados.` | `src/hooks/analytics/useGoalsDashboard.ts` |
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
| `DOS` | `'/home/user/Zapp_Web_V2/analise-prs/resgate-261115/dossies'` | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js` |
| `DOS` | `'/home/user/Zapp_Web_V2/analise-prs/resgate-261115/dossies'` | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js` |
| `COMMIT` | `'d7af7a671c'` | `analise-prs/resgate-261118-lote2/scripts/ci/compose-confirm-hash.unit.mjs` |
| `RUNTIME` | `'b'` | `analise-prs/resgate-261118-lote2/scripts/ci/proof-sha.unit.mjs` |
| `MAX_AMOUNT` | `100` | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| `AMOUNT_HINT` | `'Informe um valor entre R$ 0,00 e R$ 100.000.000,00.'` | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| `SECAO_ABERTURA` | `'### Etapas superadas pela política vigente'` | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| `PONTO` | `'.'` | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| `BARRA` | `'\\'` | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| `SILENCIO_DIAS` | `5` | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useLossRiskDetector.ts` |
| `SILENCIO_DIAS` | `5` | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useLossRiskDetector.ts` |
| `AMBIGUOUS_THRESHOLD_MS` | `2` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/hooks/delivery/useUnconfirmedMessages.ts` |
| `OPT_OUT_ACCENTS` | `"áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ"` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| `OPT_OUT_ASCII` | `"aaaaaaeeeeiiiiooooouuuucnyaaaaaaeeeeiiiiooooouuuucny"` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| `AWAY_MESSAGE_WORKER` | `"edge:evolution-webhook:away"` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| `CHATBOT_L1_WORKER` | `"edge:evolution-webhook:chatbot-l1"` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| `MAX_REQUEST_BYTES` | `8` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| `TALKX_STALL_MIN_MS` | `180` | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| `TALKX_RATE_WINDOW_MIN` | `5` | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| `COPILOT_TICK_KIND` | `"copilot.tick"` | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| `MAX_NEW_MESSAGES` | `20` | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| `MAX_CONTEXT_MESSAGES` | `5` | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| `SHA` | `'a'` | `analise-prs/resgate-261118-lote3/claude/feat-talkx-x054-cmdk-261108-0100/scripts/vercel/verify-production.unit.mjs` |
| `BOTTOM_FOLLOW_THRESHOLD_PX` | `100` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/inbox/chat/ChatMessagesArea.tsx` |
| `SELO_ENVIADA_MS` | `1000` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/inbox/chat/ChatMessagesArea.tsx` |
| `REVIEW_STALE_DAYS` | `3` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/talkx/TalkXTemplates.tsx` |
| `CACHE_TTL` | `1000` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/system/useOfflineCache.ts` |
| `CORRELATION_HEADER` | `'x-correlation-id'` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `REQUEST_ID_HEADER` | `'x-request-id'` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `EDGE_ERROR_NETWORK` | `'EDGE_ERROR_NETWORK'` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `EDGE_ERROR_UNKNOWN` | `'EDGE_ERROR_UNKNOWN'` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `DEFAULT_SCHEDULE_TIMEZONE` | `"America/Sao_Paulo"` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| `DEFAULT_BUSINESS_HOURS_START` | `"08:00"` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| `DEFAULT_BUSINESS_HOURS_END` | `"18:00"` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| `RUNBOOK_SEGREDOS` | `'docs/runbooks/migracao-segredos-environments.md'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_LABEL` | `'settings-guard'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_TITLE` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `BRANCH` | `'main'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `SEIS_HORAS_MS` | `6` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `SETE_DIAS_MS` | `7` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `TITULO` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `CONTEXTS_OK` | `"['` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `ACTIONS_OK` | `"send({ enabled: true, allowed_actions: '` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `WORKFLOW_PERMS_OK` | `"send({ default_workflow_permissions: '` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `SELECTED_PATTERNS` | `"['` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `SEM_ESCOPO` | `"send({ message: '` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `GUARD` | `'github-actions[bot]'` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `SEIS_HORAS_MS` | `6` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `LEDGER_STATEMENTS_HASH_DOMAIN` | `'zapp-migration-ledger-statements-v1\0'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| `COMMENT_ONLY_KIND` | `'ledger-only/comment-only'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| `PINNED_REPLAY_KIND` | `'ledger-divergence/pinned-replay'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| `RPC_PADRAO` | `'e2e_cleanup_conversation_closures'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| `BASE` | `'https://projeto-teste.supabase.co'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| `CHAVE_PUBLICA` | `'chave-publica-do-projeto'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| `EMAIL` | `'e2e@exemplo.invalid'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| `SENTINELA_SERVICE_ROLE` | `'valor-da-chave-mestra-que-nao-pode-viajar'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| `NOME_PASSO` | `'E2E teardown - limpar fixture de conversation_closures'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| `TAMANHO_MINIMO` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| `EMAIL` | `'usuario.de.teste@example.com'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.unit.mjs` |
| `CANONICAL_PROJECT` | `'tnnnlkbymytvtqngbbqh'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `MGMT_BASE` | `'https://api.supabase.com'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_THRESHOLD` | `0.10` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_WAIT_MS` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `WINDOW_MINUTES` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `UM_DIA` | `24` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs` |
| `POR_PAGINA` | `100` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs` |
| `RUNBOOK_SEGREDOS` | `'docs/runbooks/migracao-segredos-environments.md'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_LABEL` | `'settings-guard'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_TITLE` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `BRANCH` | `'main'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `SEIS_HORAS_MS` | `6` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `SETE_DIAS_MS` | `7` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `TITULO` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `CONTEXTS_OK` | `"['` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `ACTIONS_OK` | `"send({ enabled: true, allowed_actions: '` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `WORKFLOW_PERMS_OK` | `"send({ default_workflow_permissions: '` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `SELECTED_PATTERNS` | `"['` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `SEM_ESCOPO` | `"send({ message: '` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `GUARD` | `'github-actions[bot]'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `LIMITE_COMENTARIOS` | `20` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.mjs` |
| `CABECALHO` | `'DRY RUN: migrations will *not* be pushed to the database.'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/dry-run-plan.unit.mjs` |
| `ALVO` | `'20261001120000'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/dry-run-plan.unit.mjs` |
| `TETO_KB` | `30` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/catalog-ct73-docs.unit.mjs` |
| `CI_TS_GLOB` | `"supabase/functions/**/*.test.ts"` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/check-test-inventory.mjs` |
| `RUNBOOK_SEGREDOS` | `'docs/runbooks/migracao-segredos-environments.md'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_LABEL` | `'settings-guard'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_TITLE` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `BRANCH` | `'main'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `SEIS_HORAS_MS` | `6` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `SETE_DIAS_MS` | `7` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `LIMIAR` | `6.4` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/lamejs-attack-indexing.unit.mjs` |
| `BLOCK` | `1152` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/lamejs-attack-indexing.unit.mjs` |
| `BLOCK` | `1152` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/lamejs-attack-indexing.unit.mjs` |
| `CANONICAL_PROJECT` | `'tnnnlkbymytvtqngbbqh'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `MGMT_BASE` | `'https://api.supabase.com'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_THRESHOLD` | `0.10` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_WAIT_MS` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `WINDOW_MINUTES` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `STATUS_CONCLUIDO` | `'DONE_VERIFIED'` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| `THINKING_TIMEOUT_MS` | `10` | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/hooks/copilot/useRadarPanel.ts` |
| `LIMITE_CHATS_MIN` | `1` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_MAX` | `50` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_PADRAO` | `5` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `CONSULTA_PAINEL_LARGO` | `'(min-width: 1280px)'` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/talkx/TalkXTemplateEditor.tsx` |
| `SLA_MONITOR_SOURCE` | `'sla-monitor'` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| `SLA_BREACH_PAGE` | `1000` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| `CANAL_BASE` | `'agente-celebracoes'` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/gamification/useAgentCelebrations.ts` |
| `JANELA_CONQUISTAS` | `20` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/gamification/useAgentCelebrations.ts` |
| `DEFAULT_CHIP` | `'attending'` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| `SEGMENT_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| `AUDIENCE_RPC_PAGE_LIMIT` | `1000` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| `BULK_ACTION_MAX_IDS` | `200` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| `UM_DIA` | `24` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| `POR_PAGINA` | `100` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| `LIMITE_PUSHES_LOTE` | `15` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| `JANELA_LOTE_HORAS` | `24` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| `TETO_TRAVADA_MS` | `45` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/fila-merge.mjs` |
| `CI_TS_GLOB` | `"supabase/functions/**/*.test.ts"` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/scripts/ci/check-test-inventory.mjs` |
| `OPERACAO` | `'docs/talkx/OPERACAO.md'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/scripts/ci/talkx-docs-drift.unit.mjs` |
| `CHANGELOG` | `'docs/talkx/CHANGELOG_TALKX.md'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/scripts/ci/talkx-docs-drift.unit.mjs` |
| `SPEC_TALKX` | `'e2e/talkx.spec.ts'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/scripts/ci/talkx-docs-drift.unit.mjs` |
| `MIGRATION_ACTION` | `'media_migration'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/MediaMigrationTool.tsx` |
| `HISTORY_LIMIT` | `10` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/MediaMigrationTool.tsx` |
| `AVATAR_BUCKET` | `'avatars'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| `AUDIT_PAGE_SIZE` | `50` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| `PAGE` | `1000` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/dashboard/useSentimentData.ts` |
| `HEADER_HEIGHT` | `32` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| `FALLBACK_FIRST_RESPONSE_MINUTES` | `5` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| `PLAYBACK_BLOCKED` | `'O navegador bloqueou a reprodução. Toque no botão de novo.'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| `MAX_RECORDING_MS` | `60` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| `ERRO_UPLOAD_AUDIO` | `'Não foi possível enviar o áudio do sussurro. Tente de novo.'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| `ROLE_FILTER_VALUE` | `"role_events"` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/security/AuditLogDashboard.tsx` |
| `LOGS_PAGE_LIMIT` | `200` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/security/AuditLogDashboard.tsx` |
| `INSIGHT_REPLY_GROWTH_MIN` | `30` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| `CONSULTA_PAINEL_LARGO` | `'(min-width: 1280px)'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXTemplateEditor.tsx` |
| `FORECAST_MIN_CAMPAIGNS` | `5` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXWizardDelivery.tsx` |
| `FORECAST_MIN_SENT` | `100` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXWizardDelivery.tsx` |
| `FORECAST_WINDOW_DAYS` | `90` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXWizardDelivery.tsx` |
| `MESSAGE_LIMIT` | `4096` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| `DEFAULT_SCHEDULE_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_FILTER_DEBOUNCE_MS` | `350` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_PREVIEW_LIMIT` | `5000` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| `TAG_FIELD` | `'tags'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| `PAGE_SIZE` | `50` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/tracking/TalkXRecipientsTable.tsx` |
| `SEARCH_MIN_CHARS` | `2` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| `SEARCH_LIMIT` | `100` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| `DEFAULT_CHIP` | `'attending'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useInboxFilters.ts` |
| `SEGMENT_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| `AUDIENCE_RPC_PAGE_LIMIT` | `1000` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| `BULK_ACTION_MAX_IDS` | `200` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| `REALTIME_PROBE_TIMEOUT_MS` | `5000` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_SAUDAVEL_MS` | `15` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_DEGRADADO_MS` | `60` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `TEAM_MESSAGES_PAGE_SIZE` | `200` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts` |
| `OFFLINE_QUEUE_DATABASE` | `'zapp-offline-outbox'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/lib/offlineQueue.ts` |
| `OFFLINE_QUEUE_DATABASE_VERSION` | `1` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/lib/offlineQueue.ts` |
| `OFFLINE_QUEUE_STORE` | `'outbound_messages'` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/lib/offlineQueue.ts` |
| `PENDING_ACTION_TTL_MS` | `2` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| `WARROOM_MAX_ROWS` | `200` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/business/useWarRoomData.ts` |
| `DEFAULT_CHIP` | `'attending'` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxFilters.ts` |
| `SEGMENT_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| `AUDIENCE_RPC_PAGE_LIMIT` | `1000` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| `BULK_ACTION_MAX_IDS` | `200` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| `REALTIME_PROBE_TIMEOUT_MS` | `5000` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_SAUDAVEL_MS` | `15` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_DEGRADADO_MS` | `60` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `DEFAULT_CHIP` | `'attending'` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/inbox/useInboxFilters.ts` |
| `REALTIME_PROBE_TIMEOUT_MS` | `5000` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_SAUDAVEL_MS` | `15` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_DEGRADADO_MS` | `60` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `DEFAULT_TTS_SPEED` | `1.0` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useUserSettings.ts` |
| `THINKING_TIMEOUT_MS` | `8000` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/src/components/inbox/copilot/RadarPanel.tsx` |
| `COPILOT_TICK_KIND` | `"copilot.tick"` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| `MAX_NEW_MESSAGES` | `20` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| `MAX_CONTEXT_MESSAGES` | `5` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| `CLAIM_LIMIT` | `10` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| `CLAIM_LEASE_SECONDS` | `60` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| `HEARTBEAT_LEASE_SECONDS` | `120` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| `GENERATE_LEASE_MARGIN_MS` | `15` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| `AI_GENERATE_FLAG` | `"AI_JOBS_ENABLE_AI_GENERATE"` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| `PLATFORM_BLOB` | `'96a821d6c8389d526a9a5d65554687412510a92a'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
| `PLATFORM_FILE` | `'e2e/conversation.spec.ts'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
| `SOURCE_SHA` | `'a96bbd4cbaeed5a8bad7c42af347e56960e6cac7'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-results.unit.mjs` |
| `SOURCE_SHA` | `'a'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `MIGRATION` | `'20260101000000_fixture.sql'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `SQL` | `'select 1;\n'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `FUNCTION_SOURCE` | `'// graph fixture, never executed\n'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `RUN` | `'zapp-e2e-suite-contract-0001'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-suite.unit.mjs` |
| `SHA` | `'a'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-suite.unit.mjs` |
| `MAX_BODY` | `1024` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| `MAX_MEDIA_BYTES` | `50` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| `SOURCE_SHA` | `'a'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `MIGRATION` | `'20260101000000_fixture.sql'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `SQL` | `'select 1;\n'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `ORIGIN` | `'https://127.0.0.1:5173'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `OFFICIAL_HOST` | `'tnnnlkbymytvtqngbbqh.supabase.co'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `OWNER_LABEL` | `'zapp.e2e.owner'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `PURPOSE_LABEL` | `'zapp.e2e.purpose'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `PURPOSE` | `'isolated-auth'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `TLS_ORIGIN` | `'https://127.0.0.1:5173'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `TLS_PUBLIC` | `'/run/zapp-e2e-tls'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `TLS_PRIVATE` | `'/run/zapp-e2e-tls-private'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `SOURCE_SHA` | `'a'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `MIGRATION` | `'20260101000000_fixture.sql'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `SQL` | `'select 1;\n'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-runtime.unit.mjs` |
| `ORIGIN` | `'https://127.0.0.1:5173'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `OFFICIAL_HOST` | `'tnnnlkbymytvtqngbbqh.supabase.co'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `OWNER_LABEL` | `'zapp.e2e.owner'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `PURPOSE_LABEL` | `'zapp.e2e.purpose'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `PURPOSE` | `'isolated-auth'` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `SECAO_ABERTURA` | `'### Etapas superadas pela política vigente'` | `analise-prs/resgate-261118-lote3/claude/wizardly-ride-dimxnt/scripts/ci/ci-docs-baseline.unit.mjs` |
| `PONTO` | `'.'` | `analise-prs/resgate-261118-lote3/claude/wizardly-ride-dimxnt/scripts/ci/ci-docs-baseline.unit.mjs` |
| `BARRA` | `'\\'` | `analise-prs/resgate-261118-lote3/claude/wizardly-ride-dimxnt/scripts/ci/ci-docs-baseline.unit.mjs` |
| `DEFAULT_CHIP` | `'attending'` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/inbox/useInboxFilters.ts` |
| `REALTIME_PROBE_TIMEOUT_MS` | `5000` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_SAUDAVEL_MS` | `15` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `HEARTBEAT_DEGRADADO_MS` | `60` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `DEFAULT_SEARCH_INSIGHTS_PERIOD` | `30` | `analise-prs/resgate-261118-lote3/claude_05/serene-feynman-3uuurw/src/hooks/admin/useSearchInsights.ts` |
| `UM_DIA` | `24` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/actions-kpi.mjs` |
| `POR_PAGINA` | `100` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/actions-kpi.mjs` |
| `SECAO_ABERTURA` | `'### Etapas superadas pela política vigente'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/ci-docs-baseline.unit.mjs` |
| `MIN_LINE_COVERAGE_PCT` | `50` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `SHARED_DIR_REL` | `'supabase/functions/_shared'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `TESTS_DIR_REL` | `'supabase/functions/_shared/__tests__'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `DOCS_REL` | `'docs/audits/edge-functions-authz-coverage.md'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `DENO_CONFIG_REL` | `'scripts/ci/deno.json'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `MAX_DIAGNOSTICO_DENO` | `6` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `TETO_EM_VOO_MS` | `45` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.mjs` |
| `RUNBOOK_SEGREDOS` | `'docs/runbooks/migracao-segredos-environments.md'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_LABEL` | `'settings-guard'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `ISSUE_TITLE` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `BRANCH` | `'main'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `SEIS_HORAS_MS` | `6` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `SETE_DIAS_MS` | `7` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `LIMITE_COMENTARIOS` | `20` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/issue-rotativa.mjs` |
| `JOB_REUSO` | `'♻️ Reuso de árvore já testada'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/reuso-arvore.mjs` |
| `API` | `'https://api.github.com'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/reuso-arvore.mjs` |
| `SENTINEL_W55` | `'📄 Contratos pulados — apenas docs (W55)'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/reuso-arvore.mjs` |
| `LEDGER_STATEMENTS_HASH_DOMAIN` | `'zapp-migration-ledger-statements-v1\0'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/check-migration-drift.mjs` |
| `COMMENT_ONLY_KIND` | `'ledger-only/comment-only'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/check-migration-drift.mjs` |
| `PINNED_REPLAY_KIND` | `'ledger-divergence/pinned-replay'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/check-migration-drift.mjs` |
| `PASSO_VALIDAR_LEDGER` | `'- name: Validar pos-apply'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/extrair-consulta-ledger.mjs` |
| `CANONICAL_PROJECT` | `'tnnnlkbymytvtqngbbqh'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `MGMT_BASE` | `'https://api.supabase.com'` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_THRESHOLD` | `0.10` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `DEFAULT_WAIT_MS` | `5` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `WINDOW_MINUTES` | `5` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `BOTTOM_FOLLOW_THRESHOLD_PX` | `100` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/src/components/inbox/chat/ChatMessagesArea.tsx` |
| `SELO_ENVIADA_MS` | `1000` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/src/components/inbox/chat/ChatMessagesArea.tsx` |
| `GMAIL_API` | `"https://gmail.googleapis.com/gmail/v1/users/me"` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_RETRY_BASE_DELAY_MS` | `60` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_RETRY_MAX_DELAY_MS` | `60` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_SYNC_CLAIM_STALE_MS` | `5` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_REAUTH_HTTP_STATUS` | `409` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_MESSAGES_MAX_PAGES` | `100` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_REAUTH_MESSAGE` | `"Sessão do Gmail expirada — reconecte a conta"` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `GMAIL_REAUTH_HTTP_STATUS` | `409` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `SECAO_ABERTURA` | `'### Etapas superadas pela política vigente'` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/ci-docs-baseline.unit.mjs` |
| `TITULO` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `CONTEXTS_OK` | `"['` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `ACTIONS_OK` | `"send({ enabled: true, allowed_actions: '` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `WORKFLOW_PERMS_OK` | `"send({ default_workflow_permissions: '` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `SELECTED_PATTERNS` | `"['` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `SEM_ESCOPO` | `"send({ message: '` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `GUARD` | `'github-actions[bot]'` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/scripts/ci/github-settings-guard.unit.mjs` |
| `LIMITE_CHATS_MIN` | `1` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_MAX` | `50` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `LIMITE_CHATS_PADRAO` | `5` | `analise-prs/resgate-261118-lote3/codex/fix-failed-workflows-20261020/src/components/admin/AdminView.tsx` |
| `STEP` | `' {6}- name:'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/ci-artifacts.unit.mjs` |
| `PROP` | `' {8}'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/ci-artifacts.unit.mjs` |
| `SECAO_ABERTURA` | `'### Etapas superadas pela política vigente'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/ci-docs-baseline.unit.mjs` |
| `RUNTIME` | `'a'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/confirm-hash.unit.mjs` |
| `ARQUIVO` | `'b'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/confirm-hash.unit.mjs` |
| `COMMIT` | `'c'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/confirm-hash.unit.mjs` |
| `LACUNA_ORFA` | `'sem chamador no repositório'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/docs-estado-registry-convention.unit.mjs` |
| `TITULO` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `CONTEXTS_OK` | `"['` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `ACTIONS_OK` | `"send({ enabled: true, allowed_actions: '` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `WORKFLOW_PERMS_OK` | `"send({ default_workflow_permissions: '` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `SELECTED_PATTERNS` | `"['` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `SEM_ESCOPO` | `"send({ message: '` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `GUARD` | `'github-actions[bot]'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/github-settings-guard.unit.mjs` |
| `MESSAGE_LIMIT` | `4096` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| `DEFAULT_SCHEDULE_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_FILTER_DEBOUNCE_MS` | `350` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| `AUDIENCE_PREVIEW_LIMIT` | `5000` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| `TAG_FIELD` | `'tags'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/useCampaignEditor.ts` |
| `DEFAULT_SEARCH_INSIGHTS_PERIOD` | `30` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/admin/useSearchInsights.ts` |
| `SEGMENT_TIMEZONE` | `'America/Sao_Paulo'` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| `AUDIENCE_RPC_PAGE_LIMIT` | `1000` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| `BULK_ACTION_MAX_IDS` | `200` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/useTalkXSegments.ts` |
| `HEALTH_CHECK_CONCURRENCY` | `3` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `TOTAL_TIMEOUT_MS` | `45` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `STALE_SESSION_MS` | `6` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `WEBHOOK_SILENT_MS` | `30` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `DEFAULT_INBOX_SILENCE_MINUTES` | `10` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `MIN_INBOX_SILENCE_MINUTES` | `1` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `MAX_INBOX_SILENCE_MINUTES` | `1440` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `TITULO` | `'[settings-guard] perimeter regression detected'` | `analise-prs/resgate-261118-lote3/f3/strict-false-baseline-20261018/scripts/ci/github-settings-guard.unit.mjs` |
| `CONTEXTS_OK` | `"['` | `analise-prs/resgate-261118-lote3/f3/strict-false-baseline-20261018/scripts/ci/github-settings-guard.unit.mjs` |
| … +1047 linhas — lista completa em `context.json` | | |

### H.2 Prazos, expirações e janelas de tempo

| Trecho | Arquivo |
|---|---|
| `SET available_at = now() + interval '4 seconds',` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193300_copilot_tick_trigger.sql` |
| `now() + interval '4 seconds',` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193300_copilot_tick_trigger.sql` |
| `AND expires_at <= now() + interval '5 minutes'` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193400_copilot_presence.sql` |
| `ON CONFLICT (session_id, profile_id) DO UPDATE SET expires_at = now() + interval '90 seconds';` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193400_copilot_presence.sql` |
| `VALUES (p_session_id, v_profile_id, now() + interval '90 seconds')` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193400_copilot_presence.sql` |
| `expires_at timestamptz NOT NULL DEFAULT now() + interval '90 seconds',` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261016193400_copilot_presence.sql` |
| `now() + interval '4 seconds',` | `analise-prs/resgate-261118-lote2/supabase/migrations/20261030200000_copilot_live_motor.sql` |
| `const AMBIGUOUS_THRESHOLD_MS = 2 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/hooks/delivery/useUnconfirmedMessages.ts` |
| `const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| `const day2Start = startOfDay(addDays(now, 2));` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `const sevenDayLimit = startOfDay(addDays(now, 7));` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `const tomorrowStart = startOfDay(addDays(now, 1));` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `if (filtro === 'today') return due < startOfDay(addDays(now, 1));` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `return due < startOfDay(addDays(now, 7)); // filtro === 'week'` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| `const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `const DEFAULT_WAIT_MS = 5 * 60 * 1000; // 5 min` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| `const UM_DIA = 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs` |
| `const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| `const DEFAULT_WAIT_MS = 5 * 60 * 1000; // 5 min` | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| `destaqueTimerRef.current = setTimeout(() => { destaqueTimerRef.current = null; setDeliveryFocusId(null); }, 1200);` | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx` |
| `const UM_DIA = 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| `export const TETO_TRAVADA_MS = 45 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/fila-merge.mjs` |
| `enviadoTimerRef.current = window.setTimeout(() => { if (isMountedRef.current) setEnviadoOk(false); }, 1500);` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| `setTimeout(resolve, 3000);` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| `const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| `export const PENDING_ACTION_TTL_MS = 2 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| `const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| `inactivity_timeout: 30,` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useUserSettings.ts` |
| `assert.deepEqual(options, { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `minVersion: version, maxVersion: version, timeout: 5_000 }, response => {` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `encoding: 'utf8', timeout: 10000,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-workflow.unit.mjs` |
| `], { timeout: 210_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs` |
| `const driverRun = (args, code, timeout = 240_000, { recordLog = true } = {}) => {` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs` |
| `cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs` |
| `required(docker(['pull', image], { timeout: 15 * 60_000 }), 'pull-' + name + '-failed');` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs` |
| `const response = await page.goto(TLS_ORIGIN + '/__e2e/tls-probe', { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/tls-probe.mjs` |
| `const warmup = await negative.goto(warmupUrl, { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/tls-probe.mjs` |
| `try { await negative.goto(controlUrl(kind), { waitUntil: 'load', timeout: 15_000 }); }` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/tls-probe.mjs` |
| `], { timeout: 210_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `const browserResult = docker(['exec', '-w', '/work', driver.name, ...cli], { timeout: 600_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `const driverRun = (args, code, timeout = 240_000, { recordLog = true } = {}) => {` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `required(docker(['pull', image], { timeout: 15 * 60_000 }), 'pull-' + name + '-failed');` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `expires_at: new Date(now + 60 * 60 * 1000).toISOString(),` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `role, iss: 'supabase', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 4 * 60 * 60,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/runtime-contract.mjs` |
| `const response = await page.goto(TLS_ORIGIN + '/__e2e/tls-probe', { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls-probe.mjs` |
| `try { await negative.goto(controlUrl(kind), { waitUntil: 'load', timeout: 15_000 }); }` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls-probe.mjs` |
| `cwd, env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 60_000,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `assert.deepEqual(options, { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `minVersion: version, maxVersion: version, timeout: 5_000 }, response => {` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `], { timeout: 210_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `const browserResult = docker(['exec', '-w', '/work', driver.name, ...cli], { timeout: 600_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `const driverRun = (args, code, timeout = 240_000, { recordLog = true } = {}) => {` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `required(docker(['pull', image], { timeout: 15 * 60_000 }), 'pull-' + name + '-failed');` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `expires_at: new Date(now + 60 * 60 * 1000).toISOString(),` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `role, iss: 'supabase', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 4 * 60 * 60,` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/runtime-contract.mjs` |
| `const response = await page.goto(TLS_ORIGIN + '/__e2e/tls-probe', { waitUntil: 'load', timeout: 15_000 });` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/tls-probe.mjs` |
| `try { await negative.goto(controlUrl(kind), { waitUntil: 'load', timeout: 15_000 }); }` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/tls-probe.mjs` |
| `const HEARTBEAT_DEGRADADO_MS = 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `const HEARTBEAT_SAUDAVEL_MS = 15 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| `const UM_DIA = 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/actions-kpi.mjs` |
| `const corte = agora - 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/actions-kpi.mjs` |
| `timeout: 120_000,` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `timeout: 60_000,` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/edge-coverage-authz.unit.mjs` |
| `const TETO_EM_VOO_MS = 45 * 60 * 1000; // GA49: PR em dia sem check em andamento há > 45 min → bloqueada` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/fila-merge.mjs` |
| `const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/ci/github-settings-guard.mjs` |
| `const DEFAULT_WAIT_MS = 5 * 60 * 1000; // 5 min` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/edge-deploy/health-check.mjs` |
| `if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token;` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/supabase/functions/_shared/gmail-helpers.ts` |
| `const STALE_SESSION_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `const WEBHOOK_SILENT_MS = 30 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `destaqueTimerRef.current = setTimeout(() => { destaqueTimerRef.current = null; setDeliveryFocusId(null); }, 1200);` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/components/inbox/ChatPanel.tsx` |
| `const delayMs = Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** (exp - 1));` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/gmail-helpers.ts` |
| `if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token;` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/gmail-helpers.ts` |
| `const STALE_SESSION_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| `const WEBHOOK_SILENT_MS = 30 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| `await new Promise((r) => setTimeout(r, 1500));` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
| `await new Promise((r) => setTimeout(r, 2000));` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
| `timeout: 120_000,` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/ci/edge-coverage-authz.unit.mjs` |
| `timeout: 60_000,` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/ci/edge-coverage-authz.unit.mjs` |
| `if (Date.now() < new Date(account.token_expires_at).getTime() - 5 * 60 * 1000) return storedTokens.access_token;` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/gmail-helpers.ts` |
| `const STALE_SESSION_MS = 6 * 60 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| `const WEBHOOK_SILENT_MS = 30 * 60 * 1000;` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| `const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| `options: { challenge, rpId, timeout: 60000, userVerification: 'required' },` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts` |
| `timeout: 60000, attestation: 'none', excludeCredentials,` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts` |
| `await new Promise(r => setTimeout(r, 1000));` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/settings/AIAutoTagsConfig.tsx` |
| `timerRef.current = setTimeout(() => { timerRef.current = null; setWasOffline(false); }, 3000);` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/ui/offline-indicator.tsx` |
| `indicatorTimerRef.current = setTimeout(() => setShowIndicator(false), 3000);` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/ui/skip-link.tsx` |
| `await new Promise(r => setTimeout(r, 1000));` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/settings/AIAutoTagsConfig.tsx` |
| `WHERE created_at < now() - interval '30 days'` | `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193500_copilot_retention.sql` |
| `WHERE created_at < now() - interval '90 days';` | `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193500_copilot_retention.sql` |
| `WHERE f.created_at < now() - interval '30 days'` | `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193500_copilot_retention.sql` |
| `WHERE i.created_at < now() - interval '90 days'` | `analise-prs/resgate-regra8-261118/supabase/migrations/20261016193500_copilot_retention.sql` |
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
| `const hoursSinceLastMsg = (now - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60);` | `src/hooks/chat/useNextBestAction.ts` |
| `contactTypingTimeoutRef.current = setTimeout(() => { setIsContactTyping(false); }, 5000);` | `src/hooks/chat/useTypingPresence.ts` |
| `typingTimeoutRef.current = setTimeout(() => { setTyping(false); }, 3000);` | `src/hooks/chat/useTypingPresence.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/chat/journey/useJourneyActors.ts` |
| `setTimeout(resolve, 3000);` | `src/hooks/communication/useAudioMemes.ts` |
| `const SIGNED_URL_REFRESH_AFTER_MS = 50 * 60 * 1000;` | `src/hooks/communication/useAudioPlayer.ts` |
| `update({ dndConversationId: null, dndUntil: now + 30 * 60 * 1000 });` | `src/hooks/copilot/useRadarPanel.ts` |
| `const cutoff = Date.now() - 5 * 60 * 1000;` | `src/hooks/copilot/useWhisperChannel.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useAgentsLite.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useCRMAdminAccess.ts` |
| `gcTime: 15 * 60 * 1000,` | `src/hooks/crm/useEmailContactContext.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/crm/useEmailContactContext.ts` |
| `gcTime: 1000 * 60 * 60,` | `src/hooks/crm/useExternalCargos.ts` |
| `gcTime: 1000 * 60 * 60,` | `src/hooks/crm/useExternalEmpresas.ts` |
| `const since = subHours(new Date(), 24).toISOString();` | `src/hooks/dashboard/useRecentConversationEvents.ts` |
| `staleTime: 5 * 60 * 1000,` | `src/hooks/dashboard/useSentimentTrend.ts` |
| `const AMBIGUOUS_THRESHOLD_MS = 2 * 60 * 1000;` | `src/hooks/delivery/useUnconfirmedMessages.ts` |
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
| … +195 linhas — lista completa em `context.json` | |

### H.3 Limites de paginação

| Limite | Arquivo |
|---|---|
| 20 | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/contacts/ContactPurchaseHistory.tsx` |
| 1 | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/src/hooks/copilot/useCopilotSession.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| 500 | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| 10 | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/MediaMigrationTool.tsx` |
| 50 | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| 20 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| 100 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| 2000 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| 50 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| 200 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/tracking/TalkXRecipientsTable.tsx` |
| 60 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| 10 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| 20 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/system/useDiagnosticsData.ts` |
| 200 | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/team-chat/useTeamMessages.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| 10 | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| 20 | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/system/useDiagnosticsData.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/chat/useTeamChatNotifications.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| 10 | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| 20 | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useDiagnosticsData.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/chat/useTeamChatNotifications.ts` |
| 1 | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| 10 | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| 20 | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/system/useDiagnosticsData.ts` |
| 1 | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| 1 | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/evolution-webhook-handlers.ts` |
| 1 | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| 5000 | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
| 1 | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/evolution-webhook-handlers.ts` |
| 1 | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| 1 | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/webauthn/index.ts` |
| 1 | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/inbox/QueuePositionNotifier.tsx` |
| 20 | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/settings/AIAutoTagsConfig.tsx` |
| 50 | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/inbox/ConversationTimeline.tsx` |
| 20 | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/settings/AIAutoTagsConfig.tsx` |
| 200 | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/hooks/communication/useCallHistory.ts` |
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
| 10 | `src/components/inbox/useChatMediaSending.ts` |
| 1 | `src/components/inbox/useFileUploadLogic.ts` |
| 10 | `src/components/inbox/useGlobalSearchData.ts` |
| 15 | `src/components/inbox/useGlobalSearchData.ts` |
| 20 | `src/components/inbox/useGlobalSearchData.ts` |
| 50 | `src/components/inbox/chat/MentionAutocomplete.tsx` |
| 50 | `src/components/inbox/collaboration/InternalNotesPanel.tsx` |
| 15 | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| 20 | `src/components/monitoring/MonitoringEventTimeline.tsx` |
| 1 | `src/components/onboarding/checklistSteps.ts` |
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
| 1 | `src/hooks/business/useWarRoomAlerts.ts` |
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
| 1 | `src/hooks/copilot/useCopilotSession.ts` |
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
| 50 | `src/hooks/integrations/useTalkXCommandItems.ts` |
| 50 | `src/hooks/integrations/useTalkXEvents.ts` |
| 500 | `src/hooks/integrations/useTalkXInsights.ts` |
| 2000 | `src/hooks/integrations/useTalkXMonitor.ts` |
| 1 | `src/hooks/integrations/useTalkXResumeChecklist.ts` |
| 1 | `src/hooks/integrations/useTalkXServiceStatus.ts` |
| 10 | `src/hooks/integrations/useTalkXTemplates.ts` |
| 10 | `src/hooks/integrations/useWhatsAppStatus.ts` |
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
| 1 | `src/services/message-unread.service.ts` |
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
| componente sha256 fora de forma no lote | `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs` |
| lote fora de ordem estrita: ${versions[i - 1]} antes de ${versions[i]} | `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs` |
| lote vazio: sem versions nao ha o que confirmar | `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs` |
| versao fora de forma: ${v} | `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs` |
| versions, runtimeShas e arquivoShas precisam ter o mesmo tamanho | `analise-prs/resgate-261118-lote2/scripts/db-audit/compose-confirm-hash.mjs` |
| sem runtime_sha256 | `analise-prs/resgate-261118-lote2/scripts/db-audit/proof-sha.mjs` |
|  className= | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| Não foi possível registrar. Tente novamente. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| Não foi possível registrar: usuário não identificado. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/talkx/kit/dialogs.tsx` |
| Não foi possível registrar. Tente novamente. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/hooks/crm/useContactPurchases.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-deadline-calculator/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-lead-temperature/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-loss-risk/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-multimodal-analysis/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-objection-handler/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-price-anchor/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fns-fases8-15-261024-1615/supabase/functions/ai-product-recommendation/index.ts` |
| Erro ao arquivar contatos | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao buscar avatares:  | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao marcar como lido | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao transferir contatos | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao transferir contatos: ${transferidos} de ${contactIds.length} contato(s) transferido(s); ${failures.length} falharam | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| nenhum contato lido | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-deadline-calculator/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-lead-temperature/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-loss-risk/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-objection-handler/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-price-anchor/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/supabase/functions/ai-product-recommendation/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-deadline-calculator/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-lead-temperature/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-loss-risk/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-multimodal-analysis/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-objection-handler/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-price-anchor/index.ts` |
| AI gateway error [${response.status}] | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-fases8-10-261024-1545/supabase/functions/ai-product-recommendation/index.ts` |
| fonte única de versões ausente ou ilegível em ${TOOLCHAIN_PATH}: ${error.message} | `analise-prs/resgate-261118-lote3/claude/feat-e75-toolchain-env-281028-0600/scripts/ci/check-workflow-pins.mjs` |
| fonte única de versões incompleta em ${TOOLCHAIN_PATH}: falta a versão de  | `analise-prs/resgate-261118-lote3/claude/feat-e75-toolchain-env-281028-0600/scripts/ci/check-workflow-pins.mjs` |
| fonte única de versões inválida em ${TOOLCHAIN_PATH}: o arquivo precisa ser um objeto JSON | `analise-prs/resgate-261118-lote3/claude/feat-e75-toolchain-env-281028-0600/scripts/ci/check-workflow-pins.mjs` |
|              data-testid= | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/SendErrorBanner.tsx` |
| invalid_buttons_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| invalid_contact_card_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| invalid_list_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| invalid_location_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| invalid_poll_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| mark_outbound_post_started_failed | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| media_resolve_failed | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| missing_media_url | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| missing_rich_delivery_payload | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| rich_payload_read_failed | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| unsupported_message_type | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
|  className= | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/multiplix/MultiplixMonitor.tsx` |
| , content: risk, data: { risk } });   }   if (out.next_action) {     rows.push({ ...base, insight_type:  | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_BAD_PAYLOAD | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_READ_FAILED | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_SESSION_NOT_FOUND | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_TIER1_CONTRACT | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_TIER1_FAILED | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_WRITE_FAILED | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| Erro ao cancelar | `analise-prs/resgate-261118-lote3/claude/feat-talkx-x054-cmdk-261108-0100/src/components/talkx/TalkXView.tsx` |
| Erro ao pausar | `analise-prs/resgate-261118-lote3/claude/feat-talkx-x054-cmdk-261108-0100/src/components/talkx/TalkXView.tsx` |
| Template não encontrado ou sem acesso. | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/talkx/TalkXTemplates.tsx` |
| GitHub API ${method} ${path} → ${res.status}: ${text} | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| Erro: ${msg} | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| phone invalido apos normalizacao | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| phone ou contact_id obrigatório | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| falha ao consultar schema_migrations via psql: ${lastStderr \|\|  | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| falha ao consultar schema_migrations via psql: ${safe} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| RPC ${rpc} recusada (HTTP ${resposta.status}) | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| login do usuario de teste nao devolveu access_token | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| login do usuario de teste recusado (HTTP ${login.status}) | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| logout recusado (HTTP ${saida.status}) | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| central directory corrompido | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| local header corrompido | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| metodo de compressao ${metodo} nao suportado | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| zip criptografado nao suportado | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| zip sem end of central directory | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| zip64 nao suportado | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| --project-ref obrigatorio | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| Apenas o projeto canonico e aceito | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| Argumento desconhecido: ${argv[i]} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| ${metodo} ${caminho} -> ${r.status} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs` |
| GitHub API ${method} ${path} → ${res.status}: ${text} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| GitHub API POST /graphql → ${res.status}: ${text} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| gh mock não coberto: ${method} ${path} | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.unit.mjs` |
| GitHub API ${method} ${path} → ${res.status}: ${text} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| contrato ${arquivo}: nenhuma invocacao declarada | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: -c  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: -c sem SQL | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: arquivo de contrato nao termina em .sql ( | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: chamada sem flags de cliente | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: continuacao sem  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: falta -v ON_ERROR_STOP=1 (o SQL falharia em silencio) | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: flag nao declarada  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: forma nao declarada em  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: invocacao sem rotulo do case nem versao no nome do arquivo | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: o texto de -c nao comeca por WITH/SELECT/VALUES | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: o texto de -c tem substituicao de shell ( | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: o texto de -c tem substituicao de shell (crase); nao e SQL | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato ${origem}: o texto de -c tem substituicao de shell; nao e SQL | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato de runtime ausente para a versao ${versao}: ${arquivo} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato vazio para a versao ${versao}: ${arquivo} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato: a versao ${v} esta declarada em mais de um contrato | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato: mais de um ramo generico (*) declarado | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| contrato: nenhum ramo generico (*) declarado (nao ha fallback para o inventario) | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| nenhum contrato de runtime em ${dir} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| versao alvo invalida:  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| --project-ref obrigatorio | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| Apenas o projeto canonico e aceito | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| Argumento desconhecido: ${argv[i]} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| Management API retornou HTTP ${res.status} na consulta de analytics | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| P046.json não traz a lista  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| P046.json traz ${byId.size} avaliações, esperado ${esperado} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| avaliação ausente para a etapa: ${e.id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| avaliação desconhecida (sem etapa): ${id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| avaliação duplicada: ${id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| elemento duplicado no inventário: ${id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| estado de avaliação desconhecido em ${id}: ${t.status} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| estado inesperado no inventário ${f}: ${id} →  | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| etapa inexistente: ${id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| etapas.json não é uma lista | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| id de avaliação inválido: ${id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| id de etapa duplicado: ${e.id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| id de etapa inválido: ${e.id} | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| Erro ao transferir | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx` |
| Não foi possível criar a referência durável do anexo | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx` |
| Erro ao salvar segmento: ${e instanceof Error ? e.message : String(e)} | `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/TalkXSegments.tsx` |
| Não foi possível aplicar a ação: ${e instanceof Error ? e.message : String(e)} | `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/TalkXSegments.tsx` |
| Segmento não encontrado ou sem acesso. | `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/TalkXSegments.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| Informe uma URL de mídia HTTPS válida. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/talkx/TalkXTemplateEditor.tsx` |
| Versão do template indisponível; reabra o editor | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/talkx/TalkXTemplateEditor.tsx` |
| useAuth must be used within an AuthProvider | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/auth/useAuth.tsx` |
| Arquivo removido da base, mas o objeto não foi localizado para exclusão no Storage. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Arquivo removido da base, mas o objeto não pôde ser excluído do Storage. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro ao excluir arquivo | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro ao remover artigo | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro no upload | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Falha ao reprocessar | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Falha no processamento | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| Sem texto extraível | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| ${rule.field} requer pré-resolução via p_contact_ids antes de chamar a RPC | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao atualizar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao excluir: ${e.message} | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao salvar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Grupo de segmento inválido | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Informe a tag para aplicar em massa. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Perfil ainda não carregado | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Regra de segmento inválida: ${rule.field} | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Selecione ao menos um segmento. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Failed to create audio object reference | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/services/chat.service.ts` |
| ${metodo} ${caminho} -> ${r.status} | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.mjs` |
| A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Erro ao atualizar status | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Erro ao enviar foto | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Erro ao fazer upload da foto | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Erro ao salvar usuário | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Não foi possível carregar a auditoria. Tente novamente. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Não foi possível carregar os nomes dos autores. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Não foi possível carregar os papéis dos usuários. Tente novamente. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Não foi possível carregar os usuários. Tente novamente. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Preencha todos os campos obrigatórios | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| . Cast local via  | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/dashboard/useSentimentData.ts` |
| Contato não encontrado no CRM | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/CRMAutoSync.tsx` |
| Erro ao sincronizar com CRM | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/CRMAutoSync.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/RealtimeInboxView.tsx` |
| Falha ao reabrir conversa | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/RealtimeInboxView.tsx` |
|                            {...entradaErro}                           className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Envio de áudio não confirmado | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Erro ao enviar áudio | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Erro ao transformar voz: ${msg} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Este navegador não grava áudio neste formato. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Gravação limitada a 60 segundos | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Nenhum microfone encontrado neste dispositivo. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Não foi possível acessar o microfone | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Permissão de microfone negada. Libere o acesso no navegador. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Sessão expirada: entre de novo para enviar a voz transformada | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| Erro ao carregar preview da voz | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceSelector.tsx` |
| Erro ao gerar preview | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceSelector.tsx` |
| Erro ao reproduzir preview | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceSelector.tsx` |
|                  data-testid= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| Não foi possível marcar os sussurros como lidos. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/security/AuditLogDashboard.tsx` |
| Campanha cancelada. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| Erro ao cancelar a campanha. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| Erro ao pausar a campanha. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| Erro ao retomar campanha. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignWizard.tsx` |
| Erro ao salvar segmento: ${e instanceof Error ? e.message : String(e)} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXSegments.tsx` |
| Não foi possível aplicar a ação: ${e instanceof Error ? e.message : String(e)} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXSegments.tsx` |
| Segmento não encontrado ou sem acesso. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXSegments.tsx` |
| Informe uma URL de mídia HTTPS válida. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXTemplateEditor.tsx` |
| Versão do template indisponível; reabra o editor | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXTemplateEditor.tsx` |
| Erro ao cancelar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXView.tsx` |
| Erro ao pausar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXView.tsx` |
|  className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXWizardDelivery.tsx` |
| A audiência deste rascunho ainda está carregando. Aguarde antes de salvar. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| A campanha não foi iniciada. Verifique a conexão e tente novamente. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| Informe uma data e hora locais válidas. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| Não foi possível carregar toda a audiência do rascunho. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O fuso horário selecionado é inválido. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O horário selecionado não existe no fuso informado devido ao horário de verão. Escolha outro horário. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O horário selecionado é ambíguo devido ao horário de verão. Escolha outro horário. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O instante UTC informado é inválido. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O navegador não oferece uma fonte segura para identificar o rascunho. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| Revise público, mensagem e agendamento antes de salvar a programação. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| Revise público, mensagem, agendamento e confirmações antes de lançar. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
|  className= | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/TeamChatPanel.tsx` |
| Erro ao editar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| Erro ao enviar mensagem | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| Erro ao enviar áudio | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| Erro ao excluir | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| useAuth must be used within an AuthProvider | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/auth/useAuth.tsx` |
| Arquivo excede 5MB | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Arquivo não é um áudio válido | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Erro ao enviar arquivo | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Erro ao processar áudio | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Erro ao salvar áudio meme no banco de dados | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Não foi possível alterar a categoria | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Não foi possível remover o áudio meme | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| O áudio convertido em MP3 excede 5MB. Use um áudio mais curto. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| O áudio saiu da lista, mas o arquivo não pôde ser apagado do armazenamento | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Sessão expirada: entre novamente para enviar o áudio | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| Erro ao criar conexão | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts` |
| Erro ao definir conexão padrão | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts` |
| Erro ao desconectar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts` |
| Esta conexão não possui uma instância configurada. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts` |
| Exclusão pendente | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/useConnectionsManager.ts` |
| Erro ao atualizar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao excluir: ${e.message} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao salvar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Grupo de segmento inválido | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Informe a tag para aplicar em massa. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Perfil ainda não carregado | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Regra de segmento inválida: ${rule.field} | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Selecione ao menos um segmento. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/integrations/useTalkXSegments.ts` |
| Failed to create audio object reference | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/chat.service.ts` |
| Resposta inválida do serviço de entrega. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| warroom_agent_today devolveu ${rows.length} linhas | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/business/useWarRoomData.ts` |
| warroom_queue_stats devolveu ${rows.length} linhas | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/business/useWarRoomData.ts` |
| Erro ao arquivar contatos | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao buscar avatares:  | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao marcar como lido | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao transferir contatos | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| Erro ao transferir contatos: ${transferidos} de ${contactIds.length} contato(s) transferido(s); ${failures.length} falharam | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| nenhum contato lido | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| Arquivo removido da base, mas o objeto não foi localizado para exclusão no Storage. | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Arquivo removido da base, mas o objeto não pôde ser excluído do Storage. | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro ao excluir arquivo | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro ao remover artigo | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Erro no upload | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Falha ao reprocessar | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Falha no processamento | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| Sem texto extraível | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| ${rule.field} requer pré-resolução via p_contact_ids antes de chamar o motor | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao atualizar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao excluir: ${e.message} | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Erro ao salvar segmento: ${e.message} | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Grupo de segmento inválido | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Informe a tag para aplicar em massa. | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Perfil ainda não carregado | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Regra de segmento inválida: ${rule.field} | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| Selecione ao menos um segmento. | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useTalkXSegments.ts` |
| useAuth must be used within an AuthProvider | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/auth/useAuth.tsx` |
| Erro ao carregar configurações | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useUserSettings.ts` |
| Erro ao salvar | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useUserSettings.ts` |
| Você precisa estar logado para salvar configurações. | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/system/useUserSettings.ts` |
| , content: risk, data: { risk } });   }   if (out.next_action) {     rows.push({ ...base, insight_type:  | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_BAD_PAYLOAD | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_READ_FAILED | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_SESSION_NOT_FOUND | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_TIER1_CONTRACT | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| COPILOT_WRITE_FAILED | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/_shared/copilot-tick.ts` |
| AI_GENERATE_BAD_PAYLOAD | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| AI_GENERATE_DISABLED | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| ai-jobs-worker: WORKER_ID inválido: ${WORKER_ID} | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| ai-jobs-worker: job ${job.id} sem linha ou sem lease_token | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| ai-jobs-worker: leitura de ai_jobs falhou: ${error.message} | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/supabase/functions/ai-jobs-worker/index.ts` |
| Unexpected controlled boundary:  | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| must-not-read-service-role | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| ECONNREFUSED | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| Timeout 10000ms exceeded | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| connection refused | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| context failed | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| controlled invalid JSON | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| frame unavailable | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| invalid peer certificate:  | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| must-not-fetch | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| operation timed out | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| R1_SKIP | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-tarefas-project.unit.mjs` |
| invalid-local-media | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| local-media-empty | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| local-media-too-large | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| local-media-unavailable | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| unsupported-filter | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| unsupported-filter-column | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| unsupported-order | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| unsupported-range | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/providers.mjs` |
| … +2516 linhas — lista completa em `context.json` | |

## J. Controle de acesso no código (checagens de perfil/permissão)

| Valor comparado | Arquivo |
|---|---|
| `string` | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/src/hooks/copilot/useCopilotSession.ts` |
| `granted` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| `granted` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| `profileId` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/gamification/useAgentCelebrations.ts` |
| `admin` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| `supervisor` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| `granted` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts` |
| `string` | `analise-prs/resgate-261118-lote3/claude/radar-motor-copilot-live-301030/src/hooks/copilot/useCopilotSession.ts` |
| `positive` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `spec` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `untrusted` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-tls.unit.mjs` |
| `driver` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `edge` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `gateway` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/tls.mjs` |
| `admin` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/calls/TelefoniaView.tsx` |
| `supervisor` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/calls/TelefoniaView.tsx` |
| `string` | `analise-prs/resgate-261118-lote3/resolve-2381-from-main/src/hooks/copilot/useCopilotSession.ts` |
| `bwp` | `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs` |
| `undefined` | `analise-prs/variantes-261118/claude_pink__cool-dijkstra-xk9ek2/scripts/ci/aplicar-perimetro.mjs` |
| `agent` | `src/components/admin/TrainingMode.tsx` |
| `customer` | `src/components/admin/TrainingMode.tsx` |
| `admin` | `src/components/admin/useAdminData.ts` |
| `admin` | `src/components/agents/AgentsView.tsx` |
| `supervisor` | `src/components/agents/AgentsView.tsx` |
| `null` | `src/components/auth/ProtectedRoute.tsx` |
| `admin` | `src/components/calls/TelefoniaView.tsx` |
| `supervisor` | `src/components/calls/TelefoniaView.tsx` |
| `undefined` | `src/components/contacts/BulkActionsBar.tsx` |
| `admin` | `src/components/inbox/WhisperMode.tsx` |
| `supervisor` | `src/components/inbox/WhisperMode.tsx` |
| `intermediary` | `src/components/inbox/copilot/DecisionMakerBadge.tsx` |
| `unknown` | `src/components/inbox/copilot/DecisionMakerBadge.tsx` |
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
| `string` | `src/hooks/copilot/useCopilotSession.ts` |
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

## K. Testes como especificação (26093 testes em 2720 arquivos — nomes completos em `context.json`)

| Arquivo | Testes | Exemplos do que o sistema DEVE fazer |
|---|---|---|
| `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/components/talkx/__tests__/useCampaignEditor.test.tsx` | 80 | useCampaignEditor — draft integrity · rejects a nonexistent local DST time instead of silently moving the scheduled instant · converts a valid time after the DST transition using the offset in effect at that time · rejects an ambiguous local DST time instead of arbitrarily choosing one occurrence … |
| `scripts/db-audit/check-migration-drift.test.mjs` | 80 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `src/components/catalog/__tests__/catalogShared.test.tsx` | 80 | catalogShared · formatPrice formata em BRL pt-BR · formatPrice arredonda para 2 casas · formatStock adiciona sufixo  … |
| `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` | 80 | MediaLibraryAdmin · Main Component Rendering · renders the main title · renders the description … |
| `src/components/talkx/__tests__/useCampaignEditor.test.tsx` | 80 | useCampaignEditor — draft integrity · rejects a nonexistent local DST time instead of silently moving the scheduled instant · converts a valid time after the DST transition using the offset in effect at that time · rejects an ambiguous local DST time instead of arbitrarily choosing one occurrence … |
| `src/components/team-chat/__tests__/team-chat-exhaustive-audit.test.ts` | 80 | Team Chat — Exhaustive Audit · Input Area Edge Cases · should not send empty/whitespace-only messages · should have character limit enforcement … |
| `src/hooks/__tests__/useExternalCatalog.test.ts` | 80 | useExternalCatalog · Initialization · initializes with empty state · exposes all expected methods … |
| `src/hooks/tasks/__tests__/workItemAggregates.test.ts` | 80 | Fase F — correções da auditoria · a busca ignora acento e caixa:  · lista nula não derruba o recorte (guarda  · concluída SEM carimbo entra nos 7 dias da Lista (mesma regra do Quadro) … |
| `supabase/functions/multiplix-send/index.test.ts` | 80 | personalize resolve {{empresa}} com o nome da empresa · personalize resolve {{saudacao}} para um período válido do dia · personalize mantém o texto byte a byte E reporta {{empresa}} sem valor em missing (MX06) · personalize usa fallback [variavel] para placeholder fora do conjunto fixo (nunca lança) … |
| `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.test.mjs` | 74 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/db-audit/check-migration-drift.test.mjs` | 73 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `supabase/functions/evolution-api/index.test.ts` | 73 | R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor · R2-API-001: admin conserva a operação (set-webhook chega ao provedor) · R2-API-001: ${action} sem papel devolve 403 e não produz I/O no provedor · R2-API-001: ação desconhecida com admin passa o gate e cai no 404 do handler … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/scripts/db-audit/check-migration-drift.test.mjs` | 72 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/scripts/db-audit/check-migration-drift.test.mjs` | 72 | aceita migration com nome e SQL equivalentes no ledger · aceita registro legado sem name/statements, sem inventar evidencia · fixa arquivo legado por hash sem chamar seus bytes de conteudo historico · name-and-file-pinned falha para arquivo/nome alterado ou SQL recuperado no ledger … |
| `src/components/talkx/__tests__/talkxTemplateFile.test.ts` | 72 | X093 · talkxTemplateFile — parseTemplateFile · CSV básico com cabeçalho name;content · CSV com BOM é limpo · CSV com aspas duplas em campo … |
| `src/lib/__tests__/emailHtml.test.ts` | 70 | sanitizeEmailHtml — XSS básico · remove <script> · remove event handlers (onclick, onerror, onload) · remove javascript: em href … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/__tests__/useEvolutionApi.test.ts` | 69 | useEvolutionApi - Exhaustive Test Suite · Initialization · starts with isLoading = false · exposes all supported functions … |
| `src/hooks/__tests__/useEvolutionApi.test.ts` | 69 | useEvolutionApi - Exhaustive Test Suite · Initialization · starts with isLoading = false · exposes all supported functions … |
| `src/hooks/__tests__/useSipClient.test.ts` | 69 | useSipClient · should start with disconnected status · should set connecting status when connect is called · should become registered when registerer fires Registered … |
| `supabase/functions/talkx-send/index.test.ts` | 69 | personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao) · personalize falls back to a bracket placeholder for an unresolved variable instead of throwing · personalize substitutes the real value when the contact has that custom field · personalize resolves multiple custom values in the same message … |
| `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/team-chat/__tests__/team-chat-security-gaps.test.ts` | 66 | Team Chat — Security Analysis · RLS Policy Gaps · GAP: INSERT on team_conversation_members only checks auth.uid() IS NOT NULL · GAP: No DELETE policy on team_conversations … |
| `src/lib/journey/__tests__/mappers.test.ts` | 66 | mapMessages · agrupa mensagens seguidas do MESMO autor em até 10 min · na virada de 10 min: exatamente 10 min agrupa, 10 min + 1 ms não agrupa · autores diferentes não entram na mesma rajada … |
| `src/lib/journey/__tests__/periodRange.test.ts` | 64 | resolveRange — atalhos (D04) · any devolve intervalo aberto e não marca inválido · today cobre o dia inteiro do relógio do aparelho · ${preset} começa em (hoje − ${dias - 1}) 00:00 e vai até o fim de hoje … |
| `src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx` | 62 | useAddressAutocomplete · proximidade depende das coordenadas, não da identidade do objeto · %s: centro equivalente conserva destaque e seleção sem repetir a busca · novo objeto com coordenadas zero não aborta nem substitui a consulta em voo … |
| `src/lib/calls/adapters/__tests__/CallEngine.test.ts` | 55 | SipCallAdapter.setMuted (T18) · muteia a track de áudio e devolve o estado LIDO (não o pedido) · desmuta a track e devolve o estado lido · sem mídia devolve null, para o chamador decidir pela intenção … |
| `src/components/settings/theme/__tests__/presets.test.ts` | 54 | §1 catálogo · tem 19 presets com ids únicos · corporate é o primeiro · ordem é clássicas (10) seguidas de GX (9) … |
| `supabase/functions/message-delivery/index.test.ts` | 54 | message delivery rejects methods other than POST before reading secrets · message delivery rejects unauthenticated callers before reading the body · message delivery builds an Evolution poll only from a valid persisted payload · message delivery rejects a malformed persisted contact payload … |
| `supabase/functions/_shared/ai-usage.test.ts` | 53 | logAiUsageDetached: com EdgeRuntime.waitUntil, entrega a promessa ao runtime sem bloquear · registrarConsumoDeDiagnostico: export do ai-proxy preserva o consumo provider_test · logAiUsageDetached: sem EdgeRuntime.waitUntil, AGUARDA a promessa até o insert concluir · ai-proxy: os logs de consumo usam  … |
| `src/components/tasks/__tests__/TasksModule.test.tsx` | 50 | TasksModule — etapa 57 (QuickAdd da Agenda) · na Agenda existe um único QuickAdd, já apontando para o dia selecionado · TasksModule — etapa 45 (barra de filtros) · traz o toggle de concluídas na linha de captura e deixa a barra sem duplicar … |
| `src/lib/journey/__tests__/stats.test.ts` | 50 | computeJourneyStats — totais por categoria (S074) · conta cada categoria separada e a soma em  · linha com data inválida não entra na conta nem produz NaN · entrada vazia devolve zeros sem estourar … |
| `src/components/ai/__tests__/AutoTicketClassifier.test.tsx` | 49 | AutoTicketClassifier · Rendering · renders title · renders auto-classify switch … |
| `src/components/omnichannel/__tests__/OmnichannelInbox.test.tsx` | 49 | OmnichannelInbox · Projeção canônica de conversas · mostra a última mensagem de cada conversa em vez de só o cadastro · marca não lidas com a contagem vinda da projeção … |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 49 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `src/hooks/system/__tests__/useDiagnosticsData.test.ts` | 48 | useDiagnosticsData — mensagens da janela de 24 h · conta só as mensagens do agente dentro da janela e calcula as taxas · as falhas recentes trazem só id, horário e motivo — sem nome nem conteúdo · base vazia: taxas 0 (sem divisão por zero) e nenhuma busca de contato … |
| `src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx` | 47 | ContactHeaderSection · renders contact first name · renders company name · does not render phone number or WhatsApp link … |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | 47 | TalkXView wizard route integration · restores the routed draft and its requested step on first render · autosave do rascunho novo não remonta o wizard quando a lista de campanhas recarrega · voltar entre passos do rascunho novo não expulsa o usuário enquanto a lista não traz o rascunho … |
| `tests/contracts/ai-routing.contract.test.ts` | 47 | IA-031/034 — resolveProvider: um padrão por finalidade, nunca arbitrário · exatamente 1 padrão ativo para a finalidade → resolve para ele · 0 padrões → NO_PROVIDER (a ausência vira indisponibilidade explícita) · 2+ padrões para a mesma finalidade → AMBIGUOUS_PROVIDER (jamais escolher uma) … |
| `analise-prs/resgate-261118-lote3/claude/feat-ui-visual-texto-longo-261101-1445/src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx` | 46 | ChurnPredictionDashboard · Rendering · renders title · renders subtitle … |
| `src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx` | 46 | ChurnPredictionDashboard · Rendering · renders title · renders subtitle … |
| `src/components/performance/__tests__/PerformanceMonitor.test.tsx` | 46 | PerformanceMonitor · Rendering · renders title · renders subtitle … |
| `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.test.ts` | 44 | message delivery rejects methods other than POST before reading secrets · message delivery rejects unauthenticated callers before reading the body · message delivery builds an Evolution poll only from a valid persisted payload · message delivery rejects a malformed persisted contact payload … |
| `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/src/hooks/integrations/__tests__/useTalkXSegments.test.ts` | 43 | rulesToPostgrest · fails closed instead of dropping an unknown rule · keeps a valid rule as a PostgREST filter · escapes a trailing backslash before quoting, so the filter string cannot stay open … |
| `src/components/catalog/__tests__/ExternalProductManagement.test.tsx` | 43 | ExternalProductManagement · mostra o título e a contagem total de produtos · E32: chip de sync recente mostra  · E32: chip de sync com mais de 24h mostra data/hora (tom neutro) … |
| `analise-prs/resgate-261118-lote3/claude/fix-talkx-x006-test-limites-261101-2130/src/components/talkx/__tests__/TalkX.test.tsx` | 42 | useTalkX · initializes with empty campaigns · has null selectedCampaignId by default · setSelectedCampaignId updates state … |
| `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 42 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `src/components/catalog/__tests__/CatalogRail.test.tsx` | 42 | CatalogRail — E51 banner · renderiza a copy do banner e nao inclui o placeholder do mock · usa o 1o produto em destaque COM imagem (ignora destaque sem foto) · le a foto de primary_image_url (campo canonico do ExternalProduct) … |
| `src/components/catalog/__tests__/SendProductDialog.test.tsx` | 42 | SendProductDialog — Fase 7 (E72-E75 parcial) · mostra o contador de caracteres da mensagem (E73) · acima de 2000 caracteres, desabilita  · dentro do limite,  … |
| `src/components/security/__tests__/AuditLogDashboard.test.tsx` | 42 | AuditLogDashboard · Query columns · selects explicit columns instead of * for audit_logs · a lista de 200 pede ordem determinística, com desempate por id … |
| `src/hooks/__tests__/useNotificationSettings.test.tsx` | 42 | useNotificationSettings · loads settings on mount · has default settings when no user · exposes updateSettings function … |
| `src/hooks/integrations/__tests__/useTalkXInsights.test.ts` | 42 | pickBestHour (IA-167) · usa a hora em America/Sao_Paulo e expõe a amostra · abstém-se quando nenhuma hora alcança a amostra mínima · pickBestTemplate (IA-168) … |
| `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` | 42 | rulesToPostgrest · fails closed instead of dropping an unknown rule · keeps a valid rule as a PostgREST filter · escapes a trailing backslash before quoting, so the filter string cannot stay open … |
| `src/providers/__tests__/CallSessionProvider.test.tsx` | 42 | CallSessionProvider (T10) · aceite:  · openDialer emite zapp:navigate e sincroniza useNavigationHistory para voip · mantém os campos que a UI antiga consome (TelefoniaView/DialPad/ActiveCallBar) … |
| `supabase/functions/crm-integration/index.test.ts` | 42 | sidebar lookup resolves the expected RPC and logs only bounded telemetry · sidebar lookup returns 409 when the stable identity differs · intelligence lookup returns 409 when the stable identity differs · intelligence lookup resolves when the external identity matches the stable link … |
| `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 41 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 41 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 41 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | 41 | useInboxBulkActions — seleção · estado inicial: fora do modo de seleção, sem ids e sem loading · toggleSelectionMode liga e, ao desligar, limpa a seleção · toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior) … |
| `supabase/functions/connection-health-check/index.test.ts` | 41 | E24: cada conexão consulta o provedor com o token DELA, nunca com a chave global · E24: sem token próprio no Vault a instância não é consultada com a credencial de outra · E24: falha ao LER a credencial do Vault não usa a rede e registra o motivo · E25: GO logada SEM socket (Connected:false, LoggedIn:true) → degraded, nunca healthy … |
| `tests/contracts/ai-vision-classifiers-mock.contract.test.ts` | 41 | (1) visão: imagem embutida em DATA URL, download autenticado e modelo do servidor · classify-emoji baixa no servidor e envia  · classify-sticker segue a MESMA rota: data URL embutida e endpoint de visão · o endpoint do provedor de TEXTO padrão NUNCA é chamado quando a modalidade é visão … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/chat/__tests__/useForwardMessage.test.ts` | 40 | useForwardMessage — carga dos destinos ao abrir · só consulta o banco quando  · com allowGroups=false não busca a tabela de grupos · erro de rede/RLS ao buscar contatos: lista vazia, erro registrado e isLoading de volta a false … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/lib/__tests__/groupsAutoSync.test.ts` | 40 | Group Data Extraction · JID Resolution · uses id field first · falls back to jid … |
| `src/hooks/chat/__tests__/useForwardMessage.test.ts` | 40 | useForwardMessage — carga dos destinos ao abrir · só consulta o banco quando  · com allowGroups=false não busca a tabela de grupos · erro de rede/RLS ao buscar contatos: lista vazia, erro registrado e isLoading de volta a false … |
| `src/hooks/integrations/__tests__/useTalkXTemplates.test.ts` | 40 | useTalkXTemplates — listagem · carrega a lista com o select do criador e a ordem por uso/atualizacao · expoe lista vazia quando o banco responde null · propaga o erro de RLS/rede da listagem (nao engole) … |
| `src/lib/calls/adapters/__tests__/SipCallAdapter.test.ts` | 40 | SipCallAdapter — host, destino e validação do número (T09) · o host da URI vem do UA, não da sessão · é discável quando a URI resolve, e a URI leva o número com o host do UA · número malformado (a URI não resolve) não é discável … |
| `tests/contracts/ai-rate-limit-e-orcamento.contract.test.ts` | 40 | (1) sharedRateLimit: contador atômico com decisão inclusiva (IA-043) · dentro do limite → allowed · no limite EXATO → allowed (limite é inclusivo) · acima do limite → bloqueado … |
| `src/components/catalog/__tests__/ProductDetailDialog.test.tsx` | 39 | ProductDetailDialog — Fase 6 (galeria, SKU, rodapé) · mostra o contador  · com 1 imagem so nao mostra contador · seta → avanca a galeria e atualiza o contador … |
| `tests/contracts/ai-generate.contract.test.ts` | 39 | (1) interface congelada: o despacho existe com a forma do desenho · o módulo existe no caminho congelado e exporta generateWithRouting · GenerateParams carrega os 11 campos do desenho (lista pinada) · GenerateResult carrega os 10 campos do desenho (lista pinada) … |
| `tests/contracts/ai-jobs-estados-e-durabilidade.contract.test.ts` | 39 | (1) vocabulário congelado: os 7 estados nos três artefatos (IA-046) · worker  · interface  · banco: o check de ai_jobs.status contém exatamente os 7 congelados (e nada mais) … |
| `src/components/calls/__tests__/DialPad.test.tsx` | 38 | DialPad · renders all 12 dial buttons · renders sub-labels for digits 2-9 and 0 · renders number input when not in call … |
| `src/components/inbox/__tests__/template-utils.test.ts` | 38 | AVAILABLE_VARIABLES · lista as 7 variáveis oferecidas ao usuário, sem chave repetida · não oferece {{protocolo}}: não existe protocolo real e inventado é pior que nenhum · toda variável tem rótulo, exemplo e ícone … |
| `src/hooks/chat/__tests__/useScheduledReports.test.tsx` | 38 | useScheduledReports — leitura · carrega os relatórios do mais recente para o mais antigo · erro de leitura (RLS/rede) avisa o usuário e encerra o carregamento · useScheduledReports — destinatários … |
| `supabase/functions/_shared/__tests__/evolution-go-routes.test.ts` | 38 | sendText mapeia para /send/text com auth de instância · sendText traduz mentionsEveryOne e mentioned apenas quando presentes · sendMedia mapeia media→url e mediatype→type · sendWhatsAppAudio força type ptt e aceita audio ou media … |
| `src/components/talkx/__tests__/TalkX.test.tsx` | 37 | useTalkX · initializes with empty campaigns · has null selectedCampaignId by default · setSelectedCampaignId updates state … |
| `src/lib/__tests__/mediaVolumeStore.test.ts` | 37 | mediaVolumeStore · default e leitura · nasce com 80 e sem mute (E01) · mantém a identidade do snapshot quando nada muda (exigência do useSyncExternalStore) … |
| `src/services/__tests__/evolution.service.test.ts` | 37 | getEvolutionInstances · traduz a view segura: instance_name vem de  · devolve lista vazia quando a view volta vazia ou null (nunca undefined) · propaga o erro de leitura (RLS 42501) em vez de devolver lista vazia … |
| `supabase/functions/auth-login/index.test.ts` | 37 | negação por IP (403) responde ANTES de body/credenciais/efeitos · negação por país (403) não chama autenticação nem grava tentativa · erro de decisão responde 503 (indecidível, sem vazar regras) · bloqueio por país registra log_login_block com IP, país, motivo e user-agent … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/auth-login/index.test.ts` | 36 | negação por IP (403) responde ANTES de body/credenciais/efeitos · negação por país (403) não chama autenticação nem grava tentativa · erro de decisão responde 503 (indecidível, sem vazar regras) · bloqueio por país registra log_login_block com IP, país, motivo e user-agent … |
| `src/components/security/__tests__/RateLimitConfigPanel.test.tsx` | 36 | RateLimitConfigPanel · Rendering · renders title · renders description … |
| `src/features/talk-me/__tests__/TalkMeView.test.tsx` | 36 | TalkMeView · mostra os dados reais e mantém o atendimento mais antigo selecionado · navega manualmente sem autoplay e oferece fallback para áudio e cadastro incompleto · aceita uma única identidade e só abre o chat depois da confirmação do servidor … |
| `src/lib/__tests__/slaTimeline.test.ts` | 36 | slaStatusForDuration · sem duração não há situação · sem prazo válido não há situação · dentro do prazo com folga é  … |
| `src/components/email/__tests__/EmailChatThread.test.tsx` | 35 | EmailChatThread · preserva a leitura antiga, avisa sobre nova mensagem e desce sob comando · não usa rolagem animada quando movimento reduzido está ativo · lifecycle: setSelectedThreadId … |
| `src/components/inbox/__tests__/linkPreviewUtils.test.ts` | 35 | isImageUrl · aceita as extensões de imagem conhecidas · ignora maiúsculas/minúsculas · aceita quando a extensão vem antes de query string … |
| `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` | 35 | TaskCheckbox — um checkbox circular para o módulo inteiro · é CIRCULAR (D16) e alterna pelo clique · guardado: aria-checked=true, nome  · desabilitado não dispara e sai do tab … |
| `src/lib/__tests__/chartColors.test.ts` | 35 | chartColors · CHART_COLORS · has primary colors · has semantic colors … |
| `supabase/functions/send-scheduled-report/index.test.ts` | 35 | auth: sem identidade → 401 e zero lookup/Resend/service-role · auth: x-cron-secret errado → 401 sem efeito · auth: CRON_SECRET vazio → x-cron-secret não autoriza (fail closed) · auth: Bearer inválido → 401 sem efeito … |
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
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/lib/__tests__/pdfThumbnail.test.ts` | 32 | renderPdfThumbnail — pdfjs-dist só sob demanda · não carrega pdfjs-dist no import do módulo e só o carrega na primeira miniatura · não tem import estático de pdfjs-dist no arquivo-fonte (o contrato M03 varre o resto) · aponta o worker para o asset resolvido com ?url e manda os BYTES baixados ao getDocument … |
| `src/components/inbox/copilot/__tests__/RadarPanel.test.tsx` | 32 | RadarPanel CV-051 · renderiza o painel com aria-label  · renderiza versão recolhida com botão de expandir · chama onToggleCollapsed ao clicar em recolher … |
| `src/components/onboarding/__tests__/OnboardingTour.test.tsx` | 32 | TourProvider · provides default inactive state · starts tour with steps · navigates forward through steps … |
| `src/hooks/__tests__/useResourcePrefetch.test.ts` | 32 | usePrefetch · exposes prefetch function · exposes schedulePrefetch function · exposes cancelPrefetch function … |
| `src/hooks/integrations/__tests__/useGmail.test.ts` | 32 | useGmail · accounts query · retorna lista via callGmailFunction · fallback para supabase.rpc quando callGmailFunction lança … |
| `src/lib/__tests__/accessError.test.ts` | 32 | isAccessDeniedError — entradas inválidas · false para null · false para undefined · false para string … |
| `src/lib/__tests__/pdfThumbnail.test.ts` | 32 | renderPdfThumbnail — pdfjs-dist só sob demanda · não carrega pdfjs-dist no import do módulo e só o carrega na primeira miniatura · não tem import estático de pdfjs-dist no arquivo-fonte (o contrato M03 varre o resto) · aponta o worker para o asset resolvido com ?url e manda os BYTES baixados ao getDocument … |
| `src/lib/calls/__tests__/callStatus.test.ts` | 32 | normalizeStatus · mantém o status persistido  · traduz o legado completed → ended · traduz o legado ongoing → answered … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/components/inbox/__tests__/PlaybackSpeed.test.tsx` | 31 | AudioMessagePlayer - Playback Speed Controls · renders speed button with default 1x · speed button is visible for sent messages · speed button is visible for received messages … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx` | 31 | useLocationPicker · carrega o mapa e limpa o spinner no evento load · container que só aparece depois da troca de aba ainda cria o mapa e arma o watchdog · timeout do token vira mensagem de timeout e é reportado … |
| `src/components/inbox/__tests__/PlaybackSpeed.test.tsx` | 31 | AudioMessagePlayer - Playback Speed Controls · renders speed button with default 1x · speed button is visible for sent messages · speed button is visible for received messages … |
| `src/components/inbox/__tests__/useInteractiveMessage.test.ts` | 31 | useInteractiveMessage — limites do WhatsApp · aceita 3 botões e recusa o 4º com aviso · aceita 10 seções e recusa a 11ª com aviso · aceita 10 itens numa seção e recusa o 11º com aviso … |
| `src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx` | 31 | useLocationPicker · carrega o mapa e limpa o spinner no evento load · container que só aparece depois da troca de aba ainda cria o mapa e arma o watchdog · timeout do token vira mensagem de timeout e é reportado … |
| `src/components/notifications/__tests__/SoundVolumeControl.test.tsx` | 31 | SoundVolumeControl — sobe e desce o volume dos alertas · com o painel aberto, sobe o volume de 5 em 5 com a roda para cima · com o painel aberto, desce o volume de 5 em 5 com a roda para baixo · com o painel FECHADO a roda não mexe no volume (B5 — rolar a sidebar não ajusta) … |
| `src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx` | 31 | Tela 10 — configurações de agendamento (X137) · separa data e horário na parede local do fuso da campanha · o mínimo da data é hoje NO FUSO DA CAMPANHA, não hoje em UTC · salvar grava o mesmo instante e o mesmo fuso que foram lidos, com o perfil e a supressão … |
| `src/hooks/evolution/__tests__/useEvolutionApiCore.test.ts` | 31 | tempo limite: 45 s com AbortController · aborta a chamada pendurada e sobe erro em pt-BR com  · não aborta antes da hora: em 44,999 s a chamada continua em voo e o signal segue vivo · resposta que chega antes do limite não é abortada depois: o timer não sobra … |
| `src/components/gmail/__tests__/EmailComposer.test.tsx` | 30 | EmailComposer — inicialização e comportamento de envio · modo new: campo Para vazio e botão Enviar desabilitado · restaura rascunho isolado da conta e sinaliza anexos que precisam ser selecionados novamente · remove a sessão local e o draft remoto ao confirmar descarte de conteúdo restaurado … |
| `src/components/inbox/chat/motion/__tests__/chat-motion.test.tsx` | 30 | AnimatedNumber · (1) com movimento reduzido entrega o valor final na hora, em pt-BR · (2) sem redução conta de 0 até o valor EXATO (não para em  · ShimmerSkeleton … |
| `src/components/inbox/tabs/__tests__/FileCard.test.tsx` | 30 | FileCard — layout do mockup (R04, S28–S31) · S28: a linha 1 e o nome; o nome completo/tecnico fica na dica · S29: a linha 2 e so tipo · tamanho, com virgula no decimal · S30: a linha 3 e a data curta do cartao … |
| `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` | 30 | TasksKpiStrip — etapa 017 (Atrasadas) · com atrasadas: tile vermelho e subtítulo  · sem atrasadas: tile neutro e subtítulo  · TasksKpiStrip — etapa 018 (Para hoje) … |
| `src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` | 30 | useWorkItemDraft — rascunho e patch mínimo (148/149) · o rascunho nasce dos campos do item (sem alterações pendentes) · sem item o rascunho é null e salvar é no-op · patch mínimo: alterar só o título envia SÓ o título … |
| `src/lib/__tests__/supervisorPriority.test.ts` | 30 | computePriority (regras P1-P4) · P1: sem atendente há exatamente 30 min (fronteira) · P1: 29 min sem atendente NÃO é P1 (fronteira abaixo) · P1: com atendente, 30 min de espera não dispara a regra de  … |
| `tests/contracts/ai-resilience-prazos-retry.contract.test.ts` | 30 | (1) classifyFailure: transitório × permanente × estado desconhecido (IA-042) · %s → transient (pode reenviar) · %s → permanent (NUNCA reenviar) · erro de REDE (sem resposta HTTP) → transient … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/revoke-auth-sessions/index.test.ts` | 29 | global self: usuário comum pode revogar as próprias sessões sem ser admin · global de terceiro por usuário comum é recusado (403) · global de terceiro por admin é permitido (revoga por user_id) · local exige target_session_id … |
| `src/components/catalog/__tests__/ContactSelectionStep.test.tsx` | 29 | ContactSelectionStep · botão de enviar fica desabilitado sem contato selecionado · com contato selecionado, o botão habilita e mostra o nome · sem busca e sem resultados, mostra o estado vazio de  … |
| `src/components/email/__tests__/EmailContactPanel.test.tsx` | 29 | EmailContactPanel · renders only the safe company fields returned by the Email context · does not mistake a disabled CRM integration for a missing company · informs an authorized user when the explicit company link fails … |
| `src/components/inbox/tabs/journey/__tests__/JourneyStatsHero.test.tsx` | 29 | JourneyStatsHero — estrutura e dados · renderiza os dois blocos com os valores do contato e do período · mantém a grade de 2 colunas no celular e 4 no desktop nos dois blocos de cartões · com dados vazios mostra traços e estados vazios, sem quebrar … |
| `src/components/tasks/__tests__/WorkItemSheet.test.tsx` | 29 | WorkItemSheet — FASE C (etapas 23–25) · 23: abre com os 8 campos e fecha no Esc · 25: Salvar só habilita com mudança, salva o patch e fecha · 24: após preencher o motivo, salvar leva o motivo pelo move … |
| `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts` | 29 | Team Chat — autenticação · useSendTeamMessage recusa o envio sem perfil e não chega ao banco · useSendTeamMessage grava a mensagem quando há perfil · Team Chat — regras usadas pela produção … |
| `src/hooks/__tests__/useChatSearch.test.ts` | 29 | useChatSearch · returns empty results initially · searches text content after debounce · excludes deleted messages … |
| `src/hooks/chat/__tests__/useConversationActions.test.ts` | 29 | useConversationActions · archiveContact · arquiva pela RPC set_conversations_status (a mesma do /archive e do lote) e NÃO mexe no responsável · anuncia o novo estado no evento que atualiza chip/lista sem esperar refetch … |
| `src/services/__tests__/contact-bulk.service.test.ts` | 29 | emptyOutcome / pendingIds · emptyOutcome devolve listas NOVAS a cada chamada (mutar uma não afeta a outra) · pendingIds junta recusados e falhos, na ordem (recusados primeiro) · applyContactFieldUpdate … |
| `src/components/contacts/__tests__/ExternalDataIntegration.test.tsx` | 28 | useExternalEmpresas · usa a ação estreita  · não cai mais no RPC admin-only nem no select genérico · sem  … |
| `src/components/gmail/__tests__/GmailInboxView.test.tsx` | 28 | GmailInboxView · exibe estado  · renderiza a lista de threads do inbox quando há conta ativa · pasta inicial (Inbox) consulta o rótulo INBOX e não filtra em memória … |
| `src/components/layout/__tests__/Sidebar.test.tsx` | 28 | Sidebar — nav primária e grupos compartilham uma única área de rolagem · Multiplix continua entre Contatos e Catálogo, e todos os três estão dentro do mesmo container com scroll · staff SEM a permissão nomeada não vê Multiplix na nav primária (papel não basta — F25) · agente COM a permissão nomeada vê Multiplix na nav primária (F25) … |
| `src/components/ui/__tests__/VolumeDial.test.tsx` | 28 | VolumeDial — papel, nome e valores acessíveis · expõe role=slider focável com min/max/now/valuetext · usa valueLabel no centro e no texto falado quando informado · não tem violação de acessibilidade … |
| `src/hooks/system/__tests__/useGeoBlocking.test.ts` | 28 | useGeoBlocking — leitura dos dados · carrega settings e as duas listas, com ordem decrescente por created_at · lista vazia (data null) não quebra e vira lista vazia · exceção de rede na primeira leitura avisa e encerra o carregamento … |
| `supabase/functions/promogifts-catalog/index.actions.test.ts` | 28 | CT-77 sem Authorization devolve 401 e nem toca no client externo · CT-77 ação desconhecida devolve 400 Invalid request · CT-77 sem secrets do catálogo (e sem client injetado) devolve 503 CATALOG_NOT_CONFIGURED · CT-77 list_products devolve data + meta.total e aplica busca sem acento e OR de cores … |
| `supabase/functions/revoke-auth-sessions/index.test.ts` | 28 | global self: usuário comum pode revogar as próprias sessões sem ser admin · global de terceiro por usuário comum é recusado (403) · global de terceiro por admin é permitido (revoga por user_id) · local exige target_session_id … |
| `tests/contracts/ia131-audio-meme-conteudo.contract.test.ts` | 28 | (1) ai-audio-input: download AUTENTICADO e limites · baixa o objeto no endpoint autenticado e devolve base64 + formato mp3 · identidade de serviço usa a service role EXPLÍCITA (fluxo interno) · sem storageIdentity falha FECHADO, sem nenhuma rede … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/lib/__tests__/webhookStatusPriority.test.ts` | 27 | Webhook Status Priority · Null Current Status · always updates when current is null · Forward Progression … |
| `src/components/catalog/__tests__/useSendProduct.test.tsx` | 27 | useSendToContact — CT-04: caption na primeira foto, texto só sem foto · 3 fotos viram 3 mensagens (não 4), só a primeira com o texto como caption · sem foto, o texto vai como mensagem de texto (1 mensagem) · 1 foto usa o mesmo caminho de 1 mensagem (sem texto solto) … |
| `src/components/talkx/__tests__/talkxRoute.test.ts` | 27 | Talk X route contract (X052) · sem parâmetros abre a Visão geral e não normaliza nada · lê a aba e a sub-visão gravadas · tab=campaigns é alias de overview … |
| `src/hooks/analytics/__tests__/useAIStats.test.tsx` | 27 | calculateTrend — variação entre janelas · (%s -> %s) = %s/change %s/%% %s · variação abaixo de 1% é reportada como estável, sem número inventado · anterior zero com atual positivo é alta de 100% (não divisão por zero) … |
| `src/hooks/crm/__tests__/useContactsSearch.test.tsx` | 27 | useContactsSearch — parâmetros enviados ao banco · primeira carga manda os parâmetros default e NÃO manda include_legacy · trocar de aba vira contact_type_filter e volta para a página 0 · useContactsSearch — paginação e contagem … |
| `src/hooks/gamification/__tests__/useLeaderboard.test.tsx` | 27 | useLeaderboard — leitura do servidor · pede o ranking à RPC com o período corrente e o teto da equipe inteira · refaz a consulta com o período escolhido na tela · mapeia a linha da RPC para o modelo da tela … |
| `src/lib/__tests__/scenario-simulation.test.ts` | 27 | Simulação: computeChurnRisk (500 contatos aleatórios) · score sempre dentro de [0, 100] · riskLevel sempre coerente com o score · reasons nunca vazio e payload sempre completo … |
| `src/lib/journey/__tests__/model.test.ts` | 27 | KIND_TO_CATEGORY · cobre todos os tipos finos e só eles · CATEGORY_META · cobre todas as categorias e só elas … |
| `supabase/functions/_shared/__tests__/ai-response-contracts.test.ts` | 27 | análise bem formada passa e preserva os valores · sentiment fora do vocabulário canônico é rejeitado · sentimentScore em string é rejeitado (não vira 80) · sentimentScore fora da faixa 0-100 é rejeitado … |
| `tests/contracts/ai-conversation-summary-contract.test.ts` | 27 | ai-conversation-summary — sem fallback que invente análise (IA-023) · não inventa defaults numéricos para sentimento/satisfação ausentes · não usa o fallback textual que sintetizava um resumo · não aplica o default de churnRisk nem clamp em braço … |
| `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/src/hooks/gamification/__tests__/mutations.test.tsx` | 26 | useGamificationMutations — XP · credita XP pelo perfil e devolve o resultado da RPC · invalida o cache do agente depois de creditar XP · sem perfil a mutação falha antes de tocar o banco … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/chat/__tests__/useConversationActions.test.ts` | 26 | useConversationActions · archiveContact · arquiva pela RPC set_conversation_status (a mesma do diálogo de encerrar) e NÃO mexe no responsável · anuncia o novo estado no evento que atualiza chip/lista sem esperar refetch … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/lib/__tests__/rateLimiter.test.ts` | 26 | Rate Limiter · Basic Behavior · allows first request · allows up to 300 requests in a window … |
| `e2e/skins-e2e.spec.ts` | 26 | CP8 — fidelidade das 19 skins · as 19 skins aplicam as vars exatas do catálogo e a cor pintada (sidebar/fundo, ΔE76 ≤ 6) · modo claro mantém a skin: corporate, gx-classic e diversity · raio: GX trava em 10px, clássica em 14px, presets rápidos seguem livres … |
| `src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx` | 26 | VirtualizedRealtimeList — badge de canal e mini-avatar do atendente · mostra o badge do canal para Instagram, mas não para WhatsApp · esconde o mini-avatar quando a conversa é do próprio usuário logado (compara com o profile.id, não com o auth id — #349) · sem entrada no agentsMap para o assigned_to, não quebra e não mostra mini-avatar … |
| `src/components/ui/__tests__/message-reactions.test.tsx` | 26 | ReactionBadge · mostra emoji e contagem no nome acessível (plural) · usa singular no nome acessível quando é só uma reação · aria-pressed=true quando eu já reagi … |
| `src/hooks/__tests__/useSearchHistory.test.ts` | 26 | useSearchHistory · initializes with empty history · adds item to history · ignores empty queries … |
| `src/hooks/integrations/__tests__/useExternalDB.test.ts` | 26 | useExternalSelect · usa limit 50 / offset 0 por padrão e devolve os dados · repassa select, filtros, ordem, paginacao e modo de contagem · não busca quando a flag do CRM está desligada … |
| `src/lib/__tests__/quarantineStore.test.ts` | 26 | subscribe / getSnapshot · chama o listener a cada mudança e para depois do unsubscribe · mantém a mesma referência de snapshot enquanto nada muda (contrato do useSyncExternalStore) · get … |
| `src/segments/__tests__/segmentRules.test.ts` | 26 | normalizeRules · returns an empty v2 set for null input · converts numeric text to number on number fields · keeps numeric-looking text as string on text fields … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/ui/__tests__/robustez-primitivos.test.tsx` | 25 | (a) DialogContent — descrição acessível de fallback · diálogo SEM aria-describedby ganha a descrição oculta em pt-BR · diálogo com aria-describedby={undefined} de propósito NÃO ganha descrição injetada · diálogo com aria-describedby do chamador preserva o valor e não duplica … |
| `src/components/inbox/__tests__/MediaVolume.test.tsx` | 25 | volume das mídias — controle, aplicação e separação dos alertas · E38/E39: com a mídia em mudo, o alerta continua saindo no ganho de settings.soundVolume · E40: mexer no volume da mídia não cria nem altera nó WebAudio dos alertas · E38: mexer no volume da mídia não escreve nas configurações de notificação (soundVolume) … |
| `src/hooks/__tests__/useReauthentication.test.tsx` | 25 | useReauthentication · initializes with correct default state · reauthenticate succeeds with correct password · reauthenticate keeps AAL2 untouched when the session is already elevated … |
| `src/hooks/chat/__tests__/useContactMedia.test.tsx` | 25 | useContactMedia — paginacao por keyset (etapa 41) · pede 60+1 por pagina e para no fim quando a pagina vem incompleta · pagina cheia (61 linhas) tem proxima pagina e o cursor (created_at, id) entra no 2o .or() · aceite etapa 41: 201 itens em 4 paginas de 60 e o 201o aparece no fim … |
| `src/hooks/chat/__tests__/useFilesViewState.test.tsx` | 25 | useFilesViewState — preferencias (localStorage) · storage ausente: comeca no default decidido em D3 (grid, 4 colunas) · storage invalido: JSON quebrado, versao desconhecida e valores fora do dominio caem no default · sanitiza campo a campo: viewMode valido com columns invalido mantem o viewMode … |
| `src/lib/calls/__tests__/persistence.test.ts` | 25 | upsertMyCall — mapa p_* da RPC · grava a chamada tocando com os nomes exatos dos parâmetros · grava o fim com status/motivo/duração e OMITE o que não tem valor · upsertMyCall — retry idempotente … |
| `supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts` | 25 | F48 preview: cada bloco reproduz EXATAMENTE o payload do worker para o destinatario · F48 preview: conteudo com placeholders é identico ao worker para outro destinatario · F48 preview: sem blocos, cai no template do dispatch — o MESMO payload do worker atual · F48 preview: destinatario de outro dono/inexistente responde 404 nomeado … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/lib/__tests__/phoneNormalization.test.ts` | 24 | Phone Normalization · Standard JIDs · strips @s.whatsapp.net suffix · strips @g.us suffix for groups … |
| `e2e/navegacao-modulos.spec.ts` | 24 | Navegação por todos os módulos (desktop) · abre as 42 entradas mapeadas, o modo Quadro de Tarefas e a busca global sem erro de console nem requisição falha · Navegação por todos os módulos (celular 390x844) · abre as 42 entradas mapeadas pelo menu móvel, o modo Quadro de Tarefas e a busca do cabeçalho sem erro de console nem requisição falha … |
| `src/components/inbox/__tests__/ConversationTabs.test.tsx` | 24 | etapa 75 — ConversationTabs (8 abas da fusão) · renderiza as 8 abas e nenhuma aba removida · badge de Tarefas mostra tasksOpen · não renderiza badge quando o contador é zero … |
| `src/components/inbox/chat/__tests__/ChatSearchBar.test.tsx` | 24 | ChatSearchBar · renders nothing when closed · renders input and filters when open · finds messages by text content … |
| `src/hooks/__tests__/useBitrixApi.test.ts` | 24 | useBitrixApi · initializes with loading false · initializes with error null · exposes listLeads function … |
| `src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts` | 24 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · envia a mensagem pelo caminho da edge function, nunca direto para a Evolution · expõe exatamente as funções do contrato (nada a mais, nada a menos) … |
| `src/hooks/system/__tests__/useSecurityPushNotifications.test.ts` | 24 | useSecurityPushNotifications — envio do alerta · com push disponível envia notificação com IP, urgência e vibração longa · severidade baixa não exige interação e usa vibração curta · descrição ausente cai no texto padrão … |
| `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` | 24 | useMyWorkItems — Fase B · create envia created_by e assigned_to do perfil autenticado · create recusa aviso no passado (remind_in_past) sem tocar no banco · complete move para done e oferece undo … |
| `src/lib/__tests__/e2e-messaging-fixture.test.ts` | 24 | e2e/messaging.spec.ts — o spec real (R2-INF-007) · com conversa alheia em PRIMEIRO lugar envia para a fixture e nunca para ela · com a fixture no topo segue enviando (caminho feliz preservado) · sem a fixture visivel aborta sem clicar, digitar ou enviar … |
| `src/services/__tests__/navigation.service.test.ts` | 24 | NavigationService integration maturity · keeps incomplete integrations out of production-ready groups · exposes every navigation id exactly once across primary and grouped menus · preserves the full-layout contract for workspace views … |
| `supabase/functions/evolution-api/connect-go-token.test.ts` | 24 | connect: erro de rede/DNS na GO → 200 + go_unreachable (antes: 500 do catch-all) · connect: tempo esgotado no /instance/connect → 200 + go_unreachable 504 · connect: /instance/qr estoura o tempo (GO dorme 3 s no GetQr) → go_unreachable, sem lançar · connect: QR lento numa instância já pareada (sessão morta) → go_unreachable e ZERO delete/create … |
| `supabase/functions/talkx-scheduler/index.test.ts` | 24 | X015 auth: sem x-cron-secret e sem Authorization → 401 · X015 auth: x-cron-secret errado → 401 · X015 auth: x-cron-secret correto → passa e o tick sem campanhas fecha 200 · X015 auth: Authorization Bearer com a service key → passa (não é 401) … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/components/email/__tests__/EmailChatReplyBar.test.tsx` | 23 | EmailChatReplyBar · resolvedTo display · reply inbound: mostra from_address no  · reply outbound: mostra to_addresses[0] no  … |
| `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/hooks/evolution/__tests__/useEvolutionIntegrations.test.ts` | 23 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · expõe exatamente as funções do contrato (nada a mais, nada a menos) · leitura devolve o dado da edge function … |
| `src/components/catalog/__tests__/sendProductUtils.test.ts` | 23 | groupVariantsByColor · agrupa variantes pela cor e coleta thumbs sem duplicar · usa  · lista vazia retorna array vazio … |
| `src/components/contacts/__tests__/useContactFormValidation.test.ts` | 23 | useContactFormValidation — checkEmailDuplicate · debounces query by 500 ms — no call before timeout · consecutive changes within 500 ms fire only one query (last value wins) · escapes % wildcard in email passed to ilike … |
| `src/components/email/__tests__/EmailChatReplyBar.test.tsx` | 23 | EmailChatReplyBar · resolvedTo display · reply inbound: mostra from_address no  · reply outbound: mostra to_addresses[0] no  … |
| `src/components/inbox/chat/__tests__/ChatPanelHeader.test.tsx` | 23 | ChatPanelHeader · renders contact name · renders avatar fallback initials · R2-INB-030: sem sinal de presença, não afirma Online e mostra estado neutro … |
| `src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx` | 23 | ContactActionButtons · abre o dropdown de  · abre o dropdown de  · desabilita o botão de e-mail quando o contato não tem e-mail … |
| `src/components/inbox/location-picker/__tests__/SuggestionList.test.tsx` | 23 | SuggestionList — pausa de 429 (A3-04) · oferece  · espera acabada não mostra  · E57: a contagem de sugestões é anunciada em região viva (getByRole( … |
| `src/components/inbox/tabs/__tests__/AudioPlayButton.test.tsx` | 23 | AudioPlayButton (A02/D03/D04) · D03: montar não assina nem cria áudio; a URL sai no PRIMEIRO clique e o som toca · D04: mostra o tempo restante e a barra fina enquanto toca; ao terminar volta ao play · D03: erro de URL expirada renova UMA vez e volta a tocar, sem mensagem de falha … |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | 23 | talkxReportData · talkxReportSeriesFromRows · retorna array vazio para entrada vazia · agrupa 2 envios do mesmo dia em um único balde … |
| `src/hooks/__tests__/useDashboardWidgets.test.ts` | 23 | useDashboardWidgets · initializes with default widgets · all widgets have required fields · visibleWidgets only contains visible widgets … |
| `src/hooks/__tests__/useSLACalculation.test.ts` | 23 | calculateStatus · returns ok when completed on time · returns breached when completed late · returns ok with plenty of time remaining … |
| `src/hooks/calls/__tests__/useCallChannels.test.ts` | 23 | capacidadesPorCanal — VoIP · registrado e sem problema de microfone: disca, recebe e recusa · reconectando: não disca nem recebe, motivo  · conectando cai na mesma família de reconexão … |
| `src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts` | 23 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · expõe exatamente as funções do contrato (nada a mais, nada a menos) · leitura devolve o dado da edge function … |
| `src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx` | 23 | useMultiplixDispatches — leituras via edge  · useMultiplixDispatchesList chama dispatch.list com JWT e entrega as linhas · useMultiplixDispatchesList aceita a lista direta em data · useMultiplixDispatch pede o disparo por id na edge (dispatch_id no payload) … |
| `src/lib/__tests__/filesPeriod.adversarial.test.ts` | 23 | filesPeriod (adversarial) — fuso: o corte é o dia LOCAL, não a fatia UTC do ISO · premissa: a suíte roda a oeste de UTC (UTC-3) · o último milissegundo do dia local entra, mesmo com a fatia UTC já no dia seguinte · o primeiro milissegundo do dia local entra (fatia UTC ainda é o MESMO dia, em UTC-3) … |
| `src/lib/calls/__tests__/events.test.ts` | 23 | events — constantes do contrato · usa os nomes de evento do Apêndice D (novo) e do legado · events — round-trip de dispatchStartCall/onStartCall · emite CustomEvent tipado em document e entrega o payload intacto … |
| `supabase/functions/get-call-recording/index.test.ts` | 23 | T73: sem tipo na origem assume audio/mpeg · T73: repassa faixa, tamanho e suporte a ranges · T73: sem tamanho/faixa, nao inventa cabecalho · T73: audio de cliente nunca e cacheado por intermediario … |
| `tests/contracts/ai-conversation-analysis-contract.test.ts` | 23 | IA-023 · a análise não inventa dado quando a IA não devolve · não tem mais os defaults fabricados (50 / 3 /  · não sintetiza análise a partir de texto livre ( · usa o contrato numérico em vez de clamp com fallback … |
| `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/e2e/email-navy-visual.spec.ts` | 22 | rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis · workspace do Email não introduz violações axe · superfícies do Email herdam os mesmos tokens do sistema em claro e escuro · busca, ajuda e foco do diálogo funcionam por teclado … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/communication/__tests__/useCallEngineSink.test.ts` | 22 | useCallEngineSink — ponte para estado, timer e toast (T09) · status, mute e erro caem no setter/toast certos · onSession escreve a direção na REF (o sink é memoizado) e no estado · atendida liga o cronômetro e encerrada o para (nunca invertidos) … |
| `e2e/email-navy-visual.spec.ts` | 22 | rota real renderiza lista, conversa e compositor com o tema do sistema sem chamadas externas mutáveis · workspace do Email não introduz violações axe · superfícies do Email herdam os mesmos tokens do sistema em claro e escuro · busca, ajuda e foco do diálogo funcionam por teclado … |
| `src/__tests__/rls-boundary.test.ts` | 22 | RLS boundary - anon role (SELECT returns empty) · ${table}: anon SELECT returns [] (RLS filters all rows) · RLS boundary - anon role (writes blocked with 42501) · ${table}: anon INSERT -> 42501 … |
| `src/components/inbox/__tests__/CloseConversationDialog.test.tsx` | 22 | CloseConversationDialog — ações válidas por estado · estado open: oferece Encerrar e Arquivar, não oferece Reabrir · estado waiting: oferece Encerrar e Reabrir, não oferece Arquivar · estado resolved: oferece Reabrir e Arquivar, não oferece Encerrar … |
| `src/components/inbox/__tests__/StatusChips.test.tsx` | 22 | StatusChips · renderiza as contagens calculadas pelo filtro da Inbox, sem exigir a lista bruta · renders the 6 chips (no Spam — não existe no modelo) · maps  … |
| `src/components/talkx/__tests__/TalkXHealthCard.test.tsx` | 22 | TalkXHealthCard — status atual (X148) · envio recente:  · envio parado:  · sem ajuda para abrir, o card não renderiza botão sem ação … |
| `src/components/tasks/__tests__/cardAcoes.test.tsx` | 22 | FASE C2 — 28: o Sheet aberto por DnD/kebab já vem em Aguardando com o motivo pedido · 28: precisaMotivoDeEspera barra Aguardando sem motivo e libera o resto · focusField=waiting_reason inicia em Aguardando e mostra o motivo · sem focusField, um item em todo NÃO mostra o motivo … |
| `src/components/tasks/__tests__/taskComponents.test.tsx` | 22 | Tarefas — componentes dos três modos · B9: a Lista rotula as seções com acento (Amanhã, Próximas, Concluídas) · B12: Backspace NÃO apaga a tarefa, Delete apaga · etapa 15: o Quadro leva o índice de destino no onMove … |
| `src/hooks/communication/__tests__/useCallEngineSink.test.ts` | 22 | useCallEngineSink — ponte para estado, timer e toast (T09) · status, mute e erro caem no setter/toast certos · onSession escreve a direção na REF (o sink é memoizado) e no estado · atendida liga o cronômetro e encerrada o para (nunca invertidos) … |
| `src/hooks/evolution/__tests__/useEvolutionGroups.test.ts` | 22 | mapeamento ação -> payload da edge function · $name envia $action com o corpo do roteador · expõe exatamente as funções do contrato (nada a mais, nada a menos) · leitura devolve o dado da edge function … |
| `src/hooks/inbox/__tests__/chipCounts.test.ts` | 22 | countByChip — contadores pelas regras da lista · conta pelo estado persistido, não por  · exclui adiadas de todos os chips, como a lista · showAll acompanha a lista: Em atendimento passa a ser Todas … |
| `src/hooks/sip/__tests__/useSipConnection.test.ts` | 22 | useSipConnection · registers the incoming-invitation delegate on connect · SL-002: as opções do SessionDescriptionHandler exigem RTCP muxado e bundle (mídia só pela sessão DTLS) · T15: 403 no REGISTER vira  … |
| `src/hooks/tasks/__tests__/workItemMachine.test.ts` | 22 | canTransition – WIP doing · bloqueia quando doingCount >= 3 · permite quando doingCount = 2 · permite mover dentro de doing (reordenação) … |
| `src/hooks/ui/__tests__/useSwipeNavigation.test.tsx` | 22 | zona de borda · arrasto que começa fora da borda não navega · borda esquerda com histórico volta ao arrastar além do limite · borda direita com histórico avança ao arrastar para a esquerda … |
| `src/hooks/voice/__tests__/voiceActionPlan.test.ts` | 22 | navigate · navega para a seção pedida · sem seção não anuncia navegação · search … |
| `src/styles/__tests__/cp1FidelidadeCarvao.test.ts` | 22 | SL181 · CP1 ΔE — page/card/sidebar em carvão (dark) · fundo da página é #0e0e10 (ΔE = 0) — o mesmo rgb(14,14,16) do ledger CP1 · card é hsl(240 5% 10%) (ΔE = 0 contra o alvo do plano) · sidebar fica na família carvão, um degrau mais fundo que a página (ΔE ≤ 1,5) … |
| `supabase/functions/create-user/index.test.ts` | 22 | R2-AUTH-016 (a): falha no upsert de user_roles -> erro + deleteUser · R2-AUTH-016b (a2): sem role no corpo grava  · R2-AUTH-016b (a3): domínio não confiável recebe o papel pedido · R2-AUTH-016 (b): update de profiles falha -> erro + deleteUser … |
| `tests/contracts/contraste-aa-componentes.contract.test.ts` | 22 | contraste AA — o parser de tokens não pode quebrar por causa do arquivo · acha o token no SEGUNDO bloco :root (tokens.css com 2 blocos) · ignora menção ao seletor dentro de comentário · não se perde com chave aninhada dentro do bloco … |
| `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/lib/__tests__/filesPeriod.adversarial.test.ts` | 21 | filesPeriod (adversarial) — fuso: o corte é o dia LOCAL, não a fatia UTC do ISO · o primeiro milissegundo do dia local entra (fatia UTC ainda é o MESMO dia, em UTC-3) · data só com dia ( · filesPeriod (adversarial) — viradas de dia, mês e ano … |
| `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/supabase/functions/detect-new-device/index.test.ts` | 21 | extractAuthSessionId extrai session_id do claim JWT · extractAuthSessionId devolve null sem claim ou com token malformado · extractAuthSessionId ignora session_id fora do claim (só o token conta) · decideSessionUpsert atualiza linha existente da mesma sessão Auth … |
| `src/__tests__/a11y/icon-button-names.test.ts` | 21 | varredura de botões de ícone — casos sintéticos · detecta <Button size=\ · não acusa quando há aria-label · não acusa quando há title … |
| `src/components/calls/__tests__/calls-access.test.ts` | 21 | Telefonia — acesso e fronteiras (T07) · encontra a superfície de telefonia (o teste não passa por vacuidade) · nenhum arquivo da telefonia carrega a chave service_role · o hook de SIP não fala SIP direto: a fronteira é o adapter (invariante do T09) … |
| `src/components/inbox/chat/__tests__/ConversationTabs.cp8.test.tsx` | 21 | CP8 · geometria das 8 abas · a barra mantém a altura do header do painel (53px) e não volta aos 48px do plano · a aba ativa mede 36px (h-9) — dentro do alvo 36±2 do E.2 · todas as 8 abas têm a mesma altura (nenhuma aba encolhe ao ser selecionada) … |
| `src/components/inbox/tabs/__tests__/fileDisplay.card.test.ts` | 21 | formatCardDate (S22) — data curta do cartão · mesmo dia local vira  · dia anterior vira  · virada de dia 23:59 → 00:01: a mensagem das 23:59 vira  … |
| `src/components/talkx/__tests__/TalkXRecipientRowActions.test.tsx` | 21 | TalkXRecipientRowActions · renderiza  · renderiza  · NÃO renderiza  … |
| `src/components/ui/__tests__/command-palette.a11y.test.tsx` | 21 | CommandPalette — campo e lista anunciados (combobox/listbox) · não duplica option/id quando um acesso rápido também está nos recentes · o campo é combobox nomeado que aponta para a lista e para o item ativo · as setas mudam o aria-activedescendant e o aria-selected para o item seguinte … |
| `src/hooks/__tests__/useApplicableSLA.test.ts` | 21 | SLA Resolution Hierarchy · returns system default when no rules or configs exist · returns global config fallback when no granular rules match · prioritizes contact-level rule over company-level … |
| `src/hooks/business/__tests__/useClientWallet.test.tsx` | 21 | useClientWallet — carga das regras · ordena por prioridade decrescente e resolve agente e conexão por id · regra sem conexão não consulta a tabela de conexões para o join · erro de RLS na primeira leitura não derruba a tela: lista vazia e o resto carrega … |
| `src/hooks/crm/__tests__/useContactsKpi.test.ts` | 21 | aggregateKpi · conta novos30 e novosPrev30 corretamente e calcula o delta · deltaNovosPct = null quando prev < MIN_PREV 50 · deltaNovosPct = null quando não há registros em nenhuma janela e prev < 50 … |
| `src/hooks/system/__tests__/useSupabaseConnectivity.test.ts` | 21 | connectivityProbeUrl — chave pública na query (sem 401 no console) · anexa a anon key como ?apikey= (codificada) e tira barras finais da base · sem chave, cai na URL nua (comportamento antigo) · useSupabaseConnectivity — sonda leve, sem a Edge  … |
| `src/lib/__tests__/rlsConversationAccess.test.ts` | 21 | RLS real: contacts (schema resolvido das migrations) · o conjunto de policies bate com o manifest do schema real · SELECT delega ao predicado canonico can_edit_contact (dono, fila ou admin) · INSERT exige admin/supervisor OU auto-atribuicao (assigned_to = proprio perfil) … |
| `supabase/functions/_shared/__tests__/webhook-auth-gates.test.ts` | 21 | whatsapp-webhook: POST sem assinatura -> 401 antes de qualquer efeito (sem SUPABASE_URL configurada) · whatsapp-webhook: assinatura HMAC inválida -> 401 · whatsapp-webhook: replay — assinatura válida de OUTRO corpo -> 401 · whatsapp-webhook: sem WHATSAPP_APP_SECRET configurado -> 401 (falha fechada, mesmo com header bem formado) … |
| `supabase/functions/detect-new-device/index.test.ts` | 21 | extractAuthSessionId extrai session_id do claim JWT · extractAuthSessionId devolve null sem claim ou com token malformado · extractAuthSessionId ignora session_id fora do claim (só o token conta) · decideSessionUpsert atualiza linha existente da mesma sessão Auth … |
| `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | 20 | useTalkXSuppression — listagem · lista as 500 entradas mais recentes da supressao · expoe lista vazia quando o banco responde null · marca isError quando a listagem falha (RLS/rede) … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/admin/__tests__/useSupervisorQueue.test.tsx` | 20 | useSupervisorQueue — leitura e priorização · lê conversas abertas com os filtros certos, resolve nomes e ordena P1→P4 · conversas resolvidas/fechadas/deletadas não entram na fila · corta em 200 mantendo as MAIS ANTIGAS e sinaliza  … |
| `src/components/calls/__tests__/CallDialog.test.tsx` | 20 | CallDialog — aceite T21: abrir o diálogo NÃO insere em  · disca pelo provider e não toca em nenhum caminho de escrita da tabela  · não disca de novo quando a chamada já existe ( · disca UMA única vez por abertura, mesmo com  … |
| `src/components/contacts/__tests__/useContactsCRUD.test.tsx` | 20 | useContactsCRUD — edição não apaga endereço (C1) · E01 — editar só o nome preserva endereço e coordenada da linha completa · E05 — abre a edição com 1 fetch pelo id · E05 — falha do getById não perde endereço: o update não escreve os campos de endereço … |
| `src/components/gmail/__tests__/EmailThreadView.test.tsx` | 20 | EmailThreadView · chama setSelectedThreadId com thread.id no mount · chama setSelectedThreadId(null) no unmount · exibe o subject da thread no header … |
| `src/components/inbox/__tests__/AdvancedMessageMenu.menu-avancado.test.tsx` | 20 | AdvancedMessageMenu — Status/Story só para quem pode publicar · o agente (não supervisor) não vê a opção Status/Story · enquanto os papéis carregam a opção fica escondida (não pisca para o agente) · o admin vê a opção e publicar exige confirmação de que todos os contatos verão … |
| `src/components/inbox/__tests__/SLAIndicator.test.tsx` | 20 | SLAIndicator · renders nothing when first response given and within SLA · shows first response countdown when waiting for response · renders nothing after on-time response even if conversation stays open (sem SLA de resolução) … |
| `src/components/talkx/__tests__/useCampaignRowActions.test.tsx` | 20 | campaignRowActions — matriz das ações por status (X080) · rascunho: ver, editar, iniciar (com público), duplicar e excluir · rascunho sem público não oferece  · agendada: ver agendamento, editar, iniciar, duplicar, cancelar e excluir … |
| `src/hooks/__tests__/useTextToSpeech.test.ts` | 20 | useTextToSpeech · initializes with isLoading false · initializes with isPlaying false · initializes with null currentMessageId … |
| `src/hooks/admin/__tests__/useSupervisorQueue.test.tsx` | 20 | useSupervisorQueue — leitura e priorização · lê conversas abertas com os filtros certos, resolve nomes e ordena P1→P4 · conversas resolvidas/fechadas/deletadas não entram na fila · corta em 200 mantendo as MAIS ANTIGAS e sinaliza  … |
| `src/hooks/chat/__tests__/useConversationHistoryTimeline.test.ts` | 20 | buildTimeline · agrupa mensagens consecutivas do mesmo remetente em <=10min numa unica rajada · nao agrupa mensagens do mesmo remetente além de 10 minutos · agrupa eventos por dia (yyyy-MM-dd) … |
| `src/hooks/realtime/__tests__/messageTypeClassification.test.ts` | 20 | classifyMessageType · enquete vira unsupported/poll · visualização única vira unsupported/view_once · contato compartilhado vira unsupported/contact … |
| `src/lib/__tests__/offlineQueue.test.ts` | 20 | createOfflineQueue · enfileira e drena na ordem de composição (3 mensagens offline, 3 na mesma ordem) · não duplica o mesmo envio: a mesma chave continua sendo uma mensagem só · para na primeira falha e mantém a ordem para a próxima tentativa … |
| `src/services/__tests__/outbound-message.service.test.ts` | 20 | sendOutboundMessage · enqueues first and only then asks the authenticated delivery gateway to dispatch · does not dispatch when authorization or validation prevents enqueueing · foto com URL inválida: o enqueue rejeitado impede o dispatch e propaga a falha … |
| `src/utils/__tests__/notificationSounds.test.ts` | 20 | notificationSounds · playNotificationSound · plays default message sound without error · plays with chime sound type … |
| `supabase/functions/_shared/messaging/__tests__/personalize.test.ts` | 20 | personalize resolves the built-in placeholders (nome/apelido/nome_completo/empresa) · personalize {{apelido}} cai no primeiro nome quando o contato nao tem apelido · personalize built-in sem valor entra em missing e mantem o texto vazio (X020) · personalize falls back to a bracket placeholder for an unresolved variable instead of throwing … |
| `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | 19 | useTalkXSuppression — listagem · lista as 500 entradas mais recentes da supressao · expoe lista vazia quando o banco responde null · marca isError quando a listagem falha (RLS/rede) … |
| `analise-prs/resgate-261118-lote3/claude/fix-email-navy-contrast-261101-2057/src/components/inbox/__tests__/ContactDetails.mobile-iniciais-sentimento.test.tsx` | 19 | ContactDetailsResponsive — painel no celular · monta como sheet de altura definida e painel de largura total · anuncia o painel ao leitor de tela (título + descrição ligados ao diálogo) · no desktop não monta sheet — o painel lateral continua igual … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/components/inbox/__tests__/FileUploader.u4-u6-motivo-e-tokens.test.tsx` | 19 | U4 — o motivo da falha aparece em texto na fila · mostra o motivo do upload que falhou, não só o selo  · mostra o motivo do arquivo inválido (limite/tipo) também na fila · U4 — Esc e clique fora não descartam o envio em andamento … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/components/inbox/tabs/__tests__/FileDetailPanel.test.tsx` | 19 | FileDetailContent — SL-083 (G4/G5) · G5: mostra a URL assinada em lote sem pedir assinatura individual · G5: quando a URL em lote falha, renova UMA vez pelo locator durável · G4: não oferece  … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/__tests__/useQueueAnalytics.test.tsx` | 19 | useQueueAnalytics · fetches analytics data · returns daily data array · returns hourly data array … |
| `scripts/db-audit/check-catalog-fresh.test.mjs` | 19 | aceita conjuntos identicos em ordem diferente · falha quando surge coluna nova no banco · falha quando o tipo de uma coluna muda · falha quando a nulabilidade de uma coluna muda … |
| `scripts/db-audit/check-triple-parity.test.mjs` | 19 | paridade tripla verde quando as tres pernas batem (generated_at ignorado) · detecta divergencia arquivos↔ledger (sha256/count) · detecta edge em disco fora do manifesto e vice-versa · detecta grants-baseline desatualizado … |
| `src/components/calls/__tests__/NewCallPanel.test.tsx` | 19 | NewCallPanel (T56/T59/T60) · tem o segmentado VoIP/WhatsApp como radiogroup, independente das abas do historico · lembra o canal escolhido no localStorage · desabilita a opcao sem capacidade de discar … |
| `src/components/contacts/__tests__/ContactEngagementScore.test.tsx` | 19 | calculateEngagement · retorna level=hot quando recência + frequência + volume >= 70 · retorna level=warm quando score >= 40 e < 70 · retorna level=cold quando score >= 15 e < 40 … |
| `src/components/contacts/__tests__/ContactFormEndereco.test.tsx` | 19 | ContactForm — endereço · mostra os seis campos de endereço · CEP é guardado só com dígitos e exibido com máscara · CEP ignora letras e para em 8 dígitos … |
| `src/components/inbox/__tests__/ContactDetails.mobile-iniciais-sentimento.test.tsx` | 19 | ContactDetailsResponsive — painel no celular · monta como sheet de altura definida e painel de largura total · anuncia o painel ao leitor de tela (título + descrição ligados ao diálogo) · no desktop não monta sheet — o painel lateral continua igual … |
| `src/components/inbox/__tests__/FileUploader.u4-u6-motivo-e-tokens.test.tsx` | 19 | U4 — o motivo da falha aparece em texto na fila · mostra o motivo do upload que falhou, não só o selo  · mostra o motivo do arquivo inválido (limite/tipo) também na fila · U4 — Esc e clique fora não descartam o envio em andamento … |
| `src/components/inbox/__tests__/GlobalSearchFilters.test.tsx` | 19 | GlobalSearchFilters — mostra e esconde · não renderiza nada quando show é false · mostra os três grupos de filtro quando show é true · GlobalSearchFilters — filtro por tipo … |
| `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | 19 | ToolPanel — diálogo modal com teclado · expõe role=dialog, aria-modal e nome pelo título · fecha com Esc a partir do painel · prende o foco: Tab no último controle volta ao primeiro e Shift+Tab no primeiro vai ao último … |
| `src/components/inbox/contact-details/__tests__/ContactIntelligencePanel.test.tsx` | 19 | ContactIntelligencePanel — churn e melhores horários · mostra o risco de churn com nível e motivo devolvidos pelo CRM · mostra os melhores horários observados · não repete DISC, rapport nem gatilhos (já estão na seção Singu) … |
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
| `src/lib/__tests__/chunkReload.test.ts` | 19 | chunkReload — reconhecimento · reconhece as mensagens de chunk sem diferenciar maiusculas · reconhece erro nomeado ChunkLoadError sem mensagem conhecida · nao confunde erro comum com falha de chunk … |
| `src/lib/__tests__/filesPeriod.test.ts` | 19 | filesPeriod — buildPeriodRange · all (Qualquer data) e last_interaction não filtram · Hoje vai da meia-noite ao fim do dia LOCAL · Últimos 7 dias começa no início do 7º dia anterior e termina no fim de hoje … |
| `src/lib/__tests__/postLoginRedirect.test.ts` | 19 | resolverDestinoPosLogin — destino interno preservado · usa ?next= e preserva query e hash · usa state.from como Location inteiro (shape do ProtectedRoute) · aceita state.from como string … |
| `supabase/functions/_shared/observability.test.ts` | 19 | correlation: ecoa o x-request-id válido do cliente · correlation: gera UUID quando o cabeçalho não veio · correlation: valor fora do formato é descartado (não ecoa espaço/meta-caractere) · correlation: valor curto demais é descartado … |
| `supabase/functions/recover-message-media/index.test.ts` | 19 | ok — baixa da Evolução, grava a URL permanente e atualiza a mensagem · ja_permanente — já no Storage: devolve a URL e NÃO chama a Evolução · indisponivel — a Evolução não devolve bytes: não grava media_url · indisponivel — sem conexão de origem: nem resolve instância nem chama a Evolução … |
| `tests/contracts/ai-response-contracts.behavior.contract.test.ts` | 19 | IA-025 · estrutura correta passa · aceita a saída completa · aceita a saída mínima e não inventa os opcionais · IA-025 · JSON válido com valor errado é rejeitado (não corrigido) … |
| `tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts` | 19 | (1) banco: três colunas novas NULLABLE (IA-047) · (2) banco: três índices únicos PARCIAIS com o where correto (IA-047) · a migration NÃO cria índice único TOTAL sobre a coluna nova (risco de colisão com histórico) · (3) banco: aditivo, idempotente, com rollback e sem transação explícita … |
| `tests/contracts/requireauth-network-policy.contract.test.ts` | 19 | canonicalEndpointFromUrl — endpoint canônico estável a partir da URL · extrai o nome da função do gateway /functions/v1/<nome> · descarta sub-path e devolve só o nome da função · usa o primeiro segmento quando não há a barra functions/v1 … |
| `tests/contracts/sl059-ia010-provisionamento.contract.test.ts` | 19 | SL-059 / IA-010 — ambiente de ensaio provisionável sem tocar produção · o gerador existe no repositório e o plano cobre o §2 da IA-010 · todo registro nasce marcado: prefixo ENSAIO-, domínio de teste e faixa de telefone própria · nenhum dado pessoal real: sem CPF/CNPJ e sem telefone repetido no plano … |
| `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` | 18 | TalkXSegments · painel  · mostra  · Esc fecha o painel e devolve o foco à linha da tabela · o ✕ fecha o painel e devolve o foco à linha … |
| `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/gmail-oauth/index.test.ts` | 18 | get-auth-url sem state responde 400 e não registra tentativa · get-auth-url com state registra a tentativa vinculada ao usuário e devolve a URL · exchange-code sem state responde 400 sem tocar no Google · exchange-code com state divergente/não registrado responde 403 sem tocar no Google … |
| `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/src/hooks/__tests__/useIncomingCallListener.test.tsx` | 18 | useIncomingCallListener · subscribes to notifications scoped to the authenticated user · shows one ringing call from notification metadata and deduplicates replay · propagates the real call id from notification metadata (not the notification row id) … |
| `src/components/automations/__tests__/AutomationEditorDialog.test.tsx` | 18 | AutomationEditorDialog — estado por registro (R2-MOD-001) · mostra os dados do registro aberto · ao trocar de registro (mesmo componente montado), não reaproveita o estado do anterior · ao abrir  … |
| `src/components/groups/__tests__/GroupsView.test.tsx` | 18 | GroupsView · renders the page title · shows empty state when no groups · renders groups when data loads … |
| `src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx` | 18 | InboxSavedFiltersMenu — filtros salvos do inbox · lista vazia: orienta e mantém  · aplicar: o conteúdo do preset chega ao onApply e o menu fecha · salvar: grava o filtro que está na tela, com o nome digitado … |
| `src/components/inbox/chat/__tests__/SendErrorBanner.test.tsx` | 18 | SendErrorBanner · sem falha não renderiza nada · com 2 mensagens em falha mostra o alerta e reenvia o texto da última falha de texto · o botão de reenvio vira spinner e depois check de enviado … |
| `src/components/inbox/tabs/__tests__/FilesTab.test.tsx` | 18 | FilesTab · etapa 16: a grade vem do mapa literal de colunas, sem breakpoint de viewport · renderiza os chips com as contagens reais por tipo · #144/OTH-002: erro na contagem mostra indisponível, nao um zero confirmado … |
| `src/components/talkx/__dev__/__tests__/TalkXKit.test.tsx` | 18 | TalkXKit — prancha de referência (X055) · sem ?talkxState= não mostra a faixa de estado forçado, mas monta as três seções · a seção de modais críticos desenha os 5 presets · ?talkxState=${estado} força o título  … |
| `src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx` | 18 | TalkXQueryBoundary (matriz de estados — X047) · carregando: mostra o esqueleto e marca aria-busy · erro: mostra o erro e NUNCA o vazio (nem com a lista vazia) · negacao do banco (42501): mostra  … |
| `src/hooks/__tests__/useChatKeyboardNavigation.test.ts` | 18 | useChatKeyboardNavigation · initializes with no selected message · initializes with isNavigating false · exposes exitNavigationMode function … |
| `src/hooks/__tests__/useIncomingCallListener.test.tsx` | 18 | useIncomingCallListener · subscribes to notifications scoped to the authenticated user · shows one ringing call from notification metadata and deduplicates replay · propagates the real call id from notification metadata (not the notification row id) … |
| `src/hooks/__tests__/useWarRoomAlerts.test.tsx` | 18 | useWarRoomAlerts · fetches unread alerts · exposes dismissAlert function · accepts soundEnabled parameter … |
| `src/hooks/chat/__tests__/useAutomationSuggestions.test.tsx` | 18 | useAutomationSuggestions · não vai à Edge quando a última mensagem é do agente (lastInboundMessageId nulo) · chama a Edge com o contact_id e expõe as sugestões do contrato, com a fonte carimbada · espera o debounce antes de chamar (mensagem que ainda está chegando não gasta IA) … |
| `src/hooks/chat/journey/__tests__/useJourneyActors.test.tsx` | 18 | useJourneyActors — regras de quem agiu (S063) · usuário com perfil: nome e foto do perfil, em UMA consulta em lote · perfil ausente:  · erro/RLS negado não lança: o ator cai no  … |
| `src/hooks/communication/__tests__/useTranscriptionNotifications.filtros.test.ts` | 18 | sinalDeConclusao — não depende de payload.old · sem sinal de recência, evento com old só de id não é conclusão · carimbo antigo não passa; carimbo de agora passa · fronteira da janela (~30 s): 45 s já é antigo; 5 s ainda é recente … |
| … +2420 linhas — lista completa em `context.json` | | |

## L. Eventos de webhook tratados (contratos com sistemas externos)

| Evento | Arquivo |
|---|---|
| `delete` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| `update` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| `string` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
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
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/inbox/useInboxBulkActions.ts` |
| `sendWhatsAppAudio` | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useKnowledgeBase.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/chat/useTeamChatNotifications.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/communication/useAudioMemes.ts` |
| `enqueue(` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/lib/offlineQueue.ts` |
| `enqueue(` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/services/outbound-message.service.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/inbox/useInboxBulkActions.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude/kind-gates-87mwoe/src/hooks/integrations/useKnowledgeBase.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/magical-pasteur-iz2pgy/src/hooks/chat/useTeamChatNotifications.ts` |
| `enqueue(` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/ci/e2e-isolated-provider-readiness.unit.mjs` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/test-e2e-suite-completa-261104-1428/scripts/e2e-isolated/run.mjs` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/test-e2e-tls-diagnostico-261104-1340/scripts/e2e-isolated/run.mjs` |
| `notify` | `analise-prs/resgate-261118-lote3/claude/test-e2e-webkit-tls-261104-1430/scripts/e2e-isolated/run.mjs` |
| `notify` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/chat/useTeamChatNotifications.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/claude_05/festive-carson-ub43wu/src/hooks/integrations/useKnowledgeBase.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/claude_pink/cool-dijkstra-xk9ek2/scripts/db-audit/check-migration-drift.mjs` |
| `invoke(` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/scripts/ci/docs-estado-registry-convention.unit.mjs` |
| `notifyOptedIn` | `analise-prs/resgate-261118-lote3/codex/publish-followup-20261021/supabase/functions/connection-health-check/index.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/src/hooks/inbox/useInboxBulkActions.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `notifyOptedIn` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/connection-health-check/index.ts` |
| `sendWhatsAppAudio` | `analise-prs/resgate-261118-lote3/fix/ci-verde-261021/supabase/functions/evolution-api/index.ts` |
| `notify` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/_shared/evolution-webhook-handlers.ts` |
| `notifyOptedIn` | `analise-prs/resgate-261118-lote3/fix/ci-workflows-vermelhos/supabase/functions/connection-health-check/index.ts` |
| `invoke(` | `analise-prs/resgate-261118-lote3/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423/src/components/settings/AIAutoTagsConfig.tsx` |
| `invoke(` | `analise-prs/resgate-261118-lote3/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c/src/components/settings/AIAutoTagsConfig.tsx` |
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
| `.add('high-contrast'` | `src/components/theme/HighContrastProvider.tsx` |
| `.add('large-text'` | `src/components/theme/HighContrastProvider.tsx` |
| `.add('reduced-motion'` | `src/components/theme/HighContrastProvider.tsx` |
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
| `invoke(` | `src/hooks/dashboard/useScheduledReportConfigs.ts` |
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
| `notify` | `src/lib/whatsapp/sendConnection.ts` |
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
| bundle-budget lista os chunks iniciais; vendor-radix nao pode | `vite.config.ts` |
| sem esta regra cai num chunk "dist-*" importado pelo ChatPanel. | `vite.config.ts` |
| carga 33 e mais de 5 s com a maquina em carga 46-51 — ou seja, reprovava por PRAZO e nao | `vitest.contracts.config.ts` |
| 3139 #3140 #3141 #3142 #3144 #3145 #3147) e e exatamente o que voce deve auditar. | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-pr.js` |
| 3139 #3140 #3141 #3142 #3144 #3145 #3147 #3149 #3150) e e exatamente o que voce deve auditar. | `analise-prs/resgate-261115/auditoria/ferramentas/auditar-veredito.js` |
| 100)}% vs commit base (limite: 30%)`, | `analise-prs/resgate-261118-lote2/scripts/ci/claude-md-guard.mjs` |
| 1. ledger com cabeçalho '--' no bruto (run 37355980323) → deve passar | `analise-prs/resgate-261118-lote2/scripts/db-audit/verify-ledger-statements.unit.mjs` |
| Se o parse falhar, o motivo deve ser claro (JSON inválido), não silencioso | `analise-prs/resgate-261118-lote2/scripts/db-audit/verify-ledger-statements.unit.mjs` |
| * E97-E99: Team Chat DB validation script. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/scripts/team-chat-db-validate.mjs` |
| Verifies required tables and RPC are accessible via the Supabase REST API. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/scripts/team-chat-db-validate.mjs` |
| * `created_at`/`purchased_at` inválido não pode derrubar a lista: vira '—'. */ | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| Trava de duplo clique: o insert em voo não pode ser disparado de novo. | `analise-prs/resgate-261118-lote3/claude/busy-cannon-40szm9/src/components/inbox/ContactPurchasesPanel.tsx` |
| a evidência de uma etapa não pode ser trocada pelo texto de outra (foi o defeito da E13). | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| limite de evidência/i); | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| *${id}**`)), `${id} deve estar medido na tabela de abertura`); | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| (ex.: playwright@1.63.0) em chamadas de assert. Versão deve ser lida do bun.lock. | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| W95: CONTRIBUTING.md deve referenciar o stack e o fluxo atuais | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| W32 — docs/MIGRATIONS.md deve ter a secao "Fluxo diario (lote)" com os termos obrigatorios | `analise-prs/resgate-261118-lote3/claude/feat-E90-main-failure-notify-261101-1730/scripts/ci/ci-docs-baseline.unit.mjs` |
| CV-111–120: calculadora de prazo — extrai prazo pedido e monta rascunho de proposta. | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-deadline-calculator/index.ts` |
| CV-081–090: âncora de preço — enquadra valor, sugere desconto máximo permitido. | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edge-fases8-10-261024-1700/supabase/functions/ai-price-anchor/index.ts` |
| ── Fase 9 (CV-081-090) — Catálogo, Prazo, Orçamento ───────────────────────── | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/index.ts` |
| * CV-083 — Calculadora de prazo real. | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useDeadlineCalculator.ts` |
| Resultado AI: async via edge `ai-deadline-calculator` (invocar `analyze()`). | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-edges-261101-1330/src/hooks/copilot/useDeadlineCalculator.ts` |
| * CV-083 — Calculadora de prazo real. | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useDeadlineCalculator.ts` |
| Resultado AI: async via edge `ai-deadline-calculator` (invocar `analyze()`). | `analise-prs/resgate-261118-lote3/claude/feat-copiloto-hooks-261101-1500/src/hooks/copilot/useDeadlineCalculator.ts` |
| E75: qualquer literal é violação — o YAML deve usar ${{ env.* }} lido do toolchain. | `analise-prs/resgate-261118-lote3/claude/feat-e75-toolchain-env-281028-0600/scripts/ci/check-workflow-pins.mjs` |
| "stripInstanceToken declarado em escopo de módulo"; aqui verificamos apenas que existem. | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| O SELECT+maybeSingle antigo (check-then-act) não pode voltar. | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| amigável e não pode acionar compensação na GO (nada foi criado lá ainda). | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| proxyToEvolution devolve error:true tanto pra erro de negocio da GO | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| =/, "TOKEN_KEYS não pode estar dentro de create-connection — precisa ser de módulo"); | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| =/, "stripInstanceToken não pode estar dentro de create-connection"); | `analise-prs/resgate-261118-lote3/claude/feat-evolution-rotas-pendentes-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| iniciado e o resultado é ambíguo — não oferecer reenvio cego. O operador deve | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/SendErrorBanner.tsx` |
| de correção manual — o RPC resolve_unconfirmed_message valida a permissão no banco. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/src/components/inbox/chat/UnconfirmedMessagesPanel.tsx` |
| * Casa com a MESMA regra de public.talkx_match_optout: `exact` tem prioridade, | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| Avatar apontando para o CDN do WhatsApp (URL expira) precisa ser re-buscado. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| permissão de envio). O webhook roda com a service key (`service_role`) e | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| * Efeito incerto (5xx/tempo/id ausente): reconciliação SOMENTE-LEITURA, sem reenvio. */ | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| a enfileira e entrega no mesmo pipeline oficial. No máximo uma vez por 24 h, | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| e o processamento da mensagem recebida segue (a ausência não pode derrubar o | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| QUALQUER erro (função inexistente, sem permissão) = NÃO enviar. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| * Efeito incerto (5xx/tempo/id ausente): reconciliação SOMENTE-LEITURA, sem reenvio. */ | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| lança: a resposta automática não pode derrubar o webhook. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| PK-09: carteira por regra no contato que CHEGA. A tela da carteira promete | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| anunciar envio. Um 4xx/5xx não pode virar "Confirmacao enviada" no log: | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| (o contato acabou de pedir para sair). NUNCA lança: falha aqui não pode | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-messages.ts` |
| Use order+limit(1) so concurrent duplicates don't throw on maybeSingle. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| Use order+limit(1) so concurrent duplicates don't throw on maybeSingle. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| Use order+limit(1) so concurrent duplicates don't throw on maybeSingle. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| Use order+limit(1) so concurrent duplicates don't throw on maybeSingle | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/_shared/evolution-webhook-msg-handlers.ts` |
| * true SOMENTE quando o POST já saiu e a confirmação falhou: não reenvie cego. */ | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| * Limite de envios do próprio Zapp (não é recusa do provedor). */ | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| dessa migration, e a função não pode depender dela. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| * IA-047: enfileira a RECONCILIAÇÃO (somente-leitura, idempotente, SEM reenvio) | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| ambíguo, enfileira a RECONCILIAÇÃO (somente-leitura, sem reenvio). | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| IA-047: temos o id do provedor — o varredor confirma por ele, SOMENTE-LEITURA. | `analise-prs/resgate-261118-lote3/claude/feat-message-delivery-post-iniciado-261101-1937/supabase/functions/message-delivery/index.ts` |
| Antes so o `data` era lido: qualquer falha (disparo removido, sem permissao, | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/multiplix/MultiplixMonitor.tsx` |
| F80: CARREGANDO tambem nao e vazio — a primeira pagina em andamento nao pode | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/multiplix/MultiplixMonitor.tsx` |
| (`prefers-reduced-motion` desliga) — regra de efeito sutil do projeto. | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/multiplix/MultiplixMonitor.tsx` |
| talkxHealth.ts — X148: regra pura da "Saúde da Campanha" (acompanhamento da campanha). | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| AQUI, no cliente, das mesmas evidências que a regra do motor usa no banco: | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| sem envio há mais que o maior entre 3 min e 3×(intervalo máximo + digitação); | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| // A regra vive fora do .tsx porque o lint (react-refresh/only-export-components) só | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| * Estados do worker — o mesmo conjunto que a regra do motor classifica no banco. */ | `analise-prs/resgate-261118-lote3/claude/feat-pausa-entrega-campanhas-261101-1400/src/components/talkx/tracking/talkxHealth.ts` |
| * Máximo de mensagens novas enviadas ao modelo por tick. */ | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| Sanitiza deadline inválida antes de usar em patch ou prompt tier2. | `analise-prs/resgate-261118-lote3/claude/feat-radar-motor-telas-261101-1330/supabase/functions/_shared/copilot-tick.ts` |
| yet. It is safe to keep the current editor alive, but a reload must still | `analise-prs/resgate-261118-lote3/claude/feat-talkx-x054-cmdk-261108-0100/src/components/talkx/TalkXView.tsx` |
| deve ganhar acesso a segredo só porque o YAML mudou. Todo invariante aqui é | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| Reforça o invariante central: código de PR de terceiro não pode alcançar | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| job que instala apenas Chromium (e2e-talkx.yml) satisfaz o job que precisa de | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| seed mínimo em CI para a suíte logada". **Avaliado neste repositório e NÃO | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| 4. um "seed mínimo" teria de recriar `profiles`/`user_roles`/contatos/ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| não pode entrar em silêncio num PR: estes casos obrigam a revisitar a decisão | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| Corpo de `run: \|` é shell, não YAML — não pode virar cabeçalho de job. | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/scripts/ci/workflow-contracts.unit.mjs` |
| apenas consumimos o contrato — nenhuma consulta e feita neste componente. | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/inbox/chat/ChatMessagesArea.tsx` |
| lendo e nada pode mover o scroll. Mesmo limite do painel de equipe. */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/inbox/chat/ChatMessagesArea.tsx` |
| * Dias inteiros desde uma data ISO (o relógio fica fora do render — regra de pureza). */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/components/talkx/TalkXTemplates.tsx` |
| * Peso de prioridade (menor = primeiro) — usado na ordenacao por prazo (etapa 49) e por coluna. */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * R2-MOD-058 — regra ÚNICA de "prazo vencido" do módulo de Tarefas. O app grava | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| dois tipos de prazo (`temHora`) e cada um vence de um jeito: | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * Antes o badge do menu comparava o prazo com o instante e o módulo (KPI, seções | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| regra do `splitDoneByRecency` do Quadro ("tarefa nunca fica escondida por | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * Casa o prazo de um item com o recorte escolhido (etapa 024/037). | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| `today` segue o veredito de `bucketByDue`: é o prazo de hoje SEM contar o que | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * @param now âncora do recorte de prazo (injetável para o teste). | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| prazo (`primary`), alarme (`warning`) e atrasada (`destructive`). | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * prazo com hora marcada. */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * prazo de dia inteiro (sem hora). */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * Os três grupos do dia selecionado (etapa 55). Um item com prazo **e** alarme no | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * Linhas do dia: a tarefa com prazo E alarme conta UMA vez. */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| prazo · M lembretes") não podem sair do número de pontos — saem daqui. | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| "2 lembretes, 1 prazo" (a ordem e o texto da etapa 111). Sem nada no dia, | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/hooks/tasks/workItemAggregates.ts` |
| * A Edge já tem `_shared/observability.ts` (withRequestId) e `_shared/validation.ts` | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `Access-Control-Allow-Headers` de `_shared/validation.ts` neste mesmo cartão — | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| * Código de domínio (ex: `VALIDATION_ERROR`, `forbidden`). */ | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| - Envelope canônico `{ error: { code, message, fields } }` (validação estruturada) | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| `data: null`): o discriminante não pode ser remontado à mão. | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/src/lib/invokeEdge.ts` |
| days: number[] de 0 a 6, 0 = domingo }`. String JSON é aceita apenas como | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| janela (não pode cair silenciosamente no default, que é o que acontecia antes | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| "outside_weekdays"). Regra combinada com o cartão-irmão N-118 | `analise-prs/resgate-261118-lote3/claude/fix-codex-findings-161016-1906/supabase/functions/_shared/talkx-window.ts` |
| permissao push/admin). Campo ausente nao e divergencia: e ponto cego, e passa | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| W04: o GET /repos so devolve os campos de merge para quem tem permissao | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| )`, 200, 'resposta sem os campos de merge: o token nao tem permissao push/admin para le-los'); | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| comentario humano ou de outro bot depois do marcador nao pode zerar o dedupe, e um | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| marcador colado por terceiros nao pode acioná-lo (achados do Codex na PR #1920). | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.mjs` |
| Um humano (ou outro bot) comentando na issue nao pode fazer o guard voltar a | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| Apos 6 h o guard deve renovar o comentario — sem restaurar, so registrar. | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| `\n` NÃO pode forjar uma linha nova no log do workflow. | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/github-settings-guard.unit.mjs` |
| CI minimo (16/10/2026): o job `security:` (gitleaks + bun audit) foi removido. | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/security-workflow.unit.mjs` |
| O unico par de secrets exposto no ci.yml deve ser o par de chaves publicaveis | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/scripts/ci/security-workflow.unit.mjs` |
| atividade é da lista do mesmo jeito; o que o usuário não pode ver, o RLS barra. | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| nunca um `.limit()` solto, que devolveria um subconjunto arbitrário. | `analise-prs/resgate-261118-lote3/claude/fix-db-guard-pguser-261019-1430/src/hooks/integrations/useTalkXSuppression.ts` |
| E87: quarentena formal. Schema em e2e/quarantine.js; a validacao da forma e a cobranca | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| do prazo vivem em scripts/ci/check-quarantine.mjs. | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| (E2E_TEST_EMAIL/E2E_TEST_PASSWORD) e o backend de verdade. Por isso valem 2 APENAS | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| A regra e travada por scripts/ci/playwright-config-e81.unit.mjs. | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| outro SO não pode ser comparada com o render do Linux do `e2e-logado.yml`. | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| auth.spec.ts exercita a tela de login deslogada (tabs, validação de | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| formulário) e nunca deve depender do projeto "setup" — rodar só este | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| a propria porta e' o comportamento util. O que nao pode acontecer e' | `analise-prs/resgate-261118-lote3/claude/fix-e2e-workers-timeout-tests-011101-1800/playwright.config.ts` |
| "stripInstanceToken declarado em escopo de módulo"; aqui verificamos apenas que existem. | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| O SELECT+maybeSingle antigo (check-then-act) não pode voltar. | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| amigável e não pode acionar compensação na GO (nada foi criado lá ainda). | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| proxyToEvolution devolve error:true tanto pra erro de negocio da GO | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| =/, "TOKEN_KEYS não pode estar dentro de create-connection — precisa ser de módulo"); | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| =/, "stripInstanceToken não pode estar dentro de create-connection"); | `analise-prs/resgate-261118-lote3/claude/fix-evolution-rotas-orfas-261112/scripts/ci/evolution-edge-fixes.unit.mjs` |
| Teste unitario nunca deve alcancar banco: mesmo que o runner/CI tenha | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/ci/db-migrate-contratos.unit.mjs` |
| O aviso nao pode ir para o stdout: e' la que o workflow faz JSON.parse. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/ci/db-migrate-contratos.unit.mjs` |
| * A validacao local sempre roda. A comparacao com o ledger so e pulada quando | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| pura, violando a regra 7 da secao 1 do CLAUDE.md. Saía exit 0 com apenas | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase1-lote-banco-261020-2200/scripts/db-audit/check-migration-drift.mjs` |
| Debuggers must never reach first-party production code. Third-party | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/eslint.config.js` |
| function_logs do Supabase por console. A regra segue valendo no resto do | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/eslint.config.js` |
| prazo (data futura ISO). Projeto orfao e spec que nunca roda: o teste reprova. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/ci-e2e-projects.unit.mjs` |
| exemplo: "chromium-novo": { prazo: "2026-12-31", motivo: "issue #0000" }, | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/ci-e2e-projects.unit.mjs` |
| * Variaveis sem as quais a limpeza nao pode rodar (secret ausente = passo pulado). */ | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.mjs` |
| deste passo e nao pode entrar na assercao. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/e2e-teardown.unit.mjs` |
| diretório ausente ou sem permissão: não é motivo para derrubar o CI | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/ci/redigir-relatorio.mjs` |
| falhava. Agora 4xx = ::error:: (configuração/permissão errada é defeito real); | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| 4xx: configuração/permissão/escopo errado — `severidade: 'erro'` (GA29). | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| GA29: 4xx (endpoint/permissao/escopo) = defeito real, ::error:: com exit 1. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase23-edge-e2e-261020-2200/scripts/edge-deploy/health-check.mjs` |
| GA92: 1 GET por run estourava o limite de 1.000/h do GITHUB_TOKEN (1.014 runs em | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.mjs` |
| read/, 'nem actions: read deve ficar no topo'); | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.unit.mjs` |
| GA92: o passo do KPI nao pode derrubar o hygiene de segunda se a API | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.unit.mjs` |
| limitar (1.014 runs em 7 d > limite de 1.000/h do GITHUB_TOKEN). | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/actions-kpi.unit.mjs` |
| permissao push/admin). Campo ausente nao e divergencia: e ponto cego, e passa | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| `GET /repos` omite os campos de merge para tokens sem permissao push/admin; | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| W04: o GET /repos so devolve os campos de merge para quem tem permissao | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| )`, 200, 'nem REST nem GraphQL expuseram os campos de merge: o token nao tem permissao para le-los'); | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.mjs` |
| Um humano (ou outro bot) comentando na issue nao pode fazer o guard voltar a | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| PATCH automatico, a regra e uma so: mesma causa + janela = suprime. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| `\n` NÃO pode forjar uma linha nova no log do workflow. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/github-settings-guard.unit.mjs` |
| Esta função implementa a rotação: quando o limite é atingido, fecha a issue | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.mjs` |
| * `gh(method, path, body?)` deve ser a função que faz chamadas à API do GitHub, | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.mjs` |
| (Mesma regra do settings-guard; sem isto um number forjado quebra o log.) | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.mjs` |
| Retorna o total real, não apenas os da primeira página. | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.mjs` |
| 7"), "nova issue deve linkar para a anterior"); | `analise-prs/resgate-261118-lote3/claude/fix-ga-fase78-perimetro-custo-261020-2200/scripts/ci/issue-rotativa.unit.mjs` |
| sync so altera esse arquivo dentro de scripts/db-audit/** e nao deve redisparar o workflow. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/parity-hardening.unit.mjs` |
| DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env, | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/parity-hardening.unit.mjs` |
| DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env, | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/parity-hardening.unit.mjs` |
| DESTINO_URL (senha inclusa) nunca deve ir pro argv do psql — so pro env, | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/parity-hardening.unit.mjs` |
| psql(\s\|$)/m, `${arquivo} nao pode invocar psql: so devolve SQL ao wrapper`); | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-dbmigrate-20261021-0729/scripts/ci/parity-hardening.unit.mjs` |
| read/, 'nem actions: read deve ficar no topo'); | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/actions-kpi.unit.mjs` |
| Regra condicional do CT-73: declarar o item fechado SEM nova medicao real (no | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/catalog-ct73-docs.unit.mjs` |
| E os retries de conexao valem SO no preflight, que e somente leitura -- no | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/db-migrate-workflow.unit.mjs` |
| A validacao exporta SUPABASE_DB_URL nos outputs (supabase_db_url=) com a | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/db-migrate-workflow.unit.mjs` |
| permissao push/admin). Campo ausente nao e divergencia: e ponto cego, e passa | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| W04: o GET /repos so devolve os campos de merge para quem tem permissao | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| )`, 200, 'resposta sem os campos de merge: o token nao tem permissao push/admin para le-los'); | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| comentario humano ou de outro bot depois do marcador nao pode zerar o dedupe, e um | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| marcador colado por terceiros nao pode acioná-lo (achados do Codex na PR #1920). | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/github-settings-guard.mjs` |
| 436: os nove subintervalos de energia somam apenas nos tres grupos inteiros ya[1..3]', () => { | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/lamejs-attack-indexing.unit.mjs` |
| deve ganhar acesso a segredo só porque o YAML mudou. Todo invariante aqui é | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| CI mínimo (16/10/2026): sem trigger push no db-live-guard, não há bloco paths — contrato satisfeito. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| Reforça o invariante central: código de PR de terceiro não pode alcançar | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| job que instala apenas Chromium (e2e-talkx.yml) satisfaz o job que precisa de | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| É uma permissão elevada que só faz sentido quando o job de fato escreve no | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| seed mínimo em CI para a suíte logada". **Avaliado neste repositório e NÃO | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| 4. um "seed mínimo" teria de recriar `profiles`/`user_roles`/contatos/ | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| não pode entrar em silêncio num PR: estes casos obrigam a revisitar a decisão | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| Corpo de `run: \|` é shell, não YAML — não pode virar cabeçalho de job. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/ci/workflow-contracts.unit.mjs` |
| de migration nao pode esconder os outros checks —, entao quem decide se o | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/consolidar-veredito.mjs` |
| outro drift (migration, reset de ambiente), e a raiz deve apontar o estrutural. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/consolidar-veredito.mjs` |
| dentro dela o bash desfaz apenas \" \\ \$ \` e \<newline> (continuacao de | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| `versoes` e null apenas no ramo generico (`*)`). | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/db-audit/run-runtime-contract.mjs` |
| nunca ::error:: — o check não pode derrubar deploys por indisponibilidade de | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/edge-deploy/health-check.mjs` |
| * Fonte de verdade do estado: a avaliação verificada de P046.json (entrada somente | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| leitura). SOMENTE o estado `DONE_VERIFIED` significa etapa concluída. O marcador | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| contagem (aparece apenas como nota informativa na saída padrão). | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| * Avaliação verificada do plano (fonte canônica do estado atual). Somente leitura. */ | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| no PATH: é o que a regra S4036 exige. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| * Etapas concluídas = somente as avaliadas como `DONE_VERIFIED`. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-sonar-contracts-20261021-0726/scripts/talkx/v4-status.mjs` |
| de migration nao pode esconder os outros checks —, entao quem decide se o | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-typessync-20261021-0730/scripts/db-audit/consolidar-veredito.mjs` |
| outro drift (migration, reset de ambiente), e a raiz deve apontar o estrutural. | `analise-prs/resgate-261118-lote3/claude/fix-ga-resto-typessync-20261021-0730/scripts/db-audit/consolidar-veredito.mjs` |
| CV-081-090 — Fase 9: catálogo, prazo, orçamento | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/copilot/index.ts` |
| contato, então o anexo agendado não pode ficar fora de `<contact_id>/...`. | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/components/inbox/ChatPanel.tsx` |
| Auto-expira o mute global via timer; evita Date.now() no caminho de render. | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/hooks/copilot/useRadarPanel.ts` |
| globalMutedUntil > 0 é puro (comparação com 0). O timer acima zera quando expira. | `analise-prs/resgate-261118-lote3/claude/fix-radar-fase6-cv056-shortcuts-261108-2335/src/hooks/copilot/useRadarPanel.ts` |
| injetam um hook mínimo: o hook real sempre devolve os seis. | `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/TalkXSegments.tsx` |
| Uma condição em branco não pode ir para o banco: recusa com o número exato | `analise-prs/resgate-261118-lote3/claude/fix-talkx-segmentos-regressao-261101-1944/src/components/talkx/TalkXSegments.tsx` |
| O campo "Limite de Chats" usa type=number, mas o navegador permite apagar o | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| grupos principais da navegação). A permissão `google_calendar` era oferecida aqui e | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| `profiles.access_level` está DEPRECATED: o campo é registro, não permissão. */} | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/admin/AdminView.tsx` |
| falha (o erro é mostrado pelo boundary, o giro não pode ficar preso). | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/talkx/TalkXOverview.tsx` |
| descartada de A (que chega depois da troca para B) nao pode alterar o painel | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/components/talkx/TalkXTemplateEditor.tsx` |
| * R2-AUTH-005 (item 239): a resposta de uma busca de perfil nao pode repor | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/auth/useAuth.tsx` |
| Identidade diferente: o perfil anterior nao pode continuar na tela e so a | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/auth/useAuth.tsx` |
| Supabase pode falhar e não emitir SIGNED_OUT — a limpeza não pode depender dele). | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/auth/useAuth.tsx` |
| alertas visíveis numa consulta de APRESENTAÇÃO (limit 50) e gravava sem chave. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| fora do inbox) e não deve entrar no `mediaVolumeStore`. O volume dele é o volume de | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| SLA breach monitor — checa a cada 60 s e cria no máximo UM alerta por incidente. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/business/useWarRoomAlerts.ts` |
| (`mediaVolumeStore`), porque o atendente não pode silenciar alerta sem querer ao mexer | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| Check if user is a member of this conversation. limit(1) em vez de | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| HZ3-001: o aviso depende SÓ da permissão do navegador já concedida — o | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| silenciava quem concedeu a permissão e não assinou o push: ficava só com o | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/chat/useTeamChatNotifications.ts` |
| retomada acontece quando o conjunto encolhe no vencimento do prazo. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| Busca só em memória: telefone/nome digitado não pode ir para a URL. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| Adiamento (R2-INB-029): conversa adiada sai da listagem até o prazo vencer. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| `snoozedIds` só traz os adiamentos ainda vigentes — no vencimento o hook de | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| como "resolvida" apenas a que nunca teve nenhuma). | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| datas) e tipo de contato. A regra vive em passesExtraFilters, em | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/inbox/useInboxFilters.ts` |
| todos: dias de calendario em Sao Paulo, e nao o fuso do navegador de quem montou a regra. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| para a regra nunca oferecer categoria que o banco não guarda. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Tipos de contato e status de conversa vem das fontes canonicas: uma regra de segmento | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| e prioridade na escala EN do front. Uma regra de segmento nunca pode | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| condição nasce em branco no construtor e não pode ir para o motor. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| estimativa/PostgREST (uma regra vazia derrubaria o count para 0 e o botão para | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| de funcionar); as incompletas viram apenas a contagem que a tela exibe fora da | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| "Em breve" (lead_score/risk_score/lead_origin): a regra é completa e bem descrita | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Coluna uuid nao compara com string vazia (`eq.`): "vazio" aqui e apenas nulo. | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| vazio ainda representa a base inteira, mas uma regra inválida nunca pode ser | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| mascarado pelo servidor e a paginação percorre até `limit` (ou o fim da lista). | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| * O lote é dividido em chamadas de no máximo `BULK_ACTION_MAX_IDS` (a RPC recusa | `analise-prs/resgate-261118-lote3/claude/fix-unit-tests-src-261024-1630/src/hooks/integrations/useTalkXSegments.ts` |
| Debuggers must never reach first-party production code. Third-party | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/eslint.config.js` |
| function_logs do Supabase por console. A regra segue valendo no resto do | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/eslint.config.js` |
| read/, 'nem actions: read deve ficar no topo'); | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/actions-kpi.unit.mjs` |
| // Regra desta fila: | `analise-prs/resgate-261118-lote3/claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023/scripts/ci/fila-merge.mjs` |
| em profiles.avatar_url (o bucket é privado e a URL assinada expira). */ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| R2-AUTH-004 (item 6): desativar deve depender da operação server-side | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Guarda o caminho do arquivo (não a URL assinada, que expira) | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| Guarda o caminho do arquivo (não a URL assinada, que expira) | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/admin/useAdminData.ts` |
| gráfico diário e o ranking de agentes com apenas uma fatia. Agora a leitura | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/dashboard/useSentimentData.ts` |
| retomá-la no vencimento do prazo (R2-INB-029). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/RealtimeInboxView.tsx` |
| já com conversas não lidas não é mensagem nova e não pode ser anunciado. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/RealtimeInboxView.tsx` |
| pré-visualização. Valor desconhecido NÃO vira rótulo inventado (mesma regra | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| R2-SLA-003: a linha enviava o prazo FIXO de 5 min ao badge compacto, | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| mesmo quando uma regra granular (por contato/empresa/cargo/tipo/fila/ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| caimos no indicador com o prazo fixo anterior, sem chamar o hook e sem | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VirtualizedRealtimeList.tsx` |
| desmontado) enquanto a permissão estava pendente. Nesse caso o stream | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| O motivo real muda a ação do usuário: permissão negada, microfone | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceChangerPicker.tsx` |
| depois não pode tocar por baixo da voz nova. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/VoiceSelector.tsx` |
| Nota de voz: o gravador é o motor do PE-59/PE-24 (limite de 300 s e liberação de | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/inbox/WhisperMode.tsx` |
| Minutos sem envio entram no denominador — sem isso o prazo ficava otimista (R2-MOD-033). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| P2: deriva somente de campanhas ativas; sai da view quando concluir/cancelar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignRunning.tsx` |
| E61/E73: avisa na saída da ABA apenas quando existe alteração realmente | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignWizard.tsx` |
| então o teclado não pula validação), o foco acompanha e `aria-current="step"` | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignWizard.tsx` |
| mesmo limite bloqueia "Continuar" no hook (uma régua só, sem divergir). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXCampaignWizard.tsx` |
| falha (o erro é mostrado pelo boundary, o giro não pode ficar preso). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXOverview.tsx` |
| injetam um hook mínimo: o hook real sempre devolve os seis. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXSegments.tsx` |
| Uma condição em branco não pode ir para o banco: recusa com o número exato | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXSegments.tsx` |
| descartada de A (que chega depois da troca para B) nao pode alterar o painel | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXTemplateEditor.tsx` |
| yet. It is safe to keep the current editor alive, but a reload must still | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/TalkXView.tsx` |
| * X128 — limite do corpo da mensagem. É o mesmo teto que a RPC de rascunho/ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| aceitamos somente o instante que reconstrói exatamente a parede local. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| * Regra de tag não entra em nenhum rascunho: com o campo fora do catálogo ela | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| textual como chave irmã, que não pode viajar dentro das regras. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| * Uma regra ainda em branco não pode ir para o motor: `rulesToPostgrest` lança | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| em regra inválida (de propósito — nunca ampliar a audiência em silêncio). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| * Valor atual de uma regra simples de um campo (atalho Empresa do seletor). */ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| * Acrescenta (ou substitui) a regra de um campo no primeiro grupo. */ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| * Acrescenta a regra informada ao primeiro grupo (sem deduplicar). */ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| regra), por isso continua como estado próprio — só refina a lista. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| V26 — mesma regra do applyTemplate: a versão vem do ponteiro da coluna | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| V24 — o filtro de Empresa do seletor vira atalho para uma regra do motor: o | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| exige media_url e media_type juntos, então um tipo sem URL não pode avançar). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| O baseline deve acompanhar o último snapshot confirmado. Caso o | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| precisa ser persistida — não pode ser tratada como "sem alteração". | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/useCampaignEditor.ts` |
| cliente mínimo tipado aqui, sem `any` solto e sem eslint-disable. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/tracking/TalkXRecipientsTable.tsx` |
| Só a primeira página mostra o esqueleto: carregar mais não pode apagar a lista. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/talkx/tracking/TalkXRecipientsTable.tsx` |
| SL-016 — a busca server-side tem mínimo e teto: abaixo de 2 caracteres o | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| pode transferir (`canTransfer`, a única regra de papel) E numa conversa de | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| Abaixo do mínimo não há busca aplicada: o servidor nem é consultado e a | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| a falha da conversa A não pode aparecer na conversa B enquanto a busca de B | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| aviso de falha não pode ficar na tela por cima do resultado que chegou. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| O servidor devolve no máximo o teto: lote cheio significa "100+". | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/team-chat/useTeamChatPanel.ts` |
| estava em voo quando o debounce de 300 ms liberou a busca seguinte não pode mais virar | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/ui/command-palette.tsx` |
| cabem no celular parcial, e apagar um dígito de "98765-4321" não pode | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/ui/phone-input.tsx` |
| Teto: no máximo 9 dígitos após o DDD. | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/ui/phone-input.tsx` |
| * Extrai apenas os dígitos de uma string. */ | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/ui/phone-input.tsx` |
| - Aceita apenas dígitos | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/components/ui/phone-input.tsx` |
| * R2-AUTH-005 (item 239): a resposta de uma busca de perfil nao pode repor | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/auth/useAuth.tsx` |
| Identidade diferente: o perfil anterior nao pode continuar na tela e so a | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/auth/useAuth.tsx` |
| Supabase pode falhar e não emitir SIGNED_OUT — a limpeza não pode depender dele). | `analise-prs/resgate-261118-lote3/claude/ga-ci-verde-261020/src/hooks/auth/useAuth.tsx` |
| … +2496 linhas — lista completa em `context.json` | |
