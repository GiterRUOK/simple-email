import type { Store } from '../store/store';
import { normalizeAccentHex, rgbCssToHex } from '../utils/accentColor';
import { h, clear } from '../utils/dom';
import type { EditorTheme } from './theme';

export type EditorMode = 'design' | 'source';

export interface TopbarOptions {
  store: Store;
  mode: EditorMode;
  theme: EditorTheme;
  /** 用于读取解析后的 `--sm-primary`，同步到原生 color 输入 */
  accentPickerRoot?: HTMLElement;
  /** 为 true 时在顶栏显示主题色拾取器（需同时提供 `onAccentChange`） */
  showAccentColorPicker?: boolean;
  onAccentChange?: (hex: string) => void;
  onThemeChange: (t: EditorTheme) => void;
  onModeChange: (m: EditorMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** 清空画布选中并回到右栏「邮件设置 / 全局样式」 */
  onMailSettings: () => void;
  onInsertVariable: (anchor: HTMLElement) => void;
  onPreview: () => void;
  onExport: () => void;
  /** 切换编辑器根节点浏览器全屏（由 Editor 实现 Fullscreen API） */
  onFullscreenToggle?: () => void;
  /** 切换画布 Section / Block 布局虚线边框 */
  onLayoutBordersToggle?: () => void;
  /** 为 false 时不展示全屏按钮（也可用 `ui.hideTopbarFullscreen`） */
  showFullscreenButton?: boolean;
  /** 为 false 时不展示「邮件设置」按钮（也可用 `ui.hideTopbarMailSettings`） */
  showMailSettingsButton?: boolean;
  /** 为 false 时不渲染左侧产品标题 */
  showTitle?: boolean;
}

export class Topbar {
  el: HTMLElement;
  private opts: TopbarOptions;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private themeButtons!: Record<EditorTheme, HTMLButtonElement>;
  private modeButtons: Record<EditorMode, HTMLButtonElement> = {} as any;
  private accentInput?: HTMLInputElement;
  private fullscreenBtn?: HTMLButtonElement;
  private layoutBordersBtn?: HTMLButtonElement;

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

