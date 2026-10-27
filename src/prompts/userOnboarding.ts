import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

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
              `2. ${args.kit ? `Find the kit ${JSON.stringify(args.kit)}: predefined kits are not part of the vendored API spec, so if snipeit_raw_request GET /kits does not list it, ask the user which models the kit contains.` : "Suggest a default kit by listing available models with snipeit_raw_request GET /models?limit=20."}\n` +
              '3. For each item, find one available asset (snipeit_list_hardware with model_id and status: "RTD") and propose a snipeit_checkout_hardware call.\n' +
              "4. Do NOT execute the checkouts; only present the plan.",
          },
        },
      ],
    }),
  );
}
