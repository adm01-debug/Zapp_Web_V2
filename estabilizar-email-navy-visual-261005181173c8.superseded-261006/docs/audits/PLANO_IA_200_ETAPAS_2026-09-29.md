# Plano de correções e evolução da IA — ZAPP WEB V2

**Versão:** 1.0 • **Data da análise:** 29/09/2026 • **Etapas:** 200 em 20 blocos.

**Estado de todas as etapas:** planejadas, não autorizadas para execução. Este documento não autoriza commits, migrations, alterações de banco, chamadas pagas, ativação de bots ou deploy.

**Repositório:** adm01-debug/Zapp_Web_V2. **Referência analisada:** `5209b8a43730cf8e620295bc0a84850737bf9631`, confirmada na leitura de `main` desta sessão. A revisão inclui os achados do levantamento anterior no mesmo commit e a ampliação para contratos, memória, dados manuais e inteligência externa do CRM. A execução futura precisa confrontar esta referência com o HEAD então vigente.

## Escopo e limites

Análise estática de componentes, hooks, funções e contratos relacionados a texto, contexto, conhecimento, classificação, CRM, voz, multimodalidade, custos e automação. Nenhum teste do projeto, chamada paga ao provedor, alteração no GitHub, consulta ou alteração ao banco operacional, nem deploy foi executado para produzir o plano. O estado das credenciais, aplicação de migrations, funcionamento de serviços externos e disponibilidade em produção não foi certificado.

“Nova” significa proposta de ampliação não demonstrada nos fluxos examinados; não é afirmação de inexistência em outros repositórios, branches ou serviços externos. Memória de conversa, score manual, briefing, melhores horários e outros dados externos já possuem representações no projeto e devem ser reaproveitados. Propostas envolvendo catálogo, pedidos, CRM, TalkX ou Multiplix dependem de fonte e integração autorizadas; ausência de dados exige estado indisponível, não simulação apresentada como real.

## Prioridade e dependências

P0: exposição, ação indevida ou integridade crítica; P1: confiabilidade e operação; P2: evolução de produto; P3: experimento condicionado a benefício medido. A prioridade específica de um achado pode ser elevada após reprodução.

A ordem numérica organiza o backlog, não impõe aguardar as 200 etapas para corrigir risco crítico. As dependências listadas são pré-condições entre blocos, não autorização. Contenções urgentes, sobretudo 009, 011–020 e 029, devem ter lote mínimo próprio, com testes e revisão. Os demais itens podem ser paralelizados quando seus contratos estiverem definidos. As verificações do bloco 19 consolidam testes que já acompanham cada etapa, não adiam testes para o fim.

Cada mudança requer responsável, escopo, teste, revisão e evidência. Cada bloco exige um checkpoint. Alterações em banco-fonte, CRM externo ou outro projeto dependem de autorização separada do respectivo responsável. Não duplicar filas, tabelas ou módulos já cobertos por outros planos.

## Como interpretar os tipos

- **C:** correção de inconsistência identificada estaticamente; não afirma reprodução em produção.
- **V:** verificação pendente ou dependência externa.
- **M:** melhoria de funcionalidade existente.
- **N:** capacidade nova proposta ou extensão não demonstrada.

## Achados que motivam a priorização

O código contém roteamento configurável e chamadas fixas ao gateway em paralelo; normalizações divergentes de sentimento/prioridade; resultados de backend não aplicados nos painéis de churn/classificação; perda de campos no histórico; fontes gerenciais insuficientes; quota não atômica; registro incompleto de streaming; classificações de áudio por nome/URL; webhook ElevenLabs em modo de observação; e ausência de autorização por objeto no handler de download de áudio examinado. A exposição efetiva exige confrontar gateway, configuração e permissões em execução.

Na ampliação desta revisão, o contrato de análise mostrou máximo de 200 mensagens e não declara vários campos enviados pelo frontend. O painel de memória não reinicializa seu estado quando a consulta do novo contato não retorna registro, risco de reaproveitamento indevido quando a instância é reutilizada. O CRM externo já fornece estruturas de briefing, rapport, horários, churn e DISC; métodos de cálculo e estado real desse serviço não foram auditados. Fontes e caminhos estão associados a cada bloco abaixo.

## Critério global de aceite

Cumprir a entrega e o critério específico de cada etapa; preservar permissões, atendimento humano e rastreabilidade; não mascarar falhas como sucesso. Metas numéricas deste plano são objetivos propostos para homologação, não resultados medidos. Zero falhas em um conjunto de testes não constitui garantia universal. Custos, SLOs, qualidade e recusas indevidas devem ser avaliados por capacidade e contexto.

## Bloco 01 — Escopo, evidências e regras de execução (001–010)

**Prioridade:** P1 — preparação; contenções urgentes podem ser antecipadas.

**Dependências entre blocos:** Nenhuma; início após autorização de execução.

**Escopo técnico:** Repositório inteiro, rotas, hooks, Edge Functions, contratos, migrations e testes; integrações externas apenas dentro do escopo autorizado.

**Base de código/documentação:** [src/components/inbox/chat/ChatToolPanels.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/chat/ChatToolPanels.tsx); [src/hooks/crm/useContactIntelligence.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/crm/useContactIntelligence.ts); [supabase/config.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/config.toml).

### IA-001 — [V] Fixar a referência técnica

Registrar commit, branch, árvore e data da futura execução; comparar a referência com esta auditoria antes de alterar qualquer arquivo.

**Aceite:** Diferenças posteriores ao commit analisado identificadas e incorporadas ao escopo.

### IA-002 — [V] Mapear o fluxo completo

Relacionar cada botão de IA à rota, hook, função, provedor, tabela, permissão, efeito e teste; incluir CRM externo, mídia, voz e campanhas.

**Aceite:** Nenhum recurso inventariado fica sem origem, consumidor e responsável técnico identificados.

### IA-003 — [V] Abrir registro rastreável de achados

Classificar ocorrências como defeito demonstrado no código, risco a reproduzir, dependência externa ou proposta; anexar caminho e reprodução esperada.

**Aceite:** Cada correção tem hipótese, impacto, evidência e teste de regressão definidos.

### IA-004 — [M] Definir matriz de autorização

Formalizar capacidades por perfil, fila, departamento, conexão, contato e organização, caso exista esse escopo; separar leitura, sugestão, alteração e envio.

**Aceite:** A matriz contém cenários permitidos e negados, sem presumir multitenancy inexistente.

### IA-005 — [M] Estabelecer metas de qualidade

Propor metas iniciais: todos os testes críticos de autorização aprovados, nenhuma ação duplicada nos ensaios e pelo menos 95% de respostas factuais sustentadas no conjunto revisado.

**Aceite:** Metas identificadas como propostas; latência e custo recebem limites após medição de referência.

### IA-006 — [M] Classificar a natureza da inteligência

Distinguir IA generativa, cálculo determinístico, entrada manual e dado importado; eliminar equivalência indevida entre score, probabilidade, sentimento estimado e CSAT respondido.

**Aceite:** Cada indicador e recurso possui definição, origem e limitação visíveis.

### IA-007 — [V] Reaproveitar infraestrutura existente

Inspecionar fila de mensagens, leases, outbox, autenticação e componentes existentes antes de propor novas estruturas; integrar planos paralelos de TalkX e Multiplix.

**Aceite:** Decisões de reutilização documentadas; nenhuma fila concorrente ou tabela duplicada criada sem justificativa.

### IA-008 — [M] Organizar entregas revisáveis

Dividir trabalho em PRs por problema, com revisor, dependências e rollback; preservar verificações existentes e separar migrations, interface e integrações quando necessário.

**Aceite:** Cada PR pode ser revisado e revertido sem depender de um lote de 200 mudanças.

### IA-009 — [M] Definir desligamento seguro

Planejar flags por capacidade, bot e provedor, com desligamento imediato de efeitos automáticos e manutenção do atendimento manual.

**Aceite:** Desativar IA bloqueia novas ações no servidor e não impede conversa humana.

### IA-010 — [M] Preparar ambiente de ensaio

Definir dados sintéticos de Vendas, Compras, Logística, Financeiro, SAC e RH, com usuários de permissões diferentes e credenciais exclusivas de homologação.

**Aceite:** Ensaios não enviam mensagens reais nem acessam bancos-fonte ou dados pessoais desnecessários.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 02 — Autenticação, autorização e privacidade (011–020)

**Prioridade:** P0 — bloqueadora de exposição ou efeitos indevidos.

**Dependências entre blocos:** IA-001, IA-004, IA-010

**Escopo técnico:** ai-proxy, classify-*, voice-agent, ai-transcribe-audio, elevenlabs-webhook, adaptadores de provedores e ponte CRM.

**Base de código/documentação:** [supabase/functions/elevenlabs-webhook/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/elevenlabs-webhook/index.ts); [supabase/functions/ai-transcribe-audio/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-transcribe-audio/index.ts); [supabase/functions/_shared/ai-providers.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-providers.ts); [docs/crm-external-grants.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/docs/crm-external-grants.md).

### IA-011 — [C] Autenticar todas as entradas de IA

Padronizar identidade verificada em endpoints de usuário, inclusive voice-agent e classificadores; não aceitar chave pública como identidade pessoal.

**Aceite:** Requisições anônimas e sessões inválidas falham antes de consumir provedores ou consultar dados privados.

### IA-012 — [M] Separar identidades de serviço

Distinguir usuário, cron, webhook e worker; definir credenciais próprias, escopo mínimo, expiração e limites, sem liberar serviços de todo controle de consumo.

**Aceite:** Chamadas de serviço têm identidade auditável e não podem assumir permissões arbitrárias de usuário.

### IA-013 — [C] Tornar assinatura ElevenLabs obrigatória

Substituir o modo de observação por validação efetiva de assinatura, corpo original, timestamp e contrato do evento antes de qualquer efeito.

**Aceite:** Assinatura inválida, evento expirado ou repetido não causa nova gravação nem processamento.

### IA-014 — [C] Autorizar cada objeto de áudio

