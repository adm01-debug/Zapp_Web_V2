# Relatório de verificação — Etapas 099 e 100 do Quadro (cartão t_54a4bcc7)

Este arquivo é o produto do cartão de verificação: relatório com evidências e lista de divergências. O código das duas
entregas aparece neste diff porque a verificação exige as duas no mesmo workspace (ver FAIXA DO PAI abaixo).

Especialista: worker (ci) (area-verificacao-ci)

## O que é este cartão
Verificação independente das Etapas 099 (t_e840b070 @ 2f08c73ee) e 100 (t_426e784f @ feb4829ee), antes do aceite.
O cartão está atribuído a vera (worker ci); o corpo dele traz a linha "Especialista: iris." da decomposição. Assino como
worker (ci), que é o perfil que executou esta verificação.

COMO VERIFIQUEI: no meu workspace, trouxe as duas entregas por merge (as duas branches partem de dia/2026-10-16 @
d723a90107; merge limpo, sem conflito). Não editei nenhum arquivo: o diff contra a branch do dia são as próprias
entregas dos pais, trazidas para poder rodar os testes e o zapp-verify sobre o conjunto.

FAIXA DO PAI: commits 2f08c73ee (cartão t_e840b070, Etapa 099) e feb4829ee (cartão t_426e784f, Etapa 100) — não são
deste cartão; entraram por merge porque a verificação exige o código dos dois no mesmo workspace.

## Arquivos que o diff muda (e de quem são)
- src/components/tasks/board/TasksBoardMode.tsx e src/components/tasks/board/BoardColumn.tsx — produção da Etapa 099 (t_e840b070).
- src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx (novo) — teste da Etapa 099.
- src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx, contratosVisiveis.test.tsx, quadroArrastarTecladoRolagem.test.tsx, quadroLarguraFocoContraste.test.tsx, taskComponents.test.tsx — testes existentes ADAPTADOS pela Etapa 099 (contratos que fixavam o carrossel de setas/dots antigo); são os 5 arquivos que a checagem mecânica cobrou, estão listados no relato do t_e840b070 e passam na suíte do Passo 4.
- src/components/tasks/__tests__/etapa100FaixaCompactaAbasD3.test.tsx (novo) — teste da Etapa 100 (t_426e784f).
- docs/tarefas/relatorio-verificacao-099-100.md — produto DESTE cartão (este relatório).

## Passo 1 — responsivo em 360/768/1280, CONFIRMADO
- Abaixo de 768 px só a coluna da aba corrente é montada (telaEstreita de src/components/tasks/shared/pointerMedia.ts,
  max-width 767) e o trilho vira grid-cols-1; de 768 a 1279 o trilho é md:grid-cols-2 lg:grid-cols-3; a partir de 1280,
  xl:grid-cols-5. Nenhum ancestral do quadro tem overflow-x-auto (o teste ancora em data-testid=board-track).
- Aritmética independente com os tokens reais (--sidebar-w: 256px e --layout-gutter: 2.25rem = 36px, em
  src/styles/tokens.css:307 e :310): 768 → 768−256−36 = 476 ≥ 2×200+12 = 412; 1024 → 732 ≥ 3×200+24 = 624; 1280 → 988,
  e (988−4×12)/5 = 188 px por faixa com xl:min-w-0. O piso de 200 px da coluna (md:min-w-[200px]) só vale no md, que é
  onde cabe.
- Leitura de src/components/tasks/board/TasksBoardMode.tsx e BoardColumn.tsx do commit 2f08c73ee.

## Passo 2 — faixa compacta e abas contra o plano, CONFIRMADO com uma limitação declarada
- Linhas do plano conferidas lendo o trecho 120–200 de
  ~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md:
  linha 137 (§3.5) = "Faixa de KPIs em uma linha com separadores (etapa 025)"; linha 133 (§3.5) = "abas sublinhadas" na
  imagem 05; linha 159 (§3.6 item 3) = dois estilos de seletor; linha 192 = decisão D2; linha 193 = decisão D3;
  linha 359 = etapa 100. As citações do relato do t_426e784f batem com o texto do plano.
- Faixa compacta: a densidade só vira `compact` no modo Quadro (TasksModule), em uma linha com separadores, sem os cards
  de 88 px. Provado pelos 5 casos da Etapa 100 (verdes; ver Passo 4).
- Abas de modo: o ModeSwitcher é preenchido com ícone e anuncia aria-pressed = decisão D3 (linha 193), que sobrepõe as
  "abas sublinhadas" da imagem 05 (linha 133).
- LIMITAÇÃO: não abri o 05.png — este perfil não tem leitor de imagem nesta sessão. A conferência visual foi feita pela
  transcrição escrita da imagem na §3.5/§3.6 do plano e pelo texto de D2/D3. Declaro aqui para não afirmar o que não medi.

