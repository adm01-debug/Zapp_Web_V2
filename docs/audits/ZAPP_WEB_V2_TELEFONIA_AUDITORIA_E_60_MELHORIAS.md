# ZAPP WEB V2 — Auditoria e relação de melhorias do módulo de Telefonia

**Data de referência:** 26/09/2026  
**Repositório:** `adm01-debug/Zapp_Web_V2`  
**Revisão fixada:** `c660ff963a474138d7cdfd04b6545e4a21776d5a` (`main` consultada no início da análise).  
**Natureza:** análise estática de código, integrações encontradas, migrations e testes. Não foram executados testes, chamadas telefônicas, consultas ao banco de produção ou alterações de código/configuração. A presença de uma migration não prova que ela esteja aplicada ao ambiente ativo.

## Objetivo de produto

Central pessoal para o usuário consultar suas ligações recebidas e realizadas, por VoIP e WhatsApp, iniciar/receber chamadas e retomar o atendimento. O módulo do operador não terá configurações administrativas. A identificação visual de um canal não comprova suporte de áudio.

## Como interpretar a relação

Os **60 itens** são propostas de trabalho, não 60 falhas reproduzidas. Há correções derivadas diretamente do código, riscos inferidos de fluxos assíncronos, integrações obrigatórias para o escopo solicitado, validações e evoluções opcionais. Cada item distingue sua base, proposta, critério de aceite e dependência.

**P0:** pré-requisito para homologar a operação ou confiar em seus dados/acessos.  
**P1:** necessário para consolidar a experiência, a capacidade operacional e a manutenção.  
**P2:** evolução opcional; depende de aprovação e de suporte real.  
Distribuição: **32 P0, 26 P1 e 2 P2**. Prioridade não é estimativa de prazo.

## Achados principais

1. **Histórico limitado e indicadores da amostra.** A tela consulta somente os últimos 50 registros e calcula totais/média nesse array. A mesma tela não define escopo explícito de agente ou período. [S01]
2. **RLS já existe no repositório.** Uma migration substitui a leitura aberta por chamadas próprias ou acesso admin/supervisor. Não é correto afirmar ausência de isolamento apenas pela consulta da tela; a implementação efetiva precisa ser verificada no banco. [S13]
3. **WhatsApp: evento e registro não equivalem a áudio.** A trilha encontrada recebe eventos Evolution e chama uma RPC; `useCalls` persiste registros; `CallDialog` usa estado local. Esses arquivos não demonstram uma sessão WhatsApp de áudio ponta a ponta. [S04][S05][S11]
4. **Escolha de canal se perde no contato.** `ContactHeaderSection` recebe o tipo mas abre o mesmo diálogo. A busca por `start-voip-call` encontrou o emissor, não um consumidor. A conclusão fica restrita à trilha consultada. [S08][S09]
5. **Identidade recebida não é reaproveitada.** A RPC inclui `call_id` no metadado da notificação; o listener usa `notification.id`, e abrir o diálogo faz outro `insert`. Isso cria um caminho de duplicação/fragmentação do mesmo atendimento. [S04][S05][S07][S12]
6. **Atender/recusar e timeout precisam ser conectados à sessão.** O primeiro Atender só abre diálogo, Recusar apenas dispensa o alerta, e o timeout de 30 s não distingue toque de atendimento. O risco de desaparecer a interface após atendimento decorre da leitura do fluxo, não de um ensaio realizado. [S05][S06]
7. **Estados e duração não compartilham um contrato.** A UI traduz completed/ongoing, mas outras trilhas usam ended/answered. O timer SIP começa no atendimento, enquanto a duração persistida usa início de discagem. `ended` isoladamente não prova conversa atendida. [S01][S02][S04][S12]
8. **Encerramento e salvamento têm riscos verificáveis.** `hangUp` redefine idle antes de confirmação; `Terminated` usa esse estado para escolher o resultado. O `insert` de log SIP não verifica o campo error, e o registro acontece apenas no final. [S02]
9. **Gravação não está implementada pela existência de um botão.** O switch autoRecord é estado local e o botão condicionado a recording_url não tem handler na tela. A disponibilidade do arquivo deve ser comprovada por integração real. [S01][S02]
10. **Sessão SIP e recebimento precisam evoluir.** O motor é local à view, a trilha usa apenas Inviter de saída e a reconexão mantém timeouts sem handle de cancelamento. A sessão precisa sobreviver à navegação com limpeza deliberada ao encerrar. [S01][S02][S03][S17][S18]
11. **Notas e autoria podem ser sobrescritas por eventos.** O upsert da RPC reaplica agent_id baseado no dono atual do contato e sobrescreve notes com descrição automática. É necessário separar atribuição histórica e anotação humana. [S12]
12. **Parte dos testes não testa a proteção descrita.** O arquivo de lacunas usa expect(true).toBe(true). Existem também testes de comportamento do hook; portanto, a conclusão não é que todos os testes sejam inválidos. Nenhum teste foi executado nesta análise. [S15][S16]

## Bases que devem ser preservadas

Reaproveitar o SIP de saída, os controles efetivos de mídia/DTMF, a persistência de notas, a policy de chamadas próprias, o mecanismo de notificação dirigido ao usuário, a identidade idempotente por conexão/evento e os tokens do projeto. Já existem migrations de índices simples nas FKs de calls; avaliar índices compostos exige medir a consulta, não recriar índices às cegas. [S02][S04][S07][S12][S13][S14][S20]

## Estrutura de interface proposta

Cabeçalho compacto: Telefonia, contexto Minhas ligações, período e disponibilidade independente por canal. Resumo: total, realizadas, recebidas, perdidas recebidas e duração média de conversa. Corpo: histórico em tabela com busca/filtros e painel lateral de nova ligação/chamada ativa/detalhe. A seleção do canal de saída não deve ser alterada pelo filtro do histórico. Durante navegação por outros módulos, uma barra de chamada ativa mantém contato, canal, tempo, mute e encerrar.

Na primeira versão, não inserir botões de espera, transferência, conferência, vídeo, transcrição ou resumo de IA sem comprovação de capacidade. O projeto solicitado exige os dois canais de áudio; suas integrações não devem ser simuladas. Gravação é condicionada a suporte e política efetiva, não a um estado local.

## Relação consolidada

