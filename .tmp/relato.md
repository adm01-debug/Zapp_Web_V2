Especialista: senior (area-front-hooks; área de componente Talk X — skill area-front-componentes não existe neste perfil, usei a skill disponível de front/hooks e as skills de refazer).

# [refazer 2] TL-126 — Talk X TemplateEditor: variações A/B recompiladas na ponta do dia

## Ponto 1 — "rebase/merge do commit aprovado f5307f0df sobre a ponta atual sem deixar conflito"
O que mudei:
- Rodei `git cherry-pick -n f5307f0dfd` sobre `dia/2026-10-13`. Ele ficou vermelho com conflito em `src/components/talkx/TalkXTemplateEditor.tsx` e `src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx`.
- Resolvi os conflitos preservando o que a ponta atual já tinha: `TalkXMessagePreview`, o painel/gaveta responsivo X193, o card `Desempenho deste template`, o histórico e os testes de corrida já existentes.
- Mantive a entrega TL-126: `TalkXTemplateVariants.tsx` novo, `talkxVariants.ts` com regras puras de peso/labels/erro em uso, integração com `fetchVariants`, `saveVariant`, `deleteVariant`, `countVariantRecipients`, testar variante e declarar vencedora.
- Ajuste importante da resolução: a seção Variações A/B ficou dentro do `painelLateral`, não no centro fixo, porque a ponta atual exige que prévia, variações e histórico apareçam pela gaveta abaixo de 1280 px.

Prova vermelha antes:
- `git cherry-pick -n f5307f0dfd` → `CONFLICT (content): Merge conflict in src/components/talkx/TalkXTemplateEditor.tsx` e `CONFLICT (content): Merge conflict in src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx`.
- Antes de mover as variações para o painel/gaveta da ponta, `bunx vitest run ...TalkXTemplateEditor.painelMenor.test.tsx ...` ficou vermelho: `Unable to find an accessible element with the role "button" and name /variante/i` no teste `em 1024 px (e 390 px) a prévia, as variações e o histórico vêm pela gaveta do cabeçalho`.

Prova verde depois:
- `bunx vitest run src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx src/components/talkx/__tests__/TalkXTemplateEditor.painelMenor.test.tsx src/components/talkx/__tests__/TalkXTemplateEditor.states.test.tsx src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx src/components/talkx/__tests__/TalkXMessageEditor.test.tsx` → `Test Files 5 passed (5)` / `Tests 51 passed (51)`.
- `git diff --cached --check` → sem saída (sem conflito/whitespace inválido).

## Ponto 2 — "rodar os testes afetados e manter os testes do trabalho anterior"
O que mudei:
- Mantive `src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx` e acrescentei o wrapper `QueryClientProvider` necessário para renderizar o editor atual, que agora lê estatísticas via React Query.
- Mockei `useTalkX` nesse teste para não abrir WebSocket real em Vitest; o teste continua provando o componente/editor real e mocka só a fronteira externa.
- Em `TalkXTemplateEditor.race.test.tsx`, mantive os testes de corrida do editor atual e os casos TL-126 de salvar conjunto, descartar resposta atrasada e confirmar exclusão de variante com envios.

Prova verde depois:
- `bunx vitest run src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx` → `Test Files 2 passed (2)` / `Tests 30 passed (30)`.
- Regressão ampliada do módulo Talk X afetado: `bunx vitest run src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx src/components/talkx/__tests__/TalkXTemplateEditor.painelMenor.test.tsx src/components/talkx/__tests__/TalkXTemplateEditor.states.test.tsx src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx src/components/talkx/__tests__/TalkXMessageEditor.test.tsx` → `Test Files 5 passed (5)` / `Tests 51 passed (51)`.
- `bunx eslint src/components/talkx/TalkXTemplateEditor.tsx src/components/talkx/TalkXTemplateVariants.tsx src/components/talkx/talkxVariants.ts src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx` → exit 0, sem saída.

## Ponto 3 — verificação rápida do projeto
Prova:
- `zapp-verify "$PWD" --rapido` → `OK db_guard 0s`; `OK tipos 166s`; `OK lint 5s`; `OK migrations 1s`; `VERIFY: VERDE SEM BANCO (172s)`.
- Observação: o comando literal `zapp-verify --rapido` neste ambiente interpreta `--rapido` como caminho e devolve `cópia não encontrada`; rodei a forma aceita pela ferramenta local, `zapp-verify "$PWD" --rapido`.
- Tentativas anteriores de `bun run typecheck` e `bunx tsc -p tsconfig.app.json --noEmit --pretty false` foram encerradas pelo kernel com exit 137/SIGKILL (OOM). A prova válida de tipos ficou no `zapp-verify "$PWD" --rapido`, que concluiu `OK tipos 166s`.

## Arquivos do diff
src/components/talkx/TalkXTemplateEditor.tsx
src/components/talkx/TalkXTemplateVariants.tsx
src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx
src/components/talkx/__tests__/TalkXTemplateVariants.test.tsx
src/components/talkx/talkxVariants.ts

## Autorrevisão de escopo e risco
- Diff medido: `5 files changed, 1100 insertions(+), 119 deletions(-)`, `diff_chars 67246` — abaixo do teto de 90 mil caracteres.
- Sem migration, Edge Function, CI, manifesto, arquivo de guarda ou produção.
- Sem identificador do banco de produção; varredura local dos 5 arquivos não encontrou `<<<<<<<`, `=======`, `>>>>>>>` nem o identificador proibido.
- O caminho de erro novo não é silencioso: `saveVariantSet` mostra `toast.error(...)` quando pesos não fecham 100% ou quando a gravação falha; exclusão em uso mantém a variante na tela e o teste cobre `talkx_variant_in_use`.
- Não usei `window.confirm`; a confirmação de exclusão com envios fica no fluxo do componente de variações e os testes cobrem que `deleteVariant` só roda depois de confirmar.

## Aviso do juiz barato sobre "merge dia/2026-10-09" e "zapp-verify full"
- O aviso sobre merge/rebase não é algo que apareça no diff: a prova operacional é o comando vermelho registrado no Ponto 1 (`git cherry-pick -n f5307f0dfd` conflitou nos 2 arquivos citados) e o diff final sem marcadores. O workspace nasceu em `dia/2026-10-13`; por isso não há merge commit de `dia/2026-10-09` no diff.
- Rodei também a verificação full depois do aviso: `zapp-verify "$PWD" full` → `OK db_guard 0s`; `OK tipos 13s`; `OK lint 134s`; `OK migrations 1s`; `FALHOU travas 0s`; `ERRO: conjunto full não está de pé`; `VERIFY: VERMELHO em travas (148s)`. Log lido em `/home/joaquim_ataides/.local/state/zapp-verify/d6bc2da1d0eb/travas.log`: contém só `ERRO: conjunto full não está de pé`. `jev-juiz falha` não conseguiu classificar (`other`, certeza 0.16). Isso é ambiente/conjunto full indisponível, não erro dos 5 arquivos do diff; a verificação rápida do cartão está verde com tipos/lint/migrations.
