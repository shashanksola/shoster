const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
require('dotenv').config();
const Redis = require('ioredis');
const { Server } = require('socket.io');
const { z } = require("zod");
const { error } = require('console');

const app = express();
const PORT = 9000;
const REDIS_PASS = process.env.REDIS_PASS;

const redis = new Redis({
    port: 17549, // Redis port
    host: "redis-17549.c212.ap-south-1-1.ec2.redns.redis-cloud.com", // Redis host
    username: "default", // needs Redis >= 6
    password: REDIS_PASS,
    db: 0, // Defaults to 0
});

redis.on('connection', () => console.log('connected to redis server'));

const io = new Server({ cors: "*" });

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9002, () => {
    console.log('Socket Server running on 9002');
})

const client = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY
    }
})


app.use(express.json());

app.post('/project', async (req, res) => {
    const schema = z.object({
        name: z.string(),
        gitURL: z.string()
    })
    const safeParseResult = schema.safeParse(req.body);
    const { name, gitURL } = req.body;

    if (safeParseResult.error) return res.status(400).json({ error: safeParseResult.error });

    const { } = safeParseResult.data;


})

app.post('/deploy', async (req, res) => {
    const { gitURL, slug } = req.body;
    const projectSlug = slug ? slug : generateSlug();

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

async function innitRedisSubsription() {
    console.log('Subscribed to logs....')
    redis.psubscribe('logs:*')
    redis.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}

innitRedisSubsription();

app.listen(PORT, () => {
    console.log(`API Server running on ${PORT}`);
});