# Dossiê — claude__feat-x051-talkx-lifecycle-2611081915 (PR #2812)

**Ref:** `origin/claude/feat-x051-talkx-lifecycle-2611081915` · tip `bbdf443d` · merge-base `be8aa06a` · 1 commit útil (`25876de6`) + 2 merges de main.
**Propósito:** trocar, em `src/components/talkx/TalkXCampaignRunning.tsx`, os dois `AlertDialog` locais (Pausar/Cancelar) + `handlePause/handleCancel/handleResume` + estados `pauseOpen/cancelOpen/pauseReason/resuming` pelo controlador único `useTalkXLifecycle` + `<TalkXLifecycleDialog>` (X051). 1 arquivo, +11/−87.

## Veredito: **INCORPORADA** (confiança alta) — `apagar_branch_seguro: true`

A mesma intenção entrou na main pela PR #2555 (`a49ef4ad5`, 2026-11-13, "feat: unificar ciclo de vida de campanha em useTalkXLifecycle nas 5 telas (X051)"), em forma **superior**: a tela usa `useTalkXLifecycleWith(...)` (reaproveita as operações do único `useTalkX()` já montado = um só canal realtime) em vez de `useTalkXLifecycle()` (que chama `useTalkX()` de novo). A main inclusive tem teste que **rejeita** a abordagem da branch.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência (origin/main) |
|---|---|---|---|
| `src/components/talkx/TalkXCampaignRunning.tsx` | 5 linhas "missing_in_main" | Já está, com texto diferente | `:11-13` importa `useTalkXLifecycleWith, TalkXLifecycleDialog` de `./useTalkXLifecycle`; `:657` `const lifecycle = useTalkXLifecycleWith({ startCampaign, pauseCampaign, cancelCampaign, updateCampaign }, {...})`; `:701` `closeLifecycle()` no efeito de saída (equivale a `lifecycle.close()` da branch, estabilizado via `:689`); `:900-902` `onPause/onResume/onCancel={() => lifecycle.request({ kind: ..., target: { id, name } })}`; `:905` `resuming={lifecycle.pendingKind === 'resume'}` (equivale a `isPending && intent?.kind === 'resume'`); `:923` `<TalkXLifecycleDialog controller={lifecycle} />` |
| idem | 9 linhas "removed_still_in_main" | Falso positivo: são linhas genéricas (`import {`, `if (!campaign) return;`, `try {`) que sobrevivem em outros handlers (`handleSaveLimits` etc.) | `git show origin/main:src/components/talkx/TalkXCampaignRunning.tsx \| grep -n "pauseOpen\|cancelOpen\|handlePause\|handleCancel\|handleResume\|setResuming\|AlertDialog"` → **vazio**; `toast.warning('Campanha cancelada.')` e `onBack()` vivem agora em `runningLifecycleSuccess(onBack)` (`:658-660`) |

Prova de que a forma da branch (`useTalkXLifecycle()` direto nesta tela) foi **substituída de propósito**: `src/components/talkx/__tests__/TalkXCampaignRunning.lifecycle.test.tsx:134-146` — "O wrapper `useTalkXLifecycle()` chama `useTalkX()` de novo; a tela deve usar o `useTalkXLifecycleWith(...)`", mock que registra qualquer chamada do wrapper.

Comentário de fechamento da PR #2812 (11/11): "duplicata da #2555 … resultado igual (diferença só de espaço e comentário)". Verificado acima: conferido pelo código, não só pelo comentário.

## Lacunas a recuperar
Nenhuma. Nada de valor fora da main; a branch não traz teste, migration, edge ou doc.

## Verificação adversarial

**Parecer: CONCORDO — INCORPORADA, `apagar_branch_seguro: true`.** Tentei refutar hunk por hunk e não achei nada ≥ médio fora da main.

Diff real da branch = 1 commit útil (`25876de64`, os outros 2 são merges de main) em 1 arquivo, `src/components/talkx/TalkXCampaignRunning.tsx`, +11/−87. Todo o conteúdo é *remoção* dos modais locais + fiação do controlador único. Varri os 5 hunks:

