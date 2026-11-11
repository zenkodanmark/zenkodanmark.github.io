"use strict";

// Lokal afprøvning: GITHUB_TOKEN=... node dev-server.js
// Lytter kun på 127.0.0.1. Ingen token i denne fil.

const http = require("http");
const handler = require("./api/upload");

const port = Number(process.env.PORT || 8787);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/api/upload") {
    res.statusCode = 404;
    res.end();
    return;
  }
  return handler(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Upload lytter på http://127.0.0.1:${port}/api/upload`);
  console.log(process.env.GITHUB_TOKEN ? "GITHUB_TOKEN er sat." : "GITHUB_TOKEN mangler. POST svarer 503.");
});
