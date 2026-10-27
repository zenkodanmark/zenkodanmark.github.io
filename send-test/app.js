// Offentlig Supabase-nøgle (publishable/anon), samme projekt som Zenko Plads.
// Service role-nøglen må aldrig lægges her. Den kan læse filerne.
const SUPABASE_URL = "https://jauggqxhemjnbxoxkpeh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GDFhOi3Ek3XmECz2NHQC0g_3qPvPC93";
const BUCKET = "liva-indbakke";

const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_RAW_IMAGE = 30 * 1024 * 1024;

const actionsEl = document.querySelector("#actions");
const cameraInput = document.querySelector("#camera");
const scanInput = document.querySelector("#scan");
const galleryInput = document.querySelector("#gallery");
const filesEl = document.querySelector("#files");
const countEl = document.querySelector("#count");
const formEl = document.querySelector("#form");
const senderEl = document.querySelector("#sender");
const noteEl = document.querySelector("#note");
const statusEl = document.querySelector("#status");
const sendEl = document.querySelector("#send");

const items = [];
let busy = false;

cameraInput.addEventListener("change", () => takeFiles(cameraInput, "foto"));
scanInput.addEventListener("change", () => takeFiles(scanInput, "dokument"));
galleryInput.addEventListener("change", () => takeFiles(galleryInput, "galleri"));
formEl.addEventListener("submit", send);
senderEl.addEventListener("input", clearSuccess);
noteEl.addEventListener("input", clearSuccess);

function uuid() {
  const value = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
  return value.toLowerCase();
}

function fallbackUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function kindOf(file) {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/svg+xml" || name.endsWith(".svg")) return "other";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(name)) return "image";
  return "other";
}

function isHeic(file) {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = text ? `status ${kind}` : "status";
  if (text) statusEl.scrollIntoView({ block: "nearest" });
}

function clearSuccess() {
  if (statusEl.classList.contains("ok")) setStatus("", "");
}

function setBusy(next) {
  busy = next;
  actionsEl.classList.toggle("is-disabled", busy);
  for (const input of [cameraInput, scanInput, galleryInput]) input.disabled = busy;
  render();
}

async function takeFiles(input, mode) {
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length || busy) return;
  clearSuccess();
  setBusy(true);
  setStatus("Gør klar…", "info");
  let message = "";
  try {
    for (const file of files) {
      if (items.length >= MAX_FILES) {
        message = `Højst ${MAX_FILES} filer ad gangen.`;
        break;
      }
      try {
        items.push(await prepareFile(file, mode));
      } catch (error) {
        message = error instanceof Error ? error.message : "Filen kunne ikke bruges.";
      }
    }
  } finally {
    setBusy(false);
    setStatus(message, message ? "error" : "");
  }
}

async function prepareFile(file, mode) {
  const kind = kindOf(file);
  if (kind === "other") throw new Error("Kun billeder og PDF. Filen blev sprunget over.");
  if (file.size === 0) throw new Error("Filen er tom.");

  if (kind === "pdf") {
    if (file.size > MAX_BYTES) throw new Error("PDF'en er over 8 MB. Send en mindre fil.");
    return {
      id: uuid(),
      name: file.name || "dokument.pdf",
      blob: file,
      mime: "application/pdf",
      ext: "pdf",
      previewUrl: "",
      bytes: file.size,
    };
  }

  if (file.size > MAX_RAW_IMAGE) {
    throw new Error("Billedet er for stort til telefonen. Tag et nyt, eller vælg et mindre.");
  }

  try {
    const blob = await compressImage(file, mode === "dokument" ? "dokument" : "foto");
    return {
      id: uuid(),
      name: file.name || (mode === "dokument" ? "scanning.jpg" : "billede.jpg"),
      blob,
      mime: "image/jpeg",
      ext: "jpg",
      previewUrl: URL.createObjectURL(blob),
      bytes: blob.size,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Billedet")) throw error;
    if (isHeic(file) && file.size <= MAX_BYTES) {
      const heif = file.name.toLowerCase().endsWith(".heif") || file.type === "image/heif";
      return {
        id: uuid(),
        name: file.name || (heif ? "billede.heif" : "billede.heic"),
        blob: file,
        mime: heif ? "image/heif" : file.type || "image/heic",
        ext: heif ? "heif" : "heic",
        previewUrl: "",
        bytes: file.size,
      };
    }
    throw new Error("Billedet kunne ikke læses. Prøv at tage det med kameraet i stedet.");
  }
}

async function compressImage(file, mode) {
  const decoded = await decodeImage(file);
  try {
    const width = decoded.source.width || decoded.source.naturalWidth;
    const height = decoded.source.height || decoded.source.naturalHeight;
    if (!width || !height) throw new Error("decode");

    const maxEdge = mode === "dokument" ? 2200 : 1600;
    let scale = Math.min(1, maxEdge / Math.max(width, height));
    let quality = mode === "dokument" ? 0.82 : 0.72;
    const softCap = mode === "dokument" ? 1400000 : 900000;
    let blob = await renderJpeg(decoded.source, width, height, scale, quality, mode);
    for (let attempt = 0; blob.size > softCap && attempt < 4; attempt += 1) {
      if (quality > 0.52) quality = Math.max(0.52, +(quality - 0.1).toFixed(2));
      else scale *= 0.8;
      blob = await renderJpeg(decoded.source, width, height, scale, quality, mode);
    }
    if (blob.size > MAX_BYTES) throw new Error("Billedet fylder stadig for meget efter komprimering.");
    return blob;
  } finally {
    decoded.cleanup();
  }
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, cleanup() { bitmap.close(); } };
    } catch {
      /* Prøv et almindeligt billedelement, fx hvis formatet ikke kan afkodes her. */
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { source: image, cleanup() { URL.revokeObjectURL(url); } };
}

