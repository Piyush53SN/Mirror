/**
 * tests/dom-stub.mjs — a deliberately tiny DOM + CSS-layout stub.
 *
 * Why this exists: the prototype's acceptance criteria (every tap target >= 48dp)
 * must be enforced in CI, not by eye. A real headless browser is the better tool,
 * but it must be possible to *run the checks in this sandbox and on a laptop with
 * no network*, so this file implements just enough of the DOM — elements,
 * attributes, event delegation, classList, a layout pass driven by CSS rules
 * parsed out of the prototype itself — to execute prototype/index.html's own
 * <script> and measure the resulting tree.
 *
 * It is NOT a browser. See tests/README.md for the list of things it does not
 * model, and scripts/check-prototype.mjs for the browser-based check that
 * supersedes it when Chromium is available.
 *
 * Zero dependencies. Node >= 20.
 */

const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source']);

/* ------------------------------------------------------------------ CSS ---- */

/**
 * Extract the prototype's <style> blocks, and drop anything inside @supports /
 * @media (prefers-reduced-transparency) so we measure the default rendering path.
 */
function extractStyles(html) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return blocks
    .map((css) =>
      css
        // Comments are not selectors: leaving them in silently disabled every
        // rule that followed one (found by tests/prototype.test.mjs).
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@supports[^{]*\{[\s\S]*?\n\}/g, ''),
    )
    .join('\n');
}

function splitRules(css) {
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const body = buf;
      const sel = stack.pop();
      if (sel !== undefined && !sel.startsWith('@')) out.push({ sel, body });
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

const expandShorthand = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
};

/** Turn declarations into a plain map, expanding the shorthands we rely on. */
export function parseDecls(body) {
  const decls = {};
  for (const chunk of body.split(';')) {
    const i = chunk.indexOf(':');
    if (i < 0) continue;
    const prop = chunk.slice(0, i).trim();
    const value = chunk.slice(i + 1).trim().replace(/\s*!important$/, '');
    if (!prop || !value) continue;
    if (expandShorthand[prop]) {
      const parts = value.split(/\s+/);
      const [t, r = t, b = t, l = r] = parts;
      decls['padding-top'] = t;
      decls['padding-right'] = r;
      decls['padding-bottom'] = b;
      decls['padding-left'] = l;
      for (const p of expandShorthand[prop]) {
        const v = { padding: [t, r, b, l], margin: [t, r, b, l] }[prop][
          ['top', 'right', 'bottom', 'left'].indexOf(p.split('-')[1])
        ];
        decls[p] = v;
      }
    } else {
      decls[prop] = value;
    }
  }
  return decls;
}

/** Specificity as [ids, classes, types] — enough for our flat rule set. */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes = (sel.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?/g) || []).length;
  const types = (sel.match(/(^|[\s>+~])([a-z][\w-]*)/g) || []).length;
  return ids * 10000 + classes * 100 + types;
}

function matches(node, sel) {
  return sel
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((part) => matchesCompound(node, part.replace(/\s*>\s*/g, '>')));
}

/** Descendant/child combinators: `.segmented button` must match a button inside .segmented. */
function matchesCompound(node, part) {
  const segments = part.split(/>/).map((s) => s.trim());
  const lastParts = segments[segments.length - 1].split(/\s+/).filter(Boolean);
  // tokens in the final segment form an ancestor chain of their own
  const chain = [];
  const lastCompoundSeq = [];
  let node0 = lastParts.pop();
  let cursor = node;
  if (!matchesSimple(cursor, node0)) return false;
  // ancestors required by the whitespace inside the final segment
  while (lastParts.length) {
    const want = lastParts.pop();
    cursor = cursor.parent;
    while (cursor && !matchesSimple(cursor, want)) cursor = cursor.parent;
    if (!cursor) return false;
    chain.push(want);
  }
  // explicit `>` steps, processed right to left after the final segment
  let parent = chain.length ? cursor : node.parent;
  for (let i = segments.length - 2; i >= 0; i--) {
    const parts = segments[i].split(/\s+/).filter(Boolean);
    for (let j = parts.length - 1; j >= 0; j--) {
      const strict = j === 0 && i === segments.length - 2 ? true : false;
      // the first `>` after the final segment is strict; the rest may skip
      let candidate = parent;
      if (strict) {
        if (!candidate || !matchesSimple(candidate, parts[j])) return false;
        parent = candidate.parent;
      } else {
        while (candidate && !matchesSimple(candidate, parts[j])) candidate = candidate.parent;
        if (!candidate) return false;
        parent = candidate.parent;
      }
    }
  }
  return true;
}

