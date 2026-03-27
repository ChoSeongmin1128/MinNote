import type { JsonValue } from '../types';

function normalizeStructuredLines(lines: string[]) {
  return lines
    .map((line) => line.replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractStructuredLinesFromMarkdownJson(value: JsonValue | string): string[] {
  if (typeof value === 'string') {
    return value.split('\n');
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractStructuredLinesFromMarkdownJson);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const nodeType = typeof value.type === 'string' ? value.type : null;
  const content = Array.isArray(value.content) ? value.content : null;

  if (nodeType === 'text') {
    return typeof value.text === 'string' ? [value.text] : [];
  }

  if (nodeType === 'hardBreak') {
    return ['\n'];
  }

  if (nodeType === 'doc') {
    return content ? content.flatMap(extractStructuredLinesFromMarkdownJson) : [];
  }

  if (nodeType === 'listItem' || nodeType === 'taskItem') {
    const body = content ? normalizeStructuredLines(content.flatMap(extractStructuredLinesFromMarkdownJson)) : '';
    return body ? [body, '\n'] : ['\n'];
  }

  if (nodeType === 'bulletList' || nodeType === 'orderedList' || nodeType === 'taskList') {
    return content ? [...content.flatMap(extractStructuredLinesFromMarkdownJson), '\n'] : ['\n'];
  }

  if (
    nodeType === 'paragraph' ||
    nodeType === 'heading' ||
    nodeType === 'blockquote' ||
    nodeType === 'codeBlock'
  ) {
    const body = content ? normalizeStructuredLines(content.flatMap(extractStructuredLinesFromMarkdownJson)) : '';
    return body ? [body, '\n'] : ['\n'];
  }

  if (content) {
    return content.flatMap(extractStructuredLinesFromMarkdownJson);
  }

  return [];
}

export function getBlockPreviewText(kind: 'markdown' | 'code' | 'text', content: JsonValue | string) {
  if (kind === 'markdown') {
    if (typeof content === 'string') {
      return content.trimEnd();
    }

    return normalizeStructuredLines(extractStructuredLinesFromMarkdownJson(content));
  }

  return typeof content === 'string' ? content.trimEnd() : '';
}
