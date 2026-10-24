# PENDENCIAS.md — Bloqueios que dependem do Joaquim

**Data:** 2026-10-23  
**Branch de correção:** `claude/magical-pasteur-iz2pgy`  
**PR:** [#2199](https://github.com/adm01-debug/Zapp_Web_V2/pull/2199)

---

## 1. `🎭 E2E Tests (Playwright)` — suite `e2e-logado` bloqueada por credencial inválida

**Workflow:** `.github/workflows/e2e-logado.yml`  
**Check obrigatório:** sim (`🎭 E2E Tests (Playwright)` é required check da `main`)

### Erro

```
Error: POST https://tnnnlkbymytvtqngbbqh.supabase.co/auth/v1/token?grant_type=password
  → 400 Bad Request: "Invalid login credentials"
```

O passo de autenticação do Playwright usa o secret `E2E_TEST_PASSWORD` para fazer login
com o usuário de teste. O valor atualmente gravado **não corresponde** à senha real do
usuário `E2E_TEST_USER` no Supabase (projeto `tnnnlkbymytvtqngbbqh`).

### O que o Joaquim precisa fazer

**Opção A (recomendada) — atualizar o secret:**

1. Acesse o Supabase: https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh
2. Em **Authentication → Users**, localize o e-mail do usuário de teste (definido em
   `E2E_TEST_USER`).
3. Redefina a senha desse usuário para um valor seguro que você vai lembrar.
4. No GitHub, acesse **Settings → Secrets and variables → Actions** do repo
   `adm01-debug/Zapp_Web_V2`.
5. Edite o secret `E2E_TEST_PASSWORD` com o novo valor.
6. Reexecute o workflow `🎭 E2E Tests (Playwright)` na branch ou via PR.

**Opção B — verificar o valor atual:**

Se a senha nunca mudou, o problema pode ser que o secret `E2E_TEST_PASSWORD` foi
cadastrado com um valor incorreto desde o início. Nesse caso, basta seguir o passo 4–6
acima com a senha correta.

### Impacto enquanto bloqueado

- O check `🎭 E2E Tests (Playwright)` falha em todo PR que acionar o workflow `e2e-logado`.
- A suite `e2e-talkx` (que roda specs sem login obrigatório) **não é afetada**.
- Nenhuma funcionalidade de produção é afetada — é só o CI de teste.

---

## 2. `Contrato DB offline` — step 135 falha pré-existente na `main`

**Workflow:** `.github/workflows/db-guard.yml`  
**Check obrigatório:** sim (`Contrato DB offline` é required check da `main`)

### Erro

O step 135 `Simular auditoria somente-leitura de configuracao runtime` falha em ~3 segundos
com exit não-zero. O script usa `SKIP_DOCKER_SHIM: "1"` (i.e., Docker real, não o shim) para
iniciar um segundo container `postgres:17-alpine` — mas o runner `ubuntu-latest` do GitHub
não consegue iniciar container Docker dentro do job `Contrato DB offline` que já possui um
service container em execução.

### Evidência de que é pré-existente (não introduzido por esta PR)

A falha idêntica ocorre na `main` **antes** de qualquer alteração desta PR:

- **Run 40040378700**, commit `17976eb8`, branch `main` — step 135 falha com assinatura idêntica
- Steps 1–134 passam; step 135 falha em ~3s; steps 136–188 ficam `skipped`
- **Esta branch não tocou** `scripts/db-audit/runtime-config.test.sh` nem a configuração
  do step 135 em `.github/workflows/db-guard.yml`

### O que o Joaquim precisa fazer

O step 135 precisa de uma das seguintes correções (requer avaliação técnica de risco):

**Opção A — mover o step para job separado:**  
Criar um novo job `runtime-config-audit` em `db-guard.yml`, sem `services:`, que execute
`retry-disposable-postgres-test.sh runtime-config.test.sh`. Isso elimina o conflito de
containers.

**Opção B — usar service container existente:**  
Adaptar `runtime-config.test.sh` para conectar ao service container `postgres` já existente
no job (via `PGHOST`, `PGPORT` injetados pelo GitHub) em vez de subir um container separado.
Requer refatoração do script.

**Enquanto não corrigido:**  
- O check `Contrato DB offline` falha em todo CI (incluindo `main`).
- O merge do PR #2199 está bloqueado por este check **e pelo item 1 acima**.
- Checks 1–134 do job passam — o regresso é somente no step 135.

### Contexto adicional (CLAUDE.md §db-guard.yml)

> Steps incompatíveis com o shim precisam de `SKIP_DOCKER_SHIM: "1"` no `env:` do step
> (isso causa passthrough para o Docker real). Os 11 passos com essa exceção hoje incluem
> `runtime-config.test.sh` — "depende de PostgREST" (categoria análoga, usa docker logs
> para readiness).

---

*Sem outros bloqueios identificados nesta sessão.*
