Especialista: workertestes

## O que mudou e por quê

- `src/components/connections/__tests__/useConnectionsManager.handlers.test.tsx` (novo): cobre os handlers que o cartão aponta e que estavam sem teste na V2 — `handleDisconnect` (desconectar na Evolution + marcar a linha local; sem `instance_id` não chama nada; falha da GO avisa e NÃO marca desconectado), `handleAddConnection` (recusa sem nome/telefone; cria com `instanceName` derivado do nome; `is_default` só quando não há outra conexão; abre o QR da conexão criada; erro devolve o botão), `handleShowQrCode` sem instância, o polling de 3 em 3 s até `connected` (e o polling que para ao conectar) e a rede de segurança de 30 s do diálogo de QR. Testes de comportamento: importam o hook real e usam Supabase/Evolution falsos (fronteira), com timers falsos para o polling e os 30 s.
- `supabase/functions/evolution-sync/index.test.ts` (novo): cobre o gate de papel e a validação da Edge — 503 sem Evolution configurada, 401 sem bearer, 401 com token inválido, 403 para usuário comum (sem tocar o provedor), 400 quando uma ação comum chega sem `instanceName`, 400 com a lista de ações válidas para ação desconhecida. O rate limit (PL-15, worker edge) entra como `Deno.test({ ignore: true })` — TODO, nunca teste que finge.
- `supabase/functions/evolution-sync/index.ts`: **único toque fora dos arquivos de teste** — extração mínima só para tornar o handler testável: o corpo que estava dentro de `serve(async (req) => …)` virou `export async function handleEvolutionSync(req)`, e o `serve` passou a rodar sob `if (import.meta.main)`. É a mesma convenção dos outros `index.ts` do diretório (send-email, chatbot-l1, connection-health-check); nenhuma regra interna mudou. Sem isso, importar o módulo no teste abriria a porta 8000.

Não toquei o PL-07 (fila, horário, abas e reconexão automática): nada aqui duplica esses casos.

Confirmação de que as mutações foram desfeitas: `git diff` de produção vazio (só entram os dois arquivos de teste e a extração em `index.ts`); `git grep "false &&"` → 0 ocorrências em `src/components/connections` e `supabase/functions/evolution-sync`; o `is_default: true` que resta está só em fixtures de teste, não em produção.

## Prova (vermelho antes, verde depois)

Sem as correções não há o que provar (o cartão é cobertura de comportamento existente), então a prova é por mutação — reverti só a produção, vi o teste falhar, restaurei:

- vermelho: vitest com 4 mutações no hook (update local do `handleDisconnect` removido; 30000→60000; `state === 'open'` trocado; `is_default` forçado) → `Tests 4 failed | 6 passed (10)`, falhando exatamente os 4 casos mutados.
- vermelho: deno com o gate de 403 e a checagem de `instanceName` desligados → `FAILED | 4 passed | 2 failed | 1 ignored`, com `esperado 403, veio 500` e `esperado 400, veio 500`.
- verde depois (produção restaurada por `git checkout`):
  `npx vitest run src/components/connections/__tests__/useConnectionsManager.handlers.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)`
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-sync/index.test.ts` → `ok | 6 passed | 0 failed | 1 ignored`

## O que NÃO fiz e por quê

- Não apliquei rate limit na `evolution-sync` (é PL-15, do worker edge): deixei `ignore: true` no teste.
- Não escrevi teste de banco nem de outra camada: fora da minha área.
- Não enfraqueci, pulei nem aumentei timeout de teste existente.
