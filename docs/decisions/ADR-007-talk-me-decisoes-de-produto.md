# ADR-007 — TALK ME: decisões de produto, escopo e operação

**Data:** 20/10/2026
**Situação:** aceito (revisável)
**Contexto:** o plano `PLANO_TALK_ME_100_ETAPAS_2026-09-30.md` deixou 8 premissas explicitamente não aprovadas ("premissas propostas"), e a implementação entrou em produção por outra PR (#1310) antes de qualquer registro nominal. A auditoria de 20/10 (`TALK_ME_RASTREABILIDADE_2026-10-20.md`) mostrou que a decisão nunca foi escrita: ficou implícita no código.
**Decisão:** este ADR registra o que está de fato implementado, o que passa a valer a partir de agora e o que continua dependendo do Joaquim. Autor: sessão de execução, sob delegação explícita do Joaquim para decidir e executar; toda decisão aqui é revisável por ele.

## D1 — A tela é um diálogo de tela ampla, não uma rota
Mantém o Inbox montado atrás, o que preserva rascunho, anexos não enviados, filtros e contato selecionado.
**Custo aceito:** refresh fecha a tela; não existe link direto para a fila; o botão "voltar" do navegador não controla a tela.
**Alternativas descartadas:** rota dedicada (perderia o rascunho ou exigiria serializar estado do Inbox) e painel lateral (não comporta o carrossel nem a leitura da mensagem).

## D2 — "Departamento" é fila ativa (`queues`)
Atendente vê apenas filas das quais é membro ativo; administrador e supervisor operam todas as filas ativas. Filas inativas, perfil inativo e vínculo removido não aparecem nem aceitam.
**Fila inicial:** a última escolhida na sessão (`sessionStorage`); sem escolha válida, a fila com maior espera (ordenação determinística por contagem, nome e id).
**Não fazer:** criar conceito novo de "departamento" separado de fila — duplicaria a fonte de verdade de roteamento.

## D3 — A unidade de atendimento é o contato/conversa
Um contato elegível = um cartão. Várias mensagens pendentes do mesmo contato continuam sendo um cartão, com contador de pendentes.

## D4 — Elegibilidade
Entra na fila o contato que satisfaz **todas**: sem responsável (`assigned_to IS NULL`), não excluído, status `open` ou `waiting`, canal `whatsapp`, não é grupo, e a **última mensagem efetiva é do contato** (não houve resposta do agente depois).
**Bloqueado / bot:** o modelo não possui coluna de bloqueio nem de bot em `contacts` (verificado no banco vivo em 20/10/2026). Não se inventa filtro que não existe. Efeito prático: se um bot responde, a última mensagem passa a ser do agente e o contato sai da fila — comportamento correto porém **acidental**, registrado aqui como tal.
**Arquivado/resolvido:** excluídos pelo filtro de status. Reaberto volta a ser elegível se as demais condições valerem.

## D5 — Ordem e navegação
Espera mais antiga primeiro (primeira mensagem do bloco pendente), desempate por UUID estável. Carrossel **manual**, sem autoplay, sem rotação automática. Navegar apenas destaca; o vínculo só acontece no CTA "Aceitar e conversar".

## D6 — Contador
Conta **conversas elegíveis** do departamento selecionado, não mensagens. Em erro de consulta o contador fica ausente (`null`), nunca "0". Acima de 99 a UI mostra "99+", mas o nome acessível sempre traz o número exato.

## D7 — Histórico antes do aceite
Exibe cliente, saída do agente e nota interna, **cada um com rótulo explícito** ("Cliente", "Saída", "Nota interna"), em ordem cronológica, com teto de 200 mensagens. Ler o histórico não assume o atendimento nem marca mensagens como lidas.
**Motivo:** o atendente precisa de contexto para decidir se assume; esconder a saída anterior produz aceite às cegas.

## D8 — Mídia antes do aceite
Imagem, vídeo, áudio e documento são acessíveis **apenas sob clique**, nunca em autoplay. Áudio/vídeo em reprodução param ao trocar de contato ou fechar a tela. Falha de mídia cai no texto descritivo atual, sem quebrar layout.
**Motivo:** antes, o cartão dizia apenas "Imagem recebida"/"Mensagem de áudio" — o atendente assumia sem saber o que havia recebido.

## D9 — Exposição: flag global ligada; piloto por fila não implementado
`inbox.talk-me = true` para todos desde 30/09/2026. O piloto controlado previsto (fila única, público declarado, critério e janela) **não foi executado** — e há indício de baixa adoção (3 aceites registrados em `audit_logs` até 20/10/2026).
**Decisão desta rodada:** não alterar a exposição em produção sem o Joaquim, porque isso muda o que ~centenas de atendentes veem. Em vez disso, instrumentar (telemetria agregada, sem conteúdo de mensagem) para que a decisão de piloto/expansão tenha número.
**Cabe ao Joaquim:** escolher recorte de piloto (por fila) e janela de observação.

## D10 — Reversão
Desligar a flag remove a entrada de forma consistente e **não** devolve à fila contatos já aceitos, nem apaga auditoria. Reversão de código é revert do PR; nenhuma migration é destrutiva.

## Consequências
- O produto ganha rastreabilidade: cada decisão acima tem etapa e teste correspondentes no plano de 70 etapas.
- Fica explicitamente pendente de decisão do Joaquim: recorte de piloto (D9) e homologação nominal da experiência.
- Nenhuma destas decisões autoriza DDL em produção: migration nova entra por PR aberta e é aplicada pelo fluxo `db-migrate.yml` com aprovação.
