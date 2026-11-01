export type TooltipGroupKind = 'anchor' | 'connect';
export type TooltipRegistrar = (text: string) => string;
export type TooltipGroupRegistrar = (identifier: string, kind: TooltipGroupKind) => string;

export interface MathJaxLoaderConfig {
  load?: string[];
  [key: string]: unknown;
}

export interface MathJaxPackageConfig {
  '[+]'?: string[];
  '[-]'?: string[];
  [key: string]: unknown;
}

export interface MathJaxTeXConfig {
  packages?: string[] | MathJaxPackageConfig;
  [key: string]: unknown;
}

export interface MathJaxStartupConfig {
  ready?: () => void;
  [key: string]: unknown;
}

export interface MathJaxConfig {
  loader?: MathJaxLoaderConfig;
  tex?: MathJaxTeXConfig;
  startup?: MathJaxStartupConfig;
  [key: string]: unknown;
}

export interface MathJaxMathItem {
  math: string;
  [key: string]: unknown;
}

export interface MathJaxPreFilterData {
  math: MathJaxMathItem;
  [key: string]: unknown;
}

export interface MathJaxPreFilters {
  add(filter: (data: MathJaxPreFilterData) => void): unknown;
  [key: string]: unknown;
}

export interface MathJaxInputJax {
  name: string;
  preFilters: MathJaxPreFilters;
  [key: string]: unknown;
}

export interface MathJaxOutputJax {
  name: string;
  [key: string]: unknown;
}

export interface MathJaxDocument {
  inputJax: Iterable<MathJaxInputJax>;
  outputJax: MathJaxOutputJax;
  [key: string]: unknown;
}

export interface MathJaxStartup {
  defaultReady(): void;
  document: MathJaxDocument;
  promise: Promise<unknown>;
  [key: string]: unknown;
}

export interface MathJaxConversionOptions {
  display?: boolean;
  [key: string]: unknown;
}

export interface MathJaxRuntime {
  startup: MathJaxStartup;
  tex2svgPromise(source: string, options: MathJaxConversionOptions): Promise<Node>;
  tex2chtmlPromise(source: string, options: MathJaxConversionOptions): Promise<Node>;
  typesetPromise(elements?: (Element | string)[]): Promise<unknown>;
  [key: string]: unknown;
}

export interface MathTooltipOptions {
  mathJax?: MathJaxConfig;
}

export interface MathTooltips {
  config: MathJaxConfig;
  attach(root?: Element): () => void;
  typeset(elements?: (Element | string)[], mathJax?: MathJaxRuntime): Promise<void>;
  destroy(): void;
}

interface TooltipGroup {
  identifier: string;
  kind: TooltipGroupKind;
}

interface DecoratedAttributes {
  tabindex: string | null;
  label: string | null;
  describedby: string | null;
  border: HTMLSpanElement;
}

function getMathJax(): MathJaxRuntime {
  return (globalThis as typeof globalThis & { MathJax: MathJaxRuntime }).MathJax;
}

let instance = 0;

function group(source: string, start: number, tex = true): { content: string; end: number } {
  if (source[start] !== '{') throw new SyntaxError(`Expected { at ${start}`);
  let depth = 1;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') { i++; continue; }
    if (tex && source[i] === '%') {
      const end = source.indexOf('\n', i);
      if (end < 0) break;
      i = end;
      continue;
    }
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) {
      return { content: source.slice(start + 1, i), end: i + 1 };
    }
  }
  throw new SyntaxError(`Unclosed tooltip group at ${start}`);
}

