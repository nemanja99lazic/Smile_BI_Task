import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from 'fs';

interface ScrapedItem {
    position: number;
    price: number;
    shop_name: string;
};

interface ItemInformatioFromListItem {
    shop_name: string,
    products: {
        price: number
    }[];
}

export class Scraper
{
    private static readonly DEFAULT_WAIT_OPTIONS = {timeout: 1000};
    private static readonly PAGE_LINK = "https://www.idealo.de/preisvergleich/OffersOfProduct/201846460_-aspirin-plus-c-forte-800-mg-480-mg-brausetabletten-bayer.html";
    private static readonly OUTPUT_FILE_NAME = "./scraped_data/data.json";

    private scrapedItemsMap: Map<string, ScrapedItem>;

    public constructor() {
        this.scrapedItemsMap = new Map<string, ScrapedItem>();
    }

    public async run(): Promise<void> {
        try {
            console.log("Script started...");

            const browser = await Scraper.initBrowser();
        
            const page = await Scraper.initPage(browser);
            
            await Scraper.handleCookies(page);
            
            await Scraper.loadAllListItems(page);
            
            await this.scrape(page);
    
            await Scraper.closeBrowser(browser);
    
            await this.writeScrapedDataToFile();

            console.log("Script finished...");
        } catch(err: any) {
            console.log("An error happened while executing the script", err?.message);
        }
    }

    private static async initBrowser(): Promise<Browser> {
        const browser = await puppeteer.launch({headless: false});

        console.log("Browser initialization finished successfully.");

        return browser;
    }

    private static async initPage(browser: Browser): Promise<Page> {
        const page = await browser.newPage();
    
        await page.goto(Scraper.PAGE_LINK);
        await page.setViewport({width: 1080, height: 1024});

        console.log("Page initialization finished successfully.");
    
        return page;
    }

    private static async handleCookies(page: Page): Promise<void> {
        try {
            const cookiesAsideSelector = "aside";
            const shadowHostAcceptButtonSelector = "pierce/#accept";
    
            await page.waitForSelector(cookiesAsideSelector, Scraper.DEFAULT_WAIT_OPTIONS);
    
            await page.waitForSelector(shadowHostAcceptButtonSelector, Scraper.DEFAULT_WAIT_OPTIONS);
    
            await page.click(shadowHostAcceptButtonSelector);
        } catch (err: any) {
            console.log("Cookies modal didn't show up");
        }
    }

    private static async loadAllListItems(page: Page): Promise<void> {
        const loadMoreSelector = "button.productOffers-listLoadMore";

        let buttonPresent = true;
        const listElementsCount = await page.$$eval('.productOffers-listItemOfferPrice', elems => elems.length);
        if(listElementsCount == 0) {
            throw new Error("List elements count is 0.");
        }
        while (buttonPresent) {
            try {
                await page.waitForSelector(loadMoreSelector, Scraper.DEFAULT_WAIT_OPTIONS);
                await page.click(loadMoreSelector);
                await page.waitForFunction(`document.getElementsByClassName('productOffers-listItemOfferPrice').length > ${listElementsCount}`, {timeout: 5000});
            } catch(err: any) {
                buttonPresent = false;
            }
        }

        console.log("Successfully loaded all list items");
    }

    private async scrape(page: Page): Promise<void> {
        const scrapedDataFromAnchor = await page.$$eval('.productOffers-listItemOfferPrice', (anchorElems) => {
            return anchorElems.map(el => el.getAttribute('data-dl-click'));
        });

        for (let [index, element] of scrapedDataFromAnchor.entries()) {
            if(!element) {
                continue;
            }

            index++;

            const jsonifiedScrapedData = JSON.parse(element) as ItemInformatioFromListItem;
            
            if (Scraper.hasValidationErrors(jsonifiedScrapedData, element)) {
                continue;
            }

            this.scrapedItemsMap.set(index.toString(), {
                position: index,
                price: jsonifiedScrapedData.products[0].price,
                shop_name: jsonifiedScrapedData.shop_name
            })
        };

        console.log("Loading scraped data in memory finished successfully.");
    }

    private static async closeBrowser(browser: Browser): Promise<void> {
        await browser.close();

        console.log("Closing the browser finished successfully.");
    }

    private async writeScrapedDataToFile(): Promise<void> {
        const objToWrite: { [key: string]: any } = {};
        this.scrapedItemsMap.forEach((value, key) => {
            objToWrite[key] = value;
        });
        
        let stringifiedOutputData = null;

        try {
            stringifiedOutputData= JSON.stringify(objToWrite, null, 2);
        } catch(err: any) {
            console.log("Scraped data parsing error", err?.message);
            throw err;
        }

        console.log(`Sending data for writing in a file with path ${Scraper.OUTPUT_FILE_NAME}`);

        fs.writeFile(Scraper.OUTPUT_FILE_NAME, stringifiedOutputData, (err) => {
            if (err) {
                console.error(`Error writing scraped data in a file with path ${Scraper.OUTPUT_FILE_NAME}`, err);
            } else {
                console.log(`Successfully wrote scraped data in a file with path ${Scraper.OUTPUT_FILE_NAME}`);
            }
        });
    }

    private static hasValidationErrors(element: ItemInformatioFromListItem, stringifiedElement: string): boolean {
        let hasErrors = false;

        if(!element.products[0].price) {
            console.error("Price is undefined in a scraped element", JSON.stringify(stringifiedElement));
            hasErrors = true;
        }

        if(!element.shop_name) {
            console.error("Shop name is undefined in a scraped element", JSON.stringify(stringifiedElement));
            hasErrors = true;
        }

        return hasErrors;
    }
}