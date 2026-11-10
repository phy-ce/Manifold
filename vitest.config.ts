// Tests: several check odds over thousands of generated worlds (vein sizes, biome shares, ore tilts). They take a
// second or two here but several times that on the CI machine, whose 5s default failed deploys, so every test
// gets 30s. A test that is merely slow is still a pass; one that hangs still fails.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 30_000 },
});
