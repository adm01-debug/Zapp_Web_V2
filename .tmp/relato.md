Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca a decisão de autorização de controle (supabase/functions/_shared/evolution-control-authz.ts: as ações são retiradas dos conjuntos CONTROL/SEND/READ). Nenhuma proteção afrouxada: só saem dos conjuntos as ações que deixaram de existir no handler — nenhum conjunto ganhou item e nenhuma regra de negação foi removida.
- Prova do caso NEGADO: o teste "E43: ação removida que era 'read' nega agente sem papel (deny-by-default)" passa; as ações removidas agora caem em 'Unknown action' 404 sem I/O no provedor.
- Nenhuma referência ao banco/endpoint de produção. Sem segredo. Sem regenerar manifesto.
- O que muda para quem chama: as ações sem equivalente na GO (chatwoot, typebot, openai/dify/flowise, evolution-bot, rabbitmq/sqs/kafka/nats/pusher, templates, proxy, evoai, n8n, find-messages/find-chats/find-status-messages, settings, webhook/find, mark-unread, set-presence, offer-call, invite-info, toggle-ephemeral) passam de rota traduzida para 404 explícito. Quem usa as ações com equivalente GO não sente diferença.

## O que mudou e por quê
Cartão [refazer 2]: trazer o trabalho do branch v2/sl-075-e43-refazer-2-2610101341fbc0 para o topo atual (dia/2026-10-13) e resolver o conflito.
- supabase/functions/evolution-api/index.ts: cherry-pick de 26fbca794; removidas as ramificações `action === '...'` sem equivalente na GO (o tradutor devolve null). Contagem de `action === '` caiu de 113 para 57. Conflito único (1 bloco, no topo do arquivo): a base trouxe `import { resolveInstanceToken }` (de outro cartão) e o commit antigo removia `import { goHistoryNotSupported }` — mantive o import de resolveInstanceToken (usado nas linhas 190/532/734/807/945) e apliquei a remoção do goHistoryNotSupported, cujo único uso era o import.
- supabase/functions/evolution-api/index.test.ts: testes E43 (ação removida cai em 404) + E45 (lista de ações do schema cobre o handler).
- supabase/functions/_shared/evolution-control-authz.ts e __tests__/evolution-control-authz.test.ts: ações removidas saem dos conjuntos de autorização.
- scripts/ci/evolution-edge-fixes.unit.mjs: guarda de CI passa a exigir que as rotas sem equivalente na GO estejam fora do handler.

## Prova
- vermelho antes: `deno test ... supabase/functions/evolution-api/index.test.ts` com o handler da base (96dd72dc5) → `E43: 'set-chatwoot' ... FAILED`, `'set-typebot' ... FAILED` (teste novo contra handler antigo).
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → `ok | 94 passed | 0 failed`.
- typecheck: `deno check --config scripts/ci/deno.json --frozen supabase/functions/evolution-api/index.ts` → exit 0.
- guarda de CI: `node --test scripts/ci/evolution-edge-fixes.unit.mjs` → `pass 14`, `fail 0` (inclui "rotas sem equivalente na GO foram removidas do handler (SL-075 E43)").
- front já resolvido na base: `npx vitest run src/components/connections/__tests__/ConnectionCard.sem-integracoes.test.tsx` → `Test Files 1 passed (1); Tests 3 passed (3)`; `git grep "Integrações (IA/Bots)" -- src` não retorna nada fora do próprio teste.

## Números do diff (do `git show --stat` deste commit)
- 6 arquivos alterados, 3 deles de teste (index.test.ts, evolution-control-authz.test.ts, scripts/ci/evolution-edge-fixes.unit.mjs) e 3 de produção (index.ts, evolution-control-authz.ts, .tmp/relato.md).
- Casos de teste NOVOS: 56 no laço `REMOVED_GOLESS_ACTIONS` (cada ação removida → 404 'Unknown action' sem I/O) + 1 "E43: ação removida que era 'read' nega agente sem papel" + 1 "ações removidas no E43 caem em control" (authz). Nenhum `Deno.test` existente foi removido (0 linhas `Deno.test(` com `-` no diff).

## Pontos do juiz automático
- Ponto 1 (números): corrigido acima com as contagens reais do `git show --stat` (6 arquivos, 3 de teste) e dos casos novos.
- Ponto 2 (teste removido/afrouxado): NÃO procede como remoção — o cartão manda remover as ações sem equivalente na GO, e por isso os nomes dessas ações saíram dos laços de asserção que os testavam (set-chatwoot, send-template, offer-call, find-chats, get-settings, etc.), já que deixaram de existir no handler. Em troca foram ADICIONADOS testes que provam o novo comportamento (404 + deny-by-default). Única asserção numérica ajustada: a sanidade `handlerActions.size > 100` virou `> 50` porque o handler caiu de 113 para 57 ações — folga proporcional (antes 113−100=13; agora 57−50=7), não um afrouxamento. A matriz exaustiva logo abaixo continua exigindo que TODA ação do handler esteja em exatamente um conjunto.

## O que NÃO fiz e por quê
- Não removi o painel/menu no front: já não existem no topo atual (IntegrationsPanel.tsx e evolutionExternal.ts ausentes; o teste do card passa). Commit só do restante (Edge).
- Não regenerei manifesto de deploy (não é meu; fica para o integrador).
- Nenhum arquivo fora dos citados foi tocado.