Vincular download e transcrição a mensagem, contato, conexão e objeto autorizado; validar posse e leitura antes de usar credencial privilegiada.

**Aceite:** Conhecer URL, bucket ou messageId de outro usuário não concede acesso ao áudio.

### IA-015 — [M] Distinguir leitura de alteração

Exigir autorização específica para persistir análise operacional, trocar fila, atualizar prioridade, criar tarefa ou enviar mensagem; leitura do contato não basta.

**Aceite:** Um perfil somente leitor recebe sugestões sem poder provocar mudanças indiretas.

### IA-016 — [M] Restringir destinos de rede

Validar endpoints, HTTPS, host, resolução DNS, redirecionamentos, portas, tempo e volume; bloquear redes privadas e destinos de metadados não autorizados.

**Aceite:** Testes de SSRF e redirecionamento não alcançam destinos fora da política de saída.

### IA-017 — [M] Restringir seleção de segredos

Permitir apenas nomes de secrets de provedores aprovados, vinculados a destinos autorizados; impedir configuração que encaminhe credenciais de infraestrutura a terceiros.

**Aceite:** Configuração, exportações, logs e respostas nunca revelam valores de credenciais.

### IA-018 — [V] Revisar o limite externo do CRM

Verificar com o responsável os grants e guards das RPCs externas documentadas; tratar documentação histórica como indício, não como prova do estado atual.

**Aceite:** Parecer de acesso obtido; nenhuma alteração no banco externo ou fonte ocorre sem autorização própria.

### IA-019 — [M] Minimizar dados enviados aos modelos

Aplicar listas permitidas por finalidade, proteção de notas internas e segregação de RH/Financeiro; mascarar dados quando a tarefa não exigir identificação.

**Aceite:** Prompts e telemetria de cada capacidade contêm somente dados autorizados e necessários.

### IA-020 — [M] Invalidar acessos e caches

Limpar resultados ao trocar usuário, contato, fila ou permissão; revalidar acesso no servidor ao abrir histórico, recuperar memória e executar ações pendentes.

**Aceite:** Revogação impede reutilizar conteúdo antigo por cache, exportação, busca ou ação em fila.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 03 — Contratos, integridade e persistência (021–030)

**Prioridade:** P0/P1 — integridade primeiro.

**Dependências entre blocos:** IA-002, IA-004, IA-011, IA-015

**Escopo técnico:** schemas.ts, conversation_analyses, contacts, ai_conversation_tags, ConversationMemoryPanel e tipos compartilhados.

**Base de código/documentação:** [supabase/functions/_shared/schemas.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/schemas.ts); [supabase/functions/ai-conversation-analysis/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-conversation-analysis/index.ts); [supabase/functions/ai-conversation-summary/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-conversation-summary/index.ts); [src/components/inbox/ConversationMemoryPanel.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ConversationMemoryPanel.tsx).

### IA-021 — [C] Unificar sentimento

Definir enum canônico, tradução apenas na interface e conversores explícitos para valores legados em português e inglês, preservando estado desconhecido.

**Aceite:** O mesmo sentimento mantém significado em análise, contato, churn, alerta e CRM.

### IA-022 — [C] Unificar prioridade e urgência

Separar urgência analítica de prioridade operacional e mapear baixa/media/alta/critica para um contrato comum, corrigindo a comparação inconsistente com critical.

**Aceite:** Valores inválidos não entram nas projeções; todos os consumidores passam na matriz de conversão.

### IA-023 — [C] Preservar zero e ausência

Substituir defaults numéricos indevidos; validar números finitos e faixas; diferenciar zero, ausência, erro e estimativa sem evidência.

**Aceite:** Sentimento zero continua zero, confiança zero não vira 70% e falta de dado não vira satisfação neutra.

### IA-024 — [C] Corrigir o contrato das mensagens

Alinhar id, remetente, tipo, data, período e versão do contexto entre frontend e backend; impor limites agregados de mensagens, texto e corpo.

**Aceite:** Campos necessários não desaparecem; entradas excedentes recebem tratamento explícito, não truncamento silencioso.

### IA-025 — [M] Validar toda saída do modelo

Criar schemas de resposta por capacidade e um envelope comum de execução, evidência, status e erro; validar também respostas de webhooks e agentes externos.

**Aceite:** JSON válido, porém com estrutura ou valores incorretos, é rejeitado antes de renderizar ou persistir.

### IA-026 — [C] Persistir a análise completa

Guardar departamento, relação, desempenho estimado, risco, oportunidade, fontes, versões e cobertura; preservar o que hoje se perde na normalização ou gravação.

**Aceite:** Abrir o histórico reproduz integralmente a análise originalmente aceita, inclusive campos opcionais.

### IA-027 — [M] Tornar gravações consistentes

Separar registro imutável da análise de projeções do contato; atualizar projeções de forma transacional e somente quando a versão e recência forem adequadas.

**Aceite:** Falha parcial e análise de período antigo não deixam prioridade ou sentimento atuais incoerentes.

### IA-028 — [C] Substituir etiquetas atomicamente

Trocar etiquetas geradas em uma operação transacional, preservar etiquetas humanas e tratar resultado vazio, falha de insert e concorrência.

**Aceite:** Erro intermediário não apaga classificações anteriores; resposta vazia válida remove apenas resultados obsoletos previstos.

### IA-029 — [C] Corrigir identidade da memória

Limpar estado ao mudar contato, tratar ausência de registro e erro separadamente, proteger requests antigos e impedir atualização por id de outro contato.

**Aceite:** Trocar de A com memória para B sem memória não exibe nem transfere a memória de A.

### IA-030 — [M] Migrar sem perda de compatibilidade

Preparar migrations incrementais, backfill em lotes, checks, índices, rollback e compatibilidade temporária com clientes antigos; preservar dados e referências originais.

**Aceite:** Ensaio de migração e reversão mantém contagens, vínculos, permissões e rastreabilidade.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 04 — Camada única de provedores e modelos (031–040)

**Prioridade:** P1 — arquitetura e comportamento consistente.

**Dependências entre blocos:** IA-011, IA-016, IA-017, IA-021, IA-025

**Escopo técnico:** ai-proxy, _shared/ai-providers.ts, _shared/ai-usage.ts, useAIProviders e consumidores de IA.

**Base de código/documentação:** [supabase/functions/ai-proxy/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-proxy/index.ts); [supabase/functions/_shared/ai-usage.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-usage.ts); [supabase/functions/_shared/ai-providers.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-providers.ts); [src/components/settings/ai-providers/useAIProviders.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/settings/ai-providers/useAIProviders.ts).

### IA-031 — [M] Criar roteamento central por capacidade

Definir serviço compartilhado de geração com contrato uniforme; manter endpoints públicos especializados e evitar encadear chamadas HTTP internas desnecessárias.

**Aceite:** Toda capacidade informa explicitamente finalidade, contexto autorizado e requisitos de modalidade.

### IA-032 — [C] Eliminar dependência fixa nas funções textuais

Migrar sugestões, melhoria de mensagem, resumo, análise, auto-tag e chatbot para o roteamento central, preservando seus contratos e testes.

**Aceite:** Trocar o provedor da finalidade altera todas as chamadas abrangidas, sem depender do gateway antigo.

### IA-033 — [M] Integrar caminhos secundários

Enquadrar classificadores e interpretação de voz na mesma política de roteamento; tratar STT, TTS e dados importados como modalidades distintas, não como chat textual.

**Aceite:** Não restam chamadas pagas desconhecidas ou fora da política documentada de provedores.

### IA-034 — [M] Resolver o padrão por finalidade

Definir seleção determinística de configuração ativa por finalidade e escopo; impedir múltiplos padrões conflitantes e explicitar indisponibilidade.

**Aceite:** A mesma requisição resolve a mesma configuração; ausência de padrão não produz escolha arbitrária.

### IA-035 — [C] Controlar o modelo no servidor

Retirar precedência irrestrita do modelo enviado pelo navegador; validar compatibilidade, permissão e versão aprovada, com substituições administrativas auditadas.

**Aceite:** Um cliente antigo não força modelo Gemini em um provedor incompatível.

### IA-036 — [M] Criar adaptadores com capacidades declaradas

Modelar suporte a texto, imagem, ferramentas, JSON estruturado, streaming, áudio e limites; normalizar provedores nativos e compatíveis sem prometer capacidades inexistentes.

**Aceite:** Testes de contrato demonstram cada capacidade anunciada; recursos incompatíveis falham claramente.

### IA-037 — [C] Corrigir composição dos prompts

Inserir política de sistema na posição e papel corretos, preservando mensagens existentes; separar instruções confiáveis de conteúdo recuperado e do usuário.

**Aceite:** Sistemas presentes fora da posição zero não substituem indevidamente a primeira mensagem.

### IA-038 — [C] Proteger campos reservados de configuração

Aplicar allowlist de parâmetros e cabeçalhos; impedir config e extra_body de sobrescrever identidade, mensagens, ferramentas, modelo ou política sem autorização.

**Aceite:** Configurações malformadas não alteram o contrato de segurança nem vazam headers ao corpo.

### IA-039 — [M] Tornar o fallback explícito e compatível

Autorizar fallback por capacidade, dados, provedor e orçamento; informar motivo e destino efetivo; impedir troca silenciosa para fornecedor não aprovado.

**Aceite:** A recuperação respeita privacidade e formato; teste de provedor não mascara falha com fallback.

### IA-040 — [C] Testar o provedor realmente escolhido

Fazer diagnóstico com destino fixo, modelo efetivo, autorização de teste e validação da resposta; distinguir chave ausente, quota, contrato e rede.

**Aceite:** Teste falho nunca aparece como sucesso do provedor original por resposta de outro serviço.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 05 — Execução resiliente, filas e controle de consumo (041–050)

**Prioridade:** P1 — com limites de segurança P0.

**Dependências entre blocos:** IA-025, IA-031

**Escopo técnico:** Guards, workers, execução de IA, outbox, logs, retry, cancelamento e infraestrutura existente de fila.

