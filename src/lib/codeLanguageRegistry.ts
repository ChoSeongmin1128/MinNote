import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';

export const CODE_LANGUAGE_OPTIONS = [
  { id: 'plaintext', label: 'Plain Text', hidden: true },
  { id: 'json', label: 'JSON' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'jsx', label: 'JSX' },
  { id: 'tsx', label: 'TSX' },
  { id: 'python', label: 'Python' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'yaml', label: 'YAML' },
  { id: 'toml', label: 'TOML' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
] as const;

export type CodeLanguageId = (typeof CODE_LANGUAGE_OPTIONS)[number]['id'];

type HighlightRegistration = {
  id: CodeLanguageId;
  key: string | null;
};

type LanguageLoader = () => Promise<{ default: LanguageFn }>;

const highlightRegistrationCache = new Map<CodeLanguageId, Promise<HighlightRegistration>>();

const loaders: Record<Exclude<CodeLanguageId, 'plaintext'>, LanguageLoader> = {
  json: () => import('highlight.js/lib/languages/json'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  jsx: () => import('highlight.js/lib/languages/javascript'),
  tsx: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  html: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  sql: () => import('highlight.js/lib/languages/sql'),
  bash: () => import('highlight.js/lib/languages/bash'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  toml: () => import('highlight.js/lib/languages/ini'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  swift: () => import('highlight.js/lib/languages/swift'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
};

const languageKeys: Record<CodeLanguageId, string | null> = {
  plaintext: null,
  json: 'json',
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  python: 'python',
  html: 'xml',
  css: 'css',
  sql: 'sql',
  bash: 'bash',
  markdown: 'markdown',
  yaml: 'yaml',
  toml: 'ini',
  rust: 'rust',
  go: 'go',
  swift: 'swift',
  kotlin: 'kotlin',
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getCodeLanguageLabel(language: string | null) {
  return CODE_LANGUAGE_OPTIONS.find((option) => option.id === (language ?? 'plaintext'))?.label ?? 'Plain Text';
}

export function isSupportedCodeLanguage(language: string | null): language is CodeLanguageId {
  return CODE_LANGUAGE_OPTIONS.some((option) => option.id === language);
}

export function normalizeCodeLanguage(language: string | null): CodeLanguageId {
  return isSupportedCodeLanguage(language) ? language : 'plaintext';
}

export async function loadCodeLanguageRegistration(language: CodeLanguageId): Promise<HighlightRegistration> {
  const cached = highlightRegistrationCache.get(language);
  if (cached) {
    return cached;
  }

  const promise: Promise<HighlightRegistration> = (async () => {
    if (language === 'plaintext') {
      return { id: language, key: null };
    }

    try {
      const module = await loaders[language]();
      const key = languageKeys[language];
      if (!key) {
        return { id: language, key: null };
      }

      if (!hljs.getLanguage(key)) {
        hljs.registerLanguage(key, module.default);
      }

      return { id: language, key };
    } catch (error) {
      console.error(`Failed to load highlighter for ${language}`, error);
      highlightRegistrationCache.delete(language);
      return { id: language, key: null };
    }
  })();

  highlightRegistrationCache.set(language, promise);
  return promise;
}

export function highlightCodeToHtml(languageKey: string | null, value: string) {
  if (!value) {
    return '';
  }

  if (!languageKey || !hljs.getLanguage(languageKey)) {
    return escapeHtml(value);
  }

  return hljs.highlight(value, {
    language: languageKey,
    ignoreIllegals: true,
  }).value;
}
