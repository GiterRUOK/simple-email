import { normalizeAccentHex } from '../utils/accentColor';
import { h } from '../utils/dom';

/** 邮件常用预设色 */
export const COLOR_PICKER_PALETTE = [
  '#FFFFFF',
  '#F5F6F8',
  '#E6E8EC',
  '#9AA0A6',
  '#6B7280',
  '#433F3F',
  '#1F2328',
  '#000000',
  '#DC2626',
  '#EA580C',
  '#FF5A00',
  '#CA8A04',
  '#16A34A',
  '#059669',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#FEE2E2',
  '#FFEDD5',
  '#FEF3C7',
  '#D1FAE5',
  '#EEF2FF',
  '#F3E8FF',
] as const;

export interface ColorPickerPopoverOptions {
  anchor: HTMLElement;
  layerRoot: HTMLElement;
  value: string;
  placeholder?: string;
  /** 显示「清除」并允许提交空值 */
  allowClear?: boolean;
  /** 每次改色立即 onCommit（富文本/顶栏） */
  liveCommit?: boolean;
  onPreview?: (hex: string) => void;
  onCommit: (hex: string) => void;
  onClear?: () => void;
  /** 打开前调用（富文本：在失焦前保存选区） */
  onBeforeOpen?: () => void;
  /** 为 false 时不自动 focus 十六进制输入，避免抢编辑区选区 */
  autoFocusHex?: boolean;
  onClosed?: () => void;
}

let activeTeardown: (() => void) | null = null;

export function isColorPickerOpen(): boolean {
  return activeTeardown !== null;
}

export function closeActiveColorPicker(): void {
  activeTeardown?.();
  activeTeardown = null;
}

function positionLayer(layer: HTMLElement, anchor: HTMLElement, layerRoot: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const rootRect = layerRoot.getBoundingClientRect();
  layer.style.top = `${rect.bottom - rootRect.top + 4}px`;
  layer.style.left = `${Math.max(4, rect.left - rootRect.left)}px`;

  requestAnimationFrame(() => {
    const popRect = layer.getBoundingClientRect();
    if (popRect.right > rootRect.right - 8) {
      layer.style.left = `${Math.max(4, parseFloat(layer.style.left) - (popRect.right - rootRect.right + 8))}px`;
    }
    if (popRect.bottom > window.innerHeight - 8) {
      layer.style.top = `${rect.top - rootRect.top - popRect.height - 4}px`;
    }
  });
}

/** 点击色块网格缝隙等无焦点区域时，避免编辑区 blur 导致误提交 */
function guardInlineEditFocus(layer: HTMLElement) {
  layer.addEventListener(
    'mousedown',
    (e) => {
      const t = e.target as Element;
      if (t.closest('input, button, select, textarea, a, [contenteditable]')) return;
      e.preventDefault();
    },
    true,
  );
}

function syncNativeInput(native: HTMLInputElement, hex: string) {
  const n = normalizeAccentHex(hex);
  if (n) native.value = n;
}

