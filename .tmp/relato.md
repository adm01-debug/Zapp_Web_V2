Especialista: hugo

## O que mudou e por quê

- `src/hooks/system/useSupabaseConnectivity.ts`: 2 correções mínimas da recusa,
  sem mudar a API pública do hook (mesmos estados e retorno; nenhum chamador
  precisa de atualização — neste branch só o próprio teste o referencia).
  1. Ramo offline do efeito de `browserOnline` agora zera `inFlightRef`
     (linha 232), como o `retryNow` já fazia: sonda em voo durante oscilação
     offline→online não prende mais o hook em `offline` sem timer.
  2. Efeito da guarda de montagem/limpeza movido para o primeiro do hook
     (linha 203): na remontagem do StrictMode o efeito de `browserOnline`
     encontra `mountedRef` verdadeiro e sonda, em vez de sair cedo e prender
     em `checking`.
- `src/hooks/system/__tests__/useSupabaseConnectivity.test.ts`: 2 casos novos
  (bloco `useSupabaseConnectivity — oscilação offline→online e StrictMode`):
  1. `sonda em voo durante oscilação offline→online não prende o hook em offline`
  2. `sob StrictMode a primeira montagem chega a online` (com
     `wrapper: StrictMode`, sem JSX novo — o arquivo continua `.ts`).

## Prova

- vermelho antes (testes novos contra o hook sem as correções):
  `bun x vitest run src/hooks/system/__tests__/useSupabaseConnectivity.test.ts`
  → Ponto 1: `AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times`
  (linha 305); Ponto 2: `AssertionError: expected 'checking' to be 'online'`
  (linha 327); resumo `Test Files 1 failed (1)` / `Tests 2 failed | 11 skipped (13)`.
- verde depois (mesmo comando, hook corrigido):
  `Test Files 1 passed (1)` / `Tests 13 passed (13)` (11 existentes + 2 novos).
- Arquivos do diff (`git diff --name-only caaac3797..HEAD`, copiado do comando):
  src/hooks/system/__tests__/useSupabaseConnectivity.test.ts
  src/hooks/system/useSupabaseConnectivity.ts
  (`git diff --stat`: 2 files changed, 69 insertions(+), 14 deletions(-)).

## Pontos do revisor

- Ponto 1: resolvido — `src/hooks/system/useSupabaseConnectivity.ts:232`
  (`inFlightRef.current = null` no ramo offline); prova o caso 1 acima
  (vermelho: 1 chamada em vez de 2; verde: nova sonda dispara e vira online).
- Ponto 2: resolvido — `src/hooks/system/useSupabaseConnectivity.ts:203`
  (efeito da guarda de montagem movido para primeiro); prova o caso 2 acima
  (vermelho: preso em `checking`; verde: `online` sob StrictMode).

## O que NÃO fiz e por quê

- Não fiz `cherry-pick`: trabalhei no branch do próprio cartão
  (`v2/usesupabaseconnectivity-sonda-backend-26101215556681`), que já contém a
  entrega anterior; o commit novo (`3a0ab72787`) tem só as 2 correções + 2 testes.
  (Contexto: a `dia/2026-10-14` já integrou cópias idênticas do hook e do teste
  via o cartão do banner `26101301486b3d` (commit `1a6f9d2565`) — `git diff`
  entre a dia e a entrega recusada dá vazio nos 2 arquivos — mas com os mesmos
  2 defeitos da recusa, por isso as correções continuam necessárias aqui.)
- Não alterei API, barril, banner, Edge, migration, guarda, `useNetworkStatus`
  nem teste existente; sem banco remoto, credencial ou rede real (cliente
  Supabase dublado nos testes).
