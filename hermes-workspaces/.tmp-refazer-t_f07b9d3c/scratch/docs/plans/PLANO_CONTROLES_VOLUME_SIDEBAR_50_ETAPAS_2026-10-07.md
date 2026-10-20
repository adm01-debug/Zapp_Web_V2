# PLANO — CONTROLES DE VOLUME (ALTO-FALANTE E FONE) NA SIDEBAR: ACHAR E CORRIGIR OS BUGS — 50 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end (sem DDL, sem Edge Function, sem migration, sem dependência nova).
> **Pedido do dono:** "o certo é o fone e o alto-falante terem uma forma de subir e abaixar e também anular o som — isso não está acontecendo. Teste, valide, descubra os bugs, plano de 50 etapas, exaustivo e minucioso."
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. O que foi TESTADO (pré-visualização `8e356134f`, Chromium via Playwright, usuário local; 07/10/2026)
**Funciona (medido):** clique no alto-falante e no fone = mudo/desmudo; **clique longo (≥ 400 ms, mouse)** abre o slider vertical 0–100 com botão "Mudo"; setas do teclado ±5 %; roda do mouse ±5 %; tecla M; volume dos alertas persiste no banco (`user_settings`) e o das mídias em `localStorage` (`zapp.media.volume`); Esc fecha. **67 testes automatizados** do volume passam (MediaVolume, SoundVolumeControl, useVolumeRocker, mediaVolumeElement, mediaVolumeStore).

**Falha / risco (medido):**
| # | Bug | Evidência |
|---|---|---|
| B1 | **O ajuste está escondido:** o slider só abre com clique longo; o clique comum só muda o mudo. Nada na tela indica isso. É a causa do "não tem como subir e abaixar". | clique = mudo, sem slider; ver `useVolumeRocker.ts` (`LONG_PRESS_MS = 400`) |
| B2 | **No toque o slider fecha ao soltar o dedo** (no mouse fica aberto): inutilizável em celular/tablet/notebook com tela de toque. | toque longo 900 ms: abriu; após soltar: fechou |
| B3 | **3 dos 6 botões não têm dica** ao passar o mouse: alto-falante, fone e acessibilidade (o sino, o cadeado e o tema têm). `VolumeTriggerButton` só usa `title` fora da sidebar. | `aria-describedby`/`title` nulos; nenhuma dica em 4 s |
| B4 | **Rótulos inconsistentes:** o alto-falante diz "Volume dos alertas: 70 %"; o fone diz só "Volume dos áudios e vídeos" (sem %); o painel do fone abre com o título "VOLUME", o dos alertas com "VOLUME DOS ALERTAS". | leitura do `aria-label` e do painel |
| B5 | **Roda do mouse muda o volume sem querer** enquanto o cursor passa sobre o botão (rolando a sidebar). | 70 → 75 % só com a roda |
| B6 | **Cada passo grava no banco** (sem agrupar): 7 gravações em `user_settings` em ~10 ações. | rede do navegador |
| B7 | **O volume das mídias é por navegador**, não por usuário nem por aparelho logado; dois usuários no mesmo navegador dividem o valor. | `localStorage` com chave única |
| B8 | **O painel aberto cobre os botões vizinhos** (fone, tema, acessibilidade) na sidebar expandida. | captura de tela |
| B9 | **Não foi provado som real:** a base local não tem áudio de conversa; nenhum teste mede `audio.volume` em reprodução real (mensagem, janela do arquivo, player novo A01, vídeo). | sem mídia na conversa de teste |
| B10 | **Possível teto:** o toque da chamada recebida usa `soundVolume/100 × 0,2` (no máximo 20 % de ganho). Pode ser intencional; precisa de decisão. | `IncomingCallAlert.tsx:127` |
| B11 | O ponto azul significa coisas diferentes (sino = ligado; volume = baixo/mudo) sem legenda. | leitura do código |

## 2. Decisões (o dono pode reverter)
- **D01.** **Clique no alto-falante/fone abre o painel** (slider vertical, % grande, botões **−** e **+** de 5 %, botão grande **Silenciar / Ativar som**). O mudo rápido continua pela tecla **M**, pelo botão dentro do painel e pelo clique longo (compatível com hoje).
- **D02.** O painel **fica aberto até clicar fora, Esc ou perder o foco**, também no toque (corrige B2); no toque o slider arrasta.
- **D03.** Os 6 botões ganham **dica** com estado + instrução ("Volume dos alertas: 70 % — clique para ajustar").
- **D04.** Rótulos e títulos iguais nos dois controles (com %).
- **D05.** A roda do mouse só ajusta **com o painel aberto**.
- **D06.** Gravação no banco **agrupada** (espera ~400 ms depois do último movimento; desfaz se falhar).
- **D07.** Volume das mídias passa a ser **por usuário no aparelho** (`zapp.media.volume.<userId>`), com migração do valor antigo; segue sem DDL.
- **D08.** O painel **não cobre** os vizinhos (abre para o lado/ancora fora da linha de botões).
- **D09.** B10 fica como **investigação**: confirmar a intenção do ×0,2 antes de mexer.

## 3. As 50 etapas
**A. Prova antes de consertar (S01–S08)** — [Claude] já feitas S01–S04
S01 mapear os 6 botões e rótulos ✔ · S02 testar clique/clique longo/teclado/roda/M ✔ · S03 testar tooltips ✔ · S04 testar toque e persistência ✔ · S05 semear 1 áudio e 1 vídeo sintéticos na base local (arquivo gerado, sem dado real) · S06 conversa com áudio de mensagem para teste · S07 medir `audio.volume` real em 5 players (mensagem, janela do arquivo, player A01, vídeo, gravação de chamada) · S08 registrar o resultado desta prova neste documento.