### A. Produto, layout e usabilidade

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-001 | P1 | UX | Telefonia como central pessoal |
| TEL-002 | P0 | Escopo | Retirar configurações da tela operacional |
| TEL-003 | P1 | UX | Aproveitar a largura do desktop |
| TEL-004 | P1 | UX | Histórico e painel contextual lado a lado |
| TEL-005 | P1 | UX | Resumo compacto com escopo explícito |
| TEL-006 | P1 | UX | Tabela de chamadas identificável |
| TEL-007 | P1 | UX | Detalhe de chamada sem perder a lista |
| TEL-008 | P1 | UX | Linguagem operacional em vez de diagnóstico técnico |
| TEL-009 | P1 | UX | Estados vazios, erro e carregamento distintos |
| TEL-010 | P1 | UX | Coerência visual e acessibilidade |

### B. Histórico, identidade e indicadores

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-011 | P0 | Regra de acesso | Minhas ligações como escopo explícito |
| TEL-012 | P1 | Correção funcional | Histórico completo com paginação |
| TEL-013 | P1 | Evolução | Busca contextual |
| TEL-014 | P1 | Evolução | Filtros independentes |
| TEL-015 | P0 | Correção de dados | Totais e médias fora da página |
| TEL-016 | P0 | Correção de dados | Separar espera e tempo de conversa |
| TEL-017 | P0 | Correção de contrato | Unificar estados e resultados |
| TEL-018 | P0 | Contrato de domínio | Canal explícito, diferente de transporte |
| TEL-019 | P1 | Integridade | Preservar identidade da ligação |
| TEL-020 | P0 | Integridade | Associação segura de telefone |
| TEL-021 | P0 | Integridade | Uma identidade por chamada |
| TEL-022 | P0 | Roteamento e autoria | Distinguir destino, responsável e atendente |

### C. Motor VoIP, sessão e dispositivos

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-023 | P0 | Integração obrigatória | Recebimento SIP real |
| TEL-024 | P0 | Arquitetura | Sessão persistente entre módulos |
| TEL-025 | P0 | Concorrência | Discar e encerrar sem corridas |
| TEL-026 | P0 | Correção de estado | Resultado correto no encerramento |
| TEL-027 | P0 | Integração operacional | Disponibilidade real por canal |
| TEL-028 | P0 | Resiliência | Reconexão com ciclo de vida controlado |
| TEL-029 | P1 | Usabilidade operacional | Permissões e dispositivos de áudio |
| TEL-030 | P0 | Integração de mídia | Mute e saída de áudio efetivos |
| TEL-031 | P1 | Operação | Teclado e DTMF contextuais |
| TEL-032 | P0 | Persistência | Registro durável e erro explícito |

### D. WhatsApp e integração com o atendimento

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-033 | P0 | Integração obrigatória | Definir e homologar o transporte WhatsApp |
| TEL-034 | P0 | Arquitetura | Adaptador de chamadas WhatsApp |
| TEL-035 | P0 | Validação de capacidade | Elegibilidade e autorização para ligar |
| TEL-036 | P0 | Correção funcional | Click-to-call com canal preservado |
| TEL-037 | P0 | Contexto e autorização | Linha de origem correta |
| TEL-038 | P0 | Correção funcional | Atender uma única vez |
| TEL-039 | P0 | Correção funcional | Recusar não é ocultar alerta |
| TEL-040 | P0 | Correção funcional | Timeout e término sincronizados |
| TEL-041 | P0 | Integridade de eventos | Ciclo completo no webhook |
| TEL-042 | P1 | Concorrência | Conflitos entre chamadas e abas |

### E. Gravações, anotações e continuidade

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-043 | P1 | Integração condicional | Gravação como capacidade comprovada |
| TEL-044 | P1 | Correção funcional | Acesso autorizado à gravação |
| TEL-045 | P1 | UX | Player utilizável e seguro durante atendimento |
| TEL-046 | P1 | Correção e reaproveitamento | Anotações com confirmação de salvamento |
| TEL-047 | P1 | Reaproveitamento | Contexto de contato e empresa |
| TEL-048 | P2 | Evolução opcional | Retorno como ação rastreável |
| TEL-049 | P1 | Reaproveitamento | Histórico consistente entre contato e telefonia |
| TEL-050 | P2 | Evolução opcional | Exportação do recorte pessoal |

### F. Segurança, qualidade e implantação

| ID | Prioridade | Natureza | Melhoria |
|---|---|---|---|
| TEL-051 | P0 | Autorização operacional | Provisionamento vinculado ao usuário |
| TEL-052 | P0 | Validação de segurança | Provar RLS e acesso à mídia no ambiente |
| TEL-053 | P0 | Correção de testes | Trocar asserções tautológicas por testes reais |
| TEL-054 | P0 | Teste | Cobrir ciclo SIP e corridas |
| TEL-055 | P0 | Homologação | Verificar áudio e eventos ponta a ponta |
| TEL-056 | P1 | Teste e desempenho | Contratos do histórico e das métricas |
| TEL-057 | P1 | Teste de interface | Validar todos os estados e tamanhos |
| TEL-058 | P1 | Observabilidade | Diagnóstico correlacionado sem expor conteúdo |
| TEL-059 | P0 | Compatibilidade | Planejar evolução do contrato sem reescrever histórico |
| TEL-060 | P1 | Entrega | Ativação controlada e regressão |

## Especificação dos 60 itens

### TEL-001 — Telefonia como central pessoal

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** A tela inicia no discador e se apresenta como VoIP & Chamadas.

**Melhoria proposta:** Usar Telefonia / Minhas ligações; tornar o histórico o conteúdo inicial e manter discagem acessível.

**Critério de aceite:** Abrir o módulo mostra as ligações do usuário, sem exigir troca de aba para consultar sua atividade.

**Dependências:** TEL-011, TEL-012.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-002 — Retirar configurações da tela operacional

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P0  
**Natureza:** Escopo

**Base observada:** Servidor, usuário SIP, porta e gravação automática são controles da tela atual.

**Melhoria proposta:** Remover aba, formulário, switches e instruções de configuração administrativa; consumir configuração autorizada sem expô-la como editor.

**Critério de aceite:** Nenhum controle de servidor, senha, porta ou provisionamento aparece no módulo do operador, inclusive nos estados de erro.

**Dependências:** TEL-027, TEL-051.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-003 — Aproveitar a largura do desktop

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** VoIPPanel usa max-w-4xl; voip não está no conjunto de gutters compactos consultado.

**Melhoria proposta:** Adotar largura útil fluida, com ajuste local de margem e proporções sem alterar indiscriminadamente os demais módulos.

**Critério de aceite:** Em 1920×1080 e 1366×768 não há rolagem horizontal da página nem grandes vazios laterais; controles essenciais permanecem acessíveis.

**Dependências:** TEL-057.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/pages/ViewRouter.tsx).

