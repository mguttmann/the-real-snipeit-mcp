import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerUserOnboardingPrompt(server: McpServer): void {
  server.registerPrompt(
    "snipeit-user-onboarding",
    {
      title: "User onboarding kit",
      description: "Suggests a checkout sequence to onboard a user with a predefined kit.",
      argsSchema: {
        user_id: z.string().describe("Snipe-IT user id"),
        kit: z.string().optional().describe("Predefined kit id or name (optional)"),
      },
    },
    (args: { user_id: string; kit?: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Onboard user ${args.user_id}${args.kit ? ` with kit ${args.kit}` : ""}.\n` +
              "1. Confirm the user exists via snipeit_get_user.\n" +
              `2. ${args.kit ? `Look up the kit (snipeit_raw_request GET /kits/${args.kit}) and list the included models/licenses/accessories.` : "Suggest a default kit by listing available models with snipeit_raw_request GET /models?limit=20."}\n` +
              "3. For each item, find one available asset (snipeit_list_hardware filtered by model_id and status_id=ready-to-deploy) and propose a snipeit_checkout_hardware call.\n" +
              "4. Do NOT execute the checkouts — only present the plan.",
          },
        },
      ],
    }),
  );
}
