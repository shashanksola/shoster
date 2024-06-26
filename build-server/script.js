require('dotenv').config();
const { exec } = require('child_process');
const { readdirSync, lstatSync, createReadStream } = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const Redis = require('ioredis');

const PROJECT_ID = process.env.PROJECT_ID;
const REDIS_PASS = process.env.REDIS_PASS;

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
})

const redis = new Redis({
    port: 17549, // Redis port
    host: "redis-17549.c212.ap-south-1-1.ec2.redns.redis-cloud.com", // Redis host
    username: "default", // needs Redis >= 6
    password: REDIS_PASS,
    db: 0, // Defaults to 0
});
redis.on('connection', () => console.log('Redis Connected'));

async function publishLog(log) {
    console.log(log);
    redis.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init() {
    console.log(`Reading Repository...`);
    publishLog(`Build Started....`);

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', (data) => {
        publishLog(data.toString());
    });

    p.stderr.on('error', (error) => {
        publishLog(`Error : ${error}`)
    })

    p.on('close', async () => {
        publishLog("Build Successful");

        let distFolderPath;
        let distFolderContents;

        try {
            distFolderPath = path.join(__dirname, 'output', 'dist');
            distFolderContents = readdirSync(distFolderPath, { recursive: true });
        } catch (e) {
            console.error(`Error: Cannot find dist folder, Searching build...`);
            distFolderPath = path.join(__dirname, "output", "build");
            distFolderContents = readdirSync(distFolderPath, { recursive: true });
        }

        publishLog('Starting to Upload');
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (lstatSync(filePath).isDirectory()) continue;
            console.log('Uploading ', filePath);
            publishLog(`Uploading ${file}`);

            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            });

            await s3Client.send(command);
        }

        publishLog(`S3 Upload Successfull`);
        process.exit(0);
    })
}

init();
console.log(process.env.BUCKET_NAME);