### TEL-004 — Histórico e painel contextual lado a lado

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** Discador e histórico estão em abas que se excluem.

**Melhoria proposta:** Criar lista principal e painel lateral que alterna entre nova ligação, chamada ativa e detalhe; não empilhar todos em altura excessiva.

**Critério de aceite:** Consultar histórico não interrompe uma chamada e o painel sempre explicita em qual modo está.

**Dependências:** TEL-024.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-005 — Resumo compacto com escopo explícito

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** Os cinco KPIs são calculados sobre a lista carregada e não indicam período.

**Melhoria proposta:** Mostrar período e usuário; reduzir altura dos cards e manter números, rótulos e contexto alinhados.

**Critério de aceite:** Usuário consegue identificar período e escopo de cada indicador; mudar de página não muda os totais.

**Dependências:** TEL-015, TEL-016.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-006 — Tabela de chamadas identificável

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** As linhas atuais priorizam Chamada recebida/realizada, sem nome, telefone ou canal exibidos como colunas.

**Melhoria proposta:** Mostrar contato/número, canal, direção, resultado, data/hora, duração e ações pertinentes.

**Critério de aceite:** Cada linha permite identificar quem ligou, por qual canal e qual foi o resultado, inclusive sem contato cadastrado.

**Dependências:** TEL-017, TEL-018, TEL-019.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-007 — Detalhe de chamada sem perder a lista

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** Não há painel de inspeção de registro na tela principal.

**Melhoria proposta:** Adicionar detalhe contextual com identificação, horários, resultado, notas e gravação quando disponível.

**Critério de aceite:** Abrir e fechar o detalhe preserva filtros, página e seleção; selecionar um registro nunca disca automaticamente.

**Dependências:** TEL-021, TEL-043, TEL-046.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-008 — Linguagem operacional em vez de diagnóstico técnico

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** A tela e os erros instruem o usuário sobre SIP e segredo no Supabase.

**Melhoria proposta:** Usar mensagens como Telefone indisponível, Reconectando e Microfone bloqueado; manter diagnóstico detalhado fora dessa interface.

**Critério de aceite:** Toda indisponibilidade informa impacto e ação possível sem expor campos administrativos ou segredo.

**Dependências:** TEL-027, TEL-029, TEL-058.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-009 — Estados vazios, erro e carregamento distintos

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** A consulta entrega isLoading e lista padrão vazia, sem apresentação específica do erro.

**Melhoria proposta:** Distinguir primeira utilização, busca sem resultado, erro ao carregar, conexão indisponível e informação ainda desconhecida.

**Critério de aceite:** Falha de consulta não é apresentada como Nenhuma chamada; há recuperação sem perder contexto.

**Dependências:** TEL-012, TEL-014.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-010 — Coerência visual e acessibilidade

**Frente:** A. Produto, layout e usabilidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** O projeto já oferece tokens de fontes, raios e cores; o módulo usa componentes compartilhados.

**Melhoria proposta:** Reutilizar os tokens e componentes; prever foco, rótulos de ícones, contraste, navegação por teclado e redução de movimento.

**Critério de aceite:** Status não depende só de cor; todos os controles têm nome acessível e foco visível; não são introduzidas fontes ou paletas globais paralelas.

**Dependências:** TEL-057.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S20](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/styles/tokens.css).

### TEL-011 — Minhas ligações como escopo explícito

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Regra de acesso

**Base observada:** Há policy para agente ou admin/supervisor, mas a consulta da tela não filtra o agente e a chave de cache é genérica.

**Melhoria proposta:** Resolver profiles.id do usuário e aplicar o escopo operacional na consulta, no cache e nos agregados; manter RLS como proteção efetiva.

**Critério de aceite:** Agente A não lê B; admin na tela pessoal vê apenas seu recorte; visão gerencial permanece separada e autorizada.

**Dependências:** TEL-052.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260317223223_c85cceeb-728c-476f-af90-92e9ba976a7a.sql).

### TEL-012 — Histórico completo com paginação

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P1  
**Natureza:** Correção funcional

**Base observada:** A consulta possui limit(50) sem acesso ao restante.

**Melhoria proposta:** Paginar no servidor e ordenar de forma estável, incluindo desempate por id; preservar filtros entre páginas.

**Critério de aceite:** Uma chamada anterior à quinquagésima é acessível; mudanças de página não omitem nem duplicam itens com o mesmo horário.

**Dependências:** TEL-011, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-013 — Busca contextual

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P1  
**Natureza:** Evolução

**Base observada:** A tela não oferece busca por contato ou telefone.

**Melhoria proposta:** Pesquisar nome e número normalizado; incluir empresa apenas quando existir vínculo e permissão; não buscar só a página carregada.

**Critério de aceite:** Uma chamada antiga é localizada por número com ou sem máscara; busca não amplia o escopo autorizado.

**Dependências:** TEL-012, TEL-019, TEL-020.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-014 — Filtros independentes

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P1  
**Natureza:** Evolução

**Base observada:** Não há filtros operacionais de canal, direção, resultado e período.

**Melhoria proposta:** Combinar Todos/VoIP/WhatsApp, recebidas/realizadas, resultado e período; manter seletor de canal de discagem independente.

**Critério de aceite:** Filtrar o histórico por WhatsApp não muda silenciosamente o canal da próxima ligação.

**Dependências:** TEL-017, TEL-018.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-015 — Totais e médias fora da página

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Correção de dados

**Base observada:** callStats usa calls.length e o array limitado a 50 registros.

**Melhoria proposta:** Calcular agregados do universo autorizado no período; definir visivelmente se busca/filtros também afetam os cards.

**Critério de aceite:** Os KPIs são idênticos nas páginas 1 e 2 do mesmo recorte; total corresponde às tentativas de entrada e saída, sem somar perdidas novamente.

**Dependências:** TEL-011, TEL-012, TEL-016, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-016 — Separar espera e tempo de conversa

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Correção de dados

**Base observada:** Timer SIP começa em Established; duração persistida usa início de discagem até momento do registro/fim.

**Melhoria proposta:** Distinguir início, atendimento, término e duração de conversa; usar timestamps/eventos confiáveis e apresentação mm:ss ou hh:mm:ss.

**Critério de aceite:** Teste com 20 s tocando + 120 s de conversa mostra conversa de 02:00; null não vira zero e 20 s não vira 0min.

**Dependências:** TEL-017, TEL-032, TEL-041.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-017 — Unificar estados e resultados

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Correção de contrato

**Base observada:** UI usa completed/ongoing, hook usa ended/answered e o contrato da RPC também admite busy/failed.

