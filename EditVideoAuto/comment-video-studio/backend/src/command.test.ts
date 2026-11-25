import { describe, expect, it } from "vitest";
import { runCommand } from "./command.js";

describe("runCommand", () => {
  it("báo rõ khi tiến trình vượt quá thời gian chờ thay vì chỉ hiện SIGTERM", async () => {
    await expect(runCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { timeoutMs: 20 }))
      .rejects.toThrow("vượt quá thời gian chờ 20 ms");
  });

  it("buộc dừng tiến trình không chịu thoát khi người dùng hủy", async () => {
    const controller = new AbortController();
    const command = runCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { signal: controller.signal, timeoutMs: 10_000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await expect(command).rejects.toThrow("đã bị hủy");
  }, 4_000);

  it("truyền dữ liệu nhạy cảm qua stdin mà không đưa lên tham số dòng lệnh", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => process.stdout.write(data.trim()));"],
      { stdin: "secret-from-stdin\n", timeoutMs: 5_000 }
    );
    expect(result.stdout).toBe("secret-from-stdin");
  });
});
