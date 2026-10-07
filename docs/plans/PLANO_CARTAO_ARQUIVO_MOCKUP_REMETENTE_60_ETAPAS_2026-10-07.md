# PLANO — CARTÃO DE ARQUIVO IGUAL AO MOCKUP (FOTO DE QUEM ENVIOU, NOME, TIPO, TAMANHO, PLAY) — 60 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end + 1 consulta a mais (sem DDL, sem Edge Function, sem migration, sem dependência nova).
> **Pedido do dono (com o mockup):** no cartão de cada arquivo compartilhado aparecer a **foto de quem enviou** (o próprio usuário, o contato, ou — se vários atendentes participaram — o atendente que enviou aquele arquivo), o **nome do arquivo**, o **tipo**, o **tamanho** e, em áudio e vídeo, o **sinal de play**.
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Mockup × hoje (dia/2026-10-07)
| Item do mockup | Hoje | Lacuna |
|---|---|---|
| Nome do arquivo em destaque (`abridor-madeira.jpg`) | Título = `displayName`: o nome real **quando é nome humano**; arquivo de WhatsApp com nome técnico (hex) vira "Imagem · 25/09 09:40" (regra `isTechnicalFilename`) | manter a regra; deixar claro quando é nome real; reservar a 1ª linha só para o nome |
| Linha "Imagem · 2,4 MB" | `formatMeta` junta tipo · tamanho · data numa linha só, truncada ("Imagem · 25/09/2026 às 1…"); no print o **tamanho não aparece** (dado nulo ou cortado) | separar em linhas; tamanho visível; verificar `media_size` nulo |
| Data "Hoje, 16:10" / "Ontem, 14:32" / "02 set 2026, 18:45" | "25/09/2026 às 12:41" (formato longo) | formato curto relativo |
| **Foto de quem enviou** + nome ("Você", "Joaquim") | Só em ≤ 4 colunas, **uma bolinha com a inicial** (e "V" para o atendente); a consulta **não traz o autor** (`senderLabel` é "Atendente" ou o nome do contato) | **falta o dado**: `messages.agent_id` existe e não é selecionado; falta resolver foto/nome do atendente e do usuário logado |
| Selo do WhatsApp junto do remetente em alguns cartões | não existe | decidir a regra (ver D05) |
| Vídeo: miniatura + **play** + duração `0:28` | só ícone de play quando há erro; duração só no tamanho card (cartão M02 já corrige o quadro/duração) | play sempre visível + duração |
| Áudio: **círculo azul de play + onda + duração `0:15`** | ícone de ondas + rótulo "Áudio" (cartão A01 adiciona play na linha de ações) | play dentro da miniatura, como no mockup |
| Ações no cartão: olho, **baixar**, encaminhar, ⋮ | olho, compartilhar, ⋮ | ícone de baixar (sujeito à política de download) |
| Cartão selecionado com borda azul + painel de detalhes à direita | painel inline de 260 px existe | painel: foto de quem enviou, legenda, ações do mockup |
| Título "Arquivos compartilhados" + subtítulo, botão de filtro (funil), ordem "Mais recentes" | título "Arquivos"; o padrão de ordem **já é "Mais recentes"** (no print estava "Maiores" por escolha) | subtítulo e funil (decisão D08) |

## 2. Dados disponíveis (verificado)
`messages`: `sender` ∈ {`agent`,`contact`}, **`agent_id` (uuid, nulo permitido)**, `channel_type`, `media_filename`, `media_size`, `media_meta`, `caption`, `created_at`. `profiles`: `name`, `avatar_url`, `nickname`. `contacts`: `name`, `avatar_url`. O gancho `useDownloadPermission` já decide se o usuário pode baixar (usado em `ImagePreview`).

## 3. Decisões (o dono pode reverter)
- **D01.** Quem enviou: `sender = 'contact'` → foto e nome do **contato**; `sender = 'agent'` com `agent_id` = usuário logado → **"Você"** com a foto dele; `agent_id` de outro atendente → **foto e nome dele**; `sender = 'agent'` sem `agent_id` (enviado pelo celular ou automação) → ícone neutro "Equipe" (ver D05).
- **D02.** Sem foto: círculo com as iniciais e cor estável por pessoa (mesma pessoa = mesma cor).
- **D03.** Em 5 colunas só a foto (com o nome na dica); em ≤ 4 colunas foto + nome.
- **D04.** Resolver fotos e nomes **em lote** (uma consulta por tela, em cache), nunca uma por cartão.
- **D05 (DECIDIDA pelo dono em 07/10).** **Nenhum selo de canal/origem.** O cartão não diz de onde veio o arquivo (nada de WhatsApp, celular ou canal): só a foto e o nome de quem enviou. O selo que o mockup mostra em alguns cartões **não será implementado**.
- **D06 (APROVADA pelo dono em 07/10).** **Baixar:** segue a política do sistema (`useDownloadPermission`): permitido = baixa; bloqueado = ícone com cadeado e explicação. **Não** se remove a política de segurança por causa do mockup.
- **D07 (DECIDIDA pelo dono em 07/10).** **Copiar link** e **Salvar na galeria** **não entram**: o painel de detalhes fica sem esses dois botões, **como está hoje**.
- **D08.** Subtítulo "Todos os arquivos, mídias e documentos desta conversa." entra; o botão de filtro (funil) abre um painel com o **período** (cartão F01) e o **remetente** (filtro novo, opcional).
- **D09.** Nome do arquivo: nome humano em destaque; nome técnico continua escondido atrás de "Tipo · data" (e visível na dica).
- **D10.** Duração do áudio vem de `media_meta` quando existir; senão é lida **sob demanda** (só quando o cartão aparece), sem baixar o áudio todo.