**Melhoria proposta:** Criar tradução canônica entre estados do transporte, estado persistido e resultado apresentado; preservar o motivo original.

**Critério de aceite:** Nenhuma etiqueta técnica em inglês aparece por falta de mapeamento; ended sem evidência de atendimento não é automaticamente Concluída.

**Dependências:** TEL-026, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-018 — Canal explícito, diferente de transporte

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Contrato de domínio

**Base observada:** Canal não é um atributo explícito da interface Call da tela; whatsapp_connection_id é opcional em outra trilha.

**Melhoria proposta:** Modelar canal de negócio e origem/transportador separadamente; não inferir VoIP apenas pela ausência de conexão WhatsApp.

**Critério de aceite:** Legado sem evidência aparece como Não identificado; uma futura chamada WhatsApp por SIP continua classificada como WhatsApp.

**Dependências:** TEL-033, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-019 — Preservar identidade da ligação

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P1  
**Natureza:** Integridade

**Base observada:** useCalls recebe nome e telefone, mas não os persiste; SIP guarda número dentro de notes.

**Melhoria proposta:** Definir snapshot mínimo autorizado de número/nome ou metadado equivalente para não depender exclusivamente de contato atual.

**Critério de aceite:** Contato removido, renomeado ou sem cadastro não transforma a chamada histórica em registro inidentificável; acesso continua sujeito à política.

**Dependências:** TEL-059, TEL-052.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-020 — Associação segura de telefone

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Integridade

**Base observada:** findContactByPhone mistura igualdade e sufixo dos últimos oito dígitos com limit(1).

**Melhoria proposta:** Priorizar normalização e correspondência exata; tratar ambiguidade e contexto autorizado antes de vincular um contato.

**Critério de aceite:** Dois números com DDDs diferentes e mesmo sufixo não são associados arbitrariamente; ambiguidade fica explícita.

**Dependências:** TEL-019.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-021 — Uma identidade por chamada

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Integridade

**Base observada:** RPC já gera call_id, mas listener usa notification.id e CallDialog cria outra chamada ao abrir.

**Melhoria proposta:** Transportar call_id existente do evento até a interface; tornar criação e atualização idempotentes nos dois canais.

**Critério de aceite:** O mesmo evento, o ato de atender e uma reabertura do painel resultam em um único registro; chamadas legítimas subsequentes continuam distintas.

**Dependências:** TEL-032, TEL-038, TEL-041.

**Fontes:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S07](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useIncomingCallListener.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-022 — Distinguir destino, responsável e atendente

**Frente:** B. Histórico, identidade e indicadores  
**Prioridade:** P0  
**Natureza:** Roteamento e autoria

**Base observada:** RPC deriva agent_id de contacts.assigned_to e pode regravá-lo em conflito; só notifica se houver responsável.

**Melhoria proposta:** Definir atribuição por ramal/conexão e registrar quem efetivamente atendeu; preservar autoria histórica e tratar chamadas de desconhecidos.

**Critério de aceite:** Trocar o dono do contato não reatribui silenciosamente chamada antiga; chamada para uma linha autorizada não some só por faltar dono na carteira.

**Dependências:** TEL-023, TEL-037, TEL-041, TEL-052.

**Fontes:** [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-023 — Recebimento SIP real

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Integração obrigatória

**Base observada:** A trilha SIP consultada usa Inviter para saída e não instala handler de Invitation/onInvite.

**Melhoria proposta:** Implementar recebimento, aceite, recusa, cancelamento remoto e mídia no mesmo controlador.

**Critério de aceite:** Uma chamada real para o ramal aparece, é atendida em um clique e tem áudio bidirecional e histórico correto.

**Dependências:** Provisionamento do servidor e TEL-024.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts).

### TEL-024 — Sessão persistente entre módulos

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Arquitetura

**Base observada:** useSipClient é instanciado dentro de VoIPPanel; as views são desmontadas na navegação.

**Melhoria proposta:** Manter controlador de chamada em nível persistente e separar a sessão das telas; oferecer barra compacta durante navegação.

**Critério de aceite:** Ir para Chat ou Contatos mantém áudio, mute, duração e botão de encerrar da mesma chamada, sem novo registro SIP.

**Dependências:** TEL-027, TEL-028, TEL-042.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/pages/ViewRouter.tsx); [S18](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/providers/AppProviders.tsx); [S19](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/App.tsx).

### TEL-025 — Discar e encerrar sem corridas

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Concorrência

**Base observada:** sessionRef só recebe o Inviter após await invite(); transições assíncronas e botões podem se sobrepor.

**Melhoria proposta:** Armazenar identidade da sessão no começo, serializar comandos e validar transições; impedir dupla discagem sem bloquear cancelamento.

**Critério de aceite:** Clique duplo, cancelamento durante invite pendente e encerramento repetido não criam segunda chamada nem deixam sessão órfã.

**Dependências:** TEL-024, TEL-054.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-026 — Resultado correto no encerramento

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Correção de estado

**Base observada:** hangUp redefine idle enquanto Terminated decide ended/missed pelo estado corrente.

**Melhoria proposta:** Registrar se houve atendimento e a causa de término independentemente do estado transitório da interface.

**Critério de aceite:** Desligamento local e remoto após atendimento têm resultado consistente; ocupado, recusa, falha e não atendimento não são todos Perdida.

**Dependências:** TEL-017, TEL-025, TEL-054.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-027 — Disponibilidade real por canal

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Integração operacional

**Base observada:** A tela exige Conectar SIP e mantém parâmetros técnicos locais; registro não verifica todas as condições de chamada.

**Melhoria proposta:** Consumir provisionamento autorizado e mostrar separadamente disponibilidade de canal, sessão e microfone; reconectar quando cabível.

**Critério de aceite:** VoIP pronto não implica WhatsApp pronto; nenhuma indicação Disponível é um valor fixo do layout.

**Dependências:** TEL-029, TEL-035, TEL-051.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-028 — Reconexão com ciclo de vida controlado

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Resiliência

**Base observada:** Reconexão usa setTimeout sem guardar/cancelar o handle; conecta um novo UserAgent por tentativa.

**Melhoria proposta:** Cancelar tentativas ao sair/deslogar/desconectar, evitar agentes duplicados e definir recuperação de sessão perdida sem rediscagem automática.

**Critério de aceite:** Queda de rede e reconexão manual não deixam timers reativando sessão encerrada; restaurar conexão nunca realiza nova ligação por conta própria.

**Dependências:** TEL-024, TEL-054.

**Fontes:** [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts).