// Kept separate from TeX parsing: MathJax remains responsible for all mathematics.
export function transformTooltips(source: string, register: TooltipRegistrar, registerGroup?: TooltipGroupRegistrar): string {
  let result = '';
  for (let i = 0; i < source.length;) {
    const verb = /^\\verb\*?([^a-zA-Z\s])/.exec(source.slice(i));
    if (verb) {
      const end = source.indexOf(verb[1], i + verb[0].length);
      if (end < 0) return result + source.slice(i);
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const match = /^\\(tooltipAnchor|tta|tooltipConnect|ttc|tooltip|ttip)\s*(?=\{)/.exec(source.slice(i));
    if (!match && source[i] === '\\') {
      result += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (source[i] === '%') {
      const end = source.indexOf('\n', i);
      if (end < 0) return result + source.slice(i);
      result += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (!match) { result += source[i++]; continue; }
    const equation = group(source, i + match[0].length);
    let next = equation.end;
    while (/\s/.test(source[next] ?? '') && next < source.length) next++;
    const argument = group(source, next, false);
    const isGroup = !['tooltip', 'ttip'].includes(match[1]);
    const kind = ['tooltipAnchor', 'tta'].includes(match[1]) ? 'anchor' : 'connect';
    if (isGroup && !argument.content.trim()) throw new SyntaxError('Tooltip identifier must not be empty');
    if (isGroup && !registerGroup) throw new TypeError('A group registrar is required for Anchor/Connect markup');
    const key = isGroup ? registerGroup!(argument.content, kind) : register(argument.content);
    result += `\\class{${key}}{${transformTooltips(equation.content, register, registerGroup)}}`;
    i = argument.end;
  }
  return result;
}

/** Configure BEFORE loading MathJax 3/4 tex-chtml or tex-svg. */
export function createMathTooltips(options: MathTooltipOptions = {}): MathTooltips {
  const prefix = `bmg-tip-${++instance}-`;
  const entries = new Map<string, string>();
  const keys = new Map<string, string>();
  const groups = new Map<string, TooltipGroup>();
  const groupKeys = new Map<string, string>();
  const base = options.mathJax ?? {};
  let count = 0;
  const register: TooltipRegistrar = (text) => {
    if (keys.has(text)) return keys.get(text)!;
    const key = `${prefix}${++count}`;
    entries.set(key, text);
    keys.set(text, key);
    return key;
  };
  const registerGroup: TooltipGroupRegistrar = (identifier, kind) => {
    const token = JSON.stringify([identifier, kind]);
    if (groupKeys.has(token)) return groupKeys.get(token)!;
    const key = `${prefix}group-${++count}`;
    groups.set(key, { identifier, kind });
    groupKeys.set(token, key);
    return key;
  };
  const packages = base.tex?.packages;
  const config: MathJaxConfig = {
    ...base,
    loader: { ...base.loader, load: [...new Set([...(base.loader?.load ?? []), '[tex]/html'])] },
    tex: {
      ...base.tex,
      packages: Array.isArray(packages)
        ? [...new Set([...packages, 'html'])]
        : { ...packages, '[+]': [...new Set([...(packages?.['[+]'] ?? []), 'html'])] },
    },
    startup: {
      ...base.startup,
      ready() {
        const mathJax = getMathJax();
        if (base.startup?.ready) base.startup.ready();
        else mathJax.startup.defaultReady();
        for (const input of mathJax.startup.document.inputJax) {
          if (input.name === 'TeX') {
            input.preFilters.add(({ math }) => { math.math = transformTooltips(math.math, register, registerGroup); });
          }
        }
      },
    },
  };
  let cleanup: (() => void) | undefined;
  function attach(root: Element = document.body): () => void {
    cleanup?.();
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    if (!win) throw new Error('Tooltip root must belong to a document with a window');
    const tip = doc.createElement('div');
    tip.id = `${prefix}popup`;
    tip.className = 'bmg-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const borders = doc.createElement('div');
    borders.className = 'bmg-math-borders';
    borders.setAttribute('aria-hidden', 'true');
    doc.body.append(tip, borders);
    let active: Element | null | undefined;
    let renderVersion = 0;
    const rendered = new Map<string, Promise<DocumentFragment>>();
    let conversions: Promise<unknown> = Promise.resolve();
    const highlighted = new Set<Element>();
    const decorated = new Map<Element, DecoratedAttributes>();
    const abort = new win.AbortController();
    const listen = <K extends keyof (GlobalEventHandlersEventMap & FontFaceSetEventMap)>(
      node: EventTarget, name: K,
      handler: (event: (GlobalEventHandlersEventMap & FontFaceSetEventMap)[K]) => void,
      extra: AddEventListenerOptions = {},
    ) => node.addEventListener(name, handler as EventListener, { signal: abort.signal, ...extra });
    const keyFor = (element: Element) => [...element.classList].find((key) => entries.has(key));
    const relationsFor = (element: Element) => [...element.classList].filter((key) => groups.has(key));
    const localText = (element: Element) => {
      const key = keyFor(element) || [...element.querySelectorAll('[class]')]
        .filter((el) => !el.closest('mjx-assistive-mml')).map(keyFor).find(Boolean);
      return key ? entries.get(key) : undefined;
    };
    const textFor = (element: Element) => {
      const own = localText(element);
      if (own !== undefined) return own;
      const scope = element.closest('mjx-container');
      if (!scope) return undefined;
      const ids = relationsFor(element).map((key) => groups.get(key)!.identifier);
      for (const candidate of scope.querySelectorAll('[class]')) {
        if (candidate.closest('mjx-assistive-mml')) continue;
        if (!relationsFor(candidate).some((key) => {
          const relation = groups.get(key)!;
          return relation.kind === 'anchor' && ids.includes(relation.identifier);
        })) continue;
        const text = localText(candidate);
        if (text !== undefined) return text;
      }
      return undefined;
    };
    const positionBorders = () => {
      for (const [el, attributes] of decorated) {
        const rect = el.getBoundingClientRect();
        const border = attributes.border;
        let left = rect.left - 2;
        let right = rect.right + 2;
        let top = rect.top - 2;
        let bottom = rect.bottom + 2;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = win.getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
          }
          if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        border.hidden = !el.isConnected || !rect.width || !rect.height || right <= left || bottom <= top;
        border.style.left = `${left + win.scrollX}px`;
        border.style.top = `${top + win.scrollY}px`;
        border.style.width = `${Math.max(0, right - left)}px`;
        border.style.height = `${Math.max(0, bottom - top)}px`;
        border.classList.toggle('bmg-math-border-active', highlighted.has(el));
      }
    };
    let frame: number | undefined;
    const scheduleBorders = () => {
      if (frame !== undefined) return;
      frame = win.requestAnimationFrame(() => { frame = undefined; positionBorders(); });
    };
    const anchorFor = (node: EventTarget | null): Element | null => {
      for (let el = node instanceof win.Element ? node : null; el && root.contains(el); el = el.parentElement) {
        if (keyFor(el) || relationsFor(el).length) return el;
      }
      return null;
    };
    const hide = () => {
      renderVersion++;
      active?.removeAttribute('aria-describedby');
      for (const el of highlighted) el.classList.remove('bmg-math-active');
      highlighted.clear();
      active = null;
      tip.hidden = true;
      positionBorders();
    };
    const show = (anchor: Element | null) => {
      if (!anchor) return hide();
      hide();
      active = anchor;
      const scope = anchor.closest('mjx-container');
      const identifiers = new Set<string>();
      for (let el: Element | null = anchor; el && el !== scope; el = el.parentElement) {
        for (const key of relationsFor(el)) identifiers.add(groups.get(key)!.identifier);
      }
      highlighted.add(anchor);
      if (scope && identifiers.size) {
        scope.querySelectorAll('[class]').forEach((el) => {
          if (!el.closest('mjx-assistive-mml') && relationsFor(el).some((key) => identifiers.has(groups.get(key)!.identifier))) highlighted.add(el);
        });
      }
      for (const el of highlighted) el.classList.add('bmg-math-active');
      positionBorders();
      const text = textFor(anchor);
      if (text === undefined) return;
      tip.textContent = text;
      tip.hidden = false;
      anchor.setAttribute('aria-describedby', tip.id);
      const a = anchor.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(win.innerWidth - t.width - 8, a.left + a.width / 2 - t.width / 2))}px`;
      tip.style.top = `${Math.max(8, Math.min(win.innerHeight - t.height - 8, a.top >= t.height + 16 ? a.top - t.height - 8 : a.bottom + 8))}px`;
      const version = renderVersion;
      if (!rendered.has(text)) {
        const job = conversions.then(async () => {
          const fragment = doc.createDocumentFragment();
          // Parse only math delimiters; prose always becomes text nodes, never HTML.
          const pattern = /\\\$([\s\S]*?)\\\$|\$((?:\\[\s\S]|[^$])+)\$|\\\(([\s\S]*?)\\\)/g;
          let offset = 0;
          for (const match of text.matchAll(pattern)) {
            fragment.append(doc.createTextNode(text.slice(offset, match.index)));
            const source = match[1] ?? match[2] ?? match[3];
            const mathJax = getMathJax();
            const svg = mathJax.startup.document.outputJax.name === 'SVG';
            try {
              const node = await (svg ? mathJax.tex2svgPromise(source, { display: false }) : mathJax.tex2chtmlPromise(source, { display: false }));
              fragment.append(node);
            } catch {
              fragment.append(doc.createTextNode(match[0]));
            }
            offset = match.index + match[0].length;
          }
          fragment.append(doc.createTextNode(text.slice(offset)));
          return fragment;
        });
        rendered.set(text, job);
        conversions = job.catch(() => {});
      }
      rendered.get(text)!.then((fragment) => {
        if (abort.signal.aborted || version !== renderVersion || active !== anchor) return;
        tip.replaceChildren(fragment.cloneNode(true));
        const bounds = tip.getBoundingClientRect();
        const target = anchor.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(win.innerWidth - bounds.width - 8, target.left + target.width / 2 - bounds.width / 2))}px`;
        tip.style.top = `${Math.max(8, Math.min(win.innerHeight - bounds.height - 8, target.top >= bounds.height + 16 ? target.top - bounds.height - 8 : target.bottom + 8))}px`;
      }).catch(() => {});
    };
    const decorate = () => {
      root.querySelectorAll('[class]').forEach((el) => {
        if (tip.contains(el)) return;
        if (el.closest('mjx-assistive-mml')) return;
        const key = keyFor(el);
        const relations = relationsFor(el);
        if (!key && !relations.length) return;
        if (!decorated.has(el)) {
          const border = doc.createElement('span');
          border.className = 'bmg-math-border';
          borders.append(border);
          decorated.set(el, {
            tabindex: el.getAttribute('tabindex'),
            label: el.getAttribute('aria-label'),
            describedby: el.getAttribute('aria-describedby'),
            border,
          });
          resizeObserver.observe(el.closest('mjx-container') || el);
        }
        el.setAttribute('tabindex', '0');
        const text = textFor(el);
        if (text !== undefined) el.setAttribute('aria-label', text);
        el.classList.add('bmg-math-term');
      });
      for (const [el, attributes] of decorated) {
        if (!root.contains(el)) {
          attributes.border.remove();
          decorated.delete(el);
        }
      }
      scheduleBorders();
    };
    listen(root, 'pointerover', (e) => show(anchorFor(e.target)));
    listen(root, 'pointerout', (e) => show(anchorFor(e.relatedTarget)));
    listen(root, 'focusin', (e) => show(anchorFor(e.target)));
    listen(root, 'focusout', (e) => show(anchorFor(e.relatedTarget)));
    listen(root, 'click', (e) => show(anchorFor(e.target)));
    listen(doc, 'pointerdown', (e) => { if (!anchorFor(e.target)) hide(); });
    listen(doc, 'keydown', (e) => {
      if (e.key === 'Escape') hide();
      if ((e.key === 'Enter' || e.key === ' ') && anchorFor(e.target)) { e.preventDefault(); show(anchorFor(e.target)); }
    });
    listen(win, 'scroll', () => { if (active) show(active); scheduleBorders(); }, { capture: true });
    listen(win, 'resize', () => { hide(); scheduleBorders(); });
    const resizeObserver = new win.ResizeObserver(scheduleBorders);
    resizeObserver.observe(root);
    listen(doc, 'load', scheduleBorders, { capture: true });
    doc.fonts?.ready.then(() => { if (!abort.signal.aborted) scheduleBorders(); });
    if (doc.fonts) listen(doc.fonts, 'loadingdone', scheduleBorders);
    const observer = new win.MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' && !tip.contains(record.target) && !borders.contains(record.target))) {
        if (active && !root.contains(active)) hide();
        decorate();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    decorate();
    cleanup = () => {
      hide();
      abort.abort();
      observer.disconnect();
      resizeObserver.disconnect();
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      tip.remove();
      borders.remove();
      for (const [el, attributes] of decorated) {
        for (const [name, value] of Object.entries({ tabindex: attributes.tabindex, 'aria-label': attributes.label, 'aria-describedby': attributes.describedby })) {
          if (value === null) el.removeAttribute(name);
          else el.setAttribute(name, value);
        }
        el.classList.remove('bmg-math-term');
      }
      decorated.clear();
      rendered.clear();
    };
    return cleanup;
  }
  return {
    config,
    attach,
    async typeset(elements, mathJax = getMathJax()) {
      await mathJax.startup.promise;
      await mathJax.typesetPromise(elements);
    },
    destroy() { cleanup?.(); entries.clear(); keys.clear(); groups.clear(); groupKeys.clear(); },
  };
}
