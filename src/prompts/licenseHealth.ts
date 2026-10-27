import type { McpServer } from "@modelcontextprotocol/server";

export function registerLicenseHealthPrompt(server: McpServer): void {
  server.registerPrompt(
    "snipeit-license-health",
    {
      title: "License health report",
      description: "Lists license seat usage and licenses expiring within 90 days.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Audit license health:\n" +
              "1. Call snipeit_list_licenses with limit 100.\n" +
              "2. For each license, read the seat count and the free seats from the row (Snipe-IT returns them as `seats` and `free_seats_count`; check the first row), compute used = seats - free and flag any license with no free seats.\n" +
              "3. Flag any license with expiration_date within the next 90 days.\n" +
              "4. Output a markdown table: license name | total | used | free | expires_in_days.",
          },
        },
      ],
    }),
  );
}
