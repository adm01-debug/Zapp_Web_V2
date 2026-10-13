Especialista: workertestes

## O que mudou e por quê
- src/hooks/inbox/__tests__/useConnectionsManager.adicionar-conexao.test.ts (novo): 7 testes de comportamento que chamam o hook REAL `useConnectionsManager`, cobrindo o que a V2 não tinha — adicionar conexão com sucesso (E.164 normalizado, nome de instância único, fecha o diálogo, limpa o formulário e abre o QR da conexão devolvida pela Edge), formulário sem nome/telefone, erro da Edge sem criar linha local (o front nunca insere em `whatsapp_connections`), conexão sem `instance_id`, exclusão com sucesso, falha ao apagar o vínculo local ("Exclusão pendente") e falha da Edge ao desconectar.
- Nenhuma linha de produção alterada: a mutação usada como prova foi revertida com `git checkout` e o `git status` só mostra o arquivo de teste novo.
- Dependência: trouxe por cherry-pick a faixa inteira dos dois cartões pai que não estavam na base (t_b8ea21c0 @ ee32a1d54 e t_b41eed0b @ 01123b06b), como o cartão manda. O commit próprio deste cartão é só o teste novo.

## Prova
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useConnectionsManager.adicionar-conexao.test.ts` — 3 rodadas, `Test Files 1 passed (1); Tests 7 passed (7)` nas três.
- vermelho antes (prova por mutação): revertidas 7 linhas de produção em `useConnectionsManager.ts` (reset de diálogo/formulário no sucesso; título "Erro ao criar conexão"; descrição do "não possui uma instância configurada"; título "Exclusão pendente"; descrição "excluída com sucesso"; título "Erro ao desconectar"; descrição "Preencha o nome...") → `Test Files 1 failed (1); Tests 7 failed (7)`, cada mutação derrubando exatamente o teste que a fixa. Restaurado com `git checkout --` → verde.
- vizinhança (sem regressão): `npx vitest run src/hooks/inbox/__tests__ src/components/connections/__tests__ src/components/monitoring/__tests__ src/components/alerts/__tests__` → `Test Files 42 passed (42); Tests 235 passed | 1 expected fail (236)`.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## O que NÃO fiz e por quê
- Não dupliquei realtime (canal único por montagem, cleanup, toast único), exclusão `INSTANCE_GONE`, telefone inválido e histórico não suportado: já têm teste dos cartões pai e passam na vizinhança acima — `src/hooks/inbox/__tests__/useConnectionsRealtime.test.ts`, `src/hooks/inbox/__tests__/useConnectionsManager.b2.test.ts` e `src/components/connections/__tests__/ConnectionsView.sync-historico.test.tsx` (notSupported e suportada). O cartão manda não devolver o que já existe.
- Não toquei código de produção nem encontrei defeito no caminho coberto.
- Ambiente (não é defeito do cartão): a verificação `tipos` falhou na 1ª rodada com "TypeScript local nao encontrado"; rodei `bun install` (instrução do próprio iniciar) e a verificação ficou verde.
