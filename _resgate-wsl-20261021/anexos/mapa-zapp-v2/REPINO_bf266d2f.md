# Re-pino do mapa: `2b4dac2d` → `bf266d2f` (04/10/2026)

Feito pela sessão do Claude no WSL. Só leitura; nada corrigido.

## O que mudou na `main` desde o pino do mapa
| Commit | PR | Efeito no mapa |
|---|---|---|
| `2869fc286` | #1713 | Só `STATUS.md` do Talk X (placar regenerado). Nenhum. |
| `9445dbafb` | #1886 | Remove 17 arquivos órfãos do accordion antigo do painel de contato e ajusta 2 (2.356 linhas a menos). Afeta só o tamanho da área `src/components/inbox` no MAPA_CODIGO. |
| `bf266d2f8` | #1887 | `docs/reconciliation/` fora do grafo do Graphify. Nenhum no produto. |

## Conferido
- Banco: ledger com 785 versões, igual aos 785 arquivos de migration; última versão `20261003252707`. Sem drift.
- Nenhuma migration, edge function ou workflow mudou entre os dois commits.
- Nenhum dos 17 arquivos removidos é citado nos arquivos deste mapa (nem em `dados/`).
- PRs abertos: nenhum.

## Arquivos removidos pelo #1886
- `src/components/inbox/ConversationMemoryPanel.tsx`
- `src/components/inbox/ConversationTimeline.tsx`
- `src/components/inbox/KnowledgeBaseSearchPanel.tsx`
- `src/components/inbox/LeadRiskScorePanel.tsx`
- `src/components/inbox/__tests__/ConversationMemoryPanel.test.tsx`
- `src/components/inbox/contact-details/AIInsightsWidget.tsx`
- `src/components/inbox/contact-details/AssignmentSection.tsx`
- `src/components/inbox/contact-details/ContactInfoSection.tsx`
- `src/components/inbox/contact-details/EvolutionContactProfileSection.tsx`
- `src/components/inbox/contact-details/LastActivityWidget.tsx`
- `src/components/inbox/contact-details/SLAAndAITagsSection.tsx`
- `src/components/inbox/contact-details/StoryViewer.tsx`
- `src/components/inbox/contact-details/WhatsAppStatusSection.tsx`
- `src/components/inbox/contact-details/__tests__/ContactInfoSection.test.tsx`
- `src/components/inbox/contact-details/__tests__/StoryViewer.test.tsx`
- `src/components/inbox/contact-details/__tests__/WhatsAppStatusSection.test.tsx`
- `src/hooks/integrations/useEvolutionContactProfile.ts`
