const express = require('express');
const httpProxy = require('http-proxy');

const app = express();
const PORT = 8000;

const proxy = httpProxy.createProxy();

app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];

    const resolveto = `https://shoster.s3.ap-south-1.amazonaws.com/__outputs/${subdomain}`

    proxy.web(req, res, { target: resolveto, changeOrigin: true })
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/') proxyReq.path += 'index.html';
})

app.listen(PORT, () => {
    console.log(`Reverse Proxy Running on ${PORT}`)
})