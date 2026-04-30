import type { Store } from '../store/store';
import { h, clear } from '../utils/dom';

export type EditorMode = 'design' | 'source';

export interface TopbarOptions {
  store: Store;
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** 清空画布选中并回到右栏「邮件设置 / 全局样式」 */
  onMailSettings: () => void;
  onInsertVariable: (anchor: HTMLElement) => void;
  onPreview: () => void;
  onExport: () => void;
}

export class Topbar {
  el: HTMLElement;
  private opts: TopbarOptions;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private modeButtons: Record<EditorMode, HTMLButtonElement> = {} as any;

  constructor(opts: TopbarOptions) {
    this.opts = opts;
    this.el = h('header', { class: 'sm-topbar' });
    this._render();
    opts.store.subscribe(() => this._sync());
    this._sync();
  }

  setMode(m: EditorMode) {
    this.opts.mode = m;
    for (const k of ['design', 'source'] as EditorMode[]) {
      this.modeButtons[k].classList.toggle('sm-segmented__item--active', k === m);
    }
  }

  private _render() {
    clear(this.el);

    const title = h('div', { class: 'sm-topbar__title' }, ['Simple Mail Editor']);

    const segmented = h('div', { class: 'sm-segmented' });
    const designBtn = h(
      'button',
      {
        class: 'sm-segmented__item sm-segmented__item--active',
        type: 'button',
        onclick: () => this.opts.onModeChange('design'),
      },
      ['设计'],
    );
    const sourceBtn = h(
      'button',
      {
        class: 'sm-segmented__item',
        type: 'button',
        onclick: () => this.opts.onModeChange('source'),
      },
      ['源码'],
    );
    segmented.append(designBtn, sourceBtn);
    this.modeButtons = { design: designBtn, source: sourceBtn };

    this.undoBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--ghost',
        type: 'button',
        title: '撤销 ⌘Z',
        onclick: this.opts.onUndo,
      },
      [iconUndo(), '撤销'],
    );
    this.redoBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--ghost',
        type: 'button',
        title: '重做 ⌘⇧Z',
        onclick: this.opts.onRedo,
      },
      [iconRedo(), '重做'],
    );

    const mailSettingsBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--ghost',
        type: 'button',
        title: '邮件主题、宽度与全局样式',
        onclick: () => this.opts.onMailSettings(),
      },
      ['邮件设置'],
    );

    const insertVar = h(
      'button',
      {
        class: 'sm-btn',
        type: 'button',
        onclick: (e: Event) => this.opts.onInsertVariable(e.currentTarget as HTMLElement),
      },
      ['{{ }} 插入变量'],
    );

    const previewBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: this.opts.onPreview },
      [iconEye(), '预览'],
    );

    const exportBtn = h(
      'button',
      { class: 'sm-btn sm-btn--primary', type: 'button', onclick: this.opts.onExport },
      ['导出 HTML'],
    );

    this.el.append(
      title,
      h('div', { class: 'sm-topbar__group' }, [segmented]),
      h('div', { class: 'sm-topbar__group' }, [this.undoBtn, this.redoBtn]),
      h('div', { class: 'sm-topbar__spacer' }),
      h('div', { class: 'sm-topbar__group' }, [mailSettingsBtn, insertVar, previewBtn, exportBtn]),
    );

    this.setMode(this.opts.mode);
  }

  private _sync() {
    this.undoBtn.disabled = !this.opts.store.canUndo();
    this.redoBtn.disabled = !this.opts.store.canRedo();
  }
}

function iconUndo(): SVGElement {
  return svg(
    '<path d="M9 14l-4-4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10h7a4 4 0 010 8h-1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  );
}
function iconRedo(): SVGElement {
  return svg(
    '<path d="M11 14l4-4-4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 10H8a4 4 0 000 8h1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  );
}
function iconEye(): SVGElement {
  return svg(
    '<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="10" cy="10" r="2.4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  );
}
function svg(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '14');
  el.setAttribute('height', '14');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML = inner;
  return el;
}
