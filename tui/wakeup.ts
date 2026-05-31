import { select, isCancel } from '@clack/prompts'
import chalk from "chalk"
import figlet from "figlet"
import { runclimode } from '../modes/cli'
import { runTelegramMode } from '../modes/telegram'

const BANNER_FONT = "ANSI Shadow"

const SHADOW = chalk.hex('#f7ab1b')
const FACE = chalk.hex('#b69689ff').bold;

function printbannerwithshadow(ascii: string) {
    const bannerLines = ascii.replace(/\s+$/, '').split('\n');
    const maxLen = Math.max(...bannerLines.map((l) => l.length), 0);
    const rowWidth = maxLen + 2;

    for (const line of bannerLines) {
        console.log(SHADOW(' ' + line).padEnd(rowWidth));
    }

    process.stdout.write(`\x1b[${bannerLines.length}A`);

    for (const line of bannerLines) {
        console.log(FACE(line.padEnd(rowWidth)));
    }

    console.log();
}

export async function runwakeup() {
    let ascii: string;
    try {
        ascii = figlet.textSync("Pancake", { font: BANNER_FONT })

    } catch (error) {
        console.log("Ayo , my bad , there is an issue with my brain cells , they are not configured properly :(");
        return;
    }

    printbannerwithshadow(ascii)

    const mode = await select({

        message: "which mode do you want to proceed with? ",
        options: [{
            value: "CLI", label: "CLI"
        },
        { value: "Telegram", label: "Telegram" },
        { value: "Exit", label: "Exit" }
        ]
    });

    if (isCancel(mode || mode === "Exit")) {
        console.log(chalk.dim("\n Goodbye\n"))
    }

    if (mode === "CLI") {
        console.log("CLI mode selected")
        await runclimode()
            ;
    }
    else if (mode === "Telegram") {
        console.log("Telegram mode selected");
        await runTelegramMode();
    }


}

