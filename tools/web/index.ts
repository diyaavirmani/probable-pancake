import { googleSearch } from "./search";
import { browse } from "./browser";
import { extract } from "./extractor";
import { tool } from "ai";
import { z } from "zod";

export interface SearchResultPage {
    title: string;
    url: string;
    text: string;
}

export async function webSearch(query: string): Promise<SearchResultPage[]> {
    console.log(`[WebSearch] Querying Google for: "${query}"...`);
    const urls = await googleSearch(query);
    if (urls.length === 0) {
        console.log(`[WebSearch] No URLs found for query: "${query}"`);
        return [];
    }
    
    console.log(`[WebSearch] Found URLs:`, urls);
    const pages: SearchResultPage[] = [];
    
    for (const url of urls) {
        try {
            console.log(`[WebSearch] Fetching page content: ${url}...`);
            const html = await browse(url);
            const data = extract(html, url);
            
            if (data.text) {
                pages.push({
                    url,
                    title: data.title,
                    text: data.text
                });
            }
        } catch (error) {
            console.error(`[WebSearch] Error fetching/extracting ${url}:`, error);
        }
    }
    
    return pages;
}

export function createWebTools(tracker: any) {
    return {
        web_search: tool({
            description: "Search the internet in real time using headless Playwright browser automation. Returns the title, URL, and clean body text from top organic results.",
            inputSchema: z.object({
                query: z.string().describe("The search query string"),
            }),
            execute: async ({ query }) => {
                const results = await webSearch(query);
                
                tracker.log({
                    type: "code_analysis",
                    path: `web_search:${query}`,
                    details: { after: JSON.stringify(results), toolName: "web_search" },
                    status: "executed",
                });
                
                if (results.length === 0) {
                    return {
                        status: "NO_RESULTS",
                        message: "No relevant documents or web results found"
                    };
                }
                
                return {
                    status: "FOUND",
                    sources: results.map(r => ({
                        title: r.title,
                        url: r.url,
                        text: r.text.slice(0, 2500) // Keep generous amount of text
                    }))
                };
            },
        }),
        web_crawl: tool({
            description: "Scrape and extract article content from a specific URL in real-time using headless Playwright browser automation.",
            inputSchema: z.object({ url: z.string().url() }),
            execute: async ({ url }) => {
                const html = await browse(url);
                const data = extract(html, url);
                
                tracker.log({
                    type: "code_analysis",
                    path: `web_crawl:${url}`,
                    details: { after: data.text ? `Successfully crawled "${data.title}"` : "Failed to crawl URL.", toolName: "web_crawl" },
                    status: "executed",
                });

                return data.text 
                    ? `Successfully crawled and extracted content from: "${data.title}"\n\nContent:\n${data.text}`
                    : `Failed to crawl URL "${url}". Make sure the URL is accessible and try again.`;
            },
        }),
        fetch_url: tool({
            description: "Fetch page document from the web in real-time. Returns page title and text contents.",
            inputSchema: z.object({ url: z.string().url() }),
            execute: async ({ url }) => {
                const html = await browse(url);
                const data = extract(html, url);
                
                tracker.log({
                    type: "code_analysis",
                    path: `fetch:${url}`,
                    details: { after: data.text ? `Fetched URL: "${data.title}"` : "Failed to fetch URL.", toolName: "fetch_url" },
                    status: "executed",
                });

                return data.text 
                    ? `Fetched Document: "${data.title}"\n\nContent:\n${data.text}`
                    : `Failed to fetch URL "${url}". Make sure the URL is accessible and try again.`;
            },
        }),
    };
}
