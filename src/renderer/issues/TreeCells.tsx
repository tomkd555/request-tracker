import type { TreeRow } from "./groupByParent";

const INDENT_PX_PER_LEVEL = 16;

/** The キー cell of a tree row: indent per level, 「└」 on a child (issues.css), the fold toggle on a parent, then `children` (the key). */
export function TreeKeyCell({ row, onToggle, children }: { row: TreeRow; onToggle(key: string): void; children: React.ReactNode }): React.JSX.Element {
  return (
    <td className="issue-table__cell issue-table__cell--key" style={row.depth > 0 ? { paddingLeft: `calc(var(--space-2) + ${row.depth * INDENT_PX_PER_LEVEL}px)` } : undefined}>
      {row.hasChildren ? (
        <button
          type="button"
          className="issue-table__toggle"
          aria-label={row.collapsed ? "開く" : "折りたたむ"}
          aria-expanded={!row.collapsed}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.issue.key);
          }}
        >
          {row.collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="issue-table__toggle" aria-hidden="true" />
      )}
      {children}
    </td>
  );
}

/** 「3/5」 on a parent: descendants done out of all its descendants. */
export function ProgressCount({ count }: { count: { done: number; total: number } | undefined }): React.JSX.Element | null {
  if (count === undefined) return null;
  return (
    <span className="issue-table__count" title={`配下の課題 ${count.total}件のうち${count.done}件が完了`}>
      {count.done}/{count.total}
    </span>
  );
}
