# Regras de negócio — decididas pelo dono do produto

> Escrito por humanos (entrevista com o dono, 2026-11-03). Entra em `07-REGRAS-DE-NEGOCIO.md` seção A com
> prioridade sobre o que foi extraído do código. Cada regra diz se **já existe no código** (com a evidência)
> ou se é **decisão pendente de implementação** — agente que for mexer nesses fluxos deve respeitar a
> decisão, não o comportamento atual.

## 4. Ciclo de vida / estados e transições permitidas

### 4.1 Conversa (`contacts.conversation_status`)

| Regra | Estado | Evidência |
|---|---|---|
| Estados: `open`, `waiting`, `resolved`, `archived`. Transições permitidas: open → waiting/resolved/archived · waiting → open/resolved · resolved → open/archived · archived → open. | **existe** | `supabase/migrations/20260905090000_contacts_fsm_trigger.sql` |
| Quem muda status: admin/supervisor, ou o atendente dono da conversa / membro da fila dela (`can_edit_contact`). | **existe** | `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql` (`set_conversation_status`, `require_contact_edit_permission`) |
| Cliente manda mensagem em conversa `resolved`/`archived` → reabre sozinha: volta para `open` **com o mesmo atendente** se ela tinha dono; sem dono vai para `waiting`. Decisão do dono: manter — as conversas tendem a ficar sempre com os mesmos atendentes, e isso é desejado. | **existe** | `supabase/migrations/20261013210003_reabre_conversa_com_nova_mensagem.sql` (`trg_conversation_reopen_on_inbound`) |
| Tempo sem resposta do atendente **não** muda o status para `waiting`. Continua como está. | **decisão** (nada a implementar) | — |
| Atendente demorando além do SLA de primeira resposta → **atendente e seu supervisor são notificados**; admin em alguns casos (critério do "alguns casos" ainda não definido — ver §9). | **parcial** | alertas existem em `sla_alert_events` (`20261011180337`), visíveis para dono da conversa + admin/supervisor; minutos configuráveis em `sla_configurations` (`20261005151753`). Canal de notificação (tela/e-mail/push) e minutos padrão: pendentes (§9) |
| Conversa sem nenhuma interação (nem cliente, nem atendente) por **30 dias** → arquivada automaticamente (`archived`). Cliente que escrever depois reabre pela regra acima. | **pendente de implementação** (job `pg_cron` — DDL em produção, exige PR aberta para o dono) | hoje não há job de arquivamento (NÃO VERIFICADO em `cron.job` ao vivo; grep nas migrations não achou) |
| Fechar a mesma conversa duas vezes no mesmo dia é rejeitado. | **existe** | `supabase/migrations/20261007013217_*.sql` (`conversation_closures`) |

### 4.2 Conexão WhatsApp (`whatsapp_connections`) — regra dos três níveis

Princípio: **o atendente nunca pode mandar mensagem sem saber que a conexão caiu**, mas queda rápida não
vira alerta para ninguém. A sonda `connection-health-check` roda a cada 5 min (pg_cron) e classifica
`healthy` / `degraded` / `disconnected` com motivos `phantom_session` / `stale_session` / `webhook_silent`
(`supabase/functions/connection-health-check/index.ts`); reconexão automática por conexão usa
`auto_reconnect_enabled`, `reconnect_max_attempts`, `reconnect_interval_seconds` (migration `20261012134000`).

| Nível | Quando | O que acontece | Estado |
|---|---|---|---|
| **0 — queda rápida** | `disconnected`/`degraded` enquanto a reconexão automática ainda tem tentativas (~15 min) | Ninguém recebe push/e-mail. Na tela, conexão em **amarelo** e a caixa de mensagem avisa "sem conexão — a mensagem ficará na fila". A mensagem **entra na fila e sai quando voltar**; nada é perdido. | **pendente**: fila já aceita (`enqueue_outbound_message`, `20261010211000`, não checa saúde) mas **não há aviso nem cor na tela** (grep no inbox vazio) |
| **1 — queda confirmada** | reconexão esgotou as tentativas **ou** motivo `phantom_session` (celular desvinculou; precisa de QR Code) | **Admin e supervisores recebem push + e-mail sempre**, independentemente das preferências (`alert_on_disconnected` etc. só **adicionam** gente, nunca tiram). Atendentes da conexão veem bloqueio **vermelho**: "WhatsApp desconectado, precisa de QR Code — avise o supervisor". Envio continua enfileirado, não falha. | **pendente**: hoje alerta só vai a quem optou (`push_enabled`/`email_enabled`); bloqueio vermelho não existe |
| **2 — persistente** | > 1 h desconectada | Repete o aviso **de hora em hora para o admin**. **Campanhas Talk X dessa conexão pausam automaticamente** e retomam quando a conexão voltar a `healthy`. | **pendente**: NÃO VERIFICADO se campanha checa saúde da conexão hoje — tratar como lacuna |

Regra adicional: `degraded` (webhook mudo) conta como nível 0; se durar **mais de 30 min**, sobe para nível 1 —
webhook mudo por meia hora significa que mensagens de clientes não estão chegando, tão grave quanto não enviar.

Tempos decididos: **15 min** (esgota reconexão) · **30 min** (`degraded` vira nível 1) · **1 h** (nível 2).

## 8. Decisões já tomadas (o que NÃO mudar e por quê)

- Reabertura automática mantém o atendente anterior — o dono quer continuidade de atendimento.
- Não existe "waiting por inatividade" — `waiting` é só ação humana ou reabertura sem dono.
- Alerta de desconexão nível 1 para admin/supervisor **não é opt-out**.
- Convites de departamento: só admin cria e apaga (decisão 2026-11-01; `src/hooks/team-chat/README.md`).
- Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + telefone `^[0-9]{10,15}$` (decisão D4; `CLAUDE.md` §6).

## 9. Dúvidas em aberto (entrevista continua)

1. SLA: minutos padrão de primeira resposta e canal da notificação (tela / e-mail / WhatsApp); critério de "em alguns casos o admin".
2. Reconexão da `PRINCIPAL` após nível 1: QR Code novo é sempre ação do supervisor/admin, ou atendente também pode?
3. Talk X / campanhas: limites de envio por hora, consentimento/opt-out, horário permitido.
4. Pagamentos / planos (se houver): o que bloqueia ao inadimplir.
5. Perfis: o que exatamente `supervisor` pode além do `agent`, e o que só `admin` faz.
6. Multiempresa (`company_id`): um usuário pode pertencer a mais de uma?
7. LGPD: retenção de mensagens e mídia; o que apagar quando um contato pede exclusão.
8. Áreas congeladas: módulos que não devem ser mexidos sem o dono.
