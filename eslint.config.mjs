import { defineConfig } from "eslint/config";
import { importX } from "eslint-plugin-import-x";
import tsParser from "@typescript-eslint/parser";

const config = defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "frontend/.angular/**",
      "backend/certs/**",
    ],
  },
  {
    files: ["frontend/src/**/*.ts", "backend/src/**/*.{ts,js}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "import-x": importX,
    },
    rules: {
      "import-x/exports-last": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ExportNamedDeclaration > :matches(FunctionDeclaration, ClassDeclaration, VariableDeclaration, TSTypeAliasDeclaration, TSInterfaceDeclaration, TSEnumDeclaration, TSModuleDeclaration)",
          message:
            "Zadeklaruj element bez słowa export i dodaj go do sekcji eksportów na końcu pliku.",
        },
        {
          selector:
            "ExportDefaultDeclaration > :matches(FunctionDeclaration, ClassDeclaration)",
          message:
            "Zadeklaruj element osobno i dodaj eksport domyślny na końcu pliku.",
        },
      ],
    },
  },
]);

export default config;
