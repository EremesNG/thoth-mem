import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { placeGuidedSelect } from './guided-select-position.js';
import { presentStoredText } from './safe-presentation.js';

export interface GuidedSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

interface GuidedSelectProps {
  label: string;
  value?: string;
  options: GuidedSelectOption[];
  allLabel?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  onChange: (value: string | undefined) => void;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export default function GuidedSelect({
  label,
  value,
  options,
  allLabel,
  emptyMessage = 'No choices found',
  loading = false,
  disabled = false,
  clearable,
  onChange,
}: GuidedSelectProps) {
  const reactId = useId();
  const inputId = `guided-select-${reactId.replace(/:/g, '')}`;
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const choices = useMemo(() => {
    if (!allLabel) return options;
    return options.length > 0 ? [{ value: '', label: allLabel }, ...options] : [];
  }, [allLabel, options]);
  const selected = choices.find((option) => option.value === (value ?? '')) ?? {
    value: value ?? '',
    label: presentStoredText(value) || allLabel || emptyMessage,
  };
  const filteredChoices = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return choices;
    return choices.filter((option) => normalizeSearch(`${option.label} ${option.searchText ?? ''} ${option.value}`).includes(needle));
  }, [choices, query]);
  const canClear = (clearable ?? Boolean(allLabel)) && Boolean(value);
  const supportsNativePopover = typeof HTMLElement !== 'undefined'
    && typeof HTMLElement.prototype.showPopover === 'function';

  const positionPopover = useCallback(() => {
    const control = controlRef.current;
    const popover = popoverRef.current;
    if (!control || !popover) return;
    const trigger = control.getBoundingClientRect();
    const visual = window.visualViewport;
    const placement = placeGuidedSelect({
      trigger,
      viewport: visual
        ? {
            offsetLeft: visual.offsetLeft,
            offsetTop: visual.offsetTop,
            width: visual.width,
            height: visual.height,
          }
        : { offsetLeft: 0, offsetTop: 0, width: window.innerWidth, height: window.innerHeight },
      contentHeight: popover.scrollHeight + popover.offsetHeight - popover.clientHeight,
    });
    popover.style.left = `${placement.left}px`;
    popover.style.top = `${placement.top}px`;
    popover.style.width = `${placement.width}px`;
    popover.style.setProperty('--guided-select-max-height', `${placement.maxHeight}px`);
    popover.dataset.placement = placement.placement;
  }, []);

  useEffect(() => {
    if (!open) setQuery(selected.label);
  }, [open, selected.label]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredChoices.findIndex((option) => option.value === (value ?? ''));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredChoices, open, value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnKeyboardExit = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' && event.key !== 'Escape') return;
      setOpen(false);
      setQuery(selected.label);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnKeyboardExit, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnKeyboardExit, true);
    };
  }, [open, selected.label]);

  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    const control = controlRef.current;
    if (!popover || !control) return;
    let frame: number | null = null;
    const schedulePosition = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        positionPopover();
      });
    };

    if (supportsNativePopover) {
      try {
        popover.showPopover();
      } catch {
        popover.removeAttribute('popover');
      }
    }
    positionPopover();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedulePosition);
    resizeObserver?.observe(control);
    resizeObserver?.observe(popover);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('scroll', schedulePosition);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      window.visualViewport?.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('scroll', schedulePosition);
      if (supportsNativePopover && popover.matches(':popover-open')) popover.hidePopover();
    };
  }, [open, positionPopover, supportsNativePopover]);

  useLayoutEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(positionPopover);
    return () => window.cancelAnimationFrame(frame);
  }, [filteredChoices.length, loading, open, positionPopover]);

  const openChoices = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const selectChoice = (option: GuidedSelectOption) => {
    onChange(option.value || undefined);
    setQuery(option.label);
    setOpen(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery(selected.label);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        openChoices();
      } else if (filteredChoices.length > 0) {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => (current + direction + filteredChoices.length) % filteredChoices.length);
      }
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && open) {
      const option = filteredChoices[activeIndex];
      if (option) selectChoice(option);
      event.preventDefault();
    }
  };

  const activeOption = open ? filteredChoices[activeIndex] : undefined;
  const status = loading
    ? `Loading ${label.toLocaleLowerCase()} choices`
    : filteredChoices.length === 0
      ? emptyMessage
      : `${filteredChoices.length} ${filteredChoices.length === 1 ? 'choice' : 'choices'} available`;

  return (
    <div ref={rootRef} className="guided-select" data-open={open || undefined}>
      <label htmlFor={inputId}>{label}</label>
      <div ref={controlRef} className="guided-select-control">
        <Search size={14} aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOption ? `${inputId}-option-${activeIndex}` : undefined}
          aria-describedby={statusId}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selected.label}
          onClick={(event) => { event.currentTarget.focus(); openChoices(); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => {
            const active = document.activeElement;
            if (!rootRef.current?.contains(active) && !popoverRef.current?.contains(active)) setOpen(false);
          }, 0)}
        />
        {canClear
          ? <button type="button" className="guided-select-clear" aria-label={`Clear ${label}`} onClick={() => onChange(undefined)}><X size={13} /></button>
          : <ChevronDown size={15} aria-hidden="true" />}
      </div>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="guided-select-popover"
          data-guided-select-layer="true"
          popover={supportsNativePopover ? 'manual' : undefined}
        >
          <div id={listboxId} role="listbox" aria-label={`${label} choices`}>
            {loading && <div className="guided-select-message">Loading choices…</div>}
            {!loading && filteredChoices.length === 0 && <div className="guided-select-message">{emptyMessage}</div>}
            {!loading && filteredChoices.map((option, index) => (
              <button
                key={option.value || '__all__'}
                id={`${inputId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === (value ?? '')}
                className={index === activeIndex ? 'active' : ''}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectChoice(option)}
              >
                <span>{option.label}</span>
                {option.value === (value ?? '') && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
      <span id={statusId} className="visually-hidden" aria-live="polite">{status}</span>
    </div>
  );
}
