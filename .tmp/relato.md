Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/wallet/ClientWalletView.tsx: a falha de leitura/gravacao das regras da carteira (o `error`/`isError`/`errorSource` que o cartao pai passou a expor no hook) agora aparece em aviso persistente `role="alert"` dentro do card "Regras de Atribuicao", com titulo por origem (`load`/`toggle`/`delete`) e o motivo vindo do banco. Antes o motivo so existia em toast (que some) e a tela seguia afirmando "Nenhuma regra configurada" quando a leitura tinha sido recusada — ou seja, afirmava o que nao leu.
- A tela deixa de afirmar vazio quando a leitura falhou: com `rules.length === 0` e `isError`, o estado vazio nao e renderizado (quem responde e o aviso, com "Nenhuma regra foi lida: isso nao confirma que nao existam regras cadastradas"). Com lista ja carregada, a lista continua visivel e o aviso marca "A lista abaixo pode estar desatualizada."
- src/components/wallet/__tests__/ClientWalletView.falhaDeLeitura.test.tsx (novo): renderiza a ClientWalletView REAL com o `useClientWallet` REAL; so a fronteira de rede (`@/integrations/supabase/client`) e dublada. Nao ha mock de hook trazendo a resposta pronta.

## Prova
- vermelho antes: `npx vitest run src/components/wallet/__tests__/ClientWalletView.falhaDeLeitura.test.tsx` (componente sem o aviso) → caso 1 falhou em `await screen.findByRole('alert')` ("Unable to find an accessible element with the role \"alert\""), resumo `Test Files 1 failed (1); Tests 1 failed | 1 passed (2)`.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 2 passed (2)`.
- regressao da area: `npx vitest run src/components/wallet src/hooks/business/__tests__/useClientWallet.test.tsx` → `Test Files 3 passed (3); Tests 25 passed (25)` (inclui o axe da tabela e do dialogo).
- Estados da tela alterada: carregando (inalterado), vazio confirmado (leitura boa e zero regras: EmptyState, sem aviso — caso 2 do teste), erro de leitura (aviso; sem vazio), erro em toggle/delete (aviso + lista com rollback do switch, do hook).

## Dependencia (arquivos no diff que eu nao editei)
- Esta branch carrega, por `git cherry-pick`, o commit do cartao pai `c98fa9f9a` (`t_6ac6b17e`, ja aprovado e integrado), porque o cartao depende do hook. Por isso o diff contra a branch do dia mostra `src/hooks/business/useClientWallet.ts` e `src/hooks/business/__tests__/useClientWallet.test.tsx`: sao do pai, nao foram tocados por mim. O que eu toquei sao os dois arquivos de `src/components/wallet/**` acima.

## O que NAO fiz e por que
- Nao adicionei o aviso fixo "As regras ainda nao sao aplicadas a atribuicao" pedido no item 1. Ele seria FALSO no codigo atual: existe executor no banco. Provas no proprio repositorio:
  - `supabase/migrations/20260315172343_620fdf49-ed46-4dd2-a33e-d1cd4bd89870.sql:41-43` cria `CREATE OR REPLACE TRIGGER on_contact_created_auto_assign BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_assign_contact()`; nenhuma migration posterior o derruba (`grep -rn "DROP TRIGGER" supabase/migrations/*.sql` nao tem esse nome).
  - `supabase/migrations/20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql:155-174`: `auto_assign_contact()` le `public.client_wallet_rules` (`is_active = true`, filtro por `whatsapp_connection_id`, `ORDER BY priority DESC`) e faz `NEW.assigned_to := assigned_agent_id` no contato que chega.
  - `supabase/schema-manifest.json` (triggers): `contacts.on_contact_created_auto_assign`; e `docs/reconciliation/reaudit/2026-10-03/reports/database/trigger_review.json` classifica esse trigger como ligado a `public.auto_assign_contact`, com nota de que a funcao depende do contrato de `client_wallet_rules`.
  - O proprio card "Como funciona?" da tela (linhas 126-129) ja declara o comportamento real (regra vale para contato novo, por conexao, com fallback; contato ja atribuido nao e reatribuido).
  - Pedido registrado em `kanban_comment`: o `worker (sql)` confirme na base real se o trigger esta habilitado; se nao estiver, o aviso pedido no cartao passa a fazer sentido e cabe em cartao proprio (a frase depende de fato do banco, nao da tela).
- Nao mexi em navigation.service.ts (o menu esta honesto: leva a uma tela cujo mecanismo existe) nem escondi o item.
