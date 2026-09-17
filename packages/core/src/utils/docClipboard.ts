import type { Block, EmailDoc, Section, Variable } from '../types';
import { uid } from './id';

/** 剪贴板 / 文件 interchange 信封标识 */
export const DOC_CLIPBOARD_KIND = 'simple-mail/doc' as const;
export const DOC_CLIPBOARD_FORMAT_VERSION = 1 as const;

/** 局部设计稿（Section / Block 子集）剪贴板信封标识 */
export const SELECTION_CLIPBOARD_KIND = 'simple-mail/selection' as const;
export const SELECTION_CLIPBOARD_FORMAT_VERSION = 1 as const;

export interface DocClipboardEnvelope {
  kind: typeof DOC_CLIPBOARD_KIND;
  formatVersion: typeof DOC_CLIPBOARD_FORMAT_VERSION;
  doc: EmailDoc;
}

/**
 * 局部设计稿信封：携带若干 Section 与若干独立 Block。
 * 粘贴时按「追加」语义落到目标画布，不覆盖现有内容。
 */
export interface SelectionClipboardEnvelope {
  kind: typeof SELECTION_CLIPBOARD_KIND;
  formatVersion: typeof SELECTION_CLIPBOARD_FORMAT_VERSION;
  /** 源文档变量列表；粘贴时仅合并被内容引用到的 key */
  variables: Variable[];
  sections: Section[];
  blocks: Block[];
}

export function serializeDocClipboard(doc: EmailDoc): string {
  const envelope: DocClipboardEnvelope = {
    kind: DOC_CLIPBOARD_KIND,
    formatVersion: DOC_CLIPBOARD_FORMAT_VERSION,
    doc,
  };
  return JSON.stringify(envelope);
}

/** 序列化局部设计稿（选中的 Section / Block）为剪贴板 JSON。 */
export function serializeSelectionClipboard(input: {
  sections?: Section[];
  blocks?: Block[];
  variables?: Variable[];
}): string {
  const envelope: SelectionClipboardEnvelope = {
    kind: SELECTION_CLIPBOARD_KIND,
    formatVersion: SELECTION_CLIPBOARD_FORMAT_VERSION,
    variables: input.variables ?? [],
    sections: input.sections ?? [],
    blocks: input.blocks ?? [],
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

function isVariableShape(v: unknown): v is Variable {
  if (!isRecord(v)) return false;
  return typeof v.key === 'string' && typeof v.label === 'string';
}

/**
 * 解析局部设计稿信封（`simple-mail/selection`）。
 * 仅做形状校验，不做未注册类型过滤（由编辑器粘贴时按 registry 处理）。
 */
export function parseSelectionClipboard(raw: string): SelectionClipboardEnvelope | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.kind !== SELECTION_CLIPBOARD_KIND) return null;
  if (parsed.formatVersion !== SELECTION_CLIPBOARD_FORMAT_VERSION) return null;

  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const variables = Array.isArray(parsed.variables) ? parsed.variables : [];

  for (const sec of sections) {
    if (!isRecord(sec) || !Array.isArray(sec.columns)) return null;
    for (const col of sec.columns) {
      if (!isRecord(col) || !Array.isArray(col.blocks)) return null;
      for (const blk of col.blocks) {
        if (!isRecord(blk) || typeof blk.type !== 'string') return null;
      }
    }
  }
  for (const blk of blocks) {
    if (!isRecord(blk) || typeof blk.type !== 'string') return null;
  }

  return structuredClone({
    kind: SELECTION_CLIPBOARD_KIND,
    formatVersion: SELECTION_CLIPBOARD_FORMAT_VERSION,
    variables: variables.filter(isVariableShape),
    sections,
    blocks,
  } satisfies SelectionClipboardEnvelope);
}

/** 导入前重生成 section / column / block id，避免与当前文档冲突。 */
export function regenerateDocIds(doc: EmailDoc): EmailDoc {
  const next = structuredClone(doc);
  next.sections = next.sections.map((sec) => remapSectionIds(sec));
  return next;
}

/** 重生成单个 Section（含列与块）的全部 id，用于局部粘贴。 */
export function remapSectionIds(sec: Section): Section {
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

/** 重生成单个 Block 的 id，用于局部粘贴。 */
export function regenerateBlockId(block: Block): Block {
  return { ...block, id: uid('blk') };
}

/** 扫描局部设计稿内容中引用的 `{{key}}` 变量名集合（粘贴时用于变量并集）。 */
export function collectSelectionVariableKeys(envelope: SelectionClipboardEnvelope): Set<string> {
  const keys = new Set<string>();
  const scan = (value: unknown) => {
    const text = JSON.stringify(value) ?? '';
    const re = /\{\{\s*([^}]+?)\s*\}\}/g;
    let m: RegExpExecArray | null = re.exec(text);
    while (m) {
      const key = m[1]?.trim();
      if (key) keys.add(key);
      m = re.exec(text);
    }
  };
  scan(envelope.sections);
  scan(envelope.blocks);
  return keys;
}
