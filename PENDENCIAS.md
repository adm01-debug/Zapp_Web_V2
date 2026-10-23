# Pendências CI — Itens que requerem ação do Joaquim

Auditoria: 2026-10-23 | Branch: `claude/magical-pasteur-iz2pgy`

---

## 🔴 BLOQUEADO — E2E logado: credenciais do usuário de teste rejeitadas

**Workflow:** `.github/workflows/e2e-logado.yml`  
**Run mais recente falhando:** [39986232122](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39986232122)  
**Job:** `🎭 E2E logado (Playwright) (deslogado-principal, ...)`  
**Erro:**
```
teardown falhou - nao bloqueia CI: login do usuario de teste recusado (HTTP 400)
```

**O que está acontecendo:** O usuário de teste (`E2E_TEST_EMAIL`) recebe HTTP 400 ao tentar login no Supabase Auth. Os testes Playwright que dependem de sessão autenticada falham na fase de setup.

**O que você precisa fazer:**
1. Acesse o Supabase Dashboard → Authentication → Users
2. Procure o usuário com o e-mail configurado em `E2E_TEST_EMAIL` (secret do repositório)
3. Verifique se o usuário existe e está ativo
4. Redefina a senha do usuário e atualize o secret `E2E_TEST_PASSWORD` no repositório:
   - GitHub → Settings → Secrets and variables → Actions → `E2E_TEST_PASSWORD`
5. Se o usuário foi deletado: recrie-o com o mesmo e-mail, defina a senha, atualize o secret
6. Após atualizar o secret, dispare manualmente o workflow `E2E logado` para confirmar

**Este workflow NÃO é required check** para merge em `main` (o `🎭 E2E Tests (Playwright)` obrigatório está no `ci.yml`, não no `e2e-logado.yml`). As correções deste PR não dependem de você resolver isso antes de mergear.

---

*Atualizado em 2026-10-23. Nenhum outro item bloqueado identificado nesta auditoria.*
