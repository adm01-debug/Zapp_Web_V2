# Pendências de CI — Bloqueios Técnicos

**Atualizado em:** 2026-10-24  
**Branch:** `claude_05/brave-mccarthy-zvzky4`

---

## 1. E2E Logado — `e2e-logado.yml`

**Status:** BLOQUEIO TÉCNICO — secrets ausentes  
**Check afetado:** `🎭 E2E Tests (Playwright)` (execução logada contra produção)

**Causa exata:**  
O workflow `e2e-logado.yml` roda testes Playwright com login real contra o banco de produção (`tnnnlkbymytvtqngbbqh`). Ele exige os secrets de ambiente:
- `E2E_SUPABASE_URL` — URL do projeto Supabase de produção
- `E2E_SUPABASE_PASSWORD` — senha do usuário de teste E2E

Esses secrets são configuração de infraestrutura; não há código a corrigir nesta sessão. O workflow em si está correto.

**Ação necessária (Joaquim):**  
Confirmar que os secrets `E2E_SUPABASE_URL` e `E2E_SUPABASE_PASSWORD` estão configurados no environment `Production` do repositório GitHub. Se o workflow falhar por credencial inválida (não por ausência do secret), verificar o usuário de teste E2E no banco de produção.

**Nota:** Este bloqueio preexiste a esta sessão. O `e2e-logado.yml` não é um required check de PR (roda só em push na main), então não bloqueia merge.

---

## 2. types-sync — `types-sync.yml`

**Status:** BLOQUEIO TÉCNICO — banco de produção fora de sincronia com `types.ts`  
**Check afetado:** `types-sync` (não é required check de PR)

**Causa exata:**  
O `types-sync.yml` regenera `src/integrations/supabase/types.ts` a partir do schema do banco de produção e abre PR se houver divergência. Quando o banco tem mudanças DDL recentes que ainda não foram refletidas no `types.ts` commitado, o workflow abre ou atualiza a PR `automation/types-sync`.

Esta é uma questão de sincronização contínua do banco com o repositório, não um bug de código. O workflow em si está correto.

**Ação necessária:**  
Verificar se existe PR `automation/types-sync` aberta. Se sim, mergear após conferir que os tipos gerados estão corretos. Se não, disparar `workflow_dispatch` do `types-sync.yml` para verificar estado atual.

---

## 3. DB Guard — `db-guard.yml`

**Status:** BLOQUEIO TÉCNICO — falhas pré-existentes no banco local de CI  
**Check afetado:** `Contrato DB offline` (required check)

**Erros exatos observados no banco local de teste:**

1. **Constraint `department_audit_logs_action_check`** — rejeita valores `'whatsapp_updated'` e `'access_requested'` que os testes tentam inserir. A constraint só aceita os valores definidos no enum original; esses dois valores foram adicionados ao uso mas não à constraint do banco local do CI.  
   Erro: `ERROR: new row for relation "department_audit_logs" violates check constraint "department_audit_logs_action_check"`

2. **Função `public.request_department_access` ausente** — o banco local de CI não tem a função `request_department_access` que os testes do módulo de departamentos invocam.  
   Erro: `ERROR: function public.request_department_access(unknown) does not exist`

**Confirmação de que NÃO é introduzido por este PR:**  
Grep confirma: nenhum arquivo alterado nesta branch toca `department_audit_logs`, `department_audit_logs_action_check` ou `request_department_access`. A falha preexiste no estado do banco local de CI antes desta sessão.

**Ação necessária:**  
1. Atualizar a migration de `department_audit_logs` para incluir `'whatsapp_updated'` e `'access_requested'` na constraint (ou remover a constraint e adotar ENUM/trigger).  
2. Criar migration para a função `request_department_access` no banco local de CI.  
Ambas requerem investigação de schema e arquivos de migration — fora do escopo desta sessão de correção de workflows gerais.

---

*Pendências registradas pela sessão de correção de CI em 2026-10-24.*
