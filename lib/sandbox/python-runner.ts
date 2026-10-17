import {
  COMMAND_TIMEOUT_MS,
  CREATE_WAIT_MS,
  DENY_EGRESS,
  PYPI_EGRESS,
  SANDBOX_ROOTFS,
  SANDBOX_SHAPE,
  SandboxNotConfiguredError,
  createConfiguredClient,
  isSandboxNotConfigured,
} from "@/lib/sandbox/createos";

const DEPENDENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const MAX_DEPENDENCIES = 8;
const MAX_SOURCE_CHARS = 100_000;
const MAX_OUTPUT_CHARS = 200_000;

export type PythonJobInput = {
  source: string;
  dependencies: string[];
  inputData: unknown;
};

export type PythonJobResult = {
  ok: boolean;
  code: "completed" | "failed" | "not_configured" | "invalid";
  sandboxId: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number | null;
  result: unknown;
  error: string | null;
  cleanupError: string | null;
};

export async function executePythonJob(input: PythonJobInput): Promise<PythonJobResult> {
  const invalid = validateJob(input);
  if (invalid) {
    return emptyResult("invalid", invalid);
  }

  let client;
  try {
    client = await createConfiguredClient();
  } catch (error) {
    if (isSandboxNotConfigured(error)) {
      return emptyResult("not_configured", error.message);
    }
    throw error;
  }

  const started = Date.now();
  const sandbox = await client.createSandbox(
    {
      shape: SANDBOX_SHAPE,
      rootfs: SANDBOX_ROOTFS,
      ingress_enabled: false,
      auto_pause_after_seconds: 120,
      egress: [...DENY_EGRESS],
      name: `decision-lab-${crypto.randomUUID().slice(0, 8)}`,
    },
    { wait: false, timeoutMs: 60_000 },
  );

  let outcome: PythonJobResult;
  try {
    await sandbox.waitUntilRunning({ timeoutMs: CREATE_WAIT_MS });

    if (input.dependencies.length > 0) {
      await sandbox.setEgress([...PYPI_EGRESS]);
      const installed = await sandbox.runCommand(
        "python3",
        ["-m", "pip", "install", "--disable-pip-version-check", ...input.dependencies],
        { timeoutMs: COMMAND_TIMEOUT_MS },
      );
      await sandbox.setEgress([...DENY_EGRESS]);
      if (installed.result.exit_code !== 0) {
        outcome = {
          ...emptyResult("failed", "Dependency install failed inside the sandbox."),
          sandboxId: sandbox.id,
          exitCode: installed.result.exit_code,
          stdout: clip(installed.result.stdout),
          stderr: clip(installed.result.stderr),
          durationMs: Date.now() - started,
        };
        return await finish(sandbox, outcome);
      }
    }

    await sandbox.files.upload("/tmp/input.json", JSON.stringify(input.inputData), {
      timeoutMs: 60_000,
    });
    await sandbox.files.upload("/tmp/experiment.py", input.source, { timeoutMs: 60_000 });

    const executed = await sandbox.runCommand("python3", ["/tmp/experiment.py"], {
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    const durationMs = executed.exec_ms || Date.now() - started;
    let result: unknown = null;
    let error: string | null = null;

    if (executed.result.exit_code === 0) {
      try {
        const bytes = await sandbox.files.download("/tmp/result.json", { timeoutMs: 60_000 });
        const text = new TextDecoder().decode(bytes);
        if (text.length > 1_000_000) {
          error = "Sandbox wrote /tmp/result.json larger than 1 MB.";
        } else {
          result = JSON.parse(text) as unknown;
        }
      } catch (downloadError) {
        error =
          downloadError instanceof Error
            ? `Python exited 0 but /tmp/result.json could not be read: ${downloadError.message}`
            : "Python exited 0 but /tmp/result.json could not be read.";
      }
    } else {
      error = executed.result.error || `Python exited ${executed.result.exit_code}.`;
    }

    const ok = executed.result.exit_code === 0 && error === null && result !== null;
    outcome = {
      ok,
      code: ok ? "completed" : "failed",
      sandboxId: sandbox.id,
      exitCode: executed.result.exit_code,
      stdout: clip(executed.result.stdout),
      stderr: clip(executed.result.stderr),
      durationMs,
      result,
      error,
      cleanupError: null,
    };
  } catch (error) {
    outcome = {
      ...emptyResult("failed", describeSandboxError(error)),
      sandboxId: sandbox.id,
      durationMs: Date.now() - started,
    };
  }
  return finish(sandbox, outcome);
}

async function finish(
  sandbox: { destroy: () => Promise<unknown> },
  outcome: PythonJobResult,
): Promise<PythonJobResult> {
  try {
    await sandbox.destroy();
  } catch (error) {
    outcome.cleanupError = error instanceof Error ? error.message : "Sandbox cleanup failed.";
  }
  return outcome;
}

function validateJob(input: PythonJobInput): string | null {
  if (!input.source.trim()) return "Python source is empty.";
  if (input.source.length > MAX_SOURCE_CHARS) {
    return `Python source exceeds ${MAX_SOURCE_CHARS} characters.`;
  }
  if (input.dependencies.length > MAX_DEPENDENCIES) {
    return `At most ${MAX_DEPENDENCIES} dependencies are allowed.`;
  }
  for (const dependency of input.dependencies) {
    if (!DEPENDENCY_PATTERN.test(dependency)) {
      return `Dependency "${dependency}" is not a plain package name.`;
    }
  }
  return null;
}

function emptyResult(code: PythonJobResult["code"], error: string): PythonJobResult {
  return {
    ok: false,
    code,
    sandboxId: null,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: null,
    result: null,
    error,
    cleanupError: null,
  };
}

function describeSandboxError(error: unknown): string {
  if (error instanceof SandboxNotConfiguredError) return error.message;
  if (error instanceof Error) {
    if (error.name === "CreateosSandboxTimeoutError") return `CreateOS timed out: ${error.message}`;
    return error.message;
  }
  return "CreateOS sandbox execution failed.";
}

function clip(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated]`;
}
