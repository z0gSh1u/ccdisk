import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // 1. 忽略下划线开头的未使用变量
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      // 2. 禁用 no-explicit-any
      '@typescript-eslint/no-explicit-any': 'off',
      // 3. 禁用 explicit-function-return-type
      '@typescript-eslint/explicit-function-return-type': 'off',
      // 4. 禁用 no-case-declarations
      'no-case-declarations': 'off',
      // 5. no-require-imports 改成 warning
      '@typescript-eslint/no-require-imports': 'warn'
    }
  }
  // 6. 移除 prettier/prettier，不需要联动 eslint
);
