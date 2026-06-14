import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerLicenseHealthPrompt(server: McpServer): void {
  server.registerPrompt(
    "snipeit-license-health",
    { title: "License health report", description: "Lists license seat usage and licenses expiring within 90 days." },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Audit license health:\n" +
              "1. Call snipeit_list_licenses with limit 100.\n" +
              "2. For each license, compute seats_used / seats_total and flag any with seats_used >= seats_total.\n" +
              "3. Flag any license with expiration_date within the next 90 days.\n" +
              "4. Output a markdown table: license name | total | used | free | expires_in_days.",
          },
        },
      ],
    }),
  );
}
