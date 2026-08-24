import { useEffect } from "react";

const ACTIVE_CLASS = "is-actively-scrolling";
const HIDE_AFTER_MS = 650;

/** Shows a scrollbar thumb only while an overflowing surface is actually moving. */
export default function useTransientScrollbars() {
  useEffect(() => {
    const timers = new Map<HTMLElement, number>();

    const onScroll = (event: Event) => {
      const target = event.target;
      const element = target instanceof Document
        ? document.documentElement
        : target instanceof HTMLElement
          ? target
          : null;
      if (!element) return;

      const overflows = element.scrollHeight > element.clientHeight + 1
        || element.scrollWidth > element.clientWidth + 1;
      if (!overflows) return;

      element.classList.add(ACTIVE_CLASS);
      const pending = timers.get(element);
      if (pending !== undefined) window.clearTimeout(pending);
      timers.set(element, window.setTimeout(() => {
        element.classList.remove(ACTIVE_CLASS);
        timers.delete(element);
      }, HIDE_AFTER_MS));
    };

    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const [element, timer] of timers) {
        window.clearTimeout(timer);
        element.classList.remove(ACTIVE_CLASS);
      }
    };
  }, []);
}
