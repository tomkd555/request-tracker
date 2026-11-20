import { isValidElement, type ReactNode } from "react";
import { defaultUrlTransform } from "react-markdown";

/**
 * The URL a link or an image in rendered Markdown keeps: what react-markdown keeps by default, less a network path.
 * `//host/x.png`, written with slashes or backslashes, resolves against the app's file: document to `file://host/x.png`;
 * shown as an image, it makes the PC of everyone who opens the text connect to that host over SMB.
 */
export function markdownUrl(url: string): string {
  const kept = defaultUrlTransform(url);
  // A URL parser drops leading spaces and control characters, and every tab and line break, before it reads the slashes.
  const asParsed = kept.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
  return /^[\\/]{2}/.test(asParsed) ? "" : kept;
}

// A link to `#something` that is not a route of the app (routes start with `#/`) points at an element of the document.

/** The element id an in-document link points at, or null for any other href. */
export function anchorTarget(href: string | undefined): string | null {
  if (href === undefined || !href.startsWith("#") || href.startsWith("#/") || href === "#") return null;
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

const textOf = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
};

/** The id a rendered heading gets, so a link or a table of contents can point at it: its text with spaces as hyphens. */
export const headingIdOf = (children: ReactNode): string => textOf(children).trim().replace(/\s+/g, "-");

/**
 * Hands out element ids for one rendering: the first heading with an id keeps it, a repeat gets `-1`, `-2` and so on.
 * `key` (the heading's place in the source) makes a second render of the same heading return the same id.
 */
export function makeIdAllocator(): (id: string, key?: number | string) => string {
  const used = new Set<string>();
  const byKey = new Map<number | string, string>();
  return (id, key) => {
    const known = key === undefined ? undefined : byKey.get(key);
    if (known !== undefined) return known;
    let out = id;
    for (let n = 1; used.has(out); n++) out = `${id}-${n}`;
    used.add(out);
    if (key !== undefined) byKey.set(key, out);
    return out;
  };
}

/** Props for an `<a>` in rendered Markdown: in-document links scroll in place, links out of the app open in a new window. */
export function linkProps(href: string | undefined): { target?: string; onClick?: (e: { preventDefault: () => void }) => void } {
  if (href === undefined || !href.startsWith("#")) return { target: "_blank" };
  const id = anchorTarget(href);
  if (id === null) return {};
  return {
    onClick: (e) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView();
    },
  };
}
