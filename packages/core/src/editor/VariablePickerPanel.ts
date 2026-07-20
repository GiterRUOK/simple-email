import type { Variable } from '../types';
import { variablePlaceholder } from '../variables';
import { h } from '../utils/dom';
import type { SimpleMailT } from '../i18n';

export interface VariablePickerHandlers {
  onPickKey: (v: Variable) => void;
  onPickElement: (v: Variable) => void;
  onCopy: (token: string) => void;
  onClose: () => void;
}

export interface VariablePickerHeadOptions {
  pinned: boolean;
  t: SimpleMailT;
  onClose: () => void;
  /** 切换固定状态，返回切换后的 pinned */
  onTogglePin: () => boolean;
}

/** 右栏变量列表头部（标题 + 固定 + 关闭） */
export function buildVariablePickerHead(options: VariablePickerHeadOptions): HTMLElement {
  let pinned = options.pinned;
  const t = options.t;
  const syncPinBtn = (btn: HTMLButtonElement) => {
    btn.classList.toggle('is-pinned', pinned);
    btn.setAttribute('aria-pressed', String(pinned));
    btn.title = pinned ? t('variablePicker.unpinTitle') : t('variablePicker.pinTitle');
  };
  const pinBtn = h(
    'button',
    {
      class: 'sm-var-picker__pin',
      type: 'button',
      'aria-label': t('variablePicker.pin'),
      onclick: () => {
        pinned = options.onTogglePin();
        syncPinBtn(pinBtn);
      },
    },
    [iconPin()],
  ) as HTMLButtonElement;
  syncPinBtn(pinBtn);

  const closeBtn = h(
    'button',
    {
      class: 'sm-modal__close sm-var-picker__close',
      type: 'button',
      title: t('common.close'),
      'aria-label': t('variablePicker.closeTitle'),
      onclick: () => options.onClose(),
    },
    [iconClose()],
  );

  return h('div', { class: 'sm-var-picker__head' }, [
    h('div', { class: 'sm-panel__title sm-var-picker__title' }, [t('variablePicker.title')]),
    h('div', { class: 'sm-var-picker__actions' }, [pinBtn, closeBtn]),
  ]);
}

function iconClose(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '16');
  el.setAttribute('height', '16');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML =
    '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  return el;
}

function iconPin(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '16');
  el.setAttribute('height', '16');
  el.setAttribute('viewBox', '0 0 1024 1024');
  el.innerHTML =
    '<path d="M393.846154 64.174932l117.454119 0.399843H512.499805l117.454119-0.399843-10.395939 10.395939c-18.89262 18.89262-28.488872 44.982429-26.28973 71.472081l20.292073 250.502148c2.998829 36.68567 18.092932 72.171808 42.483405 99.661069l34.186646 38.684889-122.252245-0.899648-55.478329-0.399844h-0.99961l-55.478329 0.399844-122.452167 0.799687 34.186646-38.684888c24.390472-27.589223 39.484576-62.9754 42.483405-99.66107l20.292074-250.402187c2.199141-26.589613-7.397111-52.679422-26.289731-71.472081l-10.395939-10.395939m281.889887-64.174932h-0.199922L512.399844 0.599766h-0.799688L348.36392 0h-0.199922c-20.891839 0-39.684498 13.494729-45.582194 33.58688-4.098399 13.994533-1.899258 30.887934 17.79305 47.581414l38.584927 38.584927c5.597813 5.597813 8.39672 13.294807 7.796955 21.091761L346.464662 391.247169c-1.899258 23.190941-11.195627 45.08239-26.589613 62.475596l-61.87583 69.872706c-8.696603 9.796173-13.894572 22.291292-14.394377 35.386177-0.299883 8.996486 1.599375 18.89262 8.596642 27.28934 6.897306 8.296759 17.293245 12.894963 27.989067 12.894963h0.299882l175.931277-1.199532 55.178446 422.834831 0.399844 3.098789 0.399844-3.098789 55.178446-422.834831 175.931277 1.199532h0.299882c10.795783 0 21.191722-4.598204 27.989067-12.894963 6.897306-8.39672 8.796564-18.292854 8.596642-27.28934-0.399844-13.094885-5.697774-25.590004-14.394377-35.386177l-61.87583-69.872706c-15.393987-17.393206-24.690355-39.284654-26.589613-62.475596l-20.292074-250.402187c-0.599766-7.796954 2.199141-15.593909 7.796955-21.091761l38.584927-38.584927c19.692308-16.693479 21.891449-33.58688 17.79305-47.581414-5.997657-19.992191-24.790316-33.58688-45.682155-33.58688z" fill="currentColor"/>';
  return el;
}

/** 右栏可滚动变量列表（交互与旧 popover 一致） */
export function buildVariablePickerBody(
  vars: Variable[],
  handlers: VariablePickerHandlers,
  t: SimpleMailT,
): HTMLElement {
  const wrap = h('div', { class: 'sm-var-picker' });
  if (!vars.length) {
    wrap.append(
      h('div', { class: 'sm-empty-form' }, [t('variablePicker.empty')]),
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
          [t('variablePicker.insertElement')],
        ),
      );
    }
    actions.append(
      h(
        'button',
        {
          class: 'sm-popover__action sm-popover__action--copy',
          type: 'button',
          title: t('variablePicker.copyTitle', { token }),
          onclick: (e: Event) => {
            e.stopPropagation();
            handlers.onCopy(token);
          },
        },
        [t('common.copy')],
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
