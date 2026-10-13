Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/inbox/useConnectionsRealtime.ts` (novo): o canal de `whatsapp_connections` passa a viver num só lugar, com tópico único por montagem (`uniqueRealtimeTopic`), assinatura e cleanup próprios, e o aviso "WhatsApp conectado!" deduplicado por transição (`announceConnected`). Antes cada consumidor abria um canal de nome FIXO e o `supabase.channel(nome)` devolvia o MESMO canal para os dois — `.on()` em canal já inscrito lança e o unmount de um cortava o realtime do outro.
- `src/hooks/inbox/useConnectionsManager.ts`: usa o hook novo (saiu o canal fixo `whatsapp-connections-changes`); valida e normaliza o telefone **antes** de chamar a Edge (DDD inexistente ou curto demais vira motivo na tela, não 400 do `create-connection`); no `handleDelete`, `code: 'INSTANCE_GONE'` passa a ser estado a reconciliar (limpa o vínculo local e anuncia "Conexão removida", sem "Erro ao excluir"); excluir, desconectar e definir padrão invalidam `talkx-connection-status` e `catalog-send-readiness`.
- `src/components/alerts/EvolutionDisconnectBanner.tsx`: usa o mesmo hook (saiu o canal fixo `disconnect-banner`).
- `src/hooks/evolution/useEvolutionApiCore.ts`: o `code` do corpo de erro sobe no `Error` lançado — sem ele o `INSTANCE_GONE` era indistinguível de erro real. Additivo: só acrescenta o campo.
- `src/hooks/evolution/useEvolutionInstance.ts`: `deleteInstance` deixou de ter toast próprio e passou a usar `callApi`; o único chamador é o `handleDelete` (conferido por `git grep`), que decide a mensagem e trata o estado reconciliado.
- Testes novos: `src/hooks/inbox/__tests__/useConnectionsRealtime.test.ts`, `src/hooks/inbox/__tests__/useConnectionsManager.b2.test.ts`, `src/components/alerts/__tests__/EvolutionDisconnectBanner.realtime.test.tsx`.

## Prova
- vermelho antes (os 4 arquivos de produção de `src` na versão da base `dia/2026-10-12`, com os testes novos intactos): `npx vitest run src/hooks/inbox/__tests__/useConnectionsManager.b2.test.ts src/components/alerts/__tests__/EvolutionDisconnectBanner.realtime.test.tsx src/hooks/inbox/__tests__/useConnectionsRealtime.test.ts` → `Test Files 2 failed | 1 passed (3); Tests 9 failed | 6 passed (15)`
- verde depois (mesmo comando, arquivos restaurados): `Test Files 3 passed (3); Tests 15 passed (15)`
- regressão das suítes da área: `npx vitest run src/hooks/inbox src/components/alerts src/hooks/evolution` → `Test Files 28 passed (28); Tests 242 passed | 3 expected fail | 1 todo (246)`

## Dependência do cartão pai (t_a5acd992)
- O pai não estava em `dia/2026-10-12` quando o workspace nasceu; eu cheguei a trazer a faixa com `git cherry-pick -x`, mas o `hermes-tarefa-fechar` barra por regra acima de 90 mil caracteres adicionados, porque a faixa do pai (Edge/migration) sozinha passa disso. Então o meu branch ficou `dia/2026-10-12` + o meu único commit `27f3099a3` (8 arquivos). A faixa do pai é integrada pelo próprio cartão dele na fila do integrador; a minha mudança não depende do código dele (o `INSTANCE_GONE` usado aqui é o `code` do corpo, tratado no front).

## Arquivos fora da lista "ARQUIVOS QUE PODE TOCAR" (justificativa)
- O cartão lista `useConnectionsManager.ts`, `useConnectionsRealtime.ts` (novo), `EvolutionDisconnectBanner.tsx` e os testes. `useEvolutionApiCore.ts` e `useEvolutionInstance.ts` entraram porque são **indispensáveis** a um item do CRITÉRIO DE PRONTO — tratar `code: 'INSTANCE_GONE'`:
  - o `code` vem no corpo da resposta da Edge, mas quem lê o corpo é o `callApi` de `useEvolutionApiCore.ts` e ele montava o `Error` só com `details/apiStatus/retries`; sem subir `code`, o `handleDelete` não distingue estado reconciliado de erro real e o requisito não teria como ser implementado (+4/-1 linha, aditivo: só acrescenta um campo ao `Error`);
  - `deleteInstance` de `useEvolutionInstance.ts` usava `withToast`, que dispara toast de erro automático: mesmo tratando o `code`, o operador veria o aviso vermelho antes do "Conexão removida". O único chamador é o `handleDelete` (conferido com `git grep deleteInstance -- src`), então nada externo perdeu o toast (5 linhas).
- As duas são hooks da minha própria área (`area-front-hooks`) e nenhuma muda contrato de terceiro.

## O que NÃO fiz e por quê
- Não mexi em `src/hooks/integrations/useTalkXConnectionStatus.ts` nem em `useCatalogSendReadiness.ts`: o cartão permitia invalidar de fora (feito no gerente) em vez de assinar realtime neles.
- Não mexi em `fetchConnections` (ordem/limite): fora do defeito deste cartão.
