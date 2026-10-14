Especialista: hugo
Troquei o comentário contraditório acima da chamada get_team_messages_page por uma frase única e verdadeira: a RPC recebe p_before_id e desempata (created_at, id) no servidor.

## Pontos do revisor
- Ponto 1: resolvido — `src/components/team-chat/useTeamChatPanel.ts:224-227`. Removi as duas frases contraditórias ("keyset resolvido no servidor" + "o SQL ainda compara só created_at < v_before_at"). O comentário agora afirma uma situação coerente: a RPC lê `(v_before_at, v_before_id)` do `p_before_id` e filtra `created_at < v_before_at OR (created_at = v_before_at AND id < v_before_id)`. Prova no código: `supabase/migrations/20261010064729_team_messages_page_cursor_tiebreak_and_min_limit.sql:42-62` (busca `tm.created_at, tm.id INTO v_before_at, v_before_id` e filtra `m.created_at < v_before_at OR (m.created_at = v_before_at AND m.id < v_before_id)` com `ORDER BY m.created_at DESC, m.id DESC`). Nenhum comportamento mudou — só comentário.

## Prova
- `npx vitest run src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx` → `Test Files 1 passed (1); Tests 3 passed (3)` (só comentário alterado; suite do hook continua verde).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (9s)` (db_guard OK, tipos OK, lint OK, migrations OK).
- Segunda passada (defeito novo): `grep -rn get_team_messages_page src supabase` — chamadores são `src/components/team-chat/useTeamChatPanel.ts` (comentário corrigido, chamada inalterada) e `src/hooks/team-chat/useTeamMessages.ts` (não tocado); nenhuma lógica de chamada mudou, nenhum toast/efeito duplicado, nenhum arquivo de guarda/manifesto/CI alterado neste commit.

## Arquivos (git diff --name-only base...HEAD)
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/team-messages-page-cursor-tiebreak.test.sh
src/components/team-chat/__tests__/useTeamChatPanel.pagination.test.tsx
src/components/team-chat/useTeamChatPanel.ts
supabase/migrations/20261010064729_team_messages_page_cursor_tiebreak_and_min_limit.sql

## O que NÃO fiz e por quê
- Não mudei lógica, migration, testes ou workflow neste refazer: o cartão manda mexer SÓ no comentário, e SÓ esse arquivo tem alteração não-commitada/commits novos meus (1 commit de comentário).