**Base de código/documentação:** [supabase/functions/_shared/ai-guards.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-guards.ts); [supabase/functions/_shared/ai-usage.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-usage.ts); [supabase/functions/_shared/ai-providers.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-providers.ts); [supabase/functions/ai-proxy/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-proxy/index.ts).

### IA-041 — [M] Aplicar prazos ponta a ponta

Definir timeout de conexão, resposta, leitura do corpo e execução total por capacidade; propagar cancelamento entre cliente, worker e provedor.

**Aceite:** Nenhuma tarefa permanece indefinidamente carregando após expirar seu prazo.

### IA-042 — [M] Limitar retentativas

Aplicar backoff com variação aleatória, limite global de tentativas e classificação de falhas; não repetir automaticamente erros permanentes ou efeitos de estado desconhecido.

**Aceite:** Queda de rede não causa tempestade de requisições nem reenvio cego ao cliente.

### IA-043 — [C] Distribuir o limite de requisições

Substituir dependência exclusiva de memória local por controle atômico compartilhado por usuário, organização quando existente, serviço e provedor.

**Aceite:** Vários workers simultâneos respeitam a mesma política e não multiplicam a capacidade permitida.

### IA-044 — [M] Reservar orçamento antes da chamada

Estimar e reservar consumo de forma atômica; liquidar uso real, liberar reservas não utilizadas e reconciliar execução interrompida.

**Aceite:** Chamadas paralelas não ultrapassam silenciosamente limites; valores estimados não são faturamento confirmado.

### IA-045 — [M] Usar jobs para operações longas

Reaproveitar infraestrutura de fila ou justificar extensão; incluir prioridade, lease, heartbeat, expiração e armazenamento persistente, escolhendo runtime adequado à duração.

**Aceite:** Reinício do processo não perde trabalhos aceitos nem executa duas vezes seus efeitos locais.

### IA-046 — [M] Padronizar estados da execução

Implementar queued, running, partial, succeeded, failed, cancelled e outcome_unknown, com transições válidas e terminalidade explícita.

**Aceite:** Interface, banco e worker apresentam o mesmo estado e não confundem parcial com concluído.

### IA-047 — [M] Tornar efeitos idempotentes

Vincular requisição e operação de negócio a chaves estáveis, constraints e outbox; reconciliar efeitos externos cuja confirmação não chegou.

**Aceite:** Repetir o mesmo pedido não duplica tarefa ou envio nos cenários de teste; não se presume exactly-once externo.

### IA-048 — [C] Cancelar resultados fora de contexto

Adotar identificadores de requisição e versão de contato/conversa; descartar respostas antigas no frontend e revalidar antes de efeitos no servidor.

**Aceite:** Troca de contato, período ou rascunho impede aplicar resposta de uma solicitação anterior.

### IA-049 — [C] Garantir persistência dos registros essenciais

Aguardar ledger crítico ou usar outbox durável; reservar waitUntil, quando suportado, para trabalho compatível com os limites do runtime.

**Aceite:** Encerramento da função não transforma consumo pago ou efeito operacional em registro perdido.

### IA-050 — [M] Abrir circuito e degradar honestamente

Suspender temporariamente provedores com falhas repetidas, limitar concorrência e preservar alternativas manuais; distinguir indisponibilidade de resultado vazio.

**Aceite:** Falha generalizada não paralisa o chat nem gera mensagens genéricas apresentadas como análise concluída.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 06 — Observabilidade, custos e resultados de negócio (051–060)

**Prioridade:** P1 — visibilidade operacional.

**Dependências entre blocos:** IA-041, IA-044, IA-049

**Escopo técnico:** ai_usage_logs, useAIUsageDashboard, AIProviderHealthPanel e métricas por capacidade.

**Base de código/documentação:** [src/hooks/analytics/useAIUsageDashboard.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/analytics/useAIUsageDashboard.ts); [src/components/settings/ai-providers/AIProviderHealthPanel.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/settings/ai-providers/AIProviderHealthPanel.tsx); [supabase/functions/_shared/ai-usage.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/ai-usage.ts).

### IA-051 — [M] Correlacionar toda execução

Propagar requestId, jobId, attemptId e identificador de operação entre interface, backend, worker e provedor, sem usar dado pessoal como identificador de log.

**Aceite:** Um incidente pode ser acompanhado ponta a ponta sem expor o conteúdo da conversa.

### IA-052 — [M] Registrar o que foi realmente usado

Gravar provedor, modelo efetivo, finalidade, versões, modalidade, latência, status e unidades consumidas; não inferir provedor apenas pela configuração padrão.

**Aceite:** Cada execução informa seu caminho efetivo, inclusive fallback e modalidade de áudio.

### IA-053 — [C] Contabilizar streaming e interrupções

Coletar uso também em streams, saídas parciais, cancelamentos e respostas sem metadados; representar consumo desconhecido ou estimado explicitamente.

**Aceite:** O caminho de streaming não fica ausente dos relatórios nem recebe custo zero por falta de dados.

### IA-054 — [C] Separar ação, tentativa e cobrança

Modelar uma ação do usuário com várias tentativas e consumos; definir quais eventos contam para quota, evitando dupla contagem por logs de fallback.

**Aceite:** Totais de ações, tentativas, falhas e consumo se reconciliam com a execução observada.

### IA-055 — [M] Versionar a tabela de custos

Associar preços, moeda, unidades e vigência a cada modelo/serviço, incluindo caracteres e segundos; prever conferência com extrato do provedor.

**Aceite:** Um relatório histórico usa a tarifa aplicável e diferencia estimativa interna de custo reconciliado.

### IA-056 — [C] Agregar o período completo no servidor

Substituir totais calculados sobre consultas limitadas por agregações autorizadas e paginação real; indicar filtros e cobertura.

**Aceite:** Períodos com mais de 1.000 registros mantêm totais corretos, sem depender da página visualizada.

### IA-057 — [C] Corrigir indicadores de saúde

Exibir sem dados quando não houver chamadas; medir amostra, janela, p50/p95, erros, disponibilidade e recuperação por fallback separadamente.

**Aceite:** Nenhum provedor recebe 100% de sucesso por ausência de observações.

### IA-058 — [M] Alertar sobre consumo anômalo

Projetar alertas por usuário, departamento e capacidade para aumento de gasto, erros e concorrência, com limiares e deduplicação.

**Aceite:** O futuro mecanismo alerta uma vez por incidente e permite bloquear apenas a capacidade afetada.

### IA-059 — [M] Reduzir conteúdo sensível em logs

Redigir tokens, prompts, trechos de conversa e payloads pessoais; definir acesso, retenção e captura excepcional autorizada para diagnóstico.

**Aceite:** Testes de telemetria não encontram segredos ou conteúdo pessoal desnecessário.

### IA-060 — [N] Medir utilidade da assistência

Medir aceitação, edição, retrabalho, erro factual e tempo até resposta; comparar grupos equivalentes sem atribuir causalidade apenas à adoção da IA.

**Aceite:** Painel separa uso da ferramenta de melhoria demonstrada e informa tamanho da amostra.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 07 — Visão, resumo e contexto verificável (061–070)

**Prioridade:** P1 — correção do núcleo conversacional.

**Dependências entre blocos:** IA-025, IA-026, IA-031, IA-048

**Escopo técnico:** AIConversationAssistant, ConversationSummary, PeriodFilterSelector, AnalysisTabs e funções de análise/resumo.

**Base de código/documentação:** [src/components/inbox/AIConversationAssistant.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/AIConversationAssistant.tsx); [src/components/inbox/ai-tools/PeriodFilterSelector.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ai-tools/PeriodFilterSelector.tsx); [supabase/functions/ai-conversation-analysis/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-conversation-analysis/index.ts); [supabase/functions/_shared/schemas.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/schemas.ts).

### IA-061 — [C] Unificar resumo e análise aprofundada

Reutilizar preparação de contexto, contrato e persistência, mantendo modos curto e aprofundado com saídas claramente definidas.

**Aceite:** Os dois modos não divergem em campos, prioridade, autorização e histórico.

### IA-062 — [C] Buscar o histórico do período selecionado

Resolver mensagens autorizadas no servidor por período e conversa, com paginação e ordenação estável, sem depender apenas do que está carregado no chat.

**Aceite:** Contagem e cobertura correspondem ao conjunto efetivamente analisado, não ao tamanho da tela.

### IA-063 — [C] Tratar conversas acima de 200 mensagens

Definir processamento por lotes ou seleção explícita com orçamento, evidência e consolidação; ajustar contrato frontend/backend de forma coordenada.

**Aceite:** Uma conversa longa não falha silenciosamente nem é apresentada como integral após truncamento.

### IA-064 — [M] Padronizar datas e sessões

Definir fuso, início/fim de dia, intervalos e regra de última interação; revalidar períodos com o relógio, sem depender indefinidamente de memoização.

**Aceite:** Testes em virada de dia e fronteiras de período produzem mensagens e rótulos coerentes.

### IA-065 — [M] Delimitar o contexto profissional

Informar departamento, papel do interlocutor, canal, conexão e atendimento; evitar fundir assuntos de compras, vendas ou RH só pelo mesmo contato.

**Aceite:** A análise identifica o contexto utilizado e mantém conversas de finalidade distinta separadas.

### IA-066 — [C] Calcular métricas temporais fora do modelo

Entregar timestamps e calcular espera, resposta e duração por código, com regras de expediente explícitas; usar IA apenas para interpretação permitida.

**Aceite:** Valores temporais reproduzem os eventos reais e não são estimativas inventadas pelo modelo.

### IA-067 — [N] Vincular conclusões a mensagens

Exigir evidência por resumo factual, objeção, compromisso, urgência e oportunidade, com identificadores verificados contra o contexto enviado.

**Aceite:** O usuário abre a mensagem que sustenta a conclusão; referências inexistentes são rejeitadas.

### IA-068 — [M] Distinguir estimativa de medida

Rotular sentimento, satisfação inferida e avaliação textual; remover falsa precisão e não usar esses dados isoladamente para decisões sobre colaboradores.