### TEL-029 — Permissões e dispositivos de áudio

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P1  
**Natureza:** Usabilidade operacional

**Base observada:** O fluxo SIP solicita áudio ao criar a sessão; não há diagnóstico operacional dedicado na tela.

**Melhoria proposta:** Tratar microfone negado, inexistente, ocupado ou desconectado; oferecer orientação e escolha de dispositivo somente quando suportada.

**Critério de aceite:** Falha de microfone é identificável antes ou durante a tentativa; ajuste operacional não expõe servidor/credenciais.

**Dependências:** Homologação de navegador.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-030 — Mute e saída de áudio efetivos

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Integração de mídia

**Base observada:** SIP atua nas tracks; o diálogo genérico muda booleanos locais de mute/alto-falante.

**Melhoria proposta:** Encaminhar controles para o transporte ativo e confirmar o estado efetivo; não compartilhar apenas o desenho dos botões.

**Critério de aceite:** Teste externo comprova interrupção de envio de voz ao silenciar e restauração ao ativar; interface reflete o estado real.

**Dependências:** TEL-024, TEL-034, TEL-055.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx).

### TEL-031 — Teclado e DTMF contextuais

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P1  
**Natureza:** Operação

**Base observada:** SIP dispõe de sendDTMF com verificação de sessão estabelecida.

**Melhoria proposta:** Separar entrada de número antes da chamada dos tons durante a conversa; respeitar foco em anotações e disponibilidade do transporte.

**Critério de aceite:** Navegar uma URA funciona durante a sessão; digitar em notas não envia tons; cancelamento não depende de teclado numérico.

**Dependências:** TEL-024, TEL-054.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-032 — Registro durável e erro explícito

**Frente:** C. Motor VoIP, sessão e dispositivos  
**Prioridade:** P0  
**Natureza:** Persistência

**Base observada:** Saída SIP grava apenas no final e ignora o campo error do retorno de insert.

**Melhoria proposta:** Registrar tentativa e atualizar a mesma identidade; verificar erro do banco, reconciliar eventos e repetir somente gravações idempotentes.

**Critério de aceite:** Falha de persistência não passa como sucesso; fechar a aba não é a única fonte de evidência; retry não refaz uma chamada telefônica.

**Dependências:** TEL-021, TEL-058, TEL-059.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-033 — Definir e homologar o transporte WhatsApp

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Integração obrigatória

**Base observada:** Trilha encontrada registra eventos Evolution e CRUD, não demonstra áudio WhatsApp ponta a ponta.

**Melhoria proposta:** Definir a rota/provedor que realmente permite originar e receber áudio, com matriz de capacidades e homologação por conexão.

**Critério de aceite:** WhatsApp só é apresentado como operacional após chamada de entrada e saída reais com áudio bidirecional; evento não conta como mídia.

**Dependências:** Decisão de integração fora do layout administrativo.

**Fontes:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts).

### TEL-034 — Adaptador de chamadas WhatsApp

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Arquitetura

**Base observada:** O diálogo genérico não seleciona transporte e useCalls só persiste dados.

**Melhoria proposta:** Conectar iniciar/atender/recusar/encerrar/mute a um adaptador específico, compartilhando o contrato de sessão com VoIP.

**Critério de aceite:** A mesma UI produz comandos no provedor correto e estados são confirmados por eventos reais.

**Dependências:** TEL-017, TEL-018, TEL-024, TEL-033.

**Fontes:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx).

### TEL-035 — Elegibilidade e autorização para ligar

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Validação de capacidade

**Base observada:** Não há verificação de capacidade de Calling na trilha de diálogo consultada.

**Melhoria proposta:** Consultar suporte e autorização exigidos pela integração adotada; mostrar impedimento e solicitação de autorização quando esse fluxo existir.

**Critério de aceite:** Botão de ligar é habilitado somente quando o canal e a autorização necessários estão válidos; não há falha silenciosa após um estado fictício de disponibilidade.

**Dependências:** TEL-033; regras específicas do provedor.

**Fontes:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts).

### TEL-036 — Click-to-call com canal preservado

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Correção funcional

**Base observada:** ContactHeaderSection ignora o tipo recebido; ContactActionButtons emite start-voip-call, sem consumidor identificado na busca.

**Melhoria proposta:** Unificar entrada a partir de Chat, Contatos e Histórico com payload explícito de contato, número, canal e conexão.

**Critério de aceite:** Selecionar VoIP chama o fluxo VoIP e selecionar WhatsApp chama o WhatsApp; abrir intenção não dispara ligação sem ação do usuário.

**Dependências:** TEL-024, TEL-034.

**Fontes:** [S08](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactHeaderSection.tsx); [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactActionButtons.tsx); [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-037 — Linha de origem correta

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Contexto e autorização

**Base observada:** whatsappConnectionId pode não ser repassado pelo diálogo de contato; o destino depende de identificação de contato.

**Melhoria proposta:** Resolver e manter a linha autorizada para a operação; exibir nome/número de origem operacional quando necessário, sem campos técnicos.

**Critério de aceite:** Retornar ligação não usa outra conexão por coincidência de número; usuário nunca recebe credencial de conexão não autorizada.

**Dependências:** TEL-011, TEL-018, TEL-022, TEL-051.

**Fontes:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S08](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactHeaderSection.tsx); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-038 — Atender uma única vez

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Correção funcional

**Base observada:** O primeiro Atender apenas abre outro diálogo em ringing; o callback externo é vazio.

**Melhoria proposta:** Uma ação envia aceite ao transporte e transita para conectando/ativa conforme confirmação; reaproveitar o registro recebido.

**Critério de aceite:** Não é necessário clicar Atender duas vezes; demora ou erro de aceite aparecem corretamente.

**Dependências:** TEL-021, TEL-023, TEL-034.

**Fontes:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/IncomingCallAlert.tsx).

### TEL-039 — Recusar não é ocultar alerta

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Correção funcional

**Base observada:** handleDecline chama apenas dismissCall().

**Melhoria proposta:** Distinguir ocultar notificação de recusar no provedor, persistindo o motivo e respeitando suporte do canal.

**Critério de aceite:** O chamador recebe a recusa quando suportada; histórico registra o resultado e não mantém chamada tocando indevidamente.

**Dependências:** TEL-017, TEL-034.

**Fontes:** [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/IncomingCallAlert.tsx).

### TEL-040 — Timeout e término sincronizados

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Correção funcional

**Base observada:** Timeout de 30 s permanece vinculado ao incomingCall, sem checar se o diálogo já entrou em atendimento.

