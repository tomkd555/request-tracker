import { useState } from "react";
import type { BootStep } from "./boot";

type Props = { step: Exclude<BootStep, "ready">; onDone(): void };

export function FirstLaunch({ step, onDone }: Props): React.JSX.Element {
  const [month, setMonth] = useState(4);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="first-launch">
      <h1>Request Tracker</h1>
      {step === "folder" && (
        <section>
          <h2>共有フォルダ</h2>
          <p>課題を保存する共有フォルダを選んでください。</p>
          <button
            onClick={() =>
              run(async () => {
                if ((await window.api.config.chooseRoot()) === null) throw new Error("共有フォルダが選ばれていません");
              })
            }
          >
            フォルダを選ぶ
          </button>
        </section>
      )}
      {step === "month" && (
        <section>
          <h2>年度の開始月</h2>
          <p>課題キーの年度を決める月です。</p>
          <label>
            開始月
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => run(() => window.api.project.init(month))}>決定</button>
        </section>
      )}
      {step === "name" && (
        <section>
          <h2>表示名</h2>
          <p>課題やコメントに表示される名前です。</p>
          <label>
            表示名
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <button disabled={name.trim() === ""} onClick={() => run(() => window.api.users.register(name))}>
            登録
          </button>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
