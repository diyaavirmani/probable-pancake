#!/usr/bin/env bun

// Fix Bun / Telegraf read-only error.message compatibility issue
try {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'message');
    Object.defineProperty(Error.prototype, 'message', {
        configurable: true,
        enumerable: true,
        get() {
            return this._custom_message !== undefined 
                ? this._custom_message 
                : (originalDescriptor?.get ? originalDescriptor.get.call(this) : originalDescriptor?.value);
        },
        set(value) {
            this._custom_message = value;
        }
    });
} catch (e) {
    // Ignore if not allowed
}

import fs from "node:fs";
import path from "node:path";

// Load .env relative to the project root directory where index.ts lives,
// ensuring env variables are loaded even if the command is run from a different directory (like C:\WINDOWS\system32)
try {
    const projectRoot = import.meta.dirname;
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key) {
                    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
                    process.env[key.trim()] = value;
                }
            }
        }
    }
} catch (e) {
    // Ignore any environment loading errors
}

import { Command, Option } from "commander"
import { runwakeup } from "./tui/wakeup";


const program = new Command();

program.name("Pancake")
    .description("I dont even know , the things it cant do.")
    .version("0.0.1")

program.command("wakeup").description("show the banner and pick clu or telegram mode").action(
    async () => {
        await runwakeup()
    }
);

await program.parseAsync(process.argv)