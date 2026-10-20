# Paridade V3 → V2: segunda passada do documento 09 (contato, lista, IA e figurinhas), 13/10/2026

Documento: `Zapp_Web_V3/docs/estado/09-features-inbox-components-contato-lista-ia.md`. A primeira passada (Parte 9) gerou a faixa P (18 cartões, 14 já concluídos). Esta passada comparou **função por função, lendo os dois lados**, quatro módulos: `ai-tools` (15 arquivos), `contact-details` (28, em duas metades), `conversation-list` (10) e `stickers` (13). Cinco leituras em paralelo, só leitura, cada uma com a lista dos cartões existentes para não duplicar. Os achados críticos foram conferidos no código antes de virar cartão.

## Resultado: 66 achados, 33 cartões (faixa Q)

Agrupados por arquivo e camada, para que dois cartões nunca editem o mesmo trecho sem ordem. Dependências usam o portão de integração (o filho só roda quando o código do pai está na branch do dia).

## Achados mais graves

- **QS1 (P0):** a figurinha pessoal aparece para todos. A policy de leitura de `stickers` é `USING (true)`; o bucket é público. Quem não é admin também não consegue enviar (a RLS do Storage exige a pasta do usuário e a V2 grava na raiz).
- **QL1 (P0):** arquivar pela lista e em lote só zera o responsável e mostra "arquivada"; o status nunca é gravado, então o chip "Arquivadas" não enxerga a conversa. A transferência em lote atualiza `contacts` direto, sem trilha, e diz "N transferidos" com 0 linhas afetadas.
- **QA3 (P0):** as edges de IA leem `contacts.tags` para o prompt; a migration de remoção das etiquetas apaga a coluna e quebraria a análise. A leitura tem de sair antes. Também: limite por IP em memória, não por usuário.
- **QC1:** a linha do tempo de SLA do contato usa só `contactId` e ignora a hierarquia (empresa, cargo, tipo, fila, agente) que o cabeçalho usa: o mesmo contato mostra "No prazo" e "Estourado".
- **QC3/QC4:** os stories (WS1) não funcionam na Evolution GO (produção): a edge devolve `notSupported` e a tela mostraria "nenhum status" (falso vazio). O hook ainda cruza contatos, aceita homônimo e envia presença "paused" ao cliente a cada abertura.
- **QL5:** a lista carrega no máximo 500 conversas, sem paginação nem aviso.

## Cartões

