import type { IssuePriority, IssueStatus } from "../../shared/types";

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "未対応",
  in_progress: "処理中",
  resolved: "処理済み",
  closed: "完了",
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = { high: "高", normal: "中", low: "低" };

export const formatDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : "");
export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
