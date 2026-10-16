Especialista: semisenior

## O que mudou e por quê

Nenhum arquivo de código precisou mudar: o trabalho aprovado (commit 8549800004,
`src/pages/Auth.tsx` + `src/hooks/auth/useAuthForm.ts` +
`src/pages/__tests__/Auth.sem-cadastro.test.tsx`) já está integrado na ponta
dia/2026-10-16 (d723a90107). O refazer 1 tinha ampliado o escopo para além do
aprovado e removido asserções E2E; este refazer descarta esses extras no rebase
e devolve a árvore para a ponta, sem tocar em código. O único arquivo do diff é
este relato.

## Pontos do revisor

- Ponto 1: resolvido — `e2e/auth.spec.ts` intacto no diff (originais presentes na
ponta: linha 8 confere a aba `Entrar` com `data-state` active; linha 16 confere a
mensagem de e-mail inválido; testes de cadastro das linhas 31-44 preservados).
Nada do que o refazer 1 reescreveu foi mantido; nenhuma asserção E2E nova foi
adicionada porque E2E está fora da lista de arquivos do cartão.
- Ponto 2: resolvido — escopo restrito à lista (Auth.tsx, useAuthForm.ts,
`src/pages/__tests__/`, `.tmp/relato.md`). Nenhuma mudança em
`src/services/auth.service.ts` (signUp nas linhas 139-141 mantido),
`src/hooks/auth/useAuth.tsx` (signUp nas linhas 18, 200-201, 234 mantido),
`src/services/__tests__/auth.service.test.ts` (bloco extra do refazer 1 não
incluído) nem `e2e/auth.spec.ts`. O commit aprovado 8549800004 nunca tocou
nesses arquivos (stat dele lista só os 3 arquivos da tela), então a condição
"a menos que o aprovado já as contenha" não se aplica.
- Ponto 3: resolvido — rebase `git rebase --onto dia/2026-10-16 96dd72dc`
tentado de forma fiel: o commit de código do refazer 1 (0d8ae9a866) reaplicou sem
conflito textual; o único conflito do rebase foi `.tmp/relato.md`
(modify/delete — a ponta não carrega relato). Na sequência, os 5 commits do
refazer 1 foram descartados (todo o conteúdo de código deles era fora do escopo
pelo Ponto 2) e a branch foi colocada sobre a ponta (d723a90107). Verificação
completa `zapp-verify <workspace>` (sem --rapido): `OK db_guard`, `OK tipos`,
`OK lint`, `OK migrations`, `AVISO banco_local NÃO VERIFICADO: sem nome de
conjunto`; etapa `testes`: `Test Files 1499 passed | 5 skipped (1504)` /
`Tests 13235 passed | 24 expected fail | 48 todo (13307)` com 1 erro não tratado
em `SoundCustomizationPanel` (detalhe no Ponto 3b); `bun run build`: verde
(`✓ built in 13.98s`, exit 0).
- Ponto 3b (falha da etapa testes): `jev-juiz falha` respondeu `pre_existing
(certeza 0.71)`. É 1 `ReferenceError: window is not defined` (setTimeout de
`src/components/settings/SoundCustomizationPanel.tsx:92` disparando após o
teardown) capturado como erro não tratado na suíte cheia; área de configurações,
sem relação com este cartão, e minha árvore é idêntica à ponta. Isolado, o
arquivo passa: `npx vitest run
src/components/settings/__tests__/SoundCustomizationPanel.test.tsx` →
`Test Files 1 passed (1); Tests 10 passed (10)`. Não corrigi (fora do escopo).
- Ponto 4: resolvido — nenhum número neste relato foi escrito à mão: diff, linhas
e contagens de teste vêm dos comandos colados abaixo (vitest, grep -n, verify).
- Ponto 5: resolvido — `src/pages/__tests__/Auth.sem-cadastro.test.tsx` na ponta é
idêntico ao aprovado e mantém o caminho de cadastro como não acionável: mock
`signUp` na linha 18, `signUp.mockClear()` na linha 54, teste
`o login continua: digita e envia -> signIn é chamado, signUp nunca` na linha 75
e `expect(signUp).not.toHaveBeenCalled()` na linha 89.

## Prova (vermelho antes, verde depois)

Vermelho: com `src/pages/Auth.tsx` restaurado para a versão pré-aprovada
(`git show 8549800004^:src/pages/Auth.tsx`, que contém a aba "Criar Conta"),
`npx vitest run src/pages/__tests__/Auth.sem-cadastro.test.tsx` →
`Test Files 1 failed (1); Tests 4 failed (4)`.
Verde: com o `Auth.tsx` da ponta (texto de apoio na linha 222:
`Não tem acesso? Peça ao administrador da sua equipe.`; zero ocorrências de
`signUp|Criar Conta|Crie sua conta|signup`; `useAuthForm.ts:28` usa só `signIn`),
o mesmo comando → `Test Files 1 passed (1); Tests 4 passed (4)`. Arquivo
restaurado em seguida (`git status` limpo antes de escrever este relato).

## Arquivos no diff

```text
.tmp/relato.md
```

(`git diff --name-only dia/2026-10-16...HEAD`; nenhum arquivo de código: o
aprovado já está na ponta e os extras do refazer 1 foram descartados.)

## O que NÃO fiz e por quê

- Não removi `AuthService.signUp` nem `useAuth.signUp`: o Ponto 2 da recusa manda
reverter essas mudanças por estarem fora da lista de arquivos do cartão.
Registrei o caminho residual como achado fora do escopo no cartão
(kanban_comment 15907) para o coordenador planejar um cartão próprio.
