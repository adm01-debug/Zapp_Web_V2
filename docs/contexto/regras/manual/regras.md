# Regras de negócio — decididas pelo dono do produto

> Escrito por humanos (entrevista com o dono, 2026-11-03). Entra em `07-REGRAS-DE-NEGOCIO.md` seção A com
> prioridade sobre o que foi extraído do código. Cada regra diz se **já existe no código** (com a evidência)
> ou se é **decisão pendente de implementação** — agente que for mexer nesses fluxos deve respeitar a
> decisão, não o comportamento atual.

## 2. Atores / perfis e o que cada um pode fazer

Papéis reais do sistema (enum `app_role`, `src/lib/appRole.ts:13`): **`admin` · `supervisor` · `agent`**. O rótulo `special_agent` ainda existe no enum do banco até a migration `20261113120000_remove_enum_special_agent` ser aplicada (PR aguardando o dono); nenhuma função, policy ou tela o usa.
`leader`, `owner` e `customer` **não são papéis**: `owner`/`admin`/`member` são papéis *dentro de um grupo do Team Chat*
(`team_conversation_members.member_role`, migration `20260927270019`); "líder" = supervisor. Medido em 2026-11-03:
4 admins, 3 supervisores, 4 agentes, 0 `special_agent`.

| Perfil | Pode | Não pode |
|---|---|---|
| **admin** | **Só ele** cria e remove a infraestrutura do atendimento: conexões WhatsApp, filas e membros, usuários e seus papéis (`user_roles`), horário comercial, SLA (`sla_configurations`), limites de campanha (`talkx_settings`), automações, chatbot, templates, blacklist, `app_settings`, provedores de IA, bloqueio de IP/país, logs de auditoria. **Único** que apaga dados em massa (contatos, campanhas, playbooks, logs). | — |
| **supervisor** | Tudo do agente **mais**: enxerga e intervém em **qualquer** conversa e contato (reatribui, muda status, encerra — `is_admin_or_supervisor` em ~120 funções); configura regras de SLA, automações e relatórios agendados; amplia a visibilidade de um agente (`agent_visibility_grants`); vê tentativas de login; **dispara campanhas** (`confirm_talkx_campaign_launch` → `talkx_confirm_launch_unauthorized` para quem não é admin/supervisor). | Criar ou apagar conexão, fila ou usuário; mexer em configuração global. |
| **agent** | Só o que é dele ou da sua fila (`can_edit_contact` = atendente dono **ou** membro da fila): cria contato, envia mensagem, cria/edita suas tarefas, agendamentos e **rascunhos** de campanha. | Ver ou mexer em conversa que não é sua nem da sua fila; mudar o próprio papel/permissões (`prevent_profile_privilege_escalation`); apagar contato ou mensagem; alterar qualquer configuração; **disparar** campanha. |
| **special_agent** | **Papel excluído por decisão do dono (2026-11-03).** Era agent + flag `profiles.can_download`; a flag continua existindo no agente comum (protegida por `20261012032331`). Nenhum agente de IA deve atribuir, tratar ou exibir esse papel. Já removido de funções, policies, CHECK de `profiles.role`, `effective_role`, `src/` e edges (`20261103201500`, #2692); o último resíduo — o rótulo no enum `app_role` — sai com `20261113120000_remove_enum_special_agent` (DDL em produção, PR aguardando o dono). | **removido** — 0 usuários |

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
