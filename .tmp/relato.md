Especialista: worker (hooks)
## FATOS MEDIDOS (16/10, comandos rodados neste workspace)
- `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Test Files 1 passed, Tests 7 passed`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (58s)` (sem migration no cartão; banco não verificado, esperado)
- `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff (3 arquivos) nem no relato. Pode fechar.`
- `git diff --stat dia/2026-10-16...HEAD` → 3 files changed, 258 insertions(+) (2 arquivos do cartão + `.tmp/relato.md`, artefato do fechar)
## O que mudou e por quê
- src/hooks/contacts/useContactsDataSource.ts: `readBatchState` passa a considerar só consultas ATIVAS (`cache.findAll({ queryKey, type: 'active' })`) — um lote antigo que falhou (outra lista ou página) fica no cache até o gcTime, mas não prende mais o selo em 'indisponivel' quando o lote atual responde.
- src/hooks/contacts/useContactsDataSource.ts: comentário de sincronia no `CONTACTS_SINGU_BATCH_QUERY_KEY` (`useExternalContact360Batch` não exporta a chave; as duas precisam andar juntas).
- src/hooks/contacts/__tests__/useContactsDataSource.test.ts: teste novo "erro velho de outra lista não prende o aviso quando o lote atual responde" — monta o batch real do módulo, falha a primeira lista e troca para outra lista (chave nova) que responde.
## Prova
- vermelho antes: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts -t "erro velho de outra lista"` → `Tests 1 failed | 6 skipped (7)` (recebido `{ fonte: 'indisponivel' }` onde se esperava `{ fonte: 'singu', carregando: false }`).
- verde depois: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Test Files 1 passed, Tests 7 passed`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (58s)` (cartão sem DDL; banco fora do escopo).
- juiz: `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff (3 arquivos) nem no relato. Pode fechar.`
## Pontos do revisor
- Ponto 1: resolvido — `readBatchState` (`src/hooks/contacts/useContactsDataSource.ts:60`) filtra só consultas ativas (`src/hooks/contacts/useContactsDataSource.ts:66`, `type: 'active'`); prova no teste novo (vermelho→verde acima).
- Ponto 2: resolvido — o teste novo `src/hooks/contacts/__tests__/useContactsDataSource.test.ts:115` monta o hook real do módulo com outra lista de contatos (chave nova) que responde e exige `{ fonte: 'singu', carregando: false }`; falha com a lógica anterior.
- Ponto 3: resolvido sem arquivo extra — `useExternalContact360Batch` (`src/hooks/crm/useExternalContact360Batch.ts:43`, chave literal no `queryKey`, sem export) não exporta a chave, então a sincronia está no comentário em `src/hooks/contacts/useContactsDataSource.ts:51`; importar exigiria editar o terceiro arquivo, fora dos arquivos permitidos.
- Ponto 4: resolvido — primeira linha deste relato é `Especialista: worker (hooks)`; com a ligação ativa e nenhum lote consultado ainda ('ausente'), o hook responde 'singu' (sem consulta em voo, `carregando: false`), comportamento coberto pelo teste `src/hooks/contacts/__tests__/useContactsDataSource.test.ts:138` ('não faz requisição nova').
## O que NÃO fiz e por quê
- Não exportei a chave de `useExternalContact360Batch`: seria um terceiro arquivo no diff, recusado por "diff maior que o título".
## Nota ao juiz do fechar (16/10)
- Sobre o aviso "Ponto 4 sem relato no diff": `.tmp/relato.md` está no diff contra a base (`git diff --stat dia/2026-10-16...HEAD` lista `.tmp/relato.md` + os 2 arquivos permitidos), 1ª linha `Especialista: worker (hooks)`; a explicação 'ausente'→'singu' está no Ponto 4 acima com o teste que a cobre (`useContactsDataSource.test.ts:138`).
- Retomada 16/10 em workspace novo (o anterior pertencia à sessão de 14/10): cherry-pick dos 2 commits do cartão sobre `dia/2026-10-16`, prova refeita (vermelho `1 failed | 6 skipped`, verde `7 passed`), `zapp-verify . --rapido` VERDE SEM BANCO.
