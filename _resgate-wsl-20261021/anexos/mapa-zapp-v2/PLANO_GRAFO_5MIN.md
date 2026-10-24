# Plano: grafo do Zapp Web V2 atualizado a cada 5 minutos

Escrito em 04/10/2026 pela sessão do Claude no WSL. **Nada deste plano foi executado.** Escopo: só o Zapp Web V2.

## 1. O que foi medido antes de planejar

| Medida | Valor | Como medi |
|---|---|---|
| Tempo de uma reconstrução do grafo sem IA (`graphify update`) | 39 s | cópia de teste da `main`, 24 núcleos |
| Memória usada na reconstrução | 1,5 GB (a máquina tem 31 GB, 20 livres) | `/usr/bin/time` |
| A reconstrução sem IA preserva os nós de IA? | Sim: 848 conceitos, 115 imagens e 7.887 documentos continuaram | contagem antes e depois |
| A reconstrução é incremental? | Não: leva 38 s mesmo sem nada ter mudado | segunda execução seguida |
| Ritmo de commits na `main` | 167, 224, 108 e 21 por dia (01 a 04/10) | `git log` |
| Temporizador atual | a cada 15 min, ativo, sobrevive a logout (`Linger=yes`) | `systemctl --user` |
| Custo da leitura por IA | US$ 1,94 a passada completa; US$ 0,015 uma incremental pequena | logs do Graphify |

Conclusão das medidas: 5 minutos é viável para a camada de código (39 s cabem com folga). A camada de IA também cabe, mas custa dinheiro e envia conteúdo para fora, então tem regras próprias (seção 4).

## 2. O que "atualizado" quer dizer

O grafo tem duas camadas, com metas diferentes:

- **Camada de código** (arquivos, funções, importações, tabelas, migrations): no máximo 5 minutos atrás da `main`.
- **Camada de IA** (leitura de documentos e imagens, conceitos): no máximo 5 minutos atrás da `main` **quando houver documento ou imagem novos**; sem mudança nesses arquivos, não roda.

Fora do escopo: banco vivo, crons e edge functions publicadas. Isso é o mapa (`MAPA_ZAPP_V2`), não o grafo.

## 3. Camada de código a cada 5 minutos

### 3.1 Mudanças
1. **Intervalo do temporizador:** `OnUnitActiveSec=15min` → `5min` em `~/.config/systemd/user/zapp-ref-sync.timer`.
2. **Trava contra execução dupla:** o script passa a rodar sob `flock` num arquivo de trava. Se uma execução ainda estiver em andamento, a seguinte sai sem fazer nada.
3. **Tempo máximo:** `TimeoutStartSec=4min` no serviço. Uma reconstrução travada é encerrada antes do ciclo seguinte.
4. **Gravação segura do grafo:** hoje, quem consulta o grafo durante os 39 s da reconstrução pode ler um arquivo pela metade. Confirmar se o Graphify grava em arquivo temporário e troca no fim; se não gravar, o script reconstrói numa cópia e troca o `graph.json` com `mv` (troca instantânea).
5. **Prioridade baixa:** `nice` e `ionice` na reconstrução, para não disputar processador com os agentes do Hermes.
6. **Carimbo de frescor:** ao fim de cada execução bem-sucedida, gravar `graphify-out/.fresh.json` com o commit do grafo e a hora. Qualquer agente consegue saber de quando é o grafo que está lendo.

### 3.2 O que hoje faz o grafo parar sem avisar, e a correção
| Situação | Hoje | No plano |
|---|---|---|
| Pasta de referência com arquivo alterado | pula e só anota no log | pula, anota e **alerta** (seção 5) |
| Pasta fora da `main` | pula | idem, com alerta |
| A `main` foi reescrita (avanço não é direto) | pula para sempre | alerta na primeira vez; correção manual |
| `git fetch` falha (rede, GitHub fora) | erro no log | tenta de novo no ciclo seguinte; alerta após 3 falhas seguidas |
| WSL desligado ou Windows hibernando | nada roda | `Persistent=true` já recupera ao voltar; registrar o atraso |
| Extração com IA em andamento | o outro Claude pausava o temporizador à mão | a mesma trava da seção 3.1 resolve: um espera o outro |

### 3.3 Regra para quem trabalha no repositório
A pasta `~/projetos/Zapp_Web_V2` é só de leitura. Todo trabalho (meu, do Hermes, do Devin, do Codex) acontece em cópias separadas (worktrees). Foi por isso que usei cópias separadas nos PRs de hoje. Esta regra entra no caderno e na memória.

## 4. Camada de IA a cada 5 minutos

