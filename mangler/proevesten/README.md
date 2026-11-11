# Mangler på Prøvestenen

Offentlig side til Zenko's murere på **LEJERBO 024-0 Prøvestenen HHP**.

Efter merge til `main` ligger siden på:

**https://zenkodanmark.github.io/mangler/proevesten/**

Siden læser `mangler.json` (Dalux-manglerne) og `udfoert.json` (det folk har markeret på pladsen). PDF'erne ligger i `pdf/`.

Mappen `mangler/` er undtaget i `.github/workflows/rebuild.yml`, så Plads-bygget hvert 20. minut ikke sletter siden eller billederne. Fjern ikke `mangler` fra den liste.

## Ny mangel

1. Læg Dalux-PDF'en i `pdf/`. Brug et ASCII-filnavn, fx `pdf/L00-1700-Kort-titel.pdf`.
2. Tilføj ét objekt sidst i arrayet `mangler` i `mangler.json`.
3. Commit til `main`. Siden henter filen ved næste besøg. Der skal ikke ændres kode.

Felter:

| Felt | Krav |
|---|---|
| `nummer` | Unikt, fx `L00-1700`. Mønster `L` + to cifre + `-` + tal. |
| `titel` | Kort titel fra Dalux. |
| `blok` | `Blok A`, `Blok B`, `Blok C`, `Blok D` eller `Plan`. |
| `lokation` | Det sted mureren skal hen. |
| `beskrivelse` | Hvad der skal laves, med de vigtige kommentarer. |
| `bemærkning` | Valgfri kort linje på kortet. |
| `ansvarlig` | Firmanavnet fra Dalux. |
| `entreprise` | Fx `240`, `410`, `110`. |
| `vores` | `true` hvis Zenko skal udbedre den. `false` viser den grå under **Ikke vores**, og upload afviser den. |
| `ikkeVoresGrund` | Kort forklaring når `vores` er `false`. Udelad feltet ellers. |
| `oprettet`, `frist`, `sidstAendret` | `YYYY-MM-DD`. |
| `daluxStatus` | Teksten fra Dalux, lige nu `Overdue`. |
| `status` | `aaben` eller `lukket`. Se nedenfor. |
| `pdf` | Sti fra denne mappe, fx `pdf/L00-1700-Kort-titel.pdf`. |

Eksempel:

```json
{
  "nummer": "L00-1700",
  "titel": "Kort titel",
  "blok": "Blok A",
  "lokation": "Blok A · 12 st. tv.",
  "beskrivelse": "Hvad der er galt, og hvad der skal gøres.",
  "ansvarlig": "Entreprise 240 Murværk — Zenko Danmark ApS",
  "entreprise": "240",
  "vores": true,
  "oprettet": "2026-11-11",
  "frist": "2026-11-18",
  "sidstAendret": "2026-11-11",
  "daluxStatus": "Overdue",
  "status": "aaben",
  "pdf": "pdf/L00-1700-Kort-titel.pdf"
}
```

## Status på siden

| `status` i mangler.json | Række i udfoert.json | Vises som |
|---|---|---|
| `aaben` | ingen | Åben |
| `aaben` | en eller flere | Udført af Zenko |
| `lukket` | ligegyldigt | Lukket i RIB |

Mureren kan kun markere **udført** (det skriver en række i `udfoert.json`). **Lukket i RIB** sættes bagefter her i `mangler.json` ved at ændre `status` til `lukket`. Slet ikke rækken i `udfoert.json`, og slet ikke billederne.

Ikke Zenko, og derfor `vores: false`: L00-1292 (VVS ent. 410), L00-1445 (nedrivning ent. 110), L00-1511 (Zenko har skrevet at den ikke er til os).

## udfoert.json

Upload-funktionen tilføjer rækker. Rør den kun, hvis en registrering skal væk.

```json
{
  "version": 1,
  "registreringer": [
    {
      "id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "nummer": "L00-1599",
      "navn": "Anders",
      "kommentar": "Fuge lukket",
      "tidspunkt": "2026-11-11T09:30:00.000Z",
      "billeder": [
        {
          "sti": "billeder/L00-1599/20261111T093000Z-aaaaaaaa-1.jpg",
          "type": "image/jpeg",
          "bytes": 240000
        }
      ]
    }
  ]
}
```

`sti` er relativ til denne mappe. Samme `id` sendt igen bliver ikke gemt to gange.

## Sådan læser en bot billederne

```bash
curl -fsS "https://raw.githubusercontent.com/zenkodanmark/zenkodanmark.github.io/main/mangler/proevesten/udfoert.json"
curl -fsS -o fil.jpg "https://raw.githubusercontent.com/zenkodanmark/zenkodanmark.github.io/main/mangler/proevesten/billeder/L00-1599/FILNAVN.jpg"
```

Læg billederne i RIB Connex, luk manglen dér, og sæt bagefter `"status": "lukket"` på samme nummer i `mangler.json`.

## Foto-upload

GitHub Pages kan ikke gemme filer. En lille Vercel-funktion modtager billedet og committer det til dette repo. GitHub-tokenen ligger kun som environment variable på Vercel. `config.js` må kun indeholde den offentlige URL.

Uden den URL virker listen og PDF'erne. Knappen **Marker som udført** vises først, når `uploadUrl` er sat.

Funktionen ligger i `server/`. Den accepterer kun kald fra `https://zenkodanmark.github.io` (og localhost), kun mangler med `vores: true`, højst 4 billeder, kun jpeg/png/webp, og kræver navn. Ved to samtidige gem forsøger den igen, så den ene ikke overskriver den anden.

### Det ejeren skal gøre

1. Opret en fine-grained GitHub-token til repoet `zenkodanmark/zenkodanmark.github.io` med kun **Contents: Read and write**. Læg den ikke i koden.
2. På Vercel: **Add New → Project**, vælg repoet `zenkodanmark.github.io`. Sæt **Root Directory** til `mangler/proevesten/server`. Framework: Other.
3. Under **Settings → Environment Variables**: navn `GITHUB_TOKEN`, værdi = tokenen.
4. Deploy. Kopiér adressen, den ligner `https://et-navn.vercel.app`.
5. I `mangler/proevesten/config.js`: sæt `uploadUrl` til `https://et-navn.vercel.app/api/upload`. Commit og push til `main`.
6. Åbn siden på telefonen, markér en mangel med et billede, og tjek at rækken ligger i `udfoert.json` og filen i `billeder/`.

Lokal afprøvning af funktionen, stadig uden at lægge tokenen i en fil:

```bash
cd mangler/proevesten/server
GITHUB_TOKEN=... node dev-server.js
```

`node --test test/lib.test.js` kører uden token og uden netværk.
