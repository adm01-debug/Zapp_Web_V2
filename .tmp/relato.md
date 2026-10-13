Especialista: Hugo (area-front-hooks)

Concluí o cartão: o hook e o teste estão no commit, e a verificação rodou verde.

## O que mudou e por quê

- `src/hooks/contacts/useContactsDataSource.ts` (novo): devolve `{ fonte: 'singu' | 'zapp' | 'indisponivel', carregando }` para o selo "Origem dos dados" do cabeçalho (o visual é o RD-013, da íris). `zapp` quando a ligação com o Singu está desligada (a flag `crm.integration`, o mesmo `useCRMIntegrationEnabled`); `singu` quando a ligação está ligada e a consulta ao Singu não falhou; `indisponivel` quando a consulta falhou (Singu fora do ar). `carregando` significa que há consulta ao Singu em voo; nesse momento `fonte` é a origem esperada e a tela mostra o esqueleto.
- `src/hooks/contacts/__tests__/useContactsDataSource.test.ts` (novo): exercita o hook de verdade, trocando só o portão da integração e o lote de CRM (o serviço que o `realAdapter` do CT-002 usa). 6 casos: `zapp` com a ligação desligada, `singu` com o lote respondendo, `carregando` com o lote em voo, `indisponivel` com o lote falhando, a volta para `singu` depois de um refetch que dá certo (o aviso não fica preso) e a prova de que o hook não dispara requisição.

## Prova

- vermelho antes: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Error: Failed to resolve import "../useContactsDataSource" ... Does the file exist?` / `Test Files 1 failed (1); Tests no tests`.
- verde depois: `npx vitest run src/hooks/contacts/__tests__/useContactsDataSource.test.ts` → `Test Files 1 passed (1); Tests 6 passed (6)`.
- vizinhança: `npx vitest run src/hooks/contacts src/hooks/crm` → `Test Files 18 passed (18); Tests 111 passed | 1 expected fail (112)`.
- o teste morde o comportamento: com `if (batchState === 'erro')` neutralizado por um `false &&`, a mesma execução dá `Test Files 1 failed (1); Tests 2 failed | 4 passed (6)` (caem os dois casos de `indisponivel`); a mutação foi revertida e a suíte voltou verde.

## Como ele lê o Singu sem pedir dado de novo

O módulo já dispara o lote de CRM (`useExternalContact360Batch` → `ExternalCRMService.getContact360Batch` → edge `crm-integration`, ação `contactLookupBatch`) — o mesmo caminho do `realAdapter` do contrato do CT-002. O hook não abre consulta nova nem chama a saúde da Edge: ele lê o estado dessa consulta compartilhada no cache do React Query, pela família de chave `['external-contact-360-batch', …]` (o mesmo `getQueryCache().findAll(...)` por prefixo que `useTalkXCampaignList` usa), mais o portão `crm.integration`. O teste "não faz requisição nova: sozinho, não chama o lote de CRM" monta o hook sem o hook do módulo: `getContact360Batch` fica com zero chamadas e o estado sai `{ fonte: 'singu', carregando: false }`. Nos casos em que o hook do módulo também é montado, o lote é chamado uma vez só.

## Decisões de escopo

- Escolhi ler a consulta compartilhada em vez de criar consulta própria: assim o selo reflete o que o módulo realmente consultou, sem requisição a mais.
- O adaptador de teste do CT-002 (`singu-adapter.mock.ts`) fica de fora do hook: ele lê a consulta que o adaptador real já faz, e o mock vive só em dev/teste.
- O visual do selo é o RD-013 (íris) e a flag `contacts.v2` decide se o cabeçalho novo existe (RD-011/RD-013); o contrato deste hook responde de onde vêm os dados, e com a integração desligada a resposta é `zapp`.
