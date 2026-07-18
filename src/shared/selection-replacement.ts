export type SelectionContext =
  | {
      kind: 'text-control';
      text: string;
      element: HTMLInputElement | HTMLTextAreaElement;
      start: number;
      end: number;
    }
  | {
      kind: 'range';
      text: string;
      range: Range;
      editableHost: HTMLElement | null;
    };

function isTextControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!target || typeof target !== 'object') return false;
  const tagName = 'tagName' in target ? String(target.tagName).toUpperCase() : '';
  if (tagName === 'TEXTAREA') return true;
  if (tagName !== 'INPUT') return false;
  const type = 'type' in target ? String(target.type).toLowerCase() : 'text';
  return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(type);
}

function findEditableHost(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]') || null;
}

export function captureSelectionContext(target: EventTarget | null): SelectionContext | null {
  if (isTextControl(target)) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start === null || end === null || start === end) return null;
    const text = target.value.slice(start, end).trim();
    if (!text) return null;
    return { kind: 'text-control', text, element: target, start, end };
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const range = selection.getRangeAt(0);
  return {
    kind: 'range',
    text,
    range: range.cloneRange(),
    editableHost: findEditableHost(range.commonAncestorContainer),
  };
}

export function getSelectionRect(context: SelectionContext): DOMRect {
  if (context.kind === 'text-control') {
    return context.element.getBoundingClientRect();
  }
  return context.range.getBoundingClientRect();
}

function dispatchInput(element: HTMLElement, replacement: string): void {
  const event = typeof InputEvent === 'function'
    ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replacement })
    : new Event('input', { bubbles: true });
  element.dispatchEvent(event);
}

export function replaceSelectionContext(context: SelectionContext, replacement: string): boolean {
  if (context.kind === 'text-control') {
    const { element, start, end } = context;
    const nextValue = element.value.slice(0, start) + replacement + element.value.slice(end);
    element.value = nextValue;
    const cursor = start + replacement.length;
    element.focus();
    element.setSelectionRange(cursor, cursor);
    dispatchInput(element, replacement);
    return true;
  }

  context.range.deleteContents();
  context.range.insertNode(document.createTextNode(replacement));
  window.getSelection()?.removeAllRanges();
  if (context.editableHost) dispatchInput(context.editableHost, replacement);
  return true;
}