/** 打开自定义色板（含关闭按钮）；点击色卡触发，不再使用系统色板。 */
export function openColorPickerPopover(opts: ColorPickerPopoverOptions): void {
  closeActiveColorPicker();
  opts.onBeforeOpen?.();

  const initialHex = normalizeAccentHex(opts.value);
  let draft = initialHex ?? '#4F46E5';
  let closed = false;

  const layer = h('div', {
    class: 'sm-color-picker-layer',
    'data-sm-color-picker-layer': '',
  });
  const panel = h('div', {
    class: 'sm-color-picker',
    role: 'dialog',
    'aria-label': '选择颜色',
  });

  const closeBtn = h(
    'button',
    {
      class: 'sm-color-picker__close',
      type: 'button',
      title: '关闭',
      'aria-label': '关闭',
    },
    ['×'],
  );

  const head = h('div', { class: 'sm-color-picker__head' }, [
    h('span', { class: 'sm-color-picker__title' }, ['选择颜色']),
    closeBtn,
  ]);

  const native = h('input', {
    class: 'sm-color-picker__native',
    type: 'color',
    'aria-label': '自定义颜色',
  }) as HTMLInputElement;

  const hexInput = h('input', {
    class: 'sm-input sm-color-picker__hex',
    type: 'text',
    placeholder: opts.placeholder ?? '#RRGGBB',
  }) as HTMLInputElement;

  const applyDraft = (hex: string, commit: boolean) => {
    const n = normalizeAccentHex(hex);
    if (!n) return;
    draft = n;
    syncNativeInput(native, n);
    hexInput.value = n;
    opts.onPreview?.(n);
    if (commit || opts.liveCommit) opts.onCommit(n);
  };

  syncNativeInput(native, draft);
  hexInput.value = initialHex ?? '';

  const teardown = (commit: boolean) => {
    if (closed) return;
    closed = true;
    activeTeardown = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDoc, true);
    layer.remove();
    if (commit && !opts.liveCommit) {
      const n = normalizeAccentHex(draft);
      if (n) opts.onCommit(n);
    }
    opts.onClosed?.();
  };

  const swatchGrid = h('div', { class: 'sm-color-picker__swatches' });
  for (const hex of COLOR_PICKER_PALETTE) {
    const btn = h('button', {
      class: 'sm-color-picker__swatch',
      type: 'button',
      title: `${hex}（双击确认）`,
      style: `background:${hex}`,
      'aria-label': hex,
    });
    btn.addEventListener('click', () => applyDraft(hex, false));
    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      applyDraft(hex, true);
      teardown(true);
    });
    swatchGrid.append(btn);
  }

  native.addEventListener('input', () => applyDraft(native.value, false));

  hexInput.addEventListener('input', () => {
    const n = normalizeAccentHex(hexInput.value);
    if (n) applyDraft(n, false);
  });
  hexInput.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter') {
      ke.preventDefault();
      const n = normalizeAccentHex(hexInput.value);
      if (n) {
        applyDraft(n, true);
        teardown(true);
      }
    }
  });

  const footKids: HTMLElement[] = [];
  if (opts.allowClear) {
    footKids.push(
      h(
        'button',
        {
          class: 'sm-btn sm-btn--ghost sm-color-picker__clear',
          type: 'button',
          onclick: () => {
            opts.onClear?.();
            teardown(false);
          },
        },
        ['清除'],
      ),
    );
  }

  panel.append(head, swatchGrid, native, hexInput);
  if (footKids.length) panel.append(h('div', { class: 'sm-color-picker__foot' }, footKids));

  layer.append(panel);
  guardInlineEditFocus(layer);
  opts.layerRoot.append(layer);
  positionLayer(layer, opts.anchor, opts.layerRoot);

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    teardown(true);
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (initialHex) opts.onPreview?.(initialHex);
      teardown(false);
    }
  };

  const onDoc = (ev: MouseEvent) => {
    const t = ev.target as Node;
    if (layer.contains(t) || opts.anchor.contains(t)) return;
    teardown(true);
  };

  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('mousedown', onDoc, true), 0);

  activeTeardown = () => teardown(true);
  if (opts.autoFocusHex !== false) hexInput.focus();
}

export interface BindColorPickerInputOptions
  extends Omit<ColorPickerPopoverOptions, 'anchor' | 'layerRoot' | 'value'> {
  layerRoot?: HTMLElement;
  getValue?: () => string;
}

/** 拦截色卡点击，改为打开自定义色板。 */
export function bindColorPickerInput(
  pick: HTMLInputElement,
  opts: BindColorPickerInputOptions,
): void {
  if (!pick.title) pick.title = '点击打开色板；预设色块可双击快速确认';

  pick.addEventListener('mousedown', (e) => {
    e.preventDefault();
    opts.onBeforeOpen?.();
  });

  pick.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const layerRoot =
      opts.layerRoot ?? (pick.closest('.sm-root') as HTMLElement | null) ?? document.body;
    const value = opts.getValue?.() ?? pick.value;
    openColorPickerPopover({
      ...opts,
      anchor: pick,
      layerRoot,
      value,
    });
  });
}
