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
      /** 默认 0：与内容块自带 padding 叠加易过宽；需要整节留白时在 Section 设置里调整 */
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
    },
    columns,
  };
}
