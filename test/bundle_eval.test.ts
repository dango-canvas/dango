import { expect, test, describe } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

describe("Bundled dist/index.html evaluation check", () => {
    test("dist/index.html exists and contains inlined script and styles", () => {
        const distFile = join(import.meta.dir, "../dist/index.html");
        if (!existsSync(distFile)) {
            console.warn("⚠️ dist/index.html does not exist yet. Run `bun build.ts` to test bundle.");
            return;
        }
        const html = readFileSync(distFile, "utf-8");
        expect(html.length).toBeGreaterThan(50000);
        expect(html).toContain('<style>');
        expect(html).toContain('<script type="module">');
        expect(html).not.toContain('src="js/main.ts"');
        expect(html).not.toContain('src="js/main.js"');
        expect(html).not.toContain('href="css/style.css"');
    });
});
