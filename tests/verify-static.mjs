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
  "scripts/build-webstore.ps1",
  "assets/icons/all.svg",
  "assets/icons/dm.svg",
  "assets/icons/mention.svg",
  "assets/icons/pin.svg",
  "assets/icons/power.svg",
  "assets/icons/my.svg",
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

if (manifest.name !== "SILroom-Dev") {
  throw new Error(`Unexpected extension name: ${manifest.name}`);
}

if (manifest.action?.default_title !== "SILroom-Dev") {
  throw new Error("The unpacked extension must be labeled SILroom-Dev.");
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
const styleSource = read("styles/silroom.css");
if (!contentSource.includes(`version: "${manifest.version}"`)) {
  throw new Error("Content UI version must match the manifest version.");
}
if (!/if \(spaceKey === "attention"\) {\s*return room\.mentionCount > 0;\s*}/.test(contentSource)) {
  throw new Error("Attention space must match mention rooms only.");
}

const popupSource = read("popup.html");
const popupScriptSource = read("popup.js");
const popupStyleSource = read("styles/popup.css");
const buildScriptSource = read("scripts/build-webstore.ps1");
for (const token of [
  'id="extensionName"',
  'chrome.runtime.getManifest().name || "SILroom"',
  'document.getElementById("extensionName").textContent = extensionName;',
]) {
  if (!popupSource.includes(token) && !popupScriptSource.includes(token)) {
    throw new Error(`Missing development-name UI token: ${token}`);
  }
}

for (const token of [
  'id="mentionColor"',
  'id="mentionColorValue"',
  'id="mentionColorPreview"',
  'id="resetMentionColor"',
  'id="unreadColor"',
  'id="unreadColorValue"',
  'id="unreadColorPreview"',
  'id="resetUnreadColor"',
  'type="color"',
  '通知バッジ色',
  '数字色は背景色に合わせて自動調整',
]) {
  if (!popupSource.includes(token)) {
    throw new Error(`Missing notification color popup control: ${token}`);
  }
}

for (const token of [
  'const DEFAULT_MENTION_COLOR = "#19e58f";',
  'const DEFAULT_UNREAD_COLOR = "#7aa2ff";',
  "mentionColor: DEFAULT_MENTION_COLOR",
  "unreadColor: DEFAULT_UNREAD_COLOR",
  "const getBadgeTextColor = (backgroundColor) =>",
]) {
  if (!popupScriptSource.includes(token) || !contentSource.includes(token)) {
    throw new Error(`Missing notification color persistence token: ${token}`);
  }
}

for (const token of [
  'mentionColor.addEventListener("change"',
  'resetMentionColor.addEventListener("click"',
  'unreadColor.addEventListener("change"',
  'resetUnreadColor.addEventListener("click"',
  "mentionColorPreview.style.color = getBadgeTextColor(color);",
]) {
  if (!popupScriptSource.includes(token)) {
    throw new Error(`Missing notification color popup behavior: ${token}`);
  }
}

for (const token of [
  'input[type="color"]',
  ".popup__colorGrid",
  ".popup__colorTile",
  ".popup__badgePreview",
  ".popup__colorReset",
]) {
  if (!popupStyleSource.includes(token)) {
    throw new Error(`Missing notification color popup style: ${token}`);
  }
}

for (const token of [
  '$releaseManifest.name = "SILroom"',
  '$releaseManifest.action.default_title = "SILroom"',
  'SILroom-$releaseVersion-webstore-upload.zip',
]) {
  if (!buildScriptSource.includes(token)) {
    throw new Error(`Missing Web Store packaging token: ${token}`);
  }
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

const profileLayerPattern = contentSource.match(/const PROFILE_LAYER_NAME_RE = (\/.*?\/i);/);
if (!profileLayerPattern) {
  throw new Error("Chatwork profile layer matcher is missing.");
}

const profileLayerLiteral = profileLayerPattern[1];
const profileLayerPatternEnd = profileLayerLiteral.lastIndexOf("/");
const profileLayerRegex = new RegExp(
  profileLayerLiteral.slice(1, profileLayerPatternEnd),
  profileLayerLiteral.slice(profileLayerPatternEnd + 1),
);

for (const signature of ["contactProfileDialog", "user-profile-card", "プロフィール詳細"]) {
  if (!profileLayerRegex.test(signature)) {
    throw new Error(`Profile layer matcher must recognize: ${signature}`);
  }
}

for (const signature of ["tooltip", "emojiPopover", "mentionSuggestion"]) {
  if (profileLayerRegex.test(signature)) {
    throw new Error(`Profile layer matcher must ignore helper UI: ${signature}`);
  }
}

for (const token of [
  "const PROFILE_LAYER_TEST_ID_SELECTOR =",
  "const namedProfileLayer = PROFILE_LAYER_NAME_RE.test(signature);",
  "const profilePositionedAsLayer =",
  "const containsProfilePopupControl =",
  "node.querySelector(PROFILE_LAYER_TEST_ID_SELECTOR)",
  "const profileCardLayer =",
  "if (profileCardLayer)",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing Chatwork profile layer behavior: ${token}`);
  }
}

for (const token of [
  'const HEADER_LAYER_CLASS = "silroom-chatwork-header-overlay-open";',
  'globalHeader: "#_globalHeader",',
  "const hasChatworkHeaderOverlay = () => {",
  "if (rect.bottom <= headerRect.bottom + 2) {",
  "document.documentElement.classList.toggle(HEADER_LAYER_CLASS, hasChatworkHeaderOverlay());",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing Chatwork header overlay behavior: ${token}`);
  }
}

for (const token of [
  ":root.silroom-chatwork-header-overlay-open #silroom-root {",
  ":root.silroom-enabled.silroom-chatwork-header-overlay-open #_sideContent {",
  "pointer-events: none !important;",
]) {
  if (!styleSource.includes(token)) {
    throw new Error(`Missing Chatwork header overlay style: ${token}`);
  }
}

const profileFixtureSource = read("tests/fixtures/chatwork-like.html");
for (const token of [
  "fixtureProfileTrigger",
  "fixtureProfilePopup",
  "fixture-floatingProfileLayer",
  'data-testid="profile-popup_profile-button"',
  "プロフィール詳細",
]) {
  if (!profileFixtureSource.includes(token)) {
    throw new Error(`Missing profile popup fixture token: ${token}`);
  }
}

for (const token of [
  "const mentionCount = Math.max(badges.mention, apiMentionCount);",
  "const unreadCount = Math.max(apiMentionCount > 0 && badges.mention === 0 ? 0 : badges.unread, apiUnreadCount);",
  "const targetRooms = isWorkspaceSpace(spaceKey) ? mergeRoomsById(liveRooms, cachedRooms) : liveRooms;",
  "const nativeStats = adjustNativeStatsForReadReceipts(spaceKey, getNativeWorkspaceStats(spaceKey));",
  "mention: Math.max(roomStats.mention, nativeStats.mention)",
  "title: `自分宛 ${room.mentionCount}`",
  "const rowHasMentionSignal = (row)",
  "hasMentionSignal(markerLine) || context.hasMentionSignal",
  "const apiMentionCount = toNumber(apiRoom?.mention_num);",
  "apiMentionCount > 0 && badges.mention === 0 ? 0 : badges.unread",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing distributed notification token: ${token}`);
  }
}

for (const token of [
  "allBadgeEnabled: false",
  "if (space.key === \"all\")",
  "全体に自分宛あり",
  "text: badge.dot ? \"\"",
  "dataAction: \"toggle-all-badge\"",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing all-space badge token: ${token}`);
  }
}

