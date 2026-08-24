import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Anchored from "../Anchored/Anchored";

export interface MetroSelectOption<T extends string> {
  value: T;
  label: string;
  style?: CSSProperties;
}

interface MetroSelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly MetroSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** A flat, keyboard-operable Metro listbox with a viewport-aware flyout. */
export default function MetroSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: MetroSelectProps<T>) {
  const listboxId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const show = (index = selectedIndex) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const move = (index: number) => {
    if (options.length === 0) return;
    setActiveIndex((index + options.length) % options.length);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      show(Math.min(selectedIndex + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      show(Math.max(selectedIndex - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0);
    } else if (event.key === "End") {
      event.preventDefault();
      show(options.length - 1);
    }
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(0);
    } else if (event.key === "End") {
      event.preventDefault();
      move(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const selected = options[selectedIndex];
  const menuWidth = Math.max(220, trigger.current?.getBoundingClientRect().width ?? 0);

  return (
    <div className="metro-select">
      <button
        type="button"
        className={`metro-select-trigger ${open ? "is-open" : ""}`.trim()}
        ref={trigger}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected?.label ?? ""}</span>
        <span className="metro-select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <Anchored anchor={trigger} className="metro-select-menu" gap={7}>
          <div
            className="metro-select-list"
            id={listboxId}
            ref={panel}
            role="listbox"
            aria-label={label}
            style={{ width: `${menuWidth}px` }}
          >
            {options.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`metro-select-option ${option.value === value ? "is-selected" : ""}`.trim()}
                key={option.value}
                ref={(node) => { optionRefs.current[index] = node; }}
                tabIndex={index === activeIndex ? 0 : -1}
                style={{ ...option.style, ["--option-order" as string]: index }}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
                onKeyDown={(event) => onOptionKeyDown(event, index)}
              >
                <span className="metro-select-mark" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </Anchored>
      )}
    </div>
  );
}
