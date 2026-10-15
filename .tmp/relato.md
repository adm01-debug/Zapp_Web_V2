Especialista: workertestes

## Ponto 1 (único) da recusa — quebra no empilhamento em `useConnectionsManager.novaConexao.test.ts`
Causa conferida no código (não adivinhei): a pilha junta a base `dia/2026-10-14` (que já contém o teste integrado do cartão t_9b483886) com esta entrega, que traz dos cartões pai a validação de telefone no gerente (`src/hooks/inbox/useConnectionsManager.ts`, `validarTelefoneConexao` + `normalizeE164BR`). O gerente passou a enviar `phone_number` normalizado em E.164 (com +55) no payload do `createConnection`, mas o teste integrado esperava os dígitos crus digitados. Reproduzi a pilha sem trocar de branch (a guarda proíbe): `git merge-tree` da entrega sobre `dia/2026-10-14` aplica limpo (só o runtime diverge) e, com o arquivo do dia materializado no workspace, `npx vitest run src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts` deu VERMELHO exatamente como o limpador apontou: `Test Files 1 failed (1); Tests 1 failed | 5 passed | 1 todo (7)` — só o teste "sucesso cria a conexão como padrão" cai, no `toMatchObject` do payload (esperava dígitos crus, o gerente entrega E.164).

O que mudei (só teste, zero produção): em `src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts`, a expectativa do payload passou a exigir o E.164 normalizado (valor exato, sem afrouxar: continua `toMatchObject` com nome, telefone e `is_default: true`), com comentário de 2 linhas citando `validarTelefoneConexao`/`normalizeE164BR`. É o comportamento pretendido dos cartões pai (o hook documenta que a Edge grava o E.164); o teste agora fixa isso em vez de congelar o formato antigo. Não mexi no `it.todo` do UI-07 nem em nenhum outro teste — diff mínimo (1 linha útil + comentário). O arquivo no meu commit é idêntico ao integrado no dia, exceto esse hunk (conferido com `diff` contra `dia/2026-10-14`).

Teste que prova (chama o hook real, fronteira dublada como antes):
- vermelho antes (pilha sem a correção): `Test Files 1 failed (1); Tests 1 failed | 5 passed | 1 todo (7)`.
- verde depois, 3 rodadas seguidas: `Test Files 1 passed (1); Tests 6 passed | 1 todo (7)` nas três.
- prova por mutação (a correção fixa comportamento, não formato): reverti só a linha de produção `phone_number: telefone.e164` para os dígitos crus (cópia de segurança em /tmp, sem `git stash`, restaurada com `cp`) → `Test Files 1 failed (1); Tests 1 failed | 5 passed | 1 todo (7)`; restaurei → `Test Files 1 passed (1); Tests 6 passed | 1 todo (7)`. `git status` confirma produção intacta.

## Sem regressão na vizinhança
- `npx vitest run` nos 7 arquivos do gerente + realtime (`adicionar-conexao`, `novaConexao`, `b2`, `setDefault`, `qrIdentity`, `tra005`, `useConnectionsRealtime`): `Test Files 7 passed (7); Tests 36 passed | 1 todo (37)`.
- `npx vitest run src/components/connections src/components/alerts`: `Test Files 14 passed (14); Tests 62 passed (62)`.

## Arquivos do meu commit neste refazer (o resto do diff vs a base são os pais, trazidos por cherry-pick como o cartão manda)
- src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts (alinhado ao E.164; conteúdo = dia/2026-10-14 + hunk acima)
- .tmp/relato.md (este relato)

## Verificação
- `zapp-verify full .` → db_guard OK, tipos OK (13s), lint OK (119s), migrations OK (1s), banco_local AVISO (sem conjunto, esperado); testes: `Test Files 1 failed | 1322 passed (1323)` / `Tests 1 failed | 11945 passed | 25 expected fail | 15 todo (11986)` + `Errors 1 error`. A falha (`talkx RuleValueInput`, timeout de `waitFor`) e o erro (`RealtimeInboxView`, `ERR_INVALID_ARG_TYPE` de `Event` do jsdom/undici) são PRÉ-EXISTENTES e independentes desta mudança: repetem IDÊNTICOS com o meu arquivo fora da árvore (experimento de remoção). Nenhum arquivo de `talkx/` ou `inbox/` está no diff desta entrega.
