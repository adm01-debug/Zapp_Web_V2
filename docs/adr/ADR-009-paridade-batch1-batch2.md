# ADR-009 — Paridade V3 → V2 dos documentos de features (batch 1 e batch 2)

**Status:** Aceito — decisões adotadas por padrão em 12/10/2026; o dono pode vetar.

**Contexto.** A auditoria de paridade entre a V3 (`Zapp_Web_V3`, docs `02-features-batch1` e
`03-features-batch2`, lidos em `origin/main`) e a V2 conferiu código e banco real em 12/10/2026. A V2
está **à frente** da V3 na maior parte dos módulos auditados (criação de conexão com reserva e
compensação, autorização por ação na Edge, KPIs e ranking por RPC, notas com RLS, envio de catálogo).
Ainda assim a auditoria achou lacunas reais, várias de segurança e integridade. Este ADR registra as
decisões tomadas para elas e o que foi deliberadamente deixado de fora — para que a próxima sessão não
reabra o mesmo debate nem reintroduza o que a V2 já faz melhor.

Fonte: `docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md` (enquanto não integrado,
`~/hermes-workspaces/.assets/paridade-b1b2/`). Cada achado virou um cartão PB-01 a PB-47.

## Decisões

| # | Decisão | Estado |
|---|---|---|
| **D1** | O prazo de 1ª resposta passa a ser resolvido **pelo servidor** e a respeitar `sla_configurations` (padrão 5 min). Enquanto não existe regra personalizada, o comportamento observado não muda. | **Implementado no repositório** — PB-39, `supabase/migrations/20261013012747_sla_resolve_applicable.sql` (RPC `resolve_applicable_sla`, `:28`), consumida por `register_first_response_internal` (`:134`) e por `mark_first_response`. |
| **D2** | O **SLA de Resolução continua removido** (commit 70169c6b7, 03/09/2026). SR1/NB1 e o `alert_type` de resolution não devem ser integrados até o dono confirmar. | Decidido — nenhum cartão de reativação. |
| **D3** | Nada vai para produção por agente: migration entra no repositório com `-- Rollback:` completo; **quem aplica é o Joaquim**. | Regra vigente para todos os cartões desta trilha. |
| **D4** | As 4 funções de gamificação saem do alcance de `authenticated` — ficam `service_role` + gatilhos (o XP de verdade vem dos gatilhos de servidor). | **Implementado no repositório** — `supabase/migrations/20261012233536_gamification_revoke_client_rpcs.sql` (REVOKE de `PUBLIC, anon, authenticated` nas 4 RPCs, `:28-35`). |
| **D5** | O contador de uso de emoji sobe por RPC `SECURITY DEFINER` (atendente comum incrementa emoji alheio, que hoje a RLS de dono/admin bloqueia). | Decidido — **pendente** (depende do cartão de emojis, PB-36). |

## O que ficou fora (decisão do dono — não reabrir)

- **Tags/etiquetas** de contato ou conversa (função excluída do sistema).
- **Exportar / importar / edição em massa** — edição em massa de contatos é só do Singu. O Zapp Web não
  exporta, não importa e não permite edição em massa.
- **Ciclo de vida de negócios** (criar/editar/excluir/ganhar/perder deal): G-2 desligou a UI e
  `sales_deals` está vazia em produção. Ver §37 de `docs/COMPLETE_SYSTEM_FEATURES.md`.
- **SLA de Resolução** (D2) e **webhook externo de alerta de SLA** (`sla-alert-forward`): nada sai do
  sistema.
- **Persistir o QR no navegador**: o QR é credencial de pareamento; no máximo `connectionId` + status.
- **Widgets personalizáveis**, **aviso global de meta de fila** (`queue_goals` vazia), **CRUD de
  credenciais Evolution por instância** (a V2 usa secrets + Vault) e **A/B clássico** (remoção já
  decidida).

## Estado atual dos módulos (conferido no código desta base)

