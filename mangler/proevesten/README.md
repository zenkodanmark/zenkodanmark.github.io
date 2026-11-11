# Mangler på Prøvestenen

Offentlig side til Zenko's murere på **LEJERBO 024-0 Prøvestenen HHP**.

Efter merge til `main` ligger siden på:

**https://zenkodanmark.github.io/mangler/proevesten/**

Siden læser `mangler.json` (manglerne fra RIB Connex) og `udfoert.json` (det folk har markeret på pladsen). PDF'erne ligger i `pdf/`.

Mappen `mangler/` er undtaget i `.github/workflows/rebuild.yml`, så Plads-bygget hvert 20. minut ikke sletter siden eller billederne. Fjern ikke `mangler` fra den liste.

## Ny mangel

1. Læg PDF'en fra RIB Connex i `pdf/`. Brug et ASCII-filnavn, fx `pdf/L00-1700-Kort-titel.pdf`.
2. Tilføj ét objekt sidst i arrayet `mangler` i `mangler.json`.
3. Commit til `main`. Siden henter filen ved næste besøg. Der skal ikke ændres kode.

Felter:

| Felt | Krav |
|---|---|
| `nummer` | Unikt, fx `L00-1700`. Mønster `L` + to cifre + `-` + tal. |
| `titel` | Kort titel fra RIB Connex. |
| `blok` | `Blok A`, `Blok B`, `Blok C`, `Blok D` eller `Plan`. |
| `lokation` | Det sted mureren skal hen. |
| `beskrivelse` | Hvad der skal laves, med de vigtige kommentarer. |
| `bemærkning` | Valgfri kort linje på kortet. |
| `ansvarlig` | Firmanavnet fra RIB Connex. |
| `entreprise` | Fx `240`, `410`, `110`. |
| `vores` | `true` hvis Zenko skal udbedre den. `false` viser den grå under **Ikke vores**, og upload afviser den. |
| `ikkeVoresGrund` | Kort forklaring når `vores` er `false`. Udelad feltet ellers. |
| `oprettet`, `frist`, `sidstAendret` | `YYYY-MM-DD`. |
| `connexStatus` | Teksten fra RIB Connex, lige nu `Overdue`. |
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
  "connexStatus": "Overdue",
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

## Sådan markerer en ansat manglen udført

På Zenko-mangler (ikke de grå) er der **Tag billede** og **Marker som udført**. Navn er påkrævet, kommentaren er valgfri, og der skal mindst ét billede med. Billedet bliver synligt for de andre med det samme. Mangler med `vores: false` kan ikke markeres her.

## Hvor billederne ligger

GitHub Pages kan ikke gemme filer. Billedet og registreringen lægges i den offentlige mappe `plads`, som Zenko Plads allerede bruger:

- `mangler/proevesten/billeder/<nummer>/<id>-1.jpg`
- `mangler/proevesten/registreringer/<id>.json`

Nøglen i `config.js` er den offentlige publishable-nøgle, den samme som Plads-siden allerede har i browseren. Der skal ikke oprettes en Vercel-konto eller en GitHub-token for at de ansatte kan gemme.

`udfoert.json` i git læses stadig med, hvis en bot har lagt rækker der. De ansattes billeder ligger i bucketten.

## Sådan læser en bot billederne

Nøglen står i `config.js` som `supabaseKey`.

```bash
curl -fsS -X POST \
  -H "apikey: NØGLEN" \
  -H "Authorization: Bearer NØGLEN" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"mangler/proevesten/registreringer","limit":100}' \
  "https://jauggqxhemjnbxoxkpeh.supabase.co/storage/v1/object/list/plads"
```

Hver fil er offentlig:

```text
https://jauggqxhemjnbxoxkpeh.supabase.co/storage/v1/object/public/plads/mangler/proevesten/registreringer/<id>.json
https://jauggqxhemjnbxoxkpeh.supabase.co/storage/v1/object/public/plads/<sti-fra-json>
```

Læg billederne i RIB Connex, luk manglen dér, og sæt bagefter `"status": "lukket"` på samme nummer i `mangler.json`. Slet ikke billederne.

Mappen `server/` er ikke koblet på siden. Den blev lavet til en Vercel-funktion, som ikke er nødvendig, fordi bucketten allerede findes.
