import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("bundled CLI", () => {
  it("starts the TUI bundle without dynamic require failures", async () => {
    const build = spawnSync(process.execPath, ["scripts/build-cli.mjs"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    expect(build.status).toBe(0);

    const child = spawn(process.execPath, ["dist/cli.js"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: "xterm-256color"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const exited = once(child, "exit");
    const timeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => {
        child.kill("SIGTERM");
        resolve("timeout");
      }, 700);
    });

    await Promise.race([exited, timeout]);
    expect(output).not.toContain("Dynamic require");
  });
});
