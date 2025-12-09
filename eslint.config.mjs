import typescriptEslint from "@typescript-eslint/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import prettier from "eslint-plugin-prettier";
import tsdoc from "eslint-plugin-tsdoc";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["dist/*", "node_modules/*", "**/.eslintrc.js", "test/bootstrap/*", "test/**/*.js"],
}, ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/errors",
    "plugin:import/warnings",
    "prettier",
), {
    plugins: {
        "@typescript-eslint": typescriptEslint,
        "simple-import-sort": simpleImportSort,
        prettier,
        tsdoc,
    },

    languageOptions: {
        globals: {
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "commonjs",

        parserOptions: {
            tsconfigRootDir: __dirname,
            project: ["./tsconfig.json"],
            createDefaultProgram: true,
        },
    },

    settings: {
        "import/parsers": {
            "@typescript-eslint/parser": [".ts", ".cts", ".mts"],
        },

        "import/resolver": {
            typescript: {
                alwaysTryTypes: true,
            },
        },
    },

    rules: {
        "@typescript-eslint/no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],

        "simple-import-sort/imports": "error",
        "sort-imports": "off",
        "import/first": "error",
        "import/newline-after-import": "error",
        "import/no-duplicates": "error",
        "@typescript-eslint/member-ordering": "error",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/require-await": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "prettier/prettier": "error",
        "tsdoc/syntax": "error",
    },
}, {
    files: ["**/*.test.{js,ts,mjs,cjs}"],

    languageOptions: {
        globals: {
            ...globals.mocha,
        },
    },

    rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unused-expressions": "off",
    },
}, {
    files: ["**/*.cjs"],

    rules: {
        "@typescript-eslint/no-var-requires": "off",
    },
}];
