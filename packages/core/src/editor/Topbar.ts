import type { Store } from '../store/store';
import { bindColorPickerInput } from './ColorPickerPopover';
import { normalizeAccentHex, rgbCssToHex } from '../utils/accentColor';
import { h, clear } from '../utils/dom';
import type { EditorTheme } from './theme';

export type EditorMode = 'design' | 'source';

export interface TopbarOptions {
  store: Store;
  mode: EditorMode;
  theme: EditorTheme;
  /** 顶栏仅图标（tooltip 说明），适合窄屏嵌入 */
  compact?: boolean;
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
  /** 为 false 时不展示「清空画布」 */
  showClearCanvasButton?: boolean;
  onClearCanvas?: () => void;
  /** 为 false 时不展示「重置内容」 */
  showResetContentButton?: boolean;
  onResetContent?: () => void;
  /** 为 false 时不展示「复制设计稿」「导入设计稿」 */
  showDocClipboardButtons?: boolean;
  onCopyDocDesign?: () => void;
  onImportDocDesign?: () => void;
  /** 为 false 时不展示「插入变量」 */
  showInsertVariableButton?: boolean;
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
  private insertVariableBtn?: HTMLButtonElement;

  constructor(opts: TopbarOptions) {
    this.opts = opts;
    this.el = h('header', { class: 'sm-topbar' });
    this.setCompact(opts.compact === true);
    this._render();
    opts.store.subscribe(() => this._sync());
    this._sync();
  }

