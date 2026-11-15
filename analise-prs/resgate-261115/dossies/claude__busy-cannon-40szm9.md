# claude__busy-cannon-40szm9 (PR #2614) — PERDIDA_PARCIAL (quase tudo obsoleto)

- Ref: `origin/claude/busy-cannon-40szm9` · tip `0e112bcc` · merge_base `1252bb5a` (2026-11-01) · 105 commits · 162 arquivos (5445+/1214-)
- main comparada: `dac285f6` (= `origin/main` no momento da triagem)
- Pré-classificação mecânica: MISTO_CONFLITO · 161 arquivos com lacuna / 3738 linhas

## Propósito da branch
Sessão de "análise das PRs abertas" de 01–02/11/2026: gera relatórios, dossiês por PR, baseline de build/testes,
`prs.json`/`prs.csv` e regras-de-negócio derivadas. 152 dos 162 arquivos são artefatos dessa análise
(`analise-prs/`). Além disso levou 9 ajustes de código/CI que surgiram durante a análise (mocks de teste,
a11y de diálogo, guarda no shim de banco, regeneração do eslint-baseline) e 2 seções em `PENDENCIAS.md`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `analise-prs/dossies/*` (138), `analise-prs/baseline/*` (8), `RELATORIO_PRS.md`, `progresso.json`, `prs.json`, `prs.csv`, `prs-lista.json`, `regras-de-negocio.md` | **OBSOLETO** — relatório histórico do universo de PRs #2100–#2606 em 02/11; `analise-prs/` na main foi reescrito por sessões posteriores (37 arquivos, dossiês de #2811–#2970, `diagnostico-3-prs-restantes-261106.md`). Nenhuma PR analisada ainda está aberta. | `git ls-tree -r origin/main --name-only -- analise-prs \| wc -l` → 37 (branch: 316) |
| `analise-prs/regras-de-negocio.md` | **OBSOLETO** — snapshot derivado de CLAUDE.md/PRONTO_PRODUCAO.md/types.ts em `c4280ef4` (02/11). Hoje a fonte oficial gerada é a branch `contexto` (`regras/`, por `scripts/regras_negocio/`), per AGENTS.md. | cabeçalho do arquivo: "Gerado em: 2026-11-02 · main SHA c4280ef4c" |
| `PENDENCIAS.md` (+32 linhas) | **OBSOLETO** — §4/§5 descrevem CI vermelho da PR #2494 (drift `docs/DB-INVENTORY.md`, tabelas `copilot_*`), resolvida/fechada há duas semanas. `PENDENCIAS.md` da main foi inteiramente reescrito (§4 = "PR #2980 FECHADA", inventário de 2026-11-12/15). | `git show origin/main:PENDENCIAS.md \| grep -n "## "` → nenhuma menção a #2494 |
| `scripts/ci/eslint-baseline.json` (+23/-10) | **OBSOLETO** — artefato gerado (sha256 por arquivo). A versão da branch é de 01/11 (8874 linhas de base); a main já regenerou (13086 linhas, outros sha256). Portar reintroduziria hashes de conteúdo antigo. | `git show origin/main:scripts/ci/eslint-baseline.json \| wc -l` = 13086 vs branch 8874; diff só troca sha256 de 10 arquivos |
| `src/test/setup.ts` (+23/-6) | **OBSOLETO/SUPERSEDIDO** — mock global de `clientHeight`=600, `clientWidth`=800 e `offsetHeight` (lê `style.height`) para o `@tanstack/react-virtual`. A main resolveu a mesma necessidade **por teste**, de forma seletiva: `src/components/catalog/__tests__/ExternalProductCatalog.virtualizacao.test.tsx:61-66` define `clientHeight` só para o container `.overflow-y-auto` e **0 para os demais** — o mock global (600 para todo `HTMLElement`) é incompatível com esse padrão. Mesmo padrão em ChatMessagesArea.*, ChatPopup.*, VirtualizedRealtimeList, EmailChatThread. | `git grep -ln clientHeight origin/main -- src` → 18 arquivos; `git grep -n clientHeight origin/main -- src/test/setup.ts` → vazio |
| `src/hooks/calls/__tests__/useCallRecording.test.tsx` (+1) | **OBSOLETO** — `vi.stubGlobal('Blob', globalThis.Blob)` (Blob cross-realm). O teste passa na main sem isso: `npx vitest run src/hooks/calls/__tests__/useCallRecording.test.tsx` → **12 passed** (HEAD `dac285f6` = origin/main). | saída do vitest, 15/11 |
| `src/components/talkx/kit/dialogs.tsx` (+1/-1) e `__tests__/dialogPresets.test.tsx` (+2/-2) | **OBSOLETO/SUPERSEDIDO** — troca o rótulo do botão por "Iniciando…" enquanto `loading`. A main já dá o feedback de ação em curso: `TalkXPrimaryButton` renderiza `<Loader2 className="animate-spin">` e desabilita o botão quando `loading` (`src/components/talkx/kit/primitives.tsx:135-139`), e `dialogs.tsx:202,205` já passa `loading`/`disabled`. Puramente cosmético. | `primitives.tsx:138` em `origin/main` |
| `src/components/ui/dialog.tsx` (+1/-1) e `src/components/ui/sheet.tsx` (+1/-1) | **SEM EFEITO** — adiciona `aria-label="Fechar"` no botão de fechar que **já** tem `<span className="sr-only">Fechar</span>` (main `dialog.tsx:79-81`, `sheet.tsx:59-61`). O nome acessível já é "Fechar"; nada muda para axe nem para `getByRole('button',{name:'Fechar'})`. | `git show origin/main:src/components/ui/dialog.tsx` linhas 79-82 |
| `e2e/a11y-config-admin.spec.ts` | **INCORPORADO** — byte-idêntico à main (retry do `axe.run`, GR-016). | status mecânico `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` |
| `scripts/db-audit/docker-shim` (+2) | **LACUNA REAL** (única) — guarda para não tentar dropar roles built-in. Ausente na main; o trecho-alvo existe (`origin/main:scripts/db-audit/docker-shim:182-185`). Valor baixo: `pg_*` são roles *pinned* (DROP falha e o erro já é engolido por `\|\| true`) e `postgres` é o próprio usuário da conexão (`PG_USER=postgres`, linha 22), que o Postgres também não deixa dropar. Script de container de teste, não produção. | `git grep -n 'pg_\*' origin/main -- scripts/db-audit/docker-shim` → vazio |

