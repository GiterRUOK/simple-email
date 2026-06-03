/** contenteditable 内 ul/ol 的 Enter / Backspace / 退出列表等 DOM 操作 */

export function findListItem(node: Node | null, root: HTMLElement): HTMLLIElement | null {
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'LI') {
      return node as HTMLLIElement;
    }
    node = node.parentNode;
  }
  return null;
}

export function findListRoot(
  li: HTMLLIElement,
): HTMLUListElement | HTMLOListElement | null {
  const parent = li.parentElement;
  if (!parent) return null;
  if (parent.tagName === 'UL' || parent.tagName === 'OL') {
    return parent as HTMLUListElement | HTMLOListElement;
  }
  return null;
}

type ListElement = HTMLUListElement | HTMLOListElement;

/** 两个列表之间可忽略的分隔块（空段落、仅含 br 的 div 等） */
export function isIgnorableListSeparator(el: Element): boolean {
  if (el.tagName !== 'P' && el.tagName !== 'DIV') return false;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('br').forEach((br) => br.remove());
  return (clone.textContent ?? '').replace(/\u200b/g, '').trim() === '';
}

function findPreviousListOfSameType(list: ListElement): ListElement | null {
  let node: Element | null = list.previousElementSibling;
  while (node) {
    if (node.tagName === list.tagName) return node as ListElement;
    if (!isIgnorableListSeparator(node)) return null;
    node = node.previousElementSibling;
  }
  return null;
}

function findNextListOfSameType(list: ListElement): ListElement | null {
  let node: Element | null = list.nextElementSibling;
  while (node) {
    if (node.tagName === list.tagName) return node as ListElement;
    if (!isIgnorableListSeparator(node)) return null;
    node = node.nextElementSibling;
  }
  return null;
}

/** 将 source 的全部 li 并入 target，并移除中间分隔块与空的 source */
function mergeListInto(target: ListElement, source: ListElement): void {
  let node: Element | null = target.nextElementSibling;
  while (node && node !== source) {
    const next = node.nextElementSibling;
    if (isIgnorableListSeparator(node)) node.remove();
    else break;
    node = next;
  }
  while (source.firstChild) target.appendChild(source.firstChild);
  source.remove();
}

/** 删除中间内容后，合并仅由空行分隔的同类型相邻列表 */
export function mergeAdjacentSameTypeLists(root: HTMLElement): boolean {
  let merged = false;
  for (const list of Array.from(root.querySelectorAll('ol, ul'))) {
    if (!root.contains(list)) continue;
    const prev = findPreviousListOfSameType(list as ListElement);
    if (prev && root.contains(prev)) {
      mergeListInto(prev, list as ListElement);
      merged = true;
    }
  }
  return merged;
}

export function isLiEffectivelyEmpty(li: HTMLLIElement): boolean {
  const clone = li.cloneNode(true) as HTMLLIElement;
  clone.querySelectorAll('br').forEach((br) => br.remove());
  return (clone.textContent ?? '').replace(/\u200b/g, '').trim() === '';
}

export function isCaretAtLiStart(li: HTMLLIElement, range: Range): boolean {
  const probe = document.createRange();
  probe.selectNodeContents(li);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().replace(/\u200b/g, '').length === 0;
}

export function isCaretAtLiEnd(li: HTMLLIElement, range: Range): boolean {
  const probe = document.createRange();
  probe.selectNodeContents(li);
  probe.setStart(range.endContainer, range.endOffset);
  return probe.toString().replace(/\u200b/g, '').length === 0;
}

export function placeCaretInElement(el: HTMLElement, atStart: boolean): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(atStart);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

export function placeCaretAtEndOfElement(el: HTMLElement): void {
  placeCaretInElement(el, false);
}

function visibleTextLength(text: string): number {
  return text.replace(/\u200b/g, '').length;
}

/** 容器内光标前的可见文本长度（忽略零宽空格） */
export function getCaretTextOffset(container: HTMLElement, range: Range): number {
  const probe = document.createRange();
  probe.selectNodeContents(container);
  probe.setEnd(range.startContainer, range.startOffset);
  return visibleTextLength(probe.toString());
}

