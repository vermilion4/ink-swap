// Toasts: pill messages at the top center of the page, inside InkSwap's shadow root.
// Success: gradient check badge. Error: red ring, "!" badge, optional Retry button.

export interface ToastOptions {
  kind: 'success' | 'error';
  text: string;
  action?: { label: string; onClick: () => void };
}

const SHOW_MS = 3000;
const ERROR_SHOW_MS = 6000; // errors stay a little longer, so Retry can be reached

export function createToaster(container: HTMLElement) {
  const stack = document.createElement('div');
  stack.className = 'toasts';
  container.append(stack);
  const showing = new Map<string, { el: HTMLElement; timer: ReturnType<typeof setTimeout> }>();

  function dismiss(key: string) {
    const t = showing.get(key);
    if (!t) return;
    showing.delete(key);
    clearTimeout(t.timer);
    t.el.classList.add('leaving');
    setTimeout(() => t.el.remove(), 250);
  }

  return {
    show({ kind, text, action }: ToastOptions) {
      const key = `${kind}:${text}`;
      const ms = kind === 'error' ? ERROR_SHOW_MS : SHOW_MS;
      // The same message already on screen (e.g. several pages failing at once): just keep it up longer.
      const existing = showing.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => dismiss(key), ms);
        return;
      }
      const el = document.createElement('div');
      el.className = `toast ${kind}`;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = kind === 'error' ? '!' : '✓';
      const label = document.createElement('span');
      label.className = 'text';
      label.textContent = text;
      el.append(badge, label);
      if (action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          dismiss(key);
          action.onClick();
        });
        el.append(btn);
      }
      stack.append(el);
      showing.set(key, { el, timer: setTimeout(() => dismiss(key), ms) });
    },
  };
}
