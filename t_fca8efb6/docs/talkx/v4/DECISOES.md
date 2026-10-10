# Decisões do plano V4 — Talk X

> Parte do [plano V4](../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). As decisões de arquitetura valem para todas as etapas. As de negócio têm um **padrão recomendado que já está escrito nas etapas**: se o dono não disser outra coisa, vale o padrão. Três delas dependem de informação que só o dono tem (N04, N36, N40).

## Decisões de arquitetura

- **A1 · Layout único.** Vale o shell que o app já tem (sidebar + área do módulo, como nas imagens 01, 02, 04, 06, 07, 08 e 16). As telas 03, 05, 09–15 e 17 são encaixadas nele: mantêm o conteúdo e as abas internas da imagem, com a trilha de navegação dentro do cabeçalho do módulo. A barra superior global da imagem (busca, 6 ícones, "Online", sino, avatar) não é do módulo: só a busca "Buscar campanhas, segmentos, templates… (⌘K)" entra, como busca do módulo.
- **A2 · Motor em lotes.** `talkx-send` processa um lote com orçamento de tempo e devolve; o cron re-invoca campanhas em `sending` (padrão do Multiplix); há um reaper para destinatário preso; o lançamento é assíncrono. Nenhuma tela depende de a requisição de lançamento durar o envio inteiro.
- **A3 · Audiência no servidor.** Uma RPC resolve regras → contatos, aplicando o critério de contato visível (`deleted_at IS NULL`, `is_lid_legacy = false`, telefone `^[0-9]{10,15}$`), a supressão e a paginação. Contagem, amostra, prévia, sobreposição e resolução usam a mesma RPC. Nada de limite fixo no navegador.
- **A4 · Vários segmentos por campanha.** Tabela `talkx_campaign_segments` e `talkx_recipients.segment_id` (o primeiro segmento que casou). Fila, relatório e filtros "por segmento" saem daí.
- **A5 · Dado comercial.** "CRM 360" é o banco de Gestão de Clientes (`pgxfvjmuubtbowutlide`), lido pela edge `crm-integration`, com vínculo em `crm_contact_links` (já existe; não se cria outra tabela de vínculo). Os atributos usados em filtro e coluna (empresa, cidade, UF, vendedor, estágio do funil, última compra, ticket médio, total de pedidos, segmento RFM, score, gênero, aniversário) ficam numa projeção local `talkx_contact_attributes`, atualizada por job. Compras e receita vêm de negócios ganhos no Bitrix24 (edge `bitrix-api`, só leitura) gravados em `contact_purchases`. O construtor de segmentos filtra a projeção; nunca consulta o CRM contato a contato em tempo de tela.
- **A6 · Mídia.** Bucket privado `talkx-media` (16 MB; imagem, vídeo, documento, áudio), URL assinada no envio e no teste.
- **A7 · Mensagem interativa.** Botões, lista e enquete entram no schema de template e campanha e no envio. Como a conexão é Evolution GO (não é a API oficial da Meta), toda etapa disso tem aceite com envio real para número interno e fallback em texto + link quando o aparelho não renderiza.
- **A8 · Aprovação de template** é fluxo interno (autor → supervisor ou admin aprova), não aprovação da Meta.
- **A9 · Números só com fonte.** Métrica sem fonte no banco não renderiza (estado "sem dados ainda"). Previsões (término estimado, "previsto", taxa projetada, risco de opt-out, "vs. média") são calculadas no servidor a partir do histórico real e ficam ocultas enquanto não houver a base mínima definida na etapa.
- **A10 · IA.** Regras determinísticas primeiro (RPC). Texto gerado por modelo passa pela edge `ai-proxy`, atrás da chave `talkx_settings.ai_insights`, com teto de custo; cada sugestão tem um botão que aplica algo de verdade.
- **A11 · Ritmo de envio.** Limite por minuto, por dia e por conexão configuráveis no servidor; padrão conservador. Os valores das imagens (42, 200 mensagens por minuto) são ilustrativos.
- **A12 · Papel no banco.** Criar, agendar, lançar, pausar, cancelar, supressão e configurações checam papel (admin/supervisor) nas RPCs e policies, não só na tela. O agendador tem segredo próprio.
- **A13 · Eventos.** O servidor é a única fonte de eventos de ciclo de vida, com ator e motivo.
- **A14 · Exportar e importar arquivo.** CSV/XLSX volta só dentro do Talk X, para admin/supervisor com `profiles.can_download`, com registro (evento) e neutralização de fórmula. O PDF do relatório é gerado sem `window.print` (o app bloqueia impressão em `useScreenProtection.ts`).
- **A15 · Canal.** O motor envia só WhatsApp. Onde a imagem mostra "canal", a coluna e o filtro existem com o valor real; campanha por e-mail não faz parte deste plano.
- **A16 · Ajuda.** Central de ajuda com artigos em markdown versionados no repositório, busca e guias; vídeo só aparece quando existir o arquivo.
- **A17 · Kit único.** Todo modal, estado (vazio, carregando, erro, sem permissão, WhatsApp desconectado, CRM indisponível), tabela, KPI e filtro sai do kit em `src/components/talkx/kit/`. Nenhum `window.confirm`, nenhum diálogo solto.
- **A18 · Régua.** Cada tela tem captura automática em 1672×941 comparada à imagem; etapa de tela só fecha com a foto.

