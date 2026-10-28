import express from "express";

// Only browser routes and deliberately published assets belong on this surface.
// Documentation, credentials, audit output and source maps are never web assets.
const page =
  /^(?:\/|\/credits|\/docs(?:\/(?:quickstart|first-campaign|evidence|integrations|api|troubleshooting))?|\/app(?:\/(?:campaigns|findings|targets|integrations|runs\/[a-f0-9-]+))?)\/?$/;
const asset = /^\/assets\/[\w.-]+\.(?:js|css|woff2?)$/;
const brand =
  /^\/brand\/(?:vouch-mark\.webp|vouch-scout\.webp|vouch-builder\.webp|pearl-wave\.webp|icon-192\.png)$/;
const license =
  /^\/licenses\/(?:phosphor-MIT|geist-OFL|geist-mono-OFL|opencode-MIT)\.txt$/;

export const publicSite = express.Router();
publicSite.use((req, res, next) => {
  let path: string;
  try {
    path = decodeURIComponent(req.path);
  } catch {
    return res.status(400).json({ error: "Invalid request path" });
  }
  if (page.test(path)) return res.sendFile("index.html", { root: "dist/web" });
  if (
    asset.test(path) ||
    brand.test(path) ||
    license.test(path) ||
    path === "/favicon.ico"
  )
    return next();
  return res.status(404).json({ error: "Not found" });
});
publicSite.use(express.static("dist/web", { dotfiles: "deny", index: false }));
publicSite.use((_req, res) => res.status(404).json({ error: "Not found" }));