**Melhoria proposta:** Cancelar timeout de toque ao atender; atualizar alerta e sessão com cancelamento/término real; validar estado antes de atender notificação antiga.

**Critério de aceite:** Uma chamada atendida continua visível após 30 s; cancelamento pelo chamador remove o alerta sem gravar atendimento fictício.

**Dependências:** TEL-038, TEL-041, TEL-055.

**Fontes:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/IncomingCallAlert.tsx); [S07](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useIncomingCallListener.ts).

### TEL-041 — Ciclo completo no webhook

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P0  
**Natureza:** Integridade de eventos

**Base observada:** handleCallEvent usa RPC que grava inbound, horários de processamento e identidade do provedor quando disponível.

**Melhoria proposta:** Validar direção real e identidade de chamada; tratar eventos fora de ordem, timestamps/duração do provedor e origem externa quando o fornecedor permitir.

**Critério de aceite:** Entradas e saídas suportadas aparecem uma vez, no horário correto; atrasos e reenvios não alteram autoria nem retornam estado final para tocando.

**Dependências:** TEL-016, TEL-021, TEL-022, TEL-033.

**Fontes:** [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-042 — Conflitos entre chamadas e abas

**Frente:** D. WhatsApp e integração com o atendimento  
**Prioridade:** P1  
**Natureza:** Concorrência

**Base observada:** Listener mantém uma chamada recebida por vez; controlador SIP local não coordena outras abas.

**Melhoria proposta:** Definir tratamento de segunda chamada e liderança de sessão entre abas, sem sobrescrever a atual nem assumir suporte a espera.

**Critério de aceite:** Duas chamadas próximas permanecem distintas e uma chamada não é atendida simultaneamente por duas abas.

**Dependências:** TEL-024, TEL-033.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S07](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useIncomingCallListener.ts).

### TEL-043 — Gravação como capacidade comprovada

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** Integração condicional

**Base observada:** autoRecord é estado de UI e gravação não é produzida pelo fluxo SIP analisado.

**Melhoria proposta:** Integrar artefato real do provedor e estados disponível/processando/ausente/falhou; política permanece administrativa.

**Critério de aceite:** Nenhuma etiqueta Gravando ou Ouvir é exibida como confirmação sem evento ou mídia real; canais sem suporte ficam explícitos.

**Dependências:** Suporte do provedor, TEL-033, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts).

### TEL-044 — Acesso autorizado à gravação

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** Correção funcional

**Base observada:** O botão condicionado a recording_url não tem ação implementada na tela.

**Melhoria proposta:** Ligar player à mídia realmente existente e validar autorização no acesso, usando URL temporária ou mecanismo equivalente quando aplicável.

**Critério de aceite:** Quem não pode acessar a chamada também não acessa sua gravação; expiração da URL tem recuperação clara.

**Dependências:** TEL-043, TEL-052.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-045 — Player utilizável e seguro durante atendimento

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** UX

**Base observada:** Há apenas ícone de arquivo de áudio na listagem.

**Melhoria proposta:** Mostrar progresso, duração, play/pause e estado de erro; oferecer seek/velocidade conforme suporte e evitar reprodução automática.

**Critério de aceite:** Só uma gravação toca por vez; reprodução não começa ao selecionar linha e não interfere silenciosamente no áudio da ligação ativa.

**Dependências:** TEL-044.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-046 — Anotações com confirmação de salvamento

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** Correção e reaproveitamento

**Base observada:** addCallNotes já existe, mas a tela só exibe notes; RPC de eventos pode sobrescrever notes com descrição de voz/vídeo.

**Melhoria proposta:** Expor edição autorizada, salvamento e recuperação; separar anotação humana de metadado automático do provedor.

**Critério de aceite:** Reenvio de webhook não apaga nota do atendente; interface informa salvando/salvo/erro sem falso sucesso.

**Dependências:** TEL-021, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql).

### TEL-047 — Contexto de contato e empresa

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** Reaproveitamento

**Base observada:** O projeto já consulta dados enriquecidos de contato/empresa no atendimento, fora da tela de telefonia.

**Melhoria proposta:** Reutilizar visualização contextual e links existentes, respeitando permissão e relacionamento efetivo.

**Critério de aceite:** Abrir Chat/Contato não encerra sessão; dados de empresa só aparecem quando disponíveis e autorizados.

**Dependências:** TEL-019, TEL-024.

**Fontes:** [S08](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactHeaderSection.tsx); [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-048 — Retorno como ação rastreável

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P2  
**Natureza:** Evolução opcional

**Base observada:** A tela não oferece fluxo próprio de acompanhamento de ligação perdida.

**Melhoria proposta:** Priorizar retornar a ligação e, se aprovado, vincular tarefa/lembrete existente; não inventar outro gerenciador de agenda.

**Critério de aceite:** Criar lembrete exige ação do usuário; uma nova tentativa sem resposta não transforma automaticamente a ligação perdida em resolvida.

**Dependências:** Integração com tarefas a validar; TEL-036.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-049 — Histórico consistente entre contato e telefonia

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P1  
**Natureza:** Reaproveitamento

**Base observada:** useCalls tem getContactCalls, separado da consulta da tela.

**Melhoria proposta:** Compartilhar tradução de estados, identidade e critérios de acesso entre detalhe do contato e módulo.

**Critério de aceite:** A mesma chamada tem o mesmo canal, resultado, duração e notas nos dois lugares.

**Dependências:** TEL-011, TEL-017, TEL-021.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts).

### TEL-050 — Exportação do recorte pessoal

**Frente:** E. Gravações, anotações e continuidade  
**Prioridade:** P2  
**Natureza:** Evolução opcional

**Base observada:** Não há exportação de chamadas no painel consultado.

**Melhoria proposta:** Adicionar exportação somente se aprovada, do mesmo universo autorizado e filtrado, com geração paginada e proteção dos dados.

**Critério de aceite:** Exportação não se limita aos 50 itens e não inclui outras pessoas, segredos ou links públicos permanentes de gravação.

**Dependências:** TEL-011, TEL-012, TEL-052.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx).

### TEL-051 — Provisionamento vinculado ao usuário

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Autorização operacional

**Base observada:** Endpoint valida JWT/perfil ativo, mas retorna um SIP_PASSWORD comum; tela mantém usuário/servidor locais.

**Melhoria proposta:** Verificar permissão e vínculo de linha/ramal; preferir credencial individual, delegada ou temporária conforme provedor, sem abrir editor administrativo ao agente.

**Critério de aceite:** Usuário sem autorização não obtém acesso de telefonia; revogação encerra/revalida a sessão; segredo não vai para logs ou histórico.

