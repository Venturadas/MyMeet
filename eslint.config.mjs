import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import next from '@next/eslint-plugin-next';
import hooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  globalIgnores(['.next/**', 'node_modules/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts', 'supabase/tests/**', 'tests/support/**']),
  { ...js.configs.recommended, languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['**/*.ts', '**/*.tsx'], extends: [ts.configs.recommended] },
  { files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'], plugins: { '@next/next': next, 'react-hooks': hooks }, rules: { ...next.configs.recommended.rules, ...next.configs['core-web-vitals'].rules, ...hooks.configs.recommended.rules } },
]);
