import type { Variable } from '../types';
import { variablePlaceholder } from '../variables';
import { h } from '../utils/dom';

export interface VariablePickerHandlers {
  onPickKey: (v: Variable) => void;
  onPickElement: (v: Variable) => void;
  onCopy: (token: string) => void;
  onClose: () => void;
}

/** 右栏变量列表头部（标题 + 关闭） */
export function buildVariablePickerHead(onClose: () => void): HTMLElement {
  return h('div', { class: 'sm-var-picker__head' }, [
    h('div', { class: 'sm-panel__title sm-var-picker__title' }, ['插入变量']),
    h(
      'button',
      {
        class: 'sm-btn sm-btn--ghost sm-var-picker__close',
        type: 'button',
        title: '关闭',
        'aria-label': '关闭变量列表',
        onclick: () => onClose(),
      },
      ['关闭'],
    ),
  ]);
}

/** 右栏可滚动变量列表（交互与旧 popover 一致） */
export function buildVariablePickerBody(
  vars: Variable[],
  handlers: VariablePickerHandlers,
): HTMLElement {
  const wrap = h('div', { class: 'sm-var-picker' });
  if (!vars.length) {
    wrap.append(
      h('div', { class: 'sm-empty-form' }, ['暂无可用变量，请由宿主通过 setVariables 注入。']),
    );
    return wrap;
  }
  for (const v of vars) {
    const token = variablePlaceholder(v.key);
    const row = h('div', { class: 'sm-popover__row' });
    const actions = h('div', { class: 'sm-popover__actions' });
    if (v.kind === 'link' || v.kind === 'image') {
      actions.append(
        h(
          'button',
          {
            class: 'sm-popover__action',
            type: 'button',
            onclick: (e: Event) => {
              e.stopPropagation();
              handlers.onPickElement(v);
            },
          },
          ['插入元素'],
        ),
      );
    }
    actions.append(
      h(
        'button',
        {
          class: 'sm-popover__action sm-popover__action--copy',
          type: 'button',
          title: `复制 ${token}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            handlers.onCopy(token);
          },
        },
        ['复制'],
      ),
    );
    row.append(
      h(
        'button',
        {
          class: 'sm-popover__item',
          type: 'button',
          onclick: () => handlers.onPickKey(v),
        },
        [
          h('span', { class: 'sm-popover__label' }, [v.label]),
          h('span', { class: 'sm-popover__key' }, [token]),
        ],
      ),
      actions,
    );
    wrap.append(row);
  }
  return wrap;
}