function renderJpeg(source, width, height, scale, quality, mode) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (mode === "dokument") context.filter = "contrast(1.16) brightness(1.04)";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
      "image/jpeg",
      quality,
    );
  });
}

function removeItem(id) {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  const [item] = items.splice(index, 1);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  clearSuccess();
  render();
}

function render() {
  countEl.textContent = items.length
    ? items.length === 1
      ? "1 fil klar."
      : `${items.length} filer klar.`
    : "Ingen filer valgt endnu.";
  sendEl.disabled = busy || items.length === 0;
  filesEl.replaceChildren();

  for (const item of items) {
    const tile = document.createElement("li");
    tile.className = "tile";

    const frame = document.createElement("div");
    frame.className = "frame";
    if (item.previewUrl) {
      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = item.name;
      frame.append(image);
    } else {
      const mark = document.createElement("span");
      mark.className = "pdf-mark";
      mark.textContent = item.ext === "pdf" ? "PDF" : item.ext.toUpperCase();
      frame.append(mark);
    }

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    const size = document.createElement("span");
    size.textContent = formatBytes(item.bytes);
    meta.append(size);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "Fjern";
    remove.setAttribute("aria-label", `Fjern ${item.name}`);
    remove.disabled = busy;
    remove.addEventListener("click", () => removeItem(item.id));

    tile.append(frame, name, meta, remove);
    filesEl.append(tile);
  }
}

async function send(event) {
  event.preventDefault();
  if (busy) return;
  if (!items.length) {
    setStatus("Tilføj mindst ét billede eller en PDF.", "error");
    return;
  }

  const snapshot = items.slice();
  const sender = senderEl.value.trim().slice(0, 120);
  const note = noteEl.value.trim().slice(0, 2000);
  const folder = uuid();
  const paths = [];

  setBusy(true);
  try {
    for (let index = 0; index < snapshot.length; index += 1) {
      const item = snapshot[index];
      setStatus(`Sender ${index + 1} af ${snapshot.length}…`, "info");
      const path = `${folder}/${item.id}.${item.ext}`;
      await uploadObject(path, item.blob, item.mime);
      paths.push(path);
    }
    setStatus("Registrerer…", "info");
    await insertRow({
      sender: sender || null,
      note: note || null,
      file_paths: paths,
    });
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    items.length = 0;
    senderEl.value = "";
    noteEl.value = "";
    setStatus("Sendt. LIVA har modtaget det. Du kan lukke siden.", "ok");
  } catch (error) {
    const failedLate = paths.length > 0;
    const message = error instanceof Error ? error.message : "Det lykkedes ikke at sende. Prøv igen.";
    setStatus(
      failedLate ? `${message} Intet blev registreret hos LIVA. Prøv igen.` : message,
      "error",
    );
  } finally {
    setBusy(false);
  }
}

function apiHeaders(extra) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function uploadObject(path, blob, mime) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      credentials: "omit",
      headers: apiHeaders({
        "Content-Type": mime,
        "x-upsert": "false",
      }),
      body: blob,
      signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined,
    });
  } catch (error) {
    throw new Error(networkMessage(error));
  }
  if (!response.ok) throw new Error(await messageFrom(response));
}

async function insertRow(row) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/liva_indleveringer`, {
      method: "POST",
      credentials: "omit",
      headers: apiHeaders({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });
  } catch (error) {
    throw new Error(networkMessage(error));
  }
  if (!response.ok) throw new Error(await messageFrom(response));
}

function networkMessage(error) {
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Det tog for lang tid. Tjek nettet og prøv igen.";
  }
  return "Ingen forbindelse. Tjek nettet og prøv igen.";
}

async function messageFrom(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return danishError(response.status, body);
}

function danishError(status, body) {
  const text = `${body.message || ""} ${body.error || ""} ${body.code || ""} ${body.details || ""}`.toLowerCase();
  if (text.includes("bucket") || text.includes("pgrst205") || text.includes("schema cache") || status === 404) {
    return "Indbakken er ikke klar endnu. Zenko skal køre SQL-opsætningen i Supabase, før der kan sendes.";
  }
  if (status === 413 || text.includes("too large") || text.includes("exceeded") || text.includes("payload")) {
    return "En fil er for stor. Prøv et mindre billede eller en mindre PDF.";
  }
  if (status === 415 || text.includes("mime") || text.includes("invalid")) {
    return "Filtypen blev afvist. Send et billede eller en PDF.";
  }
  if (status === 401 || status === 403) {
    return "Afsendelsen blev afvist. Bed Zenko tjekke, at indbakken kun tillader nye indlæg.";
  }
  return "Det lykkedes ikke at sende. Prøv igen om et øjeblik.";
}
