# Bloco D — deleções que a `main` não incorporou (16/11/2026)

Complemento de `analise-prs/RECUPERACAO-TOTAL-261116.md`. Existe porque a primeira versão do
gate tinha um ponto cego grave: **apagar arquivo também é trabalho**, e ele não contava.

## O defeito, e por que ele era o pior do ciclo

O gate listava os arquivos que a branch introduz com `git diff --diff-filter=AMR`. Esse filtro
seleciona Added, Modified e Renamed — e **descarta Deleted**. Consequência: uma branch cujo
trabalho é remover código morto saía do inventário com `0 0 0 0`, exatamente igual a uma branch
sem pendência nenhuma.

Isso é pior do que parece, porque **"nada a fazer" é justamente o que autoriza fechar a branch**.
O caso concreto estava no próprio inventário publicado: a
`claude/chore-remove-hook-morto-talksuppression-261024-1541` aparece com todas as contagens em
zero, e o trabalho inteiro dela é uma remoção.

Achado do Codex na revisão da PR #3192, reproduzido antes de qualquer mudança. Corrigido: o gate
faz uma segunda passada com `--diff-filter=D` e conta só a deleção que a `main` **não**
incorporou — se a `main` também não tem mais o arquivo, a remoção chegou e não há pendência.

## As 12 deleções pendentes

Medido: **4 branches, 12 arquivos**. A lista nominal está em
`analise-prs/recuperacao-261116-delecoes.tsv`.

### `claude/chore-remove-hook-morto-talksuppression-261024-1541` (2 arquivos)

Apaga `src/hooks/integrations/useTalkXSuppression.ts` **inteiro** e o teste
`__tests__/useTalkXSuppression.hook-morto.test.ts`.

A `main` manteve o módulo **de propósito**, e documenta isso no cabeçalho do próprio arquivo: o
hook de lista que morava nele foi removido pelo TL-002, mas "o módulo continua aqui, com o mesmo
caminho, porque a atividade recente da lista é lida por ele". Ou seja: a remoção parcial que esta
branch propunha **já aconteceu**, e a remoção total que o arquivo dela faria é outra coisa.

**Veredito: obsoleto**, com uma ressalva registrada — falta conferir arquivo por arquivo quem
ainda importa o módulo na `main` antes de fechar a branch. **NÃO VERIFICADO** aqui.

### `claude/confident-bardeen-ndq0ch` (1 arquivo)

Apaga `src/hooks/integrations/__tests__/useTalkXSuppression.test.tsx`.

Apagar teste é território de "deixar verde sem corrigir", e a regra do dono proíbe. Este item
**não** é recuperado sem antes provar que o teste apagado cobria comportamento que deixou de
existir — e não apenas que ele passou a falhar. **Sem veredito.**

### `claude/feat-ui-visual-texto-longo-261101-1445` (6 arquivos)

Apaga 6 baselines de screenshot de `e2e/__screenshots__/contacts-*` (cards, list e table, em tema
claro e escuro).

Baseline de regressão visual: apagar baseline faz o teste parar de comparar, ou regerar na
próxima execução. Só faz sentido recuperar junto com a mudança de UI que a branch trazia, e a
pergunta que decide é se essa mudança entrou. **Sem veredito.**

### `claude/wizardly-ride-dimxnt` (3 arquivos)

Apaga `.github/workflows/vercel-env-cleanup.yml`, `scripts/ci/vercel-env-cleanup.mjs` e
`scripts/ci/vercel-env-cleanup.unit.mjs`.

**Item de "chame o dono" por regra**: workflow. Remover automação de limpeza de variável de
ambiente do Vercel é decisão de perímetro, não de código. Não entra sem decisão dele.

## Efeito no restante da medição

Nenhum. A segunda passada por `D` **acrescenta** uma coluna e um arquivo de saída; não altera a
classificação de nada que já estava no inventário. Remedido depois da correção: `CONTIDO` 208 e
o conjunto `NOVO`/`PARCIAL` idêntico, fora as duas linhas das próprias branches novas desta
sessão.

O `analise-prs/recuperacao-261116-branches.tsv` publicado nesta mesma PR tem as **seis** colunas
da medição anterior a esta correção; a sétima (`delecoes_pendentes`) e o arquivo nominal passam a
sair numa execução nova dos scripts, e o conteúdo dela para esta medição é o TSV de deleções ao
lado.

## Balanço da revisão da PR #3192

Cinco achados de método, cada um verificado individualmente antes de qualquer ação:

| Achado | Real? | Impacto medido |
|---|---|---|
| Corte de 8 caracteres descartava `true;` contra `false;` | sim | 1 par de 4.957 |
| Operador em linha própria (`+` contra `-`) descartado | sim | zero pares |
| Branch ancestral: trabalho removido da `main` ficava invisível | sim, em geral | 0 das 222 branches |
| `origin/HEAD` encurtando para `origin` | não reproduz neste clone | zero |
| **Deleção não contava como trabalho** | **sim** | **4 branches, 12 arquivos** |

O quinto é o único com impacto grande, e é o que este documento registra.