**Dependências:** Definição de provisionamento do administrador.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-052 — Provar RLS e acesso à mídia no ambiente

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Validação de segurança

**Base observada:** Existe migration de chamadas próprias/admin; isso não comprova por si só aplicação e políticas efetivas no banco atual.

**Melhoria proposta:** Inspecionar políticas efetivas e testar perfis A/B/admin, chamadas antigas, sem dono, notas, agregados, exportação e gravações.

**Critério de aceite:** Matriz de acesso passa no servidor, inclusive por requisição direta; nenhuma policy permissiva residual amplia acesso inesperadamente.

**Dependências:** Ambiente autorizado de homologação; TEL-011.

**Fontes:** [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260317223223_c85cceeb-728c-476f-af90-92e9ba976a7a.sql); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-053 — Trocar asserções tautológicas por testes reais

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Correção de testes

**Base observada:** voip-security-gaps.test.ts usa expect(true).toBe(true), sem executar as garantias descritas.

**Melhoria proposta:** Mover inventário de lacunas para documentação e escrever asserções de comportamento, retornos, mídia, banco e autorização.

**Critério de aceite:** Quebrar intencionalmente a proteção sob teste faz o teste falhar; remover configurações exige atualizar contrato antigo de três abas.

**Dependências:** TEL-054, TEL-055, TEL-056.

**Fontes:** [S15](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/__tests__/voip-security-gaps.test.ts); [S16](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/__tests__/useSipClient.test.ts); [S21](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/__tests__/VoIPPanel.test.tsx).

### TEL-054 — Cobrir ciclo SIP e corridas

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Teste

**Base observada:** Alguns testes de hangUp e DTMF não constroem sessão ativa e não verificam efeito de mídia/resultado persistido.

**Melhoria proposta:** Testar chamadas estabelecidas, encerramento local/remoto, invite pendente, rede, timers, mute, DTMF e limpeza com mocks de protocolo observáveis.

**Critério de aceite:** As duas ordens hangUp/Terminated produzem um único registro correto e nenhum timer/sessão remanescente após logout.

**Dependências:** TEL-025, TEL-026, TEL-028.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts); [S16](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/__tests__/useSipClient.test.ts).

### TEL-055 — Verificar áudio e eventos ponta a ponta

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Homologação

**Base observada:** CRUD, modal e webhook isolados não demonstram chamada real.

**Melhoria proposta:** Homologar os dois canais com chamador/receptor reais, áudio de ida/volta, recusa, cancelamento, duração, identidade e navegação.

**Critério de aceite:** Evidência reproduzível comprova mídia e persistência; atender não duplica registros e a sessão não desaparece após 30 segundos.

**Dependências:** TEL-023, TEL-033, TEL-038, TEL-040.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/IncomingCallAlert.tsx); [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts).

### TEL-056 — Contratos do histórico e das métricas

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P1  
**Natureza:** Teste e desempenho

**Base observada:** A consulta atual é pequena e as migrations já preveem índices simples de FKs.

**Melhoria proposta:** Testar paginação, joins opcionais, estados legados, agregados e fusos; medir consultas e avaliar índice composto só com necessidade demonstrada.

**Critério de aceite:** Volume representativo mantém consulta aceitável, sem N+1; não se afirma falta de índice sem verificar os índices existentes.

**Dependências:** TEL-012, TEL-015, TEL-059.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260827120000_fk_indexes_backfill.sql).

### TEL-057 — Validar todos os estados e tamanhos

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P1  
**Natureza:** Teste de interface

**Base observada:** A proposta altera densidade e organização; atual tela usa animações e componentes compartilhados.

**Melhoria proposta:** Validar 1920×1080, 1366×768 e largura reduzida; teclado, leitor de tela, foco, tooltips, redução de movimento e mensagens longas.

**Critério de aceite:** É possível discar, atender, recusar, silenciar, encerrar e consultar histórico sem sobreposição ou controles inacessíveis.

**Dependências:** TEL-003, TEL-010.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/pages/ViewRouter.tsx); [S20](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/styles/tokens.css).

### TEL-058 — Diagnóstico correlacionado sem expor conteúdo

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P1  
**Natureza:** Observabilidade

**Base observada:** Há logger em SIP e auditoria no diálogo, mas trilhas não usam uma identidade comum de sessão/provedor.

**Melhoria proposta:** Correlacionar call_id, identificador do provedor e etapa de falha; separar métricas de transporte, mídia e persistência; minimizar dados pessoais e segredos.

**Critério de aceite:** Suporte identifica se falhou conexão, áudio ou salvamento sem ler senha, áudio ou anotações; não mostra qualidade Excelente sem medição.

**Dependências:** TEL-021, TEL-032.

**Fontes:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts); [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts); [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx); [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts).

### TEL-059 — Planejar evolução do contrato sem reescrever histórico

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P0  
**Natureza:** Compatibilidade

**Base observada:** Novas capacidades exigem verificar schema efetivo; dados atuais admitem valores nulos e diferentes estados.

**Melhoria proposta:** Definir alterações aditivas e adapters; inspecionar banco autorizado antes de migration; preencher legado somente com evidência e preservar identidades.

**Critério de aceite:** Registros antigos continuam acessíveis; ausência de canal/atendimento/gravação não é convertida arbitrariamente em dado falso.

**Dependências:** Validação do banco e TEL-017, TEL-018, TEL-019, TEL-046.

**Fontes:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx); [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts); [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql); [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260317223223_c85cceeb-728c-476f-af90-92e9ba976a7a.sql).

### TEL-060 — Ativação controlada e regressão

**Frente:** F. Segurança, qualidade e implantação  
**Prioridade:** P1  
**Natureza:** Entrega

**Base observada:** O módulo se integra às rotas, ao chat, ao alerta global e a dados compartilhados.

**Melhoria proposta:** Separar entregas por contrato/dados, motor, tela e complementos; revisar diferenças, testes, homologação e reversão antes de publicar.

**Critério de aceite:** Uma mudança na Telefonia não altera regras de Chat/Contatos nem libera canal ainda não homologado; implantação pode ser revertida com compatibilidade de dados.

**Dependências:** Itens P0, testes de integração e autorização de implantação.

**Fontes:** [S08](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactHeaderSection.tsx); [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/pages/ViewRouter.tsx); [S18](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/providers/AppProviders.tsx); [S19](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/App.tsx).

## Ordem de execução sugerida

**Etapa 1 — Contrato e evidência.** Definir capacidades reais dos dois canais, identificação da chamada, atribuição de agente, estados, duração e matriz de acesso. Validar o schema aplicado e a relação com o provedor. Nenhuma migration deve ser executada apenas com base neste documento.

