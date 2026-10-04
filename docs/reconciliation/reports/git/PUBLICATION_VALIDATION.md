# Validação da publicação e correção dos artefatos

O pacote de reconciliação foi publicado no [commit `9a1c370c1979`](https://github.com/adm01-debug/Zapp_Web_V2/commit/9a1c370c1979b5e3f1c59291a2bfac331f689e3d), no [draft PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869). A verificação remota confirmou os 223 arquivos então entregues e a correspondência dos blobs locais com a árvore publicada. O CI desse commit revelou problemas nos próprios artefatos de reprodução. Este adendo registra as causas, a correção documental e os seus limites.

**As contagens de reconciliação permanecem intactas:** 5.166 registros, 62 fontes, 3.062 avaliações individuais, 2.104 registros históricos tratados pela linhagem e 104 registros de achados. A correção deste adendo é restrita a `docs/reconciliation/**` e não altera o código do produto, suas configurações, baselines de qualidade ou conclusões funcionais.

## Resultado observado no commit original

| Verificação | Resultado e causa observada |
| --- | --- |
| Lint & TypeCheck | Falhou no ratchet de lint: 522 ocorrências preservadas e cinco novas, todas na cópia de referência do SDK Functions. A etapa posterior de typecheck não foi certificada por essa execução. |
| SonarCloud | Falhou com 29 anotações, todas em arquivos novos da auditoria: 12 em Cross-module, seis em Multiplix, seis em Skins, quatro no validador e uma no JSON de Skins. Nenhuma aponta fonte do produto ou a cópia do SDK. |
| Contrato DB offline | Falhou no passo V06 porque as seis tentativas de `psql` não encontraram o socket local PostgreSQL. O wrapper registrou indisponibilidade do bootstrap e encerrou com código 2; o teste não forneceu resultado de contrato RLS. |
| Build, testes unitários, E2E, segurança e mutação do mapa | Foram pulados nessa execução após a falha de lint. Não são resultados de aprovação. |

O [snapshot estruturado do CI](../../evidence/publication-ci-diagnosis.json) conserva IDs, URLs, horários e a evidência dos logs deste commit. O diagnóstico de DB foi obtido do log desta execução; não foi transportado de outro run. A ausência do socket não identifica, sozinha, a causa anterior da indisponibilidade do servidor.

## Correção da referência do SDK

O SDK foi incluído originalmente como `supabase-functions-client-2.117.2.ts`. Isso fez o lint tratá-lo como fonte adicional: três ocorrências de `no-explicit-any` e duas de `prefer-const`. A referência passou para `supabase-functions-client-2.117.2.ts.txt`, e o probe foi ajustado para ler esse arquivo de dados antes de remover os tipos.

Os bytes originais foram preservados, com SHA256 `383646bfc6327ff6274e7c15b3b3d73f50cbea5a2636ee95914197a759949246`. Essa é uma referência da versão fixada no lock auditado. O reteste confirmou a mesma desserialização de áudio e HTTP207. Os probes próprios continuam disponíveis como scripts executáveis; nenhuma regra, exclusão ou baseline foi relaxado.

## Limites de execução reforçados

**Cross-module e Multiplix** verificam o baseline, a raiz do checkout e hashes SHA256 fixos de todas as fontes lidas antes de executar qualquer uma delas. O SDK e as evidências SQL também são validados. As transformações usam os buffers já conferidos, sem importar novamente arquivos modificáveis. Git usa um executável absoluto e ambiente controlado, e os argumentos de seleção do checkout não se tornam código.

**Skins** verifica os quatro fontes por SHA256 e recusa caminhos que escapem do checkout antes de importar módulos ou executar o bootstrap. A extração de imports, CSS e HTML usa passagens limitadas, e a ordenação redundante foi removida. A execução do bootstrap tem limite de tempo e não permite nova geração de código no contexto VM.

**O validador documental** restringe caminhos ao pacote, valida referências Git antes da consulta, mantém SHA1 somente para identidade de blobs Git e usa SHA256 para integridade dos artefatos. A saída opcional tem um único destino, `evidence/artifact-validation.json`, com proteção contra links simbólicos e gravação por substituição. A opção `--output` passou a ser uma flag sem argumento; as [instruções de reprodução](../../reproduce/README.md) foram atualizadas.

Esses probes executam intencionalmente fontes revisadas para reproduzir comportamentos com dependências simuladas. Não são ambientes de isolamento para JavaScript arbitrário. Validar os hashes fixa os bytes aceitos; não transforma um mock em prova de browser, SQL vivo ou provedor.

## Verificação local da correção

Os [resultados completos do hardening](../../evidence/publication-harness-hardening.json) registram os testes positivos e as recusas de entradas incompatíveis.

- O validador passou em **37/37 verificações** de caminhos, refs, saída fixa, links e limites da CLI; recebeu revisão independente focal.
- Cross-module gerou **o mesmo JSON integral** de resultados da auditoria. Os nove casos focados de compatibilidade e recusa também passaram.
- Multiplix preservou os três contraexemplos de conteúdo por bloco, variável ausente e HTTP429, com worker e dependências revisados antes da execução.
- Skins preservou **exatamente os 299 resultados completos** anteriores: 297 critérios aprovados e dois defeitos reproduzidos. Fonte alterada e link para fora do checkout foram recusados antes de criar saída. Somado ao probe de Volume, preservado sem alteração, o conjunto original continua com 307 critérios, 304 aprovados e três falhas de requisito.

O [validador integral do pacote](../../evidence/artifact-validation.json) e o [manifesto SHA256](../../evidence/ARTIFACT_MANIFEST.json) incluem os artefatos desta correção. As contagens e os hashes atuais devem ser lidos desses arquivos; os 223 arquivos acima descrevem especificamente a primeira publicação.

## Interpretação e limite do Sonar

As [29 anotações foram adjudicadas individualmente](SONAR_PUBLICATION_TRIAGE.md). O reforço de confiança dos probes e da CLI é uma correção real do pacote. A execução dinâmica intencional continua explícita e pode exigir revisão contextual no Sonar.

O possível segredo apontado em `skins-probe-results.json` é comprovadamente o hash de `src/styles/tokens.css`; ele foi recalculado e preservado. O SHA1 do validador corresponde ao protocolo de identificação de blobs Git. Esses dois usos não são credenciais ou proteção de senhas. Não se concluiu que todos os 29 alertas fossem falsos positivos, nem que fossem 29 vulnerabilidades independentes.

Este adendo fixa o diagnóstico em `9a1c370c1979` e a verificação local da correção. O resultado de um commit posterior deve ser observado nos [checks do PR](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869/checks); ele não é deduzido dos retestes locais. Nenhum estado de issue Sonar foi alterado, e este pacote não afirma aprovação do gate por antecipação.
