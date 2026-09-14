import { useState } from "react";
import { STAMP_ID, type User } from "../../shared/types";
import type { BootStep } from "./boot";

interface Props { step: Exclude<BootStep, "ready">; users: User[]; onDone(): void; error?: string | null }

/** Members added by name in project settings that nobody has picked yet. */
export const claimable = (users: User[]): User[] => users.filter((u) => u.login === undefined && STAMP_ID.test(u.username));

const STEPS: { id: Exclude<BootStep, "ready">; label: string }[] = [
  { id: "folder", label: "共有フォルダ" },
  { id: "month", label: "プロジェクト" },
  { id: "name", label: "名前" },
];

export function FirstLaunch({ step, users, onDone, error: bootError = null }: Props): React.JSX.Element {
  const [month, setMonth] = useState(4);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState(""); // username of the registered member picked, "" for a new name
  const [error, setError] = useState<string | null>(null);
  const current = STEPS.findIndex((s) => s.id === step);
  const members = claimable(users);
  const picking = members.length > 0 && chosen !== "";

  // An action that returns false (a cancelled dialog) leaves the screen as it is.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      if ((await action()) !== false) onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m.includes("already-claimed") ? "この名前は別の端末で使われています" : m);
    }
  };
  const chooseFolder = (): Promise<void> => run(async () => (await window.api.config.chooseRoot()) !== null);

  return (
    <div className="first-launch">
      <h1>Request Tracker</h1>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`stepper__step${i < current ? " stepper__step--done" : ""}`} aria-current={i === current ? "step" : undefined}>
            {s.label}
          </li>
        ))}
      </ol>
      {step === "folder" && (
        <section>
          <h2>共有フォルダ</h2>
          <p>全員が読み書きできるネットワーク上のフォルダを選んでください。</p>
          {bootError && <p className="text--error">{bootError}</p>}
          <div className="form-actions">
            {bootError && (
              <button type="button" onClick={onDone}>
                再読み込み
              </button>
            )}
            <button type="button" onClick={() => void chooseFolder()}>
              {bootError ? "別のフォルダを選ぶ" : "フォルダを選ぶ"}
            </button>
          </div>
        </section>
      )}
      {step === "month" && (
        <section>
          <h2>プロジェクトの作成</h2>
          <p>このフォルダにはまだプロジェクトがありません。</p>
          <label className="first-launch__label">
            年度の開始月
            <select className="first-launch__field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="button" onClick={() => void run(() => window.api.project.init(month))}>
              プロジェクトを作成
            </button>
          </div>
        </section>
      )}
      {step === "name" && (
        <section>
          <h2>あなたの名前</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => (picking ? window.api.users.claim(chosen) : window.api.users.register(name)));
            }}
          >
            {members.length > 0 && (
              <label className="first-launch__label">
                登録済みの名前から選ぶ
                <select className="first-launch__field" value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  <option value="">新しい名前で登録する</option>
                  {members.map((u) => (
                    <option key={u.username} value={u.username}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="first-launch__label">
              名前
              <input className="first-launch__field" value={name} onChange={(e) => setName(e.target.value)} disabled={picking} autoFocus />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={picking ? false : name.trim() === ""}>
                はじめる
              </button>
            </div>
          </form>
        </section>
      )}
      {error && <p className="text--error">{error}</p>}
      {step !== "folder" && (
        <button type="button" className="first-launch__reselect" onClick={() => void chooseFolder()}>
          別の共有フォルダを選ぶ
        </button>
      )}
    </div>
  );
}