function matchesSimple(node, s) {
  if (!s) return true;
  for (const m of s.match(/\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?|#[^\s.[:>]+|\.[^\s.[:>]+|[a-z][\w-]*/gi) || []) {
    if (m.startsWith('#')) {
      if (node.attr('id') !== m.slice(1)) return false;
    } else if (m.startsWith('.')) {
      if (!node.classList.contains(m.slice(1))) return false;
    } else if (m.startsWith('[')) {
      const [name, , val] = m.slice(1, -1).match(/^([\w-]+)(=?)(.*)$/) || [];
      if (!name || node.attr(name) === null) return false;
      if (val && node.attr(name) !== val.replace(/^["']|["']$/g, '')) return false;
    } else if (m.startsWith(':')) {
      const pseudo = m.slice(1).split('(')[0];
      if (pseudo === 'root') {
        if (node.tag !== 'html') return false;
      } else if (pseudo === 'not') {
        const inner = m.slice(m.indexOf('(') + 1, -1);
        if (matchesSimple(node, inner)) return false;
      } else {
        // hover/focus/active/checked/first-child... treat as non-matching so the
        // default rendering path is what gets measured.
        return false;
      }
    } else if (m.toLowerCase() !== node.tag) {
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------- elements ---- */

export class StubElement {
  constructor(tag, doc, attrs = {}) {
    this.tag = tag.toLowerCase();
    this.doc = doc;
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.style = { ...(attrs.style ? parseDecls(attrs.style) : {}) };
    this.listeners = {};
    this.text = '';
    this.classes = new Set();
    if (attrs.class) attrs.class.split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c));
  }

  get classList() {
    const self = this;
    return {
      contains: (c) => self.classes.has(c),
      add: (c) => self.classes.add(c),
      remove: (c) => self.classes.delete(c),
      toggle: (c, on) => (on === undefined ? (self.classes.has(c) ? self.classes.delete(c) : self.classes.add(c)) : on ? self.classes.add(c) : self.classes.delete(c)),
    };
  }

  attr(name) {
    if (name === 'class') return [...this.classes].join(' ');
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  getAttribute(name) {
    return this.attr(name);
  }

  hasAttributes() {
    return Object.keys(this.attrs).length > 0;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'class') {
      this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  hasAttribute(name) {
    return this.attr(name) !== null;
  }

  append(...nodes) {
    for (const n of nodes) {
      const el = typeof n === 'string' ? new StubElement('#text', this.doc, {}) : n;
      if (typeof n === 'string') el.text = n;
      el.parent = this;
      this.children.push(el);
    }
  }

  appendChild(n) {
    this.append(n);
    return n;
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }

  /** Delegated dispatch — mirrors how the prototype actually listens. */
  dispatch(type, target, extra = {}) {
    const event = { type, target, currentTarget: this, defaultPrevented: false, stopPropagation() {}, preventDefault() { this.defaultPrevented = true; }, ...extra };
    let node = target;
    while (node) {
      for (const fn of node.listeners[type] || []) fn(event);
      node = node.parent;
    }
    return event;
  }

  get dataset() {
    const el = this;
    return new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (typeof prop !== 'string') return undefined;
          const attr = 'data-' + prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
          return el.attrs[attr] === undefined ? undefined : el.attrs[attr];
        },
        set: (_t, prop, value) => {
          const attr = 'data-' + String(prop).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
          el.attrs[attr] = String(value);
          return true;
        },
        has: (_t, prop) => typeof prop === 'string' && `data-${String(prop).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}` in el.attrs,
        ownKeys: () => Object.keys(el.attrs).filter((k) => k.startsWith('data-')),
      },
    );
  }

  get textContent() {
    let out = '';
    const visit = (n) => {
      if (n.tag === '#text') out += n.text;
      else for (const c of n.children) visit(c);
    };
    visit(this);
    return out;
  }

  set textContent(value) {
    this.children = [];
    const el = new StubElement('#text', this.doc);
    el.text = String(value);
    el.parent = this;
    this.children.push(el);
    this._html = String(value);
    this.doc._computed = null;
  }

  /** Non-null for anything that is not explicitly hidden — mirrors "is rendered". */
  get offsetParent() {
    return this.attrs.hidden !== undefined || this.classes.has('hidden') ? null : this.parent || { fake: true };
  }

  get firstElementChild() {
    return this.children.find((c) => c.tag !== '#text') || null;
  }

  matches(sel) {
    return matches(this, sel);
  }

  contains(other) {
    let n = other;
    while (n) {
      if (n === this) return true;
      n = n.parent;
    }
    return false;
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  /**
   * The measurement seam: the prototype's own in-page checker calls this, so a
   * test that drives runChecks() measures exactly what the page measures.
   */
  getBoundingClientRect() {
    const vp = this.doc._viewport || { rootVars: {}, width: 390, height: 844 };
    const scale = this.doc.textScale || 1;
    const m = this.measure({ ...vp, textScale: scale });
    return { width: m.w, height: m.h, top: 0, left: 0, right: m.w, bottom: m.h, x: 0, y: 0 };
  }

  focus() {}
  blur() {}
  scrollTo() {}
  get offsetWidth() {
    return this.getBoundingClientRect().width;
  }

  closest(sel) {
    let node = this;
    while (node) {
      if (matchesSimple(node, sel) || matches(node, sel)) return node;
      node = node.parent;
    }
    return null;
  }

  querySelectorAll(sel) {
    const out = [];
    walk(this, (n) => {
      if (n !== this && matches(n, sel)) out.push(n);
    });
    return out;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  get innerHTML() {
    return this._html || '';
  }

  /** Setting innerHTML re-parses through the same parser used for the file. */
  set innerHTML(html) {
    this._html = html;
    this.children = [];
    for (const child of parseFragment(html, this.doc)) {
      child.parent = this;
      this.children.push(child);
    }
    this.doc._computed = null;
  }

  /** Recursive layout: compute the used size of this subtree. */
  measure(viewport) {
    const computed = this.doc.computedStyle(this);
    const pad = (side) => resolvePx(computed[`padding-${side}`] || '0px', viewport) || 0;
    const inset = pad('left') + pad('right');
    const insetY = pad('top') + pad('bottom');
    const isRow = (computed.display || '').includes('flex') && computed['flex-direction'] !== 'column';

    const explicitW = cssLength(computed.width, viewport);
    const explicitH = cssLength(computed.height, viewport);

    let contentW = 0;
    let contentH = 0;
    let maxChildW = 0;
    let maxChildH = 0;
    let sumChildW = 0;
    let sumChildH = 0;
    let growCount = 0;

    for (const child of this.children) {
      if (child.tag === '#text') {
        const own = parseFloat(computed['font-size'] || '') || 15;
        const w = (child.text || '').trim().length * own * 0.52 * (this.doc.textScale || 1);
        maxChildW = Math.max(maxChildW, w);
        maxChildH = Math.max(maxChildH, 20 * this.doc.textScale);
        sumChildW += w;
        sumChildH += 20 * this.doc.textScale;
        continue;
      }
      const m = child.measure(viewport);
      if (m.grow) growCount++;
      maxChildW = Math.max(maxChildW, m.w);
      maxChildH = Math.max(maxChildH, m.h);
      sumChildW += m.w + resolvePx(m.marginLeft, viewport) + resolvePx(m.marginRight, viewport);
      sumChildH += m.h + resolvePx(m.marginTop, viewport) + resolvePx(m.marginBottom, viewport);
    }

    if (isRow) {
      contentW = sumChildW + gapFor(computed, 'column-gap', viewport) * Math.max(0, this.children.length - 1);
      contentH = maxChildH;
    } else {
      contentW = maxChildW;
      contentH = sumChildH + gapFor(computed, 'row-gap', viewport) * Math.max(0, this.children.length - 1);
    }

    // A flex:1 child can absorb free space; without a real layout engine we only
    // grow when an explicit parent width is known.
    let w = explicitW ?? contentW + inset;
    if (this.style['min-width']) w = Math.max(w, resolvePx(this.style['min-width'], viewport) || 0);
    if (computed['min-width'] && !this.style['min-width']) w = Math.max(w, resolvePx(computed['min-width'], viewport) || 0);

    const minH = this.style['min-height'] || computed['min-height'];
    let h = explicitH ?? contentH + insetY;
    if (minH && minH !== 'auto') h = Math.max(h, resolvePx(minH, viewport) || 0);

    // Never report a zero-size box: it means our stub failed to see the rule.
    return {
      w,
      h,
      grow: computed['flex-grow'] === '1' || computed.flex === '1',
      hasExplicitW: explicitW !== null,
      hasExplicitH: explicitH !== null || !!minH,
      hasRule: Object.keys(computed).length > 0,
      computed,
      marginTop: computed['margin-top'],
      marginBottom: computed['margin-bottom'],
      marginLeft: computed['margin-left'],
      marginRight: computed['margin-right'],
    };
  }
}

function gapFor(computed, key, viewport) {
  return resolvePx(computed.gap || computed[key] || '0px', viewport) || 0;
}

function walk(node, fn) {
  for (const child of node.children) {
    fn(child);
    if (child.tag !== '#text') walk(child, fn);
  }
}

export { walk };

/* ------------------------------------------------------------- parsing ---- */

const ATTR_RE = /([\w:-]+)(?:\s*=\s*"([^"]*)")?/g;

export function parseFragment(html, doc) {
  const out = [];
  const stack = [{ tag: '@root', children: out, attrs: {}, classList: new Set() }];
  const tagRe = /<!--[\s\S]*?-->|<!\[[\s\S]*?\]>|<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const [full, close, open, rawAttrs, text] = m;
    const top = stack[stack.length - 1];
    if (close) {
      if (stack.length > 1) stack.pop();
    } else if (open) {
      const tag = open.toLowerCase();
      if (tag === 'br' || tag === 'svg') {
        // Treat <svg ...>…</svg> as a leaf: its internals never matter here.
        if (tag === 'svg') {
          const end = html.toLowerCase().indexOf('</svg>', m.index);
          tagRe.lastIndex = end < 0 ? tagRe.lastIndex : end + 6;
        }
        const el = new StubElement(tag, doc);
        el.parent = top;
        top.children.push(el);
        continue;
      }
      const attrs = {};
      for (const a of rawAttrs.matchAll(ATTR_RE)) {
        if (!a[1]) continue;
        attrs[a[1]] = a[2] === undefined ? '' : a[2];
      }
      const el = new StubElement(tag, doc, attrs);
      el.parent = top;
      top.children.push(el);
      if (!VOID.has(tag) && !full.endsWith('/>')) stack.push(el);
    } else if (text && text.trim()) {
      const el = new StubElement('#text', doc);
      el.text = text;
      el.parent = top;
      top.children.push(el);
    }
  }
  return out;
}

/**
 * Parse a full HTML document into a stub tree. `<script>` bodies are collected
 * separately so they can be executed by the caller.
 */
export function parseHTML(html) {
  const doc = {
    scripts: [],
    styles: [],
    _computed: null,
    textScale: 1,
    _viewport: { rootVars: {}, width: 390, height: 844 },
    computedStyle(node) {
      if (!this._computed) this._computed = this._buildComputed();
      const key = node.uid();
      return this._computed[key] || {};
    },
    _rules: [],
  };

  // Inline <style> rules
  const styles = extractStyles(html);
  for (const { sel, body } of splitRules(styles)) {
    doc._rules.push({ sel, decls: parseDecls(body), spec: specificity(sel), order: doc._rules.length });
  }

  // <script> bodies (no src= in the prototype; assert that in the check script)
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(m[1])) doc.scripts.push(m[2]);
    else doc.scripts.push({ src: /src="([^"]+)"/.exec(m[1])[1] });
  }

  // Strip script/style bodies before parsing markup
  const markup = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');

  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(markup);
  const inner = bodyMatch ? bodyMatch[1] : markup;

  const htmlEl = new StubElement('html', doc, {});
  const bodyEl = new StubElement('body', doc, {});
  htmlEl.append(bodyEl);
  for (const child of parseFragment(inner, doc)) {
    child.parent = bodyEl;
    bodyEl.children.push(child);
  }

  let uid = 0;
  const idOf = new WeakMap();
  StubElement.prototype.uid = function uidFn() {
    if (!idOf.has(this)) idOf.set(this, `n${uid++}`);
    return idOf.get(this);
  };

  doc.documentElement = htmlEl;
  doc.body = bodyEl;
  doc.documentElement.parent = null;
  htmlEl.parent = null;
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.getElementById = (id) => doc.documentElement.querySelector(`#${id}`);
  doc.createElement = (tag) => new StubElement(tag, doc);
  doc.createTextNode = (text) => {
    const el = new StubElement('#text', doc);
    el.text = text;
    return el;
  };
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};

  doc._buildComputed = function build() {
    const map = {};
    const visit = (node) => {
      if (node.tag === '#text') return;
      const cascaded = [];
      // document stylesheet
      for (const rule of doc._rules) {
        if (matches(node, rule.sel)) cascaded.push(rule);
      }
      cascaded.sort((a, b) => a.spec - b.spec || a.order - b.order);
      const computed = {};
      for (const rule of cascaded) Object.assign(computed, rule.decls);
      // inline style wins
      Object.assign(computed, node.style);
      map[node.uid()] = computed;
      for (const c of node.children) visit(c);
    };
    visit(doc.documentElement);
    return map;
  };

  return doc;
}

/* ------------------------------------------------------------ css values -- */

/** Resolve a CSS length to px. Supports px, var(--x) via :root, and em/rem. */
export function resolvePx(value, viewport = {}) {
  if (value === undefined || value === null) return null;
  let v = String(value).trim();
  if (!v || v === 'auto' || v === 'none') return null;
  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v);
  if (varMatch) {
    const root = viewport.rootVars || {};
    if (root[varMatch[1]] !== undefined) v = root[varMatch[1]];
    else if (varMatch[2]) v = varMatch[2];
    else return null;
  }
  const num = parseFloat(v);
  if (Number.isNaN(num)) return null;
  if (v.endsWith('px')) return num;
  if (v.endsWith('rem')) return num * 16;
  if (v.endsWith('em')) return num * 16;
  if (/^[\d.]+$/.test(v)) return num;
  return num;
}

function cssLength(value, viewport) {
  return resolvePx(value, viewport);
}

/** Collect :root custom properties so var() can be resolved during measurement. */
export function collectRootVars(html, overrides = {}) {
  const css = extractStyles(html);
  const vars = {};
  for (const { sel, body } of splitRules(css)) {
    if (!/(^|,\s*)(:root|html)\b/.test(sel)) continue;
    for (const chunk of body.split(';')) {
      const i = chunk.indexOf(':');
      if (i < 0) continue;
      const prop = chunk.slice(0, i).trim();
      if (prop.startsWith('--')) vars[prop] = chunk.slice(i + 1).trim();
    }
  }
  return { ...vars, ...overrides };
}
