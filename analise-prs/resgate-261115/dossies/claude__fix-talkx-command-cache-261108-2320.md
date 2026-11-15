# Dossiê — claude__fix-talkx-command-cache-261108-2320 (PR #2866)

**Ref:** `origin/claude/fix-talkx-command-cache-261108-2320` · tip `d64b521f` · merge-base `9183f0f6` · 1 commit
**Commit:** `d64b521fe fix(talkx): isola queryKeys da palette do Ctrl+K das telas completas`

## Propósito
Evitar cache poisoning do React Query: `useTalkXCommandItems` (Ctrl+K) usava as mesmas queryKeys
(`talkx-campaigns`/`talkx-segments`/`talkx-templates`) das telas completas, mas com `select` reduzido e `limit 50`.
A branch renomeava as 3 chaves para `['talkx-*-palette']`.

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/integrations/useTalkXCommandItems.ts` | **INCORPORADA de outra forma** — a main isolou as mesmas 3 queries com subchave `'cmd-palette'` (mantém a família `talkx-*`, então as `invalidateQueries({queryKey:['talkx-campaigns']})` de `useTalkX.ts:277-541` ainda alcançam a paleta; abordagem superior à da branch) | `git show origin/main:src/hooks/integrations/useTalkXCommandItems.ts` linhas 39, 55, 71: `queryKey: ['talkx-campaigns', 'cmd-palette']`, `['talkx-segments', 'cmd-palette']`, `['talkx-templates', 'cmd-palette']`; commit `e903a7e51 fix(talkx): isola queryKeys do cmd-palette para evitar cache poisoning (#2869)`, 2026-11-13, que também ajustou `src/hooks/integrations/__tests__/useTalkXCommandItems.test.ts` e `src/components/keyboard/__tests__/paleta-unica.test.tsx` para as novas chaves |

As 3 linhas `missing_in_main` (`'talkx-*-palette'`) são apenas o texto literal escolhido pela branch; o comportamento (chave distinta da tela completa) está na main.

## Veredito
**INCORPORADA** (confiança alta). Nada a recuperar. Branch pode ser apagada; PR #2866 superada por #2869.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Branch pode ser apagada.** Tentei refutar e não achei nenhum hunk de valor fora da main.

### 1. O diff da branch é integralmente 3 linhas — não há nada "escondido"
`git diff 9183f0f6 origin/claude/fix-talkx-command-cache-261108-2320 --stat` →
`src/hooks/integrations/useTalkXCommandItems.ts | 6 +++---  (1 file changed, 3 insertions(+), 3 deletions(-))`.
Os 3 hunks são só `queryKey: ['talkx-campaigns'] → ['talkx-campaigns-palette']` (L36), idem `talkx-segments` (L51) e
`talkx-templates` (L66). Zero testes, zero outros arquivos, zero migrations/edges/workflows. Logo o universo de lacunas
possíveis é exatamente essas 3 linhas — e são as 3 do `line_check.missing_sample`.

### 2. A main cobre a necessidade, verificado no arquivo da main
`git show origin/main:src/hooks/integrations/useTalkXCommandItems.ts`:
- L39 `queryKey: ['talkx-campaigns', 'cmd-palette'],` (comentário em L36 explica o isolamento)
- L55 `queryKey: ['talkx-segments', 'cmd-palette'],` (comentário L54)
- L71 `queryKey: ['talkx-templates', 'cmd-palette'],` (comentário L70)

São as **mesmas 3 queries**, com o mesmo `select` reduzido (L43 `'id, name, status'`, L59/L75 `'id, name'`),
mesmo `.limit(50)` (L45/61/77) e mesmo `staleTime: 60_000` (L50/66/82). Chave distinta da tela completa ⇒ no React Query
as entradas de cache são distintas (hash da chave inteira), então o `select` reduzido da paleta não escreve mais na
entrada das telas. O crash original (`TalkXTemplates.tsx` em `t.tags.map`, `TalkXOverview.tsx:191` em
`c.message_template.toLowerCase()`) está resolvido na main. **A necessidade está coberta, não só o texto.**

Commit: `e903a7e514191d3c7d6f8bb9957e3ee9af69de5f` (2026-11-13) `fix(talkx): isola queryKeys do cmd-palette para evitar
cache poisoning (#2869)`. Confirmei que está em `origin/main`: `git merge-base --is-ancestor e903a7e51 origin/main` → 0.

### 3. Não foi revertido depois
`git grep -n "talkx-campaigns-palette\|talkx-segments-palette\|talkx-templates-palette" origin/main -- src/` → **vazio**
(o texto da branch nunca entrou, como esperado), e `git grep -n "cmd-palette" origin/main -- src/` mostra as 3 chaves
vivas no hook **mais os testes atualizados**: `src/hooks/integrations/__tests__/useTalkXCommandItems.test.ts:14,17,18,33,36,37,52,53,56`
e `src/components/keyboard/__tests__/paleta-unica.test.tsx:53,54,55`. A main está mais completa que a branch (a branch
não tocou teste nenhum).

### 4. A abordagem da main é superior — aplicar a branch seria regressão
`['talkx-campaigns', 'cmd-palette']` continua dentro da família `['talkx-campaigns']`, então as invalidações por prefixo
ainda alcançam a paleta: `useTalkX.ts:277,329,360,384,397,418,444,474,505,516,532,541` e
`useTalkXCampaignList.ts:403` (`invalidateQueries({ queryKey: ['talkx-campaigns'] })`), além de
`useTalkXSegments.ts:742` para segmentos. Com o sufixo `-palette` da branch (`'talkx-campaigns-palette'` é uma chave de
família **diferente**), nenhuma dessas 12+ invalidações chegaria à paleta: depois de criar/editar/excluir campanha o
Ctrl+K mostraria dados velhos por até 60 s de `staleTime` sem nunca ser invalidado. A convenção de subchave da main
também é a já documentada em `useTalkXCampaignList.ts:18` ("A chave da lista vive DENTRO da família `['talkx-campaigns', …]`")
e usada em `useTalkXCampaignList.ts:216,334,386,389,394,474` (`'list'`, `'detail'`). **Recuperar a branch pioraria o código.**

### 5. Sem lacunas adicionais
Nenhum arquivo além do hook; nenhum identificador/string da branch ausente da main com valor próprio.
Apagar a branch fecha a PR #2866 (superada pela #2869) — nada se perde.
