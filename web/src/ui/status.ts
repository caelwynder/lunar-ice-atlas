export interface StatusLine {
  show(message: string | null): void;
  fail(message: string): void;
}

export function createStatus(el: HTMLElement): StatusLine {
  let fatal = false;
  const render = (message: string | null): void => {
    el.hidden = message === null;
    el.textContent = message ?? '';
  };
  return {
    show(message) {
      if (!fatal) render(message);
    },
    fail(message) {
      fatal = true;
      el.setAttribute('role', 'alert');
      render(message);
    },
  };
}
