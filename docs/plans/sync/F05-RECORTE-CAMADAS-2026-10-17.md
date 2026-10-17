# F05 - Re-corte do resgate de `src/` por camadas de dependencia (2026-10-17)

Cartao: `[SYNC20-05] Front components: lote 1 dos PRs planejados` (t_8a9589cf).
Especialista: Iris (area-front-componentes). Branch: `v2/sync20-05-components-lote-1-26101709579290`.

## Por que este documento existe

O corte antigo (`f05_plano_prs.csv`, chunking por area de caminho, 86 PRs) colocava
um teste no meio dos componentes sem garantir que o alvo do teste estivesse no
mesmo lote. Resultado medido no lote 1: 25 testes vermelhos por alvo fora do
lote. Este documento substitui aquele corte por um corte **por camada de
dependencia**, em que nenhum lote importa arquivo de um lote posterior.

## Universo (medido agora)

- `origin/main` vs `HEAD` (`src/` apenas), commit de leitura `7a15852791828c50a9985a49659a9e13f15eaa86`:
  - `origin_only`: **426** arquivos
  - `blob_diferente` (mesmo caminho, conteudo diferente; vencedor = origin/main): **731** arquivos
  - **resgate total: 1157 arquivos** (HEAD-only ficam de fora)
- `src/types/**` (2 arquivos) entra neste corte, embora o mapa AG2 (secao 3) tenha
  reservado tipos para F12. O senior pediu "TODO o resgate de `src/`"; se F12
  reivindicar os dois, e o lote `L3-01` que perde 2 linhas.

## Regra de camada

1. **Camada base** pelo tipo de caminho (guia do senior):
   - `L0-primitivos`: `src/lib/**`, `src/components/ui/**`, `src/{utils,types,constants,i18n,config,styles,data,routes,assets,adapters}/**`,
     e tipos puros (basename `types.ts`/`types.tsx`/`types.d.ts`, inclui o gerado `src/integrations/supabase/types.ts`);
   - `L1-hooks`: `src/hooks/**`;
   - `L2-components`: `src/components/**` (fora `ui/` e testes);
   - `L3-pages-services`: `pages, services, features, providers, segments, integrations, contexts` e `src/App.tsx`;
   - `L4-testes`: `**/__tests__/**`, `*.test.ts?(x)`, `*.spec.ts?(x)`, `src/test/**`.
2. **Elevacao**: se A importa B do resgate, camada(A) >= camada(B). Itera ate
   nao sobrar aresta para tras. Quem importa componente sobe de camada.
   **168 arquivos nao-teste** ficaram acima da camada do seu tipo por isso -
   na `camada` do CSV vale a camada de dependencia, nao o tipo.
3. Dentro da camada: ordem topologica por SCC (Tarjan + Kahn) e so entao o
   chunking (teto **40 arquivos / 2500 linhas**). SCC nunca e dividido.

## Resultado

- **44 lotes**, maior lote = 40 arquivos / 2499 linhas.
- **0 arestas para lote posterior** e **0 ciclos entre lotes** (medido, nao estimado).
- Distribuicao: L0 = 2 lotes (60 arq.), L1 = 4 lotes (104), L2 = 6 lotes (204),
  L3 = 5 lotes (186), L4 = 27 lotes (603).
- `deps_de_lote` no CSV diz quais lotes precisam estar aplicados antes.

Arquivos:

- `docs/plans/sync/dados/f05_recorte_camadas.csv` - 1 linha por lote (`lote, camada, arquivos, linhas, deps_de_lote`).
- `docs/plans/sync/dados/f05_recorte_l0.csv` - lista do lote L0 executavel (`caminho, tipo, linhas, deps_no_resgate`).
- `docs/plans/sync/dados/recortar_camadas.py` - reproduz o corte: `python3 docs/plans/sync/dados/recortar_camadas.py`.
  Ele reescreve os dois CSVs acima e joga o **detalhe por arquivo**
  (`lote, camada, caminho, tipo, linhas`, 1157 linhas) em `.tmp/f05_recorte_camadas_arquivos.csv`.
  O detalhe nao entra no commit: e dado derivado e estoura o teto de diff do portao.
  Para saber os arquivos de um lote, rode o script e filtre a coluna `lote`.

## Lote L0 - executavel agora

- `L0-01`: 40 arquivos, **nenhuma dependencia do resgate** (`deps_de_lote` vazio) -> e o primeiro a executar.
- `L0-02`: 20 arquivos, depende so de `L0-01`.
- Dos 60 arquivos de L0, **48 nao tem nenhuma dependencia do resgate**; os outros 12
  dependem de arquivos do proprio L0 (por isso a ordem L0-01 -> L0-02).

## Achados (fora do escopo deste cartao - nao corrigidos)

Import interno que nao existe nem em `origin/main` nem em `HEAD` (defeito ja na
origin, quebraria o typecheck do proprio lote):

1. `src/components/tasks/list/taskRowCells.tsx` (lote `L2-02`) importa `./prazoCompleto`.
2. `src/hooks/gamification/__tests__/mutations.test.tsx` (lote `L4-15`) importa `@/hooks/gamification/mutations`.

## O que NAO foi feito

- O resgate **nao foi executado** (nenhum arquivo de `src/` foi alterado neste cartao).
- "Fecha verde sozinho" esta comprovado **estaticamente**: toda aresta de import
  do lote aponta para `HEAD`, para o proprio lote ou para um lote anterior.
  O verde de `typecheck` + `vitest` por lote sera medido pelos cartoes de
  execucao, um lote por vez, na ordem de `deps_de_lote`.
