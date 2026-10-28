# Levantamento D/E — Hermes / Zapp

Data da leitura: 2026-10-28T09:06:19-03:00. Escopo: somente `/home/joaquim_ataides/hermes-workspaces` e worktrees vinculados aos repositórios Zapp. Nenhum `fetch`, alteração de fonte ou GitHub.

`main` V2 local: `351ccb2a651f0394b5e78fd660695c09b4f799cf`; `origin/main` V2 local: `7cacbe2f39845ca600c2dd18a4d30f70f03c217e`. Este último é a melhor referência oficial disponível nesta leitura; pode mudar no servidor.

**Contagens:** 14 worktrees V2 no escopo e 2 worktrees V3 registrados como fora do escopo; 8265 arquivos soltos selecionados; 15866 diferenças de arquivo em worktrees V2 e 142 em V3 fora do escopo, com duplicação entre árvores; 13260 registros de commit `main..HEAD` V2 e 2 em V3 fora do escopo, também com duplicação.

## Critério de segurança e escopo

217 linhas de diferenças de worktrees e 2 linhas de arquivos soltos com caminho potencialmente sensível foram marcadas **DESCARTAR da integração** e tiveram hashes omitidos. A varredura conservadora inclui nomes de código e testes que mencionam token ou senha: bloqueio para revisão, sem afirmar que contenham valores secretos. Os 142 registros de arquivo V3 permanecem no índice só para evidenciar a exclusão do escopo V2. Os registros V2 antes marcados `INTEGRAR` foram reclassificados como **TERMINAR** ou **DESCARTAR** quando o caminho indica conteúdo sensível, isto é, verificar valor funcional antes de qualquer integração.

## Worktrees

| Local | Branch | Status | Commits main..HEAD | Arquivos diferentes de origin/main | Decisão |
|---|---|---:|---:|---:|---|
| `.integra/conflitos-banco` | `integra/conflitos-banco` | 0 | 1951 | 1667 | TERMINAR |
| `.integra/conflitos-inbox` | `integra/conflitos-inbox` | 0 | 1886 | 1636 | TERMINAR |
| `.integra/conflitos-integracoes-admin` | `integra/conflitos-integracoes-admin` | 0 | 1899 | 1636 | TERMINAR |
| `.integra/conflitos-plataforma-talkx` | `integra/conflitos-plataforma-talkx` | 0 | 1918 | 1580 | TERMINAR |
| `.integra/conflitos-resto` | `integra/conflitos-resto` | 0 | 1847 | 1773 | TERMINAR |
| `.integra/dia-menores` | `integra/dia-menores-20261016-1040` | 0 | 1839 | 1782 | TERMINAR |
| `.integra/f0-ci-needs` | `fix/ci-needs-orfao-lint-and-typecheck-20261018` | 0 | 1 | 957 | TERMINAR |
| `.integra/fase2` | `integra/fase2-conflitos-20261016` | 7 | 1849 | 1151 | TERMINAR |
| `.integra/laudo-mecanica` | `(detached)` | 0 | 12 | 605 | TERMINAR |
| `.integra/lote-main` | `fix/p2-search-events-doc-20261016` | 5 | 1 | 991 | TERMINAR |
| `Zapp_Web_V2/.base-tc` | `(detached)` | 0 | 12 | 605 | TERMINAR |
| `Zapp_Web_V3/matviews-exposicao-26092813349346` | `hermes/matviews-exposicao-26092813349346` | 0 | 1 | 70 | DESCARTAR (fora do escopo V2) |
| `Zapp_Web_V3/realtime-restore-2609281314f61c` | `hermes/realtime-restore-2609281314f61c` | 0 | 1 | 72 | DESCARTAR (fora do escopo V2) |
| `ga-audit-261020/main` | `main` | 0 | 0 | 0 | JÁ ESTÁ NA MAIN |
| `ga-fix/ci-contratos` | `claude/fix-ci-contratos-raiz-261020-1930` | 0 | 0 | 942 | JÁ ESTÁ NA MAIN |
| `ga-fix/consolidada` | `claude/ga-ci-verde-261020` | 0 | 45 | 541 | TERMINAR |

## Arquivos soltos

Tipos: {'outro': 340, 'documento': 3292, 'SQL/migration': 1, 'script': 2, 'configuração/metadado': 4626, 'código': 4}. Decisões propostas: {'JÁ ESTÁ NA MAIN': 8, 'TERMINAR': 89, 'DESCARTAR': 8168}. Lista integral com comparação por nome e hash: `DE-soltos.tsv`. Os diretórios operacionais compartilhados (`.decisoes`, `.v2-fila`, `.integra`) contêm muitos registros e worktrees repetidos; os arquivos de controle foram indexados, mas não tratados como código de produto. A amostra estruturada dos JSON de `.v2-fila` mostra campos `titulo`, `estado`, `branch`, `sha`, `workspace` e `integrado_em`; são históricos de cartões, não fontes. Nenhum dos cinco arquivos soltos de código/SQL tinha nome correspondente na `origin/main` V2 local; seus SHA-256 de origem constam do índice. Para outros nomes correspondentes, o índice registra o identificador de blob Git. Metadados de fila receberam decisão **DESCARTAR** apenas como material de produto, preservando seu valor de histórico operacional.

### Critério para os arquivos soltos

