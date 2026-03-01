import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_ENV_PATH = path.resolve(__dirname, '../../../.env');

dotenv.config({ path: ROOT_ENV_PATH });