**Etapa 2 — Motor e persistência.** Corrigir roteamento de canal, entrada SIP, aceite/recusa WhatsApp, duplicidade, encerramento, gravação de eventos e sessão persistente. A aparência de uma chamada não pode preceder a validação do transporte.

**Etapa 3 — Experiência operacional.** Remover configurações da view; implementar o layout amplo, histórico completo, filtros, busca, indicadores corretos, detalhes e estado de chamada ativa.

**Etapa 4 — Continuidade e qualidade.** Integrar gravação comprovada, notas, atalhos de contexto e os testes de acessibilidade/desempenho. Retornos assistidos e exportação são opcionais. Homologar os dois canais antes da ativação para os usuários.

## Critérios de liberação

A mesma chamada tem uma identidade do provedor ao histórico; o canal selecionado é respeitado; recebimento e saída têm áudio real; o estado não depende apenas do clique; atendida não desaparece após 30 s; navegar não remove o controle da sessão; desligar não muda uma conversa atendida para perdida; salvar erro não fica silencioso; histórico excede 50 linhas; métricas não dependem da página; agente A não acessa B; nenhuma configuração administrativa aparece; nenhuma gravação/qualidade/transcrição é prometida sem dado real.

## Limites e pendências de verificação

Este relatório não certifica o estado do deploy Vercel, credenciais, provedor SIP, capacidade comercial/técnica do fornecedor WhatsApp, configuração do navegador, áudio real, publicações Realtime ou políticas efetivamente aplicadas no banco. Não foram medidos latência, carga ou cobertura de testes. Os critérios acima indicam como comprovar essas condições. Riscos assíncronos precisam de reprodução em homologação; não são apresentados como incidentes de produção constatados.

## Referências técnicas externas consultadas

A documentação oficial do SIP.js descreve recebimento via delegate/onInvite e aceite/recusa na Invitation: https://sipjs.com/guides/receive-call/ . A referência reforça o que falta conectar no fluxo consultado; não comprova a configuração do servidor do projeto.

A documentação da Twilio sobre WhatsApp Business Calling descreve chamadas como integração de voz, com requisitos próprios e autorização para iniciação pela empresa: https://www.twilio.com/docs/voice/whatsapp-business-calling . É uma referência de outro provedor, não uma afirmação de que o ZAPP use Twilio nem de que os mesmos limites se apliquem à integração Evolution. O acesso direto à documentação Meta tentado nesta análise retornou indisponibilidade/rate limit; limites numéricos não foram importados para o backlog.

## Mapa de fontes do repositório

Todas as referências abaixo são fixadas na revisão indicada no início. Leitura de código e migrations não equivale a execução ou comprovação de aplicação no banco.

- **S01** — [src/components/calls/VoIPPanel.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/VoIPPanel.tsx). Tela, consulta limitada a 50 registros, KPIs, estados, configurações e botão de gravação.
- **S02** — [src/hooks/communication/useSipClient.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useSipClient.ts). Saída SIP, mídia, registro, temporização, associação de contato, encerramento e limpeza.
- **S03** — [src/hooks/sip/useSipConnection.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/sip/useSipConnection.ts). Registro SIP, reconexão e encerramento da conexão.
- **S04** — [src/hooks/communication/useCalls.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useCalls.ts). CRUD de chamadas, agente, estados e anotações; não é um transporte de áudio.
- **S05** — [src/components/calls/CallDialog.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/CallDialog.tsx). Criação de registro ao abrir, estado local, ações de atender/finalizar e controles visuais.
- **S06** — [src/components/calls/IncomingCallAlert.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/IncomingCallAlert.tsx). Alerta recebido, abertura do diálogo, dispensa local e timeout de 30 segundos.
- **S07** — [src/hooks/communication/useIncomingCallListener.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/communication/useIncomingCallListener.ts). Notificações por usuário, deduplicação e diferença entre notification.id e call_id.
- **S08** — [src/components/inbox/contact-details/ContactHeaderSection.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactHeaderSection.tsx). Callback de chamada descarta a escolha de canal e abre o mesmo diálogo.
- **S09** — [src/components/inbox/contact-details/ContactActionButtons.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/inbox/contact-details/ContactActionButtons.tsx). Escolha WhatsApp/VoIP e emissão de start-voip-call.
- **S10** — [supabase/functions/get-sip-password/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/get-sip-password/index.ts). JWT, perfil ativo, rate limit e retorno de segredo SIP comum.
- **S11** — [supabase/functions/_shared/evolution-webhook-handlers.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/functions/_shared/evolution-webhook-handlers.ts). Trecho handleCallEvent: contato, normalização e persistência por RPC.
- **S12** — [supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260922220000_atomic_call_and_sentiment_notifications.sql). Identidade por conexão/evento, RPC atômica, atribuição de agente, estado e notificação.
- **S13** — [supabase/migrations/20260317223223_c85cceeb-728c-476f-af90-92e9ba976a7a.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260317223223_c85cceeb-728c-476f-af90-92e9ba976a7a.sql). Policy de leitura de chamadas próprias ou de administrador/supervisor.
- **S14** — [supabase/migrations/20260827120000_fk_indexes_backfill.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/supabase/migrations/20260827120000_fk_indexes_backfill.sql). Índices já previstos para agent_id, contact_id e whatsapp_connection_id.
- **S15** — [src/components/calls/__tests__/voip-security-gaps.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/__tests__/voip-security-gaps.test.ts). Casos documentais que usam expect(true).toBe(true).
- **S16** — [src/hooks/__tests__/useSipClient.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/hooks/__tests__/useSipClient.test.ts). Testes do hook e limites de cobertura dos cenários críticos.
- **S17** — [src/pages/ViewRouter.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/pages/ViewRouter.tsx). Rota voip, troca de views, permissões de rota e gutters compactos.
- **S18** — [src/providers/AppProviders.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/providers/AppProviders.tsx). Providers globais inspecionados; ponto de integração para controlador persistente.
- **S19** — [src/App.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/App.tsx). Alerta global de chamadas em overlay e relação com as rotas.
- **S20** — [src/styles/tokens.css](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/styles/tokens.css). Tokens atuais de fontes, raios, cores e escala visual.
- **S21** — [src/components/calls/__tests__/VoIPPanel.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/c660ff963a474138d7cdfd04b6545e4a21776d5a/src/components/calls/__tests__/VoIPPanel.test.tsx). Testes existentes da tela, inclusive contrato antigo de três abas.
