# Critérios de aceite — 80 verificações para o Codex

**Status inicial de todos os critérios: PENDENTE.** São requisitos de validação da implementação futura; esta entrega não executou os testes do aplicativo.

Use fixtures sintéticas e interceptação completa de chamadas externas mutáveis. Cada resultado deve apontar para teste, relatório ou screenshot produzido. Um critério bloqueado não é aprovado; registrar motivo e impacto.

**Matriz visual:** 1672×941 (referência nativa), 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844 e 320 px de largura, além de zoom 200%.

**Resultado por critério:** PENDENTE / APROVADO / REPROVADO / BLOQUEADO. Não preencher APROVADO por inspeção do prompt.

## Fidelidade visual e integração

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-001 | **Rota real** — Abrir ?view=email-chat com fixture autenticada controlada. | O workspace implementado é o componente real, dentro do shell e dos guards; não uma imagem ou página paralela. | E2E + inspeção | PENDENTE |
| AC-002 | **Referência correta** — Comparar captura nativa 1672×941 com 01_EMAIL_DIRECAO_VISUAL.png. | Composição NAVY, contornos, densidade, cabeçalho, lista/timeline/rail reconhecíveis; sem retorno ao protótipo rejeitado. | Visual | PENDENTE |
| AC-003 | **Tema local** — Alternar entre Email, Chat, Campanhas e Contatos. | Mudanças de cores do Email não alteram indevidamente módulos externos; tema claro/alto contraste continuam utilizáveis. | E2E + visual | PENDENTE |
| AC-004 | **Shell sem duplicação** — Abrir Email standalone e contexto incorporado utilizado pelo projeto. | Apenas uma Sidebar global e nenhum header global duplicado; modo incorporado respeita contêiner. | E2E | PENDENTE |
| AC-005 | **Header funcional** — Acionar Ajuda, Nova mensagem, busca e controles que realmente existirem. | Cada controle visível tem ação implementada; nenhum item de IA/agendamento foi adicionado apenas pela imagem. | E2E | PENDENTE |
| AC-006 | **Seleção versus não lido** — Comparar thread selecionada lida e outra não lida. | Estados distinguíveis por semântica e indicadores, não apenas uma mesma mancha azul. | Visual + acessibilidade | PENDENTE |
| AC-007 | **Assunto e identidade** — Abrir thread de várias mensagens de mesmo assunto. | Assunto principal não é repetido em todos os balões; interlocutor e endereço permanecem identificáveis. | Componente + visual | PENDENTE |
| AC-008 | **Conteúdo de tamanho variável** — Usar nomes, endereços, assuntos e arquivos muito longos. | Nenhum elemento vaza da coluna; informação completa é acessível sem depender apenas de tooltip de hover. | E2E | PENDENTE |
| AC-009 | **Mensagens ilustrativas** — Buscar nomes, contagens e arquivo do mockup no código produtivo. | Nenhum fixture de remetente, log, nota, selo ou contagem alimenta UI de produção. | Revisão + teste | PENDENTE |
| AC-010 | **Tipografia e alinhamento** — Comparar cabeçalhos, linhas, timestamps, botões e ícones. | Fontes do design system, escala legível, alinhamentos estáveis e uma hierarquia consistente com a referência. | Visual | PENDENTE |

