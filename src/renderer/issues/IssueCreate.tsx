import { useState } from "react";
import type { IssueDraft } from "../../shared/api";
import { ISSUE_PRIORITIES, type CustomField, type IssuePriority } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { categoryOptions, useSession, withCurrent } from "../app/UserContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { messageFor, refusalMessages } from "./attachmentMessages";
import { MarkdownEditor } from "./FieldEditor";
import { PRIORITY_LABEL } from "./labels";
import { LabelPicker } from "./LabelPicker";
import { ParentField } from "./ParentField";
import { useIssues } from "./useIssues";

interface Props {
  parentKey: string | null;
  /** Key of an issue whose fields prefill the form (複製). */
  copyFrom: string | null;
}

export function IssueCreate(props: Props): React.JSX.Element {
  const { loaded } = useIssues();
  // The copy source is read once into form state, so the form mounts only after the issue map is loaded.
  if (!loaded) return <div className="text--loading">読み込み中</div>;
  return <IssueForm {...props} />;
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** One 汎用列 in the attribute grid: a text input, or a select when the column has options. */
function FieldRow({ field, value, onChange }: { field: CustomField; value: string; onChange(v: string): void }): React.JSX.Element {
  const id = `new-field-${field.id}`;
  return (
    <>
      <label htmlFor={id} className="issue-form__term">
        {field.name}
      </label>
      <div className="issue-form__cell">
        {field.options.length === 0 ? (
          <input id={id} className="issue-form__control" value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <select id={id} className="issue-form__control" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">未設定</option>
            {withCurrent(field.options, value).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}

function IssueForm({ parentKey, copyFrom }: Props): React.JSX.Element {
  const { me, users, project } = useSession();
  const { byKey, issues, refreshOne } = useIssues();
  const source = copyFrom !== null ? byKey.get(copyFrom) : undefined;
  const templates = project.categoryTemplates;
  const initialCategory = source?.category || (project.categories[0] ?? "");
  const initialSummary = source?.summary ?? templates[initialCategory]?.summary ?? "";
  const initialDescription = source?.description ?? templates[initialCategory]?.body ?? "";
  const [category, setCategory] = useState(initialCategory);
  const [summary, setSummary] = useState(initialSummary);
  const [description, setDescription] = useState(initialDescription);
  const [priority, setPriority] = useState<IssuePriority>(source?.priority ?? "normal");
  const [labels, setLabels] = useState<string[]>(source?.labels ?? []);
  const [assignee, setAssignee] = useState<string>(source?.assignee ?? "");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fields, setFields] = useState<Record<string, string>>(source?.fields ?? {});
  const [parent, setParent] = useState<string | null>(parentKey ?? source?.parentKey ?? null);
  const [parentInvalid, setParentInvalid] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parents = issues.filter((i) => i.parentKey === null).sort((a, b) => (a.key < b.key ? 1 : -1));
  const presetParent = parentKey !== null ? byKey.get(parentKey) : undefined;
  const template = templates[category];
  const templateApplied = template !== undefined && summary === template.summary && description === template.body;
  const pristine = (summary === initialSummary && description === initialDescription) || templateApplied;
  useNavigationGuard(!busy && (!pristine || paths.length > 0));
  const summaryMissing = summary.trim() === "";
  const datesReversed = startDate !== "" && dueDate !== "" && dueDate < startDate;
  const blocked = summaryMissing || datesReversed || parentInvalid;

  const applyTemplate = (t: { summary: string; body: string }): void => {
    setSummary(t.summary);
    setDescription(t.body);
  };
  const changeCategory = (next: string): void => {
    setCategory(next);
    const t = templates[next];
    const untouched = (summary === "" || templateApplied) && (description === "" || templateApplied);
    if (t !== undefined && untouched) applyTemplate(t);
  };

  const submit = async (again: boolean): Promise<void> => {
    setSubmitted(true);
    setMessages([]);
    setCreated(null);
    if (blocked) return;
    setBusy(true);
    const now = new Date().toISOString();
    const draft: IssueDraft = {
      summary: summary.trim(),
      description,
      category,
      status: "open",
      priority,
      labels,
      assignee: assignee || null,
      reporter: me.username,
      parentKey: parent,
      startDate: startDate || null,
      dueDate: dueDate || null,
      createdAt: now,
      updatedAt: now,
      updatedBy: me.username,
      fields,
      relations: [],
    };
    try {
      const issue = await window.api.issues.create(draft);
      await refreshOne(issue.key);
      const notes: string[] = [];
      if (paths.length > 0) {
        try {
          notes.push(...refusalMessages(await window.api.attachments.add({ kind: "issue", id: issue.key }, paths)));
        } catch (e) {
          notes.push(messageFor(e));
        }
      }
      if (again || notes.length > 0) {
        setCreated(issue.key);
        setMessages(notes);
        setSummary(template?.summary ?? "");
        setDescription(template?.body ?? "");
        setPaths([]);
        setSubmitted(false);
        setBusy(false);
        return;
      }
      navigate(`/issues/${issue.key}`);
    } catch (err) {
      setMessages([err instanceof Error ? err.message : String(err)]);
      setBusy(false);
    }
  };

  const choose = async (): Promise<void> => {
    const chosen = await window.api.attachments.choose();
    if (chosen) setPaths((p) => [...p, ...chosen.filter((c) => !p.includes(c))]);
  };

  return (
    <form
      className="issue-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy) {
          e.preventDefault();
          void submit(false);
        }
      }}
    >
      <h1>{parentKey ? "子課題の追加" : "課題の追加"}</h1>
      {created && (
        <p className="issue-form__created">
          <a href={`#/issues/${created}`}>{created}</a> を追加しました
        </p>
      )}
      <div className="issue-form__row">
        <label className="issue-form__field issue-form__field--short">
          種別
          <select className="issue-form__control" value={category} onChange={(e) => changeCategory(e.target.value)}>
            {categoryOptions(project, category).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {template !== undefined && !templateApplied && (
          <button type="button" className="button--quiet" onClick={() => applyTemplate(template)}>
            ひな形を読み込む
          </button>
        )}
      </div>
      <div className="issue-form__field">
        <span className="issue-form__label">ラベル</span>
        <LabelPicker project={project} value={labels} onChange={setLabels} />
      </div>
      <label className="issue-form__field">
        件名
        <input
          className="issue-form__control"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          aria-invalid={submitted && summaryMissing}
          autoFocus
        />
        {submitted && summaryMissing && <span className="issue-form__error">件名を入力してください</span>}
      </label>
      <div className="issue-form__field">
        <span className="issue-form__label">詳細</span>
        <MarkdownEditor value={description} onChange={setDescription} preview={(v) => <Markdown source={v} />} rows={12} ariaLabel="詳細" />
      </div>
      <div className="issue-form__grid">
        <label htmlFor="new-priority" className="issue-form__term">
          優先度
        </label>
        <div className="issue-form__cell">
          <select id="new-priority" className="issue-form__control" value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)}>
            {ISSUE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor="new-start" className="issue-form__term">
          開始日
        </label>
        <div className="issue-form__cell">
          <input id="new-start" className="issue-form__control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <label htmlFor="new-assignee" className="issue-form__term">
          担当者
        </label>
        <div className="issue-form__cell issue-form__cell--with-link">
          <select id="new-assignee" className="issue-form__control" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">未設定</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.displayName}
              </option>
            ))}
          </select>
          {assignee !== me.username && (
            <button type="button" className="button--link" onClick={() => setAssignee(me.username)}>
              自分にする
            </button>
          )}
        </div>
        <label htmlFor="new-due" className="issue-form__term">
          期限日
        </label>
        <div className="issue-form__cell">
          <input
            id="new-due"
            className="issue-form__control"
            type="date"
            value={dueDate}
            min={startDate || undefined}
            aria-invalid={datesReversed}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {datesReversed && <span className="issue-form__error">期限日は開始日以降にしてください</span>}
        </div>
        <label htmlFor="new-parent" className="issue-form__term">
          親課題
        </label>
        <div className="issue-form__cell issue-form__cell--wide">
          {presetParent ? (
            <input id="new-parent" className="issue-form__control" value={`${presetParent.key} ${presetParent.summary}`} readOnly />
          ) : (
            <ParentField
              value={parent}
              candidates={parents}
              commitOn="change"
              className="issue-form__control"
              ariaLabel="親課題"
              onChange={(key, invalid) => {
                setParent(key);
                setParentInvalid(invalid);
              }}
            />
          )}
          {parentInvalid && <span className="issue-form__error">該当する課題がありません</span>}
        </div>
        {project.fields.map((f) => (
          <FieldRow key={f.id} field={f} value={fields[f.id] ?? ""} onChange={(v) => setFields((x) => ({ ...x, [f.id]: v }))} />
        ))}
      </div>
      <div
        className="issue-form__field attachments"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f));
          setPaths((p) => [...p, ...dropped.filter((d) => !p.includes(d))]);
        }}
      >
        <div className="issue-form__row">
          <span className="issue-form__label">添付ファイル</span>
          <button type="button" onClick={() => void choose()}>
            ファイルを選ぶ
          </button>
        </div>
        {paths.length === 0 ? (
          <p className="issue-form__dropzone">ここにファイルをドロップ</p>
        ) : (
          <ul className="issue-form__files">
            {paths.map((p) => (
              <li key={p} className="issue-form__file">
                <span>{fileName(p)}</span>
                <button type="button" className="button--link" onClick={() => setPaths((x) => x.filter((y) => y !== p))}>
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {messages.map((m) => (
        <p key={m} className="text--error">
          {m}
        </p>
      ))}
      <div className="form-actions">
        <button type="submit" className="button--primary" disabled={busy}>
          追加
        </button>
        <button type="button" disabled={busy} onClick={() => void submit(true)}>
          追加して続ける
        </button>
        <button type="button" onClick={() => navigate(parentKey ? `/issues/${parentKey}` : "/issues")}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
