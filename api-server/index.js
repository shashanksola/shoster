const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
require('dotenv').config();
const cors = require('cors');
const { Server } = require('socket.io');
const { z } = require("zod");
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@clickhouse/client');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const { readFileSync } = require('fs');
const path = require('path');

const app = express();
const PORT = 9000;
const prisma = new PrismaClient({});

const clickclient = createClient({
    host: "https://shoster-clickhouse-shashanksola1010-8056.d.aivencloud.com:16742",
    username: "avnadmin",
    password: "AVNS_mDthyyR-XfStcifKL5V",
    database: "default",
})

const kafka = new Kafka({
    clientId: `api-server`,
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

const consumer = kafka.consumer({ groupId: 'api-server-logs-consumer' })

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
app.use(cors());

app.post('/project', async (req, res) => {
    const schema = z.object({
        name: z.string(),
        gitURL: z.string()
    })
    const safeParseResult = schema.safeParse(req.body);

    if (safeParseResult.error) return res.status(400).json({ error: safeParseResult.error });

    const { name, gitURL } = safeParseResult.data;

    const project = await prisma.project.create({
        data: {
            name, gitURL, subDomain: generateSlug()
        }
    })

    return res.json({ status: 'success', data: { project } })
})

app.post('/deploy', async (req, res) => {
    const { projectId } = req.body;

    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) return res.status(404).json({ error: 'Project Not Found' });

    const deployment = await prisma.deployment.create({
        data: {
            project: { connect: { id: projectId } },
            status: 'QUEUED'
        }
    })

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
                        { name: 'GIT_REPOSITORY__URL', value: project.gitURL },
                        { name: 'PROJECT_ID', value: projectId },
                        { name: 'DEPLOYMENT_ID', value: deployment.id }
                    ]
                }
            ]
        }
    })

    await client.send(command);

    return res.json({ status: 'queued', data: { deploymentId: deployment.id } })
})

app.get('/logs/:id', async (req, res) => {
    const id = req.params.id;
    const logs = await clickclient.query({
        query: `SELECT event_id, deployment_id, log, timestamp from log_events where deployment_id = {deployment_id:String}`,
        query_params: {
            deployment_id: id
        },
        format: 'JSONEachRow'
    })

    const rawLogs = await logs.json()

    return res.json({ logs: rawLogs })
})

async function initKafkaConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topics: ['container-logs'] });
    await consumer.run({
        autoCommit: false,
        eachBatch: async function ({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) {
            const messages = batch.messages;
            console.log(`Received  ${messages.length} messages..`);
            for (const message of messages) {
                const stringMessage = message.value.toString()
                const { PROJECT_ID, DEPLOYMENT_ID, log } = JSON.parse(stringMessage);
                console.log({ log, DEPLOYMENT_ID });
                try {
                    const { query_id } = await clickclient.insert({
                        table: 'log_events',
                        values: [{ event_id: uuidv4(), deployment_id: DEPLOYMENT_ID, log }],
                        format: 'JSONEachRow'
                    })
                    console.log(query_id);
                    commitOffsetsIfNecessary(message.offset);
                    await resolveOffset(message.offset);
                    await heartbeat()
                } catch (err) {
                    console.log(err);
                }
            }
        }
    })
}


initKafkaConsumer();
app.listen(PORT, () => {
    console.log(`API Server running on ${PORT}`);
});