## Passo 3 — regras
- Tokens do sistema: nenhuma cor literal nem valor arbitrário de cor ADICIONADO no diff de produção (a única ocorrência
  de valor arbitrário é um `text-[13px]` numa linha REMOVIDA). OK.
- framer-motion: nenhuma ocorrência em TasksBoardMode.tsx nem em BoardColumn.tsx. OK.
- Teclado/foco: abas com roving tabIndex, setas + Home/End (caso verde no Passo 4); foco visível herdado do global
  src/styles/base.css:210 (:focus-visible) e :217 (button:focus-visible), com box-shadow de anel. OK.
- Contraste AA: medi com os tokens reais (script node sobre os valores de src/styles/tokens.css):
  claro --muted-foreground sobre --card = 6.10:1; escuro = 9.32:1; ativo --foreground sobre card = 16.99:1. Todos ≥ 4.5. OK.
- src/components/ui/*: 0 arquivos nos dois diffs. OK.
- ALVO MÍNIMO DE 40 px: NÃO PASSA — ver divergência 1 abaixo.

## Passo 4 — suíte de testes
- `npx vitest run --reporter=verbose src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx src/components/tasks/__tests__/etapa100FaixaCompactaAbasD3.test.tsx`
  → `Test Files  2 passed (2)` / `Tests  11 passed (11)` (saída completa em .tmp/vitest-dois.log).
- `npx vitest run src/components/tasks` → `Test Files  36 passed (36)` / `Tests  376 passed | 1 todo (377)`
  (saída em .tmp/vitest-tasks.log).
- Cada caso citado no relato da Etapa 100 (5 nomes) existe verbatim no arquivo e passa. OK.
- Os 6 cenários da Etapa 099 existem no arquivo e passam, mas 4 dos 6 NOMES citados no relato dela não existem no
  arquivo entregue — são paráfrases de uma versão anterior. Ver divergência 2.

## Passo 5 — zapp-verify
`zapp-verify . --rapido` (saída em .tmp/zapp-verify.log):

    OK      db_guard        0s
    OK      tipos        1280s
    OK      lint           10s
    OK      migrations      2s
    AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
    VERIFY: VERDE SEM BANCO (1292s) — o banco NÃO foi verificado

## Divergências restantes (lista explícita)
1. DEFEITO DE PRODUTO (Etapa 099): as abas de coluna do Quadro usam `min-h-9` = 36 px
   (src/components/tasks/board/TasksBoardMode.tsx:292; tailwind.config.ts:241 define "9": "2.25rem" = 36 px), abaixo dos
   40 px que o plano pede (§5, linha 184: "Alvos de toque de pelo menos 40 px (32 px só onde o plano justificar)").
   Esperado: ≥ 40 px. Observado: 36 px. Agrava: o toggle irmão, no MESMO arquivo (linha 257), usa `min-h-10 min-w-10`
   = 40 px, e essas abas só existem abaixo de 768 px, que é justamente a tela de toque. Não corrigi: o cartão manda
   descrever, não consertar.
2. RELATO × ARQUIVO (Etapa 099): 4 dos 6 nomes de caso citados no relato do t_e840b070 não existem no arquivo de teste:
   - relato "abaixo de 768px monta uma coluna por vez e as abas no topo" — arquivo: "monta uma coluna só, nomeia as abas
     e troca de coluna pelo clique";
   - relato "a tela estreita não tem rolagem horizontal nem coluna escondida" — arquivo: "nenhum contêiner do quadro
     rola de lado: o trilho é uma coluna e a faixa de abas quebra linha";
   - relato "a faixa de abas é um tablist com teclado e painel amarrado" — arquivo: "as abas andam só com o teclado
     (setas, Home e End) e mantêm um ponto de tabulação";
   - relato "é acessível na tela estreita (axe)" — arquivo: "a tela estreita do Quadro passa no axe".
   Os dois últimos nomes batem. O que os casos provam é o que o relato dizia: os cenários existem 1:1.
3. LIMITAÇÃO: o 05.png não foi aberto (sem leitor de imagem no perfil); usei a transcrição da §3 do plano.
4. zapp-verify --rapido termina sem verificar o banco local ("sem nome de conjunto") — comportamento do comando, igual ao
   das entregas dos pais; não é falha desta entrega.

## O que NÃO fiz e por quê
- Não editei nenhum arquivo de produto: o cartão é de verificação e o passo 6 manda descrever a falha, não consertá-la.
- Não rodei e2e autenticado (não foi pedido; e a regra R1 restringe e2e ao banco local).
