Especialista: senior (area-front-componentes)

## O que mudou e por quê
- src/components/admin/PlaybooksManager.tsx
  - `save()` agora descarta passo vazio e REGRAVA `order` em sequência (1..N) antes de gravar: o banco deixa de
    receber ordem com buraco (ex.: 1 e 3 quando o passo 2 ficou em branco). A leitura preserva a ordem gravada
    (o `save()` grava os passos já renumerados em sequência); a consulta ordena os playbooks por `category`.
  - Diplomacia do erro: `loadPlaybooks()` checa `error` e mostra estado explícito de erro com "Tentar novamente";
    antes, falha de consulta caía no mesmo "Nenhum playbook criado" do estado vazio (a tela mentia).
  - `save()` ficou travado (ref síncrona + botão desabilitado + estado "Salvando..."): clique duplo grava uma vez.
  - Excluir saiu do `window.confirm` para o `AlertDialog` do design system; a remoção só é confirmada
    depois de checar `error` da mutation (erro → toast de erro, sem toast de sucesso).
  - Campo **Ativo** no diálogo de criação/edição (`Switch`, ligado a `is_active`) e selo "Inativo" no card
    quando o playbook está desligado — o campo existia só na leitura.
  - Teclado: o card é focável (`tabIndex=0`), abre o detalhe com Enter/Espaço, tem `aria-label`, anel de foco e os
    botões de ação aparecem com `focus-within` (antes só no hover). Os botões de ação seguem sendo `<button>` com
    `aria-label` ("Editar playbook", "Excluir playbook").
- src/components/admin/__tests__/PlaybooksManager.test.tsx (novo): prova os itens acima no componente REAL (não em mock),
  com o client do Supabase mockado por tabela e `sonner` mockado para observar os toasts.

## Prova
- comando: `npx vitest run src/components/admin/__tests__/PlaybooksManager.test.tsx`
  - vermelho antes (os 6 testes originais rodados sobre a versão da base, obtida com `git show HEAD:<arquivo>`):
    `Test Files 1 failed (1)` / `Tests 6 failed (6)`
  - vermelho do ponto do juiz (o 7º teste, rodado com a linha de guarda removida — sem o
    `event.target !== event.currentTarget`): `Tests 1 failed | 6 passed (7)`
  - verde depois: `Test Files 1 passed (1)` / `Tests 7 passed (7)`
- sem regressão no diretório vizinho: `npx vitest run src/components/admin/__tests__`
  → `Test Files 17 passed (17)` / `Tests 57 passed (57)`
- lint do pre-commit (ratchet): `OK: nenhuma nova divida de lint foi introduzida.` (`baseline=1, atual=1, novas=0`)

## Ponto do juiz adversarial (procedia — corrigido com commit novo)
Ponto 1 (Critério 3 — teclado): o `onKeyDown` do card pegava Enter/Espaço vindos dos botões Editar/Excluir (o evento
borbulha) e o `preventDefault` engolia o clique do botão. Corrigi em `PlaybooksManager.tsx`: o card só abre o detalhe
quando o alvo é o próprio card (`if (event.target !== event.currentTarget) return;`). Prova: novo teste
"Enter/Espaço nos botões de ação não abre o detalhe..." em `src/components/admin/__tests__/PlaybooksManager.test.tsx`,
vermelho com a guarda removida e verde com ela.

## Refazer 1 (só o relato — nenhum código foi alterado neste refazer)
Ponto 1 (afirmação falsa na leitura): o relato dizia que a lista passou a ser ordenada por `order` na leitura — o código não faz isso (a consulta ordena os playbooks por `category` e os passos vão para a tela na ordem gravada, que o `save()` já renumera em 1..N). Removi a frase e descrevi o comportamento real no item do `save()` acima.
Ponto 2 (excluir com RLS silenciosa): o `confirmDelete()` em `src/components/admin/PlaybooksManager.tsx` trata só o `error` retornado; ver observações abaixo.

## Observações (para o revisor — comportamento fora do pedido, não alterado)
- Excluir sob RLS silenciosa: se uma policy negar o `delete` sem retornar erro (0 linhas afetadas), o `confirmDelete()` mostra "Playbook removido" e recarrega a lista (que continua mostrando o item). O tratamento cobre só o `error`, como o cartão pede; detectar 0 linhas afetadas (ex.: conferir retorno) é melhoria fora do escopo deste cartão.

## Estados da tela (conferidos)
- vazio: "Nenhum playbook criado" — só quando a consulta deu certo e voltou sem linhas.
- carregando: skeleton.
- erro: mensagem explícita + botão "Tentar novamente" (não confunde com o vazio).

## Decisão de acessibilidade (para o revisor não ler como divergência)
O cartão pede o card operável por teclado. Não usei `role="button"` no card porque ele CONTÉM os botões
Editar/Excluir: `role="button"` com botão dentro é botão-dentro-de-botão (axe acusa `nested-interactive`). Segui o
padrão já aprovado no repositório (`WorkItemCard`, `TalkXTemplates`): `role="article"` + `tabIndex=0` + `onKeyDown`
Enter/Espaço + `aria-label`. O card abre o detalhe pelo teclado do mesmo jeito, sem aninhar controles.

## O que NÃO fiz e por quê
- Não criei botões de mover passo (↑/↓) no diálogo: o critério deste cartão é reordenar/renumerar a ordem na gravação;
  reordenar passos por botão é de outro cartão (evito regra a mais).
- Não mexi em hook/service do Supabase (`is_active` continua gravado direto pelo componente, como o resto do arquivo);
  a leitura/estado de `is_active` fora da tela está no cartão filho do perfil de hooks (t_a6400eda).
