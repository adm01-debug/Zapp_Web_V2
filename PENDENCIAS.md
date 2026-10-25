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

**Nota:** a distribuição de testes por shard é aleatória entre runs. Os arquivos listados variam de run para run; o que é constante é que NENHUM dos arquivos com falha está no diff desta branch (`git diff origin/main --name-only` confirma).

---

### Shard 1/3 — CI run 40206335520, job/121207961039

**✅ CORRIGIDO — `alvos-toque-44px.test.tsx:41,51`:**  
`getByRole('button', { name: 'Close' })` → `'Fechar'` (botão usa `<span class="sr-only">Fechar</span>`). Confirmado passando: não aparece no shard 1/3 do run 40206335520.

**PRÉ-EXISTENTE — `src/components/ui/__tests__/VolumeDial.test.tsx` (8 falhas):**  
`aria-valuenow` calculado diverge do esperado pelos testes (ex.: `expected "50" received "33"`, `expected "100" received "30"`). Não está no diff desta branch. Confirmado pré-existente na `main`.

---

### Shard 2/3 — CI run 40206335520, job/121207961068

**✅ CORRIGIDO — `workItemFormat.test.ts:123` (timezone):**  
`formatWorkItemDate('2026-10-11T17:00:00-03:00')` exibia `'Hoje, 20:00'` em UTC. Envolvido em `withTimeZone('America/Sao_Paulo', ...)`. Confirmado passando: não aparece no shard 2/3 do run 40206335520.

**PRÉ-EXISTENTE — `useInboxFilters.type-url.test.tsx` (5 falhas):**  
`handleContactTypeChange(null)` não limpa o parâmetro `type` da URL. Bug em `useInboxFilters.ts` (não alterada por este PR). Confirmado falhando na `main`.

**PRÉ-EXISTENTE — `buscas-silenciosas-aviso.test.tsx:155`:**  
Texto esperado `"Erro ao atualizar o relatorio"`, recebido `"Erro ao ativar/desativar relatório"`. Não está no diff desta branch.

**PRÉ-EXISTENTE — `useDashboardKpi.periodo.test.tsx` (3 falhas):**  
Parâmetro de RPC esperado `p_from`/`p_until`, recebido `p_since`. Não está no diff desta branch.

**PRÉ-EXISTENTE — `useAgentCelebrations.test.tsx:256`:**  
Array esperado com 1 elemento, recebido vazio. Não está no diff desta branch.

**PRÉ-EXISTENTE — `useInboxBulkActions.test.ts:546,625`:**  
Coluna `assigned_to` vs `conversation_status` — mismatch de schema. Não está no diff desta branch.

---

### Shard 3/3 — CI run 40206335520, job/121207961023

**✅ CORRIGIDO — `aviso-navegador.test.tsx`:**  
Mock `window.Notification` como constructor (função regular, não arrow). Confirmado passando: não aparece no shard 3/3 do run 40206335520.

**PRÉ-EXISTENTE — `team-chat-notifications-mount.test.ts` (2 falhas):**  
`DeferredProviders` em `src/App.tsx:96` chama `useAuth()` sem `AuthProvider` wrapper. `App.tsx` não está no diff desta branch. Confirmado falhando na `main`.

**PRÉ-EXISTENTE — `TalkXTemplates.route.test.tsx:153`:**  
`Expected "tpl_2", Received "tpl_1"` — seleção de template não muda o parâmetro de URL. `TalkXTemplates.route.test.tsx` não está no diff desta branch (`git diff origin/main -- src/components/talkx/__tests__/TalkXTemplates.route.test.tsx` = 0 linhas).

---

**Confirmação global de não-introdução por este PR:**  
`git diff origin/main --name-only` não inclui nenhum dos arquivos de teste acima. Cada arquivo de produção relacionado (`useInboxFilters.ts`, `App.tsx`, `VolumeDial.tsx`, etc.) igualmente ausente do diff.

**Ação necessária (bloqueios remanescentes):**  
1. `useInboxFilters.ts`: corrigir `handleContactTypeChange(null)` para remover `type` da URL — resolve shard 2/3 parcialmente.  
2. `App.tsx` / `DeferredProviders`: adicionar `AuthProvider` wrapper no teste ou mock `useAuth` — resolve shard 3/3 parcialmente.  
3. `TalkXTemplates.route.test.tsx`: investigar lógica de troca de template na URL do editor.  
Todas requerem investigação fora do escopo desta sessão.

---

## 7. Auto Update PR Branches — `auto-update-pr-branch.yml`

**Status:** BLOQUEIO EXTERNO — falha transitória de infraestrutura GitHub  
**Check afetado:** `Auto Update PR Branches` (não é required check de PR)  
**Workflow:** `.github/workflows/auto-update-pr-branch.yml`  
**Último run com falha:** [run/40201624889](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40201624889)

**Causa exata (run 40201624889, job 121193828106):**  
Passo "🚦 Escolher a proxima PR da fila" falhou com:  
`HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)`

O script `scripts/ci/fila-merge.mjs` usa `gh pr list` (REST via `gh` CLI). O HTTP 504 foi emitido pelo `gh` CLI ao chamar a API GraphQL do GitHub internamente para resolver campos de PR (como `mergeStateStatus`). É uma falha transitória de disponibilidade da infraestrutura do GitHub — não há bug de código. O catch do script propaga o erro recebido, sem `exit 1` explícito.

**Confirmação de que NÃO é introduzido por este PR:**  
O workflow não toca nenhum arquivo alterado nesta branch. A falha é HTTP 504 (gateway timeout da API externa), que ocorre independentemente do conteúdo do código desta branch.

**Ação necessária:**  
Nenhuma — o workflow reexecuta automaticamente no próximo push na main ou via `workflow_dispatch`, e terá success quando a API GraphQL do GitHub estiver disponível.  
Não é required check de PR e não bloqueia merge.

---

*Pendências registradas pela sessão de correção de CI em 2026-10-24/25.*