## Lacuna a recuperar (única)

`scripts/db-audit/docker-shim` — inserir após a linha 183 da main (`[[ -z "$role" ]] && continue`, dentro do
`while` do caso `rm`):

```bash
      [[ "$role" == pg_* ]] && continue  # nunca dropar roles built-in do PostgreSQL (pg_read_all_settings, pg_create_subscription, etc.)
      [[ "$role" == "postgres" ]] && continue  # superusuário padrão não pode ser dropado
```

## Veredito
**PERDIDA_PARCIAL** — todo o conteúdo com volume (152 artefatos de `analise-prs/`, `PENDENCIAS.md`,
`eslint-baseline.json`) está obsoleto ou superado, e os 6 ajustes em `src/` estão obsoletos, superados ou sem
efeito (provas acima). Resta 1 lacuna real de valor baixo (2 linhas no `docker-shim`).

`apagar_branch_seguro = false` apenas por causa dessas 2 linhas: portadas (ou descartadas por valor baixo),
a branch pode ser apagada sem perda.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL`. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Checagens feitas (origin/main = `dac285f6`, merge-base `1252bb5a`, tip `0e112bcc`):

1. **`scripts/db-audit/docker-shim` — lacuna CONFIRMADA e real.** `git show origin/main:scripts/db-audit/docker-shim`
   linhas 182-185 (caso `rm`): `[[ -z "$role" ]] && continue` seguido direto do `DROP ROLE IF EXISTS`, sem guarda
   `pg_*`/`postgres`. `git log -S'nunca dropar roles built-in' origin/main -- scripts/db-audit/docker-shim` → vazio
   (nunca existiu na main; não foi removida de propósito). Valor **baixo** confirmado: `old` vem de
   `$STATE/$cname.roles` (snapshot `roles_before`, linha 58), e `comm -23 cur old` já exclui as roles built-in —
   a guarda só age se o arquivo de estado faltar/estiver vazio, e o DROP já é silenciado (`|| true`). O arquivo
   existe na main, então as 2 linhas ainda encaixam sem adaptação.

2. **`e2e/a11y-config-admin.spec.ts` (retry do axe, GR-016) — INCORPORADA na main**, não é lacuna:
   `origin/main:e2e/a11y-config-admin.spec.ts:40,48,52` tem o mesmo laço de 10 tentativas com backoff 200 ms;
   o padrão também está em `a11y-contraste.spec.ts`, `a11y-inbox-teams.spec.ts`, `a11y-tarefas-dashboard.spec.ts`.

3. **`src/components/ui/dialog.tsx` e `sheet.tsx` (`aria-label="Fechar"`) — ausentes na main, porém SEM EFEITO.**
   `origin/main:src/components/ui/dialog.tsx:80-82` e `sheet.tsx:60-62` já têm `<span className="sr-only">Fechar</span>`
   dentro do `Close`, que produz o mesmo nome acessível "Fechar". O `aria-label` só substitui o conteúdo por texto
   idêntico — nada muda para leitor de tela, para axe nem para `getByRole(..., { name: 'Fechar' })`. Lacuna de valor nenhum.

4. **`src/components/talkx/kit/dialogs.tsx` (`'Iniciando…'`) — cosmético confirmado.**
   `origin/main:src/components/talkx/kit/primitives.tsx:138` já renderiza `<Loader2 className="w-4 h-4 animate-spin" />`
   quando `loading`, e o botão fica `disabled`. Portar só o rótulo exigiria portar também o teste
   (`dialogPresets.test.tsx`, que na main assere `name: 'Excluir'` em 8 pontos) — churn sem ganho.

5. **`src/hooks/calls/__tests__/useCallRecording.test.tsx` (`vi.stubGlobal('Blob', globalThis.Blob)`) — desnecessário, VERIFICADO.**
   `npx vitest run src/hooks/calls/__tests__/useCallRecording.test.tsx` na árvore atual (sem o stub; `grep` confirma ausência)
   → **12 passed**, 1.98s.

6. **`src/test/setup.ts` (mock global de `clientHeight`/`clientWidth`/`offsetHeight`) — superado.**
   `origin/main:src/test/setup.ts` só mocka `getBoundingClientRect` (linha 139). A main resolveu por teste:
   18 arquivos em `src/` definem `clientHeight` localmente, no padrão
   `origin/main:src/components/catalog/__tests__/ExternalProductCatalog.virtualizacao.test.tsx:32,64`
   (`classList.contains('overflow-y-auto') ? SCROLL_VIEWPORT_HEIGHT : 0`). Um getter global devolvendo 600 para
   todo `HTMLElement` contraria a premissa desses testes (não-contêiner mede 0) — portar é risco, não ganho.

7. **`scripts/ci/eslint-baseline.json` — artefato gerado, obsoleto.** main: 13086 linhas; branch: 8874.

8. **`PENDENCIAS.md` — obsoleto.** `git show origin/main:PENDENCIAS.md | grep '2494\|copilot_'` → vazio.

9. **`analise-prs/` (152 arquivos) — histórico, sem valor acionável.** main tem 37 arquivos em `analise-prs/` e
   **211** em `docs/_arquivo/analise-prs/` (o arquivo histórico oficial), com versões mais ricas dos mesmos dossiês
   (ex.: `origin/main:docs/_arquivo/analise-prs/dossies/PR-2149.md` traz Head/Base SHA, que a versão da branch não tem).
   105 dossiês da branch não têm par na main, mas são o template formulaico de PRs já fechadas
   ("NÃO AVALIADO (bloqueio/skip anterior)"). Os 2 itens substantivos que esses relatórios apontavam já foram
   resolvidos na main: `supabase/migrations/20261102012200_department_invites_restringe_escrita.sql` existe
   (era o drift da #2603) e `supabase/migrations/_superseded/` tem 13 arquivos (era a #2606).

Lacunas adicionais encontradas: nenhuma de valor ≥ médio. Única não listada na triagem é a do item 3
(`aria-label="Fechar"`), de valor nenhum — registrada aqui para não ser redescoberta.

`apagar_branch_seguro = false` mantido: só pelas 2 linhas do `docker-shim`. Portadas (ou descartadas por valor baixo),
a branch pode ser apagada sem perda.