- **TERMINAR** significa revisar a pertinência ao V2, sem presumir implementação: briefs, planos, achados técnicos, referências visuais de Tarefas e instruções de handoff em `.assets/` e `.v2-handoff/`. Planos de paridade V3→V2 entram aqui porque documentam achados para o V2.
- **DESCARTAR da integração V2** significa manter a origem como histórico ou metadado, sem copiar para a aplicação: registros de `.decisoes/`, `.v2-fila/`, `.locks/`, `.tmp/`, `.tmp-d15d3a92/`, `_gates/`, logs e provas temporárias. Nenhum arquivo de origem foi apagado. Arquivos com nome potencialmente sensível continuam bloqueados conforme a regra acima.
- **DECISÃO DE NEGÓCIO** exige uma escolha nova e concreta do dono. Nenhum dos arquivos soltos examinados, apenas por ser documento, demonstrou essa necessidade; a contagem agora é zero. A decisão de usar um achado técnico cabe à revisão de produto e código, não é automaticamente uma decisão comercial.

| Diretório | TERMINAR | DESCARTAR | JÁ ESTÁ NA MAIN | DECISÃO DE NEGÓCIO |
|---|---:|---:|---:|---:|
| `.assets/` | 84 | 6 | 8 | 0 |
| `.decisoes/` | 0 | 3231 | 0 | 0 |
| `.locks/` | 0 | 4 | 0 | 0 |
| `.tmp/` | 0 | 9 | 0 | 0 |
| `.tmp-d15d3a92/` | 0 | 1 | 0 | 0 |
| `.v2-fila/` | 0 | 4915 | 0 | 0 |
| `.v2-handoff/` | 5 | 1 | 0 | 0 |
| `_gates/` | 0 | 1 | 0 | 0 |

Os títulos dos cartões JSON e os cabeçalhos das decisões Markdown foram lidos para mapear temas recorrentes (contagem de menções, com sobreposição): {'Tarefas': 646, 'Inbox': 447, 'Talk X': 419, 'Contatos': 231, 'Testes': 206, 'Filas': 148, 'Tags': 86, 'Dashboard': 86, 'WhatsApp': 74, 'Segurança': 72, 'CRM': 65, 'Paridade': 52, 'Evolution API': 51, 'Tempo real': 50, 'Deploy/CI': 41, 'Copiloto': 12}. Estados dos cartões: {'integrado': 1442, 'rejeitado': 1313, 'pronto': 923, 'vazio': 477, 'falhou': 286, 'conflito': 92, 'humano': 78, 'superado': 4}. Esses números descrevem registros históricos, não funcionalidades únicas.

## Funcionalidades e decisões relevantes

- **Dashboard em tempo real:** `.v2-handoff/t_8dc93a19` conserva três testes de regressão e instruções de aplicação; confrontar com `main` e concluir só o que estiver faltando. Decisão: **TERMINAR** se os testes ou a correção ainda não estiverem na main.
- **Evolution API:** `.v2-handoff/t-a4b7bae0-evolution-api-WIP.index.ts` é trabalho explicitamente incompleto. Decisão: **TERMINAR**.
- **Remoção de tags de contato/conversa:** `.assets/remover-tags/PLANO_REMOCAO_TAGS_2026-10-12.md` registra ordem do dono em 12/10 e separa tags removidas de rótulos de email, modelos e catálogo. Decisão: **TERMINAR** após conferir implementação atual.
- **Paridade V3→V2:** planos em `.assets/paridade-*` e `.assets/paridade-docs` cobrem Inbox, contatos, conexões, dashboard, componentes e hooks. Decisão: **TERMINAR** por funcionalidade após confronto com a main atual.
- **V3 banco/tempo real:** dois worktrees V3 têm commits para exposição de matviews e publicação realtime. Pertencem ao repositório Zapp Web V3, fora deste inventário V2. Decisão: **DESCARTAR da integração V2**; apenas registrar sua existência, sem pedir decisão de negócio e sem alterar os worktrees.

## Prioridade de triagem

1. Preservar e reconciliar as 12 alterações locais em `.integra/fase2` (7) e `.integra/lote-main` (5), antes de qualquer limpeza.
2. Verificar os testes de dashboard e o WIP de Evolution API em `.v2-handoff`.
3. Revisar os branches antigos `.integra` contra `origin/main` atual, porque grande parte das diferenças decorre de defasagem; comparar commits funcionais antes de propor PRs.
4. Manter os dois ramos V3 identificados como fora do escopo V2; nenhuma ação ou decisão de negócio solicitada nesta fase.

## Índices produzidos

- `DE-repos.md`: metadados Git, status e planejamento.
- `DE-arquivos.tsv`: todas as diferenças de árvore dos worktrees contra `origin/main` local.
- `DE-commits.tsv`: todos os commits `main..HEAD` por worktree, com coluna de escopo V2/V3.
- `DE-soltos.tsv`: arquivos soltos selecionados, categoria e comparação com `main` V2.

Nenhum valor de secret foi reproduzido. **NÃO copiar, colar, importar, commitar nem publicar valores** de `.env`, credenciais, tokens, keys, secrets, senhas ou chaves privadas. `DESCARTAR` significa excluir da integração V2, nunca apagar a origem. As decisões automáticas nos índices são propostas de triagem; `TERMINAR` significa verificar commits e função frente à main atual, pois diferença de blob isolada não demonstra valor.
