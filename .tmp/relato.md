Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/components/talkx/__tests__/RuleValueInput.test.tsx: `afterEach(() => window.history.replaceState(null, '', '/'))` no describe — o `window.location` do jsdom é COMPARTILHADO por todos os testes do arquivo; o teste do lead_score abre o construtor e não publica, deixando `?mode=new` no endereço, e o teste seguinte monta já no construtor, onde o botão "Novo segmento" não existe. Mesmo idioma dos irmãos do módulo (`TalkXSegments.route.test.tsx:102`).
- mesma linha: `vi.setConfig({ testTimeout: 20000 })` + `ESPERA_MOUNT = { timeout: 15000 }` nas esperas do mount — sob pico da fábrica (load >2× CPUs) a montagem da árvore TalkX inteira pode passar do teto de 5 s do `findBy` (`asyncUtilTimeout`, src/test/setup.ts:152). Nenhuma asserção mudou.

## Prova
- vermelho antes (base dia/2026-10-13, sem a mudança): `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` -> `Test Files 1 failed (1)` / `Tests 1 failed | 4 passed (5)`, erro `Unable to find role="button" and name "Novo segmento"` em `RuleValueInput.test.tsx:207`.
- verde depois: mesmo comando -> `Test Files 1 passed (1)` / `Tests 5 passed (5)`, 3 execuções seguidas.
- A asserção de negócio (Lead score e Risco de churn desabilitados) segue exercitada no mesmo caminho real da tela; só o isolamento de rota e a folga de tempo mudaram.

## Causa (diagnóstico prévio, t_cfbe9aca)
- NÃO é tempo nem "render pesado": é poluição de estado entre testes — a hipótese escrita no cartão foi REFUTADA pela tarefa de diagnóstico (branch v2/diagnostico-rulevalueinput-instavel-2610130340d4b0: 7/7 vermelho na ordem do arquivo vs 4/4 verde sozinho). Contudo, sob carga extrema (load ~51 em 24 CPUs) o teto de 5 s do `findBy` ainda cortou uma execução; por isso a folga de tempo do passo 2 do cartão entrou JUNTO com o isolamento.

## Outros testes do mesmo risco (passo 4 do cartão)
- Levantados na auditoria irmã (t_b6d4802b): 12 de risco ALTO na pasta `src/components/talkx/__tests__/` (mount pesado + teto padrão), só 1 com timeout explícito. Nenhum foi alterado aqui: não é correção de 1 linha e não pertence a este cartão.

## O que NÃO fiz e por quê
- Não mockei a árvore TalkX, nem usei skip/only, nem toquei em produção do código: o cartão proíbe afrouxar a asserção e o caminho real é o que ela prova. Diff só no arquivo de teste citado.
