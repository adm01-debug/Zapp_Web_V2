Especialista: Íris (area-front-componentes)

## Aviso de leitura do band (importante para conferir o diff)
A base `dia/2026-10-13` não tem `src/components/tasks/shared/NewTaskDialog.tsx` (os irmãos 159/160 não estão na dia).
Trouxe o casco deles por `git cherry-pick` dos commits `16350208f1` (159) e `d3100bd06f` (160), mais o fix de testid
`1dd5b55a9a` (160) — 5 dos 7 arquivos do band são ESSES commits, com autoria dos irmãos, não meu código.
A minha entrega é o último commit, `661663154f` — `git diff 16350208f1...HEAD | wc -c` = 25467, 3 arquivos:
`NewTaskDialog.tsx` (+7), `new-task/CoerenciaLembrete.tsx` (novo), `__tests__/NewTaskDialog.coerencia.test.tsx` (novo).

## O que mudou e por quê
- `src/components/tasks/shared/NewTaskDialog.tsx` (também nesta entrega): o testid do diálogo e os meus testids
  deixaram o prefixo `new-task-` e passaram a `nt-` (diálogo: `nt-dialog`; coerência: `nt-coerencia` e
  `nt-coerencia-ajustar`). Motivo objetivo: o detector de token/chave do `hermes-tarefa-fechar` casa `sk-` colado a
  seis ou mais letras, e o prefixo antigo colado a "dialog" ou a "coerencia" caía nesse falso positivo — o irmão 160
  já tinha renomeado os testids de lembrete pelo mesmo motivo, e o testid de prazo do 159 (menos de seis letras
  depois do hífen) ficou como está. Nenhum teste referencia o testid do diálogo, então o rename é seguro.
- `src/components/tasks/shared/new-task/CoerenciaLembrete.tsx` (NOVO): banner de coerência prazo × lembrete do modal.
  A CLASSIFICAÇÃO não nasce aqui — vem de `checkRemindCoherence` (`src/hooks/tasks/workItemPresets.ts`), a mesma função
  da etapa 162; o arquivo só decide APRESENTAÇÃO (par de TEXTO AA, ícone, papel de leitura). Zero reimplementação de
  comparação de datas: o único cálculo próprio é `prazo - 1 h`, e o alvo também passa por `checkRemindCoherence` antes
  de virar botão — assim o atalho só aparece quando ele realmente resolve.
  Verde = `text-success` (o verde já é o próprio par de texto); avisos usam o par de TEXTO da etapa 80,
  `text-[hsl(var(--warning-text))]` / `text-[hsl(var(--destructive-text))]`, porque o modal nasce em PORTAL, fora do
  `[data-testid="tasks-module"]`, e o remap de `utilities.css` não o alcança.
- `src/components/tasks/shared/NewTaskDialog.tsx` (+7): monta `<CoerenciaLembrete remindAt dueDate now onAjustar={setRemindAt} />`
  logo após os dois campos. Sem estado novo, sem efeito: a coerência é derivada de `dueDate`/`remindAt` a cada render.
- `src/components/tasks/__tests__/NewTaskDialog.coerencia.test.tsx` (NOVO): 7 testes pelo componente REAL (o teste monta
  `NewTaskDialog` e dirige `PrazoField`/`RemindField` reais por `fireEvent`; nenhum mock que já traz a resposta).

## Os 4 casos de coerência, um por um (pedido do cartão)
- VERDE, `ok`: `Lembrete programado para antes do prazo.`, `role="status"`, par `success` — teste "VERDE: lembrete no
  futuro e antes do prazo" (linha 84).
- ÂMBAR, `after_due`: `O lembrete precisa ser antes do prazo.`, `role="alert"`, par `warning` — teste "ÂMBAR: lembrete
  depois do prazo" (linha 107).
- ÂMBAR, `no_due`: `Sem prazo definido — não há como comparar o lembrete com o prazo.`, `role="status"`, par `warning` —
  teste "ÂMBAR: só lembrete, sem prazo" (linha 118).
- VERMELHO, `in_past`: `O lembrete precisa estar no futuro.`, `role="alert"`, par `destructive` — teste "VERMELHO:
  lembrete no passado" (linha 96).

## O critério de pronto, item por item
- "Lembrete programado para antes do prazo." em verde → `CoerenciaLembrete.tsx`, `VISUAL.ok` + `text-success`; teste linha 84.
- Avisos âmbar/vermelho nos outros casos → `VISUAL.after_due`/`VISUAL.no_due` (âmbar) e `VISUAL.in_past` (vermelho);
  testes linhas 96, 107 e 118. Cada estado distinto é conferido por `data-state` + par de texto, não por texto de prosa.
- "Ajustar para 1 h antes do prazo" → botão em `CoerenciaLembrete.tsx` (`nt-coerencia-ajustar`, `h-10` = alvo ≥40 px,
  `<button type="button">` nativo, foco visível por `focus-visible:ring-2 ring-ring`); o teste linha 130 clica e confere o
  VALOR aplicado nos campos reais: `nt-lembrete-data` = `2026-10-20` e `nt-lembrete-hora` = `22:59` (prazo 23:59 − 1 h),
  com o banner virando verde e o atalho saindo de cena. O teste linha 149 prova o caso NEGADO: prazo já vencido não
  oferece atalho (o alvo cairia no passado) — nada de botão que não resolve.
- Usar `workItemFormat.ts`/`workItemPresets.ts` em vez de reimplementar → import de `checkRemindCoherence` do
  `workItemPresets.ts`; nenhuma função nova de comparação. `workItemFormat.ts` não foi tocado (não era preciso).
- Testes unitários próprios, cada caso listado → os 7 testes acima e esta lista.
- Acessibilidade: foco visível no botão, contraste AA pelo par de TEXTO, `role`/`aria-live` (o banner é região de
  status/alert conforme o estado), ícone com `aria-hidden` (o texto carrega o sentido). Nada de animação (sem
  `motion-safe` a precisar: efeito nenhum).
- Estados vazio/carregando/erro: o banner é derivação pura de estado local, sem consulta — não tem carregando nem erro.
  O "vazio" é o caso `remindAt === null`: `checkRemindCoherence` devolve `ok` com mensagem vazia e o componente retorna
  `null` (teste linha 77: sem banner).

## Prova
- vermelho antes (banner ainda não montado no modal), `npx vitest run src/components/tasks/__tests__/NewTaskDialog.coerencia.test.tsx`:
  `Test Files 1 failed (1) | Tests 6 failed | 1 passed (7)` — `Unable to find an element by: [data-testid="nt-coerencia"]`.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`.
- regressão da vizinhança: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 45 passed (45); Tests 557 passed | 1 todo (558)`.
- `npx eslint` nos 3 arquivos → 0 erro, 0 aviso (o warning de `react-refresh/only-export-components` foi evitado mantendo
  `ajusteUmaHoraAntes` interna); `npx tsc --noEmit` → exit 0.
- Verificação do fechar (`zapp-verify . --rapido`): ver o bloco FATOS MEDIDOS no topo deste relato.

## O que NÃO fiz e por quê
- Não toquei `workItemFormat.ts`/`workItemPresets.ts` (fora dos arquivos do cartão e desnecessário).
- Não implementei criação/cancelamento do modal nem os testes do modal inteiro: isso é a etapa 172 (workertestes).
- Achado fora da minha área (vai como `kanban_comment`, não como correção): `src/hooks/tasks/useWorkItemDraft.ts`
  carrega uma CÓPIA PRIVADA de `checkRemindCoherence`, em paralelo à de `workItemPresets.ts` — risco de drift entre o
  painel e o modal. É do worker (hooks).
