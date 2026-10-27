import type { McpServer } from "@modelcontextprotocol/server";

export function registerInventoryAuditPrompt(server: McpServer): void {
  server.registerPrompt(
    "snipeit-inventory-audit",
    {
      title: "Inventory audit overview",
      description: "Pulls due/overdue audits and unassigned assets, then summarizes.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "You are auditing the Snipe-IT inventory. Do this:\n" +
              "1. Call snipeit_list_audit_due and snipeit_list_audit_overdue.\n" +
              '2. Call snipeit_list_hardware with status: "RTD" (ready to deploy, not checked out).\n' +
              "3. Summarize: how many overdue, how many due in the next 30 days, how many ready to deploy. " +
              "List the asset_tag and name of overdue items.",
          },
        },
      ],
    }),
  );
}
