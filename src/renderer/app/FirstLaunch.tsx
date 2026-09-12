import { useState } from "react";
import type { BootStep } from "./boot";

interface Props { step: Exclude<BootStep, "ready">; onDone(): void; error?: string | null }

const STEPS: { id: Exclude<BootStep, "ready">; label: string }[] = [
  { id: "folder", label: "共有フォルダ" },
  { id: "month", label: "プロジェクト" },
  { id: "name", label: "名前" },
];

export function FirstLaunch({ step, onDone, error: bootError = null }: Props): React.JSX.Element {
  const [month, setMonth] = useState(4);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = STEPS.findIndex((s) => s.id === step);

  // An action that returns false (a cancelled dialog) leaves the screen as it is.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      if ((await action()) !== false) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
              void run(() => window.api.users.register(name));
            }}
          >
            <label className="first-launch__label">
              名前
              <input className="first-launch__field" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={name.trim() === ""}>
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
