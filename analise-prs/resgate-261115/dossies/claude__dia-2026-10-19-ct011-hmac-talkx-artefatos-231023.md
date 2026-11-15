# Dossiê — claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023 (PR #2196)

- tip `d3bef1973` · merge_base `bac62ba98` · 5 commits · PR #2196 CLOSED não mergeada (2026-11-01, "substituída por trabalho posterior em branch nova").
- Propósito: cherry-pick do dia/2026-10-19 — X094 (editor de templates Talk X encaixado no endereço `?template=<id>&ttab=conteudo|ab|historico`, breadcrumb, campo Descrição), props X047 (`isError/error/onRetry`) no editor, `transcribed_at` no adapter Evolution, ignore de worktrees manuais no eslint + baseline regenerado.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `src/components/talkx/TalkXTemplateEditor.tsx` | **INCORPORADA** (reimplementada, mesmo comportamento) | `origin/main:...TalkXTemplateEditor.tsx:65-72` props `isError/error/onRetry/initialTtab/onActiveTemplateChange`; `:118-121` `ttabDoEndereco/showVersions/showVariants` iniciados por `initialTtab`; `:141` `onActiveTemplateChange?.(templateId)` dentro de `activateTemplate`; `:234-235` mantém sub-aba `ab/historico` na troca de template da biblioteca (equivale ao `parseTalkXTemplateRoute(window.location.search)` da branch, sem ler a URL); `:305-320` efeito X094 carrega variantes/versões do template inicial via refs; `:553` `<nav aria-label="Trilha de navegação">`; `:646-648` campo `talkx-template-descricao`. Commit que trouxe: `e1f2ee4dd` (2026-10-27). |
| `src/components/talkx/TalkXTemplates.tsx` | **INCORPORADA** (variante) | `origin/main:...TalkXTemplates.tsx:21` mantém `EMPTY_CONVERSION` local; `:268-277` passa `initialTtab={route.ttab}` e `onActiveTemplateChange={mirrorEditorTemplate}`. A branch só movia a constante para o hook — refactor sem efeito funcional. |
| `src/hooks/integrations/useTalkXTemplatesConversion.ts` | **OBSOLETA** (refactor supérfluo) | `export const EMPTY_CONVERSION` não existe na main (grep vazio); a main resolveu o import mantendo a constante local em `TalkXTemplates.tsx:21`. Valor: nenhum. |
| `src/adapters/evolutionAdapter.ts` | **INCORPORADA** | `origin/main:src/adapters/evolutionAdapter.ts:75` `transcribed_at: null`. |
| `eslint.config.js` | **OBSOLETA** | main `:13` `{ ignores: ["dist", ".claude/worktrees/**"] }`; `Zapp_fase456/` e `zapp-worktrees/` não aparecem em nenhum arquivo de código/config da main (só em `docs/_arquivo/docs/consolidacao/*`, levantamento histórico). Eram worktrees locais da sessão de outubro; o próprio corpo da PR diz que é cópia do PR #2128. Valor: nenhum. |
| `scripts/ci/eslint-baseline.json` | **OBSOLETA** (artefato gerado) | `eslintConfigSha256` da main (`9e63ecfc…`) ≠ branch (`efe6299c…`): baseline da branch está amarrado ao eslint.config da branch; main regenerou o próprio baseline (`src/hooks/chat/useFilesContainerColumns.ts` já existe na main). Portar causaria falha do guard. |

## Veredito
**OBSOLETA** — toda intenção funcional (X094, X047, `transcribed_at`) já está na main em outra forma; o que resta (export de constante, ignore de worktrees locais, baseline gerado) não faz mais sentido. `apagar_branch_seguro = true`.

Nota (não é lacuna desta branch): review Qodo na PR apontou que mudar `ttab` via Back/Forward sem remount não sincroniza os painéis; a main (`:305-320`) também só lê `ttab` no mount — comportamento igual, fora do escopo desta triagem.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** · `apagar_branch_seguro = true`. Tentei refutar hunk por hunk; nenhum resta com valor ≥ médio.

