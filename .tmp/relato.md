Especialista: iris
## Pontos da recusa (refazer 1, rodada 1 de 2)
- Ponto 1 (chave no diff): os testids do campo Prazo ainda usavam o prefixo com o nome do modulo, cuja sequencia interna o detector do fechar le como chave (o mesmo falso positivo que tirou os testids do Lembrete e da coerencia na entrega anterior). Troquei o prefixo por nt- em `src/components/tasks/shared/new-task/PrazoField.tsx` (linhas 31-33, 43, 45, 58, 60, 76, 87: testids, ids e htmlFor) e nos dois testes que dirigem o campo (`NewTaskDialog.prazo.test.tsx` e `NewTaskDialog.coerencia.test.tsx`, funcao definirPrazo). Prova: antes, `grep -rn` listava 21 ocorrencias em 3 arquivos nas linhas adicionadas; depois, 0 ocorrencias em `src/` e 0 sequencias do padrao nas linhas adicionadas do diff (conferido de novo apos este relato).
- Ponto 2 (verificacao completa): `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (10s)` (sem banco porque o cartao nao mexe em banco). Vizinhanca: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 45 passed (45); Tests 557 passed | 1 todo (558)`. Foco: os 3 arquivos de teste do modal → `Test Files 3 passed (3); Tests 21 passed (21)`. `npx eslint` nos 4 arquivos de codigo/teste → limpo. `npx tsc --noEmit` → exit 0.
## O que a etapa 163 entrega (resumo)
- `src/components/tasks/shared/new-task/CoerenciaLembrete.tsx` (novo): banner derivado de `checkRemindCoherence` (`workItemPresets.ts`, etapa 162, sem reimplementar comparacao) — verde `Lembrete programado para antes do prazo.` (role status), ambar `O lembrete precisa ser antes do prazo.` / `Sem prazo definido — nao ha como comparar o lembrete com o prazo.` (alert/status), vermelho `O lembrete precisa estar no futuro.` (alert); botao `Ajustar para 1 h antes do prazo` (h-10, foco visivel) so quando o alvo de 1 h antes resolve (vira verde e sai de cena; prazo vencido nao oferece atalho).
- `src/components/tasks/shared/NewTaskDialog.tsx`: monta PrazoField + CoerenciaLembrete + RemindField, sem estado novo (coerencia derivada a cada render).
- Plano secao 3.4, linha 443 da tabela (item de confirmacao verde das etapas 162-163).
## FAIXA DO PAI
- Commits `16350208f1` (etapa 159), `d3100bd06f` + `1dd5b55a9a` (etapa 160): casco dos cartoes-irmaos trazido por cherry-pick porque a base `dia/2026-10-13` nao tinha o modal — nao sao deste cartao. Entrega 163: `661663154f` + fixes `be562aa71d`/`73ecb3b762` + este refazer `ace96bd270`.
## O que NAO fiz e por que
- Nao rebaseei sobre a `dia/2026-10-14` (a etapa 164 entrou la e mexeu no mesmo dialogo): o cartao manda corrigir so o apontado; a juncao com o bloco Destino e do integrador.
- Nao toquei `workItemPresets.ts`/`workItemFormat.ts` (fora dos arquivos do cartao).
## Arquivos (`git diff --name-only <base>...HEAD`, colado)
.tmp/relato.md
src/components/tasks/__tests__/NewTaskDialog.coerencia.test.tsx
src/components/tasks/__tests__/NewTaskDialog.lembrete.test.tsx
src/components/tasks/__tests__/NewTaskDialog.prazo.test.tsx
src/components/tasks/shared/NewTaskDialog.tsx
src/components/tasks/shared/new-task/CoerenciaLembrete.tsx
src/components/tasks/shared/new-task/PrazoField.tsx
src/components/tasks/shared/new-task/RemindField.tsx
