# Plano Team Chat V3 → V2 Parity — 100 Etapas

**Status: ✅ CONCLUÍDO em 2026-09-27**

## Sumário de implementação

Paridade completa do módulo Team Chat do Zapp Web V3 aplicada ao V2.
Todas as 100 etapas implementadas e pushed na branch `claude/confident-babbage-ivgmmn`, PR #969.

### Fases concluídas

| Fase | Etapas | Descrição | Status |
|------|--------|-----------|--------|
| 1 | E01–E10 | Schema DB — tabelas `team_conversations`, `team_messages`, `team_members` | ✅ |
| 2 | E11–E20 | RLS policies e permissões | ✅ |
| 3 | E21–E30 | Hooks base — `useTeamConversations`, `useTeamMessages`, `useTeamChatMutations` | ✅ |
| 4 | E31–E50 | Componentes UI — `TeamChatPanel`, `TeamChatHeader`, `TeamMessageBubble`, `TeamChatInputArea` | ✅ |
| 5 | E51–E68 | Funcionalidades avançadas — reações, stickers, áudio, busca, departamentos, E68 locked-view | ✅ |
| 6 | E69–E73 | Analytics — `useTeamPerformance`, `TeamPerformancePanel`, `useParticipantStats`, `ParticipantStatsGraph`, render perf | ✅ |
| 7 | E74–E82 | Realtime — `useTeamUnreadCount`, `useTeamChatNotifications`, `useTeamTyping`, `useTeamPresence` | ✅ |
| 8 | E83–E90 | Design tokens CSS + acessibilidade (skip link, live region, ARIA, focus trap, reduced motion) | ✅ |
| 9 | E91–E96 | Testes unitários + i18n PT-BR | ✅ |
| 10 | E97–E100 | Script de validação DB + documentação | ✅ |

### Arquivos criados/modificados

**Schema e migrations:**
- `supabase/migrations/20260927400000_accept_department_invite_rpc.sql`

**Hooks (`src/hooks/team-chat/`):**
- `useTeamPerformance.ts` (E69)
- `useParticipantStats.ts` (E71)
- `useTeamUnreadCount.ts` (E74)
- `useTeamChatNotifications.ts` (E75/E76/E81/E82)
- `useTeamTyping.ts` (E77)
- `useTeamPresence.ts` (E78)
- `__tests__/useTeamPerformance.test.ts` (E91–E93)
- `__tests__/rls-contract.test.ts` (E94–E95)

**Componentes (`src/components/team-chat/`):**
- `TeamChatPanel.tsx` (E68 locked-view, E73 render perf — corrigido)
- `TeamPerformancePanel.tsx` (E70)
- `ParticipantStatsGraph.tsx` (E72)
- `TeamChatA11y.tsx` (E86–E90)

**Estilos:**
- `src/styles/team-chat-tokens.css` (E83–E85)

**i18n:**
- `src/i18n/team-chat.ts` (E96)

**Scripts:**
- `scripts/team-chat-db-validate.mjs` (E97–E99)

### Correções aplicadas durante execução

1. **`TeamChatPanel.tsx` quebrado** (bug Phase 5): importava `useTeamChatPanel` de caminho inexistente `@/hooks/team-chat/useTeamChatPanel`; corrigido para `./useTeamChatPanel`.
2. **Migration renomeada**: `20260927100000` → `20260927400000` para alinhar com o ledger do banco.
