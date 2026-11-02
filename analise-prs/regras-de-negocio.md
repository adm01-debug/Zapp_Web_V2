# Regras de Negócio — Zapp Web V2

**Gerado em:** 2026-11-02  
**Fontes:** migrations, policies RLS, hooks, testes E2E, CLAUDE.md

---

## 1. Autenticação e Autorização

| Regra | Fonte |
|---|---|
| Todo acesso ao banco passa por RLS; `service_role` é para edges/workers | policies em `supabase/migrations/` |
| `is_admin()` = `auth.role() = 'authenticated' AND user é admin no tenant` | função RLS em migrations |
| `is_admin_or_supervisor()` = admin OU supervisor no tenant | idem |
| Sem autenticação → sem dados | RLS default DENY |
| JWT claims: `sub` = user_id, `app_metadata.tenant_id` = tenant | src/config/supabase.ts |

---

## 2. Multi-Tenancy

| Regra | Fonte |
|---|---|
| Dados isolados por `tenant_id` em toda tabela de negócio | policies RLS |
| Usuário pertence a exatamente 1 tenant no cadastro | constraint DB |
| Admin só vê dados do seu tenant | RLS `tenant_id = auth.jwt()->>'tenant_id'` |
| Nenhum cross-tenant por query direta | design RLS |

---

## 3. WhatsApp / Conexão

| Regra | Fonte |
|---|---|
| Instância WhatsApp: `PRINCIPAL` (Evolution GO) | CLAUDE.md §2 |
| Reconexão automática via health check (não poll do front) | PR #2549 |
| QR code: 3 polls × 1,5s; sem QR + jid → recria instância | CLAUDE.md §2 runbook |
| Status possíveis: connected, disconnected, reconnecting | `whatsapp_connections` |
| `whatsapp_connections` não é tocado no fluxo de reconexão | CLAUDE.md §2 |

---

## 4. Contatos

| Regra | Fonte |
|---|---|
| Contato visível = `deleted_at IS NULL AND is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'` | CLAUDE.md "Contatos" + migration 20260930450000 |
| `search_contacts(..., include_legacy=false)` aplica critério | migration 20260930450000 |
| Toggle "Mostrar legados" = `localStorage` `contact-show-legacy` | src/hooks/crm |
| KPI Total deve coincidir com aba "Todos" (mesmo filtro) | useContactsKpi |

---

## 5. Conversas / Inbox

| Regra | Fonte |
|---|---|
| Status possíveis: `open`, `pending`, `archived` | schema conversations |
| Transição `archived → open|pending` controlada por constraint | migrations |
| Chat Panel Header → "Mais ações" → "Marcar como resolvido" → CloseConversationDialog | e2e/README.md |
| Token inbox: `--inbox-panel-bg` (definido por tema em tokens.css) | CLAUDE.md "Lição de UI" |

---

## 6. Campanha / Talk X

| Regra | Fonte |
|---|---|
| Plano vigente: V4 (200 etapas X001–X200) | docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md |
| V3 substituído (PR #2482 mergeado 2026-11-01) | docs/talkx/ + progresso.json |
| `useCampaignEditor` filtra `.eq('status','connected')` | código-fonte |
| Fixtures E2E: conexão `e2e0e2e0...` status `connected`; segmento `621521f3...` | CLAUDE.md |

---

## 7. Migrations / Banco

| Regra | Fonte |
|---|---|
| Ordem obrigatória: arquivo → PR → merge → deploy → apply | CLAUDE.md §1 regra 6 |
| Migration destrutiva (DROP/RENAME/ALTER TYPE/DELETE/UPDATE em massa): nunca sem aprovação | CLAUDE.md §1 |
| Migration aditiva em produção: `db_query` + INSERT ledger na mesma transação | CLAUDE.md §1 |
| `supabase_apply_migration` está bugado — usar `db_query` direto | CLAUDE.md §1 regra 1 |
| Versão nova = `max(version) + 10000`; reservar com `reserve_migration_version()` | CLAUDE.md alocação versão |
| `statements` no ledger = SQL real e completo, sem `;` final, sem comentários | CLAUDE.md §1 regra 7 |

---

## 8. Feature Freeze (vigente desde PR #2545, 2026-11-02)

| Regra | Fonte |
|---|---|
| Somente merges de: fix de CI, fix de segurança, fix dos 9 fluxos críticos | PR #2545 |
| Features novas bloqueadas (ex.: PR #2562 feat LGPD) | progresso.json BLOQUEADO_FEATURE_FREEZE |
| 9 fluxos críticos definidos no PR #2545 | PR #2545 corpo |

---

## 9. CI / GitHub Actions

| Regra | Fonte |
|---|---|
| 6 checks obrigatórios na main: Lint & TypeCheck, Unit Tests, Build, Security Audit, Contrato DB offline, E2E Tests | CLAUDE.md perímetro |
| `strict=true` — PR deve estar atualizada com main para mergear | CLAUDE.md perímetro |
| `auto_merge=squash` — merges automáticos quando todos os checks passam | configuração repo |
| TypeCheck ratchet: baseline=93, novas=0 | baseline/BASELINE.md |
| Lint ratchet: baseline=820, novas=0 | baseline/BASELINE.md |

---

## 10. Departamentos / Convites

| Regra | Fonte |
|---|---|
| INSERT em `department_invites` restrito a admin | migration + policies |
| `create_department_invite` RPC escreve em `department_invitations` | PR #2570 |
| `accept_department_invite` RPC aceita via código normalizado | useRedeemDepartmentInvite.ts |
| SELECT em `department_invitations` para admin/supervisor | policies |

---

## 11. SINGU (sistema externo)

| Regra | Fonte |
|---|---|
| SINGU é READ-ONLY neste projeto | CLAUDE.md + goal |
| Nenhuma PR que escreva no SINGU pode ser mergeada | goal regras |
