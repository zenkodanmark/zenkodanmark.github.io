"use strict";

const { ApiError } = require("./lib");

function createGithub({ token, repo, branch, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  if (!token) {
    throw new ApiError(503, "Upload er ikke sat op. GITHUB_TOKEN mangler på serveren.");
  }
  const ownerRepo = repo || "zenkodanmark/zenkodanmark.github.io";
  const refName = branch || "main";

  async function api(method, path, body) {
    const response = await doFetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "zenko-mangler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { message: text.slice(0, 300) };
      }
    }
    if (!response.ok) {
      const error = new Error(json?.message || `GitHub ${response.status}`);
      error.status = response.status;
      error.retryable = response.status === 409;
      throw error;
    }
    return json;
  }

  return {
    async readJson(path) {
      try {
        const file = await api(
          "GET",
          `/repos/${ownerRepo}/contents/${encodePath(path)}?ref=${encodeURIComponent(refName)}`,
        );
        if (!file || !file.content) return null;
        const decoded = Buffer.from(String(file.content).replace(/\n/g, ""), "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },

    async commit(files, message) {
      const ref = await api("GET", `/repos/${ownerRepo}/git/ref/heads/${refName}`);
      const parent = ref.object.sha;
      const parentCommit = await api("GET", `/repos/${ownerRepo}/git/commits/${parent}`);
      const treeEntries = [];
      for (const file of files) {
        const blob = await api("POST", `/repos/${ownerRepo}/git/blobs`, {
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        treeEntries.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }
      const tree = await api("POST", `/repos/${ownerRepo}/git/trees`, {
        base_tree: parentCommit.tree.sha,
        tree: treeEntries,
      });
      const created = await api("POST", `/repos/${ownerRepo}/git/commits`, {
        message: String(message).replace(/\s+/g, " ").trim().slice(0, 200),
        tree: tree.sha,
        parents: [parent],
      });
      try {
        await api("PATCH", `/repos/${ownerRepo}/git/refs/heads/${refName}`, { sha: created.sha });
      } catch (error) {
        if (error.status === 409 || error.status === 422) error.retryable = true;
        throw error;
      }
      return created.sha;
    },
  };
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

module.exports = { createGithub };
