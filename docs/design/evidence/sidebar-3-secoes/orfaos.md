# Fase 0 — Diagnóstico do sidebar "Detalhes do Contato"

> Gerado em 2026-10-02, execução do plano
> `docs/design/PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md`
> (etapas 01–07). Cobre o inventário de órfãos (etapa 05), as decisões D1–D7
> (etapa 06) e as lacunas de evidência.

## 01–05. Inventário

- `localStorage` em uso pelo painel: `contact-details-accordion-state`
  (consumido só por `ContactDetails` + `contactDetailSections.ts`).
  Migração para `contact-sidebar-accordion-state@v2` implementada em
  `sidebar/sidebarSections.ts` (valores filtrados para as 3 seções novas).
- Accordion antigo (`ContactAccordionSections.tsx` + `contactDetailSections.ts`)
  removido na PR D; `grep -rn` pós-remoção: nenhuma referência.

### Órfãos (A7 do plano) — `grep -rln` por item, sem consumidores fora do accordion

| Componente | Consumidores fora do accordion |
|---|---|
| `ContactInfoSection` | nenhum |
| `WhatsAppStatusSection` | nenhum |
| `EvolutionContactProfileSection` | nenhum |
| `SLAAndAITagsSection` | nenhum |
| `ComercialSummaryWidget` | nenhum |
| `AIInsightsWidget` | nenhum |
| `LastActivityWidget` | nenhum |
| `AssignmentSection` | nenhum |
| `ConversationMemoryPanel` | nenhum |
| `LeadRiskScorePanel` | nenhum |
| `ConversationTimeline` | nenhum |
| `ContactStatsSection` | nenhum |
| `KnowledgeBaseSearchPanel` | nenhum |

Ficam vivos por outro consumidor (não remover): `AnalysisBadges`
(ChatHeader), `ContactPurchasesPanel` (OrdersTab),
`ExternalContact360Panel`/`ContactIntelligencePanel`/`Contact360Helpers`.
Remoção dos 13 na PR F (D6), após PR D ≥ 1 dia útil em produção.

## 06. Decisões adotadas (seção 6 do plano)

- **D1**: flag `crm.integration` permanece **desligada** até a Fase 9.
  Com ela off, o sidebar renderiza o estado honesto (`disabled`): seção
  Profissional mostra o fallback local do Zapp; Pessoal e Perfil Singu
  mostram o vazio por seção. Nada de dado parcial como se fosse RPC.
- **D2**: RPC nova `get_contact_sidebar_by_phone` no banco do Singu
  (PR A — `adm01-debug/Singu_V2`), acessada pela edge `crm-integration`
  com `lookup: 'sidebar'` (PR B).
- **D3**: Perfil Singu lança com estado vazio honesto (`Sem avaliação no
  Singu` / `—` por campo) — nunca inventa score.
- **D4**: sem edição inline no sidebar; linha vazia em modo fallback vira
  link "Adicionar" que abre o `EditContactDialog` existente.
- **D5**: linha do X (Twitter) sempre visível com "—" quando vazia.
- **D6**: remoção dos 13 órfãos em PR F separada (D revertível sem
  ressuscitar ~2.000 linhas).
- **D7**: contato sem vínculo no Singu (`found:false`) → estado
  `not_found` + CTA "Buscar no CRM" abrindo o `ContactCRMDialog`
  existente; ao selecionar, invalida `['contact-sidebar', id]` (a RPC
  casa por telefone — sem escrita em `crm_contact_links`).

## 07. Lacunas de evidência (honesto)

- **"Antes" (etapa 01)**: não há capturas de produção — a sessão não tem
  `E2E_TEST_EMAIL` (só `E2E_TEST_PASSWORD`) e o login errado gasta o
  lockout da conta. As capturas "depois" com a flag ligada ficam para a
  Fase 9 (flag off mostraria só os estados `disabled`/`—`, que já são
  cobertos pelos testes de componente).
- **Acesso ao banco do Singu**: a RPC (PR A) foi validada com testes SQL
  locais (~35 asserts em PostgreSQL local); o apply em produção é ação do
  Joaquim na Fase 9 (DDL gateado por merge + deploy, regra do repo).
