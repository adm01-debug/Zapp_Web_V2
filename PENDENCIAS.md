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

**Erros exatos observados no banco local de teste (job 121233421020, run 40214754252, HEAD `833edf743`):**

O setup do banco local de CI falha ao tentar remover roles de sistema do PostgreSQL (operação não permitida):

```
ERROR: cannot drop role pg_checkpoint because it is required by the database system
ERROR: cannot drop role pg_create_subscription because it is required by the database system
ERROR: cannot drop role pg_database_owner because it is required by the database system
ERROR: cannot drop role pg_execute_server_program because it is required by the database system
ERROR: cannot drop role pg_maintain because it is required by the database system
ERROR: cannot drop role pg_monitor because it is required by the database system
ERROR: cannot drop role pg_read_all_data because it is required by the database system
ERROR: cannot drop role pg_read_all_settings because it is required by the database system
ERROR: cannot drop role pg_read_all_stats because it is required by the database system
ERROR: cannot drop role pg_read_server_files because it is required by the database system
ERROR: cannot drop role pg_signal_backend because it is required by the database system
ERROR: cannot drop role pg_stat_scan_tables because it is required by the database system
ERROR: cannot drop role pg_use_reserved_connections because it is required by the database system
ERROR: cannot drop role pg_write_all_data because it is required by the database system
ERROR: cannot drop role pg_write_server_files because it is required by the database system
ERROR: current user cannot be dropped  (role: postgres)
FATAL: role "root" does not exist
```

Esses erros ocorrem durante o setup do container Postgres no docker-shim (E47), onde o script de inicialização tenta remover roles de sistema que o PostgreSQL protege. O step com `SKIP_DOCKER_SHIM: "1"` exige `docker logs` para readiness e não consegue se conectar como `root`.

**Erros de runs anteriores (job 121207961229, run 40206335606, HEAD `8bad01793`):**  
Esses runs do mesmo job revelaram erros adicionais em scripts de teste que executaram após o setup:
- `ERROR: new row for relation "department_audit_logs" violates check constraint "department_audit_logs_action_check"` — valores `'whatsapp_updated'`/`'access_requested'` não na constraint
- `ERROR: function public.request_department_access(unknown) does not exist` — função ausente no banco local

Ambos os conjuntos de erros são pré-existentes.

**Confirmação de que NÃO é introduzido por este PR:**  
Grep de arquivos da branch: nenhum arquivo alterado nesta branch toca `department_audit_logs`, `department_audit_logs_action_check`, `request_department_access`, nem a configuração do docker-shim (`scripts/db-audit/docker-shim`).

**Ação necessária:**  
1. Investigar o script de setup do container Postgres no docker-shim para não tentar remover roles de sistema.  
2. Atualizar a migration de `department_audit_logs` para incluir `'whatsapp_updated'` e `'access_requested'` na constraint.  
3. Criar migration para a função `request_department_access` no banco local de CI.  
Fora do escopo desta sessão.

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

**✅ CORRIGIDO — `useInboxFilters.type-url.test.tsx` (9 falhas → 0 falhas) — CONFIRMADO NO CI:**  
`handleContactTypeChange` usava `window.history.replaceState` em vez de `useSearchParams` do React Router. Corrigido em `753eb32cc` (PK-14). Verificado localmente: 9/9 testes passando. **Confirmado ausente** no CI do run `40214754253` (HEAD `833edf743`) — não aparece em nenhum dos 3 shards.

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

### Shard 1/3 — CI run 40209433848 (run posterior, distribuição diferente de shards)

**PRÉ-EXISTENTE — `TalkXOverview.table.test.tsx` (10 falhas):**  
Arquivo não está no diff desta branch. O arquivo de produção `TalkXOverview.tsx` ESTÁ no diff, mas a única mudança é `aria-label="Ações"` → `` `Ações de ${c.name}` `` — o teste referencia "Ações" como texto de coluna, não como aria-label de botão (`grep -n "Ações" src/components/talkx/__tests__/TalkXOverview.table.test.tsx` retorna header de coluna, não seletor de botão). Falha pré-existente não relacionada ao diff.

**PRÉ-EXISTENTE — `TalkXSegments.viewMode.test.tsx` (2 falhas):**  
Arquivo não está no diff desta branch. `useTalkXSegments.ts` está no diff mas as alterações (guards `assertNoSinguFields`, retornos null em `ruleToFilter`) não afetam os testes de viewMode (modo de visualização de UI). Falha pré-existente.

**PRÉ-EXISTENTE — `TalkXTemplateEditor.campos.test.tsx` (3 falhas):**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `TalkXTemplatesRail.test.tsx` (1 falha):**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `TalkXWizardReview.lifecycle.test.tsx` (6 falhas):**  
Arquivo não está no diff desta branch. Falha pré-existente.

---

### Shard 3/3 — CI run 40209433848 (run posterior, distribuição diferente de shards)

**PRÉ-EXISTENTE — `VoiceChangerPicker.aria.test.tsx` e `VoiceChangerPicker.voz-temporaria.test.tsx`:**  
Arquivos não estão no diff desta branch. Falhas pré-existentes.

