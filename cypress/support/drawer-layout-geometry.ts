type ShadowGeometryEntry = {
  element: HTMLElement;
  host: HTMLElement;
};

const isHtmlElement = (element: Element): element is HTMLElement => {
  const elementConstructor = element.ownerDocument.defaultView?.HTMLElement;
  return elementConstructor
    ? element instanceof elementConstructor
    : element instanceof HTMLElement;
};

const getElementIdentity = (element: HTMLElement): string => {
  const classSuffix = typeof element.className === 'string' && element.className.trim()
    ? `.${element.className.trim().replaceAll(' ', '.')}`
    : '';
  return `${element.tagName.toLowerCase()}${classSuffix}`;
};

const isVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style?.display !== 'none'
    && style?.visibility !== 'hidden'
    && style?.opacity !== '0';
};

const collectShadowTree = (
  root: ShadowRoot,
  host: HTMLElement,
  entries: ShadowGeometryEntry[],
) => {
  for (const child of Array.from(root.children)) {
    if (!isHtmlElement(child)) continue;
    if (isVisible(child)) entries.push({ element: child, host });
    collectNestedShadowTrees(child, host, entries);
  }
};

const collectNestedShadowTrees = (
  root: HTMLElement,
  host: HTMLElement,
  entries: ShadowGeometryEntry[],
) => {
  for (const child of Array.from(root.children)) {
    if (!isHtmlElement(child)) continue;
    if (isVisible(child)) entries.push({ element: child, host });
    collectNestedShadowTrees(child, host, entries);
  }

  if (root.shadowRoot) {
    collectShadowTree(root.shadowRoot, root, entries);
  }
};

export const collectVisibleShadowGeometry = (detail: HTMLElement): ShadowGeometryEntry[] => {
  const entries: ShadowGeometryEntry[] = [];
  for (const host of Array.from(detail.querySelectorAll<HTMLElement>('*'))) {
    if (host.shadowRoot) collectShadowTree(host.shadowRoot, host, entries);
  }
  return entries;
};

// Ionic's moving toggle wrapper has an empty 16px tail beyond the painted
// handle. Measure content without that transparent wrapper, then restore it.
// The host and the painted toggle-inner geometry remain separate assertions.
export const getVisibleContentScrollWidth = (element: HTMLElement): number => {
  const inputs = Array.from(element.querySelectorAll<HTMLElement>('ion-toggle'))
    .map((host) => host.shadowRoot?.querySelector<HTMLElement>('.toggle-icon-wrapper'))
    .filter((input): input is HTMLElement => {
      const style = input?.ownerDocument.defaultView?.getComputedStyle(input);
      return Boolean(input) && style?.backgroundColor === 'rgba(0, 0, 0, 0)'
        && style.boxShadow === 'none' && style.borderWidth === '0px';
    });
  const originals = inputs.map((input) => ({
    input, value: input.style.getPropertyValue('display'), priority: input.style.getPropertyPriority('display'),
  }));
  try {
    for (const { input } of originals) input.style.setProperty('display', 'none', 'important');
    return element.scrollWidth;
  } finally {
    for (const { input, value, priority } of originals) {
      if (value) input.style.setProperty('display', value, priority);
      else input.style.removeProperty('display');
    }
  }
};

export const getShadowGeometryFailures = (
  detail: HTMLElement,
  tolerance = 1,
): string[] => {
  const detailRect = detail.getBoundingClientRect();
  const failures: string[] = [];

  for (const { element, host } of collectVisibleShadowGeometry(detail)) {
    // Table content is intentionally clipped horizontally. Its wrapper and
    // per-row actions after scrolling are checked separately in the spec.
    if (host.closest('.browser-log-session-table-wrap')) continue;
    const rect = element.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const identity = `${getElementIdentity(host)}::${getElementIdentity(element)}`;

    if (rect.left < detailRect.left - tolerance || rect.right > detailRect.right + tolerance) {
      failures.push(
        `${identity} outside detail ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} vs ${detailRect.left.toFixed(1)}..${detailRect.right.toFixed(1)}`,
      );
      continue;
    }

    // Ionic range knobs and toggle artwork deliberately paint inside a clipped
    // host. Their host geometry is the relevant screen-containment contract.
    if (host.matches('ion-toggle') && element.classList.contains('toggle-inner')) {
      if (rect.left < hostRect.left - tolerance || rect.right > hostRect.right + tolerance) {
        failures.push(`${identity} painted handle outside its toggle host`);
      }
    }
    if (host.matches('ion-range, ion-toggle')) continue;

    if (rect.left < hostRect.left - tolerance || rect.right > hostRect.right + tolerance) {
      failures.push(
        `${identity} outside host ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} vs ${hostRect.left.toFixed(1)}..${hostRect.right.toFixed(1)}`,
      );
    }
  }

  return failures;
};
