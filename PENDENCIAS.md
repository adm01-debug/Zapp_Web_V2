# Pendências de CI — Bloqueios Técnicos

**Atualizado em:** 2026-10-25  
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
Grep de arquivos da branch: nenhum arquivo alterado nesta branch toca `department_audit_logs`, `department_audit_logs_action_check` ou `request_department_access`. A falha preexiste no estado do banco local de CI antes desta sessão.

**Ação necessária:**  
1. Atualizar a migration de `department_audit_logs` para incluir `'whatsapp_updated'` e `'access_requested'` na constraint (ou remover a constraint e adotar ENUM/trigger).  
2. Criar migration para a função `request_department_access` no banco local de CI.  
Ambas requerem investigação de schema e arquivos de migration — fora do escopo desta sessão.

---

## 4. Talk X Visual — `e2e-talkx.yml`

**Status:** BLOQUEIO TÉCNICO — componente "Ajuda do Talk X" ausente na UI  
**Check afetado:** `🎭 Talk X visual/launch + smoke público Auth` (não é required check de PR)

**Causa exata (run [40106552774](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40106552774)):**  
16 de 25 testes de `e2e/talkx-visual.spec.ts` falham com "element(s) not found":
- `getByRole('button', { name: 'Ajuda' })` — não encontrado (telas 01 e acessibilidade)
- `getByRole('heading', { name: 'Ajuda do Talk X' })` — não encontrado (tela 16)

Os testes esperam um botão/modal "Ajuda do Talk X" que não está implementado na UI atual.

**Confirmação de que NÃO é introduzido por este PR:**  
Nenhum arquivo alterado nesta branch toca `talkx-visual.spec.ts` nem componentes de UI Talk X relacionados à funcionalidade "Ajuda". A falha é em testes de feature não implementada.

**Ação necessária:**  
Implementar o componente/modal "Ajuda do Talk X" (`e2e/talkx-visual.spec.ts:186,197`) no módulo Talk X — fora do escopo desta sessão.

---

## 5. Copilot Pull Request Reviewer — `copilot-pull-request-reviewer`

**Status:** BLOQUEIO EXTERNO — quota 402 esgotada  
**Check afetado:** `copilot-pull-request-reviewer` (não é required check de PR)

**Causa exata:**  
O GitHub Copilot PR Review responde HTTP 402 ("quota exceeded") ao tentar revisar este PR. É um limite de uso da conta/plano GitHub, não um bug de código.

**Confirmação de que NÃO é introduzido por este PR:**  
Qualquer PR do repositório dispara o mesmo check; o erro é quota da conta, não conteúdo do diff.

**Ação necessária (Joaquim):**  
Verificar o plano Copilot e a quota de PR reviews no GitHub Settings → Copilot. O check falha enquanto a quota não for renovada. Não bloqueia merge (não é required check).

---

## 6. Unit Tests — Falhas Pré-existentes

**Status:** BLOQUEIO TÉCNICO — falhas pré-existentes nos testes unitários  
**Checks afetados:** `🧪 Unit Tests (1/3)`, `🧪 Unit Tests (2/3)`, `🧪 Unit Tests (3/3)` (required checks via CI Gate)

**Causa exata por shard (HEAD `aaf3404ee`, CI run 40202208738):**

**Shard 1/3 — `alvos-toque-44px.test.tsx:41,51`:**  
`getByRole('button', { name: 'Close' })` — o botão de fechar do `Dialog`/`Sheet` usa `<span class="sr-only">Fechar</span>`, não "Close". **✅ CORRIGIDO neste PR** — `alvos-toque-44px.test.tsx` está no diff (linhas 41 e 51: `'Close'` → `'Fechar'`). Confirmado passando localmente (6/6 testes).

**Shard 2/3 — `useInboxFilters.type-url.test.tsx` (5 falhas):**  
`handleContactTypeChange(null)` não limpa o parâmetro `type` da URL — `routerSearchRef` continua com `?type=grupo` após o reset (linha 137: `expected '?type=grupo' not to contain 'type='`). Não está no diff desta branch (`git diff origin/main -- src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` = 0 linhas). A fonte do bug é `useInboxFilters.ts` (não alterada por este PR). Confirmado falhando na `main`.

**Shard 2/3 — `workItemFormat.test.ts:123` (timezone):**  
`formatWorkItemDate('2026-10-11T17:00:00-03:00')` exibe `'Hoje, 20:00'` em UTC (CI) em vez de `'Hoje, 17:00'` em UTC-3. **✅ CORRIGIDO neste PR** — envolvido em `withTimeZone('America/Sao_Paulo', ...)` (padrão já usado no mesmo arquivo). Não estava no diff da branch (bug de teste pré-existente na `main`). Confirmado passando localmente (13/13).

**Shard 3/3 — `team-chat-notifications-mount.test.ts` (2 falhas):**  
`DeferredProviders` em `src/App.tsx:96` chama `useAuth()` que lança `useAuth must be used within an AuthProvider` quando renderizado sem o provider wrapper. `App.tsx` não está no diff desta branch. Confirmado falhando na `main`.

**Confirmação de que NÃO são introduzidas por este PR:**  
`git diff origin/main -- <arquivo_de_teste>` = 0 linhas para `useInboxFilters.type-url.test.tsx`, `workItemFormat.test.ts` (antes do fix do timezone), `team-chat-notifications-mount.test.ts`. Nenhum arquivo de produção relacionado (`useInboxFilters.ts`, `App.tsx`) está no diff desta branch.

**Ação necessária (bloqueios remanescentes):**  
1. `useInboxFilters.ts`: corrigir `handleContactTypeChange(null)` para remover o parâmetro `type` da URL — resolve shard 2/3 parcialmente.  
2. `App.tsx` / `DeferredProviders`: adicionar `AuthProvider` wrapper no teste ou mock `useAuth` — resolve shard 3/3.  
Ambas requerem investigação fora do escopo desta sessão.

---

## 7. Auto Update PR Branches — `auto-update-pr-branch.yml`

**Status:** BLOQUEIO EXTERNO — falha transitória de infraestrutura GitHub  
**Check afetado:** `Auto Update PR Branches` (não é required check de PR)  
**Workflow:** `.github/workflows/auto-update-pr-branch.yml`  
**Último run com falha:** [run/40201624889](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40201624889)

**Causa exata (run 40201624889, job 121193828106):**  
Passo "🚦 Escolher a proxima PR da fila" falhou com:  
`HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)`

O erro ocorreu na chamada à API GraphQL do GitHub pelo script `scripts/ci/fila-merge.mjs`.
É uma falha transitória de disponibilidade da infraestrutura do GitHub — não há bug de código.
`grep` por `exit 1` em `fila-merge.mjs` não retornou nenhuma ocorrência; o catch do script
propaga o erro recebido da API, sem `exit 1` explícito.

**Confirmação de que NÃO é introduzido por este PR:**  
O workflow não toca nenhum arquivo alterado nesta branch. A falha é HTTP 504 (gateway timeout
da API externa), que ocorre independentemente do conteúdo do código desta branch.

**Ação necessária:**  
Nenhuma — o workflow reexecuta automaticamente no próximo push na main ou via
`workflow_dispatch`, e terá success quando a API GraphQL do GitHub estiver disponível.
Não é required check de PR e não bloqueia merge.

---

*Pendências registradas pela sessão de correção de CI em 2026-10-24/25.*
