# PLANO — QUALIDADE EM PARALELO COM OS AGENTES (29 CARTÕES)

> **Data:** 2026-10-07 · **Aprovado pelo dono** (os 5 tipos). **Escopo:** só arquivos NOVOS (testes, relatórios e documentação); nenhum código de produto muda. Prioridade 1 (atrás das melhorias do dono).

## 1. Por quê
A integração (13 a 17 cartões por hora) é o gargalo; os agentes têm folga. Em vez de empilhar funcionalidades que só chegariam daqui a ~14 horas, usamos a folga em trabalho **independente** que reduz risco antes de subir o lote para produção: testes onde não há nenhum, E2E de fluxos descobertos, auditoria de acessibilidade/celular, documentação dos módulos e revisão de segurança em leitura.

## 2. Regras comuns
- **Só arquivos novos**; qualquer arquivo existente no diff é recusa.
- **Auditorias e segurança são RELATÓRIO**: nada de corrigir, o agente lista; o Claude converte em cartões de correção (item 5).
- **Agentes não acessam produção** (regra R1): a revisão de segurança usa só o repositório (migrations, catálogo, Edge Functions, `src`).
- Bug achado em teste vira `it.fails`/`test.fixme` + relato (nunca corrige no mesmo cartão).
- Regras permanentes: nenhuma informação sai do sistema; só cores do sistema; sem selo de canal/origem.

## 3. Os 29 cartões
### 3.1 Testes que faltam — 87 arquivos de hooks/lib/services sem nenhum teste (levantamento de 07/10); os 8 cartões cobrem os 36 maiores
| Cartão | Perfil | Entregável |
|---|---|---|
| **Y01** | workertestes | Testes: ações de inbox (encaminhar, ações em massa, contatos em massa) |
| **Y02** | workertestes | Testes: CRM (busca de contatos, carteira do cliente, configurações de SLA) |
| **Y03** | workertestes | Testes: Evolution (integrações, mensagens, grupos, serviço) |
| **Y04** | workertestes | Testes: telefonia (adaptador SIP, sink do motor de chamadas, ações do alerta) |
| **Y05** | workertestes | Testes: Talk X, Multiplix e banco externo |
| **Y06** | workertestes | Testes: diagnóstico, notificações de segurança e bloqueio geográfico |
| **Y07** | workertestes | Testes: analytics, metas, relatórios agendados e gamificação |
| **Y08** | workertestes | Testes: formatadores, status de IA, quarentena, atalhos, gestos, toast, sons, voz e chat de equipe |

### 3.2 Testes de ponta a ponta de fluxos sem cobertura (existiam specs de contatos, inbox, e-mail visual, Talk X, catálogo, contraste; faltavam navegação geral, tarefas/quadro, telefonia, busca global)
| Cartão | Perfil | Entregável |
|---|---|---|
| **Y09** | workertestes | E2E: navegação por todos os módulos sem erro de console nem requisição falha |
| **Y10** | workertestes | E2E: tarefas e quadro (criar, mover, concluir, filtros) |
| **Y11** | workertestes | E2E: telefonia (discador, ligar do painel, estados sem provedor) |
| **Y12** | workertestes | E2E: busca global, paleta de comandos e atalhos |

### 3.3 Auditoria de acessibilidade e celular (390×844 e 1280×800, claro e escuro, axe) — `docs/audits/AUDITORIA_A11Y_MOBILE_*_2026-10-07.md`
| Cartão | Perfil | Entregável |
|---|---|---|
| **Y13** | workertestes | Auditoria A11Y e celular: Chat, Inbox e Teams |
| **Y14** | workertestes | Auditoria A11Y e celular: Contatos, CRM 360° e SalesView |
| **Y15** | workertestes | Auditoria A11Y e celular: Telefonia, E-mail, Multiplix e Talk X |
| **Y16** | workertestes | Auditoria A11Y e celular: Tarefas, Quadro, Dashboard e Analytics |
| **Y17** | workertestes | Auditoria A11Y e celular: Catálogo, Filas, SLA e War Room |
| **Y18** | workertestes | Auditoria A11Y e celular: Configurações, Administração, Notificações e estrutura geral |

### 3.4 Documentação dos módulos — `docs/design/MODULO_*.md` (telefonia e e-mail já têm documentos)
| Cartão | Perfil | Entregável |
|---|---|---|
| **Y19** | vera | Documentação do módulo: Inbox, Chat e Teams |
| **Y20** | vera | Documentação do módulo: Contatos, CRM 360° e SalesView |
| **Y21** | vera | Documentação do módulo: Tarefas, Quadro, Dashboard e Analytics |
| **Y22** | vera | Documentação do módulo: Catálogo, Filas, SLA e War Room |
| **Y23** | vera | Documentação do módulo: Multiplix, Talk X, Configurações, Notificações e Segurança |

### 3.5 Revisão de segurança em leitura — `docs/audits/SEGURANCA_*_2026-10-07.md`; **Y29 faz o mapa de todas as saídas de informação** contra a regra do dono
| Cartão | Perfil | Entregável |
|---|---|---|
| **Y24** | workersql | Segurança (leitura): regras de acesso de contatos, mensagens e atribuição |
| **Y25** | workersql | Segurança (leitura): regras de acesso de tarefas, notas, propostas, e-mail, ligações e analytics |
| **Y26** | workersql | Segurança (leitura): funções SECURITY DEFINER, grants e buckets de storage |
| **Y27** | edgar | Segurança (leitura): Edge Functions |
| **Y28** | workerauth | Segurança (leitura): front-end (XSS, chaves, PII em log, consultas amplas) |
| **Y29** | workerauth | Segurança (leitura): mapa de TODAS as saídas de informação do sistema |

## 4. Formato dos relatórios
Achado = ID (A11Y-<grupo>-NN ou SEC-<grupo>-NN), severidade **P0** (explorável/bloqueia uso), **P1**, **P2**, **P3**, evidência (arquivo:linha ou seletor), passos/cenário, correção sugerida e esforço (P/M/G). O relatório termina com tabela-resumo e a lista do que foi verificado sem problema.

## 5. Depois dos relatórios (tratamento programado — nada fica para depois)
O painel de pendências do Claude (`~/arquitetura-v2/pendencias/pendencias.py`) avisa quando os relatórios estiverem integrados. O Claude então: (a) lê cada relatório; (b) **segurança P0/P1: avisa o dono na hora** e abre cartão de correção com plano commitado; (c) acessibilidade/celular e demais achados P0–P2: abre cartões de correção agrupados por tela e arquivo (um plano commitado por grupo, com as regras permanentes); (d) bugs `it.fails` e `test.fixme` dos cartões de teste viram cartões de correção; (e) P3 vão para uma lista de melhoria contínua no próprio plano. Nenhuma correção é aplicada em produção sem passar pelo fluxo normal (integrador, lote, PR, aprovação do dono).

## 6. Estado de execução
_A preencher._ 29 cartões criados em 07/10/2026.
