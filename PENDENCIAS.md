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

*Sem outros bloqueios identificados nesta sessão.*
