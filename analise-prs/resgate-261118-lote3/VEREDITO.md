# Acervo `analise-prs/resgate-261118-lote3` — aposentado após triagem

**Data:** 2026-11-25 · **Base:** `main` @ 06a1cbe6 · **Arquivos removidos:** 1.029 (688 caminhos distintos)

## Método (identidade de blob, não de nome)

Cada arquivo do acervo teve seu blob comparado com a história completa da `main`
(`git rev-list --objects origin/main -- <caminhos>`) e com os blobs exclusivos de branch.
Nada foi julgado por nome, data ou mensagem de commit.

## Resultado

- 168 caminhos não existem mais com o mesmo nome na `main`:
  - 115 tiveram o conteúdo visto na história da `main` — existiram e foram removidos por decisão de produto;
  - 53 nunca passaram pela `main`; **em `src/`: 0**.
- 549 caminhos têm blob que existe apenas em branches. Dos 310 de `src/`, apenas 14 têm símbolo
  exportado ausente na `main` — todos alias de tipo (`*Return`, `*Props`) ou internos renomeados
  por refactor: `useTalkXSuppression` → `useTalkXSuppressionActivity` / `...Stats`; a
  acessibilidade do dialog segue coberta por `DialogDescription`.
- Nenhum `src/` do acervo representa funcionalidade ausente na `main`.

## Remoções deliberadas comprovadas (não são regressão)

- `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:63-64` —
  `DROP TABLE public.contact_purchases CASCADE` e `public.payment_links CASCADE`.
- Papel `special_agent` removido; campanhas migradas para TalkX; accordion substituído por
  `contact-details/sidebar/*`; `supabase-sync.yml` desarmado; redesign mobile aplicado.

## Como recuperar qualquer arquivo

O conteúdo não foi descartado: continua na história do git e no espelho privado
`adm01-debug/Zapp_Web_V2-backup`. `MANIFESTO.tsv` traz `caminho_no_acervo <TAB> blob_sha`;
recupere com `git log --all --find-object=<blob_sha>` ou `git cat-file -p <blob_sha>`.

## Verificação de dependências

Nenhum script, workflow, teste ou código de produção referencia este caminho; apenas artefatos
gerados em `docs/contexto/**`, que o workflow "Contexto para agentes de IA" regenera.
