import type { McpServer } from "@modelcontextprotocol/server";
import { registerInventoryAuditPrompt } from "./inventoryAudit.js";
import { registerUserOnboardingPrompt } from "./userOnboarding.js";
import { registerLicenseHealthPrompt } from "./licenseHealth.js";

export function registerPrompts(server: McpServer): void {
  registerInventoryAuditPrompt(server);
  registerUserOnboardingPrompt(server);
  registerLicenseHealthPrompt(server);
}