**Aceite:** CSAT respondido e estimado aparecem separados; incerteza e limitações ficam visíveis.

### IA-069 — [C] Liberar histórico sem nova geração

Permitir abrir, filtrar e comparar análises existentes sem pagar por outra chamada; recuperar todos os campos e apresentar data e contexto originais.

**Aceite:** Histórico fica disponível ao abrir o painel, mesmo sem análise criada na sessão atual.

### IA-070 — [M] Detectar análise desatualizada

Registrar fingerprint das mensagens, transcrições, fontes e versões; invalidar ou rotular resultado após edição, exclusão, novo conteúdo ou mudança de política.

**Aceite:** A interface não apresenta análise antiga como atualizada por simples mudança de horário.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 08 — Copilotos de escrita, objeções e seleção de mensagens (071–080)

**Prioridade:** P1/P2 — confiabilidade da assistência.

**Dependências entre blocos:** IA-025, IA-031, IA-048, IA-067

**Escopo técnico:** AISuggestions, AIRewriteButton, AIEnhanceButton, useObjectionDetector, useUniversityHelp, ToneSelector e AIResponseCard.

**Base de código/documentação:** [src/hooks/inbox/useObjectionDetector.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/inbox/useObjectionDetector.ts); [src/hooks/ui/useUniversityHelp.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/ui/useUniversityHelp.ts); [src/components/inbox/chat/AIRewriteButton.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/chat/AIRewriteButton.tsx); [supabase/functions/ai-suggest-reply/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-suggest-reply/index.ts).

### IA-071 — [M] Harmonizar modos de tom e edição

Criar taxonomia compartilhada que diferencie tom de concisão/detalhamento e preserve compatibilidade com as opções existentes.

**Aceite:** A mesma opção significa a mesma transformação em todos os pontos de entrada.

### IA-072 — [N] Comparar original e reescrita

Apresentar alterações destacadas, versão anterior e opção de desfazer; não obrigar repetir nome ou saudação em toda resposta.

**Aceite:** Usuário aprova a transformação e pode recuperar o texto original sem perda.

### IA-073 — [N] Proteger números e condições

Identificar preços, quantidades, datas, códigos e condições comerciais no texto original e verificar sua preservação na reescrita.

**Aceite:** Mudança factual não solicitada é bloqueada ou destacada para confirmação explícita.

### IA-074 — [N] Conferir promessas antes de sugerir

Checar afirmações de estoque, entrega, desconto e obrigação contra dados autorizados e regras vigentes; marcar o que depende de confirmação.

**Aceite:** Sugestões não transformam hipóteses em compromissos comerciais confirmados.

### IA-075 — [C] Recuperar conhecimento relevante nas sugestões

Usar busca autorizada por relevância no lugar da seleção fixa dos primeiros artigos publicados; preservar origem de notas e campos utilizados.

**Aceite:** A sugestão usa fontes pertinentes e não expõe notas internas indevidamente.

### IA-076 — [C] Tornar seleção de contexto transparente

Mostrar mensagens selecionadas, total real, filtros e limite; resolver inconsistência entre seleção oculta e visível ao alternar cliente/atendente.

**Aceite:** O texto enviado ao modelo corresponde exatamente ao conjunto que o usuário confirmou.

### IA-077 — [M] Analisar objeções no diálogo completo

Considerar ambas as partes, ordem temporal e respostas anteriores; distinguir objeção nova, negociação normal, dúvida e resistência já resolvida.

**Aceite:** Uma objeção superada não reaparece como bloqueio atual sem evidência nova.

### IA-078 — [N] Explicar a evidência da objeção

Vincular cada resistência e contra-argumento às mensagens de origem; tratar confiança do modelo como estimativa, não precisão estatística garantida.

**Aceite:** Usuário consegue verificar a objeção e contestá-la com registro de feedback.

### IA-079 — [C] Corrigir erros silenciosos das ferramentas

Tratar response.error, resposta vazia, JSON malformado, clipboard rejeitado e regeneração incompleta; preservar resultado anterior durante falhas.

**Aceite:** Erro não vira “nenhuma objeção”, cópia confirmada sem sucesso ou resposta desaparecida.

### IA-080 — [M] Separar gerar, usar, aprovar e enviar

Formalizar transições entre resposta gerada, rascunho inserido, aprovação e envio; validar contato, conteúdo e estado mais recente antes de cada efeito.

**Aceite:** Nenhum callback local anuncia entrega antes da confirmação apropriada do pipeline de mensagens.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 09 — Conhecimento corporativo e recuperação com evidências (081–090)

**Prioridade:** P2 — após os controles de acesso.

**Dependências entre blocos:** IA-019, IA-025, IA-031, IA-065

**Escopo técnico:** knowledge_base_articles, search_knowledge_base, sugestões, chatbot e fontes documentais autorizadas.

**Base de código/documentação:** [supabase/migrations/20260318134952_fa1e464a-2f91-42df-a9cd-3a5ead79c2ba.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/migrations/20260318134952_fa1e464a-2f91-42df-a9cd-3a5ead79c2ba.sql); [supabase/functions/chatbot-l1/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/chatbot-l1/index.ts); [supabase/functions/ai-suggest-reply/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-suggest-reply/index.ts).

### IA-081 — [M] Compartilhar a recuperação de conhecimento

Criar camada única que aplique finalidade e permissões antes da recuperação, reutilizada por copilotos, análises e chatbot.

**Aceite:** Nenhuma ferramenta ganha acesso mais amplo por escolher outro caminho de recuperação.

### IA-082 — [N] Versionar documentos e validade

Associar proprietário, departamento, versão, aprovação, vigência e política de acesso a cada fonte; distinguir rascunho de conteúdo utilizável.

**Aceite:** Documento vencido ou não aprovado não sustenta uma resposta operacional vigente.

### IA-083 — [N] Preparar ingestão rastreável

Extrair conteúdo permitido, dividir em trechos, preservar cabeçalhos, páginas e hashes, e evitar duplicatas; manter origem e licença/autorização de uso.

**Aceite:** Cada trecho recuperado pode ser associado ao documento e à versão original.

### IA-084 — [M] Melhorar a busca textual existente

Ajustar busca em português, termos técnicos, siglas e correspondências exatas de SKU, fornecedor e procedimento, usando um conjunto de consultas de referência.

**Aceite:** Busca lexical melhora relevância sem sacrificar identificadores exatos.

### IA-085 — [N] Avaliar busca vetorial antes de adotá-la

Testar embeddings em corpus autorizado contra a busca textual, considerando recuperação, custo, latência e isolamento; não assumir benefício automático.

**Aceite:** Adoção só ocorre se atingir o ganho acordado; alternativa lexical continua funcional.

### IA-086 — [N] Combinar recuperação e reordenação

Usar recuperação híbrida e reordenação somente quando justificadas pelos testes, limitando contexto, chamadas e dados compartilhados com fornecedores.

**Aceite:** O conjunto de fontes melhora a resposta dentro do orçamento e da política de privacidade.

### IA-087 — [N] Validar citações da resposta

Retornar IDs, versões e trechos verificáveis; conferir que cada referência pertence ao conjunto autorizado e realmente sustenta a afirmação.

**Aceite:** Título inventado pelo modelo não é aceito como citação válida.

### IA-088 — [N] Resolver políticas conflitantes

Aplicar precedência por vigência, departamento e aprovação; apresentar conflitos não resolvidos ao responsável, sem deixar o modelo escolher regra arbitrariamente.

**Aceite:** Políticas antigas ou contraditórias não geram orientação operacional silenciosamente incorreta.

### IA-089 — [M] Abster-se quando faltar fundamento

Diferenciar ausência de informação, busca sem resultado e falha de integração; solicitar o dado necessário ou encaminhar para revisão humana.

**Aceite:** Nenhum fallback transforma falta de evidência em resposta factual fabricada.

### IA-090 — [N] Revogar fontes em todas as camadas

Propagar exclusão, expiração e mudança de acesso a índices, caches, análises reutilizadas e memórias derivadas; revalidar na recuperação.

**Aceite:** Conteúdo revogado não reaparece por busca vetorial, histórico compartilhado ou resumo em cache.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 10 — Memória verificável, compromissos e continuidade (091–100)

**Prioridade:** P2 — evolução da memória existente.

**Dependências entre blocos:** IA-029, IA-065, IA-067, IA-090

**Escopo técnico:** ConversationMemoryPanel, conversation_memory, tarefas, timeline e vínculos de contato/empresa.

**Base de código/documentação:** [src/components/inbox/ConversationMemoryPanel.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ConversationMemoryPanel.tsx); [src/hooks/chat/useNextBestAction.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/chat/useNextBestAction.ts); [src/hooks/crm/useContactIntelligence.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/crm/useContactIntelligence.ts).

### IA-091 — [M] Preservar memória humana e sua origem

Manter fatos e notas manuais existentes, identificando autoria; separar informação declarada, hipótese da IA e fato confirmado por fonte operacional.

**Aceite:** Uma extração automática não sobrescreve memória humana nem transforma hipótese em fato aprovado.

### IA-092 — [N] Extrair fatos como propostas

Identificar produtos, quantidades, condições, contatos e prazos em mensagens autorizadas, produzindo sugestões estruturadas com evidência para revisão.

**Aceite:** Toda inclusão sugerida é rastreável e pode ser aceita, corrigida ou descartada.

### IA-093 — [N] Criar registro de compromissos

Estruturar quem prometeu, o quê, condição, prazo, responsável e situação; distinguir proposta, promessa confirmada, alteração e cancelamento.

**Aceite:** Compromissos pendentes não dependem de frases soltas sem responsável ou vencimento.

### IA-094 — [N] Transformar compromissos aprovados em tarefas

Criar rascunhos de tarefas vinculados à evidência, com deduplicação e estados compatíveis com o módulo atual.

**Aceite:** Aceitar duas vezes a mesma proposta não duplica tarefa; criação exige permissão e confirmação.

