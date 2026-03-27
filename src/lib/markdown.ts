import type { JsonValue } from './types';
export {
  extractTextFromMarkdownContent,
  extractTextFromMarkdownJson,
  isMarkdownContentEmpty,
  looksLikeMarkdown,
  markdownToHtml,
  markdownToPlainText,
  normalizeMarkdownContent,
} from './markdown/plainText';
export { getBlockPreviewText } from './markdown/preview';
export {
  serializeBlockToMarkdown,
  serializeDocumentToMarkdown,
  serializeMarkdownBlockToMarkdown,
} from './markdown/serialize';
import {
  extractTextFromMarkdownContent,
  isMarkdownContentEmpty,
} from './markdown/plainText';
export function createEmptyMarkdownContent() {
  return '';
}

export function getBlockPlainText(kind: 'markdown' | 'code' | 'text', content: JsonValue | string) {
  if (kind === 'markdown') {
    return extractTextFromMarkdownContent(content);
  }

  return typeof content === 'string' ? content : '';
}
export const isMarkdownJsonEmpty = isMarkdownContentEmpty;
