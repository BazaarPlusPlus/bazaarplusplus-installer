import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("package.json keeps the SvelteKit v2 toolchain versions", () => {
  assert.equal(
    packageJson.devDependencies["@sveltejs/adapter-static"],
    "^3.0.10",
  );
  assert.equal(packageJson.devDependencies["@sveltejs/kit"], "^2.55.0");
  assert.equal("wrangler" in packageJson.devDependencies, false);
});