### IA-095 — [N] Detectar contradições ao longo do atendimento

Comparar novas mensagens com condições e fatos confirmados, destacando divergências de prazo, preço, quantidade e responsabilidade.

**Aceite:** O sistema mostra ambas as fontes e não resolve conflitos comerciais por conta própria.

### IA-096 — [N] Organizar memória por atendimento e assunto

Separar episódios, negociações e conexões dentro do mesmo contato, com referências cruzadas autorizadas quando houver continuidade real.

**Aceite:** Um problema antigo ou de outro departamento não contamina automaticamente a conversa atual.

### IA-097 — [N] Dar validade temporal à memória

Registrar vigência, substituição, correção e expiração; manter trilha de versões e permitir revisar fatos desatualizados.

**Aceite:** Resumos não perpetuam condições que já foram alteradas ou revogadas.

### IA-098 — [M] Resolver identidades com cautela

Priorizar vínculos canônicos de pessoa, empresa e conversa; tratar telefones compartilhados, duplicatas e múltiplas empresas como ambiguidade explícita.

**Aceite:** O sistema não funde históricos apenas por nome parecido ou telefone coincidente.

### IA-099 — [N] Aprender preferências profissionais autorizadas

Registrar preferências explícitas de canal, horário, tratamento e formato; oferecer controle e correção, sem explorar dados familiares ou inferir traços sensíveis.

**Aceite:** Personalização usa somente preferências autorizadas e não fabrica perfis psicológicos.

### IA-100 — [N] Gerar passagem de atendimento com evidências

Montar briefing de transferência com objetivo, fatos confirmados, pendências, promessas, últimas ações e acesso às mensagens de origem.

**Aceite:** O novo atendente recebe contexto autorizado e identifica claramente o que ainda não foi confirmado.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 11 — Classificação automática, filas e chatbot L1 (101–110)

**Prioridade:** P1/P2 — efeitos controlados.

**Dependências entre blocos:** IA-015, IA-025, IA-028, IA-047, IA-081

**Escopo técnico:** ai-auto-tag, chatbot-l1, filas, ownership da conversa e pipeline de envio/handoff.

**Base de código/documentação:** [supabase/functions/ai-auto-tag/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-auto-tag/index.ts); [supabase/functions/chatbot-l1/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/chatbot-l1/index.ts); [supabase/config.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/config.toml).

### IA-101 — [M] Governar etiquetas e categorias

Definir catálogo versionado, alias, etiquetas protegidas e revisão humana; distinguir classificação automática de etiqueta confirmada.

**Aceite:** O modelo não cria categorias operacionais arbitrárias nem remove classificação humana protegida.

### IA-102 — [M] Aplicar política determinística de roteamento

Validar fila ativa, vínculo permitido, finalidade e modo de automação; apresentar sugestão por padrão e executar apenas dentro da política aprovada.

**Aceite:** A resposta da IA não contorna permissões nem muda fila fora das regras administrativas.

### IA-103 — [N] Controlar escalonamento e retorno

Definir motivos objetivos, limites de transferência, destinatários e tratamento de indisponibilidade; registrar decisão e evitar ciclos entre filas.

**Aceite:** Conversa urgente tem destino auditável e não entra em repetição de escalonamentos.

### IA-104 — [C] Isolar o chatbot por conexão

Vincular o fluxo ativo a connectionId, contexto e configuração correta; tratar zero ou múltiplos fluxos elegíveis explicitamente.

**Aceite:** Uma conexão não utiliza o primeiro fluxo ativo de outra por seleção global.

### IA-105 — [V] Alinhar autenticação do chatbot ao gateway

Validar os caminhos JWT e HMAC também na configuração de deploy; não desabilitar proteção do gateway sem autenticação equivalente no handler.

**Aceite:** Webhook legítimo chega ao handler; chamada não autenticada é bloqueada em qualquer caminho.

### IA-106 — [M] Preparar contexto correto para o bot

Recuperar conhecimento vigente e mensagens autorizadas, ordenar o histórico e evitar duplicar a mensagem de entrada quando já estiver persistida.

**Aceite:** A geração considera exatamente o contexto declarado e retorna evidências verificáveis.

### IA-107 — [C] Completar a transferência para humano

Implementar confirmação de fila/atendente, atualização de ownership e mensagem de transição conforme o pipeline existente, não apenas um campo transfer_to_human.

**Aceite:** O bot só informa transferência concluída após a operação correspondente estar confirmada.

### IA-108 — [N] Impedir disputa entre bot e atendente

Usar estado compartilhado de posse e pausa da automação após intervenção humana; revalidar antes do envio da resposta gerada.

**Aceite:** Bot não responde sobre a mensagem que um atendente já assumiu ou encerrou.

### IA-109 — [N] Prevenir loops e respostas indevidas

Filtrar mensagens próprias, eventos duplicados, outros bots e conversas inelegíveis; aplicar limites por conversa, horário e canal configurado.

**Aceite:** Eventos repetidos ou ecos não geram ciclos de respostas automáticas.

### IA-110 — [M] Homologar o bot sem envio

Comparar propostas do L1 com decisões humanas em modo de observação sem efeitos; aprovar ativação por conexão e capacidade.

**Aceite:** Habilitação exige evidência de qualidade, handoff e bloqueios, e mantém reversão imediata.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 12 — Churn, classificação, supervisor e inteligência externa (111–120)

**Prioridade:** P1/P2 — métricas sustentadas por dados.

**Dependências entre blocos:** IA-021, IA-022, IA-025, IA-056

**Escopo técnico:** ChurnPredictionDashboard, ai-churn-analysis, AutoTicketClassifier, useNextBestAction, SupervisorCopilot e useContactIntelligence.

**Base de código/documentação:** [src/components/ai/ChurnPredictionDashboard.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/ai/ChurnPredictionDashboard.tsx); [src/components/ai/AutoTicketClassifier.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/ai/AutoTicketClassifier.tsx); [src/hooks/chat/useNextBestAction.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/chat/useNextBestAction.ts); [src/components/admin/SupervisorCopilot.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/admin/SupervisorCopilot.tsx); [src/hooks/crm/useContactIntelligence.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/crm/useContactIntelligence.ts).

### IA-111 — [C] Corrigir o conceito de inatividade

Utilizar última interação real e eventos relevantes, não updated_at genérico do contato; explicitar canais cobertos e lacunas de histórico.

**Aceite:** Editar um cadastro não reinicia artificialmente a contagem de engajamento do cliente.

### IA-112 — [C] Aplicar o resultado da análise de churn

Escolher cálculo canônico e consumir ou persistir o resultado retornado pelo backend; eliminar recomputação local conflitante e helpers desconectados.

**Aceite:** O resultado apresentado após analisar é o que efetivamente foi calculado pelo fluxo escolhido.

### IA-113 — [M] Separar score de probabilidade de perda

Documentar regras, fatores e versão; distinguir score manual, heurístico, modelo validado e dado importado, com validação histórica antes de chamar algo de probabilidade.

**Aceite:** Valores sem calibração são exibidos como índices de risco, não probabilidades comprovadas.

### IA-114 — [C] Unificar a classificação de tickets

Compartilhar regras ou consumir o resultado do servidor; consolidar múltiplas etiquetas pela política definida, e não pela primeira etiqueta recebida.

**Aceite:** A ordem das etiquetas não muda arbitrariamente categoria e prioridade do ticket.

### IA-115 — [C] Atualizar estados usados nas recomendações

Alinhar consultas de tarefas e campanhas aos estados realmente válidos no contrato atual, eliminando dependência indevida de pending ou finished legados.

**Aceite:** Tarefas e campanhas elegíveis aparecem nos indicadores e nas recomendações corretas.

### IA-116 — [C] Diferenciar ausência de pendência e erro

Tratar falhas nas consultas de SLA, memória e tarefas separadamente de resultados vazios; não sugerir upsell porque uma consulta falhou.

**Aceite:** Falta de dados nunca é apresentada como ausência confirmada de urgências.

### IA-117 — [C] Alimentar o supervisor com métricas reais

Expor consultas autorizadas de backlog, espera, SLA, atendimento e motivos de encerramento; limitar respostas às métricas efetivamente disponíveis.

**Aceite:** Cada resposta gerencial pode ser reproduzida a partir de consulta, período e amostra identificados.

### IA-118 — [M] Uniformizar períodos e definições gerenciais

Diferenciar hoje, últimas 24 horas, expediente e período customizado; documentar denominadores e escopo por equipe ou fila.

**Aceite:** Perguntas iguais retornam números consistentes entre o copiloto e os painéis tradicionais.

### IA-119 — [M] Validar inteligência importada do CRM

Tratar briefing, melhores horários, churn, rapport e DISC como dados externos versionados; informar origem, validade, indisponibilidade e método quando conhecido.

**Aceite:** A interface não apresenta um dado importado ou manual como nova inferência validada do ZAPP.

### IA-120 — [N] Simular capacidade de atendimento

Oferecer cenários de distribuição de filas com volumes, tempos e capacidade explicitamente informados; separar simulação de previsão e recomendação automática.

**Aceite:** O gestor vê premissas e limitações, sem alterações de equipe ou fila por conta do simulador.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 13 — Voz, transcrição, TTS e comandos (121–130)

**Prioridade:** P1/P2 — segurança e paridade funcional.

**Dependências entre blocos:** IA-011, IA-014, IA-017, IA-041, IA-044

**Escopo técnico:** ai-transcribe-audio, ElevenLabs functions, processTranscript, useVoiceAgent, playTtsAudio e componentes de áudio.

**Base de código/documentação:** [supabase/functions/ai-transcribe-audio/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-transcribe-audio/index.ts); [supabase/functions/_shared/schemas.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/schemas.ts); [src/hooks/voice/processTranscript.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/voice/processTranscript.ts); [src/hooks/voice/playTtsAudio.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/voice/playTtsAudio.ts); [src/components/inbox/TextToAudioButton.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/TextToAudioButton.tsx).

### IA-121 — [M] Unificar o contrato de transcrição

