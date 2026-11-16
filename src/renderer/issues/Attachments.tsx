import { useCallback, useEffect, useState } from "react";
import type { AttachmentOwner } from "../../shared/api";
import type { Attachment } from "../../shared/types";
import { formatDateTime } from "./labels";
import { errorMessage, M, refusalMessages } from "../messages";

const KIB = 1024;
const MIB = KIB * 1024;

function formatSize(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / KIB).toFixed(0)} KB`;
  return `${(bytes / MIB).toFixed(1)} MB`;
}

/** Files of an issue or a wiki page: list, add by drop or picker, open, remove. */
export function Attachments({ owner }: { owner: AttachmentOwner }): React.JSX.Element {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const { kind, id } = owner;

  const load = useCallback(async () => setAttachments(await window.api.attachments.list({ kind, id })), [kind, id]);
  useEffect(() => {
    void load();
  }, [load]);

  /** `paths` null lets the main process show the file picker. */
  const add = async (paths: string[] | null): Promise<void> => {
    setMessages([]);
    try {
      const result = await window.api.attachments.add(owner, paths);
      setMessages(refusalMessages(result));
      await load();
    } catch (e) {
      setMessages([errorMessage(e)]);
    }
  };

  const openAttachment = async (name: string): Promise<void> => {
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
      {attachments.length === 0 ? (
        <p className="text--muted">{M.noAttachments}</p>
      ) : (
        <table className="attachments__table">
          <tbody>
            {attachments.map((a) => (
              <tr key={a.name}>
                <td className="attachments__cell">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      void openAttachment(a.name);
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
