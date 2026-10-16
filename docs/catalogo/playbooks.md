# Playbooks operacionais (PG-08)

Gerenciador do admin (`src/components/admin/PlaybooksManager.tsx`): ordem
determinística (categoria → nome → id), exclusão com confirmação, erro de
carga visível, trava contra clique duplo e cartão operável pelo teclado.

Atendente: `src/hooks/admin/usePlaybooksAtivos.ts` (leitura só de ativos via
`fetchPlaybooksAtivos`, que filtra `is_active = true` em
`src/hooks/admin/usePlaybooksData.ts`) e `useSetPlaybookActive`
(ativar/desativar conferindo as linhas afetadas — a RLS barra o agente comum
SEM erro, e zero linhas vira `PlaybookWriteError` visível em vez de falso
sucesso).

Banco (`supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql`):
leitura aberta para `authenticated`, escrita só para admin/supervisor.

Prova funcional da RLS (PostgreSQL 17 descartável, sem mock):

- `scripts/db-audit/playbooks-rls.sh`
