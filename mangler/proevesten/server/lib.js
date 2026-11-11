"use strict";

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 700 * 1024;
const MAX_NAME = 80;
const MAX_COMMENT = 1000;
const MAX_PER_DEFECT = 40;
const MAX_TOTAL = 2000;

class ApiError extends Error {
  constructor(status, fejl) {
    super(fejl);
    this.status = status;
    this.fejl = fejl;
  }
}

function cleanText(value, max) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > max) {
    throw new ApiError(400, `Teksten må højst være ${max} tegn.`);
  }
  return text;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return (
    origin === "https://zenkodanmark.github.io" ||
    /^http:\/\/localhost(?::\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)
  );
}

function magicType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { type: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

function decodeImage(entry) {
  if (!entry || typeof entry !== "object") {
    throw new ApiError(400, "Et billede kunne ikke læses.");
  }
  let raw = String(entry.data || "").trim();
  const dataUrl = raw.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([\s\S]+)$/i);
  if (dataUrl) raw = dataUrl[1];
  raw = raw.replace(/\s/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new ApiError(400, "Et billede kunne ikke læses.");
  }
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) {
    throw new ApiError(400, "Et billede er for stort. Tag det igen, så telefonen gør det mindre.");
  }
  const kind = magicType(bytes);
  if (!kind) throw new ApiError(400, "Kun jpeg, png eller webp.");
  return { bytes, type: kind.type, ext: kind.ext };
}

function validateInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Ugyldig forespørgsel.");
  }
  const nummer = String(body.nummer || "").trim();
  if (!/^L\d{2}-\d{1,6}$/.test(nummer)) {
    throw new ApiError(400, "Manglen blev ikke genkendt.");
  }
  const id = String(body.id || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new ApiError(400, "Ugyldigt id. Prøv igen.");
  }
  const navn = cleanText(body.navn, MAX_NAME);
  if (!navn) throw new ApiError(400, "Skriv dit navn.");
  const kommentar = cleanText(body.kommentar, MAX_COMMENT);
  const billeder = body.billeder;
  if (!Array.isArray(billeder) || billeder.length < 1) {
    throw new ApiError(400, "Tag mindst ét billede.");
  }
  if (billeder.length > MAX_PHOTOS) {
    throw new ApiError(400, `Højst ${MAX_PHOTOS} billeder ad gangen.`);
  }
  const images = billeder.map(decodeImage);
  return { id, nummer, navn, kommentar, images };
}

function findDefect(catalog, nummer) {
  const list = catalog && Array.isArray(catalog.mangler) ? catalog.mangler : null;
  if (!list) throw new ApiError(500, "mangler.json kan ikke læses.");
  return list.find((item) => item && item.nummer === nummer) || null;
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildRegistration(input, now) {
  const when = now instanceof Date ? now : new Date();
  const prefix = `billeder/${input.nummer}/${stamp(when)}-${input.id.slice(0, 8)}`;
  return {
    id: input.id,
    nummer: input.nummer,
    navn: input.navn,
    kommentar: input.kommentar,
    tidspunkt: when.toISOString(),
    billeder: input.images.map((image, index) => ({
      sti: `${prefix}-${index + 1}.${image.ext}`,
      type: image.type,
      bytes: image.bytes.length,
    })),
  };
}

function appendRegistration(doc, registration) {
  const base = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  const list = Array.isArray(base.registreringer) ? base.registreringer : [];
  return {
    ...base,
    version: 1,
    registreringer: [...list, registration],
  };
}

function filesForCommit(root, nextDoc, registration, images) {
  const files = registration.billeder.map((meta, index) => ({
    path: `${root}/${meta.sti}`,
    content: images[index].bytes,
  }));
  files.push({
    path: `${root}/udfoert.json`,
    content: Buffer.from(`${JSON.stringify(nextDoc, null, 2)}\n`, "utf8"),
  });
  return files;
}

async function processUpload({ body, github, now, root }) {
  const mappe = root || "mangler/proevesten";
  const input = validateInput(body);
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const catalog = await github.readJson(`${mappe}/mangler.json`);
    if (!catalog) throw new ApiError(500, "mangler.json mangler i repoet.");
    const done = (await github.readJson(`${mappe}/udfoert.json`)) || {
      version: 1,
      registreringer: [],
    };
    const defect = findDefect(catalog, input.nummer);
    if (!defect) throw new ApiError(404, "Manglen findes ikke. Tilføj den i mangler.json først.");
    if (defect.vores === false) throw new ApiError(403, "Den mangel er ikke Zenko's.");
    if (defect.status === "lukket") throw new ApiError(409, "Manglen er lukket i RIB.");
    const registreringer = Array.isArray(done.registreringer) ? done.registreringer : [];
    const existing = registreringer.find((item) => item && item.id === input.id);
    if (existing) return { registrering: existing, gentaget: true };
    if (registreringer.length >= MAX_TOTAL) {
      throw new ApiError(409, "Der er for mange registreringer. Sig til kontoret.");
    }
    const onThis = registreringer.filter((item) => item && item.nummer === input.nummer).length;
    if (onThis >= MAX_PER_DEFECT) {
      throw new ApiError(409, "Der er allerede mange registreringer på denne mangel.");
    }
    const registration = buildRegistration(input, now || new Date());
    const nextDoc = appendRegistration(done, registration);
    const files = filesForCommit(mappe, nextDoc, registration, input.images);
    const message = `Mangel ${input.nummer} udført af ${input.navn}`;
    try {
      const commit = await github.commit(files, message);
      return { registrering: registration, commit };
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === 4) break;
    }
  }
  if (lastError && (lastError.status === 401 || lastError.status === 403)) {
    throw new ApiError(502, "GitHub afviste adgangen. Tjek GITHUB_TOKEN på serveren.");
  }
  throw new ApiError(503, "Kunne ikke gemme. Prøv igen om et øjeblik.");
}

module.exports = {
  ApiError,
  MAX_PHOTOS,
  appendRegistration,
  buildRegistration,
  cleanText,
  decodeImage,
  filesForCommit,
  findDefect,
  isAllowedOrigin,
  magicType,
  processUpload,
  validateInput,
};
