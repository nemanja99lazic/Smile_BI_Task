import { Scraper } from "../scraper/Scraper";

async function main(): Promise<void> {
    const scraper = new Scraper();
    await scraper.run();
}

main();