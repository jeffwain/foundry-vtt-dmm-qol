/**
 * Landing Page — customise the world's /join login screen.
 *
 * The login page runs no module code, so this feature works by writing a
 * background from the rotation into the world manifest at world load. See
 * publish.js for why that is the only available seam.
 */

import { registerLandingSettings } from "./settings.js";
import { syncOnReady } from "./publish.js";

Hooks.once("init", () => registerLandingSettings());

Hooks.once("ready", () => {
  syncOnReady().catch((err) => console.error("dmm-quality-of-life | landing: sync failed", err));
});
