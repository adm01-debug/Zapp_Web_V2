## Descrição

O plano V3 do Talk X está **substituído pelo V4** (`TALK X 02`) desde 01/10/2026. Esta PR encerra o V3 como **registro histórico congelado** — só documentação, nenhuma migration, nenhuma RPC, nenhuma linha de `src/**`.

**O que muda no `docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`:**

1. **Banner do topo → `🧊 PLANO CONGELADO — 2026-10-02`**, com o motivo (dois executores escrevendo no mesmo banco na mesma janela — `save_talkx_campaign_draft` recriada 4× em 24 h) e a regra: o V3 passa a receber **apenas documentação**.
2. **Fase 2 com status explícito:** V21–V26 fechadas (6 de 10); **V27–V30 transferidas para o V4**.
3. **V22, V23, V24, V25 e V26 marcadas `✅ FEITO`** no formato que o próprio plano usa (o mesmo dos V12–V20), cada uma com **PR + squash** e a evidência objetiva: o que foi tocado, harness, e as **divergências medidas em relação ao plano**.
4. **Bloco de handoff `⏭️ V27–V30 · TRANSFERIDAS PARA O V4`** com o que cada etapa deixa para o V4 e o **contexto medido que evita retrabalho**.

## Tipo de Mudança

- [ ] 🐛 Bug fix (correção de bug)
- [ ] ✨ Nova feature (funcionalidade nova)
- [ ] 💥 Breaking change (mudança que quebra compatibilidade)
- [x] 📚 Documentação
- [ ] 🎨 Estilo/UI
- [ ] ♻️ Refatoração
- [ ] ⚡ Performance
- [ ] ✅ Testes
- [ ] 🔧 DevOps/CI
- [ ] 🔒 Segurança

## Plano

- Origem: coordenação de 02/10/2026 — o V4 é dono do Talk X; o V3 é congelado e a última tarefa deste chat é documentar V22–V26 como feitas (com PRs) e marcar o plano como congelado, deixando V27–V30 para o equivalente no V4.

### Etapas registradas (todas verificadas na API do GitHub antes de escrever)

| etapa | PR | squash |
|---|---|---|
| V22 · botões "Editar" respeitam a rota | [#1464](https://github.com/adm01-debug/Zapp_Web_V2/pull/1464) | `f4de03c226` |
| V23 · rascunho restaura tudo | [#1475](https://github.com/adm01-debug/Zapp_Web_V2/pull/1475) | `a5116ae317` |
| V24 · filtros de audiência reais | [#1498](https://github.com/adm01-debug/Zapp_Web_V2/pull/1498) | `201b74d956` |
| V25 · passo 1: responsável e validação | [#1508](https://github.com/adm01-debug/Zapp_Web_V2/pull/1508) | `cf697e2bda` |
| V26 · um editor de mensagem | [#1520](https://github.com/adm01-debug/Zapp_Web_V2/pull/1520) | `d6bff666b9` |
| (i) · `current_version_id` + backfill | [#1526](https://github.com/adm01-debug/Zapp_Web_V2/pull/1526) e [#1532](https://github.com/adm01-debug/Zapp_Web_V2/pull/1532) | `a1249ede92`, `aa7feb08b9` |

Todo o contexto medido que o V4 precisa está no bloco de handoff (guard de `talkx_templates`, `current_version_id` já backfillado, `ON DELETE SET NULL` que não dispara, truncamento de 4000 chars do applier, harness-modelo).

## Testes Realizados

- [x] **PRs conferidos um a um** via `gh pr view` (número, estado `MERGED`, `mergedAt`, `mergeCommit`) — nenhum número citado de memória
- [x] `git diff --stat`: **1 arquivo, +45/−1** — exatamente o plano V3, nada mais
- [x] Verificado que **V27–V30 continuam com o texto original** (4 seções intactas) e que as 14 marcações `✅ FEITO` preexistentes (V12–V20) não foram tocadas
- [x] **Sem migration no diff** desta PR; **sem alteração em `src/**`**

## Checklist

- [x] Código segue o padrão do projeto (AGENTS.md / CLAUDE.md lidos)
- [x] Self-review realizado no diff completo
- [x] Sem console.log ou debug code
- [x] Sem secrets/credenciais hardcoded
- [x] Documentação atualizada — é o objeto da PR
- [x] Hooks de pre-commit/pre-push passaram sem `--no-verify`

## Notas para Reviewer

- Esta PR **não executa nada**: não cria migration, não altera RPC do Talk X e não toca código de produção. É o encerramento formal do V3.
- As divergências registradas em cada etapa são as que eu medi em relação ao que o plano previa (ex.: `pipeline_stage`/`status`/`group`/`birthday` não existem em `public.contacts`; "Sheet de templates" é grid de cards; o campo Responsável não existia) — servem para o V4 não repetir a investigação.
- Fica uma pendência de **bookkeeping** já reportada ao Joaquim: o `hermes-tarefa-mergear` mantém um `PENDENTE_POS_MERGE` órfão apontando para a migration v2 arquivada em `_superseded/` (o `hermes-db-migrar` não conhece esse diretório). O DDL real **foi aplicado** (PR #1532) e está provado no banco.