## Lista, consulta e navegação

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-011 | **Filtro de anexos** — Aplicar Com anexos sobre base com threads com/sem anexos e histórico parcial. | Somente resultados comprovados no universo consultado; estado desconhecido não vira falso “sem anexo”. | Query + E2E | PENDENTE |
| AC-012 | **Busca por remetente sem CRM** — Buscar endereço e nome de last_from de thread sem contact_id. | Remetente localizável; ausência de cadastro não impede busca. | Query | PENDENTE |
| AC-013 | **Busca fora da primeira página** — Criar fixture com mais de 100 threads, alvo apenas em página posterior. | Busca localiza no universo declarado; não só no array inicial. | Integração | PENDENTE |
| AC-014 | **Paginação estável** — Criar várias threads com mesmo timestamp; buscar páginas sucessivas. | Ordenação com desempate, sem repetição/perda decorrente da paginação. | Query | PENDENTE |
| AC-015 | **Universo de pasta** — Alternar Entrada, Enviados, Lixeira e todas as conversas disponíveis. | Cada view corresponde a labels/estado corretos; caixa não fica apenas com nomes diferentes para o mesmo array. | Integração | PENDENTE |
| AC-016 | **Filtros combinados** — Combinar conta+pasta+não lidas+anexos+período e limpar. | AND/semântica definida entre filtros; estado de limpeza restaura resultado e URL coerentes. | Query + E2E | PENDENTE |
| AC-017 | **Contadores** — Fixture com mensagens e threads em quantidades diferentes e subconjunto parcial. | Contagem de conversas não usa contagem de mensagens ou página como se fosse total global. | Unitário + integração | PENDENTE |
| AC-018 | **Busca concorrente** — Digitar consulta A lenta e B rápida, completar A por último. | B permanece vigente; resultado antigo descartado e nenhum piscar para vazio espúrio. | Componente | PENDENTE |
| AC-019 | **Voltar/avançar** — Navegar entre lista/threads, recarregar link e usar histórico do navegador. | Identidade e parâmetros próprios restaurados sem romper ?view ou sobrescrever query de outros módulos. | E2E | PENDENTE |
| AC-020 | **Estados de lista** — Simular loading, filtro sem resultados, 403, offline e falha de listagem. | Mensagens distintas; falha não é tratada como zero e há recuperação adequada. | Componente + E2E | PENDENTE |

## Conta, seleção e rascunhos

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-021 | **Carga da conta** — Atrasar list-accounts/RPC inicial. | Tela mostra carregamento; não oferece reconectar prematuramente. | Componente | PENDENTE |
| AC-022 | **Isolamento de conta** — Abrir thread A, trocar para conta B e completar consulta de A. | Nenhum conteúdo ou marcador de A aparece em B; queries/ações usam a conta certa. | Integração | PENDENTE |
| AC-023 | **Seleção atualizada** — Alterar unread/count/star de thread selecionada via atualização do cache. | Header e rail refletem objeto atual, não uma cópia antiga. | Componente | PENDENTE |
| AC-024 | **Rascunho A→B→A** — Digitar em A, anexar arquivo, ir a B, depois retornar a A. | B não recebe texto/anexo; A preserva sua composição. | Componente + E2E | PENDENTE |
| AC-025 | **Envio concluído em outra tela** — Enviar A com demora, navegar a B e escrever ali. | Sucesso de A não limpa rascunho de B nem reposiciona a conversa errada. | Integração | PENDENTE |
| AC-026 | **Compacto/expandido** — Preencher corpo, To/Cc, alvo e anexos, expandir e recolher compositor. | Mesma composição e seleção de texto/dados preservadas. | E2E | PENDENTE |
| AC-027 | **Fechar versus descartar** — Fechar compositor alterado e confirmar/cancelar descarte. | Não há perda sem aviso; guardar e descartar têm efeitos distintos. | E2E | PENDENTE |
| AC-028 | **Draft remoto sem duplicação** — Disparar várias atualizações de uma mesma composição com respostas fora de ordem. | Um draft criado e atualizado por ID; conteúdo mais novo prevalece; ACK verdadeiro. | Contrato + integração | PENDENTE |
| AC-029 | **Reload de rascunho** — Recarregar composição com anexos conforme a política implementada. | Restauração cumpre o prometido; arquivo não restaurável tem aviso explícito, sem envio silenciosamente incompleto. | E2E | PENDENTE |
| AC-030 | **Logout e novo usuário** — Sair de usuário A e entrar com B no mesmo navegador. | Caches, drafts e blobs de A não aparecem nem podem ser enviados por B. | Segurança + E2E | PENDENTE |

