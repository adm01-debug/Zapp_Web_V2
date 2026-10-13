Especialista: hugo

## O que mudou e por quê
- src/hooks/business/useClientWallet.ts — a falha deixou de ser engolida nos três caminhos do citado `hooks/business/useClientWallet.ts:78-90` e no `fetchData`:
  - `fetchData`: cada leitura (`client_wallet_rules`, o join em `profiles`, o join em `whatsapp_connections`, as listas completas de `profiles` e `whatsapp_connections`) passa a conferir o `error` devolvido e a anotar a primeira mensagem. No fim, se houve falha, sobe `error` (mensagem) + `errorSource: 'load'` e um aviso destrutivo "Erro ao carregar as regras da carteira"; se não houve, limpa `error`/`errorSource`. A lista que já estava na tela continua preservada (comportamento que já existia e ficou travado no teste "recarga que falha depois de uma carga boa…").
  - `handleToggleActive`: virou estado otimista com rollback — a linha muda na hora, o valor anterior é lido do estado atual (só leitura) e, se o banco recusar, volta para o valor anterior, com `error`/`isError`/`errorSource: 'toggle'` e aviso. A escrita passou a ser funcional (`prev => …`), que é o que conserta a corrida de duas alternâncias simultâneas.
  - `handleDeleteRule`: mesmo desenho otimista, guardando o ÍNDICE original para repor a regra na MESMA posição se o banco recusar, com `error`/`isError`/`errorSource: 'delete'` e aviso. Nada mais falha em silêncio.
  - O retorno passou a expor `error` (string|null), `isError` (boolean) e `errorSource` ('load'|'toggle'|'delete'|null).
- src/hooks/business/__tests__/useClientWallet.test.tsx — os dois defeitos que estavam travados como `it.fails` foram corrigidos e viraram testes normais (a corrida de duas alternâncias simultâneas e a exclusão negada pelo RLS), mais três testes novos de carga e as asserções de `error`/`isError`/`errorSource`/aviso nas duas mutações negadas. O docblock do arquivo foi atualizado para refletir isso.

## Prova
- vermelho antes (hook na versão da base, só o teste novo): `npx vitest run src/hooks/business/__tests__/useClientWallet.test.tsx` → `Tests 6 failed | 11 passed (17)`. Os 6 são exatamente os caminhos novos: falha de carga expõe error/isError; carga boa limpa error/isError; RLS nas listas auxiliares sobe como carga; alternância negada faz rollback e avisa; duas alternâncias simultâneas; exclusão negada repõe na posição original e avisa.
- verde depois: `npx vitest run src/hooks/business/__tests__/useClientWallet.test.tsx` → `Test Files 1 passed (1); Tests 17 passed (17)`, zero pulados.
- regressão dos módulos tocados: `npx vitest run src/hooks/business src/components/wallet` → `Test Files 4 passed (4); Tests 36 passed (36)`.
- verificação do cartão: `zapp-verify . --rapido` (rodado pelo fechar, abaixo).

## O que NÃO fiz e por quê
- Não toquei em `src/components/wallet/ClientWalletView.tsx`: o cartão só autoriza o hook e os testes; o estado `error`/`isError`/`errorSource` fica exposto para a tela consumir, e o aviso ao usuário sai pelo `toast` do próprio hook.
- Não mexi em `handleAddRule` além do que já existia (ele já avisa erro de insert e mantém o diálogo aberto) — o cartão pede as DUAS mutações, alternância e exclusão.
- Nenhuma migration, Edge Function, dependência nova ou credencial; nada de produção.
