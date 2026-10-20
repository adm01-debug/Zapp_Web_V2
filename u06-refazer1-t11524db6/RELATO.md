Especialista: worker (docs)

## O que mudou e por quê

- `docs/design/EMAIL_NAO_LIDO_ALERTAS.md` (único arquivo da entrega): 4 correções ponto a ponto da recusa do revisor, todas conferidas contra o código em `dia/2026-10-14` lido por `git show` (sem cherry-pick: o commit anterior 0434bc3d91 contém só este doc, e o reutilizei como base sem trazer histórico).
- Ponto 1: faixa `Sidebar.tsx:146-154` e ternário simples trocados pela cadeia real em `Sidebar.tsx:146-151` (`inbox ? inboxBadge : tasks ? tasksBadgeInfo.count : email-chat ? emailUnread.count : undefined`) + variante em `Sidebar.tsx:152-154` (só Tarefas sem atraso usa `warning`).
- Ponto 2: condição do selo do ícone passa a citar a checagem real de nulo `{badgeCount != null && badgeCount > 0 && (...)}` (`ContactActionButtons.tsx:97-105`); hook com `null` confirmado no `:137`; zeramento no `:139` (`contact.email ? unreadEmails : 0`); rótulo acessível com os dois ramos no `:140`. Na mesma frase: removida a afirmação falsa "mesmos tokens do selo da sidebar" (sidebar usa `bg-destructive`, §4 já dizia o certo) — contradição interna eliminada.
- Ponto 3: nenhum comando de teste no relato nem na entrega; a única prova executada é o verificador de caminhos e linhas que o cartão permite.
- Ponto 4: este relato descreve a entrega medida (patch + relato, modo congelado) sem alegar "arquivo único do diff".

## Prova

- Verificador de caminhos e linhas (permitido pelo cartão), rodado contra espelho dos 18 arquivos citados extraídos de `dia/2026-10-14`: `node .tmp/verifica-caminhos.mjs` → `OK: 17 caminhos citados (todos existem) e 17 referências de linha dentro do arquivo.`
- Checagem semântica (6 asserções linha-a-linha: 149/153 da Sidebar, 97/137/139/140 do ContactActionButtons) → `SEMANTICO: VERDE`.
- Vermelho antes: o documento recusado (commit 0434bc3d91) contém `Sidebar.tsx:146-154` (1 ocorrência), 0 ocorrência de `badgeCount != null` e 2 citações de `ContactActionButtons.tsx:139` (rótulo e zeramento trocados) — exatamente o que a recusa apontou.
- Varredura `grep` no documento final: 0 ocorrência do identificador de produção; nenhum segredo.

## Pontos do revisor

- Ponto 1: resolvido — cadeia real + faixas 146-151/152-154; prova: PASS `Sidebar.tsx:149` e `:153`.
- Ponto 2: resolvido — condição com nulo + `:137`/`:139`/`:140` nos papéis certos; prova: 4 PASS.
- Ponto 3: resolvido — zero comandos de teste executados ou citados como prova (só o verificador permitido).
- Ponto 4: resolvido — sem alegação de "arquivo único"; a seção NÃO CONCLUÍ abaixo lista a entrega medida.

## O que NÃO fiz e por quê

- Não commitei nem fechei: `hermes-tarefa-iniciar` responde CONGELADO (modo V1 suspenso) e a guarda bloqueia `git branch/clone` nesta sessão; não contornei. Sem skill de área docs no perfil semisenior (`skills_list` só tem area-sql/edge/hooks/auth/testes) — trabalhei com a recusa, o cartão e as skills de qualidade (refazer-sem-diff-alheio, relato-que-passa).
- Não toquei código, teste, guarda, manifesto ou CI: o cartão permite um único arquivo.
- Não rodei `zapp-verify --rapido` nem vitest: o cartão proíbe comandos de teste neste refazer (Ponto 3).

## Arquivos da entrega (medidos)

- `docs/design/EMAIL_NAO_LIDO_ALERTAS.md` (168 linhas, conteúdo final corrigido)
- `ENTREGA.patch` (patch que cria o arquivo acima a partir da raiz do projeto)
- `RELATO.md` (este arquivo)
- `.tmp/verifica-caminhos.mjs` (cópia do verificador usado na prova)

## NÃO CONCLUÍ: falta commitar e fechar (fábrica congelada)

- O trabalho pronto está em `~/hermes-workspaces/Zapp_Web_V2/u06-refazer1-t11524db6/` (+ `ENTREGA.patch` que aplica com `patch -p1 --dry-run` a partir da raiz do projeto).
- Para aplicar quando descongelar: criar o workspace do cartão a partir de `dia/2026-10-14`, aplicar o patch, rodar `node .tmp/verifica-caminhos.mjs` (esperado: `OK: 17 caminhos ... 17 referências ...`) e fechar.
- Título de fechar sugerido: `docs(email): refazer1 alertas e-mail nao lido com linhas fieis ao codigo`.
