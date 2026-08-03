import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "realtime/dist/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Bật type-aware linting. Các rule quan trọng nhất
        // (no-floating-promises, no-misused-promises) chỉ chạy được khi
        // ESLint có thông tin kiểu.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Rules của Next.js + React Hooks — trước đây thiếu hoàn toàn.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Promise bị quên await là nguồn bug số 1 trong Server Actions.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Script chạy bằng Node (seed) được phép log thoải mái.
  {
    files: ["prisma/**/*.ts"],
    rules: { "no-console": "off" },
  },

  // File test.
  {
    files: ["**/*.test.{ts,tsx}", "vitest.setup.ts", "test/**/*.ts"],
    rules: {
      // `vi.mocked(prisma.user.create)` là cách dùng đúng và bắt buộc của
      // vitest, nhưng rule này đọc nó thành method bị tách khỏi object.
      "@typescript-eslint/unbound-method": "off",
    },
  },

  // File config và script .mjs — chạy bằng Node, không nằm trong chương trình
  // TypeScript nên không lint theo kiểu được.
  {
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: { "no-console": "off" },
  },

  // Luôn để cuối: tắt mọi rule xung đột với Prettier.
  prettierConfig,
);
