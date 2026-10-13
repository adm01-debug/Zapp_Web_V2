Especialista: edgar

## Banda do pai (explica os arquivos que não são meus no diff)
`git merge-base --is-ancestor` do pai (t_50f13ae2 / sha `a65cbcc6`) era FALSO, então trouxe a faixa inteira como manda a DEPENDÊNCIA: `git cherry-pick a65cbcc6` → commit `958df8451 fix(edge): relatório de SLA pela regra única e remove chamada redundante em message-delivery`. É desse commit do PAI (não meu) que vêm `supabase/functions/send-scheduled-report/index.ts` e `.../send-scheduled-report/index.test.ts` que aparecem no diff `dia/2026-10-12...HEAD`. Minha mudança é só `supabase/functions/message-delivery/index.ts` (+ `index.test.ts`).

## O que mudou e por quê
- `supabase/functions/message-delivery/index.ts`: novo `deliverOutbound` resolve o token da conexão do claim com `service.rpc('get_instance_token', { p_instance_id: claim.whatsapp_instance_name })` (via `resolveInstanceToken`, o mesmo caminho de talkx-send/multiplix-send/evolution-api) e o repassa como `instanceToken` (8º argumento de `evoFetch`). O handler trocou a chamada crua `evoFetch(evolutionUrl, evolutionKey, outbound.path, outbound.body)` (o defeito citado no cartão) por `deliverOutbound(...)`, então o envio sai pela instância da conexão do contato — critérios 1 e 2. Sem token resolvido, o 400 `instance token ausente` do `evoFetch` cai no ramo `!providerResponse.ok` (status < 500): `failClaim` com `p_retryable: false`, sem fila de reconciliação — falha clara e não-retentável, nenhum reenvio.
- `supabase/functions/message-delivery/index.test.ts`: 3 casos novos — (a) conexão não-padrão envia com o token do Vault mesmo com `EVOLUTION_INSTANCE_TOKEN` indefinido; (b) conexão não-padrão sem token no Vault devolve 400 sem tocar a rede; (c) o fallback do env só vale para a instância padrão e o token do Vault vence. Todos chamam o código real (`deliverOutbound` → `resolveInstanceToken` → `evoFetch`), com um client rpc falso e um fetcher espião só nas bordas de I/O.

## Prova
- vermelho antes: `git stash push -- supabase/functions/message-delivery/index.ts` + `deno test --allow-env --allow-read supabase/functions/message-delivery/index.test.ts` → `TS2305 [ERROR]: ... has no exported member 'deliverOutbound'` (no pré-fix não havia resolução de token no caminho do envio).
- verde depois: `deno test --allow-env --allow-read supabase/functions/message-delivery/index.test.ts` → `ok | 12 passed | 0 failed`.
- regressão da camada de envio: `deno test --allow-env --allow-read supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts` → `ok | 7 passed | 0 failed (44ms)`.
- verificação do cartão: `zapp-verify . --rapido` (roda no fechar).
- Números do diff `dia/2026-10-12...HEAD` (batem com o que o juiz contou): 5 arquivos, 2 de teste. Meus: `message-delivery/index.ts`, `message-delivery/index.test.ts` (arquivo roda 12 casos). Do pai: `send-scheduled-report/index.ts` + `index.test.ts` (3 casos). `.tmp/relato.md` também está no diff porque o PAI o commitou por engano e, sendo rastreado, o fechar exige a árvore limpa.
- Sobre `supabase/functions/send-scheduled-report/index.ts`: NÃO é escopo deste cartão e eu não o editei. Ele aparece no diff porque trouxe a faixa do pai (t_50f13ae2 → 958df8451) como a DEPENDÊNCIA do cartão manda — era indisponível não trazer: sem ela o `merge-base --is-ancestor` do pai falha e o cartão parte de código sem a correção do pai. Reverter esse arquivo quebraria a dependência.
- Nota: os testes de Edge ficam em `supabase/functions/**/*.test.ts` e rodam com `deno test`; o detector do fechar só reconhece `(src|tests)/**/*.(test|spec).ts` (vitest), por isso ele avisou "código alterado sem teste novo" — o teste está no commit e a prova vermelho→verde foi rodada à mão com `git stash` (acima).

## O que NÃO fiz e por quê
- Não removi o fallback `EVOLUTION_INSTANCE_TOKEN` de `_shared/evolution-send.ts` (arquivo permitido): é a ponte de transição marcada para sair em E21 e tem testes próprios (os 7 acima). Com a mudança, nenhum envio passa a depender dele — a conexão não-padrão usa o token do Vault com o env ausente (caso a). Remover a ponte agora quebraria a transição de outro cartão (PB-02/E21).
- Não regenerei `deployment-manifest`: sem variável de ambiente nova (o integrador regenera).

## Sensibilidade
O diff reusa o client `service` já existente e a RPC `get_instance_token` (a mesma dos outros emissores); não afrouxa proteção nem adiciona log de token/telefone/texto. Prova do caso NEGADO: conexão não-padrão sem token → 400 sem nenhum POST (caso b). Nada de produção.