| Chave | Perfil | Título | Depende de |
|---|---|---|---|
| QS1 | workersql | fix(db): figurinha pessoal não vaza para a biblioteca compartilhada; RLS de tabela e Storage por dono | - |
| QS2 | workersql | feat(db): favorito, categoria e contador de uso de figurinha por usuário (sticker_user_state) | QS1 |
| QS3 | hugo | fix(figurinhas): upload e gravação com auth.uid(), erros reais, validação, GIF/WebP e classificação em segundo plano | QS1, QS2 |
| QS4 | iris | fix(figurinhas): erro de busca com 'Tentar de novo', acessibilidade e miniatura com URL assinada na pasta pessoal | QS3 |
| QC1 | hugo | fix(sla): linha do tempo de SLA do contato usa a mesma hierarquia de regras do cabeçalho; conversa resolvida sem resposta não estoura | SLT1 |
| QC2 | iris | feat(contato): filtro 'só em risco/estourado' e filtros lembrados na linha do tempo de SLA | SLT2, QC1 |
| QC3 | edgar | fix(edge): stories do WhatsApp na Evolution GO - spike de fonte de dados e 'indisponível neste provedor' em vez de vazio | WS1 |
| QC4 | hugo | fix(hooks): useWhatsAppStatus sem corrida entre contatos, sem instância errada, sem homônimo e sem enviar presença ao cliente | QC3 |
| QC5 | iris | fix(contato): estado salvo do acordeão tolera seção desconhecida e seções novas só buscam dados quando abertas | SLT2, CI1 |
| QC6 | iris | chore(inbox): remover componentes órfãos do painel do contato (ExternalContact360Panel, Contact360Helpers, CrmBadges, useContactAssignment) | CI1 |
| QC7 | iris | feat(contato): atalho 'Regra de atraso de entrega deste contato' no painel (admin e supervisor) | SD3 |
| QC8 | iris | fix(contato): painel no celular com largura e rolagem corretas e título acessível; iniciais do avatar canônicas; chip de sentimento no cabeçalho | - |
| QC9 | hugo | fix(contato): bloquear no WhatsApp nunca cai em outra conexão quando a do contato não tem instância | BK2 |
| QC10 | workersql | feat(db): histórico de alterações do contato (contact_audit_log) com trigger e RLS | - |
| QC11 | iris | feat(contato): aba 'Histórico' somente leitura no diálogo Editar contato | QC10 |
| QC12 | hugo | fix(contato): origem do lead (lead_origin) preenchida na criação; filtro do Talk X marcado 'em breve' enquanto vazio | - |
| QL1 | hugo | fix(inbox): arquivar pela lista e em lote grava o status 'arquivada' sem apagar o atendente; transferência e leitura em lote confiáveis; erros de fixar/favoritar visíveis | - |
| QL2 | hugo | fix(inbox): seleção múltipla se limpa quando a visão muda, confirmação ao arquivar por tecla; busca da lista por telefone normalizado, última mensagem e sem acento | QL1 |
| QL3 | iris | fix(inbox): contadores dos chips pelo pipeline único, estado vazio com causa e atalhos, acessibilidade da linha e tempo relativo curto | LS2, QL2 |
| QL4 | iris | feat(inbox): entrada no modo de seleção por botão, checkbox e toque longo; menu de ações da linha por clique direito, teclado e toque | QL1, QL3, KN1 |
| QL5 | hugo | feat(inbox): carregar mais conversas por cursor (hoje a lista é limitada a 500 sem aviso) | QL2 |
| QL6 | iris | feat(inbox): sentinela 'carregar mais' e aviso de lista parcial na UI da lista | QL5, QL4 |
| QL7 | hugo | feat(inbox): empresa e cargo do Singu nas linhas visíveis (lote com debounce) e regras de SLA resolvidas uma vez para a lista | LS1 |
| QL8 | hugo | fix(inbox): atalhos anunciados sem efeito ligados ou removidos do registro; Ctrl+I e /summary coerentes | KN1 |
| QL9 | iris | feat(inbox): seletor de ordenação da lista (Recentes, Não lidas, Nome) mantendo o padrão atual | QL3 |
| QL10 | workersql | feat(db): combinações de filtros da inbox salvas por usuário (inbox_filter_presets) | - |
| QL11 | iris | feat(inbox): salvar, aplicar e apagar combinações de filtros na lista | QL10, QL9 |
| QA1 | hugo | fix(inbox): IA recebe uma janela limitada, o 422 mostra o motivo e o período gravado condiz com o analisado; objeções e universitários com histórico limitado | AY1 |
| QA2 | hugo | fix(inbox): erros das IAs com leitor único em português; reescrever objeção avisa a falha; trava de 3 s não apaga resultado; timers com cleanup | AY1, QA1 |
| QA3 | edgar | fix(edge): limite das IAs por usuário (não por IP em memória) e parar de ler contacts.tags nos prompts de IA antes da migration de remoção | - |
| QA4 | iris | fix(inbox): 'Usar' resposta de IA não apaga o rascunho; nota de sentimento ausente não vira zero; erro do histórico; status 'escalado' e sentimento 'crítico' no resumo | AY1, QA2 |
| QA5 | iris | fix(a11y): abas e tons das IAs com nome e setas; itens do Histórico operáveis por teclado; gráfico de evolução com alternativa em texto; painel de sugestões com nomes, anúncio e Esc | QA4 |
| QA6 | hugo | fix(inbox): leitura em voz das ferramentas de IA usa a voz e a velocidade escolhidas | - |

## Descartes

- Etiquetas (inclusive de IA), exportar/baixar/copiar para fora, IMAP/SMTP, Sentry, Pagamentos: regras do dono.
- Card da empresa com CNPJ/porte, perfil comercial, RFM, stakeholder: o plano do painel de 3 seções (02/10) já os descartou; a RPC devolve payload mínimo.
- Pontuação manual de lead/risco e estatísticas inventadas: a V2 prefere "nada inventado".
- "Excluir conversa" e itens do menu da V3 sem handler.

## Decisão pendente do Joaquim

Os botões "Copiar" do painel do contato (e-mail, empresa, cargo, nascimento) copiam para a área de transferência. Pela regra "nenhuma informação sai do sistema" cabe confirmar se ficam como exceção ou saem. Não virou cartão.

## Acompanhamento

Ids em `ids_q.json` (e `ids_todos.json`, 295 cartões). Cada entrega é validada no código da branch viva, não só no relato; refazer de recusa vai ao senior; linhagens esgotadas ganham rodada final.
