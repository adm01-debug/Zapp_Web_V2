# TALK ME — Rastreabilidade das 100 etapas originais (auditoria de 20/10/2026)

**Objetivo:** nenhuma das 100 etapas de `PLANO_TALK_ME_100_ETAPAS_2026-09-30.md` fica sem destino. cada linha diz o que existe hoje, qual evidência prova e para onde foi o que faltava.
**Base auditada:** `origin/main` em `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc`.
**Legenda:** ✅ entregue com evidência · 🟡 parcial (evidência fraca) · ❌ ausente · 👤 depende de decisão/presença do Joaquim.

## Resultado por faixa

| Faixa | Estado em 20/10 | Evidência principal | Para onde foi o que faltava |
|---|---|---|---|
| 001–010 Escopo | 🟡 | Regras fechadas em `RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md`; plano entrou por PR #1310 | ADR-007 (D1–D10) registra as decisões que estavam só no código; 002 (branch órfã) tratada na governança |
| 011–020 Arquitetura/dados | 🟡 | Mapeamento e schema canônico conferidos; 5 migrations no ledger; ACL correta (`anon` sem EXECUTE) | 015/016 provados no contrato SQL; 018/019 (baseline e dependências) refeitos com números reais |
| 021–030 UX | 🟡 | Tela, carrossel manual, cartões, estados vazio/erro e responsividade implementados e refinados (plano de 50 etapas) | 026 (busca em fila grande) e 028 (vazio × erro) cobertos por teste; storyboard durável → E2E |
| 031–040 Design/a11y | 🟡 | Botão 142×46, fallback estático, `prefers-reduced-motion`, foco visível, badge com número exato no nome acessível | 032 (contraste) medido com camada sólida sob o rótulo; 035 (pausa do shader) implementado; 037 (aninhamento) corrigido |
| 041–050 Leitura/contagem | ✅ | `talk_me_list_queues`, `talk_me_list_waiting` (cursor + posição + total), busca no servidor, índice `idx_contacts_talk_me_waiting` (583 scans reais) | 048 (limites da busca) endurecido no SQL e no input |
| 051–060 Aceite/sincronização | ✅ | `talk_me_claim` com `FOR UPDATE`, atualização condicional, auditoria e idempotência; conflito/offline/resultado incerto tratados na UI | 058/059 (cache e reconciliação) com janela limitada; 060 (recuperação) já coberto e re-testado |
| 061–070 Botão/entrada | 🟡 | Botão no topo direito, Zen preservado, mobile, flag com fallback `false` | 067 (rota/refresh) decidido no ADR-007 D1; 068 (preservação) ganhou teste |
| 071–080 Tela de atendimento | 🟡 → ✅ | Carrossel manual, cartão completo, "ler mensagem completa", histórico sob demanda, teclado e toque | 075 (prévia de mídia) era o maior buraco: implementado com clique, sem autoplay |
| 081–090 Testes/homologação | 🟡 | 58 testes de componente/hook + contrato SQL com concorrência real no CI | 085 (E2E) entregue em spec dedicado; 090 (homologação nominal) 👤 |
| 091–100 Operação | ❌ → 🟡 | PR, deploy, flag e reversão por flag existem | 096 (piloto) e 097 (métricas) — telemetria implementada; piloto 👤; 098 (observação) 👤 |

## Etapas que mudaram de destino (as que a auditoria moveu)

| Original | Por quê mudou | Destino |
|---|---|---|
| 002 Confirmar posição do botão | Posição já implementada e validada em revisão local | ADR-007 D1 + testes de `ConversationTabs` (D) |
| 005 Elegibilidade | Faltava regra explícita para bloqueado/bot | ADR-007 D4: não existe coluna de bloqueio; registro do comportamento real |
| 006 Canais e exceções | Idem | ADR-007 D4 |
| 009 Navegação | Decisão "página × sobreposição" nunca registrada | ADR-007 D1 |
| 025 Mensagem exibida | Nota interna aparecia como "Sistema" | ADR-007 D7 + rótulo explícito por origem (B) |
| 032 Contraste | Só afirmado, nunca medido | Camada sólida sob rótulo/badge + teste de nome acessível (C) |
| 034 Fallback do shader | Existia, faltava prova de pausa/descarte | Pausa em `document.hidden` e dispose idempotente + testes (C) |
| 038 Anúncios de atualização | Contagem mudava sem limite de frequência | Burst realtime limitado a 1 ciclo por janela, testado (C) |
| 042 Matriz de teste | Não havia massa sintética durável | Seed sintético do E2E (E) |
| 046 Mensagens selecionadas | Histórico não separava origens | Rótulos Cliente/Saída/Nota interna (B) |
| 048 Limites da busca | Busca crua aceitava `%` e termo ilimitado | Escape + 80 caracteres no SQL e no input (A/B) |
| 049 Orçamento de consulta | p95 nunca medido | Medição do custo dominante + telemetria de cliente para p95 real (A/C) |
| 061 Arquivos | Tudo em dois arquivos grandes | Extração só do necessário (mídia), sem refatoração cosmética (B) |
| 067 Entrada/saída | Sem rota nem restauração explícita | ADR-007 D1 + restauração de fila por sessão (D) |
| 075 Prévia de mídia | Não existia: áudio/imagem viravam texto | Componente de mídia sob clique, sem autoplay (B) |
| 085 Fluxos E2E | Nenhum spec de navegador | `e2e/talk-me.spec.ts` + seed (E) |
| 088 Desempenho | Orçamento sem medição | Reconciliação limitada a 3 páginas + telemetria (C) |
| 089 Regressões | Suíte global fechava vermelha por timers alheios | Baseline histórica separada do escopo TALK ME |
| 096 Piloto | Nunca executado, flag já pública | 👤 decisão do Joaquim (ADR-007 D9) |
| 097 Métricas | Inexistentes | Telemetria agregada sem PII (C) + consulta pronta (A) |

## O que só o Joaquim pode fechar

| Item | Por que não é executável por agente |
|---|---|
| 090 homologação nominal | exige uma pessoa nomeada olhando a tela e assinando o aceite |
| 096 recorte do piloto | muda o que os atendentes veem em produção |
| 098 janela de observação | exige tempo real de operação, não teste |
| 099 ampliação e comunicação | decisão de negócio e treinamento da equipe |

## Prova de que a branch original não era necessária

`docs/plano-talk-me-100-etapas` tem 1 commit à frente e 665 atrás da `main`; o commit não é ancestral; a PR #1301 foi fechada sem merge ("Substituído pelo PR #1310"). O arquivo de plano existe em `main` desde 30/09 com o mesmo corpo, diferindo apenas no cabeçalho de status.
