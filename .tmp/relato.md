Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- src/components/talkx/__tests__/TalkXSegments.feedbackMassaMotivos.test.tsx (novo): prova que o painel de resultado do lote (X114) separa, item a item, o bloqueio da guarda de uso do erro genérico — o item barrado chega da RPC com `error_code: 'P0001'` e a tela escreve "Não aplicável", o item que falhou por qualquer outro motivo escreve "Falhou — <mensagem do servidor>", os dois aparecem juntos no mesmo lote de 3 selecionados, o aplicado NÃO entra na lista de falhos, e a seleção mantém só os não aplicados para nova tentativa. O teste cobre o ramo `error_code !== 'P0001'` de `motivoFalha`, que os testes já existentes (que só exercitam P0001) não tocam.
- Renderiza o componente REAL `TalkXSegments` e só mocka a fronteira (o cliente Supabase/RPC); não muda produção.

## Prova
- verde depois: `npx vitest run src/components/talkx/__tests__/TalkXSegments.feedbackMassaMotivos.test.tsx` -> `Test Files 1 passed (1); Tests 2 passed (2)`
- suíte do assunto: `npx vitest run <viewMode + feedbackMassa + feedbackMassaMotivos + useTalkXSegments.viewMode + useTalkXSegments.acoesEmMassa>` -> `Test Files 5 passed (5); Tests 17 passed (17)`
- vermelho antes (mutação em produção: `motivoFalha` sempre devolve "Falhou") -> `AssertionError: expected 'VIP · Falhou — Segmento em uso pela c…' to contain 'Não aplicável'`
- vermelho antes (mutação em produção: `motivoFalha` sempre devolve "Não aplicável") -> `AssertionError: expected 'Antiga · Não aplicável — Não foi poss…' to contain 'Falhou'`
- produção restaurada: `git diff --stat` vazio; o meu commit adiciona só o arquivo de teste.

## O que NÃO fiz e por quê
- NÃO CONCLUÍ o critério "zapp-verify . --rapido verde": o passo `tipos` morre por OOM do host (`tsc` Killed, exit 137) e a saída NÃO tem nenhum `error TS` — é falha de execução, não de tipagem. Rodei 3 vezes (313s, 348s, 115s), sempre Killed; `jev-juiz falha` classificou como `environment` (certeza 0.93, "rodar de novo ajuda: 0.65"). Evidência do host no momento: `load average 49`, `Mem free 454 MB`, `Swap 8191/8192` — vários workspaces de outros cartões rodando em paralelo. O passo `db_guard` do próprio zapp-verify deu OK.
- Não mexi em produção: o branch carrega os 3 commits-pai (alternância lista/grade, seleção/ação em massa pela RPC guardada, feedback por item) como dependência já presente na tentativa anterior; o meu commit desta rodada adiciona apenas o arquivo de teste novo.
- A "reutilização do componente de X112" citada no cartão-pai não pôde ser conferida porque o commit de X112 (5918f7d9b) não é ancestral deste branch; a alternância reusa o mesmo `SegmentCard` para lista e grade, e isso já está provado em `TalkXSegments.viewMode.test.tsx` (verde acima). Fica como observação de integração, fora da minha área.
