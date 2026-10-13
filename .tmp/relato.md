Especialista: edgar

# fix(seguranca): limite de tentativas persistente nas Edges administrativas e guarda de estado no reset de senha

## Sensibilidade
- O diff toca `rateLimit`/`enforceRateLimit` e o caminho `service_role` (RPC `consume_rate_limit`) nas quatro edges administrativas e no `auth-login`. Nada foi afrouxado: cada teste novo prova o caso NEGADO (429/503/409) ANTES de qualquer efeito (nenhum e-mail, nenhuma escrita de auditoria, nenhuma chamada a `signInWithPassword`, nenhum `createUser`). Nenhuma referência ao banco/endpoint de produção — só fakes e o banco local.
- O que muda para quem chama: excesso de requisições continua 429; o login ganha 503 explícito de indisponibilidade quando o contador persistente cai (antes caía para o contador em memória); aprovar/rejeitar um pedido já decidido por outra requisição passa a 409 em vez de sobrescrever. Nenhum endpoint/assinatura externa mudou.

## Arquivos alterados (batem com o `git diff --stat`)
Números do diff: 12 arquivos alterados — 6 de código, 5 de arquivo de teste e este `.tmp/relato.md`; 5 arquivos de teste; casos de teste novos medidos pelo fechar (ver bloco FATOS MEDIDOS).
Código (6): `supabase/functions/_shared/validation.ts`, `supabase/functions/auth-login/index.ts`, `supabase/functions/create-user/index.ts`, `supabase/functions/approve-password-reset/index.ts`, `supabase/functions/revoke-auth-sessions/index.ts`, `supabase/functions/get-sip-password/index.ts`.
Testes (5): `supabase/functions/auth-login/index.test.ts`, `supabase/functions/create-user/index.test.ts`, `supabase/functions/approve-password-reset/index.test.ts`, `supabase/functions/revoke-auth-sessions/index.test.ts`, `supabase/functions/get-sip-password/index.test.ts`.
Mais este próprio `.tmp/relato.md` (relatório do cartão).

## Sobre `auth-login/index.ts` (não está na lista de "ARQUIVOS QUE PODE TOCAR")
Foi indispensável: o item 1 de "O QUE FAZER" manda literalmente "no `auth-login`, falhar fechado no limite por e-mail quando a RPC falhar (sem derrubar o login legítimo: mensagem de indisponibilidade)". O PROBLEMA aponta que "no `auth-login` isso vira falha aberta" (`validation.ts:343`). Sem tocar `auth-login/index.ts` não há como cumprir esse item; a lista de arquivos do cartão apenas não o repetiu. Não toquei em mais nada ali além do bloco do limite por e-mail e do seam de teste. Se o dono preferir separar em outro cartão, é só reverter este arquivo (nada dos outros 4 dependem dele).

## O que mudou e por quê
- `_shared/validation.ts`: `enforceRateLimit` agora sinaliza `unavailable: true` quando a RPC `consume_rate_limit` falha ou devolve contrato inválido. O `allowed` continua sendo o contador local, então nenhum outro caller muda de comportamento (mudança aditiva/compatível).
- `auth-login/index.ts`: a guarda por e-mail (lockout por conta) falha FECHADO — se o persistente está indisponível, responde 503 ("Serviço de autenticação indisponível", mascarado no corpo a "Internal server error" como os demais 503) em vez de aceitar só com o contador em memória, que zera a cada cold start. O login legítimo segue normal quando o banco responde.
- `create-user`, `approve-password-reset`, `revoke-auth-sessions`, `get-sip-password`: `checkRateLimit` (memória, zera por isolate) trocado por `enforceRateLimit` (tabela `edge_rate_limits`). Dois limites por edge: por IP ANTES de autenticar e por USUÁRIO DEPOIS da autenticação, chave `<edge>:user:<id>` — cobre a conta admin comprometida trocando de IP (o risco citado no PROBLEMA).
- `approve-password-reset/index.ts`: os dois UPDATEs (aprovar e rejeitar) viram compare-and-swap `.eq("id", requestId).eq("status","pending").select("id")`; se as linhas afetadas forem 0, responde 409. Duas aprovações simultâneas: a que perde recebe 409 e não reescreve `reviewed_by`/`status`.
- Handlers ganharam seams de injeção (`enforceRateLimit`, e `caller`/`client`/`env`) para provar o gate sem tocar rede — mesmo padrão já usado em `auth-login`.

Ramos de erro, antes → depois:
- auth-login (limite por e-mail): antes só existia 429; agora existe um ramo `unavailable` → 503 ANTES do 429. O 429 e o caminho feliz ficaram idênticos.
- approve-password-reset: os UPDATEs ganharam o filtro `status=pending` + checagem de linhas; o ramo de erro (`updateError` → 500) e a auditoria depois do UPDATE não mudaram. O envio de e-mail continua ANTES do UPDATE (preserva a invariante "falha de e-mail → nada aprovado"); consequência assumida: na corrida, a requisição perdedora pode já ter enviado o e-mail antes de receber 409, mas a linha é decidida uma única vez.
- revoke-auth-sessions / get-sip-password: o limite por IP continua o primeiro passo; nenhum ramo de erro foi removido ou movido.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json --allow-env --allow-read supabase/functions/approve-password-reset/index.test.ts` com o guard do approve neutralizado (`if (false && ...)`) → `FAILED | 11 passed | 1 failed`, falhando exatamente em "aprovação concorrente: UPDATE afeta 0 linhas -> 409 e nada auditado".
- verde depois: guard restaurado (`git checkout --`) → os dois testes de concorrência voltam a `ok` (0 failed).
- suite edge completa: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 $(git ls-files 'supabase/functions/**/*.test.ts')` → `ok | 1767 passed (16 steps) | 0 failed | 3 ignored (57s)`.
- limiter persistente indisponível: caso novo em `auth-login/index.test.ts` prova 503 e `signInWithPassword` NÃO chamado.
- zapp-verify: ver o bloco FATOS MEDIDOS do fechar.

## O que NÃO fiz e por quê
- Não criei migration: a tabela `edge_rate_limits` e a RPC `consume_rate_limit` já existem (migration `20260905020000_edge_rate_limits.sql`); o cartão não pediu DDL.
- Não mexi no PR0 de aprovação/rejeição além dos dois UPDATEs deste cartão.
