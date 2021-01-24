import fs from 'fs'
import { Driver } from 'selenium-webdriver/chrome';
import {PronoteClient} from './seleniumWrapper'

const username = process.argv[2] || "no username given";
const password = process.argv[3] || "no password given";

(async () => {
    const client = new PronoteClient('0290010d');
    await client.initWebdriver();
    await client.pronoteLogin(username, password);

    console.log(await client.getGrades([]));
})();