for (const token of [
  ".silroom-railBadge.is-dot",
  ".silroom-toggleButton.is-on",
]) {
  if (!styleSource.includes(token)) {
    throw new Error(`Missing all-space badge style: ${token}`);
  }
}

for (const token of [
  "--silroom-mention: #19e58f",
  "--silroom-mention-foreground: #04111d",
  "--silroom-unread: #7aa2ff",
  ".silroom-roomRow.has-unread:not(.has-mention)",
  ".silroom-badge.is-dot",
  ".silroom-roomRailBadge.is-dot",
  "color: var(--silroom-mention-text)",
  "color: var(--silroom-unread-text)",
  "color: var(--silroom-mention-foreground)",
]) {
  if (!styleSource.includes(token)) {
    throw new Error(`Missing separated notification color style: ${token}`);
  }
}

const mentionColor = styleSource.match(/--silroom-mention:\s*([^;]+);/)?.[1]?.trim();
const unreadColor = styleSource.match(/--silroom-unread:\s*([^;]+);/)?.[1]?.trim();
if (!mentionColor || !unreadColor || mentionColor === unreadColor) {
  throw new Error("Mention and unread notification colors must be visibly distinct.");
}

for (const token of [
  ".silroom-railBadge.is-unread.is-dot",
  ".silroom-roomRailBadge.is-unread.is-dot",
  ".silroom-badge.is-unread.is-dot",
  "transform: translateX(3px);",
]) {
  if (!styleSource.includes(token)) {
    throw new Error(`Missing unread badge position adjustment: ${token}`);
  }
}

