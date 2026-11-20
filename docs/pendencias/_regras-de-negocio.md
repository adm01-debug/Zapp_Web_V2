# Regras de Negócio — Zapp Web V2 (consolidado na Fase 0 do GOAL)

> Fonte: `docs/contexto/regras/manual/regras.md` (entrevista dono 2026-11-03, prioridade máxima),
> `docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md`, `10-ACESSO-E-SEGURANCA.md`. Cada regra cita evidência.

## Atores e papéis
- Papéis: `admin`, `supervisor`, `agent` (regras.md §2; RLS via `is_admin`, `is_admin_or_supervisor`,
  `has_role`, `can_edit_contact`, `effective_role`). `special_agent` EXCLUÍDO (enum sai via
  `20261113172000`, PR aguardando dono).
- Exportar/baixar = flag `can_download` do agente, não papel.
- Single-tenant: sem filtro por empresa; RLS = papel + propriedade (atendente dono/membro da fila).

## Ciclo de vida — Conversa (4.1)
- Estados: open / waiting / resolved / archived. `waiting` (humano ou reabertura sem dono) não arquiva.
- Reabertura mantém o MESMO atendente (continuidade). Fechamento automático por inatividade: DESLIGADO.
- Arquivamento automático aos 30 dias: PENDENTE.
- SLA: 15 min amarelo / 30 min vermelho, só horário comercial; push atendente+supervisor no vermelho,
  e-mail supervisor após 1 h; admin só com 3+ vermelhas na mesma fila.

## Conexão WhatsApp (4.2) — 3 níveis
- Nível 0: queda rápida. Nível 1: confirmada → push+e-mail OBRIGATÓRIOS para admin/supervisor
  (`connection-health-check`); atendente só se preferência ligada (decisão pendente: hoje todos recebem).
- Nível 2: persistente → só admin resolve. **Lacuna atual**: supervisor ainda vê/pede QR (deve ser só admin).
- Tempos: 15/30/60 min. Reconexão via QR nova (pairing-code #3290).

## Talk X / campanhas (6)
- Consentimento: `unknown`/`granted` recebem; `revoked` NUNCA recebe. `require_granted_consent=false`.
- Limite: 500 destinatários/dia por conexão; sem limite por hora.
- `business_hours_only default true` PENDENTE (hoje false).
- Envio com WhatsApp caído: hoje FALHA (não enfileira). Dúvida aberta A (manter) vs B (fila offline).
- Retomar campanha pausada: 1 clique sem confirmação (decisão 2026-11-13). Pausar/cancelar/1º disparo confirmam.

## LGPD (7) e retenção
- Retenção: 36.500 dias dos dados talkx; conversas não expiram; nenhum job de expurgo em atendimento.
- Exclusão na tela = soft-delete (`contacts.deleted_at`); purga definitiva (contato+mensagens+mídia+calls,
  registrada em `contact_deletion_audit`) é PENDENTE (só admin).
- Dados sensíveis: phones/emails/IPs em contacts, profiles, login_attempts, audit_logs, user_devices,
  ip_whitelist, blocked_ips, password_reset_requests, rate_limit_logs, security_alerts, talkx_blacklist.

## Decisões fixas (não mudar — regras.md §8)
- Pagamentos (`payment_links`, `contact_purchases`) será REMOVIDO (0 linhas). Ninguém constrói sobre.
- `company_id` é resíduo — não criar policy/tabela por tenant.
- Soft-delete generalizado: `is_active`/`deleted_at`/`archived_at`/`removed_at` em ~35 tabelas — filtrar!

## Acesso (10-ACESSO-E-SEGURANCA)
- RLS por tabela documentado em matriz (~L15); 858 arquivos usam service_role (edge functions) → RLS ignorado.
- Funções RLS-chave: `uid`, `current_profile_id`, `is_admin`, `is_admin_or_supervisor`, `has_role`,
  `can_edit_contact`, `can_manage_contacts`, `get_visible_agent_ids`, `is_contact_visible_to_user`.
- Automações de banco: `auto_assign_contact`, `auto_assign_to_queue_agent`, `prevent_profile_privilege_escalation`,
  `normalize_contact_phone`, `clear_qr_on_connect`, `log_assignment_change`, `handle_new_user(_role)`,
  `init_agent_stats`, `ensure_single_default_*`, `update_updated_at_column` (dezenas).
- Money: `agent_stats.customer_satisfaction_score DECIMAL(3,2)` ✅; `products.price`, `talkx_contact_attributes.total_spent` marcados `number` (NÃO VERIFICADO, candidato a drift).

## Limites e validações
- RLS sem policy p/ dados sensíveis: `ai_jobs`, `gmail_oauth_states`, `link_preview_cache`, `talkx_test_send_claims`.
- Front usa Zod (F.1), react-hook-form (F.2), constraints HTML (F.3) — validar em qualquer feature nova.