Alinhar idiomas, formatos, mensagens, eventos e erros entre interface, schema e provedor; validar funcionalidades aceitas pela integração contratada.

**Aceite:** Cada formato e idioma anunciado tem teste de contrato e falha compreensível quando não suportado.

### IA-122 — [M] Limitar arquivos de áudio e roteiros

Validar MIME real, tamanho, duração, canais e limites agregados em STT, STS, diálogos e efeitos, antes de alocar memória ou consumir serviço.

**Aceite:** Arquivo ou roteiro abusivo é rejeitado sem processamento descontrolado.

### IA-123 — [N] Tornar transcrição revisável

Preservar timestamps, separação de falantes quando disponível, original, correções humanas e trechos incertos, vinculados à mensagem.

**Aceite:** Correção não apaga a versão original e atualiza análises dependentes de forma rastreável.

### IA-124 — [M] Controlar transcrição automática

Processar eventos em fila com deduplicação, autorização e orçamento por identidade de serviço; definir quais áudios são elegíveis.

**Aceite:** O mesmo áudio não é transcrito repetidamente por reentrega do webhook ou múltiplos consumidores.

### IA-125 — [M] Melhorar reprodução e streaming

Implementar reprodução progressiva compatível, cancelamento, limpeza de recursos e cache autorizado; identificar alternativa de voz do navegador quando usada.

**Aceite:** Fechar painel interrompe áudio e recursos; a alternativa não é confundida com geração ElevenLabs.

### IA-126 — [C] Corrigir confirmação de áudio enviado

Separar áudio gerado, prévia reproduzida, arquivo aceito pela fila, envio confirmado e entrega; preservar arquivo ao falhar reprodução automática.

**Aceite:** A mensagem “enviado” não surge apenas porque um callback recebeu um Blob.

### IA-127 — [N] Governar uso e criação de vozes

Catalogar vozes autorizadas, proprietário, finalidade e revogação; distinguir voz projetada de clonada e exigir autorização comprovada para uso de identidade vocal.

**Aceite:** Voz revogada ou não autorizada não gera novas mensagens ou prévias.

### IA-128 — [M] Validar diálogos, STS, efeitos e música

Revisar contratos reais de cada endpoint, modelo, duração e formato; explicitar capacidades indisponíveis e custo antes de gerar.

**Aceite:** A interface anuncia apenas modalidades que passaram nos testes do provedor configurado.

### IA-129 — [C] Autenticar e limitar comandos de voz

Enviar sessão do usuário, validar ações e rotas por permissão e exigir confirmação contextual para efeitos; excluir execução livre de SQL ou comandos.

**Aceite:** Chave pública não autoriza operação e fala ambígua não produz mudança silenciosa.

### IA-130 — [C] Executar comandos realmente suportados

Conectar buscar, filtrar, ordenar e limpar ao estado correto da interface; tratar pausa, interrupção, troca de tela e concorrência com TTS.

**Aceite:** A confirmação falada corresponde a uma mudança observável, não apenas a um toast.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 14 — Mídias, documentos e compreensão multimodal (131–140)

**Prioridade:** P2/P3 — expansão com escopo e evidência.

**Dependências entre blocos:** IA-014, IA-019, IA-047, IA-081, IA-121

**Escopo técnico:** classify-audio-meme, classify-sticker, classify-emoji, biblioteca de mídias e contexto de anexos.

**Base de código/documentação:** [supabase/functions/classify-audio-meme/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/classify-audio-meme/index.ts); [supabase/functions/classify-sticker/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/classify-sticker/index.ts); [supabase/functions/classify-emoji/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/classify-emoji/index.ts).

### IA-131 — [C] Classificar áudio pelo conteúdo quando necessário

Substituir inferência apenas por nome/URL por transcrição ou análise sonora autorizada; manter modo por metadados claramente identificado como limitado.

**Aceite:** Classificação não afirma ter ouvido um arquivo quando recebeu somente seu nome.

### IA-132 — [M] Separar categoria e falha técnica

Versionar categorias de stickers e emojis e representar desconhecido, baixa confiança, falha de provedor e outros como estados distintos.

**Aceite:** Indisponibilidade do modelo não altera arquivos para a categoria Outros como se fosse conclusão válida.

### IA-133 — [N] Preparar ingestão segura de anexos

Criar pipeline autorizado de verificação de tipo, tamanho, conteúdo ativo e processamento isolado; tratar instruções dentro de documentos como dados não confiáveis.

**Aceite:** Anexo não pode ampliar permissões nem introduzir execução de código no pipeline.

### IA-134 — [N] Extrair dados de documentos comerciais

Ler cotações, comprovantes e pedidos permitidos, extraindo entidades, valores, quantidades e prazos com referência à página ou trecho.

**Aceite:** Extração é proposta revisável; campos não encontrados permanecem ausentes em vez de inventados.

### IA-135 — [N] Usar OCR somente quando necessário

Priorizar texto digital e análise visual adequada; acionar OCR apenas para imagens/scans pertinentes, preservando incerteza e evidência.

**Aceite:** Documento textual não sofre OCR desnecessário; números incertos exigem revisão.

### IA-136 — [N] Sugerir produtos a partir de imagem

Relacionar referências visuais a candidatos do catálogo autorizado, mostrando similaridade e atributos pendentes de confirmação.

**Aceite:** Aparência semelhante não é apresentada como identificação definitiva de SKU ou disponibilidade.

### IA-137 — [N] Conferir arte contra briefing aprovado

Comparar dimensões, posição, cores declaradas, técnica e versão de arte com requisitos disponíveis; destacar divergências e limites da análise visual.

**Aceite:** Aprovação final continua humana e a IA não certifica requisitos que não consegue medir.

### IA-138 — [N] Confrontar anexos e negociação

Comparar proposta, pedido e mensagens quanto a item, quantidade, preço, prazo e condições; produzir quadro de divergências com fontes.

**Aceite:** Toda divergência permite abrir as duas evidências e não altera o pedido automaticamente.

### IA-139 — [N] Integrar anexos ao contexto conversacional

Incluir transcrições e extrações aprovadas na análise, informando arquivos excluídos, conteúdo indisponível e versões utilizadas.

**Aceite:** O resumo não afirma analisar mídias que não foram efetivamente processadas.

### IA-140 — [N] Pesquisar mídias pelo significado

Permitir busca autorizada por transcrição, categorias, descrição e atributos visuais, com retorno ao arquivo e controle de revogação.

**Aceite:** Busca respeita o mesmo acesso do objeto original e não recupera mídia revogada pelo índice.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 15 — Experiência de uso e acessibilidade (141–150)

**Prioridade:** P1/P2 — paridade e clareza.

**Dependências entre blocos:** IA-025, IA-048, IA-069, IA-080

**Escopo técnico:** ai-tools, ToolPanel, AiTab, componentes de escrita, histórico e área administrativa de provedores.

**Base de código/documentação:** [src/components/inbox/ai-tools/ToolPanel.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ai-tools/ToolPanel.tsx); [src/components/inbox/ai-tools/AnalysisTabs.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ai-tools/AnalysisTabs.tsx); [src/components/inbox/ai-tools/PeriodFilterSelector.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/ai-tools/PeriodFilterSelector.tsx); [src/components/inbox/tabs/AiTab.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/tabs/AiTab.tsx).

### IA-141 — [M] Unificar a experiência de assistência

Organizar os pontos de entrada em uma área coerente, reutilizando componentes e preservando o design system e as cores do produto.

**Aceite:** Funcionalidades equivalentes não têm estados, nomes e comportamentos contraditórios em telas diferentes.

### IA-142 — [M] Identificar a origem de cada informação

Exibir se o resultado foi gerado, calculado, informado manualmente ou importado, com data, cobertura e condição de atualização.

**Aceite:** Um badge de IA não transforma score manual ou regra simples em previsão validada.

### IA-143 — [N] Abrir evidências sem perder a conversa

Criar visualização de fontes, trechos e comparação de versões ao lado do atendimento, com navegação até a mensagem ou documento.

**Aceite:** Atendente verifica uma conclusão sem perder rascunho, rolagem e contexto do cliente.

### IA-144 — [M] Escolher painel ou modal conscientemente

Priorizar painel lateral para trabalho contínuo; quando modal for necessário, aplicar semântica, bloqueio de interação externa e gestão de foco apropriados.

**Aceite:** O comportamento anunciado como modal corresponde à interação real e não bloqueia o atendimento indevidamente.

### IA-145 — [C] Corrigir interação por teclado

Dar nome acessível a ícones e abas, gerir foco, Escape e retorno ao acionador; limitar atalhos à ferramenta ativa para evitar geração acidental.

**Aceite:** Todos os controles de IA funcionam por teclado e leitor de tela nos fluxos testados.

### IA-146 — [M] Padronizar estados visuais

Distinguir carregando, aguardando aprovação, cancelado, parcial, desatualizado, vazio e erro; mostrar ação de recuperação pertinente.

**Aceite:** O usuário entende o estado real sem depender de um toast efêmero.

### IA-147 — [M] Corrigir legibilidade e responsividade

Remover redução artificial por escala, revisar fontes muito pequenas, contraste, alvos de toque e espaçamento em desktop e mobile.

**Aceite:** Zoom, viewport reduzido e navegação por toque não ocultam conteúdo ou controles essenciais.

### IA-148 — [M] Proteger o rascunho durante geração

Preservar edição concorrente, desfazer/refazer, seleção e histórico; pedir aplicação explícita quando o texto mudou depois do início da chamada.

**Aceite:** Uma resposta atrasada não substitui silenciosamente o trabalho recente do atendente.

### IA-149 — [M] Separar administração e operação

Restringir endpoints, secrets e configuração de modelos aos perfis autorizados; oferecer ao atendente apenas capacidades permitidas e estado de disponibilidade.

**Aceite:** Acesso direto à rota ou API não contorna a separação da interface.

### IA-150 — [N] Personalizar formato de assistência

Permitir preferências por usuário para profundidade, formato, acessibilidade e reprodução de áudio, sem alterar políticas centrais ou compartilhar preferências entre contas.

