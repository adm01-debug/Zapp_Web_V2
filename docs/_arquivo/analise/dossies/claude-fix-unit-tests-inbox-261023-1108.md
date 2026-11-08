# Dossiê: claude/fix-unit-tests-inbox-261023-1108

## Identificação

- **Branch**: `claude/fix-unit-tests-inbox-261023-1108`
- **Tip SHA**: `7be2c50e5bca21592a568cf2159a30ac3381ac1a`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: INTEGRAR-LIMPO (confiança 0.95)

Dois fixes de infraestrutura de testes unitários:
1. `FilesTab.fase6.test.tsx`: corrige o spy de `getBoundingClientRect` para usar
   `HTMLElement.prototype` em vez de `Element.prototype`
2. `src/test/setup.ts`: adiciona mocks de `clientHeight` e `clientWidth` para compatibilidade
   com `@tanstack/virtual-core >=3.19` que mede o contêiner por essas propriedades (jsdom: 0)

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/fix-unit-tests-inbox-261023-1108
→ 099bd7a98117e122f8b225209ce17af53297d41c  (≠ main tree f7b413078...)
exit code 0 — sem conflitos
```

### Delta (2 arquivos)

`src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx`:
```diff
-  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
+  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
```

`src/test/setup.ts`:
```diff
+// @tanstack/virtual-core >=3.19 mede o contêiner por clientWidth/clientHeight (jsdom: 0).
+Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
+Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
```

### Estado em main

`src/test/setup.ts` em main **não** contém `clientHeight`/`clientWidth`. Ambas as mudanças
estão ausentes.

## Decisão

**PR aberto.** Fixes de infraestrutura de testes, sem conflitos, sem risco de regressão em
comportamento de produção. A motivação está documentada nos comentários.
