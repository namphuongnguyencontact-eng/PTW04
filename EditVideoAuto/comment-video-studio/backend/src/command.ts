import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  stdin?: string;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export async function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdin !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
    });
    if (options.stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => undefined);
      child.stdin.end(options.stdin, "utf8");
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const maxCapturedBytes = 4 * 1024 * 1024;
    let capturedBytes = 0;

    const capture = (target: Buffer[], chunk: Buffer) => {
      capturedBytes += chunk.length;
      if (capturedBytes <= maxCapturedBytes) target.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      capture(stdout, chunk);
      options.onStdout?.(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      capture(stderr, chunk);
      options.onStderr?.(chunk.toString("utf8"));
    });

    const scheduleForceKill = () => {
      forceKillTimer ??= setTimeout(() => child.kill("SIGKILL"), 1500);
      forceKillTimer.unref();
    };
    const abort = () => {
      aborted = true;
      child.kill("SIGTERM");
      scheduleForceKill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      scheduleForceKill();
    }, options.timeoutMs ?? 120_000);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", abort);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      if (code === 0) resolve(result);
      else if (timedOut) reject(new Error(`${command} vượt quá thời gian chờ ${options.timeoutMs ?? 120_000} ms.`));
      else if (aborted) reject(new Error(`${command} đã bị hủy.`));
      else reject(new Error(`${command} thất bại (${signal ?? code}): ${result.stderr.trim() || result.stdout.trim()}`));
    });
  });
}
