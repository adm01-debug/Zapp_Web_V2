# Teste RLS em Produção — Item 11 (2026-10-22)

## Limitação técnica: BEGIN/SET ROLE bloqueados pelo MCP

O MCP `SUPABASE - ZAPP WEB V2 - MCP` executa SQL via função wrapper `mcp_exec` que é
`SECURITY DEFINER`. Isso impõe duas restrições confirmadas por evidência:

```
-- Tentativa 1: BEGIN/ROLLBACK
BEGIN; SET LOCAL ROLE authenticated; SELECT ... ROLLBACK;
-- Erro: "EXECUTE of transaction commands is not implemented"

-- Tentativa 2: SET ROLE
SET ROLE authenticated; SELECT ...
-- Erro: "cannot set parameter 'role' within security-definer function"
```

Não é possível emular sessão `authenticated` em produção via MCP.

## Evidência alternativa (nível de certeza: ALTO)

### Confirmação direta via pg_policies

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'department_invites'
ORDER BY policyname;
```

**Resultado (2026-10-22):**
```
policyname                          | cmd    | qual | with_check
------------------------------------|--------|------|----------
dept_invites_delete_authenticated   | DELETE | true | null
dept_invites_insert_authenticated   | INSERT | null | true
dept_invites_select_authenticated   | SELECT | true | null
```

- `qual='true'` no DELETE → **qualquer** usuário `authenticated` pode deletar **qualquer** invite
- `with_check='true'` no INSERT → **qualquer** usuário pode inserir invite de **qualquer** departamento
- Essa é a definição exata das vulnerabilidades S3-01 e S3-02

### Confirmação via teste local S11 (Postgres temporário `zapp_s11_final`)

O mesmo comportamento foi testado com migrações reais do repo aplicadas em Postgres local
(banco `zapp_s11_final`, sessão anterior desta auditoria):

```
C3a: tenant B deleta invite do tenant A
     SET LOCAL "request.jwt.claims"='{"sub":"<uid_B>","role":"authenticated"}';
     DELETE FROM public.department_invites WHERE id = v_invite_a_id RETURNING id;
     → RESULTADO: DELETE 1 → VULNERABILIDADE CONFIRMADA (S3-01)

C3b: mesmo cenário com a policy corrigida (migration 20261026100300 aplicada)
     → RESULTADO: DELETE 0 → CORRIGIDA

C3c: INSERT com department_id de outro tenant
     WITH CHECK(true) substituída por WITH CHECK(owner_dept = auth.jwt()->>'sub')
     → RESULTADO: ERROR RLS → BLOQUEADO (S3-02 corrigida)
```

## Conclusão

As findings S3-01 e S3-02 estão **confirmadas com certeza ALTA** por duas vias independentes:
1. Inspeção direta da definição das policies (`qual='true'`, `with_check='true'`)
2. Execução real em banco local com o mesmo schema

A correção está nas migrations `20261026100300` (PR #2186) — **NÃO APLICADA** em produção.
