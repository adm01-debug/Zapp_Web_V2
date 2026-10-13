Especialista: workertestes

## O que mudou e por quê
Substituí os quatro arquivos de teste que só espelhavam a lógica (redeclaravam tipos e funções e testavam as cópias) por testes que importam o código de produção. Nenhum arquivo de src/ além dos quatro foi tocado.

- src/utils/__tests__/whatsappFileTypes.test.ts: importa WHATSAPP_FILE_TYPES, getAllowedExtensions, getAllowedMimeTypes, getFileInputAccept, validateFile, formatFileSize, getFileCategory, getMaxSizeForCategory, getFileExtension, getFileNameFromUrl, getContactTypeInfo e CONTACT_TYPES do módulo real; cobre as cinco categorias, os limites (16/16/16/100/0.5MB), o aceite de imagem até 16MB, a recusa acima do limite e de formato perigoso, a classificação por extensão e os helpers.
- src/utils/__tests__/imageCompression.test.ts: importa compressImage, createImagePreview e formatCompressionInfo; cobre o caminho de arquivo não-imagem/GIF (wasCompressed false, ratio 1), o de imagem já pequena sem recompressão e a formatação do resumo.
- src/hooks/__tests__/useSLACalculation.test.ts: importa useSLACalculation e formatTimeRemaining; renderiza o hook real com relógio falso: prazo de 5 min com alerta aos 2 min (verde antes, âmbar no limiar, vermelho no prazo) e primeira resposta no prazo/atrasada.
- src/hooks/__tests__/useApplicableSLA.test.ts: importa useApplicableSLA com o cliente supabase mockado; cobre a hierarquia completa (contato > empresa > cargo > tipo > fila > agente), a regra mista que não casa em nível inferior, o fallback em sla_configurations, o padrão do sistema e a consulta desabilitada sem nenhum nível.

## Prova
- vermelho antes: mutação temporária em src/utils/whatsappFileTypes.ts (maxSizeMB da imagem 16 -> 8), depois revertida; npx vitest run src/utils/__tests__/whatsappFileTypes.test.ts -> "Test Files 1 failed (1); Tests 4 failed | 15 passed (19)" com "AssertionError: expected 8 to be 16". Fonte revertida com git checkout; git status mostra só os quatro arquivos de teste modificados.
- verde depois: npx vitest run dos quatro arquivos -> "Test Files 4 passed (4); Tests 44 passed (44)".

## O que NÃO fiz e por quê
- Não alterei código de produção. Nenhum teste falhou contra o código real, então não havia defeito a consertar; a prova vermelho->verde foi feita por mutação temporária revertida, que é o que comprova que os testes prendem o código real.
- Não espelhei tipos/funções nos arquivos de teste: só há pequenos construtores de entrada (makeFile/rule) para montar dados de teste.
