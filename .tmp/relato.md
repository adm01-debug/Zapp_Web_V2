Especialista: edgar

## Sensibilidade
- O diff toca `service_role`: as RPCs `mark_outbound_post_started` (PD-79) e `fail_outbound_unclaimed` (PD-78) são chamadas com o client de serviço que a Edge já usa; nenhuma proteção foi afrouxada e nenhum JWT/role passou a ser aceito — `requireAuth` continua o mesmo.
- Nada afrouxado, prova do caso NEGADO: no claim vazio com lease VIVO a RPC recusa (42501) e a Edge mantém o 409 "already in progress" SEM tocar na linha em voo (teste `PD-78: claim vazio com lease VIVO não pisa na linha`).
- Nenhuma referência a banco/endpoint de produção; nenhum log de telefone, token ou texto de mensagem (os logs só levam `event`, `reason`/`code`).
- O que muda para quem chama: o ramo de claim vazio deixa de ser um 409 mudo e passa a devolver o motivo (`reason` + `error`) no corpo; o 200 idempotente e o 404 não mudaram.

## O que mudou e por quê
- `supabase/functions/message-delivery/index.ts`:
  - `markOutboundPostStarted(service, messageId, claimToken)` chama `mark_outbound_post_started` IMEDIATAMENTE antes do POST. Se a RPC recusar (lease vencido / conflito / não encontrado) o POST NÃO sai (fail-closed, nada foi enviado) e devolvemos 409 — a linha segue retomável, sem resultado ambíguo.
  - `dispatchProviderPost(deliver, timeoutMs=PROVIDER_POST_TIMEOUT_MS)` dispara o POST sob `AbortSignal.timeout(45_000)` e devolve o resultado em vez de lançar; `aborted` marca o timeout/aborto.
  - `PROVIDER_POST_TIMEOUT_MS = 45_000` e `CLAIM_LEASE_SECONDS = 90`: o POST termina com folga DENTRO do lease. Soma dos prazos: mark (~1 RPC) + POST ≤ 45 s + margem 45 s = 90 s = lease. Antes o POST não tinha timeout e podia passar do lease → a linha voltava a ser reivindicável (reenvio duplicado).
  - POST falho por timeout/aborto/rede: `settleAmbiguousDelivery` marca a linha terminal NÃO retentável (`fail_outbound_message` com `p_retryable=false`) e enfileira a reconciliação somente-leitura (mesma semântica do catch antigo, agora explícita). Nunca reenvia automático.
  - Claim vazio: `recordUnclaimedFailure(service, messageId, profile.id)` chama `fail_outbound_unclaimed` com o ATOR que clicou (a RPC resolve o papel: dono ou admin/supervisor ativo) e a Edge devolve `reason` (motivo decidido no banco) + `error`. Lease vivo (42501) → 409 "already in progress" sem pisar na linha.
  - `deliverOutbound` ganhou o parâmetro opcional `signal` e o repassa ao `evoFetch` (7º argumento); a assinatura antiga (6 args) segue válida.
- `supabase/functions/message-delivery/index.test.ts`: 10 casos de teste novos, todos chamando as funções reais que eu mudei (`dispatchProviderPost`, `markOutboundPostStarted`, `recordUnclaimedFailure`, `failClaim`) — PD-79: abort por timeout = ambíguo e timeout < lease, erro de rede ≠ abort, resposta OK, transição não retentável, carimbo com token do claim; PD-78: motivo gravado com o ator, lease vivo recusado.

## Arquivos no diff (3 arquivos, 1 de teste)
- `supabase/functions/message-delivery/index.ts` (mudança do cartão).
- `supabase/functions/message-delivery/index.test.ts` (testes do cartão).
- `.tmp/relato.md`.
Nenhum outro arquivo: o trabalho dos cartões pai de BANCO (migrations das RPCs) não entra aqui (as RPCs são chamadas só por NOME) e a parte de `send-scheduled-report` que vinha na faixa do pai de Edge foi devolvida ao estado da base para o diff ficar só com a minha área.

## Ramo de erro — antes x depois
- Claim vazio: ANTES 409 fixo "already in progress or cannot be sent" (mudo, motivo perdido); DEPOIS grava `status='failed'` + `delivery_failure_reason` + evento no banco e devolve o motivo.
- POST: ANTES `deliverOutbound` sem timeout (podia vencer o lease); DEPOIS mark + 45 s de timeout; a ambiguidade vira linha terminal não retentável + reconciliação + 502.

## Prova
- vermelho antes: sem a mudança o arquivo de teste nem importa — `markOutboundPostStarted`, `dispatchProviderPost` e `recordUnclaimedFailure` não existem, então os novos casos falham (o defeito do POST sem timeout e do claim mudo está no código anterior).
- verde depois: `deno test --allow-net --allow-env --allow-read supabase/functions/message-delivery/index.test.ts` → `ok | 19 passed | 0 failed`.
- verificação: `zapp-verify . --rapido` (linha de resultado no bloco FATOS MEDIDOS abaixo).

## O que NÃO fiz e por quê
- Não regenerei `supabase/deployment-manifest.json`: é arquivo derivado gerado pelo integrador (o cartão diz para não editar à mão).
- Não mexi no cliente `src/services/outbound-message.service.ts` (fora dos arquivos do cartão): ele lança em non-2xx; o motivo agora vai no corpo para quem o lê.
- Não alterei migrations/schema: as duas RPCs (`mark_outbound_post_started`, `fail_outbound_unclaimed`) vêm dos cartões pai de BANCO (t_8c6419cf, t_bc890f8a) e são chamadas só por NOME. Trazer as migrations para cá inflaria o diff (as duas somam ~1.200 linhas de SQL) e o portão de revisão recusa acima de 90.000 caracteres. Este cartão fica só com a Edge.
