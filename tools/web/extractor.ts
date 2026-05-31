import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractedPage {
    title: string;
    text: string;
}

export function extract(html: string, url: string): ExtractedPage {
    try {
        if (!html) {
            return { title: "No Content", text: "" };
        }
        
        const dom = new JSDOM(html, { url });
        const article = new Readability(dom.window.document).parse();
        
        return {
            title: article?.title || "No Title",
            text: article?.textContent?.trim() || ""
        };
    } catch (error) {
        console.error(`Content extraction failed for URL "${url}":`, error);
        return {
            title: "No Title",
            text: ""
        };
    }
}
