# Plano: remover a função de Tags (etiquetas) do Zapp Web V2

> Ordem do Joaquim em 12/10/2026: "descobrimos que a função de tags não deve ser aplicada; excluir ela das implementações". Este plano remove o que já existe e cancela o que estava planejado. Inventário conferido no código da branch viva e no banco real (somente leitura).

## 1. Escopo: o que sai e o que fica

O termo "tag" cobre conceitos diferentes no sistema. A remoção é **só da função de tags de contato e de conversa**; os demais conceitos ficam e estão listados abaixo para você confirmar ou ampliar.

### Sai (a função de tags)
| Parte | Onde está hoje |
|---|---|
| **Tags de contato** (campo, selos, filtros, comparação, mescla, painel, kanban, tabela, ação em massa) | coluna `contacts.tags` (3 contatos preenchidos), índice `idx_contacts_tags_gin`, ~17 arquivos de `components/contacts`, ~22 de `components/inbox` |
| **Filtro por tag** no inbox e nos contatos | `useUrlFilters`, `useInboxFilters`, `useInboxFilterTags`, `InboxFilters`, `ContactAdvancedFilters`, `chipCounts` (filtros extras) |
| **Etiquetas automáticas de IA** | Edge `ai-auto-tag`, `AIAutoTagsConfig` (Configurações), tabela `ai_conversation_tags` (0 linhas, 6 políticas, 3 índices), função `replace_ai_conversation_tags`, `ai-classify-tickets` (grava nas tags), flag `auto_tag`, esquema `AiAutoTagSchema` |
| **Etiquetas do WhatsApp espelhadas nas tags do contato** | funções `add_wa_tag_if_not_exists` e `remove_wa_tag_by_prefix` (gravam em `contacts.tags` com prefixo) |
| **Segmentação do Talk X por tag de contato** | filtro de público (`TalkXAudienceFilters`, `TalkXContactSelector`), regra de segmento (`RuleValueInput`), função `talkx_segment_tags` |
| **Contexto de IA com tags** | linha "Tags:" em `ai-conversation-analysis`, `chatbot-l1`, `ai-conversation-summary`, `ai-conversation-pipeline`; ação de voz `voice-agent` |
| **Selo VIP derivado da tag `vip`** | `VirtualizedRealtimeList`, `ChatPanelHeader` (some junto; ver decisão D-T2) |
| **Planejado e cancelado** | `CT-081` (tags por contato e filtro), cartões de RPC atômica de tag, `ai-auto-tag` no CI, "Classificar Recentes" (6 cartões arquivados) e o módulo de Etiquetas da auditoria de UI (UI-09) |

### Fica (outros conceitos com o mesmo nome; confirme se algum deve sair também)
| Conceito | Motivo |
|---|---|
| `email_threads.tags` e etiquetas do Gmail | rótulos do e-mail, não do contato |
| `knowledge_base_articles.tags` | palavras-chave de artigo da base de conhecimento (busca) |
| `talkx_templates.tags` e versões | rótulos dos modelos de mensagem |
| `sales_deals.tags` | negociações (módulo já desligado na interface) |
| Tags de produto do catálogo externo | dado do fornecedor |
| Etiquetas da instância do WhatsApp (Evolution) | recurso do próprio WhatsApp, não do contato |
| Selos visuais chamados "tag" (ex.: "tag Atrasada" do Quadro de Tarefas) | componente de interface |
| `crm-integration-contract` (chaves `tags`, `company_tags`) | contrato com CRM externo; mexer exige combinar com o parceiro |

## 2. Decisões adotadas (valem se você não vetar)
- **D-T1:** o banco só perde dados **no fim e por você**. A migration entra no repositório com `Rollback:` e **arquiva** as 3 linhas de `contacts.tags` numa tabela de arquivo antes de remover a coluna; quem aplica em produção é você, na promoção. Nenhum agente aplica nada em produção.
- **D-T2:** o selo **VIP** deixa de existir enquanto vier da tag `vip`. Se o VIP for importante, o substituto é um campo próprio (decisão sua, outro cartão).
- **D-T3:** o código sai **antes** do banco: sem isso a migration quebraria telas que ainda leem a coluna.
- **D-T4:** os outros conceitos da tabela "Fica" **não** são tocados.

## 3. Ordem (cada cartão compila e passa sozinho)
1. **Interface primeiro** (4 cartões iris, em paralelo): para de usar tags nas telas, mas os hooks ainda exportam o que for preciso.
2. **Dados depois** (1 cartão hugo, filho das telas): remove membros de hooks, serviços e tipos que ficaram sem uso.
3. **Edge Functions** (1 cartão edgar, em paralelo com a interface): remove `ai-auto-tag` e o uso de tags nas demais.
4. **Banco** (1 cartão workersql, só depois de 1 a 3 integrados): migration com arquivo e rollback.
5. **Trava** (1 cartão workertestes): teste que falha se reaparecer a função de tags (com lista do que fica).
6. **Documentação** (1 cartão worker).
7. **Validação do Claude**: busca final, testes, tsc, captura das telas e conferência de que os "fica" continuam funcionando.

## 4. Cartões
| Cartão | Perfil | Escopo | Depende de |
|---|---|---|---|
| TG-A | iris | inbox: filtros, detalhes do contato, aba de IA, lista, cabeçalho, popup | – |
| TG-B | iris | contatos: tabela, cartões, filtros avançados, comparar, mesclar, painel, kanban, ação em massa, tipos | – |
| TG-C | iris | Configurações (etiquetas automáticas de IA), painel de uso de IA, texto de capacidades | – |
| TG-D | iris | Talk X: filtro de público, seleção de contatos, regra de segmento | – |
| TG-E | hugo | hooks, serviços e tipos que ficaram sem uso (filtros por URL, busca de contatos, CRM 360, `chipCounts`, ação rápida) | TG-A, TG-B, TG-D |
| TG-F | edgar | `ai-auto-tag`, esquemas e flag, `ai-classify-tickets`, contexto de IA, `voice-agent` | – |
| TG-G | workersql | migration: arquivo + remoção de tabela, funções, índice e coluna | TG-E, TG-F |
| TG-H | workertestes | teste-trava e varredura de e2e | TG-G |
| TG-I | worker | documentação: decisão, capacidades, inventários | TG-H |

## 5. Como validar no fim
1. Busca por padrões da função (`contact_tags`, `ai_conversation_tags`, `ai-auto-tag`, `.tags` de contato, `filters.tags`, `useInboxFilterTags`, "Etiqueta" nas telas de contato e inbox) sem acerto fora da lista do que fica.
2. `tsc`, lint e testes verdes; o teste-trava do TG-H em vermelho se alguém reintroduzir.
3. Capturas reais das telas de contatos, inbox, Configurações e Talk X sem rastro de etiquetas.
4. Os conceitos que ficam continuam funcionando (e-mail, base de conhecimento, modelos do Talk X, catálogo).
5. Migration revisada: arquivo das 3 linhas, `Rollback:`, nada aplicado em produção.