Escopo real auditado: `git diff bac62ba98 origin/claude/dia-2026-10-19-...-231023` = 6 arquivos, **107 inserções / 24 deleções**. O `lines_branch_has_main_lacks: 4794` do JSON do item é artefato do merge commit `d3bef1973` (merge de `main` para dentro da branch) e não representa trabalho próprio — o diff contra o merge-base é o que vale. `git merge-base origin/main <branch>` confirma `bac62ba98`.

Arquivo por arquivo, verificado por mim:

| Arquivo | Hunk da branch | Conferência na main | Veredito |
|---|---|---|---|
| `src/components/talkx/TalkXTemplateEditor.tsx` (+57) | props X047, `initialTtab`, `onActiveTemplateChange`, breadcrumb, campo Descrição, efeito X094, manter sub-aba na troca | **main cobre tudo e cobre melhor**: `:65-72` props; `:79-80` assinatura; `:118` `ttabDoEndereco`; `:119/:121` `showVersions/showVariants` iniciados por `initialTtab`; `:141` `onActiveTemplateChange?.(templateId)`; `:234-235 + :248-250` `manterVariacoes/manterHistorico` preservam a sub-aba na troca de template **por estado** (a branch lia `window.location.search` dentro do handler — mais frágil); `:300-320` efeito X094 com `buscasRef`/`ttabInicialRef`; `:516-518` `query={{isLoading,isError,error}}` + `onRetry` (a branch só declarava as props); `:553` breadcrumb; `:646-648` campo `talkx-template-descricao` | INCORPORADA |
| `src/components/talkx/TalkXTemplates.tsx` (+1/−3) | mover `EMPTY_CONVERSION` para o import do hook | `origin/main:21` mantém a constante local, `:203` a consome; `:269` `key=template-<id>` remonta o editor na troca de rota; `:276-277` passa `initialTtab={route.ttab}` e `onActiveTemplateChange` | refactor sem efeito |
| `src/hooks/integrations/useTalkXTemplatesConversion.ts` (+1) | `export const EMPTY_CONVERSION` | ausente na main por escolha (constante vive no consumidor). Zero comportamento | sem valor |
| `src/adapters/evolutionAdapter.ts` (+1) | `transcribed_at: null` | `origin/main:src/adapters/evolutionAdapter.ts:75` idêntico | INCORPORADA |
| `eslint.config.js` (+7/−1) | ignores `Zapp_fase456/**`, `zapp-worktrees/**` | main `:13` `{ ignores: ["dist", ".claude/worktrees/**"] }`. Nenhum desses diretórios existe ou é referenciado em código/config da main (`git grep` só acha prosa em `docs/audits/ARQUITETURA_V2_DESCOBERTAS.md` e um comentário em `e2e/fixtures/seed-talk-me.sql`, ambos caminhos `~/zapp-worktrees` da máquina do dono, fora do repo). **Além disso o hunk da branch duplica o bloco de comentário das linhas 9-13** — portar introduziria churn | sem valor |
| `scripts/ci/eslint-baseline.json` (+29/−15) | baseline regenerado | **acoplamento provado por hash**: `sha256(origin/main:eslint.config.js)` = `9e63ecfc90d8…` = `eslintConfigSha256` do baseline da main; `sha256(branch:eslint.config.js)` = `efe6299cb841…` = `eslintConfigSha256` do baseline da branch. Portar o baseline sem o config (ou vice-versa) quebra o guard. Main tem **542** entradas `"file"` contra **820** da branch: a main está adiante (violações corrigidas, não perdidas) — ex.: `src/hooks/chat/useFilesContainerColumns.ts` existe na main (`git ls-tree`) e **não** precisa estar no baseline | artefato gerado, sem valor |

Ponto que mais poderia virar lacuna, descartado: o efeito X094 da branch depende de `[initialTtab]` e o da main de `[editingId]` (com `ttabInicialRef` zerada após o primeiro disparo), logo a main não reage a troca de `ttab` sem remount. Mas o efeito da branch **também não abre o painel** (só chama `loadVariants`/`fetchVersions`, sem `setShowVariants/setShowVersions`) — buscaria dados para um painel fechado. Nenhuma vantagem funcional; e a main remonta o editor via `key` em `TalkXTemplates.tsx:269`. Não é lacuna.

Nenhuma remoção proposital a investigar: tudo o que a branch trazia de funcional entrou pela main em `e1f2ee4dd` (2026-10-27), posterior ao tip da branch (2026-10-23).
