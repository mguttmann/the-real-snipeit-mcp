/**
 * Gate for the live Snipe-IT integration tests.
 *
 * The live suite creates and deletes data on whatever instance the environment points at, so
 * a token alone is not enough: it runs only with the explicit opt-in SNIPEIT_LIVE_TESTS=1
 * plus a non-empty SNIPEIT_API_TOKEN. A plain `npm test` must never reach a real instance.
 */
export function liveTestsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.SNIPEIT_LIVE_TESTS === "1" && !!env.SNIPEIT_API_TOKEN?.trim();
}
