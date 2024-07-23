require('dotenv').config();
const { exec } = require('child_process');
const { readdirSync, lstatSync, createReadStream, readFileSync } = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const { Kafka } = require('kafkajs');



const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const KAFKA_BROKER = process.env.KAFKA_BROKER;

const kafka = new Kafka({
    clientId: `docker-build-server-${DEPLOYMENT_ID}`,
    brokers: ['shoster-logs-shashanksola1010-8056.i.aivencloud.com:16754'],
    sasl: {
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
        mechanism: 'plain'
    },
    ssl: {
        ca: [readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')]
    }
})

const producer = kafka.producer();

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
})


async function publishLog(log) {
    console.log(log);
    await producer.send({ topic: 'container-logs', messages: [{ key: 'log', value: JSON.stringify({ PROJECT_ID, DEPLOYMENT_ID, log }) }] })
}

async function init() {

    await producer.connect();

    console.log(`Reading Repository...`);
    await publishLog(`Build Started....`);

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', async (data) => {
        await publishLog(data.toString());
    });

    p.stderr.on('error', async (error) => {
        await publishLog(`Error : ${error}`)
    })

    p.on('close', async () => {
        await publishLog("Build Successful");

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

        await publishLog('Starting to Upload');
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (lstatSync(filePath).isDirectory()) continue;
            console.log('Uploading ', filePath);
            await publishLog(`Uploading ${file}`);

            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            });

            await s3Client.send(command);
        }

        await publishLog(`S3 Upload Successfull`);
        process.exit(0);
    })
}
init();