for (const token of [
  'return { kind: "unread", dot: true, label: "未読あり" };',
  'class: "silroom-badge is-unread is-dot"',
  'class: "silroom-roomRailBadge is-unread is-dot"',
  'title: "未読あり"',
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Unread notifications must be countless and subdued: ${token}`);
  }
}

const fixtureSource = read("tests/fixtures/chatwork-like.html");
for (const token of [
  'aria-label="自分宛 2"',
  'data-chatwork-to-me="true"',
  'aria-label="未読 1"',
  'data-workspace="サンプルA"',
  'data-workspace="サンプルB"',
]) {
  if (!fixtureSource.includes(token)) {
    throw new Error(`Fixture must cover workspace notifications: ${token}`);
  }
}

if (!contentSource.includes("自分宛の未読はありません")) {
  throw new Error("Attention empty state must describe unread mentions.");
}

if (!fixtureSource.includes("マイチャット")) {
  throw new Error("Fixture must include a my chat room.");
}

for (const token of [
  "{ key: \"my\", label: \"マイチャット\"",
  "if (spaceKey === \"my\")",
  "return room.type === \"self\"",
  "workspaceLabel === \"my\"",
  "assets/icons/${space.icon}",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing my chat space token: ${token}`);
  }
}

for (const token of [
  "manualWorkspaces: {}",
  "const getTextWithoutNumericBadges = (node) =>",
  "const getNativeCategoryName = (node) =>",
  '[（(]\\d+\\+?[）)]',
  'settings.selectedSpace.slice("workspace:".length)',
  "dataAction: \"open-room-menu\"",
  "dataAction: \"assign-room-category\"",
  "renderRoomMenuOption(room, \"auto\", \"自動判定\")",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing room categorization token: ${token}`);
  }
}

for (const token of [
  "getRoot().addEventListener(\"contextmenu\"",
  "const handleContextMenu =",
  "自動判定に戻す",
]) {
  if (contentSource.includes(token)) {
    throw new Error(`Room categorization must not use removed right-click behavior/text: ${token}`);
  }
}

for (const token of [
  'aria-label="サンプルA 自分宛 2"',
  'aria-label="サンプルB 未読 3"',
  '<span class="fixture-category-count">(1)</span>',
  '<span class="fixture-badge fixture-badge--unread" aria-label="未読 1"><span><span>1</span></span></span>',
  ".fixture-messageStack",
  "チャット欄の最下部テスト",
]) {
  if (!fixtureSource.includes(token)) {
    throw new Error(`Fixture must cover duplicate badge/category extraction: ${token}`);
  }
}

if (!/const BADGELESS_SPACE_KEYS = new Set\(\["fixed", "unclassified"\]\);/.test(contentSource)) {
  throw new Error("Fixed and unclassified spaces must not show rail notification badges.");
}

if (!/if \(BADGELESS_SPACE_KEYS\.has\(space\.key\)\) {\s*return null;\s*}/.test(contentSource)) {
  throw new Error("Badgeless rail spaces must return no badge.");
}

for (const token of [
  "workspaceStateKey: \"silroomWorkspaceState\"",
  "rememberWorkspaceObservations(rawDomRooms)",
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

for (const token of [
  "const rawDomRooms = Array.from",
  "const domRooms = dedupeDomRoomsById(rawDomRooms);",
  "rememberWorkspaceObservations(rawDomRooms);",
  "const choosePreferredDuplicateRoom =",
  "left.domWorkspace === \"unclassified\"",
  "Boolean(left.avatarSrc) !== Boolean(right.avatarSrc)",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing duplicate room guard token: ${token}`);
  }
}

