# ADR-011 — Paridade V3 → V2 dos documentos de features (batch 1 e batch 2)

**Status:** Aceito — decisões adotadas por padrão em 12/10/2026; o dono pode vetar. O estado dos
módulos abaixo foi reconferido no código desta base em 16/10/2026.

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
| **D1** | O prazo de 1ª resposta passa a ser resolvido **pelo servidor** e a respeitar `sla_configurations` (padrão 5 min). Enquanto não existe regra personalizada, o comportamento observado não muda. | **Decidido — PB-39, ainda NÃO integrado nesta base.** O que está no repositório hoje é o `interval '5 minutes'` fixo de `register_first_response_internal` (`supabase/migrations/20260903225000_sla_first_response_v2.sql:62`); a RPC `resolve_applicable_sla` não existe em `supabase/`. |
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

## Estado atual dos módulos (conferido no código desta base em 16/10/2026)

### Negócios / CRM360
Não existe quadro Kanban de negócios: a porta de entrada "Quadro" (`view=pipeline`) foi removida na
fusão Quadro → Tarefas (E17) e `src/components/pipeline/` não existe mais. Os negócios existentes
aparecem **dentro do CRM360 do contato** (`src/components/inbox/tabs/Crm360Tab.tsx`, lista em
`src/components/inbox/tabs/OpenDealsList.tsx`), com leitura do funil (`src/hooks/crm/useContactCrm360.ts:183`,
tabela `sales_pipeline_stages`) e o botão **"Avançar etapa →"** (`Crm360Tab.tsx:178`). Não há UI de
criar/editar/excluir negócio.

### SLA
- `conversation_sla` registra o desfecho da 1ª resposta (`register_first_response_internal` e
  `mark_first_response`); o prazo aplicado hoje é o `interval '5 minutes'` fixo dessas funções — a RPC
  `resolve_applicable_sla` (D1) **não existe nesta base**.
- **Lacuna conhecida:** conversa **nunca respondida não existe** em `conversation_sla` — todos os
  escritores da tabela (migrations `20260903120000`, `20260903160000`, `20260903225000` e
  `20260903233000`) inserem `first_response_at`, então painéis e War Room só enxergam o estouro **depois**
  da resposta tardia. Falta o job que abre a linha na 1ª mensagem do cliente e marca o estouro no prazo
  (PB-40).
- **Documento enganoso, não corrigido aqui:** `docs/SLA-ESCALATION-CRON.md` (2026-04-11) descreve uma
  tabela `sla_violations` e dois `cron.schedule` que **não existem** em nenhuma migration nem Edge do
  repositório (e não há job de cron de SLA nas migrations). Trate-o como desenho antigo, não como estado.

### War Room
`src/components/dashboard/WarRoomDashboard.tsx` → `src/hooks/business/useWarRoomData.ts`. Os números por
agente vêm de `agent_stats` (`:112-114`): `avgResponseTime` e `satisfaction` caem para `0` quando a
coluna está vazia (sem escritor) e `resolvedToday` lê `conversations_resolved` **acumulado**, não o dia.
A RPC `dashboard_leaderboard` já calcula por período corretamente. Correção planejada em PB-11 a PB-13.
Fontes por card documentadas em `docs/dashboard/README.md`.

### Conexões
A Edge `evolution-api` classifica cada ação por papel em
`supabase/functions/_shared/evolution-control-authz.ts`: `CONTROL_ACTIONS` (`:41`) — criar, conectar,
desconectar, reiniciar e apagar instância, `bootstrap-instance-token`, `set-webhook`/`set-settings`/
`set-presence`, perfil da conta, escrita em grupos, etiquetas e templates, editar/apagar mensagem
(`delete-message`/`update-message`/`edit-message`/`delete-for-everyone`) e as integrações do provedor
(`set-*`/`delete-*`) — exige **admin/supervisor**; `SEND_ACTIONS` (`:105`) exige admin/supervisor **ou**
contato visível; `READ_ACTIONS` (`:135`) seguem liberadas para qualquer autenticado e incluem as consultas
`find-chats`, `find-messages`, `find-contacts`, `find-status-messages`, `get-media-base64`,
`fetch-profile*`, `find-labels`, `find-templates`, `get-catalog`/`get-collections` e os `get-*` de
integração; ação fora dos três conjuntos cai em `control` — negar por padrão
(`classifyEvolutionAction` `:190-194`).
**Lacuna aberta:** `instance-info` e `list-instances` são de leitura e devolvem o corpo do provedor **sem
remover `token`/`apiKey`/`hash`** da instância — não existe redação desses campos nesta base
(`docs/audits/AUDITORIA_PARIDADE_V3_DOC_16_2026-10-13_PARTE2_CONEXOES_CONFIG.md`). Autorização de
escrita, exclusão com trilha, redação da resposta e testes Deno das ações de conexão seguem como cartões
próprios (CN-B a CN-G).

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
