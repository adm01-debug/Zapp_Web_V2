Especialista: hugo (CI/devops)

## O que mudou e por quê
- `vitest.config.ts`: novo cálculo de `maxWorkers` no topo — se `VITEST_MAX_WORKERS` for um número válido, usa esse número (integrador segue com 10); senão, se `process.env.CI` estiver definido, não define nada (CI do GitHub igual a hoje); senão, 4 (agentes e uso local). Entra no `test` por spread condicional `...(maxWorkers === undefined ? {} : { maxWorkers })`. Motivo: sem teto o vitest abre um worker por núcleo (24 nesta máquina) e 4 cartões rodando `npx vitest run` juntos levaram a carga a 72.
- `vitest.contracts.config.ts`: a mesma regra (a suíte de contrato roda no `test:contracts` do CI, fora do `bun run test`).
- Não toquei em `fileParallelism`, pool, `include` nem em nada que mude o resultado dos testes.

## Prova
- vermelho antes (configs da BASE via `git show HEAD:` em `.tmp/base`, resolvidas com o `resolveConfig` do vitest): `FALHA ... sem env (agente/local) | maxWorkers=undefined (esperado 4)` nas duas configs — era exatamente o defeito (vitest sem teto). No mesmo teste a base já devolvia 10 com `VITEST_MAX_WORKERS=10` (o vitest lê essa variável nativamente), o que confirma que o caminho do integrador segue igual.
- (a) sem variáveis, workers ≤ 4: `npx vitest run src/lib` (103 arquivos) rodado em segundo plano enquanto um amostrador contava, por `cwd`, só os processos-worker do MEU workspace (`ps -eo pid,cmd` + `readlink /proc/<pid>/cwd`). Resultado: `workers_do_meu_ws=4` em todas as amostras de t=16s a t=40s; outro workspace (`zapp-worktrees/limpador`) rodava ao mesmo tempo e foi contado à parte. Fim: `Test Files 103 passed (103); Tests 1454 passed | 5 expected fail (1459)`.
- (b) a variável continua mandando: `VITEST_MAX_WORKERS=10 npx vitest run src/lib` → `workers_do_meu_ws=10` em todas as amostras. Fim: `Test Files 103 passed (103); Tests 1454 passed | 5 expected fail (1459)`.
- (c) caso CI: `resolveConfig` com `CI=1` e sem a variável → `maxWorkers=undefined` (padrão do vitest, como hoje). A linha que garante isso no arquivo é o spread condicional `...(maxWorkers === undefined ? {} : { maxWorkers })`, comentado no `vitest.config.ts`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (120s)` com `OK tipos 117s`, `OK lint`, `OK migrations`, `OK db_guard`.
- suíte completa com `VITEST_MAX_WORKERS=10` → `Test Files 1217 passed (1217); Tests 11044 passed | 25 expected fail | 14 todo (11083)`, `Duration 315.48s`.

## O que NÃO fiz e por quê
- Sem teste de unidade no diff: a mudança é de configuração e a prova é de execução (os counts de worker e a resolução das duas configs nos três casos, acima). Um teste que importasse o `vitest.config.ts` arrastaria os tipos de `@vitejs/plugin-react`/`vite`, que não resolvem sob o `moduleResolution` do projeto (erro TS2307) e deixariam o typecheck do `zapp-verify` VERMELHO; a alternativa que eu tentei (`resolveConfig` dentro do teste) tinha o mesmo problema de tipos e ainda exigia `import.meta`, que o `module` do projeto recusa (TS1343). Nenhum arquivo de teste ficou no diff.
- Não usei a variável de detecção de agente que o cartão original pedia: a guarda do Hermes recusa qualquer menção ao nome dela (3 tentativas barradas na rodada anterior). Segui o plano revisto do coordenador, que troca a detecção de agente pelo caso "sem variável e fora do CI".
- Não defini `maxWorkers` no CI nem no integrador além do que o cartão pede (a variável manda).
- Escrita não versionada: rodei `bun install` no workspace porque o `zapp-verify` exige o TypeScript local e o workspace veio sem `node_modules` — nenhum arquivo versionado mudou pela instalação.
