# Dossiê — claude__fix-rls-department-invites-261101-2222 (PR #2561, fechada 2026-11-02)

**Propósito:** restringir criação/exclusão de convites de departamento a admin (RLS em `department_invites`/`department_invitations`), criar convite pela RPC `create_department_invite` gravando em `department_invitations` (tabela que `accept_department_invite` lê), ajustar hooks e testes, documentar no README do módulo.

**Como entrou na main:** PR #2570 (`claude/fix-rls-department-invites-261102-0303`, merge 2026-11-02T06:01:52Z, commit `d45033e81`) — reimplementação com o mesmo conteúdo. Comentário de fechamento da #2561 ("superseded pelo #2570") **confirmado** pelo código.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/team-chat/useDepartmentManagement.ts` | idêntico à main | `hunk: PRESENT_BYTE`; `useCreateDepartmentInvite` (main :130, RPC `create_department_invite`), `useDeleteDepartmentInvite` (main :152, delete em `department_invitations`) |
| `src/hooks/team-chat/useRedeemDepartmentInvite.ts` | idêntico à main | `PRESENT_BYTE` |
| `__tests__/useCreateDepartmentInvite.rpc.test.tsx`, `__tests__/rls-contract.test.ts` | idênticos à main | `PRESENT_BYTE` |
| `__tests__/departmentInviteCode.random.test.tsx` (deleção) | já deletado na main | `PRESENT_BYTE` (status IDENTICAL) |
| `supabase/migrations/20261102012200_department_invites_restringe_escrita.sql` | na main com 1 linha melhor: `extensions.gen_random_bytes` (branch tinha `gen_random_bytes` sem schema) | `git diff origin/claude/... origin/main -- <arquivo>` = só essa linha (:84). Produção: `schema_migrations` tem `20261102012200 department_invites_restringe_escrita`; `pg_proc` tem `create_department_invite(p_department_id uuid, p_max_uses integer, p_expires_hours integer)`; `pg_policies`: `dept_invites_insert_admin`, `dept_invites_delete_admin`, `department_invitations_select_admin_supervisor`, `department_invitations_write_admin` |
| `src/hooks/team-chat/README.md` | 2 hunks ausentes na main; conteúdo coberto | (a) seção "Permissões de convite de departamento" → regra vive em `docs/agentes/regras-dominio.md:23-26` ("somente admin cria e apaga", `department_invitations` é a tabela do aceite, `department_invites` legada) — fonte oficial de regras, README não é dono. (b) linha da tabela `useDeleteDepartmentInvite` → hook existe na main (:152) mas não está listado no README (:62-66). Lacuna cosmética de 1 linha. |

## Veredito: INCORPORADA (confiança alta)

Todo código, teste e migration estão na main (byte a byte ou em versão superior) e aplicados em produção. A regra de permissão está documentada em `docs/agentes/regras-dominio.md`. Resta só 1 linha de tabela no README (valor baixo).

## Lacuna residual (opcional, baixo valor)

`src/hooks/team-chat/README.md`, após a linha de `useCreateDepartmentInvite` (main :65), adicionar:

```
| `useDeleteDepartmentInvite`        | `useDepartmentManagement.ts` | tabela  | `department_invitations`               |
```

## apagar_branch_seguro: true

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA — apagar a branch continua seguro.**

Achado mecânico: 6 linhas significativas adicionadas por `7f2459caf` em
`supabase/migrations/20261102012200_department_invites_restringe_escrita.sql`, removidas por
`1cd8ccea9` e ausentes da main.

### Quem removeu e por quê

`git log --oneline 1252bb5a..origin/claude/fix-rls-department-invites-261101-2222 -- <migration>`
→ `8654e0e57`, `1cd8ccea9`, `7f2459caf`. O removedor é `1cd8ccea9`
("fix: convites de departamento restritos a admin (criar e apagar)"), 6 inserções / 9 deleções.

`git show 1cd8ccea9 -- <migration>` mostra que a mudança **aperta** a permissão, não a afrouxa:

| | `7f2459caf` (removido) | `1cd8ccea9` → main |
|---|---|---|
| INSERT em `department_invites` | `public.is_admin_or_supervisor(auth.uid())` | `public.is_admin(auth.uid())` |
| DELETE em `department_invites` | policy `dept_invites_delete_owner_or_admin`: `is_admin_or_supervisor(...) OR created_by IN (perfis do usuário)` | policy `dept_invites_delete_admin`: `is_admin(auth.uid())` |

`is_admin` ⊂ `is_admin_or_supervisor`, e o `OR created_by IN (...)` (dono apaga o próprio convite)
desapareceu. Ou seja: todo acesso que as linhas removidas concediam está **negado** na versão final.
Não há guarda, validação, teste nem estado perdido — há menos permissão.

O próprio commit registra a motivação no cabeçalho da migration:
`-- Decisao do dono (01/11/2026): somente admin cria e apaga convites.`

### A intenção sobrevive

