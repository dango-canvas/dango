import { expect, test, describe } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

describe("Bundled dist/index.html evaluation check", () => {
    test("dist/index.html exists and contains inlined script and styles", () => {
        const distFile = join(import.meta.dir, "../dist/index.html");
        if (!existsSync(distFile)) {
            execSync("bun run build.ts", { cwd: join(import.meta.dir, "..") });
        }
        expect(existsSync(distFile)).toBe(true);
        const html = readFileSync(distFile, "utf-8");
        expect(html.length).toBeGreaterThan(50000);
        expect(html).toContain('<style>');
        expect(html).toContain('<script type="module">');
        expect(html).not.toContain('src="js/main.ts"');
        expect(html).not.toContain('src="js/main.js"');
        expect(html).not.toContain('href="css/style.css"');
    });
});