## Composição, destinatários e envio

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-031 | **Responder mensagem anterior** — Em thread com três mensagens, responder à primeira. | targetMessageId, cabeçalhos e destinatários pertencem à primeira; banner explicita alvo. | Regressão + E2E | PENDENTE |
| AC-032 | **Encaminhar mensagem anterior** — Encaminhar a segunda mensagem de três conteúdos diferentes. | Texto/HTML/cabeçalhos de origem e anexos escolhidos são da segunda, não lastMessage. | Regressão + E2E | PENDENTE |
| AC-033 | **Reply-To** — Mensagem inbound possui From e Reply-To distintos. | Resposta usa Reply-To válido; fallback só quando apropriado e visível. | Unitário | PENDENTE |
| AC-034 | **To e Cc** — Responder a todos com duplicatas, conta própria e aliases cadastrados. | To/Cc disjuntos; autoendereçamento removido; papéis preservados. | Unitário + contrato | PENDENTE |
| AC-035 | **Bcc e participantes** — Recebida não traz Bcc; enviada própria traz dado autorizado. | Não inventar nem revelar Bcc recebido; reply-all não o reinclui automaticamente. | Segurança + unitário | PENDENTE |
| AC-036 | **Parser de endereços** — Usar display name com vírgula entre aspas, Unicode e endereço inválido. | Formatos suportados são preservados; inválidos são rejeitados com erro por campo; sem split destrutivo. | Unitário | PENDENTE |
| AC-037 | **Editor rico** — Aplicar negrito/itálico/lista/link; colar texto/HTML e desfazer. | Ferramentas funcionam; HTML seguro e texto simples coerentes são enviados. | Componente + contrato | PENDENTE |
| AC-038 | **Cabeçalhos RFC** — Responder com Gmail IDs diferentes do UUID local e Message-ID real. | threadId e In-Reply-To/References usam as famílias corretas, sem <gmail_id> fabricado. | Contrato MIME | PENDENTE |
| AC-039 | **Envio concorrente e IME** — Manter Enter, usar composição IME, clicar duas vezes durante serialização lenta. | Uma submissão; nova linha/atalho segundo preferência; IME não envia acidentalmente. | Componente | PENDENTE |
| AC-040 | **Resultado de envio** — Simular aceite Gmail+falha local, rejeição antes do envio e timeout desconhecido. | Três situações distinguíveis; sem retry automático do send ou declaração falsa de falha após aceite. | Contrato + integração | PENDENTE |

## Anexos e arquivos

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-041 | **Nova mensagem com anexo** — Selecionar dois arquivos e enviar ao provedor mockado. | Payload/MIME contém os dois arquivos com bytes corretos; não apenas badges. | Regressão + contrato | PENDENTE |
| AC-042 | **Resposta com anexo** — Enviar anexos por resposta simples e reply-all. | Mesmo contrato tipado, sem cast de escape; MIME multipart válido. | Contrato | PENDENTE |
| AC-043 | **Regra de quantidade** — Selecionar dez e depois onze arquivos, conforme limite de servidor vigente. | Cliente e servidor concordam; mensagem de limite clara, sem aceitar algo que some depois. | Unitário + edge | PENDENTE |
| AC-044 | **Regra de tamanho** — Testar limite, limiar+1 e expansão base64/MIME com diversos arquivos. | Teto agregado documentado e validado nas duas camadas; erro ocorre antes de submissão inválida. | Unitário + edge | PENDENTE |
| AC-045 | **Download base64url binário** — Baixar fixture com bytes não UTF-8, zeros e caracteres base64url. | Hash dos bytes baixados corresponde ao original. | Unitário + contrato | PENDENTE |
| AC-046 | **Múltiplos anexos da mesma mensagem** — Sincronizar e ressincronizar mensagem com três attachments. | Três metadados sem sobrescrita/duplicação; chave natural correta. | Integração | PENDENTE |
| AC-047 | **Arquivo original no encaminhamento** — Escolher dois anexos originais e acrescentar um novo. | Os três constam do envio; falha de leitura não é ignorada silenciosamente. | Integração | PENDENTE |
| AC-048 | **Preview seguro** — Tentar imagem, texto, PDF suportado e HTML/SVG ativo. | Tipos permitidos abrem pelo viewer definido; ativos não ganham privilégios da aplicação. | Segurança + E2E | PENDENTE |
| AC-049 | **Blob e erro de download** — Repetir abrir/fechar, falhar download e trocar de conta no meio. | URLs revogadas, erro recuperável; arquivo da conta anterior não aparece na nova. | Componente + memória | PENDENTE |
| AC-050 | **Cartão verdadeiro** — Thread sem anexo e arquivo com nome longo/sem MIME declarado. | Nada de deployment-log inventado; fallback de tipo e nome legíveis sem vazamento de layout. | Componente + visual | PENDENTE |

