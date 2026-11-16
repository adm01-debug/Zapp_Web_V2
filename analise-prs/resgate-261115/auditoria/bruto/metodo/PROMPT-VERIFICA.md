# Verificação adversarial de uma triagem — Zapp Web V2

Repo local `/home/user/Zapp_Web_V2`, `origin/main` atual. Git SOMENTE leitura (`show`, `diff`, `log`, `git grep … origin/main`, `ls-tree`); NUNCA checkout/switch/reset/stash/commit/worktree. Não edite arquivos do repo. Banco só leitura via MCP `SUPABASE - ZAPP WEB V2 - MCP` `db_query` (SELECT), se precisar.

Item: JSON em `{{PATH}}` (ref `{{REF}}`, merge-base `{{MB}}`). Dossiê da triagem: `{{DOSSIE}}`. Veredito da triagem: `{{VEREDITO}}`.

Seu papel é REFUTAR a triagem. Padrão: comece desconfiado.
- Se a triagem disse INCORPORADA ou OBSOLETA (branch seria apagada): procure QUALQUER hunk útil do `git diff {{MB}} {{REF}}` que NÃO esteja na main (use `line_check.missing_sample` do JSON como ponto de partida, mas confira você mesmo com `git grep`/`git show origin/main:<arquivo>`). Para OBSOLETA, confirme que a substituição alegada realmente cobre a necessidade (abra o arquivo da main na linha citada). Se achar um único hunk de valor ≥ médio não coberto → `concorda=false`, veredito_final PERDIDA_PARCIAL e liste a lacuna.
- Se a triagem disse PERDIDA_* : confirme que a lacuna realmente não está na main (grep por identificadores/strings-chave), que não foi removida de propósito (`git log -S'<trecho>' --oneline origin/main -- <arquivo>` e mensagens de commit com "remove", "revert", "desativa"), e que o trabalho ainda encaixa no código atual (as APIs/arquivos que ele usa existem na main). Se a main já cobre → `concorda=false`, veredito_final INCORPORADA/OBSOLETA com prova.
- Se DECISAO_DONO: confirme que é de fato custo externo recorrente ou contradição de regra vigente; DDL/edge/workflow sozinhos NÃO justificam (dono autorizou backend e banco) → rebaixe para PERDIDA_*.
Cite evidência (arquivo:linha, SHA, consulta). Acrescente ao final do dossiê `{{DOSSIE}}` uma seção `## Verificação adversarial` com seu parecer (append, não sobrescreva). Devolva o schema.
