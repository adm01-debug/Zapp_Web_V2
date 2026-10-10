# Runbook — Contatos: restaurar exclusão e reclassificar legado

Banco: `tnnnlkbymytvtqngbbqh` (ver `CLAUDE.md` §1). As duas receitas são DML de dado, não DDL:
não geram migration nem entrada no ledger. Rodar pelo SQL Editor do dashboard ou pelo MCP oficial,
**sempre** com o `SELECT` de conferência antes e depois.

## Contexto

- Excluir um contato na UI chama `delete_contact(p_id)` / `delete_contacts(p_ids)` (migration
  `20260929370000`). As RPCs só gravam `deleted_at = now()` (soft-delete); a linha continua na tabela.
- Contato visível em Contatos = `deleted_at IS NULL AND is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'`
  (migration `20260930450000`). O toggle "Mostrar legados" (`include_legacy`) relaxa só as duas
  últimas condições — contato excluído nunca volta pela UI.
- Exclusão e restauração ficam registradas em `public.contact_deletion_audit` pelo trigger
  `trg_audit_contact_deletion_change` (migration `20260930170000`).
- `contacts.phone` é `UNIQUE` também para linhas excluídas: cadastrar de novo o mesmo número falha
  enquanto a linha antiga existir. Restaurar a linha antiga é o caminho certo.

## Receita 1 — restaurar um contato excluído

```sql
-- 1) Conferir: a linha existe e está excluída.
SELECT id, name, phone, deleted_at, assigned_to
  FROM public.contacts
 WHERE id = '<contact_id>';            -- ou: WHERE phone = '<telefone só dígitos>'

-- 2) Restaurar (só mexe se ainda estiver excluída).
UPDATE public.contacts
   SET deleted_at = NULL
 WHERE id = '<contact_id>'
   AND deleted_at IS NOT NULL
RETURNING id, name, deleted_at;        -- 0 linhas = id errado ou já restaurado

-- 3) Conferir a trilha.
SELECT *
  FROM public.contact_deletion_audit
 WHERE contact_id = '<contact_id>'
 ORDER BY 1 DESC
 LIMIT 5;
```

Depois: recarregar a tela de Contatos. Os contadores (`contacts_count_by_type`) e os KPIs leem do
banco a cada consulta, então o contato volta para a aba e o Total sem outro passo.

## Receita 2 — reclassificar `is_lid_legacy`

`is_lid_legacy = true` marca LIDs do WhatsApp gravados como telefone antes do `normalizePhone`
(migration `20260906000001`: ≥15 dígitos, ou 14 dígitos sem prefixo `55`).

```sql
-- 1) Conferir o candidato.
SELECT id, name, phone, is_lid_legacy, phone ~ '^[0-9]{10,15}$' AS telefone_valido
  FROM public.contacts
 WHERE id = '<contact_id>';

-- 2a) Era um telefone real marcado por engano: tirar a marca.
UPDATE public.contacts
   SET is_lid_legacy = false
 WHERE id = '<contact_id>'
   AND is_lid_legacy = true
RETURNING id, phone, is_lid_legacy;

-- 2b) É um LID que ficou sem marca: marcar como legado.
UPDATE public.contacts
   SET is_lid_legacy = true
 WHERE id = '<contact_id>'
   AND is_lid_legacy = false
RETURNING id, phone, is_lid_legacy;
```

Tirar a marca **não basta** se o `phone` não casa `^[0-9]{10,15}$` (`telefone_valido = false`):
o contato continua fora da lista padrão. Nesse caso corrija o telefone (só dígitos, com DDI) pela
edição do contato ou num `UPDATE ... SET phone = ...`, lembrando do `UNIQUE` em `phone`.

Reclassificação em lote: trocar `id = ...` pelo critério e rodar primeiro só o `SELECT count(*)`
com o mesmo `WHERE`, para conferir o tamanho do lote.

> Estas receitas foram escritas a partir das migrations citadas e **não** foram executadas contra
> produção quando o runbook foi criado (a sessão não tinha acesso ao banco). Na primeira execução real,
> registre a data e o resultado aqui.

## Verificação em 2026-10-01 (read-only)

O encerramento do plano (etapas 95–100) tinha acesso **somente leitura** ao banco (`zapp-v2-db-ro`);
DML em produção é proibido. Portanto as duas receitas seguem **não testadas por execução** — o que
deu para provar é que os objetos que elas tocam existem, com os nomes e tipos citados:

```sql
-- executado 2026-10-01 via MCP read-only
SELECT 'col' AS kind, column_name AS obj FROM information_schema.columns
 WHERE table_schema='public' AND table_name='contacts'
   AND column_name IN ('deleted_at','is_lid_legacy','phone','assigned_to')
UNION ALL SELECT 'table', table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name='contact_deletion_audit'
UNION ALL SELECT 'trigger', tgname FROM pg_trigger
 WHERE tgname='trg_audit_contact_deletion_change'
UNION ALL SELECT 'rpc', proname FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname IN ('delete_contact','delete_contacts');
```

Resultado bruto (8 linhas): `assigned_to`, `deleted_at`, `is_lid_legacy`, `phone` (colunas);
`contact_deletion_audit` (tabela); `trg_audit_contact_deletion_change` (trigger);
`delete_contact`, `delete_contacts` (RPCs). Bate com o texto das receitas.

Contexto numérico do mesmo dia (`deleted_at IS NULL`): 3.106 linhas na tabela, 3.104 visíveis com o
toggle "Mostrar legados" ligado e 2.504 na visão padrão (sem legados) — a receita 1 opera sobre esse
universo, a receita 2 só troca o predicado de visibilidade.

Pendência: na primeira execução real das receitas (por quem tiver escrita), anotar aqui data,
`contact_id` e o `RETURNING` obtido.
