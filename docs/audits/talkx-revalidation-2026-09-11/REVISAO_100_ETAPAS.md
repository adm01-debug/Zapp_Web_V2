# Revalidação integral — recuperação Campanhas / TalkX

> **STATUS: HISTÓRICO/RESOLVIDO EM PARTE (baseline de 11/09/2026).** Esta revalidação examinou `5363f4a9` com alterações locais. Os bloqueadores B01–B07 foram tratados no pacote integrado pelas PRs [#368](https://github.com/adm01-debug/Zapp_Web_V2/pull/368), [#369](https://github.com/adm01-debug/Zapp_Web_V2/pull/369) e [#371](https://github.com/adm01-debug/Zapp_Web_V2/pull/371), com migrations promovidas e artefatos sincronizados em `cb6862e9`. Permanecem pendentes as capacidades visuais e funcionais explicitadas no [estado atual do plano](../../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md#estado-de-execução-em-12092026). O snapshot JSON é evidência do baseline, não certificação atual.

Data: 11/09/2026. Estado examinado: HEAD local `5363f4a95fb0a2f1ccff942126ce5fe844e271d4` **mais alterações de fuso ainda não commitadas**, e main remota `33d02292c59b4f1b47c54b03c24bea99caf8af6e`.

## 1. Veredito

**Não implementamos nem validamos integralmente o plano. A versão local atual não está pronta para publicar.**

| Situação das etapas | Quantidade |
|---|---:|
| Integralmente verificadas conforme o aceite do plano | 0 |
| Parcialmente implementadas | 62 |
| Não implementadas no escopo TalkX procurado | 13 |
| Reabertas por defeitos/regressões | 5 |
| Aceite/gate sem comprovação suficiente | 20 |
| Total revisado | 100 |

“0 integralmente verificadas” **não significa que nada funciona ou que o progresso é 0%**. A unidade aqui é o requisito completo da etapa — código, contrato, integração, teste e aceite aplicável. Testes de uma primitiva SQL não encerram uma etapa de operação completa. Não converter esta contagem em nota “10/10” nem em porcentagem de esforço restante.

O plano avaliado é [PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md](../../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md). A numeração de documentos antigos E01–E100 não é automaticamente equivalente à numeração desta recuperação. A auditoria cobre as 100 etapas e as 17 referências de Campanhas; não certifica todos os outros módulos do ZAPP.

Foram reproduzidos **15 cenários de defeito**, com código real executado em dependências simuladas e PostgreSQL 17 descartável. Há também riscos estáticos e lacunas de aceite, identificados separadamente. Não houve envio real de campanha, alteração no Supabase canônico, push, merge ou deploy nesta rodada.

## 2. Local, GitHub, frontend público e banco não são a mesma evidência

| Camada | Evidência obtida nesta rodada | Conclusão |
|---|---|---|
| Branch local | `feat/talkx-recovery-foundations`, HEAD `5363f4a9` | Contém correções que não estão na main |
| Worktree | 7 arquivos rastreados modificados + migration de fuso e contrato novos não rastreados | HEAD sozinho não descreve a versão testada |
| Branch homônima no GitHub | `5aeb75ca66b68fe367e84e01bd65d96e501c0e3a`, via ls-remote | Commit `5363f4a9` ainda não está nesse ramo remoto |
| main após fetch | `33d02292`; 9 commits exclusivos locais / 2 exclusivos da main | Há divergência real, não apenas “falta push” |
| PR da branch local | `gh pr list --head ... --state all` devolveu lista vazia | Não foi localizada PR para integrar esta branch |
| Frontend público | GET /version.json: buildId `33d02292...` | Frontend corresponde à main, não à recuperação local |
| Edge Functions publicadas | Nenhum hash/runtime autenticado novo coletado | BuildId do frontend não prova código da Edge |
| Supabase canônico `tnnnlkbymytvtqngbbqh` | db:guard informou DESTINO_URL ausente; catálogo local apenas | Ledger, SQL aplicado, ACL efetiva e runtime **não verificados nesta rodada** |
| Banco usado nos testes | Containers PostgreSQL 17 isolados, fixtures sintéticas | Prova de comportamento local das migrations, não da produção |

Não foi usada uma conexão MCP de outro projeto como substituta do banco canônico. A limitação histórica de migrations sem SQL/hash no ledger continua válida: não fabricar prova retrospectiva nem inferir função runtime apenas pelo nome da migration.

A main recebeu [PR #364](https://github.com/adm01-debug/Zapp_Web_V2/pull/364), commit `a1622b6c`, com E83/E87. Ela adiciona janela mid-loop e external_id/ACK; portanto seria incorreto repetir que essa correlação não existe em lugar nenhum. **Existe na main, está ausente nesta branch e ainda tem defeitos.**

Simulação `git merge-tree --write-tree --messages HEAD origin/main`: exit 1, conflito em `supabase/functions/talkx-send/index.ts`. O comando gerou apenas objetos de diagnóstico; não alterou branch/index/worktree.

União dos nomes de migrations das duas versões detectou:

- Local: `20260911120000_replace_talkx_draft_recipients.sql`.
- main: `20260911120000_talkx_e87_external_id_delivered.sql`.

Ambas usam **20260911120000** para SQL diferente. O guard local passa porque só enxerga um desses arquivos. O plano de integração precisa tratar a colisão **antes** do deploy e consultar o ledger real antes de decidir qualquer renumeração. Não substituir arquivo aplicado, não inserir ledger manualmente e não criar placeholder para esconder drift.

## 3. O que realmente melhorou desde a revisão anterior

O commit local `5363f4a9` corrigiu partes importantes. A nova revisão não conserva automaticamente todos os vereditos antigos:

| Correção | Prova atual | Limite do resultado |
|---|---|---|
| Cópia com id vazio deixa de recriar rascunho a cada save | Testes do useCampaignEditor passam | Falta idempotência persistida/revisão entre sessões |
| Autosave inclui filtros e suas reversões | Testes do hook passam | Não prova recuperação após reload/perda de resposta |
| Salvar antes de hidratar audiência é bloqueado | Testes do hook passam | Não resolve seleção integral/paginação ou job final |
| Template somente texto limpa mídia anterior | Teste do hook passa | Não completa uploader nem contrato de áudio |
| Regra desconhecida de segmento falha fechada | Teste do compilador passa | Não valida todo AST/tipo/operação nem semântica entre grupos |
| Launch valida passos/confirmações; callbacks respeitam status | Testes de hook/UI e contratos passam | mode=schedule ainda não valida o mesmo conjunto |
| POST ambíguo não é repetido automaticamente na mesma invocação | Código, contratos e harness de leases passam | Banco fora do ar também impede registrar quarentena |
| outcome_unknown separado de falha/completude | Migration/contratos/SQL locais passam | Não há reconciliação operacional ponta a ponta |
| Conclusão condicionada à fila drenada | Harness de leases e contratos passam | Worker pode abortar e deixar fila sem continuação |
| Percentuais sintéticos do funil removidos | Contrato de analytics passa | Fontes de receita, conversão, clique e ranking correto faltam |
| INSERT/DELETE protegidos no commit 5363 | Histórico do código confirma correção | **Regrediu na migration de fuso não commitada** |

As etapas correspondentes saíram de “reaberta” para “parcial” quando a falha específica foi corrigida. Isso reconhece o trabalho sem declarar concluído o contrato inteiro.

## 4. Bloqueadores e falhas reproduzidas

### B01 — Migration de fuso regride criação e exclusão de campanhas — prioridade alta

Fonte: [migration 20260911200000](../../../supabase/migrations/20260911200000_persist_talkx_schedule_timezone.sql), função enforce_talkx_campaign_mutability, a partir da linha 61.

O trigger cobre INSERT/UPDATE/DELETE. A nova substituição trata tudo como UPDATE: compara NEW com OLD, remove os ramos TG_OP anteriores e retorna NEW até em DELETE.

Provas R10–R12, no PostgreSQL 17:

- INSERT legítimo de draft pelo proprietário → `talkx_campaign_owner_immutable`.
- DELETE legítimo de draft pelo proprietário → o mesmo erro.
- DELETE por service_role → comando termina sem erro, mas a linha permanece; RETURN NEW em DELETE retorna NULL e suprime a operação.

O harness existente sai 1 com “insert autenticado fabricou estado de entrega”. **Essa mensagem é imprecisa:** ele esperava um erro específico e recebeu outro. Não foi demonstrado que o INSERT malicioso passou. Os probes positivos demonstram o defeito real: operações legítimas quebradas.

Correção necessária: preservar integralmente os ramos INSERT/UPDATE/DELETE da versão anterior e acrescentar timezone/futuro apenas nos ramos corretos. Testar create/update/delete positivos, estados proibidos, contadores, owner, cascata, service e compatibilidade com todas as migrations posteriores. Antes de aplicar, inspecionar janelas legadas que violariam o novo CHECK.

### B02 — Worker interrompe no 20º envio — prioridade alta

Fonte: [talkx-send](../../../supabase/functions/talkx-send/index.ts), declaração const de campaign na linha 232 e atribuição na linha 486.

R01 executou o handler real transpilado, com 21 destinatários e provider/banco simulados: 20 POSTs, 20 conclusões individuais, resposta HTTP 500 por `Assignment to constant variable`, destinatário 21 não processado e RPC de finalização não chamada.

`deno check` confirmou TS2588. Também encontrou TS2322 no retorno de weekday em localClockInTimezone, linha 64. O segundo erro pertence à mudança local de fuso; a reatribuição const também existe na main.

Correção necessária: contexto atualizável tipado sem perder snapshot/configuração; teste de fronteira 19/20/21/40 destinatários. **Mudar const para let sozinho não resolve** durabilidade, janela por envio, supressão nem recuperação da fila.

### B03 — Supressão e janela não são revalidadas por envio — prioridade alta

Fontes: talkx-send linhas 250, 278–282, 329–330 e 387–391.

- R02: blacklist phone-only `+55 (11) 99999-0000` não bloqueia destino `5511999990000`. O caso pressupõe linha legada/importada sem normalização; não afirma que toda inserção da UI produza esse formato.
- R03: opt-out entra após o primeiro POST; o segundo destinatário ainda recebe porque blacklist é carregada uma única vez.
- R04: janela encerra durante typing delay; o POST acontece fora da janela, pois a última consulta só verifica status.

E83 da main testa a janela após 20 processados, com timezone fixo, e esse ramo passa antes pela reatribuição const inválida. Não representa revalidação imediata e não recupera automaticamente uma campanha auto-pausada.

Correção necessária: predicado canônico normalizado, consulta de elegibilidade imediatamente antes do dispatch, controle de janela com fuso persistido e nova checagem depois das esperas. Separar pausa manual, bloqueio de janela e interrupção recuperável.

### B04 — Resultado externo ainda não tem durabilidade integral — prioridade alta

R05: HTTP 200 com JSON `{}` vira status sent sem identidade de ACK do provider.
R06: provider respondeu, conclusão no banco falhou e quarentena também falhou → HTTP 500; nenhuma prova durável do efeito externo.

A RPC de claim aceita recuperar um sending cujo lease expirou. Portanto a combinação “POST realizado + banco indisponível para gravar resultado” ainda cria risco de segundo envio após recuperação. O teste comprova a falha de gravação; o risco de duplicação é inferência do predicado de reclaim, não um envio real duplicado nesta auditoria.

Além disso, a migration de leases converte sending legado sem token para pending. O comentário “é seguro” não comprova que o provedor não tenha aceitado o envio anterior. Legados ambíguos precisam de quarentena/reconciliação, não replay presumido.

Correção necessária: tentativa/dispatch intent durável, identidade imutável, capacidades reais de idempotência do provider, distinção entre claim sem POST e efeito possivelmente emitido, reconciliação operável e política de ack tardio. Não prometer exactly-once sem contrato do provedor.

### B05 — Mudança concorrente E87 não é idempotente ponta a ponta — prioridade alta

Fonte remota fixada: [evolution-webhook-msg-handlers.ts na main auditada](https://github.com/adm01-debug/Zapp_Web_V2/blob/33d02292c59b4f1b47c54b03c24bea99caf8af6e/supabase/functions/_shared/evolution-webhook-msg-handlers.ts).

Probes executam a função real dessa revisão com dependências simuladas:

- R13: dois ACKs simultâneos leem delivered_at=NULL e ambos incrementam delivered_count. Resultado: 2 para um destinatário.
- R14: update de destinatário funciona, RPC de incremento falha; erro é ignorado, reentrega do evento não repara pois delivered_at já está preenchido.
- R15: o novo if/else desloca o ramo de stub; READ de mensagem recebida já existente entra em upsert de mensagem ausente. Foi comprovada a chamada indevida; a consequência final depende das constraints reais de messages.
- Consulta TalkX usa external_id sem escopo da conexão; risco de colisão não resolvido por um índice não único.

Incremento atômico do contador evita lost update do número; **não torna atômica a decisão de contar uma entrega uma única vez**.

Correção necessária: transação/RPC única de dedup + atualização monotônica do recipient + agregado; escopo de conexão/provedor/tentativa; tratamento de ACK fora de ordem e falha; restaurar o encadeamento original dos ramos de mensagens e acrescentar regressão do inbox.

A migration E87 cria SECURITY DEFINER sem search_path fixado e só faz GRANT a service_role, sem REVOKE explícito de PUBLIC/anon/authenticated nem verificação de caller. É risco de ACL **a verificar no catálogo do banco**: permissões default podem variar e não foram lidas nesta rodada. Não afirmar exploração em produção a partir do arquivo.

### B06 — Agendamento parcial e defeitos de timezone — prioridade alta para publicar

R09 confirma que `2026-03-08T03:30 America/New_York` é válido (07:30Z), mas localToUTCInTimezone o rejeita como inexistente. O algoritmo calcula offset numa aproximação UTC única e não resolve a transição corretamente. Testar apenas 02:30 inexistente deixou esse erro passar.

Outros achados de código:

- persistSave valida todos os canProceed só em launch, não em schedule.
- validade temporal fica em useMemo sem relógio/evento de expiração; Date.now durante render também reprova lint.
- callback usa scheduleTimezone sem dependência, sinalizado no lint.
- mínimo do input agendado usa UTC sem conversão ao fuso selecionado.
- rail do wizard ainda formata datetime-local pelo timezone do navegador.
- timezone no payload depende de migration ainda não aplicada/verificada; a compatibilidade frontend antigo/novo precisa ensaio.

Correção necessária: conversor com política explícita para horas ambíguas/inexistentes, casos de DST válidos e inválidos, timezone do navegador diferente do selecionado, validação no momento do comando e no servidor, mesma validação para schedule/launch.

### B07 — Autorização do scheduler e teste de mídia — reprodução limitada ao handler

- R07: handler talkx-scheduler sem Authorization executa busca/dispatch usando service_role. O probe **não passa pelo gateway Supabase**. O config local não desativa JWT especificamente para ele; não é prova de endpoint anônimo aberto. JWT válido no gateway não substitui autorização de serviço/cron no handler.
- R08: action=test com mediaType=audio chama sendText e retorna success=true. Testar template de áudio assim não testa entrega de áudio.

Correção necessária: autorização server-to-server explícita, método aceito e negativos no handler; teste de cada tipo de mídia pelo mesmo contrato do envio real, destino controlado e sem respostas brutas sensíveis do provedor.

## 5. Gaps funcionais/visuais ainda existentes

1. **Entrada por URL:** a rota fornecida pelo usuário não restaura a tela inteira. TalkXView inicializa tabs/overview; parse de step só ocorre depois de montar o editor. Falta identidade/restauração/voltar/avançar.
2. **Autoria:** creators usa c.name para o ID do criador. createCampaign consulta profiles.select(id).single() sem filtrar user_id; com mais de um perfil visível isso pode falhar. Este segundo caso é achado estático dependente de RLS, não teste no banco real.
3. **Tela Nova campanha:** mensagem fica exclusivamente no passo 2; modelo exige sua presença no passo 1. Responsável, filtros completos, fonte CRM e uploader seguro não estão concluídos. Trocar só cor/borda não fecha a composição.
4. **Segmentação:** grupos externos sempre OR; os botões podem sugerir outra semântica. AST não tem versão. Allowlist de campos não equivale a validação runtime de todos os operadores/valores. RFM/compras/ticket do modelo não têm fonte conectada.
5. **Cardinalidade:** count exato e resolveAudience(limit=5000) não garantem o mesmo conjunto. Outras consultas não paginam. Monitor/report limitam 2000; analytics usa também limites 5000. Paginação visual de array já truncado não resolve.
6. **Supressão:** UI principal não usa useTalkXSuppression; campos e funcionalidades do hook não provam que estejam ligados à tela. UI não oferece phone-only/histórico/expiração prometidos; import só encontra contatos existentes; export usa contacts.phone, sem fallback phone; Opt-outs 30 dias não filtra 30 dias nem todo origin usado por automação.
7. **Métricas:** resposta é heurística de contato/24h; heatmap/resposta consultam apenas sent e passam a excluir recipients que E87 muda para delivered. Uso de template ainda é rotulado Mais convertidos. Receita/cliques/conversão não foram entregues.
8. **Operação:** aba Mensagens em running ainda é TabComingSoon; editar limites chama update em estado que trigger proíbe. Pausada reutiliza running; concluída abre monitor em vez do relatório completo.
9. **Importação CRM e ajuda:** não localizados workspace de importação/vinculação/conflitos/retomada nem central de ajuda/busca/guias/suporte equivalentes aos modelos. Atalho Importar contatos emite import sem handler no pai.
10. **A/B:** variant_id é persistido, mas conteúdo vem de variante mutável; falha ao recuperar variante faz fallback. Isso não implementa atribuição imutável de experimento por tentativa.
11. **Documentação inflada:** PARIDADE.md marca como concluídos recursos ausentes na UI atual e chama ranking de usos de conversão. Corrigir documentos exige prova do caminho do usuário, não apenas encontrar um hook ou coluna.
12. **Aceite visual:** os 17 PNGs são íntegros (hash/dimensões/bytes), mas não houve sessão autenticada com screenshots comparativas nesta rodada. Não foi calculada “porcentagem de semelhança” nem aprovado layout por inferência do JSX.

## 6. Índice das evidências

| ID | Fontes primárias examinadas |
|---|---|
| E01 | Plano de recuperação, diagnóstico, revisão anterior, PARIDADE/CHANGELOG antigos — promessas, não prova runtime |
| E02 | git fetch/rev-parse/rev-list/ls-remote; gh pr list; merge-tree; GET público /version.json |
| E03 | [useCampaignEditor.ts](../../../src/components/talkx/useCampaignEditor.ts), especialmente 46–89, 162–220, 343–451 |
| E04 | [TalkXView.tsx](../../../src/components/talkx/TalkXView.tsx), [TalkXCampaignWizard.tsx](../../../src/components/talkx/TalkXCampaignWizard.tsx), TalkXWizardDelivery, Overview, ContactSelector |
| E05 | [useTalkXSegments.ts](../../../src/hooks/integrations/useTalkXSegments.ts), TalkXSegments e respectivos testes |
| E06 | [talkx-send/index.ts](../../../supabase/functions/talkx-send/index.ts), talkx-scheduler/index.ts, [useTalkX.ts](../../../src/hooks/integrations/useTalkX.ts) |
| E07 | Migrations locais 20260911120000 até 20260911200000, harnesses de draft/leases/transições/estado; nenhuma aplicada em produção aqui |
| E08 | [TalkXAnalytics.tsx](../../../src/components/talkx/TalkXAnalytics.tsx), linhas 45–124 e funil; contrato analytics |
| E09 | TalkXCampaignScheduled, TalkXCampaignRunning, TalkXLiveMonitor, useTalkXMonitor |
| E10 | TalkXTemplates, TalkXTemplateEditor, useTalkXTemplates, migrations de histórico/variantes |
| E11 | [TalkXSuppression.tsx](../../../src/components/talkx/TalkXSuppression.tsx), useTalkXSuppression, migrations blacklist |
| E12 | [talkx-report/index.ts](../../../supabase/functions/talkx-report/index.ts), talkxExport e testes |
| E13 | Resultados desta rodada, .github/workflows/ci.yml/db-guard.yml, configs Vitest/TypeScript, 3 novos probes |
| E14 | 17 PNGs/manifesto local; inventário de arquivos/rotas/testes. Sem screenshot autenticada nova |
| E15 | Diff main 9c99b164→33d02292, E83/E87, migration external_id e handler de ACK, fixados por SHA |

Hashes dos 39 arquivos do snapshot e dos logs temporários: [evidence-snapshot.json](evidence-snapshot.json). Eles delimitam a versão auditada; não certificam execução em produção. Linhas podem mudar em edições posteriores.

## 7. Matriz das 100 etapas

PARCIAL = existe implementação, mas faltam requisitos. REABERTA = implementação/correção sofreu falha relevante reproduzida ou confirmada. NÃO IMPLEMENTADA = capacidade requerida não localizada no fluxo TalkX auditado; não afirma ausência em qualquer outro módulo. ACEITE NÃO COMPROVADO = gate/aceite requer prova não obtida ou está reprovado.

| Etapa | Requisito do plano | Estado | Evidência | O que foi encontrado / o que falta |
|---|---|---|---|---|
| 001 | Congelar a base de trabalho e reconciliar trabalho concorrente | PARCIAL | E02 | HEAD e worktree identificados; trabalho concorrente não reconciliado: 9 commits locais exclusivos e 2 da main, com conflito no sender. |
| 002 | Preservar e catalogar as 17 referências | PARCIAL | E14 | Manifesto local existente: 17/17 hashes, bytes e dimensões conferidos. Imagens e manifesto continuam untracked; falta baseline versionado. |
| 003 | Criar rastreabilidade entre promessa, código, dados e aceite | PARCIAL | E01/E13 | Esta revisão fornece matriz e provas; faltam artefatos de implementação/aceite por etapa, ligados a release e banco. |
| 004 | Resolver contradições visuais e comportamentais | PARCIAL | E01/E04 | Carvão prescrito e tokens existentes; composição da tela 08 continua diferente e sem aprovação visual rastreada. |
| 005 | Inventariar capacidades reais e contratos externos | PARCIAL | E05/E06 | Integrações existentes não fecham o contrato do CRM canônico nem capacidades/limites/ACK do provedor no TalkX. |
| 006 | Definir contratos de domínio, estados e indicadores | PARCIAL | E06/E07 | Estados, transições e outcome_unknown existem localmente; falta contrato completo de revisão, métricas e compatibilidade com E87 da main. |
| 007 | Preparar ambientes e limites de segurança | PARCIAL | E07/E13 | PostgreSQL 17 e fixtures locais disponíveis; staging representativo, identidade do banco e ensaio de release ainda sem prova. |
| 008 | Construir fixtures e simulador de provedor | PARCIAL | E13 | Há fixtures de hooks/SQL e agora probes do handler; falta simulador integrado e versionado cobrindo volume, tempo, quedas e eventos. |
| 009 | Instalar gates funcionais desde o primeiro PR | PARCIAL | E13 | CI possui gates, mas lint, manifesto e teste SQL reprovam; checagem Deno não cobre normalmente o sender TalkX. |
| 010 | Instalar comparação visual e passar o gate inicial | ACEITE NÃO COMPROVADO | E13/E14 | Sem baseline visual executado/aprovado e gate com screenshots das 17 telas. |
| 011 | Remover métricas fabricadas e sucessos enganosos | PARCIAL | E08/E10 | Percentuais sintéticos do funil removidos no commit local; ranking Mais convertidos ainda usa use_count e supressão tem KPI 30 dias sem recorte. |
| 012 | Corrigir URL, restauração e navegação do wizard | PARCIAL | E03/E04 | Hook lê step e wizard escreve URL; TalkXView inicia tabs/overview e não restaura wizard/id, back/forward nem limpeza ao sair. |
| 013 | Dar identidade estável e revisão ao rascunho | PARCIAL | E03/E13 | Criação repetida por id vazio corrigida/testada; faltam revisão no servidor, identidade idempotente e recuperação após resposta perdida. |
| 014 | Serializar autosave e tratar recuperação | PARCIAL | E03/E13 | Fila local e autosave de filtros/reversão corrigidos/testados; faltam recuperação entre reloads e conflitos entre sessões. |
| 015 | Persistir seleção e separar draft de audiência de envio | PARCIAL | E03/E07 | Hidratação protegida e substituição atômica testadas; snapshot final de envio/versionamento e job de lançamento ainda separados. |
| 016 | Corrigir duplicação e identidade de autoria | PARCIAL | E03/E04 | ID da cópia corrigido; creators continua mapeando created_by para nome de campanha, e cópia integral da seleção não está fechada. |
| 017 | Corrigir persistência e round-trip de fuso | REABERTA | E03/E07/R09 | Fuso entrou no payload local, mas DST válido é rejeitado; migration nova quebra CRUD e min/data do agendamento ainda misturam fusos. |
| 018 | Validar formulário e autorização por camada | REABERTA | E03/E06/E07 | Launch valida confirmações, porém mode=schedule não usa o mesmo gate; migration nova regride CRUD e scheduler não autoriza chamador no handler. |
| 019 | Corrigir callbacks e eventos de sucesso/falha | PARCIAL | E04/E06/E13 | Callbacks por status e success===true corrigidos; falta prova de todos os cliques e atomicidade entre persistência, evento e resultado. |
| 020 | Gate de integridade e decisão sobre dados legados | ACEITE NÃO COMPROVADO | E07/E13 | Gate reprovado. Migração de leases recoloca sending legado em pending sem prova do resultado externo; decisão sobre legados permanece pendente. |
| 021 | Normalizar identidade de contato e telefone | PARCIAL | E03/E06/R02 | Normalização pontual existe; telefone formatado na blacklist escapa da comparação normalizada. Falta identidade única CRM/UI/worker. |
| 022 | Fechar schema mínimo e autorização de audiência | PARCIAL | E07/E15 | RPCs de audiência autorizam perfis/contatos, mas CRUD regrediu e ACL/compatibilidade da RPC nova da main precisam revisão. |
| 023 | Unificar linguagem de filtros e compilação segura | PARCIAL | E05/E13 | Regra desconhecida agora falha fechada; AST sem versão, sem operador entre grupos e validação incompleta de tipos/operadores numéricos. |
| 024 | Resolver audiência e contagens sem truncamento | PARCIAL | E03/E05/E06 | count exato convive com resolveAudience limitado a 5000 e consultas sem paginação; seleção/materialização integral não demonstrada. |
| 025 | Consolidar o predicado de supressão | PARCIAL | E06/E11/R02/R03 | Supressão existe, mas predicados divergentes, snapshot único no sender e UI/hook desconectados impedem consistência. |
| 026 | Implementar preflight de elegibilidade com revisão | NÃO IMPLEMENTADA | E03/E06/E07 | Não localizado preflight persistido que vincule revisão, expiração, elegibilidade e confirmação. |
| 027 | Materializar audiência e job de lançamento de forma segura | PARCIAL | E03/E07 | RPC de snapshot e transição são avanços, mas configuração, audiência e lançamento não formam uma transação com job idempotente. |
| 028 | Implementar adaptador canônico de empresas e contatos CRM | NÃO IMPLEMENTADA | E04/E05 | CRM 360 no wizard está desabilitado; integração genérica de CRM fora do módulo não comprova adaptador de audiência TalkX. |
| 029 | Testar isolamento, cardinalidade e expiração de ponta a ponta | PARCIAL | E07/E13 | Autorização/snapshot/leases testados isoladamente; falta E2E multiusuário com grandes bases, expiração e seleção efetiva. |
| 030 | Gate de audiência e compatibilidade com o fluxo existente | ACEITE NÃO COMPROVADO | E03/E05/E06 | Sem aceite de audiência integral e predicado unificado; corrigir truncamento/consistência antes de aprovar. |
| 031 | Consolidar shell, tokens e orçamento de espaço | PARCIAL | E04/E09 | Shell e tokens carvão existem; orçamento de espaço, densidade e viewports do modelo ainda sem prova visual. |
| 032 | Aprovar a composição estrutural da tela 08 antes dos detalhes | ACEITE NÃO COMPROVADO | E04/E14 | Tela 08 sem aceite; StepMessage só aparece em step 2, contrariando a mensagem visível abaixo da audiência no passo 1. |
| 033 | Conectar informações e origem do público | PARCIAL | E04 | Nome, objetivo e conexão existem; responsável próprio e fonte CRM do modelo não estão entregues. |
| 034 | Conectar filtros visuais e seleção paginada | PARCIAL | E03/E04 | Filtros locais existem; cidade/grupo/inatividade/aniversário usam campos não selecionados, sem seleção paginada integral. |
| 035 | Unificar editor de mensagem e personalização | PARCIAL | E03/E04 | Estado compartilhado e limpeza de mídia ao aplicar texto corrigidos; editor na tela 08 e contrato completo de variáveis faltam. |
| 036 | Implementar uploader e ciclo de vida seguro de mídia | PARCIAL | E04/E10/R08 | Wizard continua com URL de mídia; falta uploader privado completo e teste de áudio envia texto. |
| 037 | Entregar rail, preview e ações persistentes | PARCIAL | E04 | Rail/preview/CTAs existem; amostra da audiência, composição, sticky e mobile não foram aprovados. |
| 038 | Fechar revisão final e confirmação sem efeitos colaterais | PARCIAL | E03/E04/E07 | Revisão e confirmações implementadas parcialmente; não substituem preflight versionado ou lançamento atômico. |
| 039 | Validar responsividade e acessibilidade dos passos | ACEITE NÃO COMPROVADO | E04/E14 | Não executado aceite autenticado 1672×941, 1280×800, 390×844, zoom 200% e teclado. |
| 040 | Gate visual e funcional de Nova campanha/revisão | ACEITE NÃO COMPROVADO | E04/E13/E14 | Gate 08/09 aberto: composição divergente e cadeia funcional ainda incompleta. |
| 041 | Fazer o banco impor a máquina de estados | REABERTA | E07/R10/R11/R12 | Proteção INSERT/DELETE do commit 5363 foi sobrescrita pela migration 200000 local: criação/exclusão legítimas falham e delete service vira no-op. |
| 042 | Formalizar a fronteira com o provedor de mensagens | PARCIAL | E06/R05 | Cliente Evolution existe; aceita HTTP 200 com objeto vazio como sent e não formaliza capacidades/ACK/limites. |
| 043 | Implementar claim atômico e lease de trabalho | PARCIAL | E06/E07/E13 | SKIP LOCKED, token e fence testados; falta integrar durabilidade do efeito externo, renovação e retomada do worker inteiro. |
| 044 | Resolver retries e resultado desconhecido sem reenvio cego | PARCIAL | E06/E07/R06 | Retry cego do POST removido e outcome_unknown persistido quando banco responde; falha também na quarentena deixa lease recuperável e sem reconciliação. |
| 045 | Limitar dispatcher, concorrência e pressão de envio | PARCIAL | E06/R01 | Loop numa requisição, sem dispatcher durável/cota global; reatribuição const interrompe no vigésimo envio. |
| 046 | Revalidar elegibilidade imediatamente antes de enviar | PARCIAL | E06/E15/R03/R04 | Checa status antes do POST, não toda elegibilidade; main adicionou janela a cada 20 envios, mas é divergente, fixa Brasília e atinge o erro const. |
| 047 | Tornar pausa, cancelamento e retomada operações confiáveis | PARCIAL | E06/E07/E13 | Transições bloqueadas por RPC e conclusão só com fila drenada testadas; faltam idempotência do comando, continuação durável e pausas por motivo. |
| 048 | Implementar agendamento e recorrência com fuso explícito | REABERTA | E03/E06/E07/R09 | Timezone parcial contém regressões; não localizada recorrência durável e scheduler só procura scheduled, sem recuperar sending interrompido. |
| 049 | Executar caos controlado no motor completo | NÃO IMPLEMENTADA | E13 | Probes desta auditoria não equivalem ao caos integrado do motor com banco+fila+provedor, ACK atrasado e opt-out concorrente. |
| 050 | Gate do motor de campanhas | ACEITE NÃO COMPROVADO | E06/E07/E13 | Gate do motor reprovado por CRUD, worker, supressão, ambiguidade e divergência entre branches. |
| 051 | Correlacionar eventos ao destinatário e à tentativa corretos | PARCIAL | E15 | main adicionou external_id/DELIVERY_ACK; ausente na branch local e sem correlação imutável por tentativa/conexão. |
| 052 | Processar webhooks com autenticação, deduplicação e ordenação | REABERTA | E15/R13/R14/R15 | Novo handler main duplica incremento sob ACK concorrente, perde reparo após falha e altera caminho de stub; falta atomicidade e escopo. |
| 053 | Medir respostas com atribuição explícita | PARCIAL | E08 | Resposta atribuída por contato e janela 24h, não por campanha/tentativa; consultas limitadas e status sent exclui delivered. |
| 054 | Rastrear cliques sem criar redirecionador inseguro | NÃO IMPLEMENTADA | E08/E12 | Não encontrado tracking de cliques TalkX com identificador assinado/allowlist e proteção contra redirecionamento aberto. |
| 055 | Conectar conversões e receita a uma fonte verificável | NÃO IMPLEMENTADA | E08 | Não encontrada atribuição de receita/conversões ao TalkX. Remover números sintéticos não implementa a fonte comercial. |
| 056 | Criar agregações consistentes para gráficos e indicadores | PARCIAL | E08/E09/E15 | Agregações locais existentes; cortes de consulta, estados delivered/sent e ACK não atômico impedem golden dataset reconciliado. |
| 057 | Validar e completar exportação e envio de relatórios | PARCIAL | E09/E12 | Export paginado do monitor existe; talkx-report ainda limita 2000 e envio de relatório não tem prova integrada/idempotente. |
| 058 | Tornar monitoramento realtime completo e limitado | PARCIAL | E09/E13 | Realtime e fallback existem; reconciliação, limites, perda de eventos e recuperação ainda sem teste integral. |
| 059 | Ancorar riscos e recomendações em evidências reais | PARCIAL | E05/E08/E10 | Recomendações/regras existentes não comprovam risco, conversão e receita reais; faltam fontes e denominadores. |
| 060 | Gate de métricas, relatórios e rastreabilidade | ACEITE NÃO COMPROVADO | E08/E12/E15 | Gate de métricas não fecha com atribuição heurística, truncamento e corrida de ACK na main. |
| 061 | Reconstruir a visão geral com densidade e dados corretos | PARCIAL | E04/E09 | Listagem/KPIs/rail renderizam; autoria incorreta, ações incompletas e nenhuma prova de paridade visual. |
| 062 | Conectar rail lateral, atalhos e ações da listagem | PARCIAL | E04 | Atalhos de segmentos/templates funcionam; Importar contatos emite import, não tratado pelo pai; ajuda própria ausente. |
| 063 | Entregar a tela de campanha agendada | PARCIAL | E03/E09 | Hidratação e callbacks agendados corrigidos; round-trip parcial de timezone, DST, recorrência e layout continuam abertos. |
| 064 | Entregar o monitor ao vivo com informações acionáveis | PARCIAL | E09 | Monitor tem controles/realtime/export/outcome_unknown; telemetria, fila multissegmento e métricas ainda não equivalem ao modelo. |
| 065 | Completar campanha em andamento e todas as suas abas | PARCIAL | E07/E09 | Aba Mensagens usa TabComingSoon; edição de limites em sending/paused conflita com trigger de imutabilidade. |
| 066 | Criar experiência própria de campanha pausada | NÃO IMPLEMENTADA | E04/E09 | Pausada reutiliza running; tela/checklist próprios e segmentos pendentes do modelo não localizados. |
| 067 | Entregar relatório de campanha concluída | PARCIAL | E04/E09/E12 | Relatório CSV/endpoint existe; concluída abre monitor, sem tela completa de funil, links, ROI e insights. |
| 068 | Completar analytics agregado e comparativos | PARCIAL | E08 | Funil local deixou de fabricar percentuais; faltam fontes comerciais, filtros completos e comparativos consistentes. |
| 069 | Implementar estados de sistema e modais no produto real | PARCIAL | E04/E09/E11 | Componentes de vazio/loading/modais existem; erro, sem permissão e CRM indisponível não cobrem todos os fluxos reais. |
| 070 | Gate das telas operacionais | ACEITE NÃO COMPROVADO | E09/E13/E14 | Sem gate funcional/visual aprovado das telas operacionais; defeitos bloqueiam encerramento. |
| 071 | Entregar biblioteca de segmentos e painel de detalhes | PARCIAL | E05 | Biblioteca/favoritos/amostra presentes; detalhes CRM, desempenho, composição do público e layout incompletos. |
| 072 | Entregar construtor visual de regras versionadas | PARCIAL | E05 | Construtor existe; grupos sempre combinados por OR, embora botão Adicionar grupo (AND) sugira semântica externa diferente; sem versão AST. |
| 073 | Completar filtros comerciais e RFM com dados reais | NÃO IMPLEMENTADA | E05 | Não encontrados filtros reais de compras/ticket/RFM integrados ao contrato comercial do TalkX. |
| 074 | Implementar prévia, sobreposição e resumo de segmento | PARCIAL | E05 | Estimativa/amostra presentes; sobreposição e composição reais não demonstradas. |
| 075 | Entregar biblioteca visual de templates | PARCIAL | E10 | Galeria/import/preview existem; toggle lista não entregue e ranking Mais convertidos conta usos. |
| 076 | Entregar editor completo e histórico de versões | PARCIAL | E10/E07 | Histórico/snapshot/restauração existem; falta prova integral de versão imutável vinculada a envio, mídia e layout. |
| 077 | Implementar variações A/B com atribuição estável | PARCIAL | E06/E10 | variant_id e pesos existem, mas conteúdo lido da variante mutável e erro de leitura faz fallback; tentativa/snapshot não são imutáveis. |
| 078 | Completar importação, duplicação e teste de templates | PARCIAL | E06/E10/R08 | Importar/duplicar/testar existem; áudio testa texto, variáveis e mídias não têm contrato completo end-to-end. |
| 079 | Fechar reutilização entre segmentos, templates e wizard | PARCIAL | E03/E04/E05 | Callbacks aplicam segmento/template, mas URL, edição, retorno e revisão persistida não fecham o round-trip. |
| 080 | Gate de segmentos e templates | ACEITE NÃO COMPROVADO | E05/E10/E13/E14 | Sem gate de bibliotecas; faltam paridade, contrato de AST/A-B e testes de mídia reais. |
| 081 | Implementar upload e análise segura da importação | NÃO IMPLEMENTADA | E04/E14 | Não localizado workspace TalkX de importação de contatos CSV/XLSX; importação de templates é outra capacidade. |
| 082 | Implementar correspondência com o CRM canônico | NÃO IMPLEMENTADA | E04/E05 | Não localizado matching TalkX de contatos/empresas com CRM canônico. |
| 083 | Implementar resolução manual de conflitos e vínculos | NÃO IMPLEMENTADA | E04/E14 | Não localizado fluxo de conflitos, confiança, vincular/criar/ignorar e auditoria da decisão. |
| 084 | Tornar importações retomáveis e auditáveis | NÃO IMPLEMENTADA | E04/E07 | Não localizado job de importação TalkX com checkpoints, deduplicação e retomada. |
| 085 | Completar a lista de supressão e suas ações | PARCIAL | E11 | UI permite contato existente e soft-delete; não entrega campos phone-only/expiração/histórico descritos como prontos em PARIDADE.md. |
| 086 | Completar importação, exportação e histórico de supressão | PARCIAL | E11 | Import de supressão procura contatos existentes; export não usa fallback phone, não pagina servidor e não restaura histórico/expiração. |
| 087 | Executar revisão transversal de autorização e segurança | PARCIAL | E06/E07/E11/E15 | Autorização parcial testada; scheduler sem autorização de domínio e nova RPC main sem revogação explícita/search_path exigem revisão runtime. |
| 088 | Reconciliar CRM, audiência e resultado ponta a ponta | ACEITE NÃO COMPROVADO | E05/E06/E08 | Sem reconciliação golden dataset CRM→audiência→provedor→webhook→resultado no banco canônico. |
| 089 | Medir performance, capacidade e custo com orçamento aprovado | ACEITE NÃO COMPROVADO | E06/E09/E13 | Build medido; faltam budgets aprovados e carga de base grande/filas/custos no ambiente representativo. |
| 090 | Gate das integrações e qualidade transversal | ACEITE NÃO COMPROVADO | E05/E11/E13 | Gate transversal aberto por CRM ausente, supressão divergente e problemas de release. |
| 091 | Produzir ajuda correspondente ao produto entregue | NÃO IMPLEMENTADA | E04/E14 | Não localizada central de ajuda TalkX correspondente às capacidades reais entregues. |
| 092 | Implementar busca, guias e canais de suporte da ajuda | NÃO IMPLEMENTADA | E04/E14 | Não localizados busca/guias/vídeos/canais válidos da tela de ajuda. |
| 093 | Fechar inventário de rotas, abas e ações dos 17 modelos | PARCIAL | E01/E04/E14 | 17 modelos catalogados; falta inventário executável de todos os cliques, rotas, abas e critérios de aceite. |
| 094 | Executar aceite visual integral autenticado | ACEITE NÃO COMPROVADO | E14 | 17 originais íntegros não são 17 telas aceitas; nenhuma comparação visual autenticada nova nesta rodada. |
| 095 | Executar bateria final funcional e de regressão | ACEITE NÃO COMPROVADO | E13 | 3043 unitários e 167 contratos passaram; Deno, lint, manifesto e teste SQL falham, além de 15 cenários de defeito reproduzidos. |
| 096 | Preparar release imutável, migrations e rollback | ACEITE NÃO COMPROVADO | E02/E07/E13/E15 | Sem release candidata reconciliada: conflito de fonte, versão de migration duplicada entre branches e manifesto stale. |
| 097 | Executar deploy canário e smoke positivo/negativo | ACEITE NÃO COMPROVADO | E02 | Frontend público corresponde à main 33d02292, não ao HEAD local; nenhum canário desta recuperação nem nova prova de banco. |
| 098 | Ampliar rollout com critérios objetivos de interrupção | ACEITE NÃO COMPROVADO | E02/E13 | Não comprovado rollout gradual desta recuperação com thresholds e interrupção automática. |
| 099 | Observar operação e fechar falhas de campo | ACEITE NÃO COMPROVADO | E02/E13 | Sem 24h de observação e reconciliação de incidentes para uma release candidata aprovada. |
| 100 | Encerrar com rastreabilidade integral, não com promessa | ACEITE NÃO COMPROVADO | E01/E02/E13/E14 | Não há encerramento: 13 capacidades ausentes, 62 parciais, 5 reabertas e 20 etapas de aceite sem comprovação. |

## 8. Cobertura dos 17 modelos

O tema carvão permanece requisito. Os fundos azuis dos modelos não autorizam trocar o tema global. Não há aceite pixel a pixel nesta rodada: a coluna abaixo descreve cobertura funcional/estrutural, não uma nota visual.

| Modelo | Estado observado | Lacuna principal |
|---|---|---|
| 01 Visão geral | Parcial | Autoria, atalhos, filtros e densidade sem aceite |
| 02 Segmentos/biblioteca | Parcial | CRM, composição e métricas de desempenho |
| 03 Construtor | Parcial | AST/versionamento, semântica entre grupos, RFM e sobreposição |
| 04 Biblioteca de templates | Parcial | Ranking usa usos, lista/toggles e composição incompletos |
| 05 Editor de templates | Parcial | Snapshot por envio, mídia/áudio e A/B imutável |
| 06 Supressão | Parcial | phone-only, expiração/histórico, import/export integrais |
| 07 Analytics | Parcial | Fontes comerciais, atribuição e estados sent/delivered |
| 08 Nova campanha | Parcial e divergente | Mensagem ausente no passo 1, responsável, CRM, uploader, deep link |
| 09 Revisão final | Parcial | Preflight versionado, data, elegibilidade e lançamento atômico |
| 10 Agendada | Parcial com regressões | DST, timezone, recorrência, migration e recuperação |
| 11 Monitor | Parcial | Telemetria integral, fila multissegmento, durabilidade e ACK |
| 12 Em andamento | Parcial | Mensagens em breve, limites incompatíveis com trigger |
| 13 Pausada | Experiência específica não encontrada | Reutiliza running, sem checklist/composição próprios |
| 14 Relatório concluída | Fluxo específico incompleto | Concluída abre monitor; faltam funil/ROI/links |
| 15 Importação/vinculação CRM | Não encontrada no TalkX | Matching, conflitos, jobs e retomada |
| 16 Ajuda | Não encontrada no TalkX | Rota, busca, guias, vídeos e suporte |
| 17 Estados/modais | Parcial | Cobertura integrada de erro/permissão/CRM/desconexão |

Falta comparar as telas reais com os 17 originais, nos 3 viewports exigidos, também com teclado, zoom 200%, dados vazios, dados grandes e falhas de rede. Não gerar baselines a partir da UI divergente para depois dizer que “passou”.

## 9. Testes efetivamente executados nesta rodada

| Comando/prova | Resultado | Interpretação |
|---|---|---|
| bun run test | 228 arquivos; 3043 PASS; 35 TODO | Suite atual do src passou; TODO não é execução |
| bun run test:contracts | 4 arquivos; 167 PASS | Contratos Vitest passaram |
| node --test scripts/db-audit/*.test.mjs | 145 PASS | Inclui inspeções textuais; não garante runtime do motor |
| bun run typecheck | exit 0 | TypeScript do app; não inclui todas as Edge Functions |
| bun run build | exit 0; 6,67 s | Build frontend; warning de chunk maps 1.867,79 kB permanece |
| node scripts/ci/lint-ratchet.mjs | **exit 1** | 2 ocorrências novas: purity e dependência scheduleTimezone |
| deno check talkx-send + talkx-scheduler | **exit 1** | TS2588 const e TS2322 weekday |
| generate-manifest.mjs --check | **exit 1** | Manifesto Edge stale |
| bun run db:guard | exit 0, 420 migrations locais | Ledger remoto pulado por ausência de DESTINO_URL |
| talkx-draft-recipients.test.sh | PASS | Snapshot/autorização/lifecycle isolados |
| talkx-delivery-leases.test.sh | PASS | Claim/fence/quarentena isolados; não prova exatamente um efeito externo |
| talkx-campaign-transitions.test.sh | PASS | RPC start/pause/cancel isolada |
| talkx-campaign-state-transitions.test.sh | **exit 1** | Regressão na sequência com migration de fuso |
| runtime-probes.mjs | 9 defeitos reproduzidos | PASS do probe significa defeito observado, não aceitação do produto |
| crud-probe.mjs | 3 defeitos reproduzidos em PG17 | INSERT/DELETE positivos e service DELETE |
| main-webhook-probes.mjs | 3 defeitos reproduzidos | ACK concorrente, falha parcial e caminho de stub na main |
| Integridade das referências | 17/17 hashes/bytes/dimensões | Arquivos íntegros, mas ainda untracked |
| merge-tree e união de migrations | Conflito + 1 versão duplicada | Integração não é segura por mera cópia/push |

Os probes usam o código real extraído/transpilado; substituem banco/provider/tempo por fixtures e executam handlers. Não acessam contas, números nem tabelas reais. O probe SQL reutiliza o setup do harness e executa as migrations em container descartável. Isso é mais forte que procurar uma string, porém não substitui um E2E com todo o schema e runtime canônico.

Exemplo do motivo pelo qual os testes anteriores não bastavam: três contratos de timezone por regex passaram, enquanto a mesma migration que contém as strings esperadas quebrou o CRUD positivo. É necessário validar comportamento, não apenas presença de código.

Reprodução segura, a partir da raiz do repositório:

Os três probes históricos não foram versionados porque `PASS` significava “defeito reproduzido”. As regressões relevantes foram convertidas em asserções positivas na suíte oficial:

```bash
bunx vitest run src/components/talkx/__tests__/useCampaignEditor.test.tsx src/components/talkx/__tests__/TalkXView.route.test.tsx src/hooks/integrations/__tests__/useTalkXSegments.test.ts
node --test scripts/db-audit/talkx-analytics-contract.test.mjs scripts/db-audit/talkx-delivery-leases-contract.test.mjs scripts/db-audit/talkx-navigation-contract.test.mjs scripts/db-audit/talkx-schedule-timezone-contract.test.mjs scripts/db-audit/talkx-scheduler-contract.test.mjs
bash scripts/db-audit/talkx-campaign-state-transitions.test.sh
bash scripts/db-audit/talkx-delivery-leases.test.sh
deno check supabase/functions/talkx-send/index.ts supabase/functions/talkx-scheduler/index.ts
```

Logs integrais desta rodada: /tmp/talkx-revalidation-7ZtZI5/*.log. Temporários podem desaparecer; resultados e hashes foram registrados neste diretório de auditoria. Não versionar logs brutos sem revisão de conteúdo. O probe da main está fixado no SHA auditado; não segue mudanças futuras automaticamente.

## 10. Sequência corretiva recomendada — não executada nesta revisão

### Lote 1 — Reconciliar a base sem perder trabalho

1. Preservar o worktree atual e inventariar as mudanças concorrentes.
2. Comparar main, branch remota, HEAD e alterações sem commit.
3. Resolver conflito do sender por comportamento: manter leases/outcome_unknown/FSM e integrar tracking/janela corrigidos, sem escolher “ours/theirs” cegamente.
4. Consultar identidade/ledger/catálogo do banco canônico em read-only.
5. Resolver a colisão 20260911120000 com estratégia compatível com o que efetivamente foi aplicado. Não reescrever histórico aplicado.
6. Reconciliar manifestos, types-sync e docs; testar compatibilidade entre versões frontend/Edge/DB.

Saída exigida: um candidato identificável, sem migrations duplicadas, sem perda das proteções novas e com todos os arquivos necessários incluídos conscientemente.

### Lote 2 — Bloqueadores do banco e entrega

1. Corrigir a função de mutabilidade mantendo INSERT/UPDATE/DELETE, contraprovas negativas e casos positivos.
2. Corrigir const/typing e adicionar 19/20/21/40 destinatários ao teste real do handler.
3. Deduplicar ACK e atualizar destinatário/contador numa só transação; corrigir regressão do stub e escopo da conexão.
4. Auditar ACL efetiva da RPC E87; restringir explicitamente ao chamador previsto.
5. Garantir normalização/elegibilidade/janela depois de toda espera e antes de cada POST.
6. Separar tentativa/resultado desconhecido/lease expirado; não repetir sending legado sem reconciliação.
7. Autorizar scheduler por identidade de serviço e testar 401/403/validação de método sem enviar campanhas.
8. Implementar dispatcher durável com lotes/tempo máximo, continuação, backpressure e cota por conexão.

Saída exigida: 15 probes deixam de reproduzir falhas e são convertidos em regressões positivas, além de caos integrado com provider simulado. Não apenas mudar as asserções para esconder o defeito.

### Lote 3 — Integridade do editor e audiência

1. Unificar validação schedule/launch; corrigir DST e hora ambígua/inexistente.
2. Resolver autoria pelo perfil do usuário e a apresentação do responsável.
3. Restaurar URL, ID, step, voltar/avançar e reabertura.
4. Introduzir revisão/idempotência server-side, preflight expirável e lançamento atômico.
5. Paginar seleção/materialização e confrontar contagens com bases 0/1/999/1000/1001/5001.
6. Unificar AST, semântica entre grupos e supressão entre UI/CRM/worker.

Saída exigida: salvar, reabrir e lançar a mesma audiência/configuração sem perder seleção, ampliar filtros ou enviar após revogação.

### Lote 4 — Fechar as funções prometidas

1. Reconstruir a composição da tela 08 em carvão, com mensagem no passo 1, responsável, rail e uploader.
2. Entregar CRM/importação/conflitos/retomada e RFM com origem verificável.
3. Completar running/Mensagens, pausada própria, relatório concluída e ajuda.
4. Fechar supressão phone-only/expiração/histórico/import/export.
5. Implementar fontes de cliques/respostas/conversões/receita, versões de template e A/B; sem dados fictícios substituindo integração.
6. Corrigir documentação ao mesmo tempo em que cada capacidade ganha prova do caminho do usuário.

Saída exigida: ações presentes têm efeito correto, e as 13 capacidades ausentes deixam de ser apenas roadmap.

### Lote 5 — Aceite e publicação

1. Aceite visual autenticado dos 17 modelos nos viewports previstos; carvão preservado.
2. Regressão funcional + SQL acumulado + Deno + gates de lint/manifest/types/build.
3. Candidato imutável; ensaio de migration, compatibilidade e rollback.
4. Canário com audiência artificial/provedor controlado, smokes positivos e negativos.
5. Rollout com critérios de parada, depois observação por pelo menos 24h.
6. Fechamento por etapa com SHA, teste, evidência de banco/Edge/frontend e aceite aplicável.

Não atualizar a nota para 10/10 antes desses critérios. O bloqueio atual não é falta de um “plano infalível”; é a ausência de reconciliação, contratos completos e testes comportamentais nas fronteiras onde as falhas foram reproduzidas.

## 11. Limites explícitos e entrega desta rodada

- Revisão cobre todos os 100 itens do plano e todos os 17 modelos; nenhuma etapa foi omitida da matriz.
- Não executados: SQL no banco canônico, validação de ACL em produção, disparo real, E2E autenticado, comparativo pixel a pixel, deploy canário, rollout e observação de 24h.
- Não certificada: sincronização completa do banco com local/GitHub. db:guard local não mediu isso.
- Não alterados: código funcional, migrations existentes, arquivos pessoais de configuração e plano original nesta revisão.
- Criados apenas: relatório, snapshot de evidência e três scripts de reprodução, no diretório desta auditoria.
- Nenhum push/commit/deploy/merge foi realizado. A execução anterior deixou mudanças locais de timezone; foram preservadas e auditadas, não publicadas.
