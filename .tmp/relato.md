Especialista: worker (hooks) (area-front-hooks)

## Pontos do refazer

Ponto 1: primeira linha do relato
- Corrigi a primeira linha para exatamente `Especialista: worker (hooks) (area-front-hooks)`, como o critério de pronto exige.

Ponto 2: como a dia foi trazida, conflito da rodada anterior e preservação da base
- Trouxe o código aprovado com `git cherry-pick 8f034bb6b`; nesta base o cherry-pick entrou sem conflito nos arquivos `src/lib/pdfThumbnail.ts` e `src/lib/__tests__/pdfThumbnail.test.ts`.
- A entrega anterior de relato (`4cafa6a30`) só alterava `.tmp/relato.md`; ao reaplicá-la, substituí o texto antigo por este relato corrigido, sem reescrever o código aprovado.
- O que já estava preservado na dia/na entrega aprovada continuou preservado: o controlador interno por execução segue sendo usado e o abort enquanto a chamada está em espera na fila segue removendo a chamada sem ocupar vaga. Os FATOS do fechamento anterior indicavam que os testes do arquivo passam na base; por isso, aqui eu não prometo vermelho→verde para esses testes, apenas registro o contrato que eles travam.

Ponto 3: o que o commit 8f034bb6b acrescenta
- `src/lib/pdfThumbnail.ts`: o commit acrescenta a passagem direta da vaga para o próximo item da fila, sem fazer a fila cair por zero antes de acordar o próximo, e acrescenta a checagem de aborto depois do render antes de devolver/cachear a miniatura.
- `src/lib/__tests__/pdfThumbnail.test.ts`: o commit acrescenta o teste do fetch pendurado (`o prazo de 15 s aborta o fetch pendurado: null, sinal do fetch abortado, sem getDocument e com a vaga de volta`) e acrescenta a quarta chamada dentro do teste `abortar enquanto ESPERA a vaga tira a chamada da fila e não ocupa vaga`.
- Se o teste `aborta o DOWNLOAD em voo` aparecer no histórico/arquivo, ele já existia na base e este commit não o alterou; não uso esse teste como mudança nova do diff.

Ponto 4: recusa original — terceira chamada em espera
- O teste de fila aborta a TERCEIRA chamada (`url3`), que está em espera porque as duas primeiras chamadas ocupam as duas vagas. A QUARTA chamada (`url4`) entra depois e recebe a vaga quando a primeira termina; ela pertence ao teste `abortar enquanto ESPERA a vaga tira a chamada da fila e não ocupa vaga`, não ao teste `nunca deixa mais de 2 renderizações em andamento e respeita a ordem de chegada`.

Ponto 5: recusa original — relato não promete cobertura que o teste não executa
- Removi a conclusão genérica de que “os quatro” testes descrevem exatamente todo o comportamento pedido.
- O relato cita como cobertura alterada pelo diff apenas o que o diff mostra: o teste do fetch pendurado e a quarta chamada no teste de abortar enquanto espera vaga. O teste de limite de 2 renderizações permanece citado somente como contrato existente quando a saída do arquivo inteiro passa.
- Sobre jev-juiz/diff: são 2 arquivos de código (`src/lib/pdfThumbnail.ts` e `src/lib/__tests__/pdfThumbnail.test.ts`) vindos do cherry-pick, mais este arquivo de relato (`.tmp/relato.md`) no workspace/fechamento; portanto, 3 arquivos no total da entrega quando o relato é contado, mas só 2 arquivos de código.

## O que mudou e por quê
- `src/lib/pdfThumbnail.ts`: veio do cherry-pick do commit 8f034bb6b, já aprovado pelo revisor; o código não foi reescrito neste refazer.
- `src/lib/__tests__/pdfThumbnail.test.ts`: veio do mesmo cherry-pick, já aprovado; o teste não foi afrouxado nem removido neste refazer.
- `.tmp/relato.md`: corrigido para responder ponto a ponto à recusa atual e remover contradições com o diff.

## Prova
- Teste alvo: `npx vitest run src/lib/__tests__/pdfThumbnail.test.ts` — executado antes de fechar; ver FATOS MEDIDOS PELO FECHAR/saída do comando.
- Verificação rápida: `zapp-verify . --rapido` — executada antes de fechar; ver FATOS MEDIDOS PELO FECHAR/saída do comando.

## O que NÃO fiz e por quê
- Só os dois arquivos de src/lib mudaram, vindos do cherry-pick; o código não foi reescrito.
- Não toquei em hooks, telas, Edge Functions, migrations, CI ou dependências.
- Não removi, pulei nem afrouxei teste.

CONCLUÍ.