**Aceite:** Cada usuário controla apresentação, mas não amplia suas permissões ou muda regras comerciais.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 16 — Copilotos operacionais para a Promo Brindes (151–160)

**Prioridade:** P2 — propostas de ampliação, não capacidades já certificadas.

**Dependências entre blocos:** IA-080, IA-081, IA-087, IA-093, IA-098

**Escopo técnico:** Catálogo, negociações, memória, fontes comerciais e integrações autorizadas; novas funções propostas para áreas operacionais.

**Base de código/documentação:** [src/hooks/chat/useRecommendedProducts.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/chat/useRecommendedProducts.ts); [src/hooks/crm/useContactIntelligence.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/crm/useContactIntelligence.ts); [supabase/functions/ai-suggest-reply/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-suggest-reply/index.ts).

### IA-151 — [N] Transformar conversa em briefing comercial

Extrair finalidade do brinde, público, quantidade, orçamento, técnica e data desejada; marcar perguntas faltantes e produzir rascunho revisável.

**Aceite:** Briefing distingue requisitos confirmados, inferidos e ainda não informados, com evidência por campo.

### IA-152 — [N] Recomendar produtos com restrições reais

Ampliar recomendação por categoria para critérios de quantidade mínima, estoque, técnica, orçamento e prazo, apenas quando existirem fontes autorizadas desses atributos.

**Aceite:** Produto incompatível não é recomendado como viável; dado ausente exige confirmação.

### IA-153 — [N] Conferir preço e margem por cálculo

Usar regras aprovadas e aritmética determinística para custos, personalização, frete, impostos aplicáveis e descontos autorizados; IA apenas explica a composição.

**Aceite:** O cálculo é reproduzível; modelo não inventa margem, tributo ou alçada comercial.

### IA-154 — [N] Comparar cotações de fornecedores

Normalizar item, quantidade, prazo, condições, frete e custo total a partir das propostas recebidas; preservar diferenças de escopo e qualidade declarada.

**Aceite:** Comparação mostra lacunas e não elege opção com dados incomparáveis como objetivamente superior.

### IA-155 — [N] Verificar viabilidade de prazo

Combinar datas confirmadas de aprovação, compra, produção, personalização e transporte, com calendário e dependências; destacar etapas sem confirmação.

**Aceite:** A promessa de entrega não é criada a partir de prazo parcial ou capacidade inventada.

### IA-156 — [N] Detectar pontos de bloqueio do pedido

Identificar preço não fechado, fornecedor sem confirmação, arte pendente e material incompatível; sugerir responsáveis e tarefas, sem avançar etapa automaticamente.

**Aceite:** Checklist aponta evidência de cada bloqueio e só libera condição quando confirmada.

### IA-157 — [N] Controlar versões de arte e aprovação

Associar briefing, prova, técnica e aprovação ao pedido correto, alertando sobre reuso de arquivo antigo ou mudança posterior à aprovação.

**Aceite:** A IA não assume que uma mensagem vaga aprovou a versão técnica em uso.

### IA-158 — [N] Apoiar ocorrências logísticas

Consolidar rastreio, prazo prometido, transportadora e mensagens para propor tratamento da ocorrência e rascunho de comunicação.

**Aceite:** Status e prazo vêm de fonte identificada; envio e alteração logística dependem de autorização.

### IA-159 — [N] Apoiar comunicação financeira com dados verificados

Preparar rascunhos sobre cobrança, comprovantes e condições a partir de dados autorizados, respeitando alçadas e divergências pendentes.

**Aceite:** Não há renegociação, pagamento ou alteração financeira automática por interpretação do modelo.

### IA-160 — [N] Criar assistência interna restrita por área

Oferecer busca e resumo de procedimentos de RH e outras áreas com acesso específico, revisão humana e exclusão de diagnósticos ou inferências pessoais sensíveis.

**Aceite:** Um usuário comercial não recupera conteúdo privado de colaboradores e a IA não decide medidas trabalhistas.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 17 — Campanhas, TalkX e integração com Multiplix (161–170)

**Prioridade:** P2 — condicionado à disponibilidade do módulo e do canal.

**Dependências entre blocos:** IA-044, IA-047, IA-080, IA-087

**Escopo técnico:** useTalkXInsights, pipeline existente de campanhas e pontos de integração do Multiplix; sem recriar o motor de envio.

**Base de código/documentação:** [src/hooks/integrations/useTalkXInsights.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/integrations/useTalkXInsights.ts); [docs/multiplix/ESTADO_INICIAL.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/docs/multiplix/ESTADO_INICIAL.md).

### IA-161 — [N] Produzir rascunhos de campanhas

Gerar texto conforme objetivo, público, canal e fontes aprovadas, integrado ao editor existente de TalkX ou Multiplix quando disponível.

**Aceite:** Geração cria somente rascunho e não agenda nem envia mensagens por conta própria.

### IA-162 — [N] Traduzir público desejado em filtros seguros

Converter linguagem natural em filtros tipados de papel, ramo, região e carteira; mostrar interpretação, tamanho e exclusões para revisão.

**Aceite:** Não há SQL livre nem destinatários fora do escopo permitido do operador.

### IA-163 — [N] Verificar personalização por destinatário

Validar nomes, empresa, variáveis, fonte e ausência de dados antes da geração em lote; evitar cruzamento de conteúdo entre contatos.

**Aceite:** Prévia e mensagens finais pertencem ao destinatário correto e não exibem variáveis não resolvidas.

### IA-164 — [N] Gerar variações controladas de mensagem

Produzir alternativas de tom, extensão e formato com fatos comerciais bloqueados; revisar texto, áudio e voz autorizada antes da aprovação.

**Aceite:** Variações não mudam oferta, desconto ou condição sem autorização específica.

### IA-165 — [M] Aplicar elegibilidade de envio

Reutilizar supressão, preferências, horários e regras vigentes do canal; revalidar destinatário na execução, inclusive após aprovação e espera em fila.

**Aceite:** Revogação ou bloqueio posterior à criação impede o envio elegível naquele momento.

### IA-166 — [N] Estimar o lote antes de gerar

Exibir número de destinatários, modalidades, custo estimado, tempo operacional e tetos; reservar orçamento e gerar em lotes canceláveis.

**Aceite:** Um comando de geração em massa não causa gasto ilimitado ou processamento sem possibilidade de pausa.

### IA-167 — [M] Sustentar recomendação de horário

Corrigir timezone, amostragem e denominadores dos insights; separar correlação histórica de promessa de resultado e considerar preferência explícita do contato.

**Aceite:** Horário sugerido apresenta período e amostra suficientes ou se abstém.

### IA-168 — [C] Corrigir métricas de engajamento

Reconciliar enviados, entregues, lidos, respostas e cliques, distinguindo eventos únicos de repetidos e utilizando estados reais das campanhas.

**Aceite:** Números do insight coincidem com métricas canônicas e não somam eventos de universos diferentes.

### IA-169 — [N] Experimentar mensagens com controle

Criar testes A/B com alocação registrada, objetivo, amostra e janela definidos; limitar conclusões prematuras e comparar também rejeição e opt-out.

**Aceite:** Uma variante não é declarada melhor apenas por poucas respostas ou múltiplas análises oportunistas.

### IA-170 — [N] Explicar recomendações pós-campanha

Produzir sugestões ligadas a métricas verificadas, com possíveis causas, limitações e ação proposta; manter decisões de aplicação com o operador.

**Aceite:** O relatório não inventa conversões, receita ou causalidade não medida pelo sistema.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 18 — Agentes especializados e ações supervisionadas (171–180)

**Prioridade:** P2/P3 — execução condicionada a políticas.

**Dependências entre blocos:** IA-011, IA-015, IA-043, IA-047, IA-090, IA-107

**Escopo técnico:** Nova camada proposta de ferramentas, propostas de ação e supervisão, integrada a componentes e pipelines existentes.

**Base de código/documentação:** [supabase/functions/ai-proxy/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/ai-proxy/index.ts); [supabase/functions/chatbot-l1/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/chatbot-l1/index.ts); [src/hooks/chat/useNextBestAction.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/hooks/chat/useNextBestAction.ts).

### IA-171 — [N] Catalogar ferramentas executáveis

Registrar ferramentas permitidas com schema, escopo, risco, custo, timeout e efeito; excluir SQL arbitrário, shell e ferramentas não aprovadas.

**Aceite:** Cada agente enxerga somente capacidades autorizadas para sua finalidade e usuário.

### IA-172 — [N] Separar planejamento de execução

Fazer o modelo propor ações e um executor determinístico verificar permissão, argumentos, limites e pré-condições, independentemente do texto do prompt.

**Aceite:** Uma instrução do modelo jamais funciona como autorização de negócio.

### IA-173 — [N] Vincular aprovação ao efeito exato

Registrar aprovador, parâmetros, destinatário, versão e expiração; exigir nova aprovação quando contexto, conteúdo ou preço mudar.

**Aceite:** Uma aprovação antiga não pode autorizar ação modificada ou aplicada a outro contato.

### IA-174 — [N] Definir especialistas por departamento

Configurar assistentes de Vendas, Compras, Logística, SAC, Financeiro e RH com fontes e ferramentas próprias, compartilhando apenas o que estiver autorizado.

**Aceite:** Trocar o especialista não libera dados de outra área nem contorna a matriz de acesso.

### IA-175 — [N] Verificar respostas antes de agir

Combinar invariantes determinísticas com revisão adicional opcional de evidências e contradições; impedir que um segundo modelo seja a única barreira de segurança.

**Aceite:** Resultado reprovado permanece proposta e não chega ao executor operacional.

### IA-176 — [N] Sinalizar riscos operacionais proativamente

Projetar monitoramento interno de promessas vencendo, ausência de confirmação e mudanças de prazo, com deduplicação, justificativa e limites de frequência.

**Aceite:** Alertas indicam fonte e responsável sem executar cobrança, transferência ou envio automático.