## Decisões de negócio

### Risco para o número de WhatsApp

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N01 | Teto de ritmo por número | 6 mensagens por minuto e 500 por dia por conexão, envio em série; rever após 30 dias sem bloqueio | Valores maiores com envio em paralelo, como os mocks sugerem (42–200/min) | X018, X019 |
| N02 | Horário de silêncio ("não perturbe") | 21h–8h e domingo bloqueados, igual para todos os contatos | Só 22h–7h, ou preferência por contato | X060, X154 |
| N03 | Botões e enquete pela Evolution GO (não é API oficial) | Texto com link como padrão; botão/enquete atrás de chave desligada até o teste real em aparelho | Botão nativo como padrão | X064, X096, X130 |
| N04 | Ensaio real: quais números e por qual conexão | **Falta informação do dono.** Recomendado: 50 números da equipe por um chip secundário; sem chip, pela instância principal num sábado, a 4/min | — | X035 |
| N05 | Várias imagens na mesma mensagem | Uma mídia por template (catálogo vai como imagem montada ou PDF) | Álbum: 2–3 envios seguidos por contato | X083 |
| N06 | "Ver no celular" / envio de teste | Só para números de usuários da equipe, com limite por hora | Qualquer número digitado | X067, X132 |
| N07 | Reenviar quando o resultado é "a confirmar" | Reenviar só "Falha"; "a confirmar" fica com decisão manual de admin | Permitir também "a confirmar", com aviso de possível duplicidade | X031, X151 |
| N08 | Indicador "Risco de entrega" do segmento | Nunca mostrar "Baixo" sem histórico de envio; rever limiares após 3 campanhas reais | Permitir "Baixo" só pela base qualificada | X102 |
| N09 | Endereço dos links nas mensagens | Caminho `/l/…` no domínio atual do app | Subdomínio curto dedicado, ou manter `supabase.co` | X022 |

### LGPD

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N10 | Consentimento, com 100% da base em "desconhecido" | Bloquear só quem revogou; exigir e gravar a confirmação do operador; importados entram como "desconhecido" com base legal registrada | Bloquear todos sem consentimento registrado (hoje zera a audiência) | X032, X120, X121, X172 |
| N11 | Retenção do texto enviado a cada contato | 180 dias | 90 ou 365 dias | X032 |
| N12 | Campanha que ignora a lista de supressão | Nunca permitir (a opção aparece marcada e travada) | Permitir a admin, com motivo, para bloqueio manual | X017, X119, X133 |
| N13 | Retirar da lista quem pediu para sair | Só admin, com motivo obrigatório; supervisor remove os demais bloqueios | Admin e supervisor; ou nunca pela tela | X181 |
| N14 | Pedido de saída por frase | Só mensagem inteira igual à palavra (PARE, SAIR, REMOVER…) mais botão de saída; rever em 30 dias | Frase que contém a palavra (gera falso positivo) | X029, X030 |
| N15 | Gênero e aniversário | Aniversário como filtro; gênero só na composição agregada do público, e só quando 30% ou mais tiver o dado | Gênero também como filtro; ou nenhum dos dois | X038, X107, X116 |
| N16 | Filtro por assunto de conversa ("Interagiu com preços") | Temas fixos (preço/orçamento, prazo, catálogo) com lista de termos mantida por admin | Busca livre nas mensagens; ou não ter | X100 |
| N17 | Trecho da resposta do cliente na linha do tempo | Até 80 caracteres, só para quem já tem acesso à conversa | Todo admin/supervisor; ou nunca mostrar texto | X152 |
| N18 | CPF/CNPJ na importação | Usar só para casar com o CRM e apagar em 30 dias | Guardar no cadastro do ZAPP | X170, X173 |
| N19 | E-mail do relatório | Só para usuários internos | Qualquer endereço | X169 |
| N20 | Texto do aviso da supressão | Dizer "excluídos de todos os envios de campanhas" — hoje automações e chatbot não consultam a lista | Manter o texto do mock e fazer automações respeitarem a lista (projeto separado) | X179 |

