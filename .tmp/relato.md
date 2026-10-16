Especialista: worker (hooks)
## O que mudou e por quê
- src/hooks/contacts/useContactsDataSource.ts: `readBatchState` passa a considerar só consultas ATIVAS (`cache.findAll({ queryKey, type: 'active' })`) — um lote antigo que falhou (outra lista ou página) fica no cache até o gcTime, mas não prende mais o selo em 'indisponivel' quando o lote atual responde.
- src/hooks/contacts/useContactsDataSource.ts: comentário de sincronia no `CONTACTS_SINGU_BATCH_QUERY_KEY` (`useExternalContact360Batch` não exporta a chave; as duas precisam andar juntas).
- src/hooks/contacts/__tests__/useContactsDataSource.test.ts: teste novo "erro velho de outra lista não prende o aviso quando o lote atual responde" — monta o batch real do módulo, falha a primeira lista e troca para outra lista (chave nova) que responde.
## Prova
- vermelho antes: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts -t "erro velho de outra lista"` → `Tests 1 failed | 6 skipped (7)` (recebido `{ fonte: 'indisponivel' }` onde se esperava `{ fonte: 'singu', carregando: false }`).
- verde depois: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (58s)` (sem migration no cartão; banco não verificado, esperado).
- juiz: `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff (3 arquivos) nem no relato. Pode fechar.`
## Pontos do revisor
- Ponto 1: resolvido — `readBatchState` em src/hooks/contacts/useContactsDataSource.ts filtra `type: 'active'`; prova no teste novo (vermelho→verde acima).
- Ponto 2: resolvido — o teste novo monta o hook real do módulo com outra lista de contatos (chave nova) que responde e exige `{ fonte: 'singu', carregando: false }`; falha com a lógica anterior.
- Ponto 3: resolvido sem arquivo extra — `useExternalContact360Batch` não exporta a chave, então deixei o comentário de sincronia; importar exigiria editar src/hooks/crm/useExternalContact360Batch.ts, fora dos arquivos permitidos.
- Ponto 4: resolvido — primeira linha deste relato é `Especialista: worker (hooks)`; com a ligação ativa e nenhum lote consultado ainda ('ausente'), o hook responde 'singu' (sem consulta em voo, `carregando: false`), comportamento mantido e coberto pelo teste 'não faz requisição nova'.
## O que NÃO fiz e por quê
- Não exportei a chave de `useExternalContact360Batch`: seria um terceiro arquivo no diff, recusado por "diff maior que o título".
## Nota ao juiz do fechar (16/10)
- "Ponto 4 sem relato no diff" não procede: `.tmp/relato.md` está no diff contra a base (`git diff --stat <base>...HEAD` lista `.tmp/relato.md` + os 2 arquivos permitidos), 1ª linha `Especialista: worker (hooks)`.
- Retomada 16/10 em workspace novo (o anterior pertencia à sessão de 14/10): cherry-pick dos 2 commits do cartão sobre `dia/2026-10-16`, prova refeita (vermelho `1 failed | 6 skipped`, verde `7 passed`), `zapp-verify . --rapido` VERDE SEM BANCO.
