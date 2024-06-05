const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
require('dotenv').config();

const app = express();
const PORT = 9000;

const client = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
})


app.use(express.json());

app.post('/project/', async (req, res) => {
    const projectSlug = generateSlug();
    const { gitURL } = req.body;

    const command = new RunTaskCommand({
        cluster: process.env.CLUSTER,
        taskDefinition: process.env.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: process.env.SUBNETS.split(" "),
                securityGroups: [process.env.SECURITY_GROUP]
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'builder-image',
                    environment: [
                        { name: 'GIT_REPOSITORY__URL', value: gitURL },
                        { name: 'PROJECT_ID', value: projectSlug }
                    ]
                }
            ]
        }
    })

    await client.send(command);

    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.locahost:8000` } })
})

app.listen(PORT, () => {
    console.log(`API Server running on ${PORT}`)
})