**B. Interação do painel (S09–S24)** — cartão **Q01** [iris]
S09 clique abre o painel · S10 painel mostra % grande · S11 botões −/+ de 5 % · S12 botão Silenciar/Ativar som com estado visível · S13 fecha ao clicar fora · S14 fecha com Esc · S15 devolve o foco ao botão ao fechar · S16 **toque: painel não fecha ao soltar** (B2) · S17 toque: slider arrastável e botões ≥ 44 px · S18 clique longo continua abrindo (compatível) · S19 tecla M e Enter funcionam com o painel fechado/aberto · S20 roda só com painel aberto (B5) · S21 painel ancorado sem cobrir vizinhos (B8) · S22 ícone reflete mudo/baixo/médio/alto · S23 ponto de atenção só quando mudo ou < 30 % · S24 teste de componente para cada item de S09–S23.

**C. Dicas, rótulos e acessibilidade (S25–S32)** — cartões **Q01** (S25, S26, S30–S32), **Q03** (S28, S29) e **Q04** (S27)
S25 dica no alto-falante · S26 dica no fone · S27 dica na acessibilidade (B3) · S28 `aria-label` do fone com % (B4) · S29 título do painel igual nos dois ("Volume dos alertas" / "Volume dos áudios e vídeos") · S30 slider com `aria-valuetext` ("70 por cento") · S31 painel com `role="dialog"`, rótulo e foco preso · S32 legenda do ponto azul na dica (B11).

**D. Persistência e consistência (S33–S40)** — cartões **Q02** e **Q03** [hugo]
S33 chave por usuário `zapp.media.volume.<userId>` (B7) · S34 migrar a chave antiga uma vez · S35 sincronizar entre abas do mesmo navegador (evento de armazenamento) · S36 alertas: agrupar gravações (B6) · S37 alertas: desfazer na tela se a gravação falhar, com aviso curto · S38 alertas: indicador de "salvando" sem travar o slider · S39 mudo e volume não se misturam (sair do mudo restaura o último volume) · S40 testes de S33–S39.

**E. O som obedece de verdade (S41–S45)** — cartão **Q06** [workertestes] e investigação do Claude
S41 janela de visualização do arquivo obedece (`MediaPreviewDialog`) · S42 player de mensagem de áudio obedece · S43 **player novo do cartão (A01) usa o volume das mídias** · S44 vídeo e gravação de chamada · S45 B10: confirmar a intenção do ×0,2 do toque da chamada; se não for intencional, corrigir e testar.

**F. Fechamento (S46–S50)** — [Claude] e cartões **Q05** [workertestes] e **Q07** [vera]
S46 E2E (`e2e/quick-controls-volume.spec.ts`, novo) cobrindo B1–B5 · S47 verificação visual na pré-visualização: sidebar expandida e recolhida, claro e escuro, celular 390 px, toque · S48 auditoria de acessibilidade (teclado, leitor de tela, contraste) · S49 bundle inicial ≤ 343 KB, tsc, lint, contratos · S50 documentação (`docs/design/`) + registro de estado e decisões do dono.

## 4. Cartões e ordem
**Onda 1 (arquivos independentes, criada agora):** **Q01** [iris] S09–S26 e S30–S32 (painel, dicas dos botões de volume, acessibilidade do painel) · **Q02** [hugo] S33–S35 (armazenamento por usuário e sincronia) · **Q03** [hugo] S28–S29 e S36–S39 (rótulos e gravação agrupada) · **Q04** [iris] S27 (dica do botão de acessibilidade).
**Onda 2 (depois da integração):** **Q05** [workertestes] S46 · **Q06** [workertestes] S41–S44 · **Q07** [vera] S50.
**Claude:** S05–S08, S45, S47–S49.

## 5. Fora de escopo
Mudar o som dos alertas; equalizador; tocar vídeo no cartão; coluna nova no banco para o volume das mídias.

## 6. Estado de execução
_A preencher._ Onda 1 criada em 07/10/2026.

## Automação das ondas seguintes (programada em 07/10/2026)

Todos os cartões abaixo **já estão escritos e programados** no motor de gatilhos (`~/arquitetura-v2/gatilhos/`): **cada um nasce sozinho** no quadro, para o perfil indicado, assim que os cartões de que depende estiverem **integrados** na branch do dia (não basta o agente terminar). O motor roda a cada 5 minutos (timer do usuário) e a cada ~30 minutos pelo lembrete do Claude; é idempotente. O painel **GATILHOS_07-10.md** na área de trabalho mostra o que já nasceu e o que ainda espera. As **verificações visuais** que só o Claude faz ficam no painel de pendências do Claude. Regras permanentes em todos: nenhuma informação sai do sistema, só cores do sistema, efeitos sutis com reduzir movimento, sem selo de canal/origem.

| Cartão | Perfil | Nasce quando estiverem INTEGRADOS | O que faz |
|---|---|---|---|
| **Q05** | workertestes | Q01, Q02, Q03, Q04 | Volume da sidebar: teste de ponta a ponta |
| **Q06** | workertestes | Q02, Q03, A01 | Volume: o som obedece de verdade nos players |
| **Q07** | vera | Q01, Q02, Q03, Q04, Q05 | Volume da sidebar: documentação |
| **Q08** | iris | A01, Q02 | Volume: player de áudio do cartão obedece o volume das mídias |
| **Q10** | hugo | Q03 | Volume: documentar e testar o teto de ganho do toque de chamada |

> **Pergunta ao dono ainda aberta (B10):** o toque da chamada recebida usa no máximo 20 % de ganho (`soundVolume/100 × 0,2`). O cartão Q10 só **documenta e testa** o valor atual; se o dono quiser mudar, abre-se um cartão novo. Padrão se não houver resposta: manter.
