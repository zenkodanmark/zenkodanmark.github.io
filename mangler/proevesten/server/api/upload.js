"use strict";

// Vercel serverless-funktion. Hemmeligheden er environment-variablen GITHUB_TOKEN.
// Den må ikke stå i kildekoden, i config.js eller i browseren.
// MARKER: uden GITHUB_TOKEN svarer funktionen 503, og siden gemmer ingenting.

const { ApiError, isAllowedOrigin, processUpload } = require("../lib");
const { createGithub } = require("../github");

const MAX_BODY = 4_000_000;

function send(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.end(payload);
}

function cors(res, origin) {
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const declared = Number(req.headers?.["content-length"] || 0);
  if (declared > MAX_BODY) throw new ApiError(413, "Billederne fylder for meget.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new ApiError(413, "Billederne fylder for meget.");
    chunks.push(buffer);
  }
  if (!size) throw new ApiError(400, "Tom forespørgsel.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Ugyldig forespørgsel.");
  }
}

async function handler(req, res) {
  const origin = req.headers?.origin || "";
  cors(res, origin);
  if (origin && !isAllowedOrigin(origin)) {
    send(res, 403, { ok: false, fejl: "Ukendt afsender." }, "");
    return;
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === "GET") {
    send(
      res,
      200,
      {
        ok: true,
        tjeneste: "proevesten-mangler",
        opsat: Boolean(process.env.GITHUB_TOKEN),
      },
      origin,
    );
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { ok: false, fejl: "Metoden er ikke tilladt." }, origin);
    return;
  }
  try {
    const body = await readBody(req);
    const github = createGithub({
      token: process.env.GITHUB_TOKEN,
      repo: process.env.GITHUB_REPO,
      branch: process.env.GITHUB_BRANCH,
    });
    const result = await processUpload({
      body,
      github,
      root: process.env.MANGLER_DIR || "mangler/proevesten",
    });
    send(res, 200, { ok: true, ...result }, origin);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const fejl = error instanceof ApiError ? error.fejl : "Noget gik galt. Prøv igen.";
    send(res, status, { ok: false, fejl }, origin);
  }
}

module.exports = handler;
