# Levantamento C — worktrees do Zapp

Data: 2026-10-28T12:05:17+00:00. Escopo: apenas `/home/joaquim_ataides/zapp-worktrees`, excluída da varredura a árvore ativa `consolidacao-baseline-20261028`. O clone principal foi consultado somente como referência Git; `origin/main` foi atualizado com `git fetch origin main`, sem checkout nem alteração de arquivos. Nenhuma operação foi feita no GitHub.

## Contagem e referência

- Entradas diretas em C: **2 diretórios**; **1 worktree inventariado** (`preview`), **0 diretórios soltos** e **0 repositórios adicionais**. A outra entrada é a árvore ativa excluída.
- Referência: `origin/main` = `7cacbe2f39845ca600c2dd18a4d30f70f03c217e`; commit de 2026-10-28T11:52:03+00:00, “fix: risco de churn não conta dias negativos quando a data vem no futuro (#2290)”.
- `preview`: **6660 arquivos rastreados** em HEAD; **2525 caminhos diferentes** frente a `origin/main` (A=38, D=1210, M=1277); CI/script/configuração: 246; Edge Function: 131; SQL/migration: 288; código/teste: 1539; documentação/evidência: 300; outros: 21.
- Planejamento/estado/handoffs identificados em `preview`: **157** documentos (divergente 5, idêntico 152). Inventário individual em `C-planejamento.tsv`.

## Worktree `preview`

| Campo | Resultado |
| --- | --- |
| Caminho | `/home/joaquim_ataides/zapp-worktrees/preview` |
| Tipo | worktree ligado ao clone principal, atualmente com ponteiro `.git` quebrado |
| Branch | HEAD destacado (nenhuma branch local ativa) |
| Último commit | `45338438bab50b3ec24a575497a8e51b46317dec` — 2026-10-23 18:44:29 -03:00 — `fix(contatos): filtro de periodo nao transborda no dia 31 e teste do Sheet nao depende da data de hoje` |
| Branch remota | Não se aplica ao HEAD destacado; nenhuma referência remota contém esse SHA no clone atualizado para `origin/main` |
| Ancestral comum | `7a15852791828c50a9985a49659a9e13f15eaa86` |
| Divergência | 154 commits exclusivos de `origin/main`; 1548 commits em `origin/main..HEAD` |
| Decisão proposta | **TERMINAR** triagem de patches do HEAD contra a main atual, começando pela correção de datas; **DESCARTAR** as três alterações de trabalho regressivas, após preservação da evidência; não integrar a árvore inteira. |
| Prioridade | Alta para preservar e conferir a correção de datas; baixa para documentação histórica. |

O arquivo `preview/.git` aponta para `.git/worktrees/preview1`, que não existe. O registro no clone principal está em `.git/worktrees/preview` e aponta de volta para esse diretório. Para ler `status` e diff, foi usado explicitamente esse registro com `GIT_DIR`, `GIT_COMMON_DIR`, `GIT_WORK_TREE` e `GIT_OPTIONAL_LOCKS=0`; o vínculo não foi corrigido.

### `git status --porcelain=v1 --untracked-files=all`

```text
 M src/components/tasks/__tests__/WorkItemSheet.fuso.test.tsx
 M src/hooks/crm/__tests__/useContactsSearch.test.tsx
 M src/hooks/crm/useContactsSearch.ts
```

Não há arquivos não rastreados reportados. Os três arquivos acima são mudanças do working tree sobre HEAD. A alteração em `useContactsSearch.ts` volta a usar `setMonth` diretamente, que transborda no dia 31; o teste correspondente passa de `it` para `it.fails`. O teste do `WorkItemSheet` remove o relógio congelado, deixando data fixa de 20/10/2026 sujeita à data corrente. **DESCARTAR** essas modificações na futura limpeza, preservando registro; não as copiar para a main. A remoção de relógio congelado já está parcialmente refletida no teste da main, então a recomendação exige revisão antes de qualquer reaproveitamento.

### Commits e diferenças frente a `origin/main`

O comando solicitado foi interpretado contra a referência remota atualizada: `git log origin/main..HEAD --oneline`. São **1548 commits**, listados integralmente, com SHA, data e mensagem, em `C-commits.tsv`. Os 12 mais recentes:

- `45338438bab5` fix(contatos): filtro de periodo nao transborda no dia 31 e teste do Sheet nao depende da data de hoje
- `8ff4decf496b` chore(db): funde artefatos gerados com origin/main e destrava o adapter
- `d723a9010796` feat(contatos): busca por nome do contato ou da empresa na primeira letra (CT-011)
- `e7d156b8a74c` feat(db): outbox de eventos nao confirmados com assinatura HMAC (item 090 / SL-195c1)
- `630a628eda12` fix(talk-x): encaixa editor de templates no endereco
- `f5885801b111` fix(talk-x): refaz RPCs guardadas de ações em massa
- `15c8e26751d7` fix(db): fecha 3 achados P2 de funções definer e storage (SEC-STORAGE-02
- `d0ac481fc7c0` feat(telefonia): varredor close_stale_calls fecha chamadas presas em rin
- `a3e6d8d88239` fix(db): garante um unico padrao ativo em sla_configurations
- `f6b6f1e3ad6b` fix(gamificacao): remove mutacoes de escrita de XP/conquista do cliente
- `f350e73f672f` fix(db): supervisor nao le nem altera chaves secretas de global_settings
- `bbabe0658f1f` feat(banco): RPCs atomicas add_contact_tag/remove_contact_tag no contato

O diff de árvores contém **2525 caminhos**, listados integralmente em `C-diferencas.tsv`, com tipo de mudança, categoria e blobs Git dos dois lados. O `git diff --shortstat` padrão agrupa uma renomeação e mostra 2.524 arquivos; o TSV usa `--no-renames` e separa seus dois caminhos, por isso soma 2.525. O resumo padrão é **25.231 inserções e 243.582 remoções**; a comparação bruta inclui grande volume de documentação, migrações e testes ausentes nesta árvore antiga. Esses números não medem trabalho ainda aproveitável: commits podem ter entrado na main por squash ou por implementação paralela. Não há base para fazer merge ou cherry-pick em lote.

**Diferença funcional de maior interesse:** o commit mais recente corrige o recuo de mês/trimestre/ano no filtro de Contatos ao cair no dia 31 e traz teste para 31/03 → 28/02. O HEAD tem a correção; `origin/main` ainda usa `setMonth` direto e o teste do caso está marcado `it.fails`. **INTEGRAR** essa correção em PR pequeno, a partir da main atual e após teste; considerar o teste de fuso de Tarefas separadamente, porque a main já tem outra solução de relógio congelado. As alterações não commitadas de `preview` desfazem essa correção e não devem ser usadas.

**Outras áreas com diferenças:** SQL/migrations, Edge Functions, UI e testes de Contatos, TalkX, Inbox, Telefonia e Tarefas, mais CI e documentação. Cada uma precisa de conferência por funcionalidade na Fase 2; o diff completo é um índice de candidatos, não uma decisão de integração. Mudanças puramente documentais antigas sem diferença útil devem ser classificadas como **JÁ ESTÁ NA MAIN** ou **DESCARTAR** na triagem por item, com prova de equivalência ou obsolescência.

## Planejamento e intenção

O TSV `C-planejamento.tsv` registra todos os 157 documentos localizados por nome/caminho relacionado a plano, pendência, estado, feature ou handoff, com título, seções iniciais, abertura/objetivo extraído e comparação exata do blob com `origin/main`. `Idêntico` significa mesmo conteúdo no mesmo caminho; `divergente` e `ausente` exigem leitura funcional antes de decidir. O filtro de nomes não equivale a uma auditoria semântica de todo o acervo de Markdown.

Planos encontrados abrangem Contatos (busca, redesign e jornada), Inbox, Tarefas/Quadro, TalkX, Multiplix, Telefonia, Arquivos, IA, Catálogo, Team Chat, tipografia/design e segurança. Os documentos `ESTADO.md`, `FEATURE_REGISTRY.md` e `HANDOFF_MISSION_10-10.md` registram estados e oportunidades antigas. Há planos que se declaram concluídos; isso é intenção documentada, não prova de funcionamento na main. Proposta: **TERMINAR** a verificação das etapas ainda abertas por funcionalidade, confrontando com a main e seus testes; **JÁ ESTÁ NA MAIN** para documentos idênticos; **DESCARTAR** versões históricas comprovadamente substituídas. `C-planejamento.tsv` permite encaminhar cada documento sem perder seu caminho.

## Triagem item a item e limites das propostas

As três planilhas agora trazem `existe na main?`, `diff relevante?`, `funcionalidade relacionada`, `decisão proposta` e `prioridade`, além de **revisão necessária?** e **fundamento da proposta**. Os rótulos de decisão usam exclusivamente os cinco valores do objetivo. Não são autorização de execução. A comparação de arquivos usa caminho e identidade do blob Git; a de commits usa caminhos tocados e `git cherry` (equivalência exata de patch). Nenhum hash diferente prova que uma função esteja ausente ou seja melhor que a versão da main. Só o diff da correção de datas foi examinado para recomendar integração.

| Índice | Itens | INTEGRAR | JÁ ESTÁ NA MAIN | TERMINAR | DESCARTAR | DECISÃO DE NEGÓCIO | Revisão marcada |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `C-diferencas.tsv` | 2.525 | 2 | 1.211 | 1.309 | 3 | 0 | 1.314 |
| `C-planejamento.tsv` | 157 | 0 | 152 | 5 | 0 | 0 | 5 |
| `C-commits.tsv` | 1.548 | 1 | 0 | 1.542 | 5 | 0 | 1.548 |

**Leitura dos rótulos:** `JÁ ESTÁ NA MAIN` é conclusivo apenas para os 152 documentos com blob idêntico e para o arquivo cujo blob exato aparece na main; nos 1.210 caminhos `D`, significa que o arquivo existe somente na main, portanto não há peça daquele caminho a resgatar de `preview`. `INTEGRAR` aparece só nos dois arquivos da correção de Contatos cujo diff foi lido e no commit que os contém, sempre condicionado a teste e revisão; isso não significa três integrações distintas. `TERMINAR` com **revisão necessária? = sim** significa concluir a verificação técnica de diferença, equivalência funcional e testes; não afirma que a funcionalidade esteja inacabada. Nos documentos, significa reconciliar o registro. Nenhuma linha foi classificada como `DECISÃO DE NEGÓCIO`, pois não foi encontrada uma escolha real do dono nos dados examinados. `DESCARTAR` para evidências históricas ainda exige conferência antes de arquivar. `.env.production` foi marcado **DESCARTAR da integração**, com prioridade alta para tratamento seguro: seus valores não foram lidos nem devem ser copiados para código, relatório ou PR.

Nos commits, `git cherry` marcou 1.547 patches sem equivalência exata e não avaliou 1 merge. Isso **não** demonstra 1.547 funcionalidades faltantes: squash, refatoração e implementações paralelas podem produzir o mesmo resultado com patches diferentes. Todos os commits seguem marcados para revisão, inclusive os cinco propostos para descarte. Os 1.420 commits anteriormente rotulados como decisão de negócio por incerteza técnica passaram a `TERMINAR (verificar)`; a mesma correção foi feita em 1.279 diferenças, com `.env.production` separado como `DESCARTAR`. Uma decisão final por funcionalidade exige ler os diffs, conferir dependências e testes e cruzar com a `main` atual. Os TSVs são uma fila de triagem fundamentada, não um plano de cherry-pick em lote.

## Próximo uso deste levantamento

1. Conferir primeiro a correção de datas de Contatos no HEAD contra a main atual e extrair só esse patch útil.
2. Cruzá-la com os planos de Contatos e com o inventário dos outros locais antes de abrir PR.
3. Tratar o vínculo Git quebrado e as três alterações regressivas apenas na fase de limpeza, preservando evidência e sem apagar arquivos nesta fase.
4. Usar os TSVs para triagem individual dos 1548 commits, 2525 caminhos e 157 documentos; nenhuma conclusão de merge foi inferida só da diferença de SHA.
