- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 91s;OK lint 2s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 21:23, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md        |  74 +++--
 e2e/skins-e2e.spec.ts | 744 ++++++++++++++++++++++++++++++++++++++++++++++++++
 playwright.config.ts  |  16 +-
 3 files changed, 812 insertions(+), 22 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: juiz indisponível (não bloqueou)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: playwright.config.ts; padrão sensível: padrão:verifyHmac|signature

Especialista: worker (ci) (area-verificacao-ci)

FAIXA DO PAI: commits 0611bf5ea4, 9165c37704 e 8194eeaa8f vieram por cherry-pick da branch
v2/refazer-e2e-skins-espelho-ci-2610131513219a (cartões t_2fc9a065 / t_998ec4e3) — não são deste cartão;
aqui eles apenas retomam a entrega que ficou parada na fila do integrador.

## Correções desta retomada (orientação do supervisor)
- Estado da branch: o commit 66bb92b3ba tinha tirado o `.tmp/relato.md` do índice (`git rm --cached` +
  commit), o que fazia o diff DESTE cartão APAGAR (D) um arquivo que existe na base. Desfeito: o arquivo
  voltou a ser rastreado, agora com o relato DESTE cartão, no commit
  `docs(e2e): relato da retomada do empilhamento das skins (E81)`. A base usa `.tmp/relato.md` como o
  relato do último cartão integrado (o histórico de `dia/2026-10-13` atualiza esse arquivo a cada
  integração), então o diff mostra M (não D). Nada de `git rm --cached` em `.tmp/`.
- 1ª linha do relato: o corpo do cartão NÃO declara convenção de 1ª linha. Não inventei frase nenhuma: a
  1ª linha acima é a assinatura padrão da minha área (skill `area-verificacao-ci`). O comentário de 20:42
  deste cartão é só uma OBSERVAÇÃO sobre a ferramenta `hermes-tarefa-fechar`
  (`grep -oE 'EXATAMENTE .Especialista: [a-z]+' .tmp/cartao.md` sob `set -euo pipefail` — o `.` exige dois
  caracteres, então a frase natural com um espaço não casa e o script sai RC=1). É registro da fábrica,
  não convenção do cartão. Não mexi na ferramenta (fica em `~/.local/bin`, do dono).

## O que mudou e por quê
- playwright.config.ts: o projeto `chromium-skins` (projeto DESLOGADO — roda contra backend mockado) deixa
  de declarar `retries: 1`. Era exatamente o defeito do PEDIDO ORIGINAL: a declaração quebrava
  `E81: projeto deslogado nao declara retries nenhum`. E `skins-e2e.spec.ts` entra no `testIgnore` do
  `chromium-authenticated` (o projeto logado depende de `setup`/`storageState`; a spec é deslogada).
- e2e/skins-e2e.spec.ts: a spec da entrega (fidelidade das 19 skins + 14 checks da tela de temas),
  trazida como estava. Nenhuma asserção foi afrouxada; a guarda E81 continua a mesma.

## Prova (vermelho antes, verde depois)
- verde depois (HEAD): `node --test scripts/ci/playwright-config-e81.unit.mjs`
      ✔ E81: projeto deslogado nao declara retries nenhum
      ℹ tests 6   ℹ pass 6   ℹ fail 0
- vermelho antes (config pré-fix, `git show 9165c37704:playwright.config.ts > playwright.config.ts`):
      ✖ E81: projeto deslogado nao declara retries nenhum  — ERR_ASSERTION
      actual contém `retries: 1` no projeto `chromium-skins` (doesNotMatch /retries:/)
- espelho do CI (`bash ~/arquitetura-v2/integrador/ci_espelho.sh .`): o item que nomeou o cartão
  `node: E81: projeto deslogado nao declara retries nenhum` NÃO aparece na lista de falhas
  (`grep -c E81 .tmp/espelho.log` → 0). As falhas que sobram vêm de arquivos que este diff não toca
  (`scripts/ci/lint-ratchet.unit.mjs`, `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs`,
  guarda `scripts/ci/implicit-any-ratchet.mjs`): `git diff --stat dia/2026-10-13 HEAD -- scripts .github`
  é vazio, então são o mesmo veredito da base, não falha nova deste cartão.

## Sobre o MOTIVO REGISTRADO (guarda: scripts/ci/implicit-any-ratchet.mjs)
Não é dívida de implicit-any deste cartão — é o supervisor de memória matando o `tsc`.
1. O ratchet roda `tsc -p tsconfig.app.json --noEmit --noImplicitAny`; o `include` desse tsconfig é só
   `["src"]`, e este diff não toca `src` (`git diff --stat dia/2026-10-13 HEAD -- src` → vazio). Entrada
   byte-idêntica à da base → mesmo veredito antes e depois do cartão.
2. A falha de hoje é operacional: `tsc` morto por sinal (`exit null` / `Killed` 137) com a máquina sem
   memória (47Gi total, 43Gi usados, swap 8Gi/8Gi esgotado). O `zapp-verify . --rapido` deste cartão
   travou no passo `tipos` por espera de vaga no pool, não pelo diff.
3. As demais linhas do espelho (verify-crm `FLAG_CHANGES.md`, Talk X timezone, `--staged`) não leem
   nenhum arquivo deste cartão.

## O que NÃO fiz e por quê
- Não toquei em `scripts/**`, `.github/**` nem no teste da guarda E81: o defeito era o config do projeto
  deslogado, não a asserção.
- Não criei exceção, faixa nem timeout novo em guarda nenhuma.
- Não alterei `src/`, migrations, Edge Functions nem dependências.
- Não rodei push, PR, deploy nem migration.
