import fs from 'fs'
import path from 'path'
import {PronoteClient} from './seleniumWrapper'

const username = process.argv[2] || "no username given";
const password = process.argv[3] || "no password given";

(async () => {
    const client = new PronoteClient('0290010d');
    await client.initWebdriver();
    const pass = fs.readFileSync(path.join(__dirname, 'config')).toString().split('\n');
    await client.pronoteLogin(pass[0], pass[1]);

    await client.getGrades([]);
})();
