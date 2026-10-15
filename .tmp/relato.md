Especialista: senior (area-testes-do-produto)

## O que mudou e por quê
Substituí os quatro arquivos de teste que só espelhavam a lógica (redeclaravam tipos e funções e testavam as próprias cópias) por testes que importam o código de produção. Nenhum arquivo de src/ além dos quatro foi tocado. Nesta rodada 1 de refazer, repus cobertura que a rodada anterior havia retirado e acrescentei o caminho real de compressão de imagem, que antes só era exercitado nos ramos de "não comprime".

- src/utils/__tests__/whatsappFileTypes.test.ts: importa WHATSAPP_FILE_TYPES, getAllowedExtensions, getAllowedMimeTypes, getFileInputAccept, validateFile, formatFileSize, getFileCategory, getMaxSizeForCategory, getFileExtension, getFileNameFromUrl, getContactTypeInfo e CONTACT_TYPES do módulo real; cobre as cinco categorias, os limites (imagem/vídeo/áudio 16 MB, documento 100 MB, sticker 0,5 MB), o aceite até o limite e a recusa acima dele, a recusa de formato perigoso e os helpers.
- src/utils/__tests__/imageCompression.test.ts: importa compressImage, createImagePreview e formatCompressionInfo; cobre o caminho de arquivo não-imagem/GIF (wasCompressed false, ratio 1), o de imagem já pequena e dentro das dimensões sem recompressão (createImageBitmap simulado), o caminho REAL de compressão via OffscreenCanvas simulado (imagem 3000x2000 acima das dimensões máximas: wasCompressed true, resize para 1280x853, arquivo menor, ratio < 1, saída image/webp; e imagem acima do tamanho máximo mesmo sem resize) e a formatação do resumo.
- src/hooks/__tests__/useSLACalculation.test.ts: importa useSLACalculation e formatTimeRemaining; renderiza o hook real com relógio falso: prazo de 5 min com alerta aos 2 min (verde antes, âmbar no limiar, vermelho no prazo) e primeira resposta no prazo/atrasada.
- src/hooks/__tests__/useApplicableSLA.test.ts: importa useApplicableSLA com o cliente supabase simulado; cobre a hierarquia completa (contato > empresa > cargo > tipo de contato > fila > agente) com as regras de isolamento do código real (o break sai do laço só no nível de contato; empresa exige ausência de contact_id; cargo exige ausência de contact_id e company; tipo exige ausência dos três superiores; fila e agente exigem ausência de contact_id), incluindo duas regras no mesmo nível (a primeira da lista, já ordenada por prioridade, vence), regra de contato de outro contato que não impede o match de empresa nem o de fila, a regra mista que não casa em nível inferior, o fallback em sla_configurations, o 'Padrão do Sistema' 5/60 e a consulta desabilitada sem nenhum nível.

## Ponto 1 da recusa — caminho real de compressão em imageCompression.test.ts
Acrescentei o describe "compressImage (caminho real de compressão)" em src/utils/__tests__/imageCompression.test.ts, simulando createImageBitmap e OffscreenCanvas na fronteira (o módulo de produção, chamado de verdade): "comprime imagem acima das dimensões máximas, com resize e arquivo menor" (foto 3000x2000 de 2 MB → wasCompressed true, 1280x853, 100 KB, ratio < 1, saída image/webp, OffscreenCanvas construído com 1280x853, drawImage e convertToBlob chamados, ImageBitmap liberado) e "comprime imagem acima do tamanho máximo mesmo sem precisar de resize" (100x100 de 2 MB → wasCompressed true, dimensões mantidas, arquivo menor). Prova: mutação temporária em src/utils/imageCompression.ts (wasCompressed true -> false, revertida em seguida) devolveu "Tests 2 failed | 7 skipped (9)", exatamente os 2 testes novos; após reverter, verde.

