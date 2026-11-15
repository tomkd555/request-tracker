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

/**
 * Hands out element ids for one rendering: the first heading with an id keeps it, a repeat gets `-1`, `-2` and so on.
 * `key` (the heading's offset in the source) makes a second render of the same heading return the same id.
 */
export function makeIdAllocator(): (id: string, key?: number) => string {
  const used = new Set<string>();
  const byKey = new Map<number, string>();
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
