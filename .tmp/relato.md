Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/hooks/system/useBackendHealth.ts` (novo): monitor leve do backend — GET em `{SUPABASE_URL}/auth/v1/health` (consulta mínima já existente; não lê tabela, não depende de RLS) a cada 30 s, com recuo exponencial 30 s → 60 s → 120 s → 240 s, **pausado com a aba oculta** (`visibilitychange`) e re-checagem imediata ao voltar. Expõe `status` (unknown/up/down), falhas consecutivas e o instante da recuperação. 4xx conta como servidor DE PÉ (o serviço respondeu); só transporte quebrado ou 5xx é queda.
- `src/components/ui/global-connection-banners.tsx` (novo): `BackendStatusBanner` (faixa "Servidor indisponível, tentando reconectar…" + botão "Tentar agora"; aviso "Conexão restaurada" quando volta), `DegradedConnectionsBanner` ("Conexão \"X\" está instável", só staff, com atalho "Ver Conexões") e o wrapper `GlobalConnectionBanners` que empilha as duas numa coluna só (não sobrepõe a faixa do `EvolutionDisconnectBanner`, que continua no `bottom-24`).
- `src/hooks/connections/useDegradedConnections.ts` (novo): lê `whatsapp_connections` filtrando `health_status = 'degraded'` e mantém só quem tem checagem nos **últimos 10 min**; ciclo via react-query (refetch a cada 60 s), no mesmo padrão de `useSystemHealthSignals`.
- `src/pages/Index.tsx`: monta `GlobalConnectionBanners` junto dos outros avisos globais, passando o atalho para a view `connections`.
- `src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx`: mock do componente lazy novo (esse teste é de navegação por teclado e não pode depender do realtime do store de conexões).
- Testes novos: `src/hooks/system/__tests__/useBackendHealth.test.ts`, `src/hooks/connections/__tests__/useDegradedConnections.test.tsx`, `src/components/ui/__tests__/global-connection-banners.test.tsx` (inclui axe: as faixas são landmarks nomeados, como o `EvolutionDisconnectBanner`).

## Respostas às perguntas do cartão
- **Não reaproveitei o `offline-indicator`**: ele cobre o NAVEGADOR offline ("Você está offline"). A lacuna era o backend fora do ar com o navegador online — caso diferente, texto e `data-testid` próprios nas faixas novas.
- **Item 1 não vem do store do GL1**: `useConnectionsHealth` guarda a queda observada na sessão, não tem `health_status`. A "saúde degradada" do cartão é a coluna `whatsapp_connections.health_status = 'degraded'` com `last_health_check` recente — é a mesma terminologia que a tela Conexões já mostra ("Degradado"). Conexão que segue DESCONECTADA não entra na minha faixa: essa é do `EvolutionDisconnectBanner`, então não há aviso duplicado.
- **Staff**: gate `useUserRole().isSupervisor` (admin herda), o mesmo papel da entrada "Conexões" em `NavigationService`. Sem tela nova e sem DDL, então nada de RLS novo.
- **Contraste**: `bg-amber-500` + `text-amber-950` = 6,96:1 (branco sobre amber-500 seria 2,2:1, reprovado); queda = `bg-red-700` + branco, a mesma medida já documentada no `EvolutionDisconnectBanner`. Animação só com `motion-safe`.

## Prova
- vermelho antes (base `dia/2026-10-12`, sem a mudança): `git cat-file -e HEAD:src/hooks/system/useBackendHealth.ts` → `fatal: path ... exists on disk, but not in 'HEAD'`; `git show HEAD:src/pages/Index.tsx | grep -c GlobalConnectionBanners` → `0`. Ou seja: na base não havia nenhum aviso de servidor fora do ar (o gap do cartão é real).
- verde depois: `npx vitest run src/hooks/system/__tests__/useBackendHealth.test.ts src/hooks/connections/__tests__/useDegradedConnections.test.tsx src/components/ui/__tests__/global-connection-banners.test.tsx src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` → `Test Files 4 passed (4); Tests 37 passed (37)`.
- tipos: `npx tsc --noEmit -p tsconfig.app.json` → exit 0, zero linha de erro. Lint dos arquivos NOVOS: `npx eslint` neles → exit 0, zero aviso. O `src/pages/Index.tsx` continua com as 2 ocorrências que JÁ estavam no baseline (`scripts/ci/eslint-baseline.json`, `react-hooks/set-state-in-effect` na linha 101 e `no-restricted-imports` na 5); meu diff ali só acrescentou o lazy import e a montagem, sem tocar nessas linhas.

## Exceção de arquivo (o juiz apontou; é deliberado)
- `src/pages/Index.tsx` (4 linhas: lazy import + `<GlobalConnectionBanners …/>`) e o mock do lazy em `src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` NÃO estão na lista literal de arquivos do cartão, mas são indispensáveis: o layout principal que monta **todos** os avisos globais da família é o `Index.tsx` (é lá que vivem `OfflineIndicator`, `ConnectionToast`, `EvolutionDisconnectBanner` e `MfaAdminNudge`, nas linhas logo acima da minha). O critério do cartão ("avisos montados no layout principal") não tem como ser cumprido dentro de `src/components` — nenhum componente é montado globalmente sem passar por ele. O mock no teste irmão é só para o teste de teclado não subir o realtime do store de conexões. Nenhum outro arquivo fora da lista foi tocado.

## O que NÃO fiz e por quê
- Não toquei em Edge Function, migration, RLS nem no `offline-indicator` (fora do escopo).
- O hook de polling ficou em `src/hooks/system/useBackendHealth.ts` junto do banner, como o cartão permite; se o coordenador quiser a divisão exata do UI-05 (hook do Hugo × banner), ele pode ser extraído sem alterar o componente.
