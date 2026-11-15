# Dossiê — claude__fix-talkx-wizard-remonta-rascunho-261114-0715 (PR #3074)

**Ref:** `origin/claude/fix-talkx-wizard-remonta-rascunho-261114-0715` · tip `04d30bf95` · merge-base `58f1713b` (2026-11-14)
**Commits:** `8274a8f7a fix(talkx): primeiro autosave não remonta o editor de campanha nova` · `1539323f5 docs(talkx): regera ESTADOS.md` · `04d30bf95 Merge main`

## Propósito
Talk X, wizard de campanha nova: o primeiro autosave troca `?wizard=new` por `?wizard=<id>`; quando a lista de campanhas recarrega e traz o rascunho, `wizardCampaign` virava o `routedCampaign`, a `key` do wizard mudava de `talkx-wizard:new` para `talkx-wizard:<id>` e o editor remontava, descartando o que o usuário mudou depois do autosave (flaky E2E `webkit-talkx talkx.spec.ts:213`).

Solução da branch: novo estado `createdDraftRouteId` (setado em `onDraftIdentity` só quando a rota era `new`) e `editorOwnsCreatedDraft` que força `wizardCampaign = null` enquanto o editor vivo é dono do rascunho.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/talkx/TalkXView.tsx` | **INCORPORADA (outra forma)** — PR #3073 (`4432834d6`, na main) corrige o mesmo ponto sem estado novo: reaproveita `localDraftRouteId`. | `git show origin/main:src/components/talkx/TalkXView.tsx` :257-262: `const wizardCampaign = editingCampaign?.id ? editingCampaign : routedCampaignIsEditable && routedCampaign?.id !== localDraftRouteId ? routedCampaign : editingCampaign;` — `onDraftIdentity` (:376-381) seta `localDraftRouteId` e grava a rota com `replace`. Casos que a branch cobria com o `createdDraftRouteId` dedicado: `duplicateCampaign` (:355-360) seta `editingCampaign = created`, logo `editingCampaign?.id` vence; `openEdit` (:281) zera `localDraftRouteId`. Mesmo efeito observável (key fica `'new'`, `campaign` fica `null`). PR #3087 (`6423dc237`) ainda refinou o reset no `syncFromBrowserHistory` (:155-158), superando o `setCreatedDraftRouteId(null)` incondicional da branch. |
| `src/components/talkx/__tests__/TalkXView.rascunhoNaoRemonta.test.tsx` (novo) | **INCORPORADA (outro arquivo)** — os 2 cenários já têm teste na main. | Cenário 1 (autosave + refetch não remonta): `origin/main:src/components/talkx/__tests__/TalkXView.route.test.tsx:110-131` (`wizardMounts` continua 1, `data-campaign-id` = `new`). Cenário 2 (recarregar com `?wizard=<id>` hidrata do servidor): mesmo arquivo `:702` "sem screen, rascunho abre o editor (wizard)". Extras da main que a branch não tinha: `:145`, `:159`, `:235` (voltar/avançar e lançar). |
| `docs/talkx/ESTADOS.md` | **OBSOLETA** — linha gerada com números de linha; a branch aponta `490`/`634`, a main já foi regerada para `491`/`639` após #3087. | `git grep -n 'TalkXView.tsx' origin/main -- docs/talkx/ESTADOS.md` → `:37 | ... | \`61\`, \`491\` | — | — | \`639\` | — |`; histórico `6423dc237`, `4432834d6`. |

## Veredito
**INCORPORADA** (confiança alta). A main cobre o defeito no mesmo ponto (`TalkXView.tsx:257-262`), com teste equivalente (`TalkXView.route.test.tsx:110`) e mais casos (#3087). O comentário de fechamento da #3074 ("duplicada da #3073") confere com o código.

## Lacunas a recuperar
Nenhuma. Não há hunk da branch que acrescente comportamento ausente na main; a abordagem com estado dedicado `createdDraftRouteId` é alternativa de implementação, não funcionalidade a mais.

**apagar_branch_seguro: true**

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar hunk por hunk; nenhum resto de valor ≥ médio.

Prova de que o fix está na `main` (não só a PR):
- `4432834d6` (#3073) e `6423dc237` (#3087) são **ancestrais de `origin/main`** (`git merge-base --is-ancestor` → ok nos dois).
- `git show origin/main:src/components/talkx/TalkXView.tsx` :257-262 — `wizardCampaign = editingCampaign?.id ? editingCampaign : routedCampaignIsEditable && routedCampaign?.id !== localDraftRouteId ? routedCampaign : editingCampaign;` com comentário citando o mesmo defeito. Como `routedCampaign` só vem de `wizardRoute.campaignId` (:253-255), `routedCampaign?.id !== localDraftRouteId` é **logicamente equivalente** ao trio `editorOwnsCreatedDraft` da branch (`createdDraftRouteId` + `localDraftRouteId ===` + `wizardRoute?.campaignId ===`); a key em :500 (`talkx-wizard:${wizardCampaign?.id || 'new'}`) fica `'new'` nos dois casos.
- Cada hunk da branch, conferido contra a main:
  - `createdDraftRouteId` (estado novo) e `setCreatedDraftRouteId(campaignId)` em `onDraftIdentity`: AUSENTES na main (`git grep createdDraftRouteId origin/main` → vazio), mas desnecessários — `onDraftIdentity` da main (:376-381) já seta `localDraftRouteId` e reescreve a rota com `replace`.
  - `setCreatedDraftRouteId(null)` incondicional no `syncFromBrowserHistory`: a main é **estritamente melhor** — :155-158 preserva o rascunho local no voltar/avançar (`keepLocalDraft`, só enquanto `draft`/`scheduled`). A versão da branch remontaria o wizard no back/forward, defeito que o #3087 corrigiu depois.
  - `routedCampaignIsEditable ? routedCampaign : editingCampaign` → `editorOwnsCreatedDraft ? null : …`: na main o ramo cai em `editingCampaign`, que nesse cenário é `null` (`editingCampaign?.id` falso é a própria condição de entrada). Mesmo valor.
- Teste novo da branch (`TalkXView.rascunhoNaoRemonta.test.tsx`, ausente da main por nome e por conteúdo): os 2 cenários são duplicados.
  - Cenário 1 (autosave + refetch não remonta) = `origin/main:src/components/talkx/__tests__/TalkXView.route.test.tsx:110-130` — mesmas asserções (`wizardMounts` segue `1`, `data-campaign-id='new'`), com o mesmo comentário sobre o flaky `webkit-talkx talkx.spec.ts:213`.
  - Cenário 2 (recarga em `?wizard=<id>` hidrata do servidor) = mesmo arquivo `:103-108` (`?wizard=draft_1&step=3` → `data-campaign-id='draft_1'`), citação mais exata que a `:702` do dossiê (aquela é `?campaign=`, não `?wizard=`).
  - A main cobre ainda `:145`, `:159`, `:174`, `:190`, `:235` (voltar/avançar, campanha que sai de editável, lançar) — casos que a branch não testava.
- `docs/talkx/ESTADOS.md`: arquivo gerado. Branch grava `61`, `490` / `634`; main (`origin/main:docs/talkx/ESTADOS.md:37`) já tem `61`, `491` / `639`, regerada depois do #3087. Aplicar a linha da branch **regrediria** o doc.

Lacunas adicionais: nenhuma. `apagar_branch_seguro: true` confirmado.