for (const token of [
  "map.set(child, child.dataset.workspace || currentWorkspace || \"\")",
  "domWorkspace: domWorkspaceMap.get(row) || \"\"",
  "const roomBelongsToWorkspace = (room, workspaceLabel) =>",
  "return roomBelongsToWorkspace(room, spaceKey.replace(\"workspace:\", \"\"));",
  "[room.domWorkspace, ...(room.domWorkspaces || [])]",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing multi-workspace membership token: ${token}`);
  }
}

const rememberRoomWorkspaceSource = contentSource.match(
  /const rememberRoomWorkspace = \(room, workspaceLabel\) => \{([\s\S]*?)\n  \};/
)?.[1];
if (!rememberRoomWorkspaceSource) {
  throw new Error("Could not inspect room workspace persistence.");
}
if (rememberRoomWorkspaceSource.includes("isSeparatedPersonalRoom(room)")) {
  throw new Error("Personal chats must be persisted in their Chatwork workspaces.");
}
if (/removeRoomFromWorkspaceState\(roomId, previousWorkspace\)/.test(rememberRoomWorkspaceSource)) {
  throw new Error("Remembering a workspace must not remove another workspace membership.");
}

for (const token of [
  'id="444444444" role="tab" aria-label="カテゴリ 一郎" data-workspace="サンプルA"',
  'id="444444444" role="tab" aria-label="カテゴリ 一郎" data-workspace="サンプルB"',
]) {
  if (!fixtureSource.includes(token)) {
    throw new Error(`Fixture must cover DM and multi-workspace membership: ${token}`);
  }
}

for (const token of [
  "let nativeWorkspaceSignature = \"\";",
  "let nativeWorkspaceStableCount = 0;",
  "let nativeWorkspaceStableSince = 0;",
  "const WORKSPACE_NATIVE_STABLE_MS = 1800;",
  "const WORKSPACE_PENDING_READBACK_MS = 3200;",
  "const isWorkspaceReadbackPending =",
  "const isNativeWorkspaceSignatureStable =",
  "const shouldDeferUnclassifiedWorkspaceObservation =",
  "const scheduleNativeWorkspaceStableRender =",
  "const ROOM_READ_CONFIRM_DELAY = 140;",
  "let roomReadReceipts = new Map();",
  "const applyRoomReadReceipt =",
  "const markRoomReadLocally =",
  "const scheduleRoomReadConfirmation =",
  "const adjustNativeStatsForReadReceipts =",
  "const snapshotChanged =",
  '\"mentionCount\", \"unreadCount\"',
  "scheduleApiRefresh(ROOM_READ_API_REFRESH_DELAY, true);",
  "scheduleRoomReadConfirmation(getCurrentRid());",
  "const getStoredWorkspaceLabelsForRoom =",
  "const reconcileWorkspaceStateWithNativeCategories =",
  "if (!isNativeWorkspaceSignatureStable(now))",
  "scheduleNativeWorkspaceStableRender(now);",
  "delete workspaceState.workspaceRooms[workspaceName]",
  "const staleManualRoomIds =",
  "workspaceLabel === \"unclassified\" && shouldDeferUnclassifiedWorkspaceObservation()",
  "if (workspaceLabel === \"unclassified\")",
  "return forgetRoomWorkspace(room);",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing deleted workspace cleanup token: ${token}`);
  }
}

for (const token of [
  'event.target.closest?.(\'#_roomListArea li[role="tab"][id]\')',
  'location.hash = `#!rid${row.id}`;',
]) {
  if (!fixtureSource.includes(token)) {
    throw new Error(`Fixture must emulate native room activation: ${token}`);
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

const modalYieldRule = css.match(/:root\.silroom-chatwork-modal-open #silroom-root\s*{([^}]*)}/);
if (!modalYieldRule || !/z-index:\s*0;/.test(modalYieldRule[1])) {
  throw new Error("Chatwork modal overlay must move the SILroom stacking context behind Chatwork.");
}

if (/(opacity:\s*0|visibility:\s*hidden|pointer-events:\s*none)/.test(modalYieldRule[1])) {
  throw new Error("Chatwork modal overlay handling must not hide SILroom.");
}

if (css.includes(":root.silroom-chatwork-modal-open #silroom-shell")) {
  throw new Error("Chatwork modal overlay handling must not hide the SILroom shell.");
}

for (const token of [
  "overscroll-behavior: none !important;",
  ":root.silroom-enabled #_chatContent",
  "overscroll-behavior: contain !important;",
  "const SILROOM_SCROLL_SURFACE_SELECTOR = [",
  "const handleSilroomListWheel = (event) =>",
  'getRoot().addEventListener("wheel", handleSilroomListWheel, { capture: true, passive: false })',
  "const handleMainOverscroll = (event) =>",
  'document.addEventListener("wheel", handleMainOverscroll, { capture: true, passive: false })',
]) {
  if (!contentSource.includes(token) && !css.includes(token)) {
    throw new Error(`Missing overscroll guard token: ${token}`);
  }
}

for (const token of [
  "const rootChildren = [",
  "].filter(Boolean);",
  "root.replaceChildren(...rootChildren);",
]) {
  if (!contentSource.includes(token)) {
    throw new Error(`Missing root flow guard token: ${token}`);
  }
}

if (!/#silroom-root\s*\{[^}]*height:\s*0;[^}]*position:\s*fixed;[^}]*width:\s*0;/s.test(css)) {
  throw new Error("SILroom root must not add height to the Chatwork document.");
}

for (const selector of [".silroom-roomList", ".silroom-roomRailList", ".silroom-railGroupWorkspaces"]) {
  const escaped = selector.replace(".", "\\.");
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
  if (!rule.includes("overscroll-behavior: contain;")) {
    throw new Error(`${selector} must contain its own scrolling.`);
  }
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
