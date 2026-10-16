Especialista: worker (hooks)
## O que mudou e por quê
- src/hooks/contacts/useContactsDataSource.ts: `readBatchState` passa a considerar só consultas ATIVAS (`cache.findAll({ queryKey, type: 'active' })`) — um lote antigo que falhou (outra lista ou página) fica no cache até o gcTime, mas não prende mais o selo em 'indisponivel' quando o lote atual responde.
- src/hooks/contacts/useContactsDataSource.ts: comentário de sincronia no `CONTACTS_SINGU_BATCH_QUERY_KEY` (`useExternalContact360Batch` não exporta a chave; as duas precisam andar juntas).
- src/hooks/contacts/__tests__/useContactsDataSource.test.ts: teste novo "erro velho de outra lista não prende o aviso quando o lote atual responde" — monta o batch real do módulo, falha a primeira lista e troca para outra lista (chave nova) que responde.
## Prova
- vermelho antes: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts -t "erro velho de outra lista"` → `Tests 1 failed | 6 skipped (7)` (recebido `{ fonte: 'indisponivel' }` onde se esperava `{ fonte: 'singu', carregando: false }`).
- verde depois: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (cartão sem DDL; banco fora do escopo).
- juiz: `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff nem no relato. Pode fechar.`
## Pontos do revisor
- Ponto 1: resolvido — `readBatchState` (`src/hooks/contacts/useContactsDataSource.ts:60`) filtra só consultas ativas (`src/hooks/contacts/useContactsDataSource.ts:66`, `type: 'active'`); prova no teste novo (vermelho→verde acima).
- Ponto 2: resolvido — o teste novo `src/hooks/contacts/__tests__/useContactsDataSource.test.ts:115` monta o hook real do módulo com outra lista de contatos (chave nova) que responde e exige `{ fonte: 'singu', carregando: false }`; falha com a lógica anterior.
- Ponto 3: resolvido sem arquivo extra — a chave do batch do Singu é literal dentro de `useExternalContact360Batch` (módulo CRM, sem export), então a sincronia está registrada no comentário em `src/hooks/contacts/useContactsDataSource.ts:51`; importar a chave exigiria editar o módulo CRM, fora dos arquivos permitidos.
- Ponto 4: resolvido — primeira linha deste relato é `Especialista: worker (hooks)`; com a ligação ativa e nenhum lote consultado ainda ('ausente'), o hook responde 'singu' (`carregando: false`), coberto pelo teste `src/hooks/contacts/__tests__/useContactsDataSource.test.ts:138`. Este `.tmp/relato.md` viaja no diff da entrega e é o artefato que o fechar avalia junto com o código.
## O que NÃO fiz e por quê
- Não exportei a chave de `useExternalContact360Batch`: seria um terceiro arquivo no diff, recusado por "diff maior que o título".
## Conclusão
- Os 4 pontos da recusa estão resolvidos no diff desta entrega; verificação verde.