/** 元素内可见文本偏移处放置光标；偏移超出则落在末尾 */
export function setCaretByTextOffset(container: HTMLElement, offset: number): void {
  const target = Math.max(0, offset);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let textNode: Text | null = null;

  while ((textNode = walker.nextNode() as Text | null)) {
    const data = textNode.data ?? '';
    const len = visibleTextLength(data);
    if (remaining <= len) {
      let count = 0;
      let nodeOffset = data.length;
      for (let i = 0; i < data.length; i++) {
        if (data[i] === '\u200b') continue;
        if (count === remaining) {
          nodeOffset = i;
          break;
        }
        count++;
      }
      const range = document.createRange();
      range.setStart(textNode, nodeOffset);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    remaining -= len;
  }

  placeCaretAtEndOfElement(container);
}

export function getElementVisibleTextLength(el: HTMLElement): number {
  return visibleTextLength(el.textContent ?? '');
}

const CARET_MARKER_ATTR = 'data-sm-caret';

/** 在折叠光标处插入临时标记（空行/空列表项时比文本偏移更准） */
export function insertCaretMarker(range: Range): HTMLSpanElement | null {
  if (!range.collapsed) return null;
  const marker = document.createElement('span');
  marker.setAttribute(CARET_MARKER_ATTR, '1');
  marker.appendChild(document.createTextNode('\u200b'));
  try {
    range.insertNode(marker);
    return marker;
  } catch {
    marker.remove();
    return null;
  }
}

/** 将光标恢复到标记处并移除标记 */
export function restoreCaretMarker(root: HTMLElement): boolean {
  const marker = root.querySelector(`span[${CARET_MARKER_ATTR}="1"]`);
  if (!(marker instanceof HTMLSpanElement) || !root.contains(marker)) return false;

  const range = document.createRange();
  range.setStartBefore(marker);
  range.collapse(true);
  marker.remove();

  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/** 列表操作后恢复光标：优先标记点，否则文本偏移 */
export function restoreCaretAfterListMutation(
  root: HTMLElement,
  marker: HTMLSpanElement | null,
  fallbackOffset: number,
): void {
  if (restoreCaretMarker(root)) return;
  setCaretByTextOffset(root, fallbackOffset);
}

function ensureLiHasPlaceholder(li: HTMLLIElement): void {
  if (isLiEffectivelyEmpty(li)) {
    li.textContent = '';
    li.appendChild(document.createElement('br'));
  }
}

/** 空列表项 + Enter：退出列表（必要时拆成两段列表） */
export function exitListFromEmptyItem(li: HTMLLIElement): void {
  const list = findListRoot(li);
  if (!list) return;

  const items = Array.from(list.children).filter(
    (c): c is HTMLLIElement => c.tagName === 'LI',
  );
  const index = items.indexOf(li);
  if (index === -1) return;

  const afterItems = items.slice(index + 1);
  li.remove();

  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));

  if (list.children.length === 0) {
    list.replaceWith(p);
  } else if (afterItems.length === 0) {
    list.after(p);
  } else if (index === 0) {
    list.before(p);
  } else {
    const newList = document.createElement(list.tagName.toLowerCase()) as
      | HTMLUListElement
      | HTMLOListElement;
    afterItems.forEach((item) => newList.appendChild(item));
    list.after(p);
    p.after(newList);
  }

  placeCaretInElement(p, true);
}

/** Enter：新列表项或拆分当前项 */
export function splitListItemOnEnter(li: HTMLLIElement, range: Range): void {
  const list = findListRoot(li);
  if (!list) return;

  if (isLiEffectivelyEmpty(li)) {
    exitListFromEmptyItem(li);
    return;
  }

  if (isCaretAtLiStart(li, range)) {
    const newLi = document.createElement('li');
    newLi.appendChild(document.createElement('br'));
    list.insertBefore(newLi, li);
    placeCaretInElement(newLi, true);
    return;
  }

  if (isCaretAtLiEnd(li, range)) {
    const newLi = document.createElement('li');
    newLi.appendChild(document.createElement('br'));
    if (li.nextSibling) list.insertBefore(newLi, li.nextSibling);
    else list.appendChild(newLi);
    placeCaretInElement(newLi, true);
    return;
  }

  const tailRange = document.createRange();
  tailRange.setStart(range.startContainer, range.startOffset);
  if (li.lastChild) tailRange.setEndAfter(li.lastChild);
  else tailRange.setEnd(li, 0);

  const newLi = document.createElement('li');
  const fragment = tailRange.extractContents();
  if ((fragment.textContent ?? '').replace(/\u200b/g, '').trim()) {
    newLi.appendChild(fragment);
  } else {
    newLi.appendChild(document.createElement('br'));
  }

  ensureLiHasPlaceholder(li);

  if (li.nextSibling) list.insertBefore(newLi, li.nextSibling);
  else list.appendChild(newLi);

  placeCaretInElement(newLi, true);
}

