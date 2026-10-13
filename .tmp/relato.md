Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/ai-tools/ToolPanel.tsx`: o painel flutuante passou a se comportar como diálogo modal — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apontando para o `<h3>` do título, fechar no Esc e foco preso (Tab/Shift+Tab), devolvido ao gatilho ao fechar. Não usei o `Dialog` do Radix: o painel é um modal ANINHADO no corpo da conversa (posicionado com `absolute` dentro do chat), e o Portal do Radix o moveria para o viewport inteiro, mudando o layout; `role`/`aria-modal`/Esc/foco foram implementados no próprio painel.
- `src/components/inbox/ai-tools/PeriodFilterSelector.tsx`: o "remover filtro" era um `<span role="button">` DENTRO do `<button>` gatilho (controle interativo aninhado, fora do alcance do teclado); virou um `<button type="button">` irmão do gatilho, com `aria-label="Remover filtro de data"`. Os atalhos de período e o "Limpar datas" ganharam `type="button"`. Removida a escala `scale-[0.7]` (que encolhia caixa, texto e alvos de toque); a coluna de atalhos virou `w-40` e os alvos de toque, `min-h-11` (44px).
- `src/components/inbox/ai-tools/VisionIcon.tsx`: `svg` decorativo com `aria-hidden="true"` e `focusable="false"`.
- `src/components/inbox/summary/SummaryResult.tsx`: o botão só-ícone de ouvir ganhou `aria-label={label}`.
- `src/components/inbox/ObjectionDetector.tsx`: botões só-ícone Copiar/Reescrever/Reanalisar com `aria-label`; estado de carregamento com `role="status" aria-live="polite"` e estado de erro com `role="alert"`.
- `src/components/inbox/UniversityHelp.tsx`: erro com `role="alert"` e região `role="status" aria-live="polite"` que anuncia "Gerando resposta...".
- `src/components/inbox/ConversationSummary.tsx` e `src/components/inbox/AIConversationAssistant.tsx`: bloco de carregamento com `role="status" aria-live="polite" aria-atomic="true"`; botão X do aviso de áudio com `aria-label="Dispensar aviso de áudio"` e ícone `aria-hidden`.
- `src/components/inbox/ai-tools/HistoryTab.tsx`: quando `sentiment_score`/`message_count` vêm `null`, a tela mostra "—" em vez de "%" e "msgs" soltos; o histórico não propaga mais `null` para o resumo (`?? undefined`).
- `src/components/inbox/ai-tools/SentimentTab.tsx`: o cast de `agentPerformance` para `[string, number][]` virou filtro em tempo de execução — valor que não é número finito não é renderizado (não quebra a barra de desempenho).

Estados conferidos nas telas alteradas: carregando e erro (Objeções, Ajuda dos Universitários, Resumo, Visão) e vazio (Objeções sem resultado, histórico sem análises), todos com papel/`aria-live` corretos.

## Prova
- vermelho antes: `bash .tmp/prova-vermelho.sh` (fontes revertidos para `HEAD~1`, sem stash) → `Test Files 2 failed (2); Tests 17 failed | 2 passed (19)`
- verde depois: `npx vitest run <2 arquivos novos + 7 de regressão>` → `Test Files 9 passed (9); Tests 51 passed (51)`
- tipos: `npx tsc -b --force` → sem saída, exit 0
- lint do commit: ratchet "baseline=12, atual=12, novas=0"

## O que NÃO fiz e por quê
- Não usei o `Dialog` do Radix no `ToolPanel` (motivo acima, no primeiro item). O cartão dizia "se couber" — não coube sem mudar o layout do modal aninhado.
- Nenhum arquivo fora de `src/components/inbox/**` foi tocado.
