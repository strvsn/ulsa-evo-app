import { useCallback, useRef, type KeyboardEvent, type RefCallback } from 'react';

type RadioValue = string | number;

type RovingRadioGroupOptions<Value extends RadioValue> = {
  values: readonly Value[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
};

type RovingRadioProps = {
  ref: RefCallback<HTMLButtonElement>;
  tabIndex: 0 | -1;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

const focusWithoutScrolling = (element: HTMLButtonElement) => {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
};

/**
 * Adds native-radio-style keyboard navigation to a button-based radiogroup.
 */
export const useRovingRadioGroup = <Value extends RadioValue>({
  values,
  value,
  onChange,
  disabled = false,
}: RovingRadioGroupOptions<Value>) => {
  const optionRefs = useRef(new Map<Value, HTMLButtonElement>());
  const tabbableValue = values.includes(value) ? value : values[0];

  const setOptionRef = useCallback((option: Value, element: HTMLButtonElement | null) => {
    if (element) {
      optionRefs.current.set(option, element);
    } else {
      optionRefs.current.delete(option);
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, option: Value) => {
    if (disabled || values.length === 0) return;

    const currentIndex = values.indexOf(option);
    if (currentIndex < 0) return;

    let nextIndex: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % values.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + values.length) % values.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = values.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextValue = values[nextIndex];
    const nextOption = optionRefs.current.get(nextValue);
    if (nextOption) focusWithoutScrolling(nextOption);
    onChange(nextValue);
  }, [disabled, onChange, values]);

  return useCallback((option: Value): RovingRadioProps => ({
    ref: (element) => setOptionRef(option, element),
    tabIndex: !disabled && option === tabbableValue ? 0 : -1,
    onKeyDown: (event) => handleKeyDown(event, option),
  }), [disabled, handleKeyDown, setOptionRef, tabbableValue]);
};