/** Backspace 在列表项行首：合并上一项、跨列表合并或退出列表 */
export function mergeListItemOnBackspace(li: HTMLLIElement, range: Range): boolean {
  if (!range.collapsed || !isCaretAtLiStart(li, range)) return false;

  const list = findListRoot(li);
  if (!list) return false;

  if (isLiEffectivelyEmpty(li)) {
    const prevInList = li.previousElementSibling;
    if (!prevInList || prevInList.tagName !== 'LI') {
      const prevList = findPreviousListOfSameType(list);
      if (prevList) {
        li.remove();
        mergeListInto(prevList, list);
        const lastLi = prevList.lastElementChild;
        if (lastLi instanceof HTMLLIElement) placeCaretAtEndOfElement(lastLi);
        return true;
      }
    }
    exitListFromEmptyItem(li);
    return true;
  }

  const prevInList = li.previousElementSibling;
  if (prevInList && prevInList.tagName === 'LI') {
    const prevLi = prevInList as HTMLLIElement;
    const junctionOffset = getElementVisibleTextLength(prevLi);
    while (li.firstChild) prevLi.appendChild(li.firstChild);
    li.remove();
    setCaretByTextOffset(prevLi, junctionOffset);
    return true;
  }

  const prevList = findPreviousListOfSameType(list);
  if (prevList) {
    const prevLi = prevList.lastElementChild;
    if (prevLi && prevLi.tagName === 'LI') {
      const prevLiEl = prevLi as HTMLLIElement;
      const junctionOffset = getElementVisibleTextLength(prevLiEl);
      while (li.firstChild) prevLiEl.appendChild(li.firstChild);
      li.remove();
      if (list.children.length === 0) mergeListInto(prevList, list);
      setCaretByTextOffset(prevLiEl, junctionOffset);
      return true;
    }
  }

  const p = document.createElement('p');
  while (li.firstChild) p.appendChild(li.firstChild);
  if (!p.hasChildNodes()) p.appendChild(document.createElement('br'));
  li.remove();

  if (list.children.length === 0) {
    list.replaceWith(p);
  } else {
    list.before(p);
  }
  placeCaretAtEndOfElement(p);
  return true;
}

/** Delete 在列表项行末：整项合并下一项，或跨列表合并（含 Shift+Enter 软换行） */
export function mergeNextListItemOnDelete(li: HTMLLIElement, range: Range): boolean {
  if (!range.collapsed || !isCaretAtLiEnd(li, range)) return false;

  const list = findListRoot(li);
  if (!list) return false;

  const nextInList = li.nextElementSibling;
  if (nextInList && nextInList.tagName === 'LI') {
    const nextLi = nextInList as HTMLLIElement;
    const junctionOffset = getElementVisibleTextLength(li);

    if (isLiEffectivelyEmpty(nextLi)) {
      nextLi.remove();
      setCaretByTextOffset(li, junctionOffset);
      return true;
    }

    while (nextLi.firstChild) li.appendChild(nextLi.firstChild);
    nextLi.remove();
    setCaretByTextOffset(li, junctionOffset);
    return true;
  }

  const nextList = findNextListOfSameType(list);
  if (!nextList) return false;

  const nextLi = nextList.firstElementChild;
  if (!nextLi || nextLi.tagName !== 'LI') return false;

  const nextLiEl = nextLi as HTMLLIElement;
  const junctionOffset = getElementVisibleTextLength(li);

  if (isLiEffectivelyEmpty(nextLiEl)) {
    nextLiEl.remove();
    if (nextList.children.length === 0) mergeListInto(list, nextList);
    setCaretByTextOffset(li, junctionOffset);
    return true;
  }

  while (nextLiEl.firstChild) li.appendChild(nextLiEl.firstChild);
  nextLiEl.remove();
  if (nextList.children.length === 0) mergeListInto(list, nextList);
  setCaretByTextOffset(li, junctionOffset);
  return true;
}

/** 取消列表：每个 li 拆成段落 */
export function unwrapList(list: HTMLUListElement | HTMLOListElement): void {
  const parent = list.parentNode;
  if (!parent) return;
  const fragment = document.createDocumentFragment();
  for (const child of Array.from(list.children)) {
    if (child.tagName !== 'LI') continue;
    const p = document.createElement('p');
    while (child.firstChild) p.appendChild(child.firstChild);
    if (!p.hasChildNodes()) p.appendChild(document.createElement('br'));
    fragment.appendChild(p);
  }
  parent.insertBefore(fragment, list);
  list.remove();
}

/** 有序 ↔ 无序 */
export function convertListTag(
  list: HTMLUListElement | HTMLOListElement,
  tag: 'ul' | 'ol',
): HTMLUListElement | HTMLOListElement {
  if (list.tagName.toLowerCase() === tag) return list;
  const next = document.createElement(tag) as HTMLUListElement | HTMLOListElement;
  while (list.firstChild) next.appendChild(list.firstChild);
  list.replaceWith(next);
  return next;
}

export function detectListFormats(node: Node | null, root: HTMLElement): {
  unorderedList: boolean;
  orderedList: boolean;
} {
  const li = findListItem(node, root);
  const list = li ? findListRoot(li) : null;
  return {
    unorderedList: list?.tagName === 'UL',
    orderedList: list?.tagName === 'OL',
  };
}