## 4. Relação com os cartões já criados
M01–M05 (miniaturas/figurinhas), **M02** (vídeo: quadro + duração), **A01** (play do áudio), **F01** (filtro de data), **C04** (colunas), **V01** (janela). Esta entrega **não** repete nada disso: usa o que eles entregam e acrescenta o autor, o layout do cartão e o play dentro da miniatura. Por isso a **onda 1** só toca em arquivos novos ou que nenhum deles edita, e a **onda 2** espera M01, M02 e A01 integrados.

## 5. As 60 etapas
**A. Dado do autor (R01)** — S01 inspecionar `agent_id`/`sender` na base local · S02 incluir `agent_id` no `SELECT_COLUMNS` · S03 campo `agentId` em `ContactMediaItem` · S04 mapear sem mudar o resto · S05 testes do mapeamento · S06 `src/lib/fileSenderIdentity.ts` (função pura: item + usuário logado + contato + perfis → {tipo, nome, foto}) · S07 regras D01 · S08 "Você" quando é o usuário logado · S09 atendente sem `agent_id` = "Equipe" · S10 hook em lote `useMediaSenderProfiles` (uma consulta por tela, cache) · S11 só pede ids que faltam · S12 trata RLS/erro sem quebrar (cai nas iniciais) · S13 testes de S06–S12.
**B. Foto de quem enviou (R02)** — S14 componente `SenderAvatar` (tamanhos sm/md) · S15 foto com fallback nas iniciais · S16 cor estável por pessoa (hash do id) · S17 ~~selo de canal opcional~~ **CANCELADA (D05): sem selo de canal** · S18 `title`/`aria-label` "Enviado por X" · S19 imagem quebrada → iniciais · S20 não pisca ao recarregar (cache do navegador) · S21 testes.
**C. Texto do cartão (R03)** — S22 `formatCardDate` ("Hoje, 16:10", "Ontem, 14:32", "02 set 2026, 18:45") · S23 linha "Tipo · tamanho" (sem tamanho = só tipo) · S24 nome legível (D09) · S25 formato do tamanho (KB/MB com vírgula) · S26 testes (virada de dia, fuso, tamanho nulo, nome técnico) · S27 investigar `media_size` nulo na base local.
**D. Cartão (R04, onda 2)** — S28 1ª linha = nome (1 linha, reticências, dica com o nome completo) · S29 2ª linha = tipo · tamanho · S30 3ª linha = data curta · S31 linha do remetente com `SenderAvatar` (D03) · S32 ações: olho · baixar (D06) · encaminhar · ⋮ · S33 cartão selecionado com borda azul · S34 modo Selecionar mantém o marcador · S35 alinhamento em 3, 4 e 5 colunas · S36 altura uniforme · S37 teclado e foco · S38 testes.
**E. Miniatura com play (R05, onda 2)** — S39 vídeo: círculo de play sempre visível sobre o quadro · S40 vídeo: duração no canto · S41 áudio: círculo azul de play + onda + duração dentro da miniatura (reusa o botão do A01) · S42 tocar/pausar sem abrir a janela · S43 duração do áudio (D10) · S44 estado "carregando/erro" · S45 documento: ícone por família + selo da extensão (já existe, conferir) · S46 testes.
**F. Lista, Tabela e detalhes (R06, R07, onda 2)** — S47 Lista: foto + nome do remetente · S48 Tabela: coluna "Enviado por" · S49 painel: "Enviado por" com foto · S50 painel: legenda do arquivo · S51 painel: Baixar (D06) · S52 painel: Encaminhar habilitado (hoje "Disponível em breve", embora o cartão já encaminhe) · S53 painel: Excluir (já existe) · S54 ~~Copiar link e Salvar na galeria~~ **CANCELADA (D07): ficam como estão (sem os botões)**.
**G. Cabeçalho e fechamento (R08, R09, Claude)** — S55 subtítulo e funil (D08) · S56 filtro por remetente · S57 E2E (`e2e/arquivos-cartao.spec.ts`, novo) · S58 verificação visual na pré-visualização (3/4/5 colunas, claro/escuro, celular 390 px, conversa com vários atendentes, com e sem foto) · S59 bundle ≤ 343 KB, tsc, lint, contratos · S60 documentação (`docs/design/`) e registro de estado.

## 6. Cartões
**Onda 1 (arquivos novos ou sem conflito; criada agora):** **R01** [hugo] S01–S13 · **R02** [iris] S14–S21 · **R03** [hugo] S22–S27.
**Onda 2 (depois de R01–R03, M01, M02 e A01 integrados):** **R02b** [iris] remover do `SenderAvatar` a opção `channelBadge` e o selo (D05) e os testes dela · **R04** [iris] S28–S38 · **R05** [iris] S39–S46 · **R06** [iris] S47–S48 · **R07** [iris] S49–S54 · **R08** [iris] S55–S56 · **R09** [workertestes] S57 · **R10** [vera] S60. **Claude:** S58–S59.

## 7. Perguntas ao dono — RESPONDIDAS em 07/10/2026
1. **Baixar** respeita a política de segurança: **APROVADO** (D06). 2. **Copiar link** e **Salvar na galeria**: **não implementar**, deixar como está (D07). 3. **Selo do WhatsApp / origem do arquivo**: **não implementar**; o cartão não menciona de onde veio o arquivo (D05).

## 8. Fora de escopo
Alterar a política de download; mudar o armazenamento dos arquivos; reconhecer a pessoa pela foto; **qualquer indicação de canal ou origem do arquivo**; botões Copiar link e Salvar na galeria.

## 9. Estado de execução
_A preencher._ Onda 1 criada em 07/10/2026.
