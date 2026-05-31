export const clip = (text: string, max = 4000) =>
    text.length <= max ? text : text.slice(0, max) + '\n…[truncated]';

export const replyMd = async (ctx: { reply: (t: string, o?: object) => Promise<unknown> }, text: string) => {
    try {
        await ctx.reply(clip(text), { parse_mode: 'Markdown' });
    } catch (err) {
        console.warn("[Telegram Bot] Markdown parsing failed, falling back to plain text:", err);
        await ctx.reply(clip(text));
    }
};

/** Text after `/name …` */
export function commandArg(fullText: string, name: string): string {
    return fullText.replace(new RegExp(`^/${name}\\s*`, 'i'), '').trim();
}