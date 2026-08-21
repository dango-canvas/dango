import { expect, test, describe } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Bundled dist/index.html evaluation check", () => {
    test("dist/index.html exists and contains inlined script and styles", () => {
        const html = readFileSync(join(import.meta.dir, "../dist/index.html"), "utf-8");
        expect(html.length).toBeGreaterThan(50000);
        expect(html).toContain('<style>');
        expect(html).toContain('<script type="module">');
        expect(html).not.toContain('src="js/main.ts"');
        expect(html).not.toContain('src="js/main.js"');
        expect(html).not.toContain('href="css/style.css"');
    });
});
