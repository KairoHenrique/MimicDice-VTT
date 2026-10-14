import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type FirewallStatus = "allowed" | "missing" | "unsupported";

function ruleNameFor(port: number): string {
  return `MimicDice VTT (TCP ${port})`;
}

function legacyRuleNameFor(port: number): string {
  return `Tabbletop (TCP ${port})`;
}

async function ruleExists(name: string): Promise<boolean> {
  try {
    await execFileAsync("netsh", ["advfirewall", "firewall", "show", "rule", `name=${name}`], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function assertValidPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta inválida");
}

/** Whether Windows Firewall already has our inbound rule (or the one created before the rename) for the server port. */
export async function getFirewallStatus(port: number): Promise<FirewallStatus> {
  if (process.platform !== "win32") return "unsupported";
  assertValidPort(port);
  if (await ruleExists(ruleNameFor(port))) return "allowed";
  return (await ruleExists(legacyRuleNameFor(port))) ? "allowed" : "missing";
}

/** Adds the inbound rule through an elevated netsh; Windows shows the UAC prompt to the user. */
export async function addFirewallRule(port: number): Promise<FirewallStatus> {
  if (process.platform !== "win32") return "unsupported";
  assertValidPort(port);
  const netshArguments = ["advfirewall", "firewall", "add", "rule", `name="${ruleNameFor(port)}"`, "dir=in", "action=allow", "protocol=TCP", `localport=${port}`, "profile=private,domain"];
  const argumentList = netshArguments.map((argument) => `'${argument.replace(/'/g, "''")}'`).join(",");
  const script = `Start-Process -FilePath netsh -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList ${argumentList}`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }).catch(() => undefined);
  return getFirewallStatus(port);
}
