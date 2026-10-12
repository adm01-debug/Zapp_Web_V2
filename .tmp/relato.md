Especialista: iris

(Área/escopo: area-front-componentes — telas e componentes. A primeira linha é exatamente
`Especialista: iris`, como o cartão manda.)

## O que mudou e por quê
- `src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx`: acrescentei o caso
  `144: o Esc sem alteração é consumido (fireEvent devolve false) e fecha uma única vez`, que
  faltava. Ele dispara o Escape sem alteração no painel real e prova (a) o consumo do evento
  (`fireEvent.keyDown(...)` devolve `false`) e (b) que o fechamento passa UMA única vez pelo
  `onOpenChange` (`toHaveBeenCalledTimes(1)`).
- Nenhum arquivo de produção mudou neste refazer: o `WorkItemSheet.tsx` já consumia o Escape
  (`event.preventDefault()` no `onEscapeKeyDown`) e é o teste que passou a comprovar isso.

## Como o Escape do painel funciona aqui (para não confundir com "signature" de outra área)
O painel usa o `onEscapeKeyDown` do Radix: quando já há alteração pendente ele chama
`event.preventDefault()` e abre "Descartar alterações?"; quando não há alteração ele chama
`event.preventDefault()` e fecha devolvendo o foco. O `preventDefault()` é o que marca o evento
como consumido — em `fireEvent`, isso aparece como retorno `false`. Não há nada de assinatura
criptográfica/HMAC neste cartão.

## Pontos do refazer
- Ponto 1: o relato anterior citava um teste que não existia e por isso não conferia o consumo do
  Escape. Regravar o teste com o nome correto e a asserção real. Feito: o caso novo acima existe,
  renderiza o componente real (`WorkItemSheet`) e nomeia-se exatamente como está no arquivo. Prova
  de não-vacuidade: removi temporariamente o `event.preventDefault()` do ramo sem-alteração do
  `WorkItemSheet.tsx` e o caso novo falhou com
  `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times` (sem o consumo, o
  Radix fecha por conta própria além do nosso fechamento: dois `onOpenChange`); restaurado o
  `preventDefault()`, o mesmo caso passa. Nenhum outro arquivo de código mudou — o
  `git diff --stat` do commit é de 1 arquivo de teste, 13 inserções.
- Ponto 2: sobre o caso 23 do mapa de inconsistências (o teste antigo usava `sheet-prio-medium` e o
  rótulo passou a `sheet-prioridade`) — NÃO é um defeito do painel e não procede como problema do
  meu diff. Vem do passo pai 134 (R2-MOD-051, tarefa de origem `t_2456ca64`), que trocou o
  `data-testid` do seletor de prioridade por `sheet-prioridade` com o widget de `select`/opção
  "Urgente"; a mesma alteração já está coberta nos testes que o diff traz. Por isso o
  `WorkItemSheet.test.tsx` aparece no diff contra a base da `dia`, mas por herança do passo pai, não
  por regressão minha.
- Ponto 3: por que `.tmp/relato.md` entra no commit: o arquivo já está RASTREADO no repositório
  (`git ls-files .tmp/` devolve `.tmp/relato.md`). A regra de `.gitignore` do projeto lista `.tmp`,
  mas não desrastreia arquivos já versionados — quem versionou o relato na primeira entrega desta
  linha usou `git add -f`. Como ele é rastreado, cada alteração do relato aparece no `git status` e
  entra no commit da entrega; por isso commito o relato junto (é o que a entrega anterior desta
  branch também fez, no commit `b9ebe50d5`).
- Ponto 4: primeira linha do relato — agora é exatamente `Especialista: iris`, como o cartão manda;
  a área (`area-front-componentes`) vem logo abaixo, entre parênteses, sem quebrar a linha exigida.

## Prova
- vermelho antes (contra o código sem o consumo do Escape, obtido removendo o `preventDefault()` do
  ramo sem-alteração e SEM commitar): `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx -t 'o Esc sem alteração é consumido'`
  → `Tests 1 failed | 17 skipped (18)` /
  `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times`.
- verde depois (código restaurado ao commitado): `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx`
  → `Test Files 1 passed (1)` / `Tests 18 passed (18)`.
- regressão relacionada: `bunx vitest run src/components/tasks/__tests__/WorkItemSheet.rodape.test.tsx src/components/tasks/__tests__/WorkItemSheet.test.tsx`
  → `Test Files 2 passed (2)` / `Tests 43 passed (43)`.
- verificação: `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.
- commit deste refazer: `b6c72ff57` (só o teste; 1 arquivo, 13 inserções).

## O que NÃO fiz e por quê
- Não mexi em código de produção, no `WorkItemSheet.tsx`, em banco, Edge Function, CI, manifesto,
  exportação/importação ou dependência.
- Não removi, pulei nem afrouxei teste: só acrescentei um caso que renderiza o painel real.
- Não reimplementei o caso 23 do mapa (R2-MOD-051): ele é herança do passo pai e já está coberto;
  alterá-lo seria fora do escopo do título.
