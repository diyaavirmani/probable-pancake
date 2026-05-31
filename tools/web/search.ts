import { request } from "undici";
import * as cheerio from "cheerio";

export async function googleSearch(query: string): Promise<string[]> {
    try {
        // Use DuckDuckGo Lite — works reliably via plain HTTP, no browser needed
        const res = await request(
            `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            }
        );

        const html = await res.body.text();
        const $ = cheerio.load(html);

        const results: string[] = [];

        // DDG Lite wraps result URLs as //duckduckgo.com/l/?uddg=<encoded_url>&rut=...
        $("a.result-link").each((_, el) => {
            const href = $(el).attr("href") ?? "";
            const match = href.match(/uddg=([^&]+)/);
            if (match && match[1]) {
                try {
                    const decoded = decodeURIComponent(match[1]);
                    results.push(decoded);
                } catch {
                    // skip malformed
                }
            }
        });

        return results.slice(0, 5);
    } catch (error) {
        console.error("Web search failed:", error);
        return [];
    }
}
