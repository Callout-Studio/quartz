/*
 * Callout Studio for Quartz 1.1.0
 *
 * Draws the heading and inline callouts of the Callout Studio Obsidian
 * plugin while a Quartz site is built. It holds no callouts: it reads
 * them from the note Callout Studio writes in the vault,
 * callout-studio-quartz.md, in the content folder, and keeps that note
 * off the site.
 *
 * Reads the content folder's notes only, to find that one. Writes
 * nothing, and makes no network requests.
 *
 * Built from https://github.com/Niv20/obsidian-plugin-callout-studio
 * (src/web/). Do not edit: it is replaced on every update.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
var CalloutStudioCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/web/core.ts
  var core_exports = {};
  __export(core_exports, {
    CONTENT_ROOT_SELECTOR: () => CONTENT_ROOT_SELECTOR,
    TOC_SELECTOR: () => TOC_SELECTOR,
    createWebRenderer: () => createWebRenderer
  });

  // src/utils/calloutId.ts
  var splitCalloutMetadata = (raw) => {
    const pipe = raw.indexOf("|");
    if (pipe === -1) return { id: raw, metadata: "", hasMetadata: false };
    return {
      id: raw.slice(0, pipe),
      metadata: raw.slice(pipe + 1),
      hasMetadata: true
    };
  };
  var normalizeCalloutId = (raw) => splitCalloutMetadata(raw).id.replace(/\s+/g, " ").trim().toLowerCase();
  var obsidianCalloutAttrId = (raw) => raw.trim().toLowerCase().replace(/\s+/g, "-");
  var calloutIdentity = (raw) => obsidianCalloutAttrId(normalizeCalloutId(raw));
  var obsidianDefaultTitle = (raw) => {
    const lower = raw.trim().replace(/-/g, " ").toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };
  var calloutTokenLabel = (def, typedId) => {
    var _a;
    if (def) {
      const typed = calloutIdentity(typedId);
      if (typed === calloutIdentity(def.id)) return def.displayName;
      if ((_a = def.aliases) == null ? void 0 : _a.some((alias) => calloutIdentity(alias) === typed)) {
        return obsidianDefaultTitle(typedId);
      }
    }
    return typedId.trim();
  };

  // src/editor/inlineContent.ts
  function blankInlineMath(line) {
    if (!line.includes("$")) return line;
    return line.replace(/\$(?![\s$])(?:[^$\n]*[^\s$])?\$(?!\d)/g, (m) => " ".repeat(m.length));
  }
  function matchInlineContent(line, openIdx) {
    if (line[openIdx] !== "{") return { kind: "none" };
    let depth = 0;
    for (let i = openIdx; i < line.length; i++) {
      const ch = line[i];
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return { kind: "content", from: openIdx, to: i + 1 };
      }
    }
    return { kind: "open" };
  }
  function matchContentParts(parts, startPart, startOffset) {
    let depth = 0;
    for (let p = startPart; p < parts.length; p++) {
      const part = parts[p];
      if (!part) continue;
      if (part.stop) return null;
      if (part.opaque) continue;
      const from = p === startPart ? startOffset : 0;
      for (let i = from; i < part.text.length; i++) {
        const ch = part.text[i];
        if (ch === "{") {
          depth++;
        } else if (ch === "}" && --depth === 0) {
          return part.nested ? null : { part: p, offset: i };
        }
      }
    }
    return null;
  }

  // src/editor/markdownContainers.ts
  function whitespace(line, start, column = 0) {
    let end = start, width = 0;
    while (line[end] === " " || line[end] === "	") {
      width += line[end] === "	" ? 4 - (column + width) % 4 : 1;
      end++;
    }
    return { end, width };
  }
  function markdownPrefix(line, continuationIndent = 0) {
    let from = 0, quoteDepth = 0, column = 0, listIndent = 0, inheritedIndent = 0;
    let lastContainer = null;
    for (; ; ) {
      const ws = whitespace(line, from, column);
      const carried = lastContainer !== "list" && continuationIndent > 0 && ws.width >= continuationIndent ? continuationIndent : 0;
      const indent = ws.width - carried;
      if (carried) {
        inheritedIndent = carried;
        continuationIndent = 0;
      }
      if (indent <= 3 && line[ws.end] === ">") {
        from = ws.end + 1;
        column += ws.width + 1;
        if (line[from] === " " || line[from] === "	") {
          from++;
          column++;
        }
        quoteDepth++;
        lastContainer = "quote";
        continue;
      }
      const marker = indent <= 3 ? /^(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/.exec(line.slice(ws.end)) : null;
      if (marker) {
        const markerEnd = ws.end + marker[0].length;
        const gap = whitespace(line, markerEnd, column + ws.width + marker[0].length);
        const padding = gap.width > 4 ? 1 : Math.max(1, gap.width);
        from = gap.width > 4 ? markerEnd + 1 : gap.end;
        column += ws.width + marker[0].length + padding;
        listIndent = column;
        lastContainer = "list";
        continuationIndent = 0;
        continue;
      }
      return { from: ws.end, indent, quoteDepth, listIndent: listIndent || inheritedIndent, lastContainer };
    }
  }

  // src/editor/markdownExclusions.ts
  function isMarkdownEscaped(source, at) {
    let slashes = 0;
    while (at > 0 && source[--at] === "\\") slashes++;
    return slashes % 2 === 1;
  }

  // src/editor/calloutTokens.ts
  var HEADING_CALLOUT_RE = /^(#{1,6})[ \t]+\[!([^\]\n\r]+)\][ \t]?(.*)$/;
  var RENDERED_HEADING_TOKEN_RE = /^\[!([^\]\n\r]+)\][ \t]?/;
  var OUTLINE_BRACKETED_TOKEN_RE = /^\[!([^\]\n\r]+)\]/;
  var OUTLINE_BARE_TOKEN_RE = /^!(\S+)(?:[ \t]|$)/;
  var OUTLINE_ID_MAX_WORDS = 6;
  function makeOutlineToken(parts, rest, bracketed) {
    return {
      rawId: parts.id,
      metadata: parts.metadata,
      hasMetadata: parts.hasMetadata,
      rest,
      title: rest.replace(/^[ \t]/, ""),
      bracketed
    };
  }
  function resolveBareOutlineId(body, isKnownId) {
    let limit = body.length;
    let words = 1;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch !== " " && ch !== "	") continue;
      if (++words > OUTLINE_ID_MAX_WORDS) {
        limit = i;
        break;
      }
    }
    for (let end = limit; end > 0; end--) {
      const last = body[end - 1];
      if (last === " " || last === "	" || last === "-") continue;
      const candidate = body.slice(0, end);
      if (isKnownId(candidate)) return candidate;
    }
    return null;
  }
  function resolveBareOutlineMetadata(body, isKnownId) {
    const pipe = body.indexOf("|");
    if (pipe === -1) return null;
    const id = body.slice(0, pipe);
    if (!id.trim() || !isKnownId(id)) return null;
    let end = pipe + 1;
    while (end < body.length && body[end] !== " " && body[end] !== "	") end++;
    return {
      parts: {
        id,
        metadata: body.slice(pipe + 1, end),
        hasMetadata: true
      },
      consumed: end
    };
  }
  function parseOutlineHeadingText(text, isKnownId) {
    var _a, _b;
    const bracketed = OUTLINE_BRACKETED_TOKEN_RE.exec(text);
    if (bracketed) {
      const parts2 = splitCalloutMetadata((_a = bracketed[1]) != null ? _a : "");
      if (!parts2.id.trim()) return null;
      return makeOutlineToken(parts2, text.slice(bracketed[0].length), true);
    }
    if (!text.startsWith("!")) return null;
    const body = text.slice(1);
    const piped = isKnownId ? resolveBareOutlineMetadata(body, isKnownId) : null;
    if (piped) {
      return makeOutlineToken(piped.parts, body.slice(piped.consumed), false);
    }
    const resolved = isKnownId ? resolveBareOutlineId(body, isKnownId) : null;
    if (resolved !== null) {
      const parts2 = splitCalloutMetadata(resolved);
      if (!parts2.id.trim()) return null;
      return makeOutlineToken(parts2, body.slice(resolved.length), false);
    }
    const bare = OUTLINE_BARE_TOKEN_RE.exec(text);
    const rawId = (_b = bare == null ? void 0 : bare[1]) != null ? _b : "";
    if (!rawId) return null;
    const parts = splitCalloutMetadata(rawId);
    if (!parts.id.trim()) return null;
    return makeOutlineToken(parts, body.slice(rawId.length), false);
  }
  function tokenEnd(token) {
    return token.content ? token.content.to : token.to;
  }
  var WIKILINK_RE = /\[\[([^\n]*?)\]\](?!\])/g;
  function stripWikilinks(line) {
    if (!line.includes("[[")) return line;
    let out = line.replace(WIKILINK_RE, (m) => " ".repeat(m.length));
    const open = out.indexOf("[[");
    if (open !== -1) {
      out = out.slice(0, open) + " ".repeat(out.length - open);
    }
    return out;
  }
  function scanVisibleLineForCalloutTokens(rawLine, visible, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    if (rawLine.indexOf("[!") === -1) return [];
    const line = stripWikilinks(visible);
    const prefix = markdownPrefix(rawLine);
    const contentFrom = (_a = options.contentFrom) != null ? _a : prefix.from;
    const blockQuote = (_b = options.blockQuote) != null ? _b : prefix.lastContainer === "quote";
    const content = line.slice(contentFrom).replace(/\r$/, "");
    const intact = (from, to) => line.slice(from, to) === rawLine.slice(from, to);
    const parseContent = options.inlineContent !== false;
    let contentLine = null;
    const contentScanLine = () => {
      contentLine != null ? contentLine : contentLine = blankInlineMath(line);
      return contentLine;
    };
    const quoteHeader = blockQuote ? /^\[!([^\][\n\r\0]+)\]/.exec(content) : null;
    if (quoteHeader) {
      const body = (_c = quoteHeader[1]) != null ? _c : "";
      const parts = splitCalloutMetadata(body);
      if (!parts.id.trim() || body.includes("[") || !intact(contentFrom, contentFrom + quoteHeader[0].length))
        return [];
      return [
        {
          role: "regular",
          rawId: parts.id,
          metadata: parts.metadata,
          hasMetadata: parts.hasMetadata,
          from: contentFrom,
          to: contentFrom + 2 + body.length + 1,
          hasTitle: false,
          headingLevel: 0
        }
      ];
    }
    const tokens = [];
    let inlineScanFrom = 0;
    const heading = prefix.quoteDepth === 0 ? content.match(HEADING_CALLOUT_RE) : null;
    if (heading) {
      const body = (_d = heading[2]) != null ? _d : "";
      const parts = splitCalloutMetadata(body);
      const from = contentFrom + content.indexOf("[!");
      const to = from + 2 + body.length + 1;
      const isLink = line[to] === "(";
      if (parts.id.trim() && !body.includes("[") && !isLink && intact(from, to)) {
        tokens.push({
          role: "heading",
          rawId: parts.id,
          metadata: parts.metadata,
          hasMetadata: parts.hasMetadata,
          from,
          to,
          hasTitle: ((_e = heading[3]) != null ? _e : "").trim().length > 0,
          headingLevel: ((_f = heading[1]) != null ? _f : "").length
        });
        inlineScanFrom = to;
      }
    }
    let searchFrom = inlineScanFrom, nextClose = -1;
    for (; ; ) {
      const idx = line.indexOf("[!", searchFrom);
      if (idx === -1) break;
      searchFrom = idx + 2;
      const before = idx > 0 ? line[idx - 1] : "";
      if (isMarkdownEscaped(line, idx)) continue;
      if (before === "[") continue;
      if (nextClose < idx + 2) nextClose = line.indexOf("]", idx + 2);
      const close = nextClose;
      if (close === -1) break;
      const nestedOpening = line.indexOf("[", idx + 2);
      if (nestedOpening >= 0 && nestedOpening < close) {
        searchFrom = nestedOpening;
        continue;
      }
      const body = line.slice(idx + 2, close);
      const parts = splitCalloutMetadata(body);
      if (!parts.id.trim() || body.includes("[") || /[\n\r\0]/.test(body) || !intact(idx, close + 1)) continue;
      if (line[close + 1] === "(") {
        searchFrom = close + 1;
        continue;
      }
      const token = {
        role: "inline",
        rawId: parts.id,
        metadata: parts.metadata,
        hasMetadata: parts.hasMetadata,
        from: idx,
        to: close + 1,
        hasTitle: false,
        headingLevel: 0
      };
      if (parseContent) {
        const match = matchInlineContent(contentScanLine(), close + 1);
        if (match.kind === "content") {
          token.content = {
            from: match.from,
            to: match.to,
            // From rawLine, not the blanked copy: the payload's own
            // inline code / wikilinks / math are real text.
            text: rawLine.slice(match.from + 1, match.to - 1)
          };
        } else if (match.kind === "open") {
          token.contentOpen = true;
        }
      }
      tokens.push(token);
      searchFrom = close + 1;
    }
    return tokens;
  }

  // src/editor/tokenClasses.ts
  var CSS_INLINE_TOKEN = "cs-inline-callout";
  var CSS_HEADING_LINE = "cs-heading-callout";
  var CSS_HEADING_TOKEN = "cs-heading-token";
  var CSS_HEADING_TITLE = "cs-heading-title";
  var CSS_HEADING_TITLE_GAP = "cs-heading-title-gap";
  var CSS_TOKEN_ICON = "cs-callout-icon";
  var CSS_TOKEN_NAME = "cs-callout-name";
  var CSS_TOKEN_EMPTY = "cs-token-empty";
  var CSS_UNKNOWN = "cs-unknown";
  var CSS_INLINE_HAS_CONTENT = "cs-inline-has-content";
  var CSS_CALLOUT_LEAD = "cs-callout-lead";
  var CSS_CALLOUT_PAYLOAD = "cs-callout-payload";

  // src/web/core.ts
  var HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
  var CONTENT_ROOT_SELECTOR = "article, main, .markdown-rendered, .markdown-preview-view";
  var TOC_SELECTOR = ".toc, .outline-view";
  var PILL_EXCLUDE_SELECTOR = [
    "code",
    "pre",
    ".math",
    "mjx-container",
    ".katex",
    "script",
    "style",
    "textarea",
    `.${CSS_INLINE_TOKEN}`,
    `.${CSS_HEADING_TOKEN}`,
    ".callout-title",
    "a",
    TOC_SELECTOR
  ].join(", ");
  var CONTENT_OPAQUE_SELECTOR = [
    "code",
    "pre",
    ".math",
    "mjx-container",
    ".katex",
    "a.internal-link",
    ".internal-embed",
    ".image-embed",
    `.${CSS_INLINE_TOKEN}`
  ].join(", ");
  var CONTENT_STOP_SELECTOR = "br, p, div, blockquote, table, ul, ol, li";
  var scanText = (text, inlineContent = true) => scanVisibleLineForCalloutTokens(text, text, { inlineContent });
  var TEXT_NODE = 3;
  var ELEMENT_NODE = 1;
  var SHOW_TEXT = 4;
  function isChrome(el) {
    return el.getAttribute("role") === "anchor" || el.getAttribute("aria-hidden") === "true" || el.classList.contains("clickable-icon") || el.classList.contains("heading-collapse-indicator") || el.classList.contains("header-anchor");
  }
  function leadingTextNode(h) {
    var _a;
    for (let child = h.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) {
        if (((_a = child.textContent) != null ? _a : "").trim().length > 0) return child;
        continue;
      }
      if (child.nodeType === ELEMENT_NODE && isChrome(child)) continue;
      return null;
    }
    return null;
  }
  function isHeadingLeadingTextNode(node) {
    var _a;
    const h = (_a = node.parentElement) == null ? void 0 : _a.closest(HEADING_SELECTOR);
    return h ? leadingTextNode(h) === node : false;
  }
  function isBlockCalloutLead(node, from) {
    var _a, _b;
    if (node.data.slice(0, from).trim() !== "") return false;
    const quote = (_a = node.parentElement) == null ? void 0 : _a.closest("blockquote");
    if (!quote) return false;
    const walker = quote.ownerDocument.createTreeWalker(quote, SHOW_TEXT);
    for (let first = walker.nextNode(); first !== null; first = walker.nextNode()) {
      if (((_b = first.textContent) != null ? _b : "").trim() === "") continue;
      return first === node;
    }
    return false;
  }
  function candidateTextNodes(root) {
    var _a;
    const walker = root.ownerDocument.createTreeWalker(root, SHOW_TEXT);
    const found = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (((_a = node.textContent) != null ? _a : "").indexOf("[!") === -1) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(PILL_EXCLUDE_SELECTOR)) continue;
      found.push(node);
    }
    return found;
  }
  function findContentEnd(startNode, startOffset) {
    var _a, _b;
    const parts = [{ text: startNode.data }];
    const nodes = [startNode];
    for (let cur = startNode.nextSibling; cur; cur = cur.nextSibling) {
      if (cur.nodeType === TEXT_NODE) {
        parts.push({ text: cur.data });
        nodes.push(cur);
        continue;
      }
      if (cur.nodeType !== ELEMENT_NODE) continue;
      const el = cur;
      if (el.matches(CONTENT_STOP_SELECTOR)) {
        parts.push({ text: "", stop: true });
        nodes.push(null);
        break;
      }
      if (el.matches(CONTENT_OPAQUE_SELECTOR)) {
        parts.push({ text: "", opaque: true });
        nodes.push(null);
        continue;
      }
      const inner = el.ownerDocument.createTreeWalker(el, SHOW_TEXT);
      for (let n = inner.nextNode(); n !== null; n = inner.nextNode()) {
        const opaque = ((_b = (_a = n.parentElement) == null ? void 0 : _a.closest(CONTENT_OPAQUE_SELECTOR)) != null ? _b : null) !== null;
        parts.push({ text: n.data, nested: true, opaque });
        nodes.push(null);
      }
    }
    const hit = matchContentParts(parts, 0, startOffset);
    const node = hit ? nodes[hit.part] : null;
    return hit && node ? { node, offset: hit.offset } : null;
  }
  var parseIconInBrowser = (markup) => Array.from(new DOMParser().parseFromString(markup, "text/html").body.childNodes);
  function createWebRenderer(data, env = {}) {
    var _a, _b, _c;
    const parseIcon = (_a = env.parseIcon) != null ? _a : parseIconInBrowser;
    const byId = /* @__PURE__ */ new Map();
    const byAlias = /* @__PURE__ */ new Map();
    const byIdentity = /* @__PURE__ */ new Map();
    for (const def of data.defs) byId.set(def.id, def);
    for (const def of data.defs) {
      for (const alias of (_b = def.aliases) != null ? _b : []) if (!byAlias.has(alias)) byAlias.set(alias, def);
    }
    for (const def of data.defs) {
      const key = calloutIdentity(def.id);
      if (!byIdentity.has(key)) byIdentity.set(key, def);
    }
    for (const def of data.defs) {
      for (const alias of (_c = def.aliases) != null ? _c : []) {
        const key = calloutIdentity(alias);
        if (!byIdentity.has(key)) byIdentity.set(key, def);
      }
    }
    const fallback = data.fallback === null ? void 0 : byId.get(data.fallback);
    const resolve = (rawId) => {
      var _a2, _b2;
      const id = normalizeCalloutId(rawId);
      const def = (_b2 = (_a2 = byId.get(id)) != null ? _a2 : byAlias.get(id)) != null ? _b2 : byIdentity.get(calloutIdentity(id));
      return def ? { def, unknown: false } : { def: fallback, unknown: true };
    };
    const domId = (rawId, { def, unknown }) => {
      var _a2, _b2, _c2;
      const id = normalizeCalloutId(rawId);
      if (!def || unknown) return id;
      if (id === def.id || ((_a2 = def.aliases) == null ? void 0 : _a2.includes(id))) return id;
      const typed = calloutIdentity(id);
      if (typed === calloutIdentity(def.id)) return def.id;
      return (_c2 = (_b2 = def.aliases) == null ? void 0 : _b2.find((alias) => calloutIdentity(alias) === typed)) != null ? _c2 : def.id;
    };
    const label = (rawId, { def, unknown }) => calloutTokenLabel(
      def && !unknown ? { id: def.id, displayName: def.name, aliases: def.aliases } : void 0,
      rawId
    );
    const stamp = (el, rawId, metadata, resolved) => {
      if (resolved.unknown) el.classList.add(CSS_UNKNOWN);
      el.setAttribute("data-callout", domId(rawId, resolved));
      if (metadata) el.setAttribute("data-callout-metadata", metadata);
    };
    const parsedIcons = /* @__PURE__ */ new Map();
    const iconNodes = (markup) => {
      let nodes = parsedIcons.get(markup);
      if (!nodes) {
        nodes = parseIcon(markup);
        parsedIcons.set(markup, nodes);
      }
      return nodes.map((node) => node.cloneNode(true));
    };
    const iconSpan = (doc, def, heading) => {
      var _a2, _b2;
      if ((def == null ? void 0 : def.hideIcon) === true) return null;
      const iconEl = doc.createElement("span");
      iconEl.classList.add(CSS_TOKEN_ICON);
      const markup = (_b2 = heading ? (_a2 = def == null ? void 0 : def.headingIcon) != null ? _a2 : def == null ? void 0 : def.icon : def == null ? void 0 : def.icon) != null ? _b2 : "";
      if (markup) for (const node of iconNodes(markup)) iconEl.appendChild(node);
      return iconEl;
    };
    const buildToken = (doc, rawId, metadata, heading, showName) => {
      const resolved = resolve(rawId);
      const root = doc.createElement("span");
      root.classList.add(heading ? CSS_HEADING_TOKEN : CSS_INLINE_TOKEN);
      stamp(root, rawId, metadata, resolved);
      const iconEl = iconSpan(doc, resolved.def, heading);
      if (iconEl) root.appendChild(iconEl);
      else if (!showName) root.classList.add(CSS_TOKEN_EMPTY);
      if (showName) {
        const nameEl = doc.createElement("span");
        nameEl.classList.add(CSS_TOKEN_NAME);
        nameEl.textContent = label(rawId, resolved);
        root.appendChild(nameEl);
      }
      return root;
    };
    const buildContentPill = (doc, rawId, metadata) => {
      const resolved = resolve(rawId);
      const root = doc.createElement("span");
      root.classList.add(CSS_INLINE_TOKEN, CSS_INLINE_HAS_CONTENT);
      stamp(root, rawId, metadata, resolved);
      const lead = doc.createElement("span");
      lead.classList.add(CSS_CALLOUT_LEAD);
      const iconEl = iconSpan(doc, resolved.def, false);
      if (iconEl) lead.appendChild(iconEl);
      else lead.classList.add(CSS_TOKEN_EMPTY);
      root.appendChild(lead);
      const payload = doc.createElement("span");
      payload.classList.add(CSS_CALLOUT_PAYLOAD);
      root.appendChild(payload);
      return { root, payload };
    };
    const transformHeading = (h) => {
      var _a2, _b2;
      if (h.classList.contains(CSS_HEADING_LINE)) return;
      const textNode = leadingTextNode(h);
      if (!textNode) return;
      const match = RENDERED_HEADING_TOKEN_RE.exec(textNode.data);
      if (!match) return;
      const parts = splitCalloutMetadata((_a2 = match[1]) != null ? _a2 : "");
      if (!parts.id.trim()) return;
      let lastContent = textNode.data.slice(match[0].length).trim() ? textNode : null;
      for (let cur = textNode.nextSibling; cur; cur = cur.nextSibling) {
        const written = cur.nodeType === TEXT_NODE ? ((_b2 = cur.textContent) != null ? _b2 : "").trim().length > 0 : cur.nodeType === ELEMENT_NODE && !isChrome(cur);
        if (written) lastContent = cur;
      }
      const hasTitle = lastContent !== null;
      const resolved = resolve(parts.id);
      h.classList.add(CSS_HEADING_LINE);
      stamp(h, parts.id, parts.metadata, resolved);
      textNode.data = textNode.data.slice(match[0].length);
      const tokenEl = buildToken(h.ownerDocument, parts.id, parts.metadata, true, !hasTitle);
      h.insertBefore(tokenEl, textNode);
      if (lastContent) {
        const titleEl = h.ownerDocument.createElement("span");
        titleEl.classList.add(CSS_HEADING_TITLE);
        if (/[ \t]$/.test(match[0])) titleEl.classList.add(CSS_HEADING_TITLE_GAP);
        h.insertBefore(titleEl, textNode);
        for (let cur = textNode; cur; ) {
          const next = cur === lastContent ? null : cur.nextSibling;
          titleEl.appendChild(cur);
          cur = next;
        }
      }
    };
    const transformContentPills = (root) => {
      var _a2;
      for (let guard = 0; guard < 256; guard++) {
        let spliced = false;
        for (const text of candidateTextNodes(root)) {
          for (const token of scanText(text.data)) {
            if (token.role !== "inline") continue;
            if (!token.content && !token.contentOpen) continue;
            const brace = token.to;
            if (text.data[brace] !== "{") continue;
            if (token.content && token.content.to === token.content.from + 2) continue;
            if (token.from === 0 && isHeadingLeadingTextNode(text)) continue;
            if (isBlockCalloutLead(text, token.from)) continue;
            const end = findContentEnd(text, brace);
            if (!end) continue;
            const sameNode = end.node === text;
            end.node.splitText(end.offset + 1);
            const body = text.splitText(token.from);
            const firstContent = body.splitText(brace - token.from + 1);
            const lastContent = sameNode ? firstContent : end.node;
            body.remove();
            const pill = buildContentPill(root.ownerDocument, token.rawId, token.metadata);
            (_a2 = firstContent.parentNode) == null ? void 0 : _a2.insertBefore(pill.root, firstContent);
            for (let cur = firstContent; cur; ) {
              const next = cur === lastContent ? null : cur.nextSibling;
              pill.payload.appendChild(cur);
              cur = next;
            }
            const closer = pill.payload.lastChild;
            if (closer && closer.nodeType === TEXT_NODE) {
              const tail = closer;
              if (tail.data.endsWith("}")) tail.data = tail.data.slice(0, -1);
              if (tail.data === "") tail.remove();
            }
            spliced = true;
            break;
          }
          if (spliced) break;
        }
        if (!spliced) break;
      }
    };
    const transformInlinePills = (root) => {
      const candidates = [];
      for (const node of candidateTextNodes(root)) {
        for (const token of scanText(node.data, data.content)) {
          if (token.role !== "inline") continue;
          if (token.from === 0 && isHeadingLeadingTextNode(node)) continue;
          if (isBlockCalloutLead(node, token.from)) continue;
          if (token.contentOpen) continue;
          if (token.content && token.content.to > token.content.from + 2) continue;
          candidates.push({
            node,
            from: token.from,
            to: tokenEnd(token),
            rawId: token.rawId,
            metadata: token.metadata
          });
        }
      }
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (!c) continue;
        c.node.splitText(c.to);
        const tokenPart = c.node.splitText(c.from);
        tokenPart.replaceWith(buildToken(root.ownerDocument, c.rawId, c.metadata, false, true));
      }
    };
    const process = (root) => {
      var _a2;
      if (!data.heading && !data.inline) return;
      if (((_a2 = root.textContent) != null ? _a2 : "").indexOf("[!") === -1) return;
      if (root.closest(TOC_SELECTOR)) return;
      if (data.heading) {
        const headings = Array.from(root.querySelectorAll(HEADING_SELECTOR));
        if (root.matches(HEADING_SELECTOR)) headings.unshift(root);
        for (const h of headings) transformHeading(h);
      }
      if (data.inline) {
        if (data.content) transformContentPills(root);
        transformInlinePills(root);
      }
    };
    const isKnown = (rawId) => !resolve(rawId).unknown;
    const outlineTitle = (text) => {
      var _a2;
      if (!data.heading) return null;
      const lead = ((_a2 = /^\s*/.exec(text)) != null ? _a2 : [""])[0].length;
      const token = parseOutlineHeadingText(text.slice(lead), isKnown);
      if (!token) return null;
      if (!token.bracketed && !isKnown(token.rawId)) return null;
      const title = token.title.trim() ? token.title : label(token.rawId, resolve(token.rawId));
      return text.slice(0, lead) + title;
    };
    const cleanToc = (toc) => {
      var _a2, _b2;
      if (!data.heading) return;
      if (((_a2 = toc.textContent) != null ? _a2 : "").indexOf("!") === -1) return;
      const walker = toc.ownerDocument.createTreeWalker(toc, SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) {
        const cleaned = outlineTitle(node.data);
        if (cleaned === null) continue;
        const entry = node.parentElement;
        if (!entry || entry.closest(`.${CSS_INLINE_TOKEN}`)) continue;
        let first = entry.firstChild;
        while (first && first !== node && ((_b2 = first.textContent) != null ? _b2 : "").trim() === "") first = first.nextSibling;
        if (first !== node) continue;
        node.data = cleaned;
      }
    };
    return { process, cleanToc, outlineTitle };
  }
  return __toCommonJS(core_exports);
})();
var CalloutStudioStatic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/web/static/index.ts
  var index_exports = {};
  __export(index_exports, {
    quartz: () => quartz
  });

  // src/web/static/liteDom.ts
  var ELEMENT_NODE = 1;
  var TEXT_NODE = 3;
  var OPAQUE_NODE = 8;
  var COMPOUND_RE = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)$/;
  var parsedSelectors = /* @__PURE__ */ new Map();
  function parseSelector(selector) {
    let compounds = parsedSelectors.get(selector);
    if (compounds) return compounds;
    compounds = selector.split(",").map((part) => {
      const match = COMPOUND_RE.exec(part.trim());
      if (!match || !match[1] && !match[2]) {
        throw new Error(`liteDom cannot match the selector "${part.trim()}"`);
      }
      return {
        tag: match[1] ? match[1].toLowerCase() : null,
        classes: match[2] ? match[2].slice(1).split(".") : []
      };
    });
    parsedSelectors.set(selector, compounds);
    return compounds;
  }
  var LiteNode = class {
    constructor() {
      this.parent = null;
    }
    get parentNode() {
      return this.parent;
    }
    get parentElement() {
      return this.parent;
    }
    get nextSibling() {
      var _a, _b;
      const siblings = (_a = this.parent) == null ? void 0 : _a.children;
      return siblings ? (_b = siblings[siblings.indexOf(this) + 1]) != null ? _b : null : null;
    }
    get ownerDocument() {
      return LITE_DOCUMENT;
    }
    remove() {
      var _a;
      const siblings = (_a = this.parent) == null ? void 0 : _a.children;
      if (!siblings) return;
      siblings.splice(siblings.indexOf(this), 1);
      this.parent = null;
    }
    replaceWith(node) {
      const parent = this.parent;
      if (!parent) return;
      parent.insertBefore(node, this);
      this.remove();
    }
  };
  var LiteText = class _LiteText extends LiteNode {
    constructor(data) {
      super();
      this.data = data;
      this.nodeType = TEXT_NODE;
      /**
       * How this text was spelled where it came from, and what `data` was then.
       * While `data` still equals `sourceData` the node is printed as `source`,
       * so untouched text keeps its own entities.
       */
      this.source = null;
      this.sourceData = null;
      /** `data` is already HTML (it holds entities this file does not decode). */
      this.verbatim = false;
      /** The HAST node this came from, handed back while the text is unchanged. */
      this.origin = void 0;
    }
    get textContent() {
      return this.data;
    }
    /** Cut the node at `offset`; the tail becomes the next sibling and is returned. */
    splitText(offset) {
      const tail = new _LiteText(this.data.slice(offset));
      tail.verbatim = this.verbatim;
      this.data = this.data.slice(0, offset);
      const parent = this.parent;
      if (parent) parent.insertBefore(tail, this.nextSibling);
      return tail;
    }
    cloneNode() {
      const copy = new _LiteText(this.data);
      copy.source = this.source;
      copy.sourceData = this.sourceData;
      copy.verbatim = this.verbatim;
      return copy;
    }
  };
  var LiteOpaque = class _LiteOpaque extends LiteNode {
    /** `raw` is HTML to print as it is; `origin` a HAST node to hand back. */
    constructor(raw, origin = void 0) {
      super();
      this.raw = raw;
      this.origin = origin;
      this.nodeType = OPAQUE_NODE;
    }
    get textContent() {
      return "";
    }
    cloneNode() {
      return new _LiteOpaque(this.raw, this.origin);
    }
  };
  var LiteElement = class _LiteElement extends LiteNode {
    constructor(name) {
      super();
      this.name = name;
      this.nodeType = ELEMENT_NODE;
      this.children = [];
      this.attrs = /* @__PURE__ */ new Map();
      /** Names set since the node was read; empty means "print it as it came". */
      this.changed = /* @__PURE__ */ new Set();
      /** The source's own tags, verbatim. `null` on an element built here. */
      this.open = null;
      this.close = null;
      this.selfClosing = false;
      /** The HAST element this came from. */
      this.origin = void 0;
      this.classList = {
        contains: (cls) => this.classNames().includes(cls),
        add: (...classes) => {
          const names = this.classNames();
          let grew = false;
          for (const cls of classes) {
            if (names.includes(cls)) continue;
            names.push(cls);
            grew = true;
          }
          if (grew) this.setAttribute("class", names.join(" "));
        }
      };
      this.tag = name.toLowerCase();
    }
    classNames() {
      var _a, _b;
      const value = (_b = (_a = this.attrs.get("class")) == null ? void 0 : _a.value) != null ? _b : "";
      return value.split(/\s+/).filter((cls) => cls !== "");
    }
    getAttribute(name) {
      var _a, _b;
      return (_b = (_a = this.attrs.get(name)) == null ? void 0 : _a.value) != null ? _b : null;
    }
    setAttribute(name, value) {
      this.attrs.set(name, { value });
      this.changed.add(name);
    }
    get firstChild() {
      var _a;
      return (_a = this.children[0]) != null ? _a : null;
    }
    get lastChild() {
      var _a;
      return (_a = this.children[this.children.length - 1]) != null ? _a : null;
    }
    get textContent() {
      let text = "";
      for (const child of this.children) text += child.textContent;
      return text;
    }
    set textContent(value) {
      for (const child of this.children) child.parent = null;
      this.children.length = 0;
      if (value !== "") this.appendChild(new LiteText(value));
    }
    appendChild(node) {
      return this.insertBefore(node, null);
    }
    insertBefore(node, reference) {
      node.remove();
      const at = reference ? this.children.indexOf(reference) : -1;
      if (at < 0) this.children.push(node);
      else this.children.splice(at, 0, node);
      node.parent = this;
      return node;
    }
    matches(selector) {
      for (const compound of parseSelector(selector)) {
        if (compound.tag !== null && compound.tag !== this.tag) continue;
        if (compound.classes.length > 0) {
          const names = this.classNames();
          if (!compound.classes.every((cls) => names.includes(cls))) continue;
        }
        return true;
      }
      return false;
    }
    closest(selector) {
      if (this.matches(selector)) return this;
      for (let el = this.parent; el; el = el.parent) {
        if (el.matches(selector)) return el;
      }
      return null;
    }
    querySelectorAll(selector) {
      const found = [];
      const visit = (el) => {
        for (const child of el.children) {
          if (!(child instanceof _LiteElement)) continue;
          if (child.matches(selector)) found.push(child);
          visit(child);
        }
      };
      visit(this);
      return found;
    }
    cloneNode(deep = false) {
      const copy = new _LiteElement(this.name);
      for (const [name, attr] of this.attrs) copy.attrs.set(name, { ...attr });
      for (const name of this.changed) copy.changed.add(name);
      copy.open = this.open;
      copy.close = this.close;
      copy.selfClosing = this.selfClosing;
      if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
      return copy;
    }
  };
  var TextWalker = class {
    constructor(root) {
      this.nodes = [];
      this.at = 0;
      const visit = (node) => {
        if (node instanceof LiteText) this.nodes.push(node);
        else if (node instanceof LiteElement) for (const child of node.children) visit(child);
      };
      if (root instanceof LiteElement) for (const child of root.children) visit(child);
    }
    nextNode() {
      var _a;
      return (_a = this.nodes[this.at++]) != null ? _a : null;
    }
  };
  var LITE_DOCUMENT = {
    createElement: (name) => new LiteElement(name),
    createTreeWalker: (root) => new TextWalker(root)
  };

  // src/web/static/htmlFragment.ts
  var VOID_TAGS = /* @__PURE__ */ new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr"
  ]);
  var RAW_TEXT_TAGS = /* @__PURE__ */ new Set(["script", "style", "textarea", "title"]);
  var OPEN_TAG_RE = /<([a-zA-Z][^\s>/]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
  var CLOSE_TAG_RE = /<\/([a-zA-Z][^\s>/]*)[^>]*>/y;
  var ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  var ENTITY_RE = /&(amp|lt|gt|quot|apos|#\d+|#[xX][0-9a-fA-F]+);/g;
  function decodeEntities(text) {
    return text.replace(ENTITY_RE, (whole, name) => {
      const named = ENTITIES[name];
      if (named !== void 0) return named;
      const code = /^#[xX]/.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
    });
  }
  function textNode(raw) {
    if (raw.indexOf("&") === -1) {
      const plain = new LiteText(raw);
      plain.source = raw;
      plain.sourceData = raw;
      return plain;
    }
    if (raw.replace(ENTITY_RE, "").indexOf("&") !== -1) {
      const kept = new LiteText(raw);
      kept.verbatim = true;
      return kept;
    }
    const decoded = new LiteText(decodeEntities(raw));
    decoded.source = raw;
    decoded.sourceData = decoded.data;
    return decoded;
  }
  function readAttributes(el, source) {
    var _a, _b, _c;
    ATTR_RE.lastIndex = 0;
    for (let match = ATTR_RE.exec(source); match !== null; match = ATTR_RE.exec(source)) {
      const name = (_a = match[1]) != null ? _a : "";
      const raw = (_c = (_b = match[2]) != null ? _b : match[3]) != null ? _c : match[4];
      if (name === "" || el.attrs.has(name)) continue;
      el.attrs.set(
        name,
        raw === void 0 ? { value: "" } : { value: decodeEntities(raw), raw: raw.replace(/"/g, "&quot;") }
      );
    }
  }
  function parseFragment(html) {
    var _a, _b, _c, _d;
    const root = new LiteElement("#fragment");
    const stack = [root];
    const top = () => {
      var _a2;
      return (_a2 = stack[stack.length - 1]) != null ? _a2 : root;
    };
    const length = html.length;
    let textFrom = 0;
    let at = 0;
    const flushText = (to) => {
      if (to > textFrom) top().appendChild(textNode(html.slice(textFrom, to)));
    };
    const opaque = (from, to) => {
      flushText(from);
      top().appendChild(new LiteOpaque(html.slice(from, to)));
      textFrom = at = to;
    };
    while (at < length) {
      const lt = html.indexOf("<", at);
      if (lt < 0) break;
      const next = html[lt + 1];
      if (next === "!" || next === "?") {
        const comment = html.startsWith("<!--", lt);
        const end = comment ? html.indexOf("-->", lt + 4) : html.indexOf(">", lt);
        opaque(lt, end < 0 ? length : end + (comment ? 3 : 1));
        continue;
      }
      if (next === "/") {
        CLOSE_TAG_RE.lastIndex = lt;
        const closing = CLOSE_TAG_RE.exec(html);
        if (!closing) {
          at = lt + 1;
          continue;
        }
        const tag = ((_a = closing[1]) != null ? _a : "").toLowerCase();
        let depth = stack.length - 1;
        while (depth > 0 && ((_b = stack[depth]) == null ? void 0 : _b.tag) !== tag) depth--;
        if (depth === 0) {
          opaque(lt, lt + closing[0].length);
          continue;
        }
        flushText(lt);
        const closed = stack[depth];
        if (closed) closed.close = closing[0];
        stack.length = depth;
        textFrom = at = lt + closing[0].length;
        continue;
      }
      OPEN_TAG_RE.lastIndex = lt;
      const opening = OPEN_TAG_RE.exec(html);
      if (!opening) {
        at = lt + 1;
        continue;
      }
      flushText(lt);
      const el = new LiteElement((_c = opening[1]) != null ? _c : "");
      const attrSource = (_d = opening[2]) != null ? _d : "";
      el.open = opening[0];
      el.close = "";
      el.selfClosing = /\/\s*$/.test(attrSource);
      readAttributes(el, el.selfClosing ? attrSource.replace(/\/\s*$/, "") : attrSource);
      top().appendChild(el);
      textFrom = at = lt + opening[0].length;
      if (el.selfClosing || VOID_TAGS.has(el.tag)) continue;
      if (RAW_TEXT_TAGS.has(el.tag)) {
        const end = html.toLowerCase().indexOf(`</${el.tag}`, at);
        const bodyEnd = end < 0 ? length : end;
        if (bodyEnd > at) {
          const body = new LiteText(html.slice(at, bodyEnd));
          body.verbatim = true;
          el.appendChild(body);
        }
        textFrom = at = bodyEnd;
        if (end >= 0) {
          CLOSE_TAG_RE.lastIndex = end;
          const closing = CLOSE_TAG_RE.exec(html);
          if (closing) {
            el.close = closing[0];
            textFrom = at = end + closing[0].length;
          }
        }
        continue;
      }
      stack.push(el);
    }
    flushText(length);
    return root;
  }
  function parseIconNodes(markup) {
    const nodes = [...parseFragment(markup).children];
    for (const node of nodes) node.remove();
    return nodes;
  }

  // src/web/static/hastBridge.ts
  var attrName = (property) => {
    if (property === "className") return "class";
    if (property === "htmlFor") return "for";
    if (/^(?:data|aria)[A-Z]/.test(property)) return property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    return property;
  };
  var propertyName = (attr) => {
    if (attr === "class") return "className";
    if (attr.startsWith("data-")) return attr.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    return attr;
  };
  var propertyValue = (attr, value) => attr === "class" ? value.split(/\s+/).filter((cls) => cls !== "") : value;
  function attrValue(value) {
    if (value === null || value === void 0 || value === false) return null;
    if (Array.isArray(value)) return value.map(String).join(" ");
    return typeof value === "string" ? value : String(value);
  }
  function read(node) {
    var _a, _b, _c;
    if (node.type === "text") {
      const text = new LiteText((_a = node.value) != null ? _a : "");
      text.sourceData = text.data;
      text.origin = node;
      return text;
    }
    if (node.type !== "element" || typeof node.tagName !== "string") return new LiteOpaque("", node);
    const el = new LiteElement(node.tagName);
    el.origin = node;
    for (const [property, raw] of Object.entries((_b = node.properties) != null ? _b : {})) {
      const value = attrValue(raw);
      if (value !== null) el.attrs.set(attrName(property), { value });
    }
    for (const child of (_c = node.children) != null ? _c : []) el.appendChild(read(child));
    return el;
  }
  function fromHast(tree) {
    var _a;
    const root = new LiteElement("#root");
    for (const child of (_a = tree.children) != null ? _a : []) root.appendChild(read(child));
    return root;
  }
  function write(node) {
    var _a, _b;
    if (node instanceof LiteText) {
      const origin2 = node.origin;
      if (origin2 && node.data === node.sourceData) return origin2;
      return { type: "text", value: node.verbatim ? decodeEntities(node.data) : node.data };
    }
    if (node instanceof LiteOpaque) return (_a = node.origin) != null ? _a : { type: "text", value: "" };
    const el = node;
    const children = el.children.map(write);
    const origin = el.origin;
    if (!origin) {
      const properties = {};
      for (const [name, attr] of el.attrs) properties[propertyName(name)] = propertyValue(name, attr.value);
      return { type: "element", tagName: el.name, properties, children };
    }
    origin.children = children;
    if (el.changed.size > 0) {
      const properties = (_b = origin.properties) != null ? _b : origin.properties = {};
      for (const name of el.changed) {
        const attr = el.attrs.get(name);
        if (attr) properties[propertyName(name)] = propertyValue(name, attr.value);
      }
    }
    return origin;
  }
  function toHast(root, tree) {
    tree.children = root.children.map(write);
  }
  function hastHasText(tree, needle) {
    var _a, _b;
    if (tree.type === "text") return ((_a = tree.value) != null ? _a : "").indexOf(needle) !== -1;
    for (const child of (_b = tree.children) != null ? _b : []) if (hastHasText(child, needle)) return true;
    return false;
  }

  // src/web/static/quartzNote.ts
  var QUARTZ_NOTE_KEY = "callout-studio-quartz";
  var QUARTZ_NOTE_NAME = `${QUARTZ_NOTE_KEY}.md`;

  // src/web/static/webNote.ts
  var FINGERPRINT_PREFIX = "sha256:";
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function decodeBase64(text) {
    if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
    const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    const bytes = new Uint8Array(text.length / 4 * 3 - padding);
    let at = 0;
    for (let i = 0; i < text.length; i += 4) {
      const n = ALPHABET.indexOf(text.charAt(i)) << 18 | ALPHABET.indexOf(text.charAt(i + 1)) << 12 | (Math.max(ALPHABET.indexOf(text.charAt(i + 2)), 0) & 63) << 6 | Math.max(ALPHABET.indexOf(text.charAt(i + 3)), 0) & 63;
      if (at < bytes.length) bytes[at++] = n >> 16 & 255;
      if (at < bytes.length) bytes[at++] = n >> 8 & 255;
      if (at < bytes.length) bytes[at++] = n & 255;
    }
    return bytes;
  }
  var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var noteFenceRe = (key) => new RegExp(`^(\`{3,}|~{3,})[ \\t]*${escapeRegExp(key)}[ \\t]*$`);
  function readNoteBody(key, body) {
    var _a, _b, _c;
    const lines = body.split(/\r?\n/);
    const opener = noteFenceRe(key);
    const open = lines.findIndex((line) => opener.test(line));
    if (open < 0) return null;
    const fence = (_c = (_b = /^(`{3,}|~{3,})/.exec((_a = lines[open]) != null ? _a : "")) == null ? void 0 : _b[1]) != null ? _c : "```";
    const close = lines.findIndex((line, i) => i > open && line.trim() === fence);
    if (close < 0) return null;
    const [first = "", ...rest] = lines.slice(open + 1, close).map((line) => line.trim());
    if (!first.startsWith(FINGERPRINT_PREFIX)) return null;
    const fingerprint = first.slice(FINGERPRINT_PREFIX.length);
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) return null;
    const bytes = decodeBase64(rest.join(""));
    if (!bytes) return null;
    try {
      return { json: new TextDecoder("utf-8", { fatal: true }).decode(bytes), fingerprint };
    } catch (e) {
      return null;
    }
  }
  function splitFrontmatter(text) {
    const open = /^---[ \t]*\r?\n/.exec(text);
    if (!open) return { frontmatter: null, body: text };
    const close = /^---[ \t]*(\r?\n|$)/m;
    const rest = text.slice(open[0].length);
    const end = close.exec(rest);
    if (!end) return { frontmatter: null, body: text };
    const cut = open[0].length + end.index + end[0].length;
    const frontmatter = text.slice(0, cut);
    return { frontmatter: frontmatter.endsWith("\n") ? frontmatter : `${frontmatter}
`, body: text.slice(cut) };
  }

  // src/web/static/quartz.ts
  var DEFAULT_DIRECTORY = "content";
  var FORMAT = 1;
  var WHERE = "Settings → Callout Studio → Publish to the web → Quartz";
  function styleElement(css) {
    return {
      type: "style",
      props: { dangerouslySetInnerHTML: { __html: css.replace(/<\//g, "<\\/") } },
      key: null,
      ref: null,
      constructor: void 0
    };
  }
  function listNotes(node, root) {
    const notes = [];
    const seen = /* @__PURE__ */ new Set();
    const walk = (folder, rel) => {
      try {
        const real = node.fs.realpathSync(folder);
        if (seen.has(real)) return;
        seen.add(real);
      } catch (e) {
        return;
      }
      let entries;
      try {
        entries = node.fs.readdirSync(folder, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const file = node.path.join(folder, entry.name);
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        let folderHere = entry.isDirectory();
        let fileHere = entry.isFile();
        if (entry.isSymbolicLink()) {
          try {
            const stat = node.fs.statSync(file);
            folderHere = stat.isDirectory();
            fileHere = stat.isFile();
          } catch (e) {
            continue;
          }
        }
        if (folderHere) walk(file, path);
        else if (fileHere && /\.md$/i.test(entry.name)) notes.push({ rel: path, file });
      }
    };
    walk(root, "");
    return notes;
  }
  var nameOf = (rel) => {
    var _a;
    return ((_a = rel.split("/").pop()) != null ? _a : rel).toLowerCase();
  };
  var byPreference = (a, b) => a === QUARTZ_NOTE_NAME ? -1 : b === QUARTZ_NOTE_NAME ? 1 : a < b ? -1 : a > b ? 1 : 0;
  var carriesData = (text) => {
    if (!text.includes(QUARTZ_NOTE_KEY)) return false;
    const opener = noteFenceRe(QUARTZ_NOTE_KEY);
    return splitFrontmatter(text).body.split(/\r?\n/).some((line) => opener.test(line));
  };
  function quartz(core, node) {
    const findNotes = (directory) => {
      const all = listNotes(node, directory);
      const read2 = (note) => {
        try {
          return { ...note, text: node.fs.readFileSync(note.file, "utf8") };
        } catch (e) {
          return null;
        }
      };
      const named = all.filter((note) => nameOf(note.rel) === QUARTZ_NOTE_NAME);
      const keep = (notes) => notes.map(read2).filter((note) => note !== null && carriesData(note.text));
      const byName = keep(named);
      const found = byName.length > 0 ? byName : keep(all.filter((note) => !named.includes(note)));
      return found.sort((a, b) => byPreference(a.rel, b.rel));
    };
    const load = (ctx) => {
      var _a;
      const directory = (((_a = ctx == null ? void 0 : ctx.argv) == null ? void 0 : _a.directory) || DEFAULT_DIRECTORY).replace(/[\\/]+$/, "");
      const found = findNotes(directory);
      const notes = new Set(found.map((note) => note.rel));
      const [first, ...others] = found;
      const asText = (file2, why, more = []) => ({
        data: null,
        file: file2,
        notes,
        warnings: [`${why} Heading and inline callouts stay as text.`, ...more]
      });
      if (!first) {
        return asText(
          directory,
          `No note with Callout Studio's callouts was found in ${directory}. In Obsidian, create it from ${WHERE}, then publish it as you do your other notes.`
        );
      }
      const file = `${directory}/${first.rel}`;
      const twice = others.length > 0 ? [
        `More than one note carries Callout Studio's callouts. Using ${file}; delete ${others.map((note) => `${directory}/${note.rel}`).join(", ")}.`
      ] : [];
      const edited = `${file} was changed by hand and cannot be read. In Obsidian, select Update now in ${WHERE}, then publish the note again if a plugin publishes your notes.`;
      const block = readNoteBody(QUARTZ_NOTE_KEY, splitFrontmatter(first.text).body);
      if (!block) return asText(file, edited, twice);
      const fingerprint = node.crypto.createHash("sha256").update(block.json, "utf8").digest("hex");
      if (fingerprint !== block.fingerprint) return asText(file, edited, twice);
      let data;
      try {
        data = JSON.parse(block.json);
      } catch (e) {
        return asText(file, edited, twice);
      }
      if (typeof data.version === "number" && data.version > FORMAT) {
        return asText(
          file,
          `${file} was written by a newer Callout Studio. Update the Callout Studio Quartz plugin.`,
          twice
        );
      }
      if (data.version !== FORMAT || !Array.isArray(data.defs)) return asText(file, edited, twice);
      return { data, file, notes, warnings: twice };
    };
    const safely = (ctx) => {
      var _a;
      try {
        return load(ctx);
      } catch (error) {
        const file = ((_a = ctx == null ? void 0 : ctx.argv) == null ? void 0 : _a.directory) || DEFAULT_DIRECTORY;
        return { data: null, file, notes: /* @__PURE__ */ new Set(), warnings: [`Could not start (${String(error)}).`] };
      }
    };
    const relOf = (file, ctx) => {
      var _a;
      const data = file == null ? void 0 : file.data;
      if (typeof (data == null ? void 0 : data.relativePath) === "string") return data.relativePath.replace(/\\/g, "/");
      const onDisk = typeof (data == null ? void 0 : data.filePath) === "string" ? data.filePath : typeof (file == null ? void 0 : file.path) === "string" ? file.path : null;
      if (onDisk === null) return null;
      return node.path.relative(((_a = ctx == null ? void 0 : ctx.argv) == null ? void 0 : _a.directory) || DEFAULT_DIRECTORY, onDisk).replace(/\\/g, "/");
    };
    const keepOff = (file) => {
      var _a, _b, _c;
      const data = (_a = file.data) != null ? _a : file.data = {};
      const frontmatter = data.frontmatter && typeof data.frontmatter === "object" ? data.frontmatter : data.frontmatter = {};
      frontmatter.draft = true;
      frontmatter.publish = false;
      (_c = frontmatter[_b = QUARTZ_NOTE_KEY]) != null ? _c : frontmatter[_b] = FORMAT;
    };
    const transformWith = (data) => {
      const renderer = core.createWebRenderer(data, {
        parseIcon: (markup) => parseIconNodes(markup)
      });
      let warned = false;
      return (tree, file) => {
        var _a, _b;
        const toc = (_a = file == null ? void 0 : file.data) == null ? void 0 : _a.toc;
        if (Array.isArray(toc)) {
          for (const entry of toc) {
            if (typeof entry.text !== "string") continue;
            const cleaned = renderer.outlineTitle(entry.text);
            if (cleaned !== null) entry.text = cleaned;
          }
        }
        if (!hastHasText(tree, "[!")) return;
        if (!warned && typeof ((_b = file == null ? void 0 : file.data) == null ? void 0 : _b.text) === "string") {
          warned = true;
          console.warn(
            "[Callout Studio] runs after the Description plugin, so search and RSS text still show [!id]. Move it before Description (Quartz 4: earlier in `transformers`; Quartz 5: a lower `order`)."
          );
        }
        const root = fromHast(tree);
        renderer.process(root);
        toHast(root, tree);
      };
    };
    return () => ({
      name: "CalloutStudio",
      // Quiet: it runs in every worker. The build log hears it once, from
      // `externalResources`, which Quartz asks once for the pages.
      htmlPlugins: (ctx) => {
        const { data, notes } = safely(ctx);
        const draw = data ? transformWith(data) : null;
        return [
          () => (tree, file) => {
            const rel = relOf(file, ctx);
            if (file && rel !== null && notes.has(rel)) {
              keepOff(file);
              return;
            }
            draw == null ? void 0 : draw(tree, file);
          }
        ];
      },
      externalResources: (ctx) => {
        const { data, warnings } = safely(ctx);
        for (const warning of warnings) console.warn(`[Callout Studio] ${warning}`);
        return {
          css: [],
          js: [],
          additionalHead: (data == null ? void 0 : data.css) ? [styleElement(data.css)] : []
        };
      },
      // Quartz 5 only: the transformer above has marked the note by its property.
      shouldPublish: (_ctx, [, file]) => {
        var _a;
        const frontmatter = (_a = file == null ? void 0 : file.data) == null ? void 0 : _a.frontmatter;
        return !(frontmatter && typeof frontmatter === "object" && QUARTZ_NOTE_KEY in frontmatter);
      }
    });
  }
  return __toCommonJS(index_exports);
})();
export const CalloutStudio = CalloutStudioStatic.quartz(CalloutStudioCore, { fs, path, crypto });
export default CalloutStudio;
