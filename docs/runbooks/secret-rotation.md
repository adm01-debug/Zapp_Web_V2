# Runbook: Rotação de Secrets de Alto Risco

**Última atualização:** 2026-09-28
**Scope:** `adm01-debug/Zapp_Web_V2` (Supabase Cloud `tnnnlkbymytvtqngbbqh`)

---

## DESTINO\_URL (string de conexão PostgreSQL do CI)

### O que é

`DESTINO_URL` é a connection string usada pelos scripts de CI para ler e escrever o ledger de migrations no banco de produção. É o secret de maior risco do repositório: vazamento expõe a connection string de produção (inclui senha de `postgres`) em repo público.

Usada em:
- `db-live-guard.yml` (guarda vivo pós-merge e agendado)
- `db-migrate.yml` (apply de migrations — **abre conexões de escrita**)
- `types-sync.yml` (regeneração de tipos TypeScript)
- `supabase-sync.yml` (import legado — **executa escrita destrutiva se ativado**)
- `targeted-ledger-evidence.yml` (evidência de ledger)
- `scripts/db-audit/check-migration-drift.mjs`
- `scripts/db-audit/register-migration.mjs`

**Antes de rotar:** confirme que nenhum run de `db-migrate.yml` ou `supabase-sync.yml` está em execução (Actions → em andamento). Esses workflows abrem conexões de escrita e podem falhar no meio da operação se a senha for invalidada durante o run.

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

- **Diagnosticar antes de resetar novamente:** o `db-live-guard` verifica drift de migrations,
  paridade de catálogo, manifesto, tipos gerados e configuração de runtime — não apenas autenticação.
  Abra o log do run que falhou e identifique o job/step exato:
  - Falha em `psql` com `password authentication failed` ou `FATAL: password` → é falha de credencial; gerar nova senha e voltar ao passo 1.
  - Falha em outro step (drift, catalog, tipos) → **não resetar a senha** — o problema é independente da rotação.
- O banco de produção não é afetado (o script é read-mostly)

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

2. **Verificar o novo token (antes de instalar no Actions)**
   - Confirmar acesso ao projeto com chamada não-mutante à Management API — enquanto o secret antigo ainda está intacto no Actions.
     Use `read -s` para evitar que o token apareça no histórico do shell; passe-o como variável de
     ambiente para o CLI do Supabase (que não o expõe em `argv`):
     ```bash
     read -s TOKEN
     SUPABASE_ACCESS_TOKEN="$TOKEN" supabase projects list 2>/dev/null \
       | grep tnnnlkbymytvtqngbbqh
     unset TOKEN
     ```
   - Esperado: saída contém `tnnnlkbymytvtqngbbqh` — token válido e com acesso ao projeto
   - Se o `grep` falhar (token inválido ou sem permissão), **não continue**: gere outro token antes de sobrescrever o secret no Actions
   - **Não** disparar `deploy-functions.yml` para verificar: o job está vinculado a
     `producao-edge-functions` e um `function_name` vazio deploya **todas** as funções
     em produção — não há opção de staging nesse workflow

3. **Atualizar o secret no GitHub Actions**
   - Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN` → Update
   - Colar o novo token

4. **Revogar o token antigo no Supabase**
   - Dashboard → Account → Access Tokens → localizar o token anterior → Revoke
   - Tokens Supabase **não expiram automaticamente** — esta etapa é obrigatória quando
     a rotação ocorre por comprometimento ou saída de membro da equipe

5. **Registrar** data, operador e motivo (comentário em issue de segurança ou nova issue)

---

## Secrets de terceiros (PROMOGIFTS, EXTERNAL\_SUPABASE, PREVIEW\_EGRESS)

Não têm procedure de rotação automática aqui — dependem de processo externo ao repo.

### Procedimento geral

1. **Atualizar o GitHub Actions secret correspondente**
   - Settings → Secrets and variables → Actions → `<NOME_DO_SECRET>` → Update
   - **Este passo é obrigatório antes de atualizar a Edge.** O step "Configurar secrets nas edges"
     de `deploy-functions.yml` (linhas 138–233) reescreve as variáveis de ambiente das edges a
     partir dos secrets do Actions durante qualquer deploy. Se o Actions tiver o valor antigo e
     um deploy for disparado após a rotação, ele sobrescreve o valor recém-rotacionado na Edge e
     pode derrubar `crm-integration`, `promogifts-catalog` ou `fetch-link-preview`.

2. **Atualizar o secret na Edge**
   - Supabase Dashboard → `tnnnlkbymytvtqngbbqh` → Edge Functions → Manage secrets
   - Prefira sempre o Dashboard a `supabase secrets set KEY=valor` (o comando expõe o valor em
     `argv` durante a execução; se precisar do CLI, use `supabase secrets set --env-file <arquivo>`
     com o arquivo protegido por `chmod 600`)
   - Esta abordagem atualiza apenas as variáveis de ambiente das funções, sem acionar deploy de código.

3. **Só dispare `deploy-functions.yml`** (com `function_name` preenchido: `promogifts-catalog`,
   `crm-integration` ou `fetch-link-preview`) se houver mudança de código a publicar junto com a
   rotação.

### ⚠️ PREVIEW\_EGRESS\_SHARED\_SECRET — procedimento coordenado (VPS + Edge)

Este secret vive em **dois lugares** (ver `docs/runbooks/preview-egress-proxy.md` linhas 28–30):
o proxy na VPS Hostinger e as edge functions. Rotacionar apenas a Edge quebra imediatamente a
autenticação HMAC de todas as preview requests.

Procedimento:

1. Gerar novo valor (string aleatória, ex.: `openssl rand -hex 32`)
2. Atualizar o Actions secret `PREVIEW_EGRESS_SHARED_SECRET` (passo 1 acima)
3. Atualizar o proxy na VPS: via MCP `HOSTINGER`, serviço `preview-egress-proxy`
   (stack em `infrastructure/preview-egress-proxy/`); atualizar o valor no gerenciador de
   secrets da VPS e reiniciar o container. **Não** usar o container `evolution-go-rxj2` da
   Evolution GO — ver `docs/runbooks/preview-egress-proxy.md` passo 2.
   ⚠️ **Janela de indisponibilidade:** nenhuma das implementações suporta dual-key; entre os
   passos 3 e 4 todo request HMAC será rejeitado. Execute os dois passos sem pausa para
   minimizar a janela.
4. Atualizar a Edge (passo 2 acima)
5. Validar: chamar `fetch-link-preview` com uma URL pública fresca (sem cache) e confirmar
   que a resposta contém `preview` não nulo. HTTP 200 com `{"preview":null}` indica falha
   HMAC — o handler devolve 200 mesmo quando o proxy retorna não-2xx.
6. Registrar data, operador e confirmação de validação

---

## Checklist de auditoria semestral

- [ ] `DESTINO_URL` — última rotação registrada?
- [ ] `SUPABASE_ACCESS_TOKEN` — token ainda válido? (não-expirável por padrão, revogar manualmente)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — ainda com acesso mínimo necessário? rotacionar se membro saiu ou comprometimento suspeito
- [ ] `DEPLOY_FUNCTIONS_TOKEN` — se criado, ainda tem escopo mínimo (`contents:write` apenas)?
- [ ] `DOCKERHUB_TOKEN` / `DOCKERHUB_USER` — token ativo no Docker Hub?
- [ ] Secrets listados em `github_list_actions_secrets` vs. secrets referenciados nos workflows — há orfãos?
