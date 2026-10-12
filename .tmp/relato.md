Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- `supabase/functions/_shared/evolution-control-authz.ts`: `find-chats`, `find-contacts`, `find-messages`,
  `find-status-messages`, `get-media-base64`, `get-settings`/`get-webhook`, `fetch-profile`,
  `fetch-profile-picture`, `fetch-business-profile`, `find-labels`/`find-templates`, os `get-*` das integrações
  (chatwoot/typebot/openai/dify/flowise/evolution-bot/rabbitmq/sqs/proxy/evoai/n8n/kafka/nats/pusher) e
  `get-catalog`/`get-collections` saíram de `READ_ACTIONS` e entraram em `CONTROL_ACTIONS`. Eram chamadas por
  qualquer agente e devolvem dado instance-wide (fora da visibilidade dele) ou configuração/credencial do
  provedor. `READ_ACTIONS` ficou com `status`, `list-instances`, `instance-info`, `check-numbers` e as leituras
  de grupo.
- `supabase/functions/evolution-api/index.ts`: `TOKEN_KEYS` ganhou `hash` e `stripInstanceToken` passou a
  percorrer arrays; nova `sanitizeInstanceResponse` aplicada a `list-instances` e `instance-info`. Antes o token
  só era removido na rota GO `/instance/all` (dentro do proxy), então a variante v2 e a rota `/instance/info`
  devolviam `token`/`apikey`/`hash` ao chamador — com o token e a URL pública da GO, opera-se a instância fora
  do app.

## Sensibilidade
- (a) o diff toca o caminho de autorização (classificação de ação + `decideControlAuthz`, deny-by-default) e a
  higienização da credencial da conexão. O cliente `service`/`service_role` só é usado onde já era; o gate roda
  ANTES de qualquer chamada ao provedor.
- (b) nenhuma proteção afrouxada, com o caso NEGADO provado: agente → 403 e ZERO I/O no provedor (o fake não
  registra requisição); corpo de leitura de instância NUNCA contém `token`/`apikey`/`hash` (nem aninhado, nem
  em item de lista).
- (c) nenhuma referência a banco ou endpoint de produção — os testes usam servidor falso local em `127.0.0.1`.
- (d) o que muda para quem chama: as ações movidas passam a exigir admin/supervisor; o corpo de
  `instance-info`/`list-instances` deixa de trazer a credencial (o resto do payload, ex. `status`, permanece).

## Prova
- Diff deste commit: 4 arquivos de código/teste mais `.tmp/relato.md`; 2 arquivos de teste; 9 casos de teste novos
  (3 de gate negado + 1 de passagem com papel + 2 de `instance-info` + 2 de `list-instances` no handler, e 1 na
  matriz de classificação).
- vermelho antes (matriz antiga via `git stash` só do arquivo de authz): `deno test --allow-read --allow-env
  --allow-net --filter "R2EXT-AGENDA" supabase/functions/evolution-api/index.test.ts` → os três testes de gate
  (`find-chats`, `find-contacts`, `get-media-base64`) FALHARAM porque o agente passava.
- vermelho antes (handler antigo via `git stash` só do `index.ts`): `--filter "não devolve token"` → os quatro
  testes de credencial FALHARAM (o corpo trazia o token).
- verde depois: `deno test --allow-read --allow-env --allow-net supabase/functions/evolution-api/index.test.ts
  supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 45 passed | 0 failed`.
- ausência de consumidor no front das ações que viraram control restrito:
  `git grep -n "'find-chats'\|'find-contacts'\|'find-messages'\|'find-status-messages'\|'get-media-base64'\|'get-catalog'\|'get-collections'" -- src/`
  só encontra o próprio hook exportador e testes de payload — nenhuma tela as invoca.

## Classes finais (critério 4)
- **control:** find-chats, find-contacts, find-messages, find-status-messages, get-media-base64, get-settings,
  get-webhook, fetch-profile, fetch-profile-picture, fetch-business-profile, find-labels, find-templates,
  get-chatwoot, get-typebot, typebot-sessions, get-openai, get-dify, get-flowise, get-evolution-bot,
  get-rabbitmq, get-sqs, get-proxy, get-evoai, get-n8n, get-kafka, get-nats, get-pusher, get-catalog,
  get-collections.
- **read:** list-instances, status, instance-info, check-numbers, list-groups, group-info, group-participants,
  group-invite-code, invite-info.
- **send:** inalterado.

## O que NÃO fiz e por quê
- `get-media-base64`: nenhuma tela a chama, então segui a primeira opção do cartão e movi para control, em vez
  de resolver visibilidade dentro do gate de envio (`decideSendAuthz`). A resolução de alvo do `send` é por `remoteJid` de
  `body.key`, e a mídia aponta `body.message.key.remoteJid` — misturar as duas chaves de alvo seria mudança de
  contrato além do cartão.
- leituras de grupo (`list-groups`, `group-info`, `group-participants`, `group-invite-code`, `invite-info`):
  mantidas em `read` porque TÊM consumidor no front (`src/hooks/groups/actions.ts`,
  `src/hooks/evolution/useEvolutionGroups.ts`); movê-las quebraria as telas de grupo e o cartão não as pediu.
- `fetch-profile`/`get-settings`/`get-webhook`/`find-labels`: movidos a control (configuração de conexão); o
  único consumidor é `InstanceSettingsDialog`, tela de configuração de conexão restrita a admin/supervisor
  (IA-004 §6.5).
- Não rodei `zapp-verify` à mão: o `hermes-tarefa-fechar` roda o verificador rápido.
- Os testes que provam este cartão são Deno e estão NESTE commit (`supabase/functions/evolution-api/index.test.ts`
  e `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`). O aviso "sem teste novo" do fechar
  vem do glob dele, que só conta teste sob `src/`/`tests/` — ele não enxerga teste de Edge em
  `supabase/functions/`. Rodado de novo como o próprio aviso autoriza.