| Hunk da branch | Está na main? | Prova |
|---|---|---|
| troca do import de `AlertDialog*` por `useTalkXLifecycle, TalkXLifecycleDialog` | sim (forma superior) | `origin/main:src/components/talkx/TalkXCampaignRunning.tsx:10-13` importa `useTalkXLifecycleWith, TalkXLifecycleDialog, type TalkXLifecycleIntent, type TalkXLifecycleOptions` |
| `const lifecycle = useTalkXLifecycle()` | sim | main `:657-664` `useTalkXLifecycleWith({ startCampaign, pauseCampaign, cancelCampaign, updateCampaign }, { onSuccess, errorMessage, copy })` — reaproveita o `useTalkX()` já montado |
| remoção de `pauseOpen/cancelOpen/pauseReason/resuming` + `handlePause/handleCancel/handleResume` + os 2 `AlertDialog` | sim | `git show origin/main:…/TalkXCampaignRunning.tsx \| grep -n "pauseOpen\|cancelOpen\|handlePause\|handleCancel\|handleResume\|setResuming\|AlertDialog"` → **nenhuma linha** |
| `lifecycle.close()` no efeito de saída | sim | main `:689` `const closeLifecycle = lifecycle.close;` + `:704` `closeLifecycle();` (com `closeLifecycle` nas deps — a branch deixava `lifecycle.close()` fora das deps do efeito) |
| `onPause/onResume/onCancel` → `lifecycle.request(...)`, `resuming`, `<TalkXLifecycleDialog controller={lifecycle} />` | sim | main `:900-902` idênticos; `:905` `resuming={lifecycle.pendingKind === 'resume'}` (equivalente a `isPending && intent?.kind === 'resume'`: `pendingKind` existe em `useTalkXLifecycle.tsx:88,228`); `:923` o diálogo |

Checagens que poderiam virar lacuna e não viraram:
- **Texto dos modais** (a branch os apagava sem reaproveitar): a main preservou palavra por palavra em `RUNNING_LIFECYCLE_COPY` — `origin/main:…/TalkXCampaignRunning.tsx:611-624` ("O envio será interrompido até você retomar. Mensagens em voo continuarão sendo entregues." / "Esta ação é irreversível. Os destinatários restantes não receberão a mensagem." / rótulos "Pausar", "Confirmar cancelamento", "Voltar").
- **Motivo da pausa** (textarea que a branch removia): preservado no diálogo único — `src/components/talkx/useTalkXLifecycle.tsx:85-86` (`reason`/`setReason`), `:343` passa `reason` ao `execute`, `:431` renderiza o campo.
- **Toasts e `onBack()` no cancelar**: `runningLifecycleSuccess(onBack)` em `:627-636`; erros em PT-BR em `runningLifecycleError` `:640-645` (a branch devolvia `toast.error` cru).
- **Remoção de propósito?** Não: a main *entrou* nesse estado, não saiu. `git log -S'useTalkXLifecycleWith' --oneline origin/main -- src/components/talkx/TalkXCampaignRunning.tsx` → único commit `a49ef4ad5` "feat: unificar ciclo de vida de campanha em useTalkXLifecycle nas 5 telas (X051) (#2555)".
- **A forma da branch foi rejeitada explicitamente**: `origin/main:src/components/talkx/__tests__/TalkXCampaignRunning.lifecycle.test.tsx:134-146` mocka e vigia `useTalkXLifecycle` justamente porque "o wrapper chama `useTalkX()` de novo; a tela deve usar o `useTalkXLifecycleWith(...)`". Reaplicar a branch quebraria esse teste e abriria um segundo canal realtime.
- `git merge-base --is-ancestor 25876de64 origin/main` → **NÃO-ANCESTOR** (o commit da branch nunca entrou; a *intenção* entrou pela #2555). `origin/main` em `dac285f62`.
- Os 9 "removed_still_in_main" são mesmo falso positivo: `import {`, `if (!campaign) return;`, `try {`, `toast.warning('Campanha cancelada.')`, `onBack()` — linhas genéricas que sobrevivem em `handleSaveLimits` e em `runningLifecycleSuccess`.

Nenhuma lacuna adicional. Branch 100% subsumida, em versão melhor.
