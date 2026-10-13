Especialista: workertestes

## O que mudou e por quê
Substituí os quatro arquivos de teste que só espelhavam a lógica (redeclaravam tipos e funções e testavam as próprias cópias) por testes que importam o código de produção. Nenhum arquivo de src/ além dos quatro foi tocado. Mudar a expectativa desses testes é o próprio objetivo do cartão: nada de cobertura foi removido, e sim substituído por cobertura que prende o código real.

- src/utils/__tests__/whatsappFileTypes.test.ts: importa WHATSAPP_FILE_TYPES, getAllowedExtensions, getAllowedMimeTypes, getFileInputAccept, validateFile, formatFileSize, getFileCategory, getMaxSizeForCategory, getFileExtension, getFileNameFromUrl, getContactTypeInfo e CONTACT_TYPES do módulo real; cobre as cinco categorias, os limites (imagem/vídeo/áudio 16 MB, documento 100 MB, sticker 0,5 MB), o aceite até o limite e a recusa acima dele, a recusa de formato perigoso e os helpers.
- src/utils/__tests__/imageCompression.test.ts: importa compressImage, createImagePreview e formatCompressionInfo; cobre o caminho de arquivo não-imagem/GIF (wasCompressed false, ratio 1), o de imagem já pequena e dentro das dimensões sem recompressão (createImageBitmap simulado) e a formatação do resumo.
- src/hooks/__tests__/useSLACalculation.test.ts: importa useSLACalculation e formatTimeRemaining; renderiza o hook real com relógio falso: prazo de 5 min com alerta aos 2 min (verde antes, âmbar no limiar, vermelho no prazo) e primeira resposta no prazo/atrasada.
- src/hooks/__tests__/useApplicableSLA.test.ts: importa useApplicableSLA com o cliente supabase simulado; cobre a hierarquia completa (contato > empresa > cargo > tipo de contato > fila > agente), cada nível isolado, a regra mista que não casa em nível inferior, o fallback em sla_configurations, o 'Padrão do Sistema' 5/60 e a consulta desabilitada sem nenhum nível.

## Defeitos reais registrados
Cada defeito abaixo tem teste que roda hoje contra o código real e congela o comportamento observado; nenhum foi corrigido porque a única mudança de produção permitida era exportar resolveHierarchy for teste, e a hierarquia foi exercida pelo hook real (renderHook) sem precisar do export.

1. `.webp` sempre cai na categoria imagem; sticker fica inalcançável em validateFile. Como image vem antes de sticker na ordem de WHATSAPP_FILE_TYPES, image/webp casa primeiro e uma figurinha .webp usa o limite de 16 MB, nunca o de 0,5 MB. Teste: "webp casa a categoria imagem antes de sticker (primeira config vence)".
2. A validação aceita por extensão sozinha. Um arquivo renomeado (.exe -> .pdf) passa com MIME vazio ou estranho, porque a regra é MIME OU extensão. Teste: "reconhece pela extensão quando o MIME vem vazio ou é estranho" (afirma valid=true para contrato.pdf com application/octet-stream).
3. getFileCategory promete categoria para tipo não suportado. O fallback por prefixo devolve 'image' para image/bmp e 'document' para application/x-executable, categorias que essas extensões não têm. Teste: "getFileCategory devolve a categoria por MIME e cai no prefixo quando desconhecido".

## Prova
- vermelho antes: mutação temporária em src/utils/whatsappFileTypes.ts (maxSizeMB da imagem 16 -> 8), depois revertida com git checkout. Comando npx vitest run src/utils/__tests__/whatsappFileTypes.test.ts devolveu "Test Files 1 failed (1); Tests 4 failed | 15 passed (19)", com "AssertionError: expected 8 to be 16". Isso comprova que os testes prendem o código de produção. Depois de reverter, git status mostrou só os quatro arquivos de teste modificados.
- verde depois: npx vitest run dos quatro arquivos devolveu "Test Files 4 passed (4); Tests 44 passed (44)".
- verificação do cartão: zapp-verify . --rapido -> "VERIFY: VERDE SEM BANCO (94s)", com OK em db_guard, tipos, lint e migrations.

## O que NÃO fiz e por quê
- Não alterei código de produção além dos quatro arquivos de teste. Os defeitos acima ficam congelados por teste; a correção não é deste cartão, que pede o registro e permite só o export de resolveHierarchy (não usado, pois a hierarquia foi exercida pelo hook real).
- Não espelhei tipos/funções nos arquivos de teste: só há pequenos construtores de entrada (makeFile/rule) para montar dados de teste.