### IA-177 — [N] Simular atendimentos para treinamento

Criar cenários anonimizados de negociação e suporte com critérios verificáveis e feedback sobre a resposta, não sobre personalidade do colaborador.

**Aceite:** Treinamento não expõe conversas privadas nem gera avaliação automática definitiva de pessoas.

### IA-178 — [N] Avaliar múltiplos agentes por benefício

Comparar especialista único com colaboração controlada em tarefas complexas; limitar rodadas, custo e ferramentas, adotando somente ganho demonstrado.

**Aceite:** Orquestração extra exige resultado melhor no conjunto de referência e teto de custo respeitado.

### IA-179 — [N] Gerar briefing operacional periódico

Projetar resumos autorizados de pendências, mudanças e riscos por equipe, com origem e janela temporal, deixando frequência e destinatários configuráveis.

**Aceite:** O resumo só inclui dados acessíveis ao destinatário e não declara tarefas concluídas sem evidência.

### IA-180 — [N] Centralizar propostas e decisões

Criar caixa de propostas com aprovar, editar, rejeitar, expirar e acompanhar resultado, integrada ao registro de execução e ao pipeline de efeitos.

**Aceite:** Toda ação tem responsável, decisão humana quando exigida, resultado verificável e tratamento de falha.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 19 — Testes integrados, avaliações e critérios de qualidade (181–190)

**Prioridade:** P0/P1 — bloqueadora da liberação; testes locais acompanham cada etapa.

**Dependências entre blocos:** IA-010, IA-020, IA-030, IA-040, IA-050, IA-060, IA-070, IA-080, IA-090, IA-100, IA-110, IA-120, IA-130, IA-140, IA-150, IA-160, IA-170, IA-180

**Escopo técnico:** Testes unitários, contratos, autorização, concorrência, E2E, avaliações de respostas e desempenho.

**Base de código/documentação:** [src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx); [src/components/inbox/tabs/__tests__/AiTab.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/src/components/inbox/tabs/__tests__/AiTab.test.tsx); [supabase/functions/_shared/schemas.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/functions/_shared/schemas.ts).

### IA-181 — [C] Testar a implementação real

Substituir testes que repetem fórmulas ou verificam constantes locais por chamadas às funções de produção e resultados observáveis.

**Aceite:** Alterar uma regra real quebra o teste correspondente; números zero e enums legados são cobertos.

### IA-182 — [M] Testar contratos de provedores

Simular sucesso, erro, timeout, formato inválido, stream incompleto, fallback e modelo incompatível, sem depender de consumo pago no CI comum.

**Aceite:** Cada adaptador e consumidor responde corretamente a toda a matriz contratual definida.

### IA-183 — [M] Testar isolamento de dados e efeitos

Exercitar usuário, perfil, fila, contato, conexão, organização quando existente e serviço, incluindo armazenamento e fontes recuperadas.

**Aceite:** Todos os casos críticos de acesso negado passam antes de qualquer ativação produtiva.

### IA-184 — [N] Testar injeção e conteúdo adversarial

Construir casos de instruções maliciosas em mensagens, anexos, base e respostas de ferramentas, juntamente com entradas benignas para medir bloqueio excessivo.

**Aceite:** Ataques do conjunto não ampliam escopo nem acionam ferramentas; limitações residuais são registradas.

### IA-185 — [M] Testar concorrência e recuperação

Simular troca A/B de contato, múltiplas abas, eventos repetidos, lease expirado, retry, falha após efeito e cancelamento durante geração.

**Aceite:** Não há aplicação cruzada de resultados nem efeitos locais duplicados nos cenários ensaiados.

### IA-186 — [M] Testar o percurso completo na interface

Cobrir gerar, editar, aplicar, aprovar, enviar, recuperar histórico e transferir, incluindo teclado e erros; validar o resultado final, não apenas clique.

**Aceite:** Sucesso visual corresponde a persistência ou efeito real no ambiente de teste.

### IA-187 — [M] Avaliar voz e multimodalidade

Usar amostras autorizadas de áudio, imagens e documentos com referência humana; medir transcrição, números, falantes, extração e artefatos de reprodução.

**Aceite:** Erros críticos são detectados e baixa qualidade leva à revisão, não à confirmação automática.

### IA-188 — [N] Criar conjunto de avaliação em português

Construir pelo menos 200 casos revisados, separados por área, modalidade e risco; manter conjunto reservado e medir fundamento, utilidade, omissão e recusa indevida.

**Aceite:** Melhorias são comparadas contra referência independente, sem ajustar respostas ao conjunto reservado.

### IA-189 — [M] Ensaiar carga e orçamento

Medir fila, concorrência, consultas, índices, limites, latência e ledger com volumes acima dos limites atuais; incluir falhas de banco e provedor.

**Aceite:** O sistema permanece dentro dos tetos definidos e relata degradação sem perder rastreabilidade.

### IA-190 — [M] Emitir decisão técnica de liberação

Consolidar testes, avaliações, riscos residuais, desempenho e custos por capacidade; exigir correção de falhas bloqueadoras e registrar exceções aceitas.

**Aceite:** Há decisão verificável de liberar ou bloquear cada capacidade, sem certificado genérico de “100% seguro”.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Bloco 20 — Homologação, implantação controlada e entrega (191–200)

**Prioridade:** P1 — somente após autorização específica.

**Dependências entre blocos:** IA-190

**Escopo técnico:** Ambientes reais confirmados, configuração, migrations, flags, observabilidade, rollback e documentação operacional.

**Base de código/documentação:** [supabase/config.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/supabase/config.toml); [docs/architecture/edge-functions.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/docs/architecture/edge-functions.md); [docs/multiplix/ESTADO_INICIAL.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/5209b8a43730cf8e620295bc0a84850737bf9631/docs/multiplix/ESTADO_INICIAL.md).

### IA-191 — [V] Confirmar topologia e disponibilidade reais

Identificar onde frontend, funções, banco, workers e provedores realmente operam; comparar deploy, migrations, permissões e configuração com o código aprovado.

**Aceite:** Não se presume que Vercel, Supabase Cloud ou VPS execute a mesma versão apenas pelo repositório.

### IA-192 — [M] Homologar migrations e compatibilidade

Aplicar mudanças primeiro em ambiente autorizado de homologação; validar backfill, clients antigos, permissões e recuperação antes do rollout produtivo.

**Aceite:** Ensaio preserva dados e mantém rollback ou estratégia de avanço corretivo documentada.

### IA-193 — [M] Testar integrações reais com escopo mínimo

Após autorização, usar contas de teste, tetos de custo e destinatários controlados para provar provedor, armazenamento, canal e confirmação de entrega.

**Aceite:** Há evidência real da integração, sem disparos em massa ou efeitos sobre clientes não envolvidos.

### IA-194 — [M] Observar antes de automatizar

Ativar processamento de avaliação sem envio ou alterações operacionais para comparar decisões, consumo e alertas com o atendimento humano.

**Aceite:** Modo de observação não produz efeitos acidentais e suas divergências são revisadas.

### IA-195 — [M] Conduzir piloto por capacidade

Liberar a um grupo autorizado com treinamento, orçamento e acompanhamento de qualidade; não habilitar toda a suíte simultaneamente.

**Aceite:** Piloto atende às metas e documenta falhas, feedback e diferenças entre departamentos.

### IA-196 — [M] Expandir por coortes e flags

Fazer rollout gradual por equipe, conexão e recurso, com critérios automáticos de pausa e aprovação para ampliação.

**Aceite:** Regressão interrompe a expansão sem derrubar recursos humanos ou módulos não relacionados.

### IA-197 — [M] Ensaiar rollback operacional

Reverter provedor, versão e flags em ambiente controlado, preservando compatibilidade de dados e reconciliando trabalhos em andamento.

**Aceite:** Falha de rollout não perde mensagens, aprovações, análises persistidas ou registros de consumo.

### IA-198 — [M] Atualizar documentação e operação

Corrigir exemplos desatualizados de autenticação e deploy; registrar contratos, limites, fontes, permissões, incidentes e dependências externas sem segredos.

**Aceite:** Documentação corresponde ao fluxo comprovado e não recomenda ampliar grants como atalho de correção.

### IA-199 — [M] Consolidar evidências de entrega

Vincular cada etapa a PR, commit, teste, ambiente, evidência, migration quando aplicável e resultado, registrando itens bloqueados ou substituídos.

**Aceite:** Nenhuma etapa é marcada concluída apenas por código escrito ou toast de sucesso.

### IA-200 — [M] Encerrar por capacidade comprovada

Obter aceite técnico e de negócio, registrar o que foi liberado, restrito ou adiado e manter pendências com responsável; produção exige autorização expressa.

**Aceite:** Entrega final distingue plano, implementação, homologação e produção, sem presumir autorização a partir deste documento.

**Checkpoint do bloco:** evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes.

## Referências técnicas externas utilizadas para orientar o plano

Os controles propostos contra injeção de instruções, saída inválida e autonomia excessiva se apoiam nas categorias do [OWASP GenAI](https://genai.owasp.org/llm-top-10/), sem tratar prompts ou um segundo modelo como fronteira suficiente de autorização.

A separação de grants, políticas e operações privilegiadas deve seguir a documentação de [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) e de [contexto autenticado em Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt). A topologia real do projeto e suas versões precisam ser verificadas antes da implementação.

O uso de [tarefas de fundo em Edge Functions](https://supabase.com/docs/guides/functions/background-tasks) não substitui fila durável nem ledger transacional; respeitar os limites do runtime. A recepção ElevenLabs deve observar [assinatura, timestamp e idempotência de webhooks](https://elevenlabs.io/docs/eleven-api/resources/webhooks), validando o contrato específico dos eventos utilizados.

A acessibilidade de modais deve seguir o [padrão WAI-ARIA de diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), além dos testes de interface.

## Regra final

A aprovação ou geração deste plano não autoriza sua execução. Toda etapa continua pendente. A futura entrega deve registrar resultados reais por capacidade, sem confundir código existente, teste simulado, homologação e produção.
