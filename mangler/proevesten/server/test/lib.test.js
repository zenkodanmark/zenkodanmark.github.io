"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const handler = require("../api/upload");
const {
  ApiError,
  appendRegistration,
  isAllowedOrigin,
  processUpload,
  validateInput,
} = require("../lib");

const ROOT = path.resolve(__dirname, "../..");
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==",
  "base64",
);

function input(over = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    nummer: "L00-1599",
    navn: " Anders  ",
    kommentar: "Fuge lukket",
    billeder: [{ data: JPEG.toString("base64"), type: "image/jpeg" }],
    ...over,
  };
}

function catalog(status = "aaben", vores = true) {
  return {
    version: 1,
    mangler: [
      { nummer: "L00-1599", status, vores: true, titel: "Fuge" },
      { nummer: "L00-1292", status: "aaben", vores: false, titel: "Lukkes" },
      ...(vores ? [] : []),
    ],
  };
}

function memoryGithub(seed = {}) {
  const store = {
    "mangler/proevesten/mangler.json": catalog(),
    "mangler/proevesten/udfoert.json": { version: 1, registreringer: [] },
    ...seed,
  };
  const commits = [];
  let conflictsLeft = 0;
  return {
    store,
    commits,
    failNext(count) {
      conflictsLeft = count;
    },
    async readJson(file) {
      return store[file] ? structuredClone(store[file]) : null;
    },
    async commit(files, message) {
      if (conflictsLeft > 0) {
        conflictsLeft -= 1;
        const error = new Error("Update is not a fast forward");
        error.status = 422;
        error.retryable = true;
        throw error;
      }
      for (const file of files) {
        if (file.path.endsWith(".json")) store[file.path] = JSON.parse(file.content.toString("utf8"));
        else store[file.path] = Buffer.from(file.content);
      }
      commits.push(message);
      return "abc123";
    },
  };
}

test("validerer navn, id og jpeg", () => {
  const value = validateInput(input());
  assert.equal(value.navn, "Anders");
  assert.equal(value.images[0].ext, "jpg");
  assert.equal(value.images[0].bytes.length, JPEG.length);
});

test("afviser tomt navn, fremmed format og for mange billeder", () => {
  assert.throws(() => validateInput(input({ navn: "  " })), (error) => error.fejl === "Skriv dit navn.");
  assert.throws(
    () => validateInput(input({ billeder: [{ data: Buffer.from("not-an-image").toString("base64") }] })),
    (error) => error instanceof ApiError && error.fejl === "Kun jpeg, png eller webp.",
  );
  assert.throws(
    () => validateInput(input({ billeder: [] })),
    (error) => error.fejl === "Tag mindst ét billede.",
  );
});

test("gemmer billeder og registrering i ét commit", async () => {
  const github = memoryGithub();
  const now = new Date("2026-11-11T09:30:00.000Z");
  const result = await processUpload({ body: input(), github, now });
  assert.equal(result.registrering.navn, "Anders");
  assert.equal(result.registrering.billeder.length, 1);
  assert.match(result.registrering.billeder[0].sti, /^billeder\/L00-1599\/20261111T093000Z-aaaaaaaa-1\.jpg$/);
  const saved = github.store["mangler/proevesten/udfoert.json"];
  assert.equal(saved.registreringer.length, 1);
  assert.ok(Buffer.isBuffer(github.store[`mangler/proevesten/${result.registrering.billeder[0].sti}`]));
  assert.equal(github.commits.length, 1);
  assert.match(github.commits[0], /L00-1599/);
});

test("samme id to gange laver ikke et nyt commit", async () => {
  const github = memoryGithub();
  await processUpload({ body: input(), github, now: new Date("2026-11-11T09:30:00.000Z") });
  const again = await processUpload({ body: input(), github, now: new Date("2026-11-11T09:40:00.000Z") });
  assert.equal(again.gentaget, true);
  assert.equal(github.commits.length, 1);
  assert.equal(github.store["mangler/proevesten/udfoert.json"].registreringer.length, 1);
});

test("prøver igen når GitHub afviser et samtidig commit", async () => {
  const github = memoryGithub();
  github.failNext(1);
  const result = await processUpload({ body: input(), github, now: new Date("2026-11-11T09:30:00.000Z") });
  assert.equal(result.commit, "abc123");
  assert.equal(github.store["mangler/proevesten/udfoert.json"].registreringer.length, 1);
});

test("afviser andres entrepriser og mangler lukket i RIB", async () => {
  const github = memoryGithub();
  await assert.rejects(processUpload({ body: input({ nummer: "L00-1292" }), github }), (error) => error.status === 403);
  github.store["mangler/proevesten/mangler.json"].mangler[0].status = "lukket";
  await assert.rejects(processUpload({ body: input(), github }), (error) => error.status === 409);
  assert.equal(github.commits.length, 0);
});

test("append bevarer eksisterende registreringer", () => {
  const next = appendRegistration(
    { version: 1, registreringer: [{ id: "old" }] },
    { id: "new" },
  );
  assert.deepEqual(
    next.registreringer.map((item) => item.id),
    ["old", "new"],
  );
});

test("kun siden og lokal afprøvning må kalde upload", () => {
  assert.equal(isAllowedOrigin("https://zenkodanmark.github.io"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:4173"), true);
  assert.equal(isAllowedOrigin("https://example.com"), false);
  assert.equal(isAllowedOrigin(""), true);
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload || "";
    },
  };
}

test("funktionen gemmer ingenting uden GITHUB_TOKEN og afviser fremmede sider", async () => {
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    const missing = mockRes();
    await handler(
      {
        method: "POST",
        headers: { origin: "https://zenkodanmark.github.io" },
        body: input(),
      },
      missing,
    );
    assert.equal(missing.statusCode, 503);
    assert.match(missing.body, /GITHUB_TOKEN/);

    const foreign = mockRes();
    await handler(
      { method: "POST", headers: { origin: "https://evil.example" }, body: input() },
      foreign,
    );
    assert.equal(foreign.statusCode, 403);
    assert.equal(foreign.headers["Access-Control-Allow-Origin"], undefined);
  } finally {
    if (previous) process.env.GITHUB_TOKEN = previous;
  }
});

test("kataloget har 13 mangler og de PDF'er der står i filen", () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "mangler.json"), "utf8"));
  assert.equal(data.version, 1);
  assert.equal(data.mangler.length, 13);
  const numbers = data.mangler.map((item) => item.nummer);
  assert.equal(new Set(numbers).size, 13);
  const notOurs = data.mangler.filter((item) => item.vores === false).map((item) => item.nummer).sort();
  assert.deepEqual(notOurs, ["L00-1292", "L00-1445", "L00-1511"]);
  for (const item of data.mangler) {
    assert.match(item.nummer, /^L\d{2}-\d+$/);
    assert.ok(item.titel && item.lokation && item.beskrivelse && item.ansvarlig);
    assert.match(item.frist, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(item.oprettet, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.status === "aaben" || item.status === "lukket");
    assert.equal(typeof item.vores, "boolean");
    const pdf = path.join(ROOT, item.pdf);
    assert.ok(fs.existsSync(pdf), item.pdf);
    assert.ok(fs.statSync(pdf).size > 10000, item.pdf);
  }
  const done = JSON.parse(fs.readFileSync(path.join(ROOT, "udfoert.json"), "utf8"));
  assert.deepEqual(done.registreringer, []);
});
