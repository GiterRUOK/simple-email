import type { EmailDoc, Section } from '../types';
import { uid } from './id';

/** 剪贴板 / 文件 interchange 信封标识 */
export const DOC_CLIPBOARD_KIND = 'simple-mail/doc' as const;
export const DOC_CLIPBOARD_FORMAT_VERSION = 1 as const;

export interface DocClipboardEnvelope {
  kind: typeof DOC_CLIPBOARD_KIND;
  formatVersion: typeof DOC_CLIPBOARD_FORMAT_VERSION;
  doc: EmailDoc;
}

export function serializeDocClipboard(doc: EmailDoc): string {
  const envelope: DocClipboardEnvelope = {
    kind: DOC_CLIPBOARD_KIND,
    formatVersion: DOC_CLIPBOARD_FORMAT_VERSION,
    doc,
  };
  return JSON.stringify(envelope);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEmailDocShape(v: unknown): v is EmailDoc {
  if (!isRecord(v)) return false;
  if (v.version !== '1') return false;
  if (!isRecord(v.meta)) return false;
  if (!Array.isArray(v.sections)) return false;
  for (const sec of v.sections) {
    if (!isRecord(sec) || !Array.isArray(sec.columns)) return false;
    for (const col of sec.columns) {
      if (!isRecord(col) || !Array.isArray(col.blocks)) return false;
    }
  }
  return true;
}

/**
 * 解析剪贴板或手动粘贴的 JSON。支持信封格式与裸 `EmailDoc`（version: '1'）。
 */
export function parseDocClipboard(raw: string): EmailDoc | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if (parsed.kind === DOC_CLIPBOARD_KIND) {
    if (parsed.formatVersion !== DOC_CLIPBOARD_FORMAT_VERSION) return null;
    const doc = parsed.doc;
    if (!isEmailDocShape(doc)) return null;
    return structuredClone(doc);
  }

  if (isEmailDocShape(parsed)) {
    return structuredClone(parsed);
  }

  return null;
}

/** 导入前重生成 section / column / block id，避免与当前文档冲突。 */
export function regenerateDocIds(doc: EmailDoc): EmailDoc {
  const next = structuredClone(doc);
  next.sections = next.sections.map((sec) => remapSectionIds(sec));
  return next;
}

function remapSectionIds(sec: Section): Section {
  return {
    ...sec,
    id: uid('sec'),
    columns: sec.columns.map((col) => ({
      ...col,
      id: uid('col'),
      blocks: col.blocks.map((blk) => ({
        ...blk,
        id: uid('blk'),
      })),
    })),
  };
}