### 4.1 Como funciona
1. Depois de atualizar a camada de código, o script compara o commit novo com o anterior e lista **só documentos e imagens que mudaram** (`.md`, `.pdf`, `.png`, `.jpg` e semelhantes).
2. Lista vazia: termina. É o caso da grande maioria dos commits, que só mexem em código.
3. Lista com itens: roda `graphify extract` incremental com DeepSeek (`deepseek-vision`, modelo `deepseek-flash`), que só envia os arquivos mudados.
4. Refaz o relatório (`GRAPH_REPORT.md`) no máximo uma vez por hora, porque dar nome às comunidades também usa IA.

### 4.2 Travas de custo e de dados
- **Teto diário de gasto** (proposta: US$ 1,00). Atingido o teto, a camada de IA para até o dia seguinte e avisa. A camada de código continua.
- **Teto por execução** (proposta: 40 arquivos). Um PR gigante como o #1869 (770 arquivos) não dispara uma leitura cara; fica marcado para você decidir.
- **Lista de exclusão conferida antes de cada envio:** o script verifica que nenhum arquivo do `.graphifyignore` está na lista. A imagem `D-selecionar-contato.jpg` entrou nela pelo PR #1888.
- **Varredura de dados sensíveis nos arquivos novos** antes do envio: chaves, CPF, telefones fora do padrão de teste. Achou algo: não envia aquele arquivo e avisa.
- **Chave fora do script:** continua em `~/.config/graphify/deepseek.env` (permissão 600), carregada só na hora.
- **Registro de cada envio:** arquivo `~/.local/state/graphify-ia.log` com hora, quantos arquivos, tokens e custo.

### 4.3 Autorizações que só você pode dar
- Tarefa permanente que envia conteúdo do repositório ao DeepSeek a cada 5 minutos.
- O valor do teto diário.
- A regra `Bash(graphify extract*)` em `/permissions`.

## 5. Vigilância: como saber que o grafo está em dia

1. **Verificador separado**, a cada 5 minutos, que compara o commit do carimbo (`.fresh.json`) com a `main` no GitHub.
2. **Alerta quando o atraso passar de 15 minutos** (três ciclos perdidos) ou quando o script pular por pasta suja. Canal proposto: mensagem pelo canal do Hermes (`hermes-enviar`), que você já usa. Alternativa: só um arquivo de estado na Área de Trabalho.
3. **Resumo diário** no log: quantas atualizações, tempo médio, gasto de IA do dia, falhas.
4. **Rotação do log** para não crescer sem limite.

## 6. Ordem de execução

| Passo | O que | Risco | Como desfazer |
|---|---|---|---|
| 0 | Fechar a passada de imagens pendente e refazer o relatório | baixo | cópia do grafo antes |
| 1 | Trava, tempo máximo, prioridade e carimbo no script atual, ainda em 15 min | baixo | cópia `.bak` do script |
| 2 | Testar: execução dupla, pasta suja, rede fora, reconstrução travada | nenhum | — |
| 3 | Baixar para 5 min e observar por 1 hora (12 ciclos) | baixo | voltar o número |
| 4 | Verificador e alerta | baixo | desligar o temporizador dele |
| 5 | Camada de IA em modo simulação por 1 dia: só lista o que enviaria e quanto custaria | nenhum | — |
| 6 | Camada de IA de verdade, com os tetos | custo | desligar o temporizador de IA |
| 7 | Anotar tudo no caderno (seção 12), na memória e no `MAPA_CODIGO.md` | nenhum | — |

Cada passo só começa com o anterior medido e funcionando.

## 7. Como desligar tudo
- Camada de código: `systemctl --user disable --now zapp-ref-sync.timer`
- Camada de IA e verificador: um `disable --now` para cada temporizador novo.
- Voltar aos 15 minutos: trocar `5min` por `15min` e rodar `systemctl --user daemon-reload`.

## 8. Limites honestos
- **"Sempre" tem exceção:** com o computador desligado, hibernando ou com o WSL fechado, nada roda. O plano recupera ao voltar, mas não atualiza durante.
- **O grafo acompanha a `main`**, não os branches em andamento dos agentes. Trabalho ainda não mergeado não aparece.
- **5 minutos é o intervalo do temporizador.** No pior caso (commit logo após um ciclo, mais 39 s de reconstrução) o grafo fica uns 6 minutos atrás.
- **O `audit_report.pdf`** voltou vazio duas vezes; o plano não resolve isso.
- **Alternativa não escolhida:** atualizar na hora, por aviso do GitHub (webhook), daria segundos em vez de minutos, mas exige expor um endereço do seu computador na internet. Não recomendo para ganhar 5 minutos.

## 9. Decisões que preciso de você
1. Aprova a camada de código em 5 minutos (passos 1 a 4)? Não tem custo nem envio externo.
2. Aprova a camada de IA em 5 minutos (passos 5 e 6), com teto de US$ 1,00 por dia e 40 arquivos por execução?
3. Alerta pelo canal do Hermes ou só arquivo de estado?
