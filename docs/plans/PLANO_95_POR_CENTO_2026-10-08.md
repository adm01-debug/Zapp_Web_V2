# Plano 95%: cada agente entregar certo de primeira (08/10/2026)

Pedido do Joaquim: "gerir bem os agentes de forma que possamos subir para 95% de acertos cada agente". Medida: **aceite de primeira** = entregas integradas sem voltar como `[refazer]`, por agente, por semana.

## 1. Onde estamos (medido em 08/10 ~22h; CORRIGIDO: a 1ª versão deste plano dizia 28% e estava errada)

A primeira medição contava como "aceite" só o que já estava **integrado**, mas 305 entregas já aprovadas pelo revisor esperam vaga no integrador (3 a 4 por hora). Definição certa: **aprovada = o revisor ou o portão aprovou**, mesmo aguardando vaga. Aprovação de 1ª = cartão que não é `[refazer]`.

| Agente | 1ª passagem, 7 dias | 1ª passagem, 24 h |
|---|---|---|
| hugo | 75% | 86% |
| iris | 73% | 75% |
| edgar | 62% | 76% |
| workertestes | 65% | 74% |
| vera | — | 73% |
| worker | 46% | 69% |
| workersql | 28% | 63% |
| complexo | 36% | 100% (n=9) |
| workeria | 31% | 31% |
| senior (só refazer) | 60% | 60% |
| **todos** | **69%** | **73%** |

Distância real até 95%: cerca de 22 a 26 pontos, e a tendência já sobe (os dias anteriores eram piores). Mediana início→integrado: 27 h, dominada pela fila do integrador, não pelo agente.

## 2. Por que recusa (44 recusas lidas uma a uma, não por palavra-chave)

| Classe | Quantas | Exemplo real |
|---|---|---|
| Relato ou documento afirma o que o diff não mostra (contagem inventada, "coberto" sem teste, comentário com a semântica antiga, doc que se contradiz) | ~17 (38%) | "diz 281 inserções, o diff mostra 303"; "relato diz que types.ts declara Json, o diff mostra boolean" |
| Teste que não prova (passa sem a mudança, carimba verde, asserção afrouxada, contrato errado) | ~9 (20%) | "`valor==='a' && antes>=depois` passa mesmo sem filtrar nada" |
| Defeito real criado pelo diff | ~10 (23%) | "o dedupe vaza quando o envio falha"; "fallback devolve lista vazia" |
| `[refazer]` que resolve parte dos pontos ou repete o mesmo tipo de defeito (senior) | 8 (18%) | "pontos 1, 2 e 4 resolvidos; o 3 não" |
| Violou instrução do cartão (arquivo fora da lista, commit quando o cartão mandava fechar sem commit, migration em cartão de doc) | 5 (11%) | "o cartão manda fechar sem commit; o agente criou um controle novo em arquivo fora da evidência" |
| Regra permanente (movimento sem `motion-safe`), incompleto vs título | 3 | — |

Falhas de verificação (18): 6 por teste do CI (contrato pdfjs/schemas, inventário de testes) que o próprio cartão quebrou; 3 por token/ref de produção no diff; 5 por teste alheio vermelho depois de integrar; 2 por branch que andou depois do fechar.

Por que o portão retém 94% (e a aprovação continua sendo do revisor, não do portão): a pergunta do Jev "evidência limpa" exige que o relato **cite execução concreta com zero falhas e zero pulados**; os agentes escrevem `zapp-verify --rapido` como rótulo, sem a linha de resultado.

## 3. Estratégia: medir por máquina o que hoje é escrito à mão

Regra geral: tudo que é número, lista de arquivo ou resultado de comando **sai do fechar, não do agente**. O agente escreve só o raciocínio.

### 3.1 `hermes-tarefa-fechar` (todos os agentes, sem mudar o fluxo)
1. **FATOS MEDIDOS**: o fechar põe no começo do relato `git diff --stat`, a lista de arquivos e o resultado real dos testes alterados ("Test Files N passed, Tests N passed"). O juiz, o portão e o revisor leem esse bloco. Mata a classe 1 (contagens) e a retenção por "evidência limpa".
2. **Prova vermelho→verde**: os testes que o cartão alterou rodam no commit (têm de passar) e na base da dia (têm de falhar). Se passam na base, o fechar para uma vez: "teste não prova o defeito". Mata parte da classe 2.
3. **Portão do integrador antes de fechar** (pedido "use mais o Jev em cada agente"): o mesmo `portao_saida.py` da fila roda no workspace; se vai reter por motivo que o agente pode corrigir (evidência, coerência, ressalva, teste fraco, afrouxa), o fechar para uma vez e diz o motivo. O agente corrige antes de gastar um ciclo.
4. **Cartão no workspace** (`.tmp/cartao.md`): o fechar baixa o cartão do kanban. Com isso o juiz v3 passa a ver o pedido (hoje via só o título e a nota caía 0,18) e, em `[refazer N]`, o fechar exige no relato um "Ponto k" para cada item do "corrigir" anterior. Ataca a classe 4.
5. Resumo da verificação rápida (tipos/lint verdes, tempo) entra no relato que vai para a fila.

### 3.2 Skills por agente (data-driven, das recusas reais)
- `relato-que-passa` (todos): o formato que o portão e o revisor aceitam; o que é "evidência limpa"; nunca escrever número à mão; "Ponto k" em refazer; "fechar sem commit" quando o cartão manda.
- `armadilhas-<perfil>` (senior, worker, iris, complexo, workertestes, workeria, vera, edgar, workersql, hugo): 5-8 regras tiradas das recusas do próprio perfil, cada uma com o caso real.
- `autorrevisao-antes-de-fechar` ganha o "Passo 0: leia os FATOS MEDIDOS" e as classes de 08/10.

### 3.3 Revisor
- Confia no bloco FATOS MEDIDOS para números; divergência de contagem no texto do agente vira observação, não recusa.
- Em `[refazer]`: responde ponto a ponto ("Ponto k: resolvido/não") antes de qualquer defeito novo.
- Cartões SL-/TL- com evidência sem arquivo: aceita arquivos do módulo do título.

### 3.4 Jev: treinar de novo e configurar
- Treino de 06/10 tinha 334 entregas (81% de um só dia); hoje há **+601 julgadas** (369 integradas, 232 recusadas). Refazer o conjunto, rodar as perguntas, treinar e medir nos 20% mais novos. Só troca o modelo se a AUC não cair.
- Configurar: cartão no workspace (3.1.4) para a nota do fechar ter o pedido; limiar do aviso no fechar recalibrado com o modelo novo; portão simulado no fechar (3.1.3).

### 3.5 Cartões e processo
- 10 cartões SL abertos pedem arquivos que o portão proíbe (CI, baseline, config): saem da fila dos agentes e ficam com o Claude.
- Cartões de edgar/workersql não carregam mais "sem DDL/Edge" (a regra contradizia o ofício; 0% de aceite).
- Placar por agente (`saude/placar_agentes.py`): aceite de primeira em 24 h e 7 dias, classe de recusa dominante; entra no resumo da hora.

## 4. Metas (honestas)
- Semana 1 (até 15/10): média de aceite de primeira ≥ 60%; nenhum perfil em 0%; retenção do portão < 60%.
- Semana 2: ≥ 80%; mediana início→integrado < 8 h.
- 95% por agente é a meta de régua, não de calendário: será atingida quando as classes 1, 2 e 4 (76% das recusas) estiverem fechadas por máquina e só sobrar a classe 3 (defeito real), que o revisor tem de continuar pegando. Medir toda semana; o que não mover em 7 dias é redesenhado.
