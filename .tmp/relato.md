Especialista: worker (geral)

## O que mudou e por quê
- `supabase/functions/talkx-send/x020-variavel-distribuicao.test.ts` (novo): fixa, por comportamento, o que o teste de precedência (`x020-variavel-precedencia.test.ts`) não cobria em `pickVariant()` — a proporção dos pesos, as fronteiras de peso e os caminhos de vazio/último recurso. Motivo: o cartão pede prova executável da proporção e das fronteiras do sorteio A/B.
- Nenhuma mudança de produção no diff (o único item é o arquivo de teste novo).

Testes (o que cada um trava):
- proporção 1:2:3 em 6.000 e em 100.000 destinatários distintos: cada variante dentro da faixa (0,03 e 0,01) da fração esperada.
- dominância 99:1 em 20.000 destinatários: peso 99 sai em ≥ 0,985 das vezes e o peso 1 ainda sai.
- estabilidade: 500 destinatários lidos duas vezes e um mesmo id lido 100 vezes devolvem sempre a mesma variante.
- fronteira de peso: variante com peso 0 ou negativo nunca é sorteada (3.000 ids por cenário).
- último recurso: soma de pesos ≤ 0 devolve a última variante ordenada por id (pesos [0,0] e [0,-5]).
- vazio: lista vazia e `data: null` devolvem null.
- não-finito: peso NaN nunca é sorteado e o total NaN colapsa a decisão na última variante.

## Prova
- vermelho antes (mutação local, revertida): em `supabase/functions/talkx-send/process-recipient.ts:170` troquei `stableVariantHash(recipientId) % total` por `stableVariantHash(recipientId) % 1` → `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/talkx-send/x020-variavel-distribuicao.test.ts` → `FAILED | 4 passed | 4 failed`, com os testes de proporção 1:2:3 (6.000 e 100.000), dominância e fronteira de peso vermelhos. Mutação revertida por patch e conferida: `git diff --stat` vazio, `git status --short` só com o arquivo de teste novo.
- verde depois (mesmo comando, sem a mutação): `ok | 8 passed | 0 failed (158ms)`.
- suíte do módulo junto com o teste de precedência que já existia: `ok | 13 passed | 0 failed (502ms)`.

## O que NÃO fiz e por quê
- Não deixei nenhuma alteração de código de produção no diff (o cartão proíbe). Defeito aberto encontrado e relatado, NÃO corrigido: com peso não-finito, `total` (`process-recipient.ts:167`) vira NaN, `!(total > 0)` (`:168`) é verdadeiro e a função devolve sempre `ordered[last]`, ou seja, o sorteio deixa de distribuir para todo destinatário. O teste do NaN fixa esse comportamento atual e aponta as duas linhas; se a coluna `weight` for `integer not null`, o caminho é inalcançável hoje e o teste vira trava caso o tipo relaxe.
- Não toquei no teste existente `x020-variavel-precedencia.test.ts` (roda junto e segue verde).
- Assinatura: o corpo do cartão declara o especialista `workertestes`, mas o roteador entregou o cartão ao perfil `worker` (evento `assigned: from workertestes to worker`); assino pelo perfil que executou.
