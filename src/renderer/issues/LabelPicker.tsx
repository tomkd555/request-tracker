import type { Project } from "../../shared/types";
import { textOn } from "../app/theme";
import { labelColor, labelOptions, toggleLabel } from "./labels";

type Props = { project: Project; value: string[]; onChange(labels: string[]): void; /** Shown while no label is chosen; a filter says すべて, a record 未設定. */ emptyLabel?: string };

/** Checkbox popover of the project's ラベル, shared by the detail sidebar, the create form and FilterBar. */
export function LabelPicker({ project, value, onChange, emptyLabel = "未設定" }: Props): React.JSX.Element {
  return (
    <details className="label-picker">
      <summary className="label-picker__summary">
        {value.length === 0
          ? emptyLabel
          : value.map((name) => {
              const color = labelColor(project, name);
              return (
                <span key={name} className="pill label-picker__chip" style={{ background: color, color: textOn(color) }}>
                  {name}
                </span>
              );
            })}
      </summary>
      <ul className="label-picker__list">
        {labelOptions(project, value).map((name) => (
          <li key={name}>
            <label className="label-picker__option">
              <input type="checkbox" checked={value.includes(name)} onChange={() => onChange(toggleLabel(value, name))} />
              {name}
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
