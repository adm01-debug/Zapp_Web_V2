# Roteiro de Testes RLS — S11 Matriz Tenant A×B

**Data:** 2026-10-22  
**Status:** EXECUTADO com sucesso em Postgres local temporário (`zapp_s11_final`)  
**Script:** `/tmp/s11_final.sql`

## Como reproduzir

```bash
# 1. Criar banco temporário
sudo -u postgres psql -c "DROP DATABASE IF EXISTS zapp_s11_final;"
sudo -u postgres psql -c "CREATE DATABASE zapp_s11_final;"

# 2. Executar suite completa
sudo -u postgres psql zapp_s11_final -f /tmp/s11_final.sql
```

## Cenários e resultados esperados

| Cenário | Descrição | Usuário | Resultado esperado | Resultado obtido |
|---------|-----------|---------|-------------------|-----------------|
| C3a | B deleta convite de A via política VULNERÁVEL (old) | B (agent) | `VULNERABILIDADE CONFIRMADA` — DELETE 1 | ✅ CONFIRMADO |
| C3b | B tenta deletar convite de A via política CORRIGIDA (new) | B (agent) | `CORRIGIDA` — DELETE 0 | ✅ CORRIGIDO |
| C3c | Agente B tenta INSERT (sem role admin) | B (agent) | `ERROR: new row violates row-level security policy` | ✅ BLOQUEADO |
| C3d | Admin C faz INSERT | C (admin) | `OK — admin C inseriu convite` | ✅ PERMITIDO |
| C4-A | A vê apenas sua campanha | A (agent) | count=1 | ✅ ISOLADO |
| C4-B | B vê apenas sua campanha | B (agent) | count=1 | ✅ ISOLADO |
| C8 | ai_jobs default-deny (RLS sem policy) | A (agent) | count=0 | ✅ BLOQUEADO |

## Saída real do terminal

```
=== C3a: dept_invites_OLD - B deleta convite de A (ESPERADO: VULN=1 deletado) ===
DELETE 1
RESULTADO_C3a: VULNERABILIDADE CONFIRMADA — B deletou convite de A (DELETE 1 OK)

=== C3b: dept_invites_NEW - B tenta deletar convite de A (ESPERADO: CORRIGIDA=0 deletados) ===
DELETE 0
RESULTADO_C3b: CORRIGIDA — B nao deletou convite de A (DELETE 0 OK)

=== C3c: dept_invites_NEW - agente B tenta INSERT (ESPERADO: ERRO RLS) ===
ERROR: new row violates row-level security policy for table "department_invites"

=== C3d: dept_invites_NEW - admin C faz INSERT (ESPERADO: INSERT 0 1) ===
INSERT 0 1
RESULTADO_C3d: OK — admin C inseriu convite (correto)

=== C4: talkx_campaigns - A ve so sua campanha (ESPERADO: A=1, B=1) ===
resultado_c4_campanhas_de_a: 1
resultado_c4_campanhas_de_b: 1

=== C8: ai_jobs - default-deny, ninguem ve (ESPERADO: 0) ===
resultado_c8_ai_jobs_visiveis: 0

=== FIM DOS TESTES S11 ===
```

## Conclusão

- **Vulnerabilidade S3-01/S3-02 confirmada na política OLD** (dept_invites_old)
- **Correção P001 verificada na política NEW** (department_invites com políticas da migration 20261026100300)
- **Isolamento de campanhas funciona** (talkx_campaigns policy por get_profile_id())
- **Default-deny funciona** (ai_jobs com RLS habilitado e zero policies bloqueia tudo)
