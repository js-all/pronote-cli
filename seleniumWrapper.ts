import fs from 'fs';
import path from 'path'
import { Builder, By, Key, until, WebDriver, Condition, WebElement, Actions } from 'selenium-webdriver'
import { isIntersectionTypeNode } from 'typescript'

interface timeFrame {
    name: string,
    subjects: Subject[],
    averageSelf: number,
    averageClass: number
}

interface Subject {
    name: string,
    averageSelf: number,
    averageClass: number,
    averageMax: number,
    averageMin: number,
    numberTests: number,
    tests: Test[]
}

interface Test {
    name: string | null,
    gradeSelf: number,
    gradeClass: number,
    gradeMax: number,
    gradeMin: number,
    coefficient: number,
    gradeMaxValue: number,
    date: Date
}

export class PronoteClient {
    driver: WebDriver | undefined;
    school: string;
    private pLoggedIn = false;
    constructor(school: string) {
        this.school = school;
    }

    async initWebdriver() {
        const driver = await new Builder()
            .forBrowser('chrome')
            .build();
        this.driver = driver;
    }

    async pronoteLogin(username: string, password: string) {
        if (!this.driver) throw new Error('attempting to log in before initiating webdriver');
        await this.driver.get(`https://${this.school}.index-education.net/pronote/eleve.html`);

        await this.driver.wait(until.elementLocated(By.xpath('//input[contains(@title, "identifiant")]')));

        const usernameInput = await this.driver.findElement(By.xpath('//input[contains(@title, "identifiant")]'));
        const passwordInput = await this.driver.findElement(By.xpath('//input[contains(@title, "mot")]'));

        await usernameInput.sendKeys(username);
        await passwordInput.sendKeys(password, Key.ENTER);

        await this.driver.wait(until.elementLocated(By.xpath('//div[@class="home"]')));
        await wait(500);
        this.pLoggedIn = true;
    }
    /**
     * 
     * @param categories the "categories" (timeframe~) to get the grades from:
     *  0 - first quarter
     *  1 - second one
     *  2 - third one
     *  3 - white BAC (a test to test if you can pass the test)
     *  4 - white Brevet (same)
     *  5 - the rest
     *  an empty array will check all
     */
    async getGrades(categories: number[]) {
        // the the second part of the or here is useless, but its still here to make ts understand that driver cannot be undefined.
        if (!this.pLoggedIn || !this.driver) throw new Error(`attempting to retrieve grades on ${this.driver ? "a not loggedin" : "an uninitiated"} client`);

        // go to the Grades tab
        await (await this.driver.findElement(By.xpath('//div[text()="Notes"]'))).click();
        // bc fuck this ill make it better later (selenium wait until)
        ;
        const dropDown = await this.driver.wait(until.elementLocated(By.xpath('//h3[contains(text(), "Détail")]/following-sibling::div[1]')), 2000);
        const dropDownList = async (driver: WebDriver) => await driver.findElements(By.xpath('//li/div[contains(text(), "1")]/ancestor::ul/*'));

        const Grades: timeFrame[] = []

        for (let cate of (categories.length < 1 ? [0, 1, 2, 3, 4, 5] : categories)) {
            // open dropdown and choose time period
            await dropDown.click();
            await wait(500);
            await (await dropDownList(this.driver))[cate].click();
            // check if theres any grade and skip if there is none
            const timeout = await this.driver.manage().getTimeouts();
            await this.driver.manage().setTimeouts({ implicit: 1500 });
            if (await (await this.driver.findElements(By.xpath('//td[text()="Il n\'y a pas de notes pour la période sélectionnée."]'))).length > 0) {
                await this.driver.manage().setTimeouts(timeout);
                continue;
            }
            await this.driver.manage().setTimeouts(timeout);
            // get the the table containing the grades to store every element of the list
            const tableRowsWebEl = await this.driver.findElements(By.xpath('//table[@role="grid"]/tbody/tr'));
            // store the valign, as that will help us know if the row is a subject or a test
            const tableRows = await Promise.all(tableRowsWebEl.map(async v => ({
                valigntop: (await v.getAttribute("valign")) === "top",
                el: v
            })));
            // fill subjectWebElTree with the elements according to what the represent on the webpage.
            const subjectWebElTree: {
                webEl: WebElement,
                grades: WebElement[]
            }[] = [];
            tableRows.forEach((v, i, a) => {
                if (!v.valigntop) return;
                const nextVA = i + 1 < a.length ? a[i + 1].valigntop : true;
                if (!nextVA) {
                    subjectWebElTree.push({
                        webEl: v.el,
                        grades: []
                    });
                } else {
                    subjectWebElTree[subjectWebElTree.length - 1].grades.push(v.el);
                }
            });
            const timeFrame: timeFrame = {
                name: await dropDown.getText(),
                subjects: [],
                averageSelf: parseFloat((await (await this.driver.findElement(By.xpath('//span[contains(text(), "Moyenne")][contains(text(), "élève")]/span'))).getText()).replace(',', '.')),
                averageClass: parseFloat((await (await this.driver.findElement(By.xpath('//span[contains(text(), "Moyenne")][contains(text(), "classe")]/span'))).getText()).replace(',', '.'))
            };
            let first = true;
            const nextElAction = this.driver.actions()
                .sendKeys(Key.ARROW_DOWN)
                .sendKeys(Key.ENTER);
            for (let s of subjectWebElTree) {
                if (first) {
                    await s.webEl.click();
                    first = false;
                } else {
                    await nextElAction.perform();
                }
                const name = await (await this.driver.findElement(By.xpath('//div[@class="BlocDevoirEvaluation_Titre"]/span'))).getText();
                const nbrGrades = parseInt((await (await this.driver.findElement(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]//td[@class="AlignementHaut"][2]/div'))).getText()).split(':')[1]);
                const otherDataWebEls = await this.driver.findElements(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]//td[@class="AlignementHaut"][1]//tr/td[2]'));
                const [avgSelf, avgClass, avgMax, avgMin] = await Promise.all(otherDataWebEls.map(async v => parseFloat(await (await v.getText()).replace(',', '.'))));
                const test: Test[] = [];
                for (let t of s.grades) {
                    await nextElAction.perform();
                    const dateValues = (await (await t.findElement(By.xpath('//div[@class="BlocDevoirEvaluation_Titre"]'))).getText()).replace(/[^]+- Note du /, "").split("/").reverse();
                    const date = new Date(`${new Date().getFullYear() - (parseInt(dateValues[0]) > new Date().getMonth() + 1 ? 1 : 0)}-${dateValues[0]}-${dateValues[1]}T12:00:00`);;
                    const nbrTRs = await (await this.driver.findElements(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]/div/table/tbody/tr'))).length;
                    const name = nbrTRs < 2 ? null : await (await this.driver.findElement(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]//tr[1]//div'))).getText();
                    const coef = parseFloat((await (await this.driver.findElement(By.xpath(`//div[@class="BlocDevoirEvaluation_Contenu"]//tr[last()]/td[2]//div`))).getText()).split(':')[1].replace(',', '.'));
                    const maxStr = (await (await this.driver.findElement(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]//tr[last()]/td[1]//tr[1]/td[2]'))).getText());
                    const max = maxStr.indexOf('/') === -1 ? 20 : parseFloat(maxStr.split('/')[1]);
                    const otherDataWebEls = await this.driver.findElements(By.xpath('//div[@class="BlocDevoirEvaluation_Contenu"]//tr[last()]/td[1]//tr/td[2]'));
                    const [gSelf, gClass, gMax, gMin] = await Promise.all(otherDataWebEls.map(async v => parseFloat(await v.getText())));
                    test.push({
                        coefficient: coef,
                        date: date,
                        gradeClass: gClass,
                        gradeMax: gMax,
                        gradeMaxValue: max,
                        gradeMin: gMin,
                        gradeSelf: gSelf,
                        name: name
                    });
                }
                timeFrame.subjects.push({
                    name: name,
                    numberTests: nbrGrades,
                    averageSelf: avgSelf,
                    averageClass: avgClass,
                    averageMax: avgMax,
                    averageMin: avgMin,
                    tests: test
                });
            }
            Grades.push(timeFrame);
        }
        fs.writeFileSync(path.join(__dirname, 'res.json'), JSON.stringify(Grades, null, 4));
        return Grades;
    }
}

function wait(durationInMs: number) {
    return new Promise<void>((res) => {
        setTimeout(res, durationInMs);
    })
}