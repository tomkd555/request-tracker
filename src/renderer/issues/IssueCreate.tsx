import { useState } from "react";
import type { IssueDraft } from "../../shared/api";
import { depthOf, MAX_DEPTH } from "../../shared/issueTree";
import { ISSUE_PRIORITIES, type CustomField, type IssuePriority } from "../../shared/types";
import { Markdown } from "../app/Markdown";
import { showToast } from "../app/toast";
import { categoryOptions, useSession, withCurrent } from "../app/SessionContext";
import { navigate, useNavigationGuard } from "../app/useHashRoute";
import { AssigneeSelect } from "./AssigneeSelect";
import { byKeyDesc } from "./compareKeys";
import { DESCRIPTION_ROWS, MarkdownEditor } from "./FieldEditor";
import { formatHours, parseHours } from "./hours";
import { firstOfKind, PRIORITY_LABEL } from "./labels";
import { LabelPicker } from "./LabelPicker";
import { selectableMilestones } from "./milestones";
import { ParentField } from "./ParentField";
import { useIssues } from "./useIssues";
import { errorMessage, fileName, M, refusalMessages } from "../messages";

interface Props {
  parentKey: string | null;
  /** Key of an issue whose fields prefill the form (複製). */
  copyFrom: string | null;
}

export function IssueCreate(props: Props): React.JSX.Element {
  const { isLoaded } = useIssues();
  // The copy source is read once into form state, so the form mounts only after the issue map is loaded.
  if (!isLoaded) return <div className="text--loading">読み込み中</div>;
  return <IssueForm {...props} />;
}


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
  const { me, project } = useSession();
  const { byKey, issues, refreshOne } = useIssues();
  const copySource = copyFrom !== null ? byKey.get(copyFrom) : undefined;
  const templates = project.categoryTemplates;
  const initialCategory = copySource?.category || (project.categories[0] ?? "");
  const initialSummary = copySource?.summary ?? templates[initialCategory]?.summary ?? "";
  const initialDescription = copySource?.description ?? templates[initialCategory]?.body ?? "";
  const [category, setCategory] = useState(initialCategory);
  const [summary, setSummary] = useState(initialSummary);
  const [description, setDescription] = useState(initialDescription);
  // The text the form started from, or was reset to after 追加して続ける; the leave guard compares against it.
  const [startingText, setStartingText] = useState({ summary: initialSummary, description: initialDescription });
  const [priority, setPriority] = useState<IssuePriority>(copySource?.priority ?? "normal");
  const [labels, setLabels] = useState<string[]>(copySource?.labels ?? []);
  const [assignee, setAssignee] = useState<string>(copySource?.assignee ?? "");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const openMilestones = selectableMilestones(project.milestones ?? [], null);
  // A copy keeps the source's milestone only while it is open.
  const [milestone, setMilestone] = useState<string>(openMilestones.some((m) => m.id === copySource?.milestone) ? (copySource?.milestone ?? "") : "");
  const [estimatedText, setEstimatedText] = useState(formatHours(copySource?.estimatedHours));
  const [fields, setFields] = useState<Record<string, string>>(copySource?.fields ?? {});
  const [parent, setParent] = useState<string | null>(parentKey ?? copySource?.parentKey ?? null);
  const [parentInvalid, setParentInvalid] = useState(false);
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parentCandidates = issues.filter((i) => depthOf(byKey, i.key) < MAX_DEPTH).sort(byKeyDesc);
  const presetParent = parentKey !== null ? byKey.get(parentKey) : undefined;
  const template = templates[category];
  const templateApplied = template !== undefined && summary === template.summary && description === template.body;
  const isTextUntouched = (summary === startingText.summary && description === startingText.description) || templateApplied;
  useNavigationGuard(!busy && (!isTextUntouched || attachmentPaths.length > 0));
  const summaryMissing = summary.trim() === "";
  const datesReversed = startDate !== "" && dueDate !== "" && dueDate < startDate;
  const parentMissing = parent !== null && !byKey.has(parent); // from ?parent= or a copied issue, deleted since
  const estimated = parseHours(estimatedText);
  const isSubmitBlocked = summaryMissing || datesReversed || parentInvalid || parentMissing || !estimated.ok;

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

  const submit = async (stayOnForm: boolean): Promise<void> => {
    setSubmitted(true);
    setMessages([]);
    setCreatedKey(null);
    if (isSubmitBlocked) return;
    setBusy(true);
    try {
      if (parent !== null && (await window.api.issues.get(parent)) === null) {
        await refreshOne(parent); // drops it from the list, which shows parentNotFound
        setBusy(false);
        return;
      }
    } catch (err) {
      setMessages([errorMessage(err)]);
      setBusy(false);
      return;
    }
    const now = new Date().toISOString();
    const draft: IssueDraft = {
      summary: summary.trim(),
      description,
      category,
      status: (firstOfKind(project.statuses, "active") ?? project.statuses[0]).id,
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
      milestone: milestone || null,
      estimatedHours: estimated.ok ? estimated.value : null,
      actualHours: null,
    };
    try {
      const issue = await window.api.issues.create(draft);
      await refreshOne(issue.key);
      const notes: string[] = [];
      if (attachmentPaths.length > 0) {
        try {
          notes.push(...refusalMessages(await window.api.attachments.add({ kind: "issue", id: issue.key }, attachmentPaths)));
        } catch (e) {
          notes.push(errorMessage(e));
        }
      }
      if (stayOnForm || notes.length > 0) {
        const reset = { summary: template?.summary ?? "", description: template?.body ?? "" };
        setCreatedKey(issue.key);
        setMessages(notes);
        setSummary(reset.summary);
        setDescription(reset.description);
        setStartingText(reset);
        setAttachmentPaths([]);
        setSubmitted(false);
        setBusy(false);
        return;
      }
      showToast(M.issueAdded(issue.key));
      navigate(`/issues/${issue.key}`);
    } catch (err) {
      setMessages([errorMessage(err)]);
      setBusy(false);
    }
  };

  const addPaths = (more: string[]): void => setAttachmentPaths((p) => [...p, ...more.filter((x) => !p.includes(x))]);

  const chooseAttachments = async (): Promise<void> => {
    try {
      const chosen = await window.api.attachments.choose();
      if (chosen) addPaths(chosen);
    } catch (e) {
      setMessages([errorMessage(e)]);
    }
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
      {createdKey && (
        <p className="issue-form__created">
          <a href={`#/issues/${createdKey}`}>{createdKey}</a> を追加しました
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
        {submitted && summaryMissing && <span className="issue-form__error">{M.summaryRequired}</span>}
      </label>
      <div className="issue-form__field">
        <span className="issue-form__label">詳細</span>
        <MarkdownEditor value={description} onChange={setDescription} preview={(v) => <Markdown source={v} />} rows={DESCRIPTION_ROWS} ariaLabel="詳細" />
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
          <AssigneeSelect id="new-assignee" className="issue-form__control" value={assignee} leading={[{ value: "", label: "未設定" }]} onChange={setAssignee} />
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
          {datesReversed && <span className="issue-form__error">{M.dueBeforeStart}</span>}
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
              candidates={parentCandidates}
              commitOn="change"
              className="issue-form__control"
              ariaLabel="親課題"
              onChange={(key, invalid) => {
                setParent(key);
                setParentInvalid(invalid);
              }}
            />
          )}
          {(parentInvalid || parentMissing) && <span className="issue-form__error">{M.parentNotFound}</span>}
        </div>
        {openMilestones.length > 0 && (
          <>
            <label htmlFor="new-milestone" className="issue-form__term">
              マイルストーン
            </label>
            <div className="issue-form__cell">
              <select id="new-milestone" className="issue-form__control" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
                <option value="">未設定</option>
                {openMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <label htmlFor="new-estimated" className="issue-form__term">
          予定時間
        </label>
        <div className="issue-form__cell">
          <input
            id="new-estimated"
            className="issue-form__control"
            inputMode="decimal"
            value={estimatedText}
            aria-invalid={submitted && !estimated.ok}
            onChange={(e) => setEstimatedText(e.target.value)}
          />
          {submitted && !estimated.ok && <span className="issue-form__error">{M.hoursInvalid}</span>}
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
          addPaths([...e.dataTransfer.files].map((f) => window.api.pathForFile(f)));
        }}
      >
        <div className="issue-form__row">
          <span className="issue-form__label">添付ファイル</span>
          <button type="button" onClick={() => void chooseAttachments()}>
            ファイルを選ぶ
          </button>
        </div>
        {attachmentPaths.length === 0 ? (
          <p className="issue-form__dropzone">ここにファイルをドロップ</p>
        ) : (
          <ul className="issue-form__files">
            {attachmentPaths.map((p) => (
              <li key={p} className="issue-form__file">
                <span>{fileName(p)}</span>
                <button type="button" className="button--link" onClick={() => setAttachmentPaths((x) => x.filter((y) => y !== p))}>
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
