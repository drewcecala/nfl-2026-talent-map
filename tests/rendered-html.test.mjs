import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("the root redirects to the actual map", async () => {
  const response = await render("/");
  assert.equal(response.status, 307);
  assert.equal(
    new URL(response.headers.get("location"), "http://localhost").pathname,
    "/nfl-talent-map",
  );
});

test("server-renders the interactive map route", async () => {
  const response = await render("/nfl-talent-map");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /The Geography of NFL Talent/);
  assert.match(html, /Loading the audited player locations/);
  assert.doesNotMatch(html, /starter|taking shape|SkeletonPreview/i);
});

for (const route of ["/nfl-talent-map/reddit", "/nfl-talent-map/wide"]) {
  test(`server-renders the product poster route ${route}`, async () => {
    const response = await render(route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /The Geography of NFL Talent/);
    assert.doesNotMatch(html, /starter|taking shape|SkeletonPreview/i);
  });
}

test("metadata describes the evidence controls accurately", async () => {
  const [layout, page, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nfl-talent-map/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /verified high-school counties for 2015–2026 by default/);
  assert.match(page, /audit coverage by era/);
  assert.doesNotMatch(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