- `git show origin/main:supabase/migrations/20261102012200_...sql` traz exatamente a versão estrita:
  `dept_invites_insert_admin` com `public.is_admin(auth.uid())` (:30) e
  `dept_invites_delete_admin` `USING (public.is_admin(auth.uid()))` (:37-39), mais o comentário
  `Decisao do dono (01/11/2026): somente admin cria e apaga convites.` (:6).
- `public.is_admin(uuid)` existe na main: `supabase/migrations/20260830080000_fn_is_admin_and_fix_permissions_rls.sql`.
- Regra de produto na fonte oficial: `docs/agentes/regras-dominio.md:24-26` —
  "Decisão de produto: **somente admin** cria e apaga convites."
- Produção (ver tabela acima neste dossiê): `pg_policies` tem `dept_invites_insert_admin` e
  `dept_invites_delete_admin`; nenhuma policy `*_owner_or_admin`.

O objetivo do achado original (S3-01: fechar INSERT/DELETE abertos a qualquer autenticado) está
cumprido na main em versão mais restritiva. As 6 linhas são uma primeira tentativa de critério de
permissão, substituída por decisão de negócio dentro da mesma branch.

### A recuperar

Nada. O único resíduo do item segue sendo a linha de README já descrita acima (valor baixo).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. `apagar_branch_seguro = true`.** Tentei refutar hunk por hunk; nada de valor ≥ médio ficou fora da main.

Checagens feitas por mim (repo em `origin/main` = `dac285f62`):

1. **Código e testes — idênticos por SHA de blob**, não só por heurística: `git rev-parse` do blob na branch e na main coincide em `src/hooks/team-chat/useDepartmentManagement.ts`, `useRedeemDepartmentInvite.ts`, `__tests__/rls-contract.test.ts`, `__tests__/useCreateDepartmentInvite.rpc.test.tsx`. A deleção de `__tests__/departmentInviteCode.random.test.tsx` também está honrada (`git cat-file -e origin/main:…` → não existe).
2. **Migration — main é estritamente superior.** `git diff <branch> origin/main -- supabase/migrations/20261102012200_…sql` devolve **um único hunk**: `gen_random_bytes` → `extensions.gen_random_bytes` (:84). Nada da branch falta; a main qualifica o schema (correto para `search_path` fechado em função `security definer`). Não há hunk a resgatar.
3. **Produção confere** (`db_query`, leitura): `schema_migrations` tem `20261102012200`; `pg_proc` tem `public.create_department_invite`; `pg_policies` em `department_invites`/`department_invitations` = `dept_invites_insert_admin`, `dept_invites_delete_admin`, `dept_invites_select_admin`, `department_invitations_select_admin_supervisor`, `department_invitations_write_admin`. Nenhuma policy `*_authenticated` ou `*_owner_or_admin` sobrou.
4. **A omissão do README foi escolha da reimplementação, não perda.** `git show d45033e81 -- src/hooks/team-chat/README.md` mostra que a PR #2570 **editou o próprio README** (+8/-1) e, nessa edição, incluiu só a linha de `useCreateDepartmentInvite`, deixando de fora a linha de `useDeleteDepartmentInvite` e a seção de permissões. Mesmo autor, mesmo dia, mesmo escopo — a main é a versão posterior e deliberada.
5. **A seção de permissões da branch está coberta e, onde não está, é redundante.** A regra de negócio vive em `docs/agentes/regras-dominio.md:23-26` ("somente admin cria e apaga", `department_invitations` é a tabela do aceite, `department_invites` legada). Os detalhes extras do texto da branch são verdadeiros, mas já estão no código/migration da main: "1 uso, 7 dias" = `INVITE_MAX_USES = 1` e `INVITE_EXPIRES_HOURS = 7 * 24` (`useDepartmentManagement.ts:61-62`); "listar: admin e supervisor" = policy `department_invitations_select_admin_supervisor` (migration :51-53); `not_authorized` para supervisor = `useCreateDepartmentInvite.rpc.test.tsx:64-71`. Documentar de novo no README não muda comportamento nem decisão → valor baixo.
6. **Último hunk do README é a main estando mais em dia, não atrás:** na branch o texto de pendências ainda cita `create_department_invite` como pendente (item F62); na main ela já foi feita e só sobra `set_department_whatsapp_config`. Restaurar o texto da branch seria regressão de documentação.
7. **Nenhum guard de CI depende dessa tabela do README**: `git grep -ln "team-chat/README" origin/main -- scripts` → vazio. A linha faltante não quebra check nenhum.

**Lacuna residual (única, valor baixo, docs):** `src/hooks/team-chat/README.md` — após `useCreateDepartmentInvite` (main :65), falta
`| `useDeleteDepartmentInvite`        | `useDepartmentManagement.ts` | tabela  | `department_invitations`               |`
(o hook existe em `src/hooks/team-chat/useDepartmentManagement.ts:152` e é usado em `src/components/team-chat/department-management/DepartmentInvitesView.tsx:22`). Não justifica manter a branch: cabe em qualquer PR de documentação.
