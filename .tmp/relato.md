Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/services/inbox.service.ts: `fetchInboxSilence(signal)` lê a RPC `admin_inbox_silence` e normaliza as linhas (`top_conversations`, contagens, `is_silent`, `silence_minutes`). Camada de serviço porque o lint-ratchet não deixa `src/components/**` importar o client do Supabase (foi a checagem que reprovou a primeira versão) — é o mesmo padrão de `fetchInboxFilterTags`/`useInboxFilterTags`.
- src/components/monitoring/hooks/useInboxSilence.ts (novo): hook que acompanha o silêncio a cada 60 s pelo `useVisiblePolling` (que já para com a aba escondida/offline) — sem consulta em segundo plano. Expõe `connections`, `alerts`, `silenceMinutes`, `loading`, `error`, `refresh`.
  - `alerts` é o aviso UMA vez por episódio: a conexão entra na lista quando fica muda, não se repete enquanto seguir muda (a lista mantém a MESMA referência nas leituras seguintes) e some quando a mensagem volta a chegar (`is_silent` volta a false); um novo episódio de silêncio volta a avisar.
  - O limiar não é cravado no front: vem de `silence_minutes` da RPC, que lê `global_settings.inbox_silence_minutes` no servidor.
  - Falha de leitura preserva o último retrato bom (conexões e alertas), mostra o erro e não trava o `loading`.
- src/components/monitoring/__tests__/useInboxSilence.behavior.test.ts (novo): 11 testes de comportamento (mesma pasta dos testes dos outros hooks do monitoramento).

Contrato com a tela (cartão filho): a lista a exibir é `connections` (com `is_silent`, contagens 5m/1h/24h, último recebido/último enviado e top_conversations); o aviso a destacar é `alerts`.

## Prova
- vermelho antes: `npx vitest run src/components/monitoring/__tests__/useInboxSilence.behavior.test.ts` com a guarda do "não repete" retirada → `Test Files 1 failed (1); Tests 1 failed | 10 passed (11)` (a linha `expect(result.current.alerts).toBe(firstAlerts)` aponta a repetição do alerta).
- verde depois: `npx vitest run src/components/monitoring/__tests__/useInboxSilence.behavior.test.ts` → `Test Files 1 passed (1); Tests 11 passed (11)`.
- regressão da pasta: `npx vitest run src/components/monitoring` → `Test Files 6 passed (6); Tests 38 passed (38)`.
- typecheck: `npx tsc -p tsconfig.app.json --noEmit` sem erro nos arquivos novos.

## Dependência do cartão pai
A RPC `admin_inbox_silence` e a migration vieram do cartão pai (t_38ab6fff, sha f24f5c486b) por `git cherry-pick -x`: esse commit não estava na ponta `dia/2026-10-13` desta área de trabalho (a faixa trazida foi bf887427b0, 5009af7fdd, f24f5c486b).

Por isso o diff traz `src/integrations/supabase/types.ts`, `supabase/migrations/20261013230009_admin_inbox_silence.sql` e `supabase/tests/admin_inbox_silence.sql`: são o trabalho do cartão PAI, que este cartão manda usar (`Depende de t_38ab6fff (RPC admin_inbox_silence)`) e define como ler a RPC. Não são implementação minha.

`src/services/inbox.service.ts` também não está na lista de arquivos do cartão: é onde a leitura do Supabase tem de morar (o lint-ratchet reprova importar o client em `src/components/**` — foi o que a verificação apontou na 1ª versão), e a camada de serviço é a minha área. Os arquivos que escrevi neste cartão são: `src/services/inbox.service.ts`, `src/components/monitoring/hooks/useInboxSilence.ts` e `src/components/monitoring/__tests__/useInboxSilence.behavior.test.ts`.

## O que NÃO fiz e por quê
- Não li `global_settings` no front: o limiar chega pela RPC, que já o lê no servidor; uma segunda leitura no front poderia divergir da usada para decidir `is_silent`. A chave continua editável pela tela do cartão filho e o `refresh()` relê.
