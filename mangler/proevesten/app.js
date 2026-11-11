(() => {
  const config = window.MANGLER_CONFIG || {};
  const uploadUrl = String(config.uploadUrl || "").trim();
  const repo = config.repo || "zenkodanmark/zenkodanmark.github.io";
  const branch = config.branch || "main";
  const mappe = config.mappe || "mangler/proevesten";
  const rawBase = `https://raw.githubusercontent.com/${repo}/${branch}/${mappe}/`;
  const NAVN_KEY = "zenko-proevesten-navn";
  const MAX_PHOTOS = 4;

  const STATUS = {
    aaben: "Åben",
    udfoert: "Udført af Zenko",
    lukket: "Lukket i RIB",
  };

  const state = {
    projekt: null,
    mangler: [],
    registreringer: [],
    status: "alle",
    ansvar: "alle",
    query: "",
    valgt: "",
    kladder: [],
    navn: localStorage.getItem(NAVN_KEY) || "",
    kommentar: "",
    busy: false,
    besked: "",
    beskedKind: "",
  };

  const app = document.querySelector("#app");

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, value);
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function formatDato(iso) {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    if (!day) return iso;
    return `${day}.${month}.${year}`;
  }

  function formatTid(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function feltStatus(mangel) {
    if (mangel.status === "lukket") return "lukket";
    if (mangel.status === "udfoert") return "udfoert";
    if (registreringerFor(mangel.nummer).length) return "udfoert";
    return "aaben";
  }

  function registreringerFor(nummer) {
    return state.registreringer
      .filter((item) => item && item.nummer === nummer)
      .sort((a, b) => String(b.tidspunkt).localeCompare(String(a.tidspunkt)));
  }

  function overskredet(mangel) {
    return feltStatus(mangel) === "aaben" && mangel.frist && mangel.frist < iDag();
  }

  function iDag() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date());
  }

  function matchesQuery(mangel) {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      mangel.nummer,
      mangel.titel,
      mangel.lokation,
      mangel.blok,
      mangel.beskrivelse,
      mangel.ansvarlig,
      mangel.bemærkning,
      mangel.ikkeVoresGrund,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  }

  function visible(mangel) {
    if (!matchesQuery(mangel)) return false;
    if (state.status !== "alle" && feltStatus(mangel) !== state.status) return false;
    if (state.ansvar === "vores" && mangel.vores === false) return false;
    if (state.ansvar === "ikke" && mangel.vores !== false) return false;
    return true;
  }

  function sorted(list) {
    const rank = { aaben: 0, udfoert: 1, lukket: 2 };
    return list.slice().sort((a, b) => {
      const byStatus = rank[feltStatus(a)] - rank[feltStatus(b)];
      if (byStatus) return byStatus;
      const byFrist = String(a.frist).localeCompare(String(b.frist));
      if (byFrist) return byFrist;
      return String(a.nummer).localeCompare(String(b.nummer), "da");
    });
  }

  function counts() {
    const counts = { aaben: 0, udfoert: 0, lukket: 0, vores: 0, ikke: 0 };
    for (const mangel of state.mangler) {
      counts[feltStatus(mangel)] += 1;
      counts[mangel.vores === false ? "ikke" : "vores"] += 1;
    }
    return counts;
  }

  function pill(status, foreign) {
    const label = foreign ? "Ikke vores" : STATUS[status];
    return el("span", { class: `pill ${foreign ? "foreign" : status}`, text: label });
  }

  function card(mangel) {
    const status = feltStatus(mangel);
    const foreign = mangel.vores === false;
    const reports = registreringerFor(mangel.nummer);
    const latest = reports[0];
    const meta = latest
      ? `Udført af ${latest.navn} · ${formatTid(latest.tidspunkt)}`
      : `Frist ${formatDato(mangel.frist)}${overskredet(mangel) ? " · Overskredet" : ""}`;
    return el(
      "button",
      {
        class: `card${foreign ? " foreign" : ""}`,
        type: "button",
        onClick: () => openDetail(mangel.nummer),
      },
      [
        el("div", { class: "card-top" }, [
          el("p", { class: "number", text: mangel.nummer }),
          pill(status),
        ]),
        el("h2", { text: mangel.titel }),
        el("p", { class: "place", text: mangel.lokation }),
        el("p", { class: "meta", text: meta }),
        mangel.bemærkning ? el("p", { class: "remark", text: mangel.bemærkning }) : null,
      ],
    );
  }

  function section(title, items) {
    if (!items.length) return null;
    return el("section", {}, [
      title ? el("h2", { class: "section-title", text: title }) : null,
      el("div", { class: "cards" }, items.map(card)),
    ]);
  }

  function paintList() {
    const list = app.querySelector("#list");
    if (!list) return;
    const cards = list.querySelector("#cards");
    const summary = list.querySelector("#summary");
    const banner = list.querySelector("#banner");
    const count = counts();
    const labels = {
      status: {
        alle: "Alle",
        aaben: `Åbne ${count.aaben}`,
        udfoert: `Udført ${count.udfoert}`,
        lukket: `Lukket ${count.lukket}`,
      },
      ansvar: {
        alle: "Alle",
        vores: `Vores ${count.vores}`,
        ikke: `Ikke vores ${count.ikke}`,
      },
    };
    const oursOpen = state.mangler.filter((item) => item.vores !== false && feltStatus(item) === "aaben").length;
    summary.textContent = `${oursOpen} åbne hos Zenko · ${count.ikke} andres · ${state.mangler.length} i alt`;
    banner.hidden = Boolean(uploadUrl);
    for (const button of list.querySelectorAll(".chip")) {
      button.setAttribute("aria-pressed", String(button.dataset.value === state[button.dataset.group]));
      button.textContent = labels[button.dataset.group][button.dataset.value];
    }
    const shown = sorted(state.mangler.filter(visible));
    cards.replaceChildren();
    if (!shown.length) {
      cards.append(el("p", { class: "empty", text: "Ingen mangler passer til filteret." }));
      return;
    }
    const blocks = [];
    if (state.ansvar === "alle") {
      const ours = shown.filter((item) => item.vores !== false);
      const others = shown.filter((item) => item.vores === false);
      if (ours.length) blocks.push(section("Vores", ours));
      if (others.length) blocks.push(section("Ikke vores", others));
    } else if (shown.length) {
      blocks.push(section("", shown));
    }
    cards.append(...blocks);
  }

  function photoUrl(sti) {
    return `${rawBase}${sti}`;
  }

  function buildDetail(mangel) {
    const status = feltStatus(mangel);
    const foreign = mangel.vores === false;
    const reports = registreringerFor(mangel.nummer);
    const facts = [
      ["Sted", mangel.lokation],
      ["Ansvarlig", mangel.ansvarlig],
      ["Frist", `${formatDato(mangel.frist)}${overskredet(mangel) ? " · overskredet" : ""}`],
      ["Oprettet", formatDato(mangel.oprettet)],
      ["Status", foreign ? `Ikke vores · ${STATUS[status]}` : STATUS[status]],
    ];
    const root = el("article", { class: "detail" }, [
      el("button", { class: "back", type: "button", onClick: closeDetail, text: "← Alle mangler" }),
      el("div", { class: "detail-top" }, [
        el("p", { class: "number", text: mangel.nummer }),
        pill(status),
      ]),
      el("h2", { text: mangel.titel }),
      el(
        "dl",
        { class: "facts" },
        facts.flatMap(([label, value]) => [
          el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]),
        ]),
      ),
      el("p", { class: "description", text: mangel.beskrivelse }),
      el("a", {
        class: "pdf",
        href: mangel.pdf,
        target: "_blank",
        rel: "noopener",
        text: "Åbn PDF fra Connex",
      }),
    ]);

    const work = el("section", { class: "work" }, [el("h3", { text: "Udført på pladsen" })]);
    if (!reports.length) {
      work.append(el("p", { class: "meta", text: "Ingen billeder gemt endnu." }));
    }
    for (const report of reports) {
      const photos = el("div", { class: "photos" });
      for (const photo of report.billeder || []) {
        const image = el("img", {
          src: photo.lokal || photoUrl(photo.sti),
          alt: `Billede fra ${report.navn}`,
          loading: "lazy",
        });
        if (!photo.lokal) {
          image.addEventListener("error", () => {
            if (image.dataset.fallback) return;
            image.dataset.fallback = "1";
            image.src = photo.sti;
          });
        }
        photos.append(image);
      }
      work.append(
        el("article", { class: "report" }, [
          el("p", {}, [el("strong", { text: report.navn }), ` · ${formatTid(report.tidspunkt)}`]),
          report.kommentar ? el("p", { text: report.kommentar }) : null,
          photos,
        ]),
      );
    }
    work.append(buildForm(mangel, status, foreign));
    root.append(work);
    return root;
  }

  function buildForm(mangel, status, foreign) {
    if (foreign) {
      return el("p", {
        class: "note",
        text: mangel.ikkeVoresGrund || "Ikke Zenko's opgave. Den kan ikke markeres udført her.",
      });
    }
    if (status === "lukket") {
      return el("p", { class: "note", text: "Lukket i RIB. Der skal ikke lægges mere op her." });
    }
    if (!uploadUrl) {
      return el("p", {
        class: "note",
        text: "Billeder kan ikke gemmes endnu. PDF'en ovenfor kan stadig åbnes.",
      });
    }

    const form = el("form", { id: "done-form" });
    const actions = el("div", { class: "actions" });
    actions.append(fileButton("Tag billede", true), fileButton("Fra galleri", false));
    const drafts = el("div", { class: "drafts", id: "drafts" });
    const name = el("input", {
      id: "navn",
      name: "navn",
      type: "text",
      maxlength: "80",
      autocomplete: "name",
      required: true,
      value: state.navn,
    });
    name.addEventListener("input", () => {
      state.navn = name.value;
    });
    const comment = el("textarea", {
      id: "kommentar",
      name: "kommentar",
      maxlength: "1000",
      rows: "3",
      placeholder: "Fx fuge lukket mod karmen",
    });
    comment.value = state.kommentar;
    comment.addEventListener("input", () => {
      state.kommentar = comment.value;
    });
    const message = el("p", {
      id: "form-status",
      class: `status ${state.beskedKind}`,
      role: "status",
      text: state.besked,
    });
    const submit = el("button", {
      class: "primary",
      type: "submit",
      text: status === "udfoert" ? "Gem flere billeder" : "Marker som udført",
    });
    if (state.busy) submit.disabled = true;
    form.append(
      actions,
      drafts,
      el("label", { class: "field", for: "navn", text: "Dit navn" }, [name]),
      el("label", { class: "field", for: "kommentar", text: "Kommentar, valgfri" }, [comment]),
      message,
      submit,
    );
    form.addEventListener("submit", (event) => submitDone(event, mangel));
    queueMicrotask(paintDrafts);
    return form;
  }

  function fileButton(label, camera) {
    const input = el("input", {
      type: "file",
      accept: "image/*",
      tabindex: "-1",
    });
    if (camera) input.setAttribute("capture", "environment");
    else input.multiple = true;
    input.addEventListener("change", () => takeFiles(input));
    return el("label", { class: "action" }, [label, input]);
  }

  function paintDrafts() {
    const drafts = document.querySelector("#drafts");
    if (!drafts) return;
    drafts.replaceChildren();
    for (const draft of state.kladder) {
      drafts.append(
        el("div", { class: "draft" }, [
          el("img", { src: draft.url, alt: "Valgt billede" }),
          el("p", { class: "meta", text: formatBytes(draft.bytes) }),
          el("button", {
            class: "text-button",
            type: "button",
            text: "Fjern",
            onClick: () => removeDraft(draft.id),
          }),
        ]),
      );
    }
  }

  function removeDraft(id) {
    const draft = state.kladder.find((item) => item.id === id);
    if (draft) URL.revokeObjectURL(draft.url);
    state.kladder = state.kladder.filter((item) => item.id !== id);
    paintDrafts();
  }

  function clearDrafts() {
    for (const draft of state.kladder) URL.revokeObjectURL(draft.url);
    state.kladder = [];
  }

  async function takeFiles(input) {
    const picked = [...(input.files || [])];
    const files = [];
    for (const file of picked) {
      const buffer = await file.arrayBuffer();
      files.push(new File([buffer], file.name || "billede.jpg", { type: file.type || "image/jpeg" }));
    }
    input.value = "";
    if (!files.length || state.busy) return;
    setFormStatus("", "");
    for (const file of files) {
      if (state.kladder.length >= MAX_PHOTOS) {
        setFormStatus(`Højst ${MAX_PHOTOS} billeder.`, "error");
        break;
      }
      try {
        const blob = await compressImage(file);
        state.kladder.push({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(blob),
          blob,
          bytes: blob.size,
        });
      } catch (error) {
        setFormStatus(error instanceof Error ? error.message : "Billedet kunne ikke bruges.", "error");
      }
    }
    paintDrafts();
  }

  async function compressImage(file) {
    if (file.size > 30 * 1024 * 1024) {
      throw new Error("Billedet er for stort. Tag et nyt.");
    }
    const decoded = await decodeImage(file);
    try {
      const width = decoded.source.width || decoded.source.naturalWidth;
      const height = decoded.source.height || decoded.source.naturalHeight;
      if (!width || !height) throw new Error("decode");
      let scale = Math.min(1, 1600 / Math.max(width, height));
      let quality = 0.72;
      let blob = await renderJpeg(decoded.source, width, height, scale, quality);
      for (let attempt = 0; blob.size > 480000 && attempt < 5; attempt += 1) {
        if (quality > 0.5) quality = Math.max(0.5, quality - 0.1);
        else scale *= 0.8;
        blob = await renderJpeg(decoded.source, width, height, scale, quality);
      }
      if (blob.size > 700 * 1024) throw new Error("Billedet fylder stadig for meget.");
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
        /* Prøv et almindeligt billedelement. */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("decode"));
        image.src = url;
      });
      return { source: image, cleanup() { URL.revokeObjectURL(url); } };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Billedet kunne ikke læses. Tag det med kameraet i stedet.");
    }
  }

  function renderJpeg(source, width, height, scale, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Billedet kunne ikke gøres klar."))),
        "image/jpeg",
        quality,
      );
    });
  }

  async function submitDone(event, mangel) {
    event.preventDefault();
    if (state.busy) return;
    const navn = state.navn.trim();
    if (!navn) {
      setFormStatus("Skriv dit navn.", "error");
      return;
    }
    if (!state.kladder.length) {
      setFormStatus("Tag mindst ét billede.", "error");
      return;
    }
    state.busy = true;
    setFormStatus("Gemmer…", "");
    const submit = event.target.querySelector("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      const billeder = [];
      for (const draft of state.kladder) {
        billeder.push({ data: await blobToBase64(draft.blob), type: "image/jpeg" });
      }
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          nummer: mangel.nummer,
          navn,
          kommentar: state.kommentar.trim(),
          billeder,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.fejl || "Kunne ikke gemme.");
      }
      localStorage.setItem(NAVN_KEY, navn);
      state.navn = navn;
      state.kommentar = "";
      const lokale = state.kladder.map((draft) => draft.url);
      state.kladder = [];
      if (payload.registrering) {
        (payload.registrering.billeder || []).forEach((photo, index) => {
          if (lokale[index]) photo.lokal = lokale[index];
        });
        state.registreringer.push(payload.registrering);
      }
      state.busy = false;
      state.besked = "Gemt. Alle kan se det, når listen opdateres.";
      state.beskedKind = "ok";
      showDetail(mangel.nummer);
    } catch (error) {
      state.busy = false;
      const text = error instanceof TypeError
        ? "Kunne ikke få fat i upload. Tjek dækningen. Intet er gemt."
        : error.message;
      setFormStatus(text, "error");
      if (submit) submit.disabled = false;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        resolve(value.slice(value.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Billedet kunne ikke læses."));
      reader.readAsDataURL(blob);
    });
  }

  function setFormStatus(text, kind) {
    state.besked = text;
    state.beskedKind = kind;
    const node = document.querySelector("#form-status");
    if (!node) return;
    node.textContent = text;
    node.className = `status ${kind || ""}`.trim();
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }

  function chip(group, value, label) {
    return el("button", {
      class: "chip",
      type: "button",
      "data-group": group,
      "data-value": value,
      "aria-pressed": String(state[group] === value),
      text: label,
      onClick: () => {
        state[group] = value;
        const url = new URL(location.href);
        if (value === "alle") url.searchParams.delete(group);
        else url.searchParams.set(group, value);
        history.replaceState(null, "", url);
        paintList();
      },
    });
  }

  function shell() {
    const count = counts();
    const list = el("div", { id: "list" }, [
      el("p", { id: "summary", class: "summary" }),
      el("input", {
        class: "search",
        type: "search",
        placeholder: "Søg nr., sted eller tekst",
        "aria-label": "Søg",
        value: state.query,
        onInput: (event) => {
          state.query = event.target.value;
          paintList();
        },
      }),
      el("div", { class: "filters" }, [
        el("div", { class: "filter-row", role: "group", "aria-label": "Status" }, [
          el("span", { class: "filter-label", text: "Status" }),
          chip("status", "alle", "Alle"),
          chip("status", "aaben", `Åbne ${count.aaben}`),
          chip("status", "udfoert", `Udført ${count.udfoert}`),
          chip("status", "lukket", `Lukket ${count.lukket}`),
        ]),
        el("div", { class: "filter-row", role: "group", "aria-label": "Hvem" }, [
          el("span", { class: "filter-label", text: "Hvem" }),
          chip("ansvar", "alle", "Alle"),
          chip("ansvar", "vores", `Vores ${count.vores}`),
          chip("ansvar", "ikke", `Ikke vores ${count.ikke}`),
        ]),
      ]),
      el("p", {
        id: "banner",
        class: "banner",
        hidden: Boolean(uploadUrl),
        text: "Billeder og «udført» gemmes ikke endnu. Mangler og PDF'er kan bruges.",
      }),
      el("div", { id: "cards" }),
    ]);
    app.replaceChildren(list, el("div", { id: "detail", hidden: true }));
    paintList();
  }

  function setHash(nummer) {
    const url = new URL(location.href);
    url.hash = nummer || "";
    history.pushState(null, "", url);
  }

  function openDetail(nummer) {
    clearDrafts();
    state.kommentar = "";
    state.besked = "";
    state.beskedKind = "";
    state.busy = false;
    setHash(nummer);
    showDetail(nummer);
  }

  function closeDetail() {
    clearDrafts();
    setHash("");
    showList();
  }

  function showDetail(nummer) {
    const mangel = state.mangler.find((item) => item.nummer === nummer);
    const detail = app.querySelector("#detail");
    const list = app.querySelector("#list");
    if (!mangel || !detail || !list) {
      showList();
      return;
    }
    state.valgt = nummer;
    list.hidden = true;
    detail.hidden = false;
    detail.replaceChildren(buildDetail(mangel));
    window.scrollTo(0, 0);
  }

  function showList() {
    const detail = app.querySelector("#detail");
    const list = app.querySelector("#list");
    if (!list) return;
    state.valgt = "";
    detail.hidden = true;
    list.hidden = false;
    paintList();
  }

  function onHash() {
    const nummer = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (nummer && state.mangler.some((item) => item.nummer === nummer)) showDetail(nummer);
    else showList();
  }

  async function loadJson(url, timeoutMs) {
    const signal = timeoutMs && typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  function senesteTid(list) {
    return list.reduce((max, item) => (String(item && item.tidspunkt) > max ? String(item.tidspunkt) : max), "");
  }

  async function loadUdfoert() {
    const stamp = Date.now();
    const remote = loadJson(`${rawBase}udfoert.json?t=${stamp}`, 4000).catch(() => null);
    const local = loadJson(`udfoert.json?t=${stamp}`).catch(() => null);
    const [fresh, near] = await Promise.all([remote, local]);
    const freshList = fresh && Array.isArray(fresh.registreringer) ? fresh.registreringer : null;
    const nearList = near && Array.isArray(near.registreringer) ? near.registreringer : null;
    if (freshList && nearList) {
      return senesteTid(freshList) >= senesteTid(nearList) ? freshList : nearList;
    }
    return freshList || nearList || [];
  }

  async function load() {
    try {
      const data = await loadJson(`mangler.json?t=${Date.now()}`);
      state.projekt = data;
      state.mangler = Array.isArray(data.mangler) ? data.mangler : [];
      state.registreringer = await loadUdfoert();
      const params = new URLSearchParams(location.search);
      if (["aaben", "udfoert", "lukket"].includes(params.get("status"))) state.status = params.get("status");
      if (["vores", "ikke"].includes(params.get("ansvar"))) state.ansvar = params.get("ansvar");
      shell();
      window.addEventListener("hashchange", onHash);
      window.addEventListener("popstate", onHash);
      onHash();
    } catch {
      app.replaceChildren(
        el("p", { class: "banner", text: "Kunne ikke hente manglerne. Prøv at genindlæse siden." }),
        el("button", {
          class: "primary",
          type: "button",
          text: "Prøv igen",
          onClick: () => location.reload(),
        }),
      );
    }
  }

  load();
})();
