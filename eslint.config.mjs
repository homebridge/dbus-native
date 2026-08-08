import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier/flat";
import { defineConfig } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  // turns off the stylistic rules prettier owns, exactly as `extends: ["prettier"]` did
  prettier,
  {
    languageOptions: {
      // was 6, which had long stopped describing the package - CI runs it on
      // node 22, 24 and 26, and 6 cannot parse an optional catch binding
      ecmaVersion: 2022,
      // the package is CommonJS - `require` and `module` throughout
      sourceType: "commonjs",
      // replaces the old `env: { node: true, mocha: true, es6: true }`
      globals: {
        ...globals.node,
        ...globals.mocha,
        ...globals.es2015,
      },
    },

    rules: {
      "no-constant-condition": ["error", { checkLoops: false }],
      eqeqeq: ["error", "always"],
      "no-console": "off",
      "no-empty": "off",
    },
  },
]);
