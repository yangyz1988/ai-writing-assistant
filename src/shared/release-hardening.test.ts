// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildConnectionTestRequest } from './connection-test';
import { registerListenerOnce } from './listener-registry';
import { PROVIDER_DEFAULTS, isLegacyModel } from './provider-config';
import {
  captureSelectionContext,
  getSelectionRect,
  replaceSelectionContext,
  SelectionContext,
} from './selection-replacement';
import { mapWithConcurrency } from './async-pool';

describe('release hardening', () => {
  it('tests the provider configuration currently entered in the popup', () => {
    expect(buildConnectionTestRequest(
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      'test-api-key',
    )).toEqual({
      type: 'TEST_CONNECTION',
      payload: {
        apiConfig: { provider: 'deepseek', model: 'deepseek-v4-flash' },
        apiKey: 'test-api-key',
      },
    });
  });

  it('registers a Chrome event listener only once for the same event', () => {
    const addListener = vi.fn();
    const event = { addListener };
    const listener = vi.fn();

    registerListenerOnce(event, listener);
    registerListenerOnce(event, listener);

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith(listener);
  });

  it('uses supported provider defaults instead of retired model ids', () => {
    expect(PROVIDER_DEFAULTS.deepseek.model).toBe('deepseek-v4-flash');
    expect(PROVIDER_DEFAULTS.qwen.model).toBe('qwen3.6-flash');
    expect(PROVIDER_DEFAULTS.anthropic.model).toBe('claude-haiku-4-5-20251001');
    expect(PROVIDER_DEFAULTS.openai.model).toBe('gpt-5-mini');

    for (const provider of Object.values(PROVIDER_DEFAULTS)) {
      expect(isLegacyModel(provider.model)).toBe(false);
    }
  });

  it('replaces a textarea selection and emits an input event', () => {
    const eventTypes: string[] = [];
    const control = {
      tagName: 'TEXTAREA',
      value: 'hello world',
      selectionStart: 6,
      selectionEnd: 11,
      focus: vi.fn(),
      setSelectionRange(this: { selectionStart: number; selectionEnd: number }, start: number, end: number) {
        this.selectionStart = start;
        this.selectionEnd = end;
      },
      dispatchEvent(event: Event) {
        eventTypes.push(event.type);
        return true;
      },
    } as unknown as HTMLTextAreaElement;
    const context: SelectionContext = {
      kind: 'text-control',
      text: 'world',
      element: control,
      start: 6,
      end: 11,
    };

    expect(replaceSelectionContext(context, 'Codex')).toBe(true);
    expect(control.value).toBe('hello Codex');
    expect(control.selectionStart).toBe(11);
    expect(control.selectionEnd).toBe(11);
    expect(eventTypes).toContain('input');
  });

  it('uses a DOM Range fallback and emits an input event on editable hosts', () => {
    document.body.innerHTML = '<div contenteditable="true">hello world</div>';
    const host = document.body.firstElementChild as HTMLElement;
    const textNode = host.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    const inputListener = vi.fn();
    host.addEventListener('input', inputListener);

    const context: SelectionContext = { kind: 'range', text: 'world', range, editableHost: host };
    expect(replaceSelectionContext(context, 'Codex')).toBe(true);
    expect(host.textContent).toBe('hello Codex');
    expect(inputListener).toHaveBeenCalledTimes(1);
  });

  it('captures text-control selections and exposes their bounds', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello world';
    textarea.setSelectionRange(6, 11);
    const rect = { x: 1 } as DOMRect;
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect);

    const context = captureSelectionContext(textarea);
    expect(context).toMatchObject({ kind: 'text-control', text: 'world', start: 6, end: 11 });
    expect(context && getSelectionRect(context)).toBe(rect);
  });

  it('rejects empty and unsupported text-control selections', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '   ';
    textarea.setSelectionRange(0, 3);
    expect(captureSelectionContext(textarea)).toBeNull();

    const input = document.createElement('input');
    input.type = 'number';
    expect(captureSelectionContext(input)).toBeNull();
    expect(captureSelectionContext(null)).toBeNull();
  });

  it('captures a DOM Range inside a contenteditable host', () => {
    document.body.innerHTML = '<div contenteditable="true">hello world</div>';
    const host = document.body.firstElementChild as HTMLElement;
    const textNode = host.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const context = captureSelectionContext(host);
    expect(context).toMatchObject({ kind: 'range', text: 'world', editableHost: host });
  });

  it('returns range bounds and supports replacement without an editable host', () => {
    const rect = { y: 2 } as DOMRect;
    const range = {
      getBoundingClientRect: vi.fn().mockReturnValue(rect),
      deleteContents: vi.fn(),
      insertNode: vi.fn(),
    } as unknown as Range;
    const context: SelectionContext = { kind: 'range', text: 'x', range, editableHost: null };

    expect(getSelectionRect(context)).toBe(rect);
    expect(replaceSelectionContext(context, 'y')).toBe(true);
    expect(range.deleteContents).toHaveBeenCalledTimes(1);
    expect(range.insertNode).toHaveBeenCalledTimes(1);
  });

  it('falls back to a standard input event when InputEvent is unavailable', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello world';
    const listener = vi.fn();
    textarea.addEventListener('input', listener);
    vi.stubGlobal('InputEvent', undefined);

    expect(replaceSelectionContext({
      kind: 'text-control',
      text: 'world',
      element: textarea,
      start: 6,
      end: 11,
    }, 'Codex')).toBe(true);
    expect(textarea.value).toBe('hello Codex');
    expect(listener).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('limits batch concurrency while preserving result order', async () => {
    let active = 0;
    let maximum = 0;
    const values = [1, 2, 3, 4, 5, 6];

    const results = await mapWithConcurrency(values, 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maximum).toBeLessThanOrEqual(2);
  });

  it('rejects invalid concurrency values', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow('concurrency');
  });
});
