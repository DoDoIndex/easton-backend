import mysql from 'mysql2';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  timezone: '+00:00',
});

const mysqlPool = pool.promise();

export default mysqlPool;
