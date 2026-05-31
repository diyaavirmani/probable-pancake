import { request } from "undici";

export async function browse(url: string): Promise<string> {
    try {
        const res = await request(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                Accept: "text/html,application/xhtml+xml",
            },
        });
        return await res.body.text();
    } catch (error) {
        console.error(`Fetching "${url}" failed:`, error);
        return "";
    }
}
