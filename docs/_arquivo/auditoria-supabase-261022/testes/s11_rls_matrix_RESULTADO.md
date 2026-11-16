# S11 — Matriz RLS A×B: Resultados de Execução

**Data:** 2026-11-01 (esta sessão)
**Ambiente:** PostgreSQL 16.15 (Ubuntu), banco temporário `rls_audit_s11`
**Role usada:** `app_test` (não-superuser) com `SET ROLE app_test` antes de cada teste
**FORCE ROW LEVEL SECURITY:** habilitado em todas as tabelas

## Schema testado

```sql
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT current_setting('app.current_user_id', true)::uuid;
$$ LANGUAGE sql STABLE;

CREATE TABLE contacts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text,
  phone text
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select_own" ON contacts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "contacts_update_own" ON contacts FOR UPDATE USING (user_id = auth.uid());
-- SEM WITH CHECK no UPDATE — espelha o padrão das 39 policies em produção
CREATE POLICY "contacts_insert_own" ON contacts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "contacts_delete_own" ON contacts FOR DELETE USING (user_id = auth.uid());
```

**Dados de teste:**
- User A UUID: `aaaaaaaa-aaaa-4000-a000-000000000001`
- User B UUID: `bbbbbbbb-bbbb-4000-b000-000000000002`
- Contato A: id `aaaaaaaa-aaaa-4000-a000-aaaaaaaaaaaa`, user_id=A
- Contato B: id `bbbbbbbb-bbbb-4000-b000-bbbbbbbbbbbb`, user_id=B

---

## Resultados

| Teste | Descrição | Comando | Resultado | Veredicto |
|-------|-----------|---------|-----------|----------|
| T-01 | User A vê próprios contatos | `SELECT count(*) FROM contacts` (uid=A) | 1 | **PASS** |
| T-02 | User B vê próprios contatos | `SELECT count(*) FROM contacts` (uid=B) | 1 | **PASS** |
| T-03 | User A não vê contato de B por ID | `SELECT count(*) ... WHERE id=B_id` (uid=A) | 0 | **PASS** |
| T-04 | User A não consegue UPDATE em contato de B | `UPDATE contacts SET name='HIJACKED' WHERE id=B_id` (uid=A) | UPDATE 0 | **PASS** |
| T-05 | User A não consegue mover próprio contato para B (sem WITH CHECK) | `UPDATE contacts SET user_id=B WHERE id=A_id` (uid=A) | ERROR: new row violates RLS | **PASS** |
| T-06 | User A não consegue INSERT contato com user_id=B | `INSERT INTO contacts VALUES(..., user_id=B, ...)` (uid=A) | BLOCKED (check_violation) | **PASS** |
| T-07 | User A não consegue DELETE contato de B | `DELETE FROM contacts WHERE id=B_id` (uid=A) | DELETE 0 | **PASS** |
| T-08 | User A vê apenas próprias mensagens | `SELECT count(*) FROM messages` (uid=A) | 1 | **PASS** |

**Resultado: 8/8 PASS**

---

## Saída bruta dos testes (esta sessão)

```
T-01: User A sees own (expect 1) → 1         PASS
T-02: User B sees own (expect 1) → 1         PASS
T-03: User A sees B id (expect 0) → 0        PASS
T-04: User A updates B contact   → UPDATE 0  PASS
T-05: User A reassign user_id=B  → ERROR: new row violates row-level security policy  PASS
T-05 verify: B sees              → 1 (B só tem próprio contato, nao recebeu A)  PASS
T-06: User A insert for B        → NOTICE: T-06: INSERT for B BLOCKED (SAFE)    PASS
T-07: User A delete B contact    → DELETE 0  PASS
T-08: User A sees own messages   → 1         PASS
```

---

## Análise: Por que T-05 não é vulnerabilidade?

O achado A3 (39 policies UPDATE sem WITH CHECK explícito) baseia-se no risco teórico.
Na prática, PostgreSQL tem comportamento documentado:

> "If no separate check expression is specified for a policy, the using expression is used for both purposes." (PostgreSQL docs, Row Security Policies)

Portanto, `UPDATE USING (user_id = auth.uid())` **sem** WITH CHECK implica automaticamente
`WITH CHECK (user_id = auth.uid())`. A tentativa de mudar `user_id` para B falha com
`ERROR: new row violates row-level security policy`.

**Mas o achado A3 ainda é válido para o seguinte padrão em produção:**

Quando a política USING verifica campo X mas a linha também tem campo Y que pode ser
mudado para apontar para outro tenant, e Y não faz parte do USING, o PostgreSQL
implicit WITH CHECK **não cobre** Y. Exemplo hipotético:

```sql
-- Policy USING(org_id = my_org()) — mas sem impedir mudança de user_id
UPDATE contacts SET assigned_to = other_user WHERE id = my_contact_id;
-- Pode passar se org_id ainda = my_org() depois do update
```

Nesse caso a falta de WITH CHECK explícito seria vulnerabilidade real.
As 39 policies precisam de análise individual para o padrão multi-campo.

---

## Conclusão S11

- **Isolamento básico (SELECT/UPDATE/INSERT/DELETE):** ✅ SEGURO nas 8 combinações testadas
- **Achado A3 (39 UPDATE sem WITH CHECK):** PARCIALMENTE mitigado pelo comportamento implícito do PostgreSQL
- **Risco residual:** Policies onde USING verifica campo diferente do campo que UPDATE pode modificar
- **S11 status:** CONCLUÍDO com evidência real em PostgreSQL 16 local
