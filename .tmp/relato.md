Especialista: hugo

## O que mudou e por quê
- src/hooks/crm/useContactNotes.ts: o tipo `ContactNote` ganhou `is_pinned?: boolean` (opcional de propósito: nota lida antes da coluna existir chega sem a marca e vale como não fixada); a lista passou a ordenar fixadas primeiro, depois `created_at` desc e `id` desc como desempate final; novo `editNote(id, content)` (manda SÓ `{ content }`, a RLS de UPDATE do banco é a barreira de quem edita); novo `togglePin(id)` (lê o estado da lista carregada e desfixa/fixa; id fora da lista lança erro em vez de fixar às cegas); `updateNote` e `addNote` aceitam `is_pinned`/`isPinned`. Motivo: o cartão pede editar, fixar e ordenar na camada de dados.
- src/services/contact.service.ts: `addNote` grava `is_pinned` explícito no insert (ausente = `false`, igual ao `DEFAULT false` da coluna); `updateNote` aceita `is_pinned`; `fetchNotes` preenche `author` com o placeholder `'Usuário removido'` quando o perfil do autor não existe, em vez de deixar `author` undefined.
- src/hooks/crm/useContactNotes.pinned.test.tsx (novo): ordem das fixadas, empate de `created_at` (id desc) e fixação vencendo o empate, nota sem `is_pinned` (regressão), `editNote` só conteúdo, `togglePin` fixa/desfixa e recusa id fora da lista, `updateNote`/`addNote` com `is_pinned`, autor placeholder.
- Dependência: cherry-pick da faixa do cartão pai t_aae31a96 (commit `9a2cb1fc5`), sem ele o hook não compila. É dele o diff em `supabase/migrations/20261013002758_contact_notes_pinned.sql` (coluna `is_pinned` + índice das fixadas), `supabase/tests/contact_notes_pinned.sql`, `src/integrations/supabase/types.ts` (campo `is_pinned` derivado) e `scripts/db-audit/inbox-contact-authorization.test.sh`. Meu diff é só `src/hooks/crm/useContactNotes.ts`, `src/services/contact.service.ts` e `src/hooks/crm/useContactNotes.pinned.test.tsx`.

## Prova
- vermelho antes (hook/serviço na versão anterior às minhas mudanças): `npx vitest run src/hooks/crm/useContactNotes.pinned.test.tsx` → `Tests 5 failed | 1 passed (6)`
- verde depois: `npx vitest run src/hooks/__tests__/useContactNotes.test.tsx src/hooks/crm/useContactNotes.pinned.test.tsx src/hooks/crm/useContactNotes.error-pagination.test.tsx src/components/inbox/tabs/__tests__/NotesTab.test.tsx src/components/inbox/tabs/NotesTab.error-save.test.tsx` → `Test Files 5 passed (5); Tests 32 passed (32)`

## O que NÃO fiz e por quê
- Não toquei em `src/components/inbox/tabs/NotesTab.tsx` (botões de editar/fixar e o checkbox opcional "Fixar ao criar"): são de `src/components/**`, área do worker (telas) — há cartão filho t_20feae69 para a interface. A camada de dados já expõe `editNote`, `togglePin` e `addNote(..., isPinned)`.
- Não ordenei por `is_pinned` no servidor (nada de `.order('is_pinned')`): o índice das fixadas é só leitura barata, a consulta segue `created_at desc, id desc` (paginação) e o sort no hook apenas reordena a cópia do cache.
- `updateNote` continua sem uso na tela por outro cliente além do próprio hook; a novidade é `editNote`/`togglePin`, que ficam prontos para o componente citado.
