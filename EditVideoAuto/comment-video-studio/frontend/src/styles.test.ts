import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readStyles() {
  return readFile(new URL("./styles.css", import.meta.url), "utf8");
}

describe("bố cục responsive theo chiều cao", () => {
  it("co khung preview theo phần chiều cao còn lại trên desktop", async () => {
    const css = await readStyles();

    expect(css).toMatch(/\.studio-shell\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*height:\s*100dvh;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.studio-grid\s*\{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;[^}]*height:\s*0;/s);
    expect(css).toMatch(/\.preview-panel\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto;/s);
    expect(css).toMatch(/\.phone-stage\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.video-frame\s*\{[^}]*height:\s*min\(62vh, calc\(100% - 32px\), 680px\);[^}]*max-width:\s*100%;/s);
  });

  it("trở về luồng cuộn dọc khi màn hình hẹp", async () => {
    const css = await readStyles();
    const tabletRules = css.match(/@media \(max-width:\s*920px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(tabletRules).toMatch(/\.studio-shell\s*\{[^}]*position:\s*relative;[^}]*height:\s*auto;[^}]*min-height:\s*100dvh;[^}]*overflow:\s*visible;/s);
    expect(tabletRules).toMatch(/\.studio-grid\s*\{[^}]*flex:\s*none;[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
    expect(tabletRules).toMatch(/\.phone-stage\s*\{[^}]*min-height:\s*390px;[^}]*overflow:\s*visible;/s);
    expect(tabletRules).toMatch(/\.video-frame\s*\{[^}]*height:\s*min\(58vh, calc\(100% - 32px\), 590px\);/s);
  });
});
