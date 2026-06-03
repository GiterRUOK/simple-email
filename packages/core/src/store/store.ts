import type { Block, Column, EmailDoc, Section, SectionLayout, Selection } from '../types';
import { uid } from '../utils/id';

/** 文档变更通知来源（右栏等可按来源决定是否保留焦点） */
export type DocChangedDetail = { source: 'mutate' | 'history' | 'replace' };

type Listener = (detail?: DocChangedDetail) => void;
type SelectionListener = () => void;

/**
 * 极小的不可变 store + 发布订阅 + history。
 * 所有变更都通过 `update(fn)` 走结构化克隆，保证：
 *  - 引用不可变（外部 memo/diff 友好）
 *  - 变更原子（一个 update 一条 history）
 */
export class Store {
  private _doc: EmailDoc;
  private _selection: Selection | null = null;
  private _listeners: Set<Listener> = new Set();
  private _selectionListeners: Set<SelectionListener> = new Set();
  private _past: EmailDoc[] = [];
  private _future: EmailDoc[] = [];
  private _historyLimit = 100;

  constructor(initial: EmailDoc) {
    this._doc = initial;
  }

  get doc(): EmailDoc {
    return this._doc;
  }

  get selection(): Selection | null {
    return this._selection;
  }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  subscribeSelection(fn: SelectionListener): () => void {
    this._selectionListeners.add(fn);
    return () => this._selectionListeners.delete(fn);
  }

  setSelection(sel: Selection | null) {
    this._selection = sel;
    this._selectionListeners.forEach((l) => l());
  }

  /**
   * 应用一次变更。`mutator` 收到一份可直接修改的 draft（结构化克隆得来）。
   * 修改完毕后用新对象替换当前 doc，并把旧 doc 入历史。
   */
  update(mutator: (draft: EmailDoc) => void, opts: { silent?: boolean } = {}) {
    const draft = structuredClone(this._doc);
    mutator(draft);
    this._past.push(this._doc);
    if (this._past.length > this._historyLimit) this._past.shift();
    this._future = [];
    this._doc = draft;
    if (!opts.silent) this._notify('mutate');
  }

  /** 替换整个文档（如外部 setValue），会清空 history。 */
  replace(doc: EmailDoc) {
    this._past = [];
    this._future = [];
    this._doc = doc;
    this._notify('replace');
  }

  undo(): boolean {
    const prev = this._past.pop();
    if (!prev) return false;
    this._future.push(this._doc);
    this._doc = prev;
    this._notify('history');
    return true;
  }

  redo(): boolean {
    const next = this._future.pop();
    if (!next) return false;
    this._past.push(this._doc);
    this._doc = next;
    this._notify('history');
    return true;
  }

  canUndo() {
    return this._past.length > 0;
  }

  canRedo() {
    return this._future.length > 0;
  }

  private _notify(source: DocChangedDetail['source']) {
    const detail: DocChangedDetail = { source };
    this._listeners.forEach((l) => l(detail));
  }
}

/* -------------------------------------------------------------------------- */
/*                              便捷的查询/变更助手                             */
/* -------------------------------------------------------------------------- */

export function findSection(doc: EmailDoc, sectionId: string): Section | undefined {
  return doc.sections.find((s) => s.id === sectionId);
}

export function findBlockLocation(
  doc: EmailDoc,
  blockId: string,
): { section: Section; columnIndex: number; block: Block } | undefined {
  for (const section of doc.sections) {
    for (let i = 0; i < section.columns.length; i += 1) {
      const col = section.columns[i];
      const blk = col.blocks.find((b) => b.id === blockId);
      if (blk) return { section, columnIndex: i, block: blk };
    }
  }
  return undefined;
}

/**
 * 若指定 Section 的每一列都没有 Block，则从文档中移除该 Section。
 * 在内容块被删除或拖走后调用，可与 `autoWrapSection` 搭配，避免单列 Section 在唯一块离场后仍残留空壳；
 * 多列 Section 始终保留，便于继续向各列拖入内容。
 * 仅处理刚变空的 Section，不会误删用户事先添加、尚未拖入内容的空布局。
 */
export function pruneSectionIfEmpty(draft: EmailDoc, sectionId: string) {
  const sec = draft.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  if (sec.columns.length > 1) return;
  const isEmpty = sec.columns.every((col) => col.blocks.length === 0);
  if (!isEmpty) return;
  draft.sections = draft.sections.filter((s) => s.id !== sectionId);
}

/** @deprecated 请改用 {@link pruneSectionIfEmpty}，避免误删多个空 Section */
export function pruneEmptySections(draft: EmailDoc) {
  draft.sections = draft.sections.filter((sec) =>
    sec.columns.some((col) => col.blocks.length > 0),
  );
}

/** 多列 Section 的列布局（左栏拖入默认 `1-1`，右栏可切换列数/比例） */
export const MULTI_COLUMN_LAYOUTS = ['1-1', '1-2', '2-1', '1-1-1'] as const;
export type MultiColumnLayout = (typeof MULTI_COLUMN_LAYOUTS)[number];

/** @deprecated 使用 MULTI_COLUMN_LAYOUTS */
export const TWO_COLUMN_LAYOUTS = ['1-1', '1-2', '2-1'] as const;
export type TwoColumnLayout = (typeof TWO_COLUMN_LAYOUTS)[number];

export function isMultiColumnLayout(layout: SectionLayout): layout is MultiColumnLayout {
  return (
    layout === '1-1' || layout === '1-2' || layout === '2-1' || layout === '1-1-1'
  );
}

/** @deprecated 使用 isMultiColumnLayout */
export function isTwoColumnLayout(layout: SectionLayout): layout is TwoColumnLayout {
  return layout === '1-1' || layout === '1-2' || layout === '2-1';
}

/** 更新 layout；列数变化时增删列，被删列内块并入最后一列 */
export function setSectionLayout(section: Section, layout: SectionLayout): void {
  const nextCols = layout.split('-').length;
  const curCols = section.columns.length;
  if (nextCols === curCols) {
    section.layout = layout;
    return;
  }
  if (nextCols > curCols) {
    for (let i = curCols; i < nextCols; i++) {
      section.columns.push({ id: uid('col'), attrs: {}, blocks: [] });
    }
  } else {
    const removed = section.columns.splice(nextCols);
    const last = section.columns[nextCols - 1];
    if (last) {
      for (const col of removed) last.blocks.push(...col.blocks);
    }
  }
  section.layout = layout;
}

export function createSection(layout: SectionLayout): Section {
  const colCount = layout.split('-').length;
  const columns: Column[] = Array.from({ length: colCount }, () => ({
    id: uid('col'),
    attrs: {},
    blocks: [],
  }));
  return {
    id: uid('sec'),
    type: 'section',
    layout,
    attrs: {
      /** 默认左右 16：版心内边距由节承担；上下 0 由内容块堆叠节奏（常见 8）控制 */
      paddingTop: 0,
      paddingRight: 16,
      paddingBottom: 0,
      paddingLeft: 16,
    },
    columns,
  };
}
