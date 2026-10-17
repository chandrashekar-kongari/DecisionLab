import type { CreateosSandboxClient, Sandbox } from "@nodeops-createos/sandbox";
import type { SandboxSession, SandboxShape } from "@/lib/agent/types";

/**
 * CreateOS Sandbox access.
 *
 * Generated Python runs through `executePythonJob` in `python-runner.ts`.
 * This module never invents stdout. A missing API key fails closed.
 */

export const SANDBOX_SHAPE = "s-1vcpu-1gb" as const satisfies SandboxShape;
export const SANDBOX_ROOTFS = "devbox:1";
/** Deny-by-default. A non-empty allowlist drops every other destination. */
export const DENY_EGRESS = ["127.0.0.1:9"] as const;
export const PYPI_EGRESS = ["pypi.org:443", "*.pythonhosted.org:443"] as const;
export const COMMAND_TIMEOUT_MS = 90_000;
export const CREATE_WAIT_MS = 120_000;

export type ProvisionSandboxRequest = {
  shape: SandboxShape;
  name: string;
};

export type SandboxCommand = {
  cmd: string;
  args: string[];
  stdin?: string;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface CreateOSSandboxClient {
  provision(request: ProvisionSandboxRequest): Promise<SandboxSession>;
  exec(session: SandboxSession, command: SandboxCommand): Promise<CommandResult>;
  destroy(session: SandboxSession): Promise<void>;
}

export class SandboxNotConfiguredError extends Error {
  readonly code = "SANDBOX_NOT_CONFIGURED" as const;

  constructor(
    message = "CreateOS Sandbox is not configured. Set CREATEOS_SANDBOX_API_KEY to provision a sandbox.",
  ) {
    super(message);
    this.name = "SandboxNotConfiguredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isSandboxNotConfigured(error: unknown): error is SandboxNotConfiguredError {
  return (
    error instanceof SandboxNotConfiguredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "SANDBOX_NOT_CONFIGURED")
  );
}

export async function createConfiguredClient(): Promise<CreateosSandboxClient> {
  const apiKey = process.env.CREATEOS_SANDBOX_API_KEY;
  if (!apiKey) throw new SandboxNotConfiguredError();
  const { createClient } = await import("@nodeops-createos/sandbox");
  const baseUrl = process.env.CREATEOS_SANDBOX_BASE_URL;
  return createClient(baseUrl ? { apiKey, baseUrl } : { apiKey });
}

const liveHandles = new Map<string, Sandbox>();

export function createSandboxClient(): CreateOSSandboxClient {
  return {
    async provision(request) {
      const client = await createConfiguredClient();
      const sandbox = await client.createSandbox(
        {
          shape: request.shape,
          name: request.name,
          rootfs: SANDBOX_ROOTFS,
          ingress_enabled: false,
          auto_pause_after_seconds: 120,
          egress: [...DENY_EGRESS],
        },
        { wait: false, timeoutMs: 60_000 },
      );
      try {
        await sandbox.waitUntilRunning({ timeoutMs: CREATE_WAIT_MS });
      } catch (error) {
        await sandbox.destroy().catch(() => undefined);
        throw error;
      }
      liveHandles.set(sandbox.id, sandbox);
      return { id: sandbox.id, name: request.name, shape: request.shape };
    },
    async exec(session, command) {
      const sandbox = await handleFor(session.id);
      const executed = await sandbox.runCommand(command.cmd, command.args, {
        stdin: command.stdin,
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      return {
        exitCode: executed.result.exit_code,
        stdout: executed.result.stdout,
        stderr: executed.result.stderr,
      };
    },
    async destroy(session) {
      const sandbox = liveHandles.get(session.id) ?? (await handleFor(session.id));
      liveHandles.delete(session.id);
      await sandbox.destroy();
    },
  };
}

async function handleFor(id: string): Promise<Sandbox> {
  const cached = liveHandles.get(id);
  if (cached) return cached;
  const client = await createConfiguredClient();
  const sandbox = await client.getSandbox(id);
  liveHandles.set(id, sandbox);
  return sandbox;
}