## Caixa, sincronização e contexto

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-051 | **Arquivar thread** — Thread com três mensagens INBOX, duas ainda não visíveis. | A operação alcança a unidade thread definida; cache e provedor concordam. | Regressão + contrato | PENDENTE |
| AC-052 | **Falha ao arquivar** — Recusar a operação no provedor. | Seleção/dados não desaparecem como sucesso; rollback ou permanência com erro. | Integração | PENDENTE |
| AC-053 | **Lixeira e restaurar** — Mover conversa à lixeira e usar ação inversa implementada. | TRASH não é confundido com archive interno; pastas e labels refletem o resultado real. | Contrato + E2E | PENDENTE |
| AC-054 | **Favoritos e marcadores** — Favoritar/desfavoritar e aplicar marcador pela UI. | Operação real; nomes de usuário preservados, IDs de sistema apresentados de forma legível. | Integração | PENDENTE |
| AC-055 | **Marcar leitura com falha parcial** — Metade das chamadas mark-read retorna erro. | Espelho local só confirma o que foi aceito; falhas não viram lido. | Regressão + edge | PENDENTE |
| AC-056 | **Sync parcial e cursor** — Uma página falha parcialmente e há nextPageToken. | Estado parcial preservado e continuação controlada; não mostrar caixa completa/synced sem ressalva. | Regressão + integração | PENDENTE |
| AC-057 | **Mudança externa no Gmail** — Reproduzir eventos added/deleted/labels e múltiplas páginas de history. | Caminhos implementados reconciliam alterações; capacidades não implementadas permanecem declaradas. | Contrato + integração | PENDENTE |
| AC-058 | **Agregados fora de ordem** — Sincronizar várias mensagens de mesma thread, antigas após novas. | Último resumo/data permanece correto, contagem e labels não dependem da ordem incidental. | Regressão + integração | PENDENTE |
| AC-059 | **Identidade e relacionados** — Remetente sem CRM, depois contato vinculado; abrir relacionada. | Identidade coerente entre painéis; consultas relacionadas respeitam conta/vínculo e não fundem assuntos. | Componente + integração | PENDENTE |
| AC-060 | **Notas internas** — Adicionar nota a contato vinculado e preparar resposta ao e-mail. | Nota salva pelo serviço correto, nunca enviada; sem contato não se usa ID inválido ou cadastro fictício. | Integração + E2E | PENDENTE |

## Segurança e leitura HTML

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-061 | **Isolamento de recursos** — Conta A envia ID de mensagem/thread/anexo da conta B em todos os handlers tocados. | Backend nega; nenhuma consulta service role ignora escopo autorizado. | Segurança de contrato | PENDENTE |
| AC-062 | **Validação de cabeçalhos** — Enviar CR/LF e campos malformados em destinatário/assunto/filename/MIME. | Payload rejeitado ou serializado com segurança demonstrada; sem quebra de cabeçalho por interpolação. | Unitário + edge | PENDENTE |
| AC-063 | **Sanitização existente** — Executar testes de script, eventos HTML, CSS hostil e escapes/bypasses. | Hardening preservado; nenhum relaxamento só para a aparência. | Unitário de segurança | PENDENTE |
| AC-064 | **Sandbox do leitor** — Abrir e-mail com tentativa de script e acesso a parent/document. | Isolamento mantido; não habilitar scripts/same-origin para ajustar altura. | Browser + segurança | PENDENTE |
| AC-065 | **Imagens e rastreamento** — Abrir mensagem com imagem remota controlada e rastreador de teste. | Comportamento corresponde à política exibida; no-referrer não é apresentado como bloqueio total. | Browser + rede | PENDENTE |
| AC-066 | **HTML longo e tabelas** — Abrir mensagem extensa com tabela larga e trechos citados. | Conteúdo integral acessível; sem corte definitivo de 280 px; estrutura compreensível. | Visual + E2E | PENDENTE |
| AC-067 | **Abertura de links** — Acionar link do corpo/site do contato com protocolos válidos e hostis. | Somente destinos permitidos, noopener adequado e sem confiança empresarial inferida. | Browser + segurança | PENDENTE |
| AC-068 | **Selo e checks** — Carregar dados sem evidência de verificação/entrega/leitura de destinatário. | Nenhum selo verificado/entregue/lido é inventado; estado local usa rótulo correto. | Componente + revisão | PENDENTE |
| AC-069 | **Mídia incorporada ausente** — Mensagem referencia CID ou data image não suportada. | Placeholder explica indisponibilidade; nenhuma URL fictícia ou busca arbitrária em outra origem. | Componente + segurança | PENDENTE |
| AC-070 | **Proteção de ambiente** — Executar bateria com backend interceptado e inspecionar logs/artefatos. | Nenhuma chamada mutável real, secret, sessão ou conteúdo privado publicado. | Auditoria de execução | PENDENTE |

