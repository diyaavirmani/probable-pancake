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