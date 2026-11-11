// Offentlig konfiguration. Ingen nøgler, tokens eller adgangskoder i denne fil.
//
// MARKER: uploadUrl skal være tom, indtil Vercel-funktionen kører og GITHUB_TOKEN
// ligger som environment variable på Vercel (aldrig her). Sæt derefter den
// offentlige funktions-URL, fx "https://proevesten-mangler.vercel.app/api/upload".
// Tom streng: siden viser mangler og PDF'er, men gemmer ikke billeder.
window.MANGLER_CONFIG = {
  uploadUrl: "",
  repo: "zenkodanmark/zenkodanmark.github.io",
  branch: "main",
  mappe: "mangler/proevesten",
};
