Especialista: iris (telas e componentes — refazer 1 executado pelo semisenior)

Refazer 1 do cartao de avisos globais de conexao (faixa de servidor fora do
ar/restaurado + faixa de numero instavel). A recusa lista 3 pontos; resolvo os
3 abaixo, na mesma ordem, sem nada fora deles.

Ponto 1 — offline nao pode acender "Servidor indisponivel" junto com
"Voce esta offline" (criterio de pronto 1). Fiz pela ALTERNATIVA que a propria
recusa oferece: `BackendStatusBanner` nao renderiza nada enquanto o navegador
esta offline (`src/components/ui/global-connection-banners.tsx`: hook
`useBrowserOnline` via `useSyncExternalStore` em `online`/`offline`, `if
(!browserOnline) return null`). O dono da tela offline continua sendo o
`OfflineIndicator`; documentei a exclusividade mutua no cabecalho do arquivo.
Teste: `BackendStatusBanner (servidor) > navegador offline: a faixa de
servidor nao aparece (o aviso de rede e o dono da tela)` — vermelho antes
(a faixa renderizava com `status: 'down'` e `onLine === false`), verde depois.

Ponto 2 — comentario do Index contradizia a implementacao ("caiu e voltou").
Troquei em `src/pages/Index.tsx` por: servidor fora do ar / restaurado e
numero com saude degradada na checagem recente (10 min, so staff). Mudanca
so de texto, mesma linha do diff anterior.

Ponto 3 — agente consultava `whatsapp_connections` a cada 60 s sem ver a
faixa. `useDegradedConnections(isStaff)` com `enabled: isStaff`
(`src/hooks/connections/useDegradedConnections.ts`) e a faixa passa o papel:
`useDegradedConnections(isSupervisor)`
(`src/components/ui/global-connection-banners.tsx`). Testes:
`useDegradedConnections > nao-staff nao dispara leitura nenhuma (query
desabilitada)` — vermelho antes (`h.calls` 1), verde depois (0); e no teste
do banner, `passa o papel ao hook: staff lê, agente nao dispara leitura`
(`toHaveBeenCalledWith(true/false)`) — vermelho antes (chamado sem
argumento), verde depois.

Arquivos (`git diff --name-only dia/2026-10-12..HEAD`, alem da entrega
anterior que ja estava na branch):
src/components/ui/global-connection-banners.tsx
src/components/ui/__tests__/global-connection-banners.test.tsx
src/hooks/connections/useDegradedConnections.ts
src/hooks/connections/__tests__/useDegradedConnections.test.tsx
src/pages/Index.tsx
.tmp/relato.md

Verificacao:
- vitest nos 4 arquivos de teste do cartao: 40 passed (37 anteriores + 3 novos,
  um por ponto da recusa; cada um vermelho antes e verde depois, rodei o
  antes/depois).
- `bun run typecheck` (tsc -b --force): limpo.
- `zapp-verify <copia> --rapido`: VERDE SEM BANCO (8s) — db_guard, tipos, lint e
  migrations OK; banco local nao verificado (o cartao nao tem migration).
- Diff total do cartao bem abaixo do teto de 90 mil caracteres; sem
  `project-ref` de producao em linha adicionada; sem arquivo de guarda/CI.
- `hermes-tarefa-fechar` esta congelado (modo V1 suspenso): o trabalho fica
  commitado na branch `v2/avisos-globais-conexao-degradada-servido-2610122027cebe`.
