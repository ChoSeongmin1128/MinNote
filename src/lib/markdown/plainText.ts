import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { JsonValue } from '../types';

export function normalizeMarkdownContent(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export function markdownToHtml(markdown: string) {
  return DOMPurify.sanitize(marked.parse(markdown) as string);
}

export function markdownToPlainText(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');

  return normalized
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) {
        return '';
      }

      const withoutMarker = trimmed
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s+/, '')
        .replace(/^[-*]\s+\[(?: |x|X)\]\s+/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '');

      return withoutMarker
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_~`>#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTextFromMarkdownContent(value: JsonValue | string): string {
  if (typeof value === 'string') {
    return markdownToPlainText(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractTextFromMarkdownContent).join(' ').trim();
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const textValue = entries
      .flatMap(([key, child]) => {
        if (key === 'text' && typeof child === 'string') {
          return [child];
        }

        if (key === 'type') {
          return [];
        }

        return [extractTextFromMarkdownContent(child)];
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return textValue;
  }

  return '';
}

export const extractTextFromMarkdownJson = extractTextFromMarkdownContent;

export function isMarkdownContentEmpty(value: JsonValue | string) {
  const text = extractTextFromMarkdownContent(value).trim();
  return text.length === 0;
}

export function looksLikeMarkdown(text: string) {
  const trimmed = text.trim();
  return /^(#{1,6}\s|-\s|\*\s|\d+\.\s|>\s|```|\[.\]\s)/m.test(trimmed);
}
