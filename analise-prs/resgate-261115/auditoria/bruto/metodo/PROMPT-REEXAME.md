# Reexame: trabalho que um commit POSTERIOR da própria branch removeu — Zapp Web V2

Repo `/home/user/Zapp_Web_V2`, `origin/main` = estado atual. Git SOMENTE leitura (`show`, `diff`, `log`, `git grep … origin/main`, `ls-tree`, `rev-list`); NUNCA checkout/switch/reset/stash/commit/worktree. Não edite arquivos do repo. Banco: só SELECT, pelo MCP `SUPABASE - ZAPP WEB V2 - MCP` (`db_query`), se precisar.

## Por que você existe
A triagem deste item concluiu `{{VEREDITO}}` (apagar a branch). Mas uma varredura mecânica achou linhas que **um commit intermediário da branch adicionou** e **um commit posterior da mesma branch removeu**, e que **não estão na main**. O diff `merge-base..ponta` não mostra isso.

Há dois casos, e eles têm consequências opostas:
- **REFATORACAO_INTERNA** — a branch mudou de ideia: renomeou, reescreveu, trocou comentário, substituiu a implementação por outra equivalente que **está** na ponta e/ou na main. Nada se perde. Apagar continua seguro.
- **REVERSAO_DE_TRABALHO_REAL** — um commit posterior **desfez** proteção/correção/funcionalidade que os anteriores tinham entregue, e isso **não** está na main. Caso real já visto neste repo: na PR #2879 o último commit, intitulado "fecha SQL injection", foi exatamente quem **removeu** a validação que dois commits anteriores haviam adicionado. Quem olha só a ponta não vê. Nesse caso o trabalho a recuperar é o do **commit intermediário**, não o da ponta.

## Entrada
- Item: `{{ID}}` · ref `{{REF}}` · merge-base `{{MB}}` · veredito da triagem: `{{VEREDITO}}`
- Dossiê da triagem: `{{DOSSIE}}` (leia)
- Achados mecânicos (commit, arquivo, nº de linhas, amostra): `{{ACHADOS}}`

## O que fazer
1. `git log --oneline --no-merges {{MB}}..{{REF}}` — leia os assuntos. Commit cujo título promete segurança/correção mas que **remove** linhas é o sinal de alerta.
2. Para cada achado: `git show <commit> -- <arquivo>` (o que foi adicionado) e depois `git log --oneline {{MB}}..{{REF}} -- <arquivo>` para achar quem removeu; `git show <removedor> -- <arquivo>`.
3. Decida se a intenção daquelas linhas sobrevive: na ponta da branch, ou na main (`git show origin/main:<arquivo>`, `git grep -n '<identificador>' origin/main`). Comentário, nome de variável, formatação e implementação equivalente = REFATORACAO_INTERNA. Validação/guarda/teste/estado que não existe em lugar nenhum = REVERSAO_DE_TRABALHO_REAL.
4. Se for reversão, descreva o que recuperar citando o commit e o arquivo, e dê o valor para o negócio (alto/medio/baixo).
5. Acrescente ao dossiê `{{DOSSIE}}` uma seção `## Reexame de commits intermediários` (append, não sobrescreva) com o parecer e as evidências.

Responda em PT-BR pelo schema. Padrão: só diga REFATORACAO_INTERNA quando tiver olhado o removedor e confirmado que a intenção sobrevive.
