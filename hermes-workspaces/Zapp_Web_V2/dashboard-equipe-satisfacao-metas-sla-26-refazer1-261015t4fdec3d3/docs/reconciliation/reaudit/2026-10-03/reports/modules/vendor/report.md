# Leitura semântica do codec vendorizado

**Fonte:** `da307ba5626dce892f0b37cb6762463f55d14a96`. O arquivo `public/vendor/lamejs-1.2.1.min.js` permaneceu intocado: 156.043 bytes, 307 linhas originais, blob `8dc6b0726388ff75bec69ac55ac5a6cc49e61093`.

Foram lidos **208 corpos de funções**, através de uma cópia formatada pelo AST com **4.683 linhas**. A correspondência entre nomes, tipos, ordem de travessia e faixas originais/formatadas consta em `manifest.json`; o estado final de leitura está em `coverage.json`. O manifesto é o inventário anterior à leitura e conserva `NOT_YET_READ`; ele não substitui a cobertura final. A cópia tem SHA-256 `3f732ff95a08111b2c1acf26dfcdb187cd30a42fb891d28e02777a894d70d3ef`. O diário registra os trechos efetivamente lidos. Esses 208 corpos são código de terceiro, não 208 microfuncionalidades autorais.

## Caminho utilizado pelo produto

O consumidor encontrado em produção é `src/utils/audioToMp3.ts`: carrega o script local, decodifica áudio, limita a duração decodificada a 600 segundos, mistura canais para mono, limita amostras a Int16 e reamostra para 44.100 Hz. Instancia `Mp3Encoder(1, 44100, 128)`, fornece blocos de até 1.152 amostras e faz um `flush` final. A verificação de duração ocorre depois da decodificação; ela não prova um limite de memória antes de decodificar. [Consumidor fixado](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/utils/audioToMp3.ts#L115-L192).

O wrapper fixa `quality=3`, desliga escrita de tags VBR/ID3 automáticas e desliga o reservatório. O modo inicial é CBR. Nesse caminho, o modelo psicoacústico NS permanece ativo. O buffer de saída começa em `(1.25 * 1152 + 7200) | 0 = 8640` bytes e cresce quando a entrada pública excede o bloco anterior. A rotina interna de cópia verifica capacidade e devolve `-1` se não couber; o wrapper recorta a saída com o código retornado sem validar retornos negativos. O cenário de retorno negativo não foi reproduzido nos parâmetros fixos do produto e não é contado como um segundo defeito. [Wrapper](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/public/vendor/lamejs-1.2.1.min.js#L305-L307), [cópia de buffer](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/public/vendor/lamejs-1.2.1.min.js#L68-L69).

## O que foi percorrido

| Faixa da cópia AST | Contratos examinados |
|---|---|
| 1–153 | Arrays tipados, enumerações, filtros e estado de ReplayGain |
| 154–294 | Presets VBR/ABR, taxa e parâmetros de quantização |
| 295–684 | Quantização, Huffman, regiões, contagem de bits e scalefactors |
| 685–711 | Reservatório e distribuição de bits |
| 712–970 | Bitstream, cabeçalhos, cópia de buffers e CRC |
| 971–1221 | Tags VBR/LAME, tabela de busca e metadados |
| 1222–1306 | Estruturas de estado e laço CBR |
| 1307–1661 | Potências, ATH, energia/ruído e cópia de granules |
| 1662–2161 | Laço externo de quantização e ramos VBR/ABR |
| 2162–2652 | Filtros polifásicos, janelas, MDCT e anti-alias |
| 2653–2867 | Encode de frame, estado, histogramas e buffers |
| 2868–3019 | FHT, FFT curta/longa e janelas |
| 3020–3896 | Energia, mascaramento, ataques e decisão de blocos |
| 3897–4499 | Parâmetros LAME, reamostragem, buffering e flush |
| 4500–4683 | Stubs, tabelas Huffman, constantes e API Mp3Encoder/WavHeader |

Foram examinados os limites explícitos de 576 amostras por granule, 1.152 por frame no caminho corrente, limite interno `LAME_MAXMP3BUFFER=147456`, anel de 256 cabeçalhos, limites de bits por canal/granule e estados de preenchimento/flush. Ler as condições e os coeficientes não demonstra que toda combinação de entrada respeita invariantes numéricas nem que os coeficientes correspondem a uma referência independente. O mapa por função em `coverage.json` permite localizar precisamente cada corpo sem inflar a contagem de linhas originais.

## Contrato numérico confirmado — R2-MOD-073

A rotina ativa `L3psycho_anal_ns` usa quatro flags inteiros, mas indexa por `F/3` em um laço de doze posições. Para oito valores de F, o índice é fracionário; a leitura é `undefined`, e o guard de igualdade com zero impede marcar o ataque. O acumulador de energia usa `1+F/3`; nos casos fracionários, escreve uma propriedade com NaN em vez do grupo inteiro. Os flags resultantes influenciam a seleção de blocos. [Trecho original](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/public/vendor/lamejs-1.2.1.min.js#L201-L216).

A prova confirma o cálculo interno defeituoso e o caminho CBR ativo. **Não confirma degradação audível, corrupção do MP3 final nem a frequência do caso em áudios reais.** A ficha completa, com precondição, critérios de aceite e relação à auditoria anterior, está em `../findings.json`, ID `R2-MOD-073`. Não se repetiu a mesma causa como outro achado para o ramo VBR.

## Três probes offline, com objetivos distintos

| Probe | Código executado | Resultado e limite |
|---|---|---|
| VENDOR-P01 | Laço de ataques extraído do AST original, doze vetores de pico único | Marca só 0, 3, 6 e 9; não mede percepção nem MP3 final |
| VENDOR-P02 | Atribuição original de energia, F=1 | Propriedade `1.3333333333333333` vira NaN; os quatro grupos inteiros não recebem a energia |
| VENDOR-P03 | API pública real, mono/44100/128, 3.456 amostras de silêncio e seno sintético | Ambos emitem 1.671 bytes em blocos `[0,417,418,836]`; segundo flush devolve zero bytes. Não inclui decoder, áudio longo ou navegador |

`../vendor_probes.cjs` executa o fornecedor em uma VM local sem APIs de rede e com limites de tempo por chamada. `proofs.json` registra entradas/resultados e limitações. Nenhum desses probes substitui conformidade MP3, validação da qualidade, benchmark ou fuzzing. Somente P01/P02 sustentam o achado; P03 é um smoke test de emissão/término.

## Ramos lidos que continuam sem validação funcional

ReplayGain, decodificação para análise, tags VBR/ID3 automáticas, proteção CRC e modos VBR/ABR não são ativados pelo wrapper atual. A leitura encontrou referências suspeitas nesses ramos, como identificadores não definidos em algumas rotinas e construções que lançariam erro se executadas; a existência desses ramos não comprova alcance pela integração atual. Não são contados como defeitos ativos adicionais. A API pública `WavHeader` também não teve consumidor de produção localizado; usa leituras DataView sem uma validação geral prévia do tamanho e percorre chunks, mas não foi certificada para WAV truncado/atípico. O nome `lamejs-1.2.1` e a identificação interna LAME não foram comparados a upstream, licença ou especificação nesta passagem; não se presume equivalência entre esses números de versão.

A revisão completa de corpos está encerrada. Permanecem explícitos os limites de validação numérica e de integração: não houve comparação com coeficientes oficiais, decoder independente, reprodução sonora, dispositivo real, teste de navegadores, áudio longo, medição de performance ou alteração do fornecedor. Uma correção deve acrescentar provas adequadas a esses riscos antes de afirmar fidelidade ou segurança universal do codec.