## Ponto 2 da recusa — casos que faltavam em useApplicableSLA.test.ts
Recoloquei em src/hooks/__tests__/useApplicableSLA.test.ts o teste "duas regras no mesmo nível: a primeira da lista (maior prioridade) vence" (mock devolve a lista já ordenada por prioridade, como a consulta real com .order('priority', {ascending:false}) faz) e acrescentei "regra de contato de outro contato não impede o match de empresa" e "regra de contato de outro contato não impede o match de fila" (o break do código real só acontece no nível de contato). Prova: mutações temporárias em src/hooks/sla/useApplicableSLA.ts (qualquer contact_id dando match com break; guarda !companyMatch removida; ambas revertidas em seguida) devolveram "Tests 1 failed | 13 skipped (14)" e "Tests 2 failed | 12 skipped (14)", exatamente os 3 testes; após reverter, verde. Produção intacta: git diff nos dois arquivos de produção vazio.

## Ponto 3 da recusa — frases do relato corrigidas
"cada nível isolado" foi substituído pela descrição das regras de isolamento do código real (parágrafo do useApplicableSLA acima: break só no contato; níveis inferiores exigem ausência dos superiores). "nada de cobertura foi removido" foi substituído pelo registro honesto: a rodada anterior havia retirado o teste de duas regras no mesmo nível, que esta rodada recolocou, além dos 2 testes novos de empresa/fila e dos 2 testes novos do caminho real de compressão.

## Defeitos reais registrados
Cada defeito abaixo tem teste que roda hoje contra o código real e congela o comportamento observado; nenhum foi corrigido porque a única mudança de produção permitida era exportar resolveHierarchy for teste, e a hierarquia foi exercida pelo hook real (renderHook) sem precisar do export.

1. `.webp` sempre cai na categoria imagem; sticker fica inalcançável em validateFile. Como image vem antes de sticker na ordem de WHATSAPP_FILE_TYPES, image/webp casa primeiro e uma figurinha .webp usa o limite de 16 MB, nunca o de 0,5 MB. Teste: "webp casa a categoria imagem antes de sticker (primeira config vence)".
2. A validação aceita por extensão sozinha. Um arquivo renomeado (.exe -> .pdf) passa com MIME vazio ou estranho, porque a regra é MIME OU extensão. Teste: "reconhece pela extensão quando o MIME vem vazio ou é estranho" (afirma valid=true para contrato.pdf com application/octet-stream).
3. getFileCategory promete categoria para tipo não suportado. O fallback por prefixo devolve 'image' para image/bmp e 'document' para application/x-executable, categorias que essas extensões não têm. Teste: "getFileCategory devolve a categoria por MIME e cai no prefixo quando desconhecido".

## Arquivos do diff (git diff --name-only dia/2026-10-14...HEAD, após commit)
.tmp/relato.md
src/hooks/__tests__/useApplicableSLA.test.ts
src/hooks/__tests__/useSLACalculation.test.ts
src/utils/__tests__/imageCompression.test.ts
src/utils/__tests__/whatsappFileTypes.test.ts

## Prova
- vermelho (mutação, produção temporariamente quebrada e revertida; backups em /tmp, git diff da produção vazio após reverter): imageCompression "Tests 2 failed | 7 skipped (9)"; useApplicableSLA "Tests 1 failed | 13 skipped (14)" e "Tests 2 failed | 12 skipped (14)" — os 5 testes novos falham sem a regra de produção que prendem.
- verde depois: npx vitest run dos quatro arquivos devolveu "Test Files 4 passed (4); Tests 49 passed (49)".
- verificação do cartão: zapp-verify . --rapido -> "VERIFY: VERDE SEM BANCO (16s)", com OK em db_guard, tipos, lint e migrations (sem banco: cartão só de testes, sem migration).

## O que NÃO fiz e por quê
- Não alterei código de produção. Os defeitos acima ficam congelados por teste; a correção não é deste cartão, que pede o registro e permite só o export de resolveHierarchy (não usado, pois a hierarquia foi exercida pelo hook real).
- Não espelhei tipos/funções nos arquivos de teste: só há pequenos construtores de entrada (makeFile/rule) para montar dados de teste; canvas e createImageBitmap são simulados na fronteira, nunca o módulo sob teste.