  /** 切换顶栏紧凑样式（仅图标布局，文案由 CSS 隐藏） */
  setCompact(compact: boolean) {
    this.el.classList.toggle('sm-topbar--compact', compact);
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

  /** 变量列表在右栏打开（设计态）或浮层打开（源码态）时高亮顶栏按钮 */
  setInsertVariableActive(active: boolean) {
    const btn = this.insertVariableBtn;
    if (!btn) return;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.classList.toggle('sm-topbar__insert-var--active', active);
  }

  private _render() {
    clear(this.el);

    const segmented = h('div', { class: 'sm-segmented sm-topbar__mode-seg', role: 'group', 'aria-label': '编辑模式' });
    const designBtn = modeSegBtn({
      active: this.opts.mode === 'design',
      title: '设计',
      icon: iconDesign(),
      label: '设计',
      onclick: () => this.opts.onModeChange('design'),
    });
    const sourceBtn = modeSegBtn({
      active: this.opts.mode === 'source',
      title: '源码',
      icon: iconSource(),
      label: '源码',
      onclick: () => this.opts.onModeChange('source'),
    });
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
          'aria-label': title,
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
      bindColorPickerInput(inputEl, {
        layerRoot: this.opts.accentPickerRoot,
        liveCommit: true,
        onCommit: (hex) => this.opts.onAccentChange!(hex),
      });
      this.accentInput = inputEl;
      themeGroupKids.push(h('div', { class: 'sm-topbar__accent' }, [inputEl]));
    } else {
      this.accentInput = undefined;
    }

    this.undoBtn = actionBtn({
      class: 'sm-btn--ghost',
      title: '撤销 ⌘Z',
      icon: iconUndo(),
      label: '撤销',
      onclick: this.opts.onUndo,
    });
    this.redoBtn = actionBtn({
      class: 'sm-btn--ghost',
      title: '重做 ⌘⇧Z',
      icon: iconRedo(),
      label: '重做',
      onclick: this.opts.onRedo,
    });

    const contentActionKids: HTMLElement[] = [];
    if (this.opts.showClearCanvasButton !== false && typeof this.opts.onClearCanvas === 'function') {
      contentActionKids.push(
        actionBtn({
          class: 'sm-btn--ghost',
          title: '清空画布：移除画布上所有 Section 与组件',
          icon: iconClearCanvas(),
          label: '清空画布',
          onclick: () => this.opts.onClearCanvas!(),
        }),
      );
    }
    if (
      this.opts.showResetContentButton !== false &&
      typeof this.opts.onResetContent === 'function'
    ) {
      contentActionKids.push(
        actionBtn({
          class: 'sm-btn--ghost',
          title: '重置内容：恢复为预置邮件结构',
          icon: iconResetContent(),
          label: '重置内容',
          onclick: () => this.opts.onResetContent!(),
        }),
      );
    }
    if (this.opts.showDocClipboardButtons !== false) {
      if (typeof this.opts.onCopyDocDesign === 'function') {
        contentActionKids.push(
          actionBtn({
            class: 'sm-btn--ghost',
            title: '复制设计稿：将画布 JSON 写入剪贴板，可在另一封邮件中导入',
            icon: iconCopyDoc(),
            label: '复制设计稿',
            onclick: () => this.opts.onCopyDocDesign!(),
          }),
        );
      }
      if (typeof this.opts.onImportDocDesign === 'function') {
        contentActionKids.push(
          actionBtn({
            class: 'sm-btn--ghost',
            title: '导入设计稿：从剪贴板或粘贴 JSON 覆盖当前画布',
            icon: iconImportDoc(),
            label: '导入设计稿',
            onclick: () => this.opts.onImportDocDesign!(),
          }),
        );
      }
    }
    const contentActionsGroup =
      contentActionKids.length > 0 && h('div', { class: 'sm-topbar__group' }, contentActionKids);

    const previewBtn = actionBtn({
      title: '预览',
      icon: iconEye(),
      label: '预览',
      onclick: this.opts.onPreview,
    });

    const exportBtn = actionBtn({
      class: 'sm-btn--primary',
      title: '导出 HTML',
      icon: iconExport(),
      label: '导出 HTML',
      onclick: this.opts.onExport,
    });

    const showMailSettings = this.opts.showMailSettingsButton !== false;
    const trailingGroup: HTMLElement[] = [];
    if (showMailSettings) {
      trailingGroup.push(
        actionBtn({
          class: 'sm-btn--ghost',
          title: '邮件设置：主题、宽度与全局样式',
          icon: iconSettings(),
          label: '邮件设置',
          onclick: () => this.opts.onMailSettings(),
        }),
      );
    }
    if (this.opts.showInsertVariableButton !== false) {
      trailingGroup.push(
        (this.insertVariableBtn = actionBtn({
          class: 'sm-topbar__insert-var',
          title: '插入变量',
          icon: iconVariable(),
          label: '插入变量',
          onclick: (e: Event) => this.opts.onInsertVariable(e.currentTarget as HTMLElement),
        })),
      );
    } else {
      this.insertVariableBtn = undefined;
    }
    trailingGroup.push(previewBtn, exportBtn);

    const canvasToolKids: HTMLElement[] = [];

    if (typeof this.opts.onLayoutBordersToggle === 'function') {
      canvasToolKids.push(
        (this.layoutBordersBtn = iconOnlyBtn({
          class: 'sm-btn--ghost sm-topbar__toggle-btn',
          title: '显示 Section / Block 边框',
          icon: iconLayoutBorders(),
          pressed: false,
          onclick: () => this.opts.onLayoutBordersToggle!(),
        }) as HTMLButtonElement),
      );
    } else {
      this.layoutBordersBtn = undefined;
    }

    const showFs =
      this.opts.showFullscreenButton !== false &&
      typeof this.opts.onFullscreenToggle === 'function';
    if (showFs) {
      canvasToolKids.push(
        (this.fullscreenBtn = iconOnlyBtn({
          class: 'sm-btn--ghost sm-topbar__toggle-btn',
          title: '全屏',
          icon: iconFullscreenEnter(),
          pressed: false,
          onclick: () => this.opts.onFullscreenToggle!(),
        }) as HTMLButtonElement),
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
      ...(contentActionsGroup ? [contentActionsGroup] : []),
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

function topbarLabel(text: string): HTMLElement {
  return h('span', { class: 'sm-topbar__btn-label' }, [text]);
}

function actionBtn(opts: {
  class?: string;
  title: string;
  icon: SVGElement;
  label: string;
  onclick: (e: Event) => void;
}): HTMLButtonElement {
  const extra = opts.class ? ` ${opts.class}` : '';
  return h(
    'button',
    {
      class: `sm-btn sm-topbar__action-btn${extra}`,
      type: 'button',
      title: opts.title,
      'aria-label': opts.title,
      onclick: opts.onclick,
    },
    [opts.icon, topbarLabel(opts.label)],
  ) as HTMLButtonElement;
}

function modeSegBtn(opts: {
  active: boolean;
  title: string;
  icon: SVGElement;
  label: string;
  onclick: () => void;
}): HTMLButtonElement {
  const cls = opts.active
    ? 'sm-segmented__item sm-topbar__mode-btn sm-segmented__item--active'
    : 'sm-segmented__item sm-topbar__mode-btn';
  return h(
    'button',
    {
      class: cls,
      type: 'button',
      title: opts.title,
      'aria-label': opts.title,
      onclick: opts.onclick,
    },
    [opts.icon, topbarLabel(opts.label)],
  ) as HTMLButtonElement;
}

function iconOnlyBtn(opts: {
  class?: string;
  title: string;
  icon: SVGElement;
  pressed: boolean;
  onclick: () => void;
}): HTMLButtonElement {
  const extra = opts.class ? ` ${opts.class}` : '';
  return h(
    'button',
    {
      class: `sm-btn sm-btn--ghost sm-topbar__icon-btn${extra}`,
      type: 'button',
      title: opts.title,
      'aria-label': opts.title,
      'aria-pressed': opts.pressed ? 'true' : 'false',
      onclick: opts.onclick,
    },
    [opts.icon],
  ) as HTMLButtonElement;
}

const ICON_UNDO_PATH =
  'M596.16 284.064H258.56l101.376-101.44a31.968 31.968 0 1 0-45.248-45.216L178.56 273.504c-11.904 11.872-18.496 27.84-18.56 44.8a63.04 63.04 0 0 0 18.56 45.28l136.128 136.16a31.904 31.904 0 0 0 45.248 0 31.968 31.968 0 0 0 0-45.248l-106.752-106.496H596.16c114.88 0 208.32 93.312 208.32 208s-93.44 208-208.32 208h-223.36a32 32 0 0 0 0 64h223.36c150.144 0 272.32-122.016 272.32-272 0-149.984-122.176-272-272.32-272';

function iconUndo(): SVGElement {
  return svgPathFill(ICON_UNDO_PATH);
}
function iconRedo(): SVGElement {
  return svgPathFill(ICON_UNDO_PATH, { flipX: true });
}
function iconEye(): SVGElement {
  return svgPathFill([
    'M506.84131 829.259446C229.561713 829.259446 10.31738 575.193955 1.289673 564.876574c-7.738035-9.027708-7.738035-23.214106 0-33.531486 9.027708-10.31738 228.27204-264.382872 505.551637-264.382871 277.279597 0 496.523929 254.065491 505.551637 264.382871 7.738035 9.027708 7.738035 23.214106 0 33.531486-10.31738 10.31738-228.27204 264.382872-505.551637 264.382872z m-451.385391-281.148615c52.876574 55.455919 237.299748 229.561713 451.385391 229.561713s397.219144-174.105793 451.38539-229.561713c-52.876574-55.455919-237.299748-229.561713-451.38539-229.561713S108.332494 492.654912 55.455919 548.110831z',
    'M497.813602 713.188917c-90.277078 0-163.788413-73.511335-163.788413-163.788413S407.536524 386.901763 497.813602 386.901763c90.277078 0 163.788413 73.511335 163.788413 163.788413s-73.511335 162.498741-163.788413 162.498741z m0-274.700252c-61.904282 0-112.201511 50.297229-112.201511 112.201511 0 61.904282 50.297229 112.201511 112.201511 112.201512s112.201511-50.297229 112.201511-112.201512c0-61.904282-50.297229-112.201511-112.201511-112.201511z',
  ]);
}
function iconDesign(): SVGElement {
  return svgPathFill(
    'M947.96 199.329l-92.764 92.549L731.54 168.443l92.768-92.548c17.025-17.03 44.746-17.03 61.825 0l61.828 61.715c17.084 17.028 17.084 44.695 0 61.719z m-649.486 401.09l123.657 123.434-164.804 41.092 41.147-164.526z m525.834-277.653l-371.02 370.257-123.654-123.436L700.597 199.33l123.711 123.436zM154.843 196.272v673.501h673.503V383.884l87.856-87.854v617.673c0 24.287-19.641 43.93-43.927 43.93H110.917c-24.282 0-43.928-19.642-43.928-43.93V152.345c0-24.281 19.646-43.927 43.928-43.927h620.185l-87.855 87.854H154.843z',
  );
}
function iconSource(): SVGElement {
  return svgPathFill(
    'M153.770667 517.558857l200.387047-197.241905L302.86019 268.190476 48.761905 518.290286l254.439619 243.614476 50.590476-52.833524-200.021333-191.512381zM658.285714 320.316952L709.583238 268.190476l254.098286 250.09981L709.241905 761.904762l-50.590476-52.833524 200.021333-191.512381L658.285714 320.316952z m-112.981333-86.186666L393.99619 785.554286l70.534096 19.358476 151.30819-551.399619-70.534095-19.358476z',
  );
}
/** 邮件设置齿轮（镂空路径用 evenodd） */
function iconSettings(): SVGElement {
  return svgPathFill(
    'M664.586139 993.077228c-18.756436 0-36.49901-7.60396-48.158416-20.277228-15.714851-17.235644-65.90099-62.352475-106.962376-62.352475-41.061386 0-91.754455 45.623762-106.455446 61.338614-11.659406 12.673267-29.40198 20.277228-47.651485 20.277227-8.617822 0-17.235644-1.520792-24.332673-5.069307l-1.520793-0.50693-125.211881-69.956436-1.013861-1.013861c-22.811881-15.714851-31.429703-47.144554-20.277228-72.491089 0 0 11.659406-26.360396 11.659406-50.69307 0-72.99802-59.310891-132.308911-132.308911-132.308911h-5.576237c-20.784158 0-38.019802-18.756436-43.59604-47.144554-0.506931-2.534653-10.645545-56.776238-10.645545-99.865347s10.138614-97.330693 10.645545-99.865346c5.576238-28.89505 22.811881-47.651485 44.10297-47.144555h4.562377c72.99802 0 132.308911-59.310891 132.30891-132.30891 0-23.825743-11.659406-50.693069-11.659405-50.69307-11.152475-25.346535-2.534653-56.269307 20.277227-72.491089l1.520792-1.013861 131.801981-72.491089 1.520792-1.520792c7.60396-3.041584 15.714851-4.562376 24.332673-4.562377 18.249505 0 35.992079 7.60396 48.158416 19.770297 15.714851 16.221782 64.887129 58.80396 104.934653 58.803961 39.540594 0 88.712871-41.568317 103.920792-57.790099 11.659406-12.166337 29.40198-19.263366 47.651485-19.263367 8.617822 0 17.235644 1.520792 24.839604 5.069307l1.520792 0.506931 127.239604 70.970297 1.013862 1.013861c22.811881 15.714851 31.429703 47.144554 20.277227 72.49109 0 0-11.659406 26.360396-11.659405 50.693069 0 72.99802 59.310891 132.308911 132.30891 132.308911h4.562377c21.291089-0.506931 38.526733 18.249505 44.10297 47.144554 0.506931 2.534653 10.645545 56.776238 10.645545 99.865347s-10.138614 97.330693-10.645545 99.865346c-5.576238 28.89505-22.811881 47.651485-44.10297 47.144555h-4.562377c-72.99802 0-132.308911 59.310891-132.30891 132.308911 0 23.825743 11.659406 50.693069 11.659405 50.693069 11.152475 25.346535 2.534653 56.269307-20.277227 72.491089l-1.520792 1.013861-129.774258 71.477228-1.520792 0.506931c-7.09703 3.548515-15.207921 5.069307-23.825742 5.069307z m-3.548515-60.831683c0.506931 0.506931 2.027723 1.013861 4.055445 1.013861l121.156436-66.914852c-3.041584-6.590099-16.221782-39.540594-16.221782-74.011881 0-102.906931 81.108911-187.057426 182.495049-192.126732 1.520792-8.110891 9.631683-53.227723 9.631683-87.69901 0-33.964356-8.110891-79.588119-9.631683-87.69901-101.386139-5.069307-182.49505-89.726733-182.495049-192.126733 0-34.471287 13.180198-67.421782 16.221782-74.011881l-119.128713-65.90099h-0.506931c-2.027723 0-4.055446 0.506931-4.562376 1.013861-2.027723 2.027723-19.263366 19.770297-44.10297 37.005941-36.49901 25.853465-71.477228 39.033663-102.906931 39.033663-31.936634 0-66.914851-13.180198-103.920792-39.540594-24.839604-17.742574-42.075248-35.485149-44.10297-37.512871-0.506931-0.506931-2.534653-1.013861-4.562376-1.013862h-0.506931L238.257426 158.669307c3.041584 7.09703 16.221782 39.540594 16.221782 74.011881 0 102.906931-81.108911 187.057426-182.49505 192.126733-1.520792 8.110891-9.631683 53.227723-9.631683 87.69901 0 33.964356 8.110891 79.588119 9.631683 87.69901 101.386139 5.069307 182.49505 89.726733 182.49505 192.126732 0 34.471287-13.687129 67.421782-16.221782 74.011881l116.594059 65.39406h0.506931c1.520792 0 3.548515-0.506931 4.055445-1.013862 2.027723-2.534653 19.770297-20.784158 44.609901-39.033663 37.512871-27.374257 72.99802-41.568317 105.948515-41.568317 32.950495 0 68.942574 14.194059 106.455446 42.075248 24.839604 18.756436 42.075248 37.512871 44.609901 40.047525z m-151.065347-243.833664c-97.330693 0-176.411881-79.081188-176.411881-176.411881 0-97.330693 79.081188-176.411881 176.411881-176.411881 97.330693 0 176.411881 79.081188 176.411881 176.411881 0 96.823762-79.588119 176.411881-176.411881 176.411881z m0-293.00594c-64.380198 0-116.594059 52.213861-116.594059 116.594059s52.213861 116.594059 116.594059 116.594059 116.594059-52.213861 116.59406-116.594059c-0.506931-64.380198-52.720792-116.594059-116.59406-116.594059z',
    { fillRule: 'evenodd' },
  );
}
function iconVariable(): SVGElement {
  return svgPathFill(
    'M212.48 768v-157.866667c0-35.349333-28.373333-55.466667-63.36-55.466666A42.645333 42.645333 0 0 1 106.666667 512c0-23.445333 18.986667-42.666667 42.453333-42.666667 34.986667 0 63.36-20.117333 63.36-55.466666V256c0-85.333333 55.637333-128 125.610667-128h6.442666a39.466667 39.466667 0 0 1 0 78.933333h-6.442666c-23.317333 0-42.24 25.493333-42.24 49.066667v174.933333a85.290667 85.290667 0 0 1-58.026667 81.066667 85.290667 85.290667 0 0 1 58.026667 81.066667V768c0 23.573333 18.922667 49.066667 42.24 49.066667h6.442666a39.466667 39.466667 0 0 1 0 78.933333h-6.442666c-69.973333 0-125.610667-42.666667-125.610667-128z m599.04-157.866667V768c0 85.333333-55.850667 128-125.845333 128h-6.208a39.466667 39.466667 0 0 1 0-78.933333h6.208c23.338667 0 42.24-25.493333 42.24-49.066667v-174.933333a85.290667 85.290667 0 0 1 58.026666-81.066667 85.290667 85.290667 0 0 1-58.026666-81.066667V256c0-23.573333-18.901333-49.066667-42.24-49.066667h-6.208a39.466667 39.466667 0 0 1 0-78.933333h6.208c69.973333 0 125.866667 42.666667 125.866666 128v157.866667c0 35.349333 28.352 55.466667 63.36 55.466666 23.424 0 42.432 19.221333 42.432 42.666667s-18.986667 42.666667-42.453333 42.666667c-34.986667 0-63.36 20.117333-63.36 55.466666z',
  );
}
function iconExport(): SVGElement {
  return svg(
    '<path d="M10 4.5v8.5M7.2 11.2 10 14l2.8-2.8M5.5 15.5h9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  );
}
function iconClearCanvas(): SVGElement {
  return svgPathFill(
    'M744.5 695L641.9 592.4l44.5-51.3L789 650.5l102.6-109.4 51.3 51.3L833.5 695l109.4 102.6-51.3 44.5L789 739.5 686.4 842.1l-44.5-44.5L744.5 695zM64 182h896v65H64v-65z m0 191.5h896v65H64v-65zM577 630H64v-61.6h513V630zM64 824.9v-65h513v65H64z',
  );
}
function iconResetContent(): SVGElement {
  return svgPathFill(
    'M864 512a352 352 0 0 0-600.96-248.96c-15.744 15.872-40.704 42.88-63.232 67.648H320a32 32 0 1 1 0 64H128a31.872 31.872 0 0 1-32-32v-192a32 32 0 1 1 64 0v108.672c20.544-22.528 42.688-46.4 57.856-61.504a416 416 0 1 1 0 588.288 32 32 0 1 1 45.248-45.248A352 352 0 0 0 864 512z',
  );
}
function iconCopyDoc(): SVGElement {
  return svg(
    '<rect x="6.5" y="6.5" width="9" height="11" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="4.5" y="3.5" width="9" height="11" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="var(--sm-surface, #fff)"/>',
  );
}
function iconImportDoc(): SVGElement {
  return svg(
    '<path d="M10 4.5v6.5M7.2 9.2 10 12l2.8-2.8M5.5 14.5h9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="14" width="12" height="2.5" rx=".6" fill="currentColor"/>',
  );
}
/** 显示边框：圆角矩形描边（开启时由 toggle 样式点亮 currentColor） */
function iconLayoutBorders(): SVGElement {
  return svgPathFill(
    'M64 832V192a128 128 0 0 1 128-128h640a128 128 0 0 1 128 128v640a128 128 0 0 1-128 128H192a128 128 0 0 1-128-128z m64 0q0 26.496 18.752 45.248T192 896h640q26.496 0 45.248-18.752T896 832V192q0-26.496-18.752-45.248T832 128H192q-26.496 0-45.248 18.752T128 192v640z',
  );
}
/** 进入全屏：四角向外 */
function iconFullscreenEnter(): SVGElement {
  return svg(
    '<path d="M6 4H4v2M14 4h2v2M6 16H4v-2M14 16h2v-2M4 6V4h2M16 6V4h-2M4 14v2h2M16 14v2h-2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  );
}
/** 退出全屏 / 缩小：四角向内 */
function iconFullscreenExit(): SVGElement {
  return svgPathFill(
    'M705.92 124.117333a38.826667 38.826667 0 1 0-77.568 0v232.704c0 21.461333 17.365333 38.826667 38.784 38.826667h232.746667a38.826667 38.826667 0 0 0 0-77.568h-193.962667V124.117333zM356.864 395.648a38.826667 38.826667 0 0 0 38.784-38.784V124.16a38.826667 38.826667 0 1 0-77.568 0v193.962667H124.117333a38.826667 38.826667 0 0 0 0 77.568h232.746667zM899.882667 705.92a38.826667 38.826667 0 0 0 0-77.568h-232.704a38.826667 38.826667 0 0 0-38.826667 38.784v232.746667a38.826667 38.826667 0 0 0 77.610667 0v-193.962667h193.92zM356.864 628.352a38.826667 38.826667 0 0 1 38.826667 38.826667v232.704a38.826667 38.826667 0 0 1-77.610667 0v-193.92H124.16a38.826667 38.826667 0 1 1 0-77.610667h232.746667z',
  );
}
function iconSun(): SVGElement {
  return svgTheme(
    '<circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 3.5V5M10 15v1.5M16.5 10H15M5 10H3.5M14.1 5.9 13 7M7 13 5.9 14.1M14.1 14.1 13 13M7 7 5.9 5.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  );
}
function iconMoon(): SVGElement {
  return svgPathFill(
    'M524.490551 1023.43355c-140.102939 0-271.81403-54.547017-370.878782-153.611769S0 639.045939 0 498.943c0-115.183242 36.995772-223.867918 106.944903-314.336142a523.825343 523.825343 0 0 1 119.276826-112.266563A533.035909 533.035909 0 0 1 376.55863 1.11192a25.584905 25.584905 0 0 1 30.036679 36.228225c-33.004527 64.320451-48.35547 125.621883-48.355471 193.012523 0 239.832899 195.110485 434.943383 434.943384 434.943383 67.39064 0 128.692072-15.350943 193.012523-48.35547a25.584905 25.584905 0 0 1 36.228225 30.036678 534.468663 534.468663 0 0 1-71.228375 150.336902 523.825343 523.825343 0 0 1-112.266563 119.276826 509.395457 509.395457 0 0 1-314.336142 106.944903zM336.18565 69.884144C163.538712 143.82452 51.16981 309.819383 51.16981 498.943 51.16981 759.90903 263.524521 972.26374 524.490551 972.26374c189.123617 0 355.11848-112.420072 429.058855-285.01584A451.98293 451.98293 0 0 1 793.132052 716.414691c-129.868977 0-251.908974-50.555772-343.707612-142.354411S307.018859 360.170475 307.018859 230.301498c0-55.109885 9.619924-108.019469 29.166791-160.417354z',
    { scale: 0.86 },
  );
}
/** 显示器：表示跟随系统外观 */
function iconThemeAuto(): SVGElement {
  return svgTheme(
    '<path d="M5 5.5h10c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5v-6c0-.8.7-1.5 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 16h4M10 14.2V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  );
}
/** 1024 系 fill 图标，颜色随 currentColor；flipX 用于 redo 镜像；scale 用于夜间图标略缩小 */
function svgPathFill(
  d: string | string[],
  opts?: { viewBox?: string; flipX?: boolean; scale?: number; fillRule?: 'evenodd' | 'nonzero' },
): SVGElement {
  const viewBox = opts?.viewBox ?? '0 0 1024 1024';
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '18');
  el.setAttribute('height', '18');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const transforms: string[] = [];
  if (opts?.scale && opts.scale !== 1) {
    const s = opts.scale;
    transforms.push(`translate(512,512) scale(${s}) translate(-512,-512)`);
  }
  if (opts?.flipX) transforms.push('translate(1024,0) scale(-1,1)');
  if (transforms.length) host.setAttribute('transform', transforms.join(' '));
  const paths = Array.isArray(d) ? d : [d];
  for (const pd of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pd);
    path.setAttribute('fill', 'currentColor');
    if (opts?.fillRule) path.setAttribute('fill-rule', opts.fillRule);
    host.append(path);
  }
  el.append(host);
  return el;
}

function svg(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '18');
  el.setAttribute('height', '18');
  el.setAttribute('viewBox', '0 0 20 20');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
}
function svgTheme(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '18');
  el.setAttribute('height', '18');
  el.setAttribute('viewBox', '0 0 20 20');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
}