## Acessibilidade, responsividade e entrega

| ID | Verificação / cenário | Resultado esperado | Evidência | Status |
|---|---|---|---|---|
| AC-071 | **Larguras e zoom** — Executar matriz de oito larguras/formatos e zoom 200%. | Sem scroll horizontal da página nem conteúdo/ações inacessíveis; rail vira drawer quando necessário. | Visual + geometria | PENDENTE |
| AC-072 | **Teclado e foco** — Usar só Tab, Shift+Tab, Enter, Esc; abrir/fechar menus/dialogs. | Todas as ações alcançáveis, foco visível e restaurado, sem armadilhas involuntárias. | Acessibilidade E2E | PENDENTE |
| AC-073 | **Touch e hover** — Executar em viewport touch sem hover. | Responder/encaminhar/mais/arquivos continuam acessíveis; alvos adequados. | E2E | PENDENTE |
| AC-074 | **Contraste** — Medir texto/estados/ícones em temas implementados, incluindo selecionado e portal. | Requisitos aplicáveis atendidos; não declarar AA sem medição. | Acessibilidade + relatório | PENDENTE |
| AC-075 | **Scroll e movimento** — Ler mensagem antiga; receber nova; carregar imagem; ativar reduced-motion. | Âncora preservada, aviso de novas mensagens e animações adequadas. | E2E | PENDENTE |
| AC-076 | **Composer e FAB** — Abrir compositor e teclado virtual; testar FAB desktop com rail aberto/fechado. | Enviar/anexar não ficam cobertos; controle global tem posição ou alternativa funcional. | Geometria + E2E | PENDENTE |
| AC-077 | **Volume e recursos** — Usar fixture de mil threads paginadas e thread longa com anexos. | Sem download em massa de binários, listeners duplicados ou crescimento não limitado; medir antes/depois. | Performance | PENDENTE |
| AC-078 | **Coleta de testes** — Rodar projeto/spec Email dedicado e conferir relatório, sem login real implícito. | Número de testes é maior que zero e cobre cenários acordados; não reutilizar chromium que só coleta auth. | Infra QA | PENDENTE |
| AC-079 | **Regressão do projeto** — Executar typecheck, build, lint tocado, testes pertinentes e legado Gmail. | Resultados registrados de verdade; dívidas anteriores separadas; guard/CI não enfraquecidos. | Build + CI | PENDENTE |
| AC-080 | **Entrega revisável** — Revisar diff, screenshots, contratos e eventuais migrations propostas. | Nenhum deploy/DDL/envio real automático; checklist honesto, pendências com motivo e plano de rollback. | Revisão final | PENDENTE |

## Registro de execução sugerido

```text
Commit implementado:
Data/ambiente:
Comando:
Testes coletados / aprovados / reprovados / ignorados:
Critérios cobertos:
Artefatos:
Limitações / chamadas interceptadas:
```

As capturas aprovadas de DOM podem virar baseline de regressão. A imagem de referência serve para avaliar composição e linguagem visual, não como baseline de pixel-diff com textos/dados diferentes. Nunca atualizar snapshots para esconder regressão.

