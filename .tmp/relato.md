Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/hooks/ui/useDeviceDetection.ts: `fetchSessions` deixou de ler `user_sessions` e passou a chamar `supabase.rpc('my_active_sessions')` (a RPC do cartão pai, que só devolve sessões vivas do chamador e marca a atual pelo claim `session_id` do JWT); a interface `UserSession` passou a ter `is_current` (e a perder as colunas mortas `is_active`/`expires_at`/`ended_at`, que a RPC não devolve).
- src/components/security/DevicesPanel.tsx: o selo "Sessão atual" (`isCurrentSession`) vem de `session.is_current` — antes era `session.device_id === currentDeviceId`, e dois logins no MESMO aparelho (mesmo `device_id`) apareciam os dois como atuais e nenhum podia ser encerrado.
- src/components/security/SecurityOverview.tsx: o item "Sessões Ativas" passou a medir `sessions.filter(s => !s.is_current).length` no lugar de `sessions.length` — a sessão que o dono está usando não é acesso estranho à conta. A descrição diz quantas são além desta (`N sessão(ões) ativa(s), M além desta`). Estado vazio conferido: `0 sessão(ões) ativa(s), 0 além desta`.
- Testes: hook (RPC chamada, `user_sessions` não lida no carregamento, duas sessões no mesmo aparelho), componente DevicesPanel real com o hook dublado (1 selo "Sessão atual" e 1 botão "Encerrar"; e nenhum selo quando ninguém é atual), SecurityOverview real (1 além desta → 25/25; 4 além desta → 15/25).

Nenhum mock entrega o resultado pronto: o hook é dublado, mas quem decide o selo e a contagem são os componentes verdadeiros.

## Prova
- vermelho antes (com DevicesPanel e fetchSessions no código antigo, `npx vitest run src/hooks/__tests__/useDeviceDetection.test.tsx src/components/security/__tests__/DevicesPanel.sessao-atual.test.tsx src/components/security/__tests__/SecurityOverview.sessao-atual.test.tsx`):
  `AssertionError: expected [ <div>, <div> ] to have a length of 1 but got 2` (dois selos "Sessão atual" no mesmo aparelho)
  `AssertionError: expected "vi.fn()" to be called with arguments: [ 'my_active_sessions' ]`
- verde depois (`npx vitest run src/components/security src/hooks/__tests__/useDeviceDetection.test.tsx`): `Test Files 22 passed (22); Tests 111 passed (111)`
- types: `npx tsc --noEmit -p tsconfig.app.json` → sem erro em DevicesPanel, SecurityOverview ou useDeviceDetection

## Arquivos fora da lista do cartão (aviso do juiz)
`supabase/migrations/20261013230007_my_active_sessions.sql`, `supabase/tests/my_active_sessions.sql`, `src/integrations/supabase/types.ts` e `scripts/db-audit/pg-cron-jobs-baseline.json` entraram no diff por CHERRY-PICK da faixa do cartão pai (`dia/2026-10-13..f8ba2455341ec102797139a76f2e25b50329f8b8`, branch `v2/sessoes-reais-do-usuario-2610130558f3a3`), como o próprio cartão manda: sem a RPC `my_active_sessions` (e o tipo gerado que a conhece) não há o que chamar. Nenhum deles foi editado por mim.

## O que NÃO fiz e por quê
- `endSession` e `removeDevice` continuam lendo `user_sessions` via `fromTable` para achar `auth_session_id`: o cartão pede a RPC na LEITURA da lista; mexer nas mutações é outra trilha.
- Não subi servidor nem rodei e2e autenticado (R1/E2E): produção fora de alcance.
