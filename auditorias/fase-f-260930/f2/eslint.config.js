import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .claude/worktrees/: checkouts efêmeros do Agent tool (isolation: worktree) — são
  // criados/destruídos em paralelo por agentes em background; sem este ignore o lint do
  // pre-push varre esses diretórios e quebra com ENOENT quando um worktree é desmontado
  // no meio do scan (achado 2026-09-26, sessão de auditoria de 5 agentes).
  { ignores: ["dist", ".claude/worktrees/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Debuggers must never reach first-party production code. Third-party
      // bundles are intentionally outside ESLint's source scope.
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Camada de apresentacao nao fala com o Supabase direto: acesso a dados vive em
    // hooks/services/lib. Warn (nao error) porque ha ~180 arquivos legados; o
    // lint-ratchet congela esse numero e impede que cresca.
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["**/integrations/supabase/client"],
              message: "Componentes e pages nao importam o client do Supabase: mova o acesso a dados para um hook em src/hooks ou um service em src/services.",
            },
          ],
        },
      ],
    },
  },
);