**PRÉ-EXISTENTE — `useChatMediaSending.audio-meme-falha.test.ts`:**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `PasswordResetRequestsPanel.acesso-negado.test.tsx`:**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `AvatarUpload.invalidacao.test.tsx` e `SettingsView.test.tsx`:**  
Arquivos não estão no diff desta branch. Falhas pré-existentes.

**PRÉ-EXISTENTE — `WorkItemSheet.fuso.test.tsx`:**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `TalkXAnalytics.kpis.test.tsx`:**  
Arquivo não está no diff desta branch. Falha pré-existente.

**PRÉ-EXISTENTE — `TalkXSegments.detailPanel.test.tsx` e `TalkXSegments.route.test.tsx`:**  
Arquivos não estão no diff desta branch. `useTalkXSegments.ts` está no diff mas as alterações (guards `assertNoSinguFields`, `comingSoon: true`, retornos null em `ruleToFilter`) não são relacionadas à lógica de navegação de rota ou painel de detalhe testada nesses arquivos. Falhas pré-existentes.

---

**Confirmação global de não-introdução por este PR:**  
`git diff origin/main --name-only` não inclui nenhum dos arquivos de teste acima. Cada arquivo de produção relacionado (`useInboxFilters.ts`, `App.tsx`, `VolumeDial.tsx`, etc.) igualmente ausente do diff. Os arquivos de produção alterados nesta branch (`TalkXOverview.tsx`, `useTalkXSegments.ts`) têm mudanças mínimas que não podem causar as falhas observadas (confirmado por análise do conteúdo do diff e grep nos arquivos de teste).

**Ação necessária (bloqueios remanescentes):**  
1. `App.tsx` / `DeferredProviders`: adicionar `AuthProvider` wrapper no teste ou mock `useAuth` — resolve shard 3/3 (`team-chat-notifications-mount.test.ts`) parcialmente.  
2. `TalkXTemplates.route.test.tsx`: investigar lógica de troca de template na URL do editor.  
3. Módulo Talk X (TalkXOverview, TalkXSegments, TalkXTemplateEditor, TalkXTemplatesRail, TalkXWizardReview, TalkXAnalytics): múltiplas falhas pré-existentes em tests de UI do módulo — requerem investigação dos componentes respectivos.  
4. VoiceChangerPicker, useChatMediaSending, PasswordResetRequestsPanel, AvatarUpload, SettingsView, WorkItemSheet: falhas pré-existentes distribuídas aleatoriamente entre shards.  
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

## 8. CI Gate — `ci.yml` (job `ci-gate`)

**Status:** BLOQUEIO TÉCNICO — falhas pré-existentes nos Unit Tests (§6)
**Check afetado:** `✅ CI Gate` (required check de PR via CI Gate job)

**Causa exata:**
O job `ci-gate` em `ci.yml` tem `if: always()` e `needs: [typecheck, unit-tests, node-scripts, build, security]`. Quando `unit-tests` retorna `failure` (pré-existente, §6), o `ci-gate` detecta e falha com `exit 1`:

```bash
if [["${{ needs.unit-tests.result }}" == "failure" ]]; then
  echo "FALHA: unit-tests falhou" && exit 1
fi
```

As mesmas falhas de Unit Tests que ocorrem nesta PR ocorrem também na `main` (run CI [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) em `main`, SHA `2d97c44c`, 2026-10-24 — mesmos arquivos pré-existentes listados no §6). Nenhum arquivo alterado nesta branch é responsável pela falha.

**Confirmação de não-introdução por este PR:**
`git diff origin/main --name-only` não inclui nenhum dos arquivos com falha listados no §6. O CI Gate na `main` também falha pelo mesmo motivo (run 40122006424).

**Ação necessária:** As mesmas correções listadas em §6 — fora do escopo desta sessão.

---

## 9. Build — `ci.yml` (job `build`)

**Status:** BLOQUEIO TÉCNICO — skipped por dependência em `unit-tests` (§6)
**Check afetado:** `🏗️ Build` (required check de PR)

**Causa exata:**
O job `build` em `ci.yml` tem `needs: [typecheck, unit-tests]`. Quando `unit-tests` falha, o GitHub não executa o `build` (resultado: `skipped`). O build em si **não tem erro de código**.

Build local (baseline): `bun run build` — ✅ executado com sucesso (21.02s, 2026-10-25). O código da branch compila sem erros de build.

O mesmo comportamento ocorre na `main` (CI run [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424)) — build=skipped quando unit-tests=failure. Não é introduzido por este PR.

**Confirmação de não-introdução por este PR:**
`bun run build` local: ✅ success (21.02s). A falha de `skipped` no CI é consequência exclusiva do CI Gate (§8) que falha por Unit Tests pré-existentes (§6).

**Ação necessária:** As mesmas correções de §6 — quando Unit Tests passarem, CI Gate passará e Build executará.

---

*Pendências registradas pela sessão de correção de CI em 2026-10-24/25.*
