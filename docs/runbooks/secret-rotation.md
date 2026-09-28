# Runbook: Rotação de Secrets de Alto Risco

**Última atualização:** 2026-09-28
**Scope:** `adm01-debug/Zapp_Web_V2` (Supabase Cloud `tnnnlkbymytvtqngbbqh`)

---

## DESTINO\_URL (string de conexão PostgreSQL do CI)

### O que é

`DESTINO_URL` é a connection string usada pelos scripts de CI para ler e escrever o ledger de migrations no banco de produção. É o secret de maior risco do repositório: vazamento expõe a connection string de produção (inclui senha de `postgres`) em repo público.

Usada em:
- `db-live-guard.yml` (guarda vivo pós-merge e agendado)
- `scripts/db-audit/check-migration-drift.mjs`
- `scripts/db-audit/register-migration.mjs`

Formato: `postgresql://postgres.tnnnlkbymytvtqngbbqh:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`

### Quando rotar

- A cada 90 dias (recomendado) ou imediatamente se:
  - Qualquer log de Actions vazar a URL (checar com `grep DESTINO_URL` nos artifacts)
  - Membro da equipe com acesso ao GitHub Actions for desligado
  - Suspeita de comprometimento do runner

### Procedimento (zero downtime)

**Tempo estimado:** 10–15 min. Nenhum downtime de aplicação — a UI/edges não usam essa string.

1. **Gerar nova senha no Supabase**
   - Dashboard → `tnnnlkbymytvtqngbbqh` → Settings → Database → Reset database password
   - Copiar a nova senha (visível apenas uma vez)
   - **Preferível: copiar a URL completa do dashboard** (Settings → Database → Connection string → URI)
     — a senha já vem URL-encodada pelo dashboard
   - Se montar manualmente: `postgresql://postgres.tnnnlkbymytvtqngbbqh:<NOVA_SENHA>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
     — se a senha contiver caracteres especiais URI (`/`, `?`, `#`, `@`, `%`), percent-encode-os antes de inserir
     (ex.: `@` → `%40`, `%` → `%25`); de outra forma a URL será parseada incorretamente

2. **Atualizar o secret no GitHub Actions**
   - Settings → Secrets and variables → Actions → `DESTINO_URL` → Update secret
   - Colar a nova URL completa

3. **Verificar funcionamento**
   - Actions → `db-live-guard.yml` → Run workflow (branch: `main`)
   - Aguardar conclusão (~3–5 min)
   - Esperado: todos os checks verdes; issue #1013 fecha ou não abre nova

4. **Invalidar a senha antiga no Supabase** (opcional, feito automaticamente pelo reset)
   - O "Reset database password" do Supabase troca a senha da role `postgres` imediatamente
   - A senha antiga para de funcionar assim que o reset é confirmado — portanto **passo 2 deve vir logo após o passo 1** (janela de ~5 min antes do primeiro check agendado)

5. **Registrar** no comentário da issue de segurança (se existir) ou abrir uma nova:
   - Data da rotação, operador, motivo
   - "Verificado: `db-live-guard` verde no run XXXXXXXX"

### Rollback

Se o `db-live-guard` falhar após a troca:

- O banco de produção não é afetado (o script é read-mostly)
- Voltar ao passo 1 e gerar outra senha; atualizar o secret novamente

---

## SUPABASE\_ACCESS\_TOKEN (token de acesso ao Supabase Management API)

Usado por `deploy-functions.yml` para fazer deploy de edge functions.

### Quando rotar

- PAT expirado ou revogado (o deploy falha com 401)
- Usuário que gerou o token sair da equipe

### Procedimento

1. **Gerar novo token no Supabase**
   - Dashboard → Account → Access Tokens → Generate new token
   - Copiar o novo token (visível apenas uma vez)

2. **Atualizar o secret no GitHub Actions**
   - Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` → Update
   - Colar o novo token

3. **Verificar o novo token (sem mutação em produção)**
   - Confirmar acesso ao projeto com chamada não-mutante à Management API.
     Use `read -s` para evitar que o token apareça no histórico do shell:
     ```bash
     read -s TOKEN
     curl -sf -H "Authorization: Bearer $TOKEN" \
       https://api.supabase.com/v1/projects | grep tnnnlkbymytvtqngbbqh
     unset TOKEN
     ```
   - Esperado: saída contém `"tnnnlkbymytvtqngbbqh"` — token válido e com acesso ao projeto
   - **Não** disparar `deploy-functions.yml` para verificar: o job está vinculado a
     `producao-edge-functions` e um `function_name` vazio deploya **todas** as funções
     em produção — não há opção de staging nesse workflow

4. **Revogar o token antigo no Supabase**
   - Dashboard → Account → Access Tokens → localizar o token anterior → Revoke
   - Tokens Supabase **não expiram automaticamente** — esta etapa é obrigatória quando
     a rotação ocorre por comprometimento ou saída de membro da equipe

5. **Registrar** data, operador e motivo (comentário em issue de segurança ou nova issue)

---

## Secrets de terceiros (PROMOGIFTS, EXTERNAL\_SUPABASE, PREVIEW\_EGRESS)

Não têm procedure de rotação automática aqui — dependem de processo externo ao repo.
Ao rotar, atualizar os secrets correspondentes em GitHub Actions e re-executar `deploy-functions.yml` para repassá-los às edge functions.

---

## Checklist de auditoria semestral

- [ ] `DESTINO_URL` — última rotação registrada?
- [ ] `SUPABASE_ACCESS_TOKEN` — token ainda válido? (não-expirável por padrão, revogar manualmente)
- [ ] `DEPLOY_FUNCTIONS_TOKEN` — se criado, ainda tem escopo mínimo (`contents:write` apenas)?
- [ ] `DOCKERHUB_TOKEN` / `DOCKERHUB_USER` — token ativo no Docker Hub?
- [ ] Secrets listados em `github_list_actions_secrets` vs. secrets referenciados nos workflows — há orfãos?
