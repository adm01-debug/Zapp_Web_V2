Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemSheet.tsx`: extraí a seção "Planejamento" para um componente próprio, liguei o componente e acrescentei o contador da descrição e a linha discreta "Criada em ...". O arquivo já estava acima de 500 linhas, que é o teto do ratchet do CI: ele só podia encolher, e passou de 626 para 549 linhas.
- `src/components/tasks/shared/sheet/PlanejamentoSection.tsx` (novo): etapa 137 — dois cartões, Prazo ("Até quando concluir") e Lembrete ("Quando avisar você"), cada um com data ("Hoje, 11/10") e hora ("18:00") (§3.3, linha `"Planejamento": Prazo ("Até quando concluir") e Lembrete ("Quando avisar você") com data e hora | 137–138`); etapa 138 — os avisos do lembrete; etapa 139 — a linha "✓ Agendado · Adiar ▾ · Remover" (§3.3, linha `"✓ Agendado · Adiar ▾ · Remover" | 139`) ligada às mutations que já existiam (`onSnooze(item, ...)` e `onSetReminder(item, null)`), sem mutation nova.
- `src/components/tasks/shared/sheet/planejamento.ts` (novo): regra única da validação do lembrete (`avaliarLembrete`) e do rótulo da data de criação (`formatCriadaEm`), fora do componente, para o teste unitário provar sem montar tela.
- `src/components/tasks/__tests__/WorkItemSheet.planejamento.test.tsx` (novo): os testes das quatro etapas.

## Decisões declaradas
- Etapa 138 com três tons, nenhum literal: verde `text-success` "Agendado" (lembrete antes do prazo, ou sem prazo); âmbar `hsl(var(--warning-text))` "Lembrete depois do prazo"; vermelho `hsl(var(--destructive-text))` "Lembrete no passado". Os dois tokens de TEXTO existem nos dois modos (`src/styles/tokens.css`), o mesmo par que o `DateLabel` já usa.
- "Cada um com data e hora": a data fica no botão ("Hoje, 11/10") e a hora num campo `type="time"` separado ("18:00"), como na etapa 137. O primitivo `DateLabel` não atende aqui: ele só sabe `'day'` ("09 out.") ou `'datetime'` ("Hoje, 11/10 18:00", hora colada à data). O botão usa `formatWorkItemFieldDate`/`formatWorkItemField` do `workItemFormat.ts` (cartão T04), a MESMA regra única de datas — nada de data foi reimplementado.
- Contador da descrição = número de caracteres (etapa 140 não define limite e o banco não tem `maxLength` para `description`), com singular/plural correto.
- `src/hooks/tasks/workItemPresets.ts` (cartão T04) não existe no workspace: o cartão pai o tirou do branch (etapas 148/149/159/161 são de outros cartões). Os atalhos que a etapa 139 pede (15 min, 1 h, Amanhã 9h) já existiam nesta tela e seguem como estavam.
- Alvos com 40 px (`h-10`) nos botões de data, campos de hora, "Adiar" e "Remover"; a linha de ações é `flex-wrap` e os cartões viram uma coluna abaixo de `sm` — sem rolagem horizontal em 360/768/1280.
- Sem exportar, baixar ou imprimir: nada disso foi tocado.

## Prova
- vermelho antes: mutei a regra do lembrete no passado (`avaliarLembrete`, a checagem passou a `false &&`) e rodei `npx vitest run src/components/tasks/__tests__/WorkItemSheet.planejamento.test.tsx` → `Tests 2 failed | 12 passed (14)` (casos "138: lembrete no passado avisa em vermelho" e "138: lembrete no passado é vermelho").
- verde depois: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.planejamento.test.tsx` → `Test Files 1 passed (1); Tests 14 passed (14)`.
- painel/sheet que já existiam: `npx vitest run src/components/tasks/__tests__/WorkItemSheet.test.tsx src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` → `Test Files 2 passed (2); Tests 32 passed (32)`.
- área de Tarefas: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 34 passed (34); Tests 401 passed | 1 todo (402)`.
- tipos: `npx tsc -b --force` → sem saída, exit 0. lint dos arquivos tocados: `npx eslint src/components/tasks/shared/WorkItemSheet.tsx src/components/tasks/shared/sheet/ src/components/tasks/__tests__/WorkItemSheet.planejamento.test.tsx` → exit 0.
- acessibilidade: o axe do `WorkItemSheet.test.tsx` (caso "N-082") roda sobre o Sheet inteiro, agora com a seção nova, e passou na execução acima.

## Casos de teste deste cartão
- 137: a seção "Planejamento" traz os dois cartões com os rótulos, o prazo em "Hoje, dd/MM" com a hora 18:00 e o lembrete em "Hoje, dd/MM" com a hora 19:00.
- 138: lembrete no passado é vermelho; lembrete depois do prazo é âmbar; lembrete antes do prazo mostra "Agendado" verde; sem prazo e lembrete no futuro também mostra "Agendado".
- 139: a linha do lembrete traz "Agendado", o "Adiar" com as três opções e o "Remover"; "Adiar → 15 min" chama `onSnooze`; "Remover" chama `onSetReminder(item, null)`.
- 140: o contador da descrição acompanha a digitação; "Criada em 9 out. 2026" vem de `created_at`; a caixa de descrição é redimensionável (`resize-y`).
- `avaliarLembrete` (unitário): sem lembrete não há aviso. `formatCriadaEm` (unitário): dia sem zero à esquerda e mês curto pt-BR.

## O que NÃO fiz e por quê
- Não toquei em `src/components/ui/*`, não criei migration, Edge Function nem dependência.
- Diferença de escopo: os arquivos de `shared/` e `hooks/tasks/` que aparecem no diff contra `dia/2026-10-11` vêm do cherry-pick da faixa do cartão pai (t_5f27cbe9) — não são edição deste cartão; o meu commit (`feat(tarefas): painel com secao Planejamento ...`) mexe só nos 4 arquivos listados acima.
- Não li as imagens 03.png (não há ferramenta de visão nesta sessão): a conferência foi feita contra a §3.3 do plano (as três linhas citadas no "O que mudou") e as etapas 137–140, que são a referência de aceite do cartão.
