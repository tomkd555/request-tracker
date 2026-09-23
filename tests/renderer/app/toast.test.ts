import { describe, expect, it } from "vitest";
import { clearToast, currentToast, showToast, subscribe } from "../../../src/renderer/app/toast";

describe("toast", () => {
  it("shows one message at a time and clears only the one named", () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    showToast("26-0001 を追加しました");
    const first = currentToast();
    expect(first?.message).toBe("26-0001 を追加しました");
    showToast("26-0002 を追加しました");
    expect(currentToast()?.message).toBe("26-0002 を追加しました");
    clearToast(first!.id); // the older toast's animation ends after it was replaced
    expect(currentToast()?.message).toBe("26-0002 を追加しました");
    clearToast(currentToast()!.id);
    expect(currentToast()).toBeNull();
    expect(calls).toBe(3);
    off();
  });
});
