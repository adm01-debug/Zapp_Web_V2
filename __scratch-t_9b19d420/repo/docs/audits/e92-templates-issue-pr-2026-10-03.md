# E92 — templates de issue e de PR alinhados ao projeto real

**Data:** 03/10/2026 · **Etapa:** E92 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-38)

## O que a etapa pedia

Corrigir `.github/ISSUE_TEMPLATE/config.yml` (URL do repo, remover telefone placeholder) e o
`.github/PULL_REQUEST_TEMPLATE.md` (tirar "staging"; adicionar as perguntas de Migration e Edge).
Verificação: revisão.

## O link errado não dava 404 — era pior

O `config.yml` mandava a "📚 Documentação" para **`github.com/adm01-debug/zapp-web/tree/main/docs`**.
Medido: esse repositório **existe**, é **privado** e tem seu próprio `/docs` com **51 itens**, atualizado
em 18/08/2026. Não é link morto — é um **repo irmão antigo**, e quem clicasse cairia numa documentação
de outro projeto **sem nenhum sinal de que era o lugar errado**. Corrigido para o repo deste projeto.

O "💬 Suporte" abria `wa.me/5511999999999` — telefone **placeholder**, o clássico `9999-9999` que nunca
foi trocado. Bloco removido inteiro (a etapa pede remover o telefone; manter o link sem número não faz
sentido).

## "Testei no ambiente de staging" — não existe staging aqui

O checklist de PR pedia para marcar **"Testei no ambiente de staging"**. Este projeto não tem staging: o
deploy é Vercel (preview por PR) e o banco é o canônico de produção. A caixa fazia o autor marcar algo
que não corresponde a nada — pior que não existir, porque dá sensação de cobertura. A linha foi
removida; as vizinhas ("Testei localmente", "múltiplos navegadores", "dispositivos móveis") ficaram
como estavam, porque a elas corresponde um ambiente real.

## As duas perguntas que faltavam

Seção nova **"🗄️ Banco e Edge (se aplicável)"**, logo antes do checklist, com os dois passos que **só
existem depois do merge** — os que mais se perdem:

- **Migration?** → arquivo versionado em `supabase/migrations/` + registro no **ledger** + catálogo atualizado
- **Edge?** → **disparar `deploy-functions` após o merge** (a função **não** sobe sozinha)
- Nenhum dos dois

## Verificação

A etapa diz "revisão", mas revisão não sobrevive à próxima edição do template — e este arquivo é editado
com frequência. Os invariantes ficaram presos em **`scripts/ci/issue-templates.unit.mjs`** (5 casos), que
o `ci.yml` já roda pelo glob `node --test scripts/ci/*.unit.mjs`:

| Verificação | Resultado |
|---|---|
| `node --test scripts/ci/issue-templates.unit.mjs` | **5 passed, 0 failed** |
| Mutação (URL errada, telefone de volta, "staging" de volta, Migration removida, Edge removido) | **5 de 5 detectadas** |
| URL nova resolve (`contents/docs` em `main`) | **58 itens** |
| Branch default | `main` (o link bate) |
| `lint-ratchet` / `typecheck-ratchet` | 587/587 e 0/0 — **novas=0** |
| `check-test-inventory`, `actionlint` | OK |

## Limites

O teste prende o **conteúdo** dos templates (link certo, sem placeholder, sem staging, perguntas
presentes). Ele **não** valida que o `config.yml` é aceito pelo GitHub na interface de issues — isso só
se confirma abrindo uma issue nova no site, e o GitHub valida no carregamento. Sem gate possível aqui.