### Dado que não volta

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N21 | Excluir campanha que já enviou | Só rascunho é excluído; as demais são arquivadas (relatório e trilha preservados) | Admin exclui de vez | X026, X080 |
| N22 | Excluir segmento | Arquivar (reversível) | Apagar de vez | X101 |
| N23 | Excluir template já usado | Só arquivar; excluir só o que nunca foi usado | Admin exclui com confirmação | X085 |
| N24 | Histórico de versões de template | Guardar as 50 mais recentes | Guardar todas | X084 |
| N25 | "Encerrar campanha" pausada | Encerra como cancelada; pendentes marcados sem volta; motivo obrigatório | Concluída parcial; ou permitir reabrir | X156 |
| N26 | Preencher cidade, UF e origem no cadastro a partir do CRM | Preencher só campos vazios, depois de o dono aprovar a contagem do ensaio | Não tocar no cadastro; usar só a projeção | X056 |
| N27 | Cancelar ou excluir várias campanhas de uma vez | Só admin; pausar em massa para admin e supervisor | Admin e supervisor para tudo | X081 |

### Regras de operação

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N28 | Contato sem valor para uma variável (ex.: vendedor vazio) | A revisão bloqueia o lançamento e oferece "pular os N contatos sem valor"; o motor nunca envia o nome da variável | Enviar com texto padrão; ou sempre pular | X020, X120, X134 |
| N29 | Texto livre e texto diferente do template aprovado | Texto livre permitido a admin/supervisor com a confirmação gravada; se alterar um template aprovado, só admin lança | Exigir sempre template aprovado | X066, X120 |
| N30 | Quem aprova template | Admin ou supervisor, inclusive o próprio, com registro de quem e quando | Exigir segunda pessoa | X066, X090 |
| N31 | Campanha recorrente | Público e supressão reavaliados a cada ocorrência; data final obrigatória | Público congelado; ou confirmação humana a cada vez | X059, X137 |
| N32 | Checklist de retomada | Bloqueia só quando um item automático falha; "retomar mesmo assim" só admin, com motivo | Só informa; ou bloqueia até marcar os 5 | X159 |
| N33 | Bloquear contato a partir da linha do monitor | Bloqueio geral na lista de supressão, por admin/supervisor, com motivo | Só naquela campanha; ou com prazo | X151 |
| N34 | Seleção manual de contatos no wizard | Mantida (existe hoje e não sai), resolvida pelo servidor | Remover e usar só filtros, como no mock | X125 |
| N35 | Blocos da Visão geral que não estão no mock ("Rascunhos pendentes", "Insights", filtro de objetivo) | Mantidos, recolhidos abaixo da tabela | Remover para ficar idêntico ao mock | X079, X081 |

### Dados e CRM

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N36 | Bitrix24 como fonte de vendas | **Falta informação do dono:** nome do funil de vendas e confirmação de leitura do webhook. Recomendado: só o funil indicado | Todo negócio ganho de qualquer funil | X039 |
| N37 | Atribuição de receita à campanha | Último envio antes da compra, janela de 30 dias, configurável | 7 ou 15 dias; ou só conversão por link | X041 |
| N38 | Vínculo automático ZAPP ↔ CRM por telefone | Automático quando o telefone casa com exatamente 1 contato do CRM; ambíguos vão para a fila | Tudo com revisão humana | X036 |
| N39 | Botão "Criar" na fila de pendentes | Cria só no ZAPP (o CRM é somente leitura neste plano) | Criar também no CRM | X172, X174 |
| N40 | "Falar com suporte" e "Falar com especialista" | **Falta informação do dono:** número/pessoa e horário de cada um; sem isso os botões ficam desabilitados | Um destino só para os dois | X191 |

### Custo e fluxo de trabalho

| Nº | Decisão | Padrão aplicado nas etapas | Alternativa | Etapas |
|---|---|---|---|---|
| N41 | IA (texto e sugestões geradas por modelo) | Começa desligada; regras calculadas primeiro; liberar depois com teto mensal (sugestão: US$ 20) | Ligar desde o início | X076, X092, X117 |
| N42 | Exportar e importar arquivo (CSV, XLSX, PDF) | Volta só dentro do Talk X, para admin/supervisor com permissão de download e com registro — reverte, para este módulo, a retirada de CSV de 27/09 | Manter sem exportação/importação (as telas 06, 14 e 15 ficam incompletas) | X168, X171, X183, X093 |
| N43 | Aprovação das 63 etapas com migration | Autorização permanente para migration **aditiva** em objetos `talkx_*` (tabela, coluna, função, índice novos); continuam esperando o dono: DROP, REVOKE, mudança de dado e alteração de CI | Aprovar uma a uma (a regra atual) | — |
| N44 | Aprovação dos 23 deploys de edge | Uma janela de deploy por dia, aprovada de uma vez | Aprovar run a run | — |
| N45 | Campanha por e-mail | Fora deste plano: o motor envia só WhatsApp; onde o mock mostra "canal", a coluna e o filtro existem com o valor real | Construir envio de e-mail (outro projeto) | — |
