const { exec } = require('child_process');
require('dotenv').config();
const { readdirSync, lstatSync, createReadStream } = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
    console.log(`Reading Repository...`);

    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', (data) => {
        console.log(data.toString());
    });

    p.stderr.on('error', (error) => {
        console.log(`Error : ${error}`);
    })

    p.on('close', async () => {
        console.log("Build Successful");

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

        console.log('Starting to Upload');
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file);
            if (lstatSync(filePath).isDirectory()) continue;
            console.log('Uploading ', filePath);

            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            });

            await s3Client.send(command);
        }

        console.log(`S3 Upload Successfull`);
    })
}

init();
console.log(process.env.BUCKET_NAME);