### Negócios / CRM360
Não existe quadro Kanban de negócios: a porta de entrada "Quadro" (`view=pipeline`) foi removida na
fusão Quadro → Tarefas (E17) e `src/components/pipeline/` não existe mais. Os negócios existentes
aparecem **dentro do CRM360 do contato** (`src/components/inbox/tabs/Crm360Tab.tsx`, lista em
`src/components/inbox/tabs/OpenDealsList.tsx`), com leitura do funil (`src/hooks/crm/useContactCrm360.ts:183`,
tabela `sales_pipeline_stages`) e o botão **"Avançar etapa →"** (`Crm360Tab.tsx:170`). Não há UI de
criar/editar/excluir negócio.

### SLA
- `conversation_sla` registra o desfecho da 1ª resposta; o prazo vigente vem de
  `resolve_applicable_sla` (D1). A RPC é `SECURITY DEFINER` e o `anon` está sem `EXECUTE` (`:124-126`).
- **Lacuna conhecida:** conversa **nunca respondida não existe** em `conversation_sla` — o único
  escritor sempre grava `first_response_at`, então painéis e War Room só enxergam o estouro **depois** da
  resposta tardia. Falta o job que abre a linha na 1ª mensagem do cliente e marca o estouro no prazo
  (PB-40). Conferido no banco real em 12/10/2026: `conversation_sla` sem nenhuma linha sem resposta e
  nenhum job de SLA em `cron.job`.
- **Documento enganoso, não corrigido aqui:** `docs/SLA-ESCALATION-CRON.md` (2026-04-11) descreve uma
  tabela `sla_violations` e dois `cron.schedule` que **não existem** no banco. Trate-o como desenho
  antigo, não como estado.

### War Room
`src/components/dashboard/WarRoomDashboard.tsx` → `src/hooks/business/useWarRoomData.ts`. Os números por
agente vêm de `agent_stats` (`:112-114`): `avgResponseTime` e `satisfaction` caem para `0` quando a
coluna está vazia (sem escritor) e `resolvedToday` lê `conversations_resolved` **acumulado**, não o dia.
A RPC `dashboard_leaderboard` já calcula por período corretamente. Correção planejada em PB-11 a PB-13.
Fontes por card documentadas em `docs/dashboard/README.md`.

### Conexões
A Edge `evolution-api` passou a exigir papel para as ações sensíveis (PB-05): `find-chats`,
`find-contacts`, `find-messages`, `find-status-messages`, `get-media-base64`, `get-*` de integrações
(`get-chatwoot` … `get-pusher`), `fetch-profile*`, `find-labels`/`find-templates` e
`get-catalog`/`get-collections` entraram em CONTROL (admin/supervisor) —
`supabase/functions/_shared/evolution-control-authz.ts` (`CONTROL_ACTIONS` `:44`, lists `:97-116`;
`READ_ACTIONS` `:160`). `instance-info` e `list-instances` continuam de leitura, mas **sem token/apikey/hash
da instância** no corpo (`sanitizeInstanceResponse` em `supabase/functions/evolution-api/index.ts:265`,
aplicado em `list-instances` `:507` e `instance-info` `:810-812`). Autorização, exclusão com trilha e
testes Deno das ações de conexão seguem como cartões próprios (CN-B a CN-G).

## Consequências

- Os cartões PB que ainda não foram implementados (ex.: PB-40, PB-36) **não** estão descritos como feitos
  aqui; a documentação de features aponta a lacuna e o cartão, não o comportamento desejado.
- Migration desta trilha **não** foi aplicada em nenhum banco por agente (D3): aplicar é decisão do dono.
- Os painéis de SLA e o War Room continuam mostrando o que o código atual mostra; nada aqui promete o
  comportamento corrigido antes do cartão correspondente.

## Referências

- `docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md` — veredito, escopo e ordem dos cartões.
- `docs/COMPLETE_SYSTEM_FEATURES.md` §8 (SLA), §10 (Dashboard/War Room), §14 (Conexões), §37 (CRM).
- `docs/dashboard/README.md` — fontes por card e débitos conhecidos.
- ADR-001 (webhooks por instância) e ADR-007 (Multiplix) — decisões vizinhas de conexão.