  syncTheme(t: EditorTheme) {
    this.opts.theme = t;
    for (const k of ['light', 'dark', 'system'] as const) {
      const on = k === t;
      this.themeButtons[k].classList.toggle('sm-segmented__item--active', on);
      this.themeButtons[k].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /** 根据 `.sm-root` 上计算后的 `--sm-primary` 更新拾取器显示（无拾取器或未挂 root 时忽略） */
  syncAccentPicker() {
    if (!this.accentInput || !this.opts.accentPickerRoot) return;
    const raw = getComputedStyle(this.opts.accentPickerRoot).getPropertyValue('--sm-primary').trim();
    const base = normalizeAccentHex(raw) || rgbCssToHex(raw);
    if (!base) return;
    const norm = normalizeAccentHex(base);
    if (!norm) return;
    const forInput = `#${norm.slice(1).toLowerCase()}`;
    if (this.accentInput.value.toLowerCase() !== forInput) this.accentInput.value = forInput;
  }

  /** 与 document fullscreen 状态同步图标与 aria（按钮不存在时忽略） */
  setFullscreenActive(active: boolean) {
    const btn = this.fullscreenBtn;
    if (!btn) return;
    btn.replaceChildren(active ? iconFullscreenExit() : iconFullscreenEnter());
    btn.title = active ? '退出全屏' : '全屏';
    btn.setAttribute('aria-label', active ? '退出全屏' : '全屏');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  /** 与画布布局边框开关同步按钮高亮（按钮不存在时忽略） */
  setLayoutBordersActive(active: boolean) {
    const btn = this.layoutBordersBtn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = active ? '隐藏 Section / Block 边框' : '显示 Section / Block 边框';
    btn.setAttribute('aria-label', active ? '隐藏 Section / Block 边框' : '显示 Section / Block 边框');
  }

  private _render() {
    clear(this.el);

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

    const themeSeg = h('div', {
      class: 'sm-segmented sm-topbar__theme-seg',
      role: 'group',
      'aria-label': '界面主题',
    });
    const themeBtn = (theme: EditorTheme, title: string, icon: SVGElement) =>
      h(
        'button',
        {
          class: 'sm-segmented__item sm-topbar__theme-btn',
          type: 'button',
          title,
          'aria-pressed': theme === this.opts.theme ? 'true' : 'false',
          onclick: () => this.opts.onThemeChange(theme),
        },
        [icon],
      ) as HTMLButtonElement;
    this.themeButtons = {
      light: themeBtn('light', '浅色', iconSun()),
      dark: themeBtn('dark', '深色', iconMoon()),
      system: themeBtn('system', '跟随系统', iconThemeAuto()),
    };
    themeSeg.append(this.themeButtons.light, this.themeButtons.dark, this.themeButtons.system);

    const themeGroupKids: Node[] = [themeSeg];
    if (this.opts.showAccentColorPicker && this.opts.onAccentChange) {
      const inputEl = h('input', {
        type: 'color',
        class: 'sm-topbar__accent-input',
        'aria-label': '主题色',
        title: '主题色',
        value: '#4f46e5',
      }) as HTMLInputElement;
      inputEl.addEventListener('input', () => this.opts.onAccentChange!(inputEl.value));
      this.accentInput = inputEl;
      themeGroupKids.push(h('div', { class: 'sm-topbar__accent' }, [inputEl]));
    } else {
      this.accentInput = undefined;
    }

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

    const showMailSettings = this.opts.showMailSettingsButton !== false;
    const trailingGroup: HTMLElement[] = [];
    if (showMailSettings) {
      trailingGroup.push(
        h(
          'button',
          {
            class: 'sm-btn sm-btn--ghost',
            type: 'button',
            title: '邮件主题、宽度与全局样式',
            onclick: () => this.opts.onMailSettings(),
          },
          ['邮件设置'],
        ),
      );
    }
    trailingGroup.push(insertVar, previewBtn, exportBtn);

    const canvasToolKids: HTMLElement[] = [];

    if (typeof this.opts.onLayoutBordersToggle === 'function') {
      canvasToolKids.push(
        (this.layoutBordersBtn = h(
          'button',
          {
            class: 'sm-btn sm-btn--ghost sm-topbar__icon-btn sm-topbar__toggle-btn',
            type: 'button',
            title: '显示 Section / Block 边框',
            'aria-label': '显示 Section / Block 边框',
            'aria-pressed': 'false',
            onclick: () => this.opts.onLayoutBordersToggle!(),
          },
          [iconLayoutBorders()],
        ) as HTMLButtonElement),
      );
    } else {
      this.layoutBordersBtn = undefined;
    }

    const showFs =
      this.opts.showFullscreenButton !== false &&
      typeof this.opts.onFullscreenToggle === 'function';
    if (showFs) {
      canvasToolKids.push(
        (this.fullscreenBtn = h(
          'button',
          {
            class: 'sm-btn sm-btn--ghost sm-topbar__icon-btn',
            type: 'button',
            title: '全屏',
            'aria-label': '全屏',
            'aria-pressed': 'false',
            onclick: () => this.opts.onFullscreenToggle!(),
          },
          [iconFullscreenEnter()],
        ) as HTMLButtonElement),
      );
    } else {
      this.fullscreenBtn = undefined;
    }

    const canvasToolsGroup =
      canvasToolKids.length > 0 && h('div', { class: 'sm-topbar__group' }, canvasToolKids);

    const headKids: HTMLElement[] = [];
    if (this.opts.showTitle !== false) {
      headKids.push(h('div', { class: 'sm-topbar__title' }, ['Simple Mail Editor']));
    }

    this.el.append(
      ...headKids,
      h('div', { class: 'sm-topbar__group' }, [segmented]),
      h('div', { class: 'sm-topbar__group sm-topbar__theme-group' }, themeGroupKids),
      h('div', { class: 'sm-topbar__group' }, [this.undoBtn, this.redoBtn]),
      ...(canvasToolsGroup ? [canvasToolsGroup] : []),
      h('div', { class: 'sm-topbar__spacer' }),
      h('div', { class: 'sm-topbar__group' }, trailingGroup),
    );

    this.setMode(this.opts.mode);
    this.syncTheme(this.opts.theme);
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
/** 布局边框：虚线框 + 勾选（点亮时显示勾） */
function iconLayoutBorders(): SVGElement {
  const el = svg(
    '<rect x="4.5" y="4.5" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="2.5 2"/><path d="M7.2 10.1l1.8 1.8 3.8-3.9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="sm-layout-borders-check"/>',
  );
  return el;
}
/** 进入全屏：四角向外 */
function iconFullscreenEnter(): SVGElement {
  return svg(
    '<path d="M6 4H4v2M14 4h2v2M6 16H4v-2M14 16h2v-2M4 6V4h2M16 6V4h-2M4 14v2h2M16 14v2h-2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  );
}
/** 退出全屏：四角向内 */
function iconFullscreenExit(): SVGElement {
  return svg(
    '<path d="M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4M4 8h4v4H4M16 8h-4v4h4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  );
}
function iconSun(): SVGElement {
  return svgTheme(
    '<circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 3.5V5M10 15v1.5M16.5 10H15M5 10H3.5M14.1 5.9 13 7M7 13 5.9 14.1M14.1 14.1 13 13M7 7 5.9 5.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  );
}
function iconMoon(): SVGElement {
  return svgTheme(
    '<path d="M8.5 4.2a5.8 5.8 0 100 11.3 4.8 4.8 0 01-1.3-11.3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  );
}
/** 显示器：表示跟随系统外观 */
function iconThemeAuto(): SVGElement {
  return svgTheme(
    '<path d="M5 5.5h10c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5v-6c0-.8.7-1.5 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 16h4M10 14.2V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
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
function svgTheme(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '15');
  el.setAttribute('height', '15');
  el.setAttribute('viewBox', '0 0 20 20');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
}
