import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
const readBinary = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath));
const exists = (relativePath) => fs.existsSync(path.join(projectRoot, relativePath));
const pngSize = (relativePath) => {
  const buffer = readBinary(relativePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${relativePath} is not a PNG file.`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const manifest = JSON.parse(read("manifest.json"));
const requiredFiles = [
  "manifest.json",
  "src/background.js",
  "src/content/main.js",
  "styles/silroom.css",
  "popup.html",
  "popup.js",
  "styles/popup.css",
  "assets/icons/all.svg",
  "assets/icons/dm.svg",
  "assets/icons/mention.svg",
  "assets/icons/pin.svg",
  "assets/icons/power.svg",
  "assets/icons/unclassified.svg",
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "assets/brand/silroom-mark.svg",
  "store-assets/screenshots/silroom-chatwork-01.png",
  "tests/fixtures/chatwork-like.html",
];

const missing = requiredFiles.filter((file) => !exists(file));

if (missing.length > 0) {
  throw new Error(`Missing files: ${missing.join(", ")}`);
}

if (manifest.name !== "SILroom") {
  throw new Error(`Unexpected extension name: ${manifest.name}`);
}

if (manifest.manifest_version !== 3) {
  throw new Error("Manifest V3 is required.");
}

if (!manifest.permissions?.includes("storage")) {
  throw new Error("storage permission is required.");
}

if (manifest.icons?.["128"] !== "assets/icons/icon-128.png") {
  throw new Error("Extension 128px icon is not registered.");
}

if (manifest.action?.default_icon?.["16"] !== "assets/icons/icon-16.png") {
  throw new Error("Action icon is not registered.");
}

for (const size of [16, 32, 48, 128]) {
  const icon = pngSize(`assets/icons/icon-${size}.png`);
  if (icon.width !== size || icon.height !== size) {
    throw new Error(`Icon ${size}px file has unexpected dimensions.`);
  }
}

const storeScreenshot = pngSize("store-assets/screenshots/silroom-chatwork-01.png");
if (storeScreenshot.width !== 1280 || storeScreenshot.height !== 800) {
  throw new Error("Chrome Web Store screenshot must be 1280x800.");
}

if (!manifest.host_permissions?.includes("https://www.chatwork.com/*")) {
  throw new Error("Chatwork host permission is required.");
}

const contentScript = manifest.content_scripts?.[0];

if (!contentScript?.js?.includes("src/content/main.js")) {
  throw new Error("Content script entry is not registered.");
}

if (!contentScript?.css?.includes("styles/silroom.css")) {
  throw new Error("Content stylesheet is not registered.");
}

if (manifest.background?.service_worker !== "src/background.js") {
  throw new Error("Background service worker is not registered.");
}

if (!manifest.host_permissions?.includes("https://api.chatwork.com/*")) {
  throw new Error("Chatwork API host permission is required.");
}

for (const file of ["src/background.js", "src/content/main.js", "popup.js"]) {
  const source = read(file);
  new Function(source);
}

const contentSource = read("src/content/main.js");
if (!/if \(spaceKey === "attention"\) {\s*return room\.mentionCount > 0;\s*}/.test(contentSource)) {
  throw new Error("Attention space must match mention rooms only.");
}

if (!contentSource.includes("const usesQuickFilter = (spaceKey) => !isAttentionSpace(spaceKey);")) {
  throw new Error("Attention space must not stack quick filters.");
}

const modalLayerPattern = contentSource.match(/const MODAL_LAYER_NAME_RE = (\/.*?\/i);/);
if (!modalLayerPattern) {
  throw new Error("Chatwork modal layer matcher is missing.");
}

if (/(tooltip|popover|emoji|mention|suggest|autocomplete|balloon)/.test(modalLayerPattern[1])) {
  throw new Error("Hover and composer helpers must not be treated as modal layers.");
}

if (!contentSource.includes("const targetRooms = isWorkspaceSpace(spaceKey) ? cachedRooms : liveRooms;")) {
  throw new Error("Smart space badges must not fall back to stale cached rooms.");
}

if (!contentSource.includes("自分宛の未読はありません")) {
  throw new Error("Attention empty state must describe unread mentions.");
}

if (!/const BADGELESS_SPACE_KEYS = new Set\(\["fixed", "unclassified"\]\);/.test(contentSource)) {
  throw new Error("Fixed and unclassified spaces must not show rail notification badges.");
}

if (!/if \(BADGELESS_SPACE_KEYS\.has\(space\.key\)\) {\s*return null;\s*}/.test(contentSource)) {
  throw new Error("Badgeless rail spaces must return no badge.");
}

for (const token of [
  "workspaceStateKey: \"silroomWorkspaceState\"",
  "rememberWorkspaceObservations(domRooms)",
  "getStateRoomsForWorkspace(spaceKey)",
  "syncNativeWorkspaceIfNeeded(nextSpace)",
  "setupStructureObserver()",
  "setupFloatingLayerObserver()",
  "silroom-chatwork-modal-open",
  "scheduleInteractiveApiRefresh(250)",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing workspace stability token: ${token}`);
  }
}

if (!/characterData:\s*true/.test(contentSource)) {
  throw new Error("Room list observer must watch badge text changes.");
}

const css = read("styles/silroom.css");
for (const token of ["#silroom-shell", ".silroom-rail", ".silroom-panel", ".silroom-overviewTab"]) {
  if (!css.includes(token)) {
    throw new Error(`Missing CSS token: ${token}`);
  }
}

const zIndexMatch = css.match(/--silroom-z-index:\s*(\d+);/);
if (!zIndexMatch) {
  throw new Error("SILroom z-index token is missing.");
}

const silroomZIndex = Number(zIndexMatch[1]);
if (!Number.isFinite(silroomZIndex) || silroomZIndex > 1000) {
  throw new Error("SILroom z-index must stay below Chatwork floating composer menus.");
}

if (!css.includes(":root.silroom-enabled #_chatSendArea:hover")) {
  throw new Error("Chatwork composer hover/focus stacking rule is missing.");
}

if (!css.includes(":root.silroom-chatwork-modal-open #silroom-shell")) {
  throw new Error("Chatwork modal overlay yield rule is missing.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      name: manifest.name,
      version: manifest.version,
      files: requiredFiles.length,
    },
    null,
    2
  )
);
