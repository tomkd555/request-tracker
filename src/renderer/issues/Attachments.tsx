import { useCallback, useEffect, useState } from "react";
import type { AttachmentOwner } from "../../shared/api";
import type { Attachment } from "../../shared/types";
import { formatDateTime } from "./labels";
import { errorMessage, M, refusalMessages } from "../messages";

const formatSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Files of an issue or a wiki page: list, add by drop or picker, open, remove. */
export function Attachments({ owner }: { owner: AttachmentOwner }): React.JSX.Element {
  const [items, setItems] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const { kind, id } = owner;

  const load = useCallback(async () => setItems(await window.api.attachments.list({ kind, id })), [kind, id]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (paths: string[] | null): Promise<void> => {
    setMessages([]);
    try {
      const r = await window.api.attachments.add(owner, paths);
      setMessages(refusalMessages(r));
      await load();
    } catch (e) {
      setMessages([errorMessage(e)]);
    }
  };

  const open = async (name: string): Promise<void> => {
    try {
      await window.api.attachments.open(owner, name);
    } catch (e) {
      setMessages([errorMessage(e)]);
    }
  };

  const remove = async (name: string): Promise<void> => {
    if (!window.confirm(M.confirmDelete(name))) return;
    try {
      await window.api.attachments.remove(owner, name);
      await load();
    } catch (e) {
      setMessages([errorMessage(e)]);
    }
  };

  return (
    <section
      className={`attachments${dragging ? " attachments--dragging" : ""}`}
      aria-label="添付ファイル"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f));
        if (paths.length) void add(paths);
      }}
    >
      <div className="section-head">
        <h2>添付ファイル</h2>
        <div className="form-actions">
          <button type="button" onClick={() => void add(null)}>
            追加
          </button>
          <button type="button" onClick={() => window.api.attachments.openFolder(owner).catch((e) => setMessages([errorMessage(e)]))}>
            フォルダを開く
          </button>
        </div>
      </div>
      {messages.map((m) => (
        <p key={m} className="text--error">
          {m}
        </p>
      ))}
      {items.length === 0 ? (
        <p className="text--muted">{M.noAttachments}</p>
      ) : (
        <table className="attachments__table">
          <tbody>
            {items.map((a) => (
              <tr key={a.name}>
                <td className="attachments__cell">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      void open(a.name);
                    }}
                  >
                    {a.kind === "folder" ? "📁 " : ""}
                    {a.name}
                  </a>
                </td>
                <td className="attachments__cell text--muted">{a.size === null ? "" : formatSize(a.size)}</td>
                <td className="attachments__cell text--muted">{formatDateTime(a.addedAt)}</td>
                <td className="attachments__cell">
                  <button type="button" onClick={() => void remove(a.name)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
