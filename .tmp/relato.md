Especialista: senior (area-sql-banco)

Refazer 1 dos 4 pontos recusados. O diff contra a entrega anterior tem 2 arquivos (migration + teste); nada fora dos pontos.

## Ponto 1 — reativação sem updated_at (e deleted_by)
Mudei `supabase/migrations/20261013051305_contato_excluido_inbox_ingest.sql` (linha 100): a reativação passou de `SET deleted_at = NULL` para `SET deleted_at = NULL, updated_at = now()`, na mesma escrita e só na linha reativada (`WHERE id = v_contact.id`).
Fiz diferente numa parte, e digo por quê: zerar `deleted_by` NÃO procede — essa coluna não existe. Provei: `schema-catalog.json` lista em contacts só `deleted_at` (sem `deleted_by`); `grep deleted_by` em `supabase/migrations/`, `src/**` e `supabase/tests/` retorna zero. `SET deleted_by = NULL` quebraria a migration ("column does not exist"). O único marcador real de exclusão é `deleted_at` (migration 20260929370000), e é ele que zero, mais `updated_at = now()`.
Teste que prova (bloco D novo, teste linhas 332-349): derruba o gatilho `update_contacts_updated_at`, reativa contato com `updated_at` retroativo em 2h e cobra a FUNÇÃO (não o gatilho).
- Vermelha antes (migration recusada): `[FAIL] D.2 sem gatilho: a FUNCAO anda updated_at da linha reativada: esperado '1', obtido '0'` (exit 1).
- Verde depois: `[PASS] D.1/D.2/D.3/D.4` (reativa, anda updated_at, nenhuma outra linha andou, gatilho recriado e funcionando).

## Ponto 2 — caminho INSERT com deleted_at viciado
Mudei a migration (linha 76): o `RETURNING` do INSERT passou a incluir `contacts.deleted_at`, lido do banco — `v_contact.deleted_at` nunca mais nasce viciado em NULL.
Achado da prova, maior que o descrito: no código recusado o caminho INSERT não devolvia NULL — QUEBRAVA. `RETURNING` de 4 colunas redefinia o record `v_contact` sem o campo `deleted_at` e o `IF v_contact.deleted_at` seguinte abortava a transação. Ou seja: toda mensagem de contato realmente novo dava erro no `ingest_inbound_message` (500 no webhook).
Teste que prova (bloco E novo, teste linhas 323-330): telefone inédito, passa pelo INSERT, lê `deleted_at` do banco.
- Vermelha antes (migration recusada): `ERROR: record "v_contact" has no field "deleted_at"` (contexto: `IF v_contact.deleted_at IS NOT NULL`), script aborta antes de E.1.
- Verde depois: `[PASS] E.1/E.2 caminho INSERT: outcome=inserted e contact_created=true`, `[PASS] E.3 caminho INSERT: deleted_at = NULL lido do banco`, `[PASS] E.4 caminho INSERT: updated_at preenchido na linha nova`.

## Ponto 3 — updated_at só na linha reativada (12 x 13 dígitos)
O `ORDER BY (deleted_at IS NOT NULL)` escolhe o vivo; o que prova o escopo do UPDATE são asserções de `updated_at` por linha, que faltavam no caso sem gatilho: D.2 (a reativada andou — vermelha antes, verde depois, vide Ponto 1) + D.3 (nenhuma outra linha andou) + G.14/G.15 já existentes (com gatilho). Nenhuma mudança de código além do Ponto 1 — o `WHERE id = v_contact.id` já restringe a uma linha.
- Vermelha antes: a mesma de D.2 acima (zero linhas andavam sem o gatilho).
- Verde depois: `[PASS] D.3 sem gatilho: nenhuma outra linha andou`, `[PASS] G.14 ... SO da linha reativada`, `[PASS] G.15 ... nenhum outro contato teve updated_at reescrito`.

## Ponto 4 — rollback: NÃO PROCEDE como defeito (provado por execução)
Verifiquei antes de obedecer: a linha 2 recusada JÁ restaurava os dois objetos. Extraí e comparei byte a byte com o anterior real (`20260905070000` função, `20260929810000` policy): corpo da função idêntico; a policy restaurada é a anterior (USING `can_edit_contact(...)` sem filtro de `deleted_at`) — só o case das keywords difere (`drop/create` vs `DROP/CREATE`, sem efeito no Postgres). Prova comportamental: rodei o teste novo contra a migration RECUSADA e `C.4` (corpo anterior, sem `deleted_at`) e `C.5` (USING anterior, sem `deleted_at`) PASSARAM — se o rollback recriasse a policy nova, C.5 falharia.
O que mudei mesmo assim (linha 2): normalizei para a forma canônica dos arquivos de origem (keywords em maiúsculas), risco zero, e travei com C.4/C.5 (teste linhas 369-372), que agora provam a restauração exata em toda execução.
- Verde: `[PASS] C.1 a linha -- Rollback: executou sem erro`, `[PASS] C.4 o rollback devolveu o CORPO anterior do ingest`, `[PASS] C.5 o rollback devolveu a USING anterior da policy` (C.2/C.3 inalterados, continuam passando).

## Arquivos (`git diff --name-only HEAD`, colado)
scripts/db-audit/contacts-deleted-inbox-ingest.test.sh
supabase/migrations/20261013051305_contato_excluido_inbox_ingest.sql
.tmp/relato.md (este arquivo)

## Verificação (resultado real)
- `bash scripts/db-audit/contacts-deleted-inbox-ingest.test.sh` (código corrigido): `EXIT=0`, `[OK] contrato do contato excluido no inbound/Inbox: RED->GREEN->rollback, todos os passos passaram` (R.1-R.7, G.0-G.15, E.1-E.4, D.1-D.4, C.1-C.5, todos PASS, nenhum pulado).
- Mesmo teste contra a migration recusada: aborta no bloco E com `ERROR: record "v_contact" has no field "deleted_at"`; sem o bloco E, `[FAIL] D.2 ... esperado '1', obtido '0'` (exit 1).
- `node scripts/ci/check-test-inventory.mjs`: este teste segue registrado (não está entre os 6 órfãos, todos pré-existentes de outros cartões; nenhum arquivo novo criado).
- Chamadores (`supabase/functions/**/evolution-webhook-messages.ts`, `whatsapp-webhook/index.ts`): RETURNS da função inalterado (7 colunas); nenhum chamador precisou mudar. Efeito colateral positivo: inbound de contato novo parava em erro 500 no código recusado; agora insere.
