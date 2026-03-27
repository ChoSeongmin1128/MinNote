import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '../app/actions',
            message: '컴포넌트와 훅은 app/actions 대신 controller hook을 사용해야 합니다.',
          },
          {
            name: '../../app/actions',
            message: '컴포넌트와 훅은 app/actions 대신 controller hook을 사용해야 합니다.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '../lib/desktopApi',
            message: 'desktopApi 직접 호출 대신 BackendPort를 통해 접근해야 합니다.',
          },
          {
            name: '../../lib/desktopApi',
            message: 'desktopApi 직접 호출 대신 BackendPort를 통해 접근해야 합니다.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../adapters/*', '../../adapters/*', '../../../adapters/*'],
            message: 'application 계층은 adapter를 직접 참조하면 안 됩니다.',
          },
        ],
      }],
    },
  },
])
