// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createStatus } from './status';

let el: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<p id="status"></p>';
  el = document.getElementById('status') as HTMLElement;
});

describe('createStatus', () => {
  it('shows and hides transient messages', () => {
    const status = createStatus(el);
    status.show('Loading Moon…');
    expect([el.hidden, el.textContent]).toEqual([false, 'Loading Moon…']);
    status.show(null);
    expect(el.hidden).toBe(true);
  });

  it('keeps a fatal message visible when a later load finishes', () => {
    const status = createStatus(el);
    status.fail('Could not start the atlas. Try reloading.');
    status.show(null);
    status.show('Loading Moon…');
    expect([el.hidden, el.textContent]).toEqual([false, 'Could not start the atlas. Try reloading.']);
    expect(el.getAttribute('role')).toBe('alert');
  });
});
