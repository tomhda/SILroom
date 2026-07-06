(() => {
  "use strict";

  const APP = {
    name: "SILroom",
    rootId: "silroom-root",
    shellId: "silroom-shell",
    version: "0.1.0",
    storageKey: "silroomSettings",
    iconsKey: "silroomWorkspaceIcons",
    workspaceStateKey: "silroomWorkspaceState",
  };

  const SELECTORS = {
    sideContent: "#_sideContent",
    roomListArea: "#_roomListArea",
    mainContent: "#_mainContent",
    subContent: "#_subContent",
    chatContent: "#_chatContent",
    sendArea: "#_chatSendArea",
    currentRoom: ".roomMainContent__currentSelectedRoom",
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    selectedSpace: "all",
    quickFilter: "all",
    overviewCollapsed: true,
    panelCollapsed: false,
    panelWidth: 302,
    density: "comfortable",
    manualTypes: {},
    workspaceIcons: {},
    workspaceOrder: [],
    apiAssistEnabled: false,
    apiAssistVersion: 0,
  };

  const SPACE_ORDER = [
    "all",
    "attention",
    "fixed",
    "unclassified",
    "dm",
  ];

  const PANEL_WIDTH = {
    min: 172,
    max: 760,
    default: 302,
    collapsed: 54,
  };

  const SMART_SPACE_ICONS = {
    attention: "mention.svg",
    all: "all.svg",
    fixed: "pin.svg",
    unclassified: "unclassified.svg",
    dm: "dm.svg",
  };
  const BADGELESS_SPACE_KEYS = new Set(["fixed", "unclassified"]);
  const WORKSPACE_STATE_TTL = 14 * 24 * 60 * 60 * 1000;
  const WORKSPACE_SYNC_STALE_MS = 6 * 60 * 60 * 1000;
  const API_REFRESH_INTERACTIVE_INTERVAL = 6000;

  const GROUPISH_WORDS = [
    "株式会社",
    "合同会社",
    "社内",
    "様",
    "チャット",
    "チーム",
    "グループ",
    "制作",
    "運用",
    "広告",
    "連携",
    "共有",
    "確認",
    "レポート",
    "請求",
    "現場",
    "アカウント",
    "クリエイティブ",
    "LP",
    "Meta",
    "×",
    "↔",
    "<",
    ">",
    "【",
    "】",
    "_",
    "/",
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let rooms = [];
  let spaces = [];
  let apiRoomsById = new Map();
  let apiSyncState = { enabled: false, status: "idle", error: "", fetchedAt: 0 };
  let workspaceState = { roomWorkspace: {}, roomSnapshots: {}, workspaceRooms: {}, updatedAt: 0 };
  let spaceRoomCache = new Map();
  let pendingWorkspaceLoad = { key: "", startedAt: 0 };
  let draggingWorkspaceLabel = "";
  let suppressRailClickUntil = 0;
  let panelResizeState = null;
  let renderTimer = 0;
  let apiRefreshTimer = 0;
  let workspaceStatePersistTimer = 0;
  let workspaceSettleTimer = 0;
  let observerReconnectTimer = 0;
  let apiRefreshInFlight = false;
  let lastRenderedListKey = "";
  let observer = null;
  let structureObserver = null;
  let observedRoomListArea = null;
  let observedSubContent = null;
  let initialized = false;

  const API_REFRESH_MIN_INTERVAL = 30000;
  const LOGO_SIZE = 128;

  const isChatworkPage = () => location.hostname.endsWith("chatwork.com");

  const stripPrivateSettings = (value = {}) => {
    const next = { ...value };
    delete next.apiToken;
    delete next.workspaceIcons;
    return next;
  };

  const normalizeWorkspaceState = (value = {}) => ({
    roomWorkspace: value && typeof value.roomWorkspace === "object" ? value.roomWorkspace : {},
    roomSnapshots: value && typeof value.roomSnapshots === "object" ? value.roomSnapshots : {},
    workspaceRooms: value && typeof value.workspaceRooms === "object" ? value.workspaceRooms : {},
    updatedAt: toNumber(value?.updatedAt),
  });

  const pruneWorkspaceState = (state) => {
    const cutoff = Date.now() - WORKSPACE_STATE_TTL;
    const next = normalizeWorkspaceState(state);

    next.roomWorkspace = Object.fromEntries(
      Object.entries(next.roomWorkspace).filter(([, entry]) => entry?.workspace && toNumber(entry.observedAt) >= cutoff)
    );
    next.roomSnapshots = Object.fromEntries(
      Object.entries(next.roomSnapshots).filter(([, room]) => room?.id && toNumber(room.observedAt) >= cutoff)
    );
    next.workspaceRooms = Object.fromEntries(
      Object.entries(next.workspaceRooms)
        .map(([workspace, entry]) => [
          workspace,
          {
            roomIds: Array.isArray(entry?.roomIds) ? Array.from(new Set(entry.roomIds.map(String))) : [],
            updatedAt: toNumber(entry?.updatedAt),
          },
        ])
        .filter(([, entry]) => entry.roomIds.length > 0 && entry.updatedAt >= cutoff)
    );

    next.updatedAt = toNumber(next.updatedAt) || Date.now();
    return next;
  };

  const storage = {
    async get() {
      if (globalThis.chrome?.storage?.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get({ [APP.storageKey]: {}, [APP.iconsKey]: {}, [APP.workspaceStateKey]: {} }, (result) => {
            const storedSettings = result[APP.storageKey] || {};
            const workspaceIcons = result[APP.iconsKey] || storedSettings.workspaceIcons || {};
            workspaceState = pruneWorkspaceState(result[APP.workspaceStateKey] || {});
            resolve({
              ...DEFAULT_SETTINGS,
              ...stripPrivateSettings(storedSettings),
              workspaceIcons,
            });
          });
        });
      }

      try {
        const storedSettings = JSON.parse(localStorage.getItem(APP.storageKey) || "{}");
        workspaceState = pruneWorkspaceState(JSON.parse(localStorage.getItem(APP.workspaceStateKey) || "{}"));
        return {
          ...DEFAULT_SETTINGS,
          ...stripPrivateSettings(storedSettings),
          workspaceIcons: JSON.parse(localStorage.getItem(APP.iconsKey) || "{}"),
        };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },

    async set(next) {
      settings = { ...settings, ...next };
      const storageSettings = stripPrivateSettings(settings);
      const iconsChanged = Object.prototype.hasOwnProperty.call(next, "workspaceIcons");

      if (globalThis.chrome?.storage?.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set(
            {
              [APP.storageKey]: storageSettings,
              ...(iconsChanged ? { [APP.iconsKey]: settings.workspaceIcons || {} } : {}),
            },
            resolve
          );
        });
      }

      localStorage.setItem(APP.storageKey, JSON.stringify(storageSettings));
      if (iconsChanged) {
        localStorage.setItem(APP.iconsKey, JSON.stringify(settings.workspaceIcons || {}));
      }
      return undefined;
    },

    async setWorkspaceState(nextState) {
      workspaceState = pruneWorkspaceState(nextState);

      if (globalThis.chrome?.storage?.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [APP.workspaceStateKey]: workspaceState }, resolve);
        });
      }

      localStorage.setItem(APP.workspaceStateKey, JSON.stringify(workspaceState));
      return undefined;
    },
  };

  const h = (tag, attrs = {}, children = []) => {
    const element = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
      if (value === false || value == null) {
        return;
      }

      if (key === "class") {
        element.className = value;
      } else if (key === "text") {
        element.textContent = value;
      } else if (/^aria[A-Z]/.test(key)) {
        const ariaKey = key.replace(/^aria/, "").replace(/[A-Z]/g, (match, offset) => {
          const lower = match.toLowerCase();
          return offset === 0 ? lower : `-${lower}`;
        });
        element.setAttribute(`aria-${ariaKey}`, String(value));
      } else if (key.startsWith("data")) {
        const dataKey = key
          .replace(/^data/, "")
          .replace(/^[A-Z]/, (match) => match.toLowerCase());
        element.dataset[dataKey] = String(value);
      } else if (key === "checked") {
        element.checked = Boolean(value);
      } else {
        element.setAttribute(key, String(value));
      }
    });

    children.forEach((child) => {
      if (child == null) {
        return;
      }

      element.append(typeof child === "string" ? document.createTextNode(child) : child);
    });

    return element;
  };

  const debounceRender = (delay = 120) => {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, delay);
  };

  const getRoot = () => {
    let root = document.getElementById(APP.rootId);

    if (root) {
      return root;
    }

    root = h("div", { id: APP.rootId });
    document.documentElement.append(root);
    return root;
  };

  const assetUrl = (path) => {
    if (globalThis.chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }

    return path;
  };

  const sendRuntimeMessage = (message) =>
    new Promise((resolve) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve({ ok: true, enabled: false, rooms: [] });
        return;
      }

      try {
        chrome.runtime.sendMessage({ source: "silroom", ...message }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, enabled: false, error: chrome.runtime.lastError.message });
            return;
          }

          resolve(response || { ok: false, enabled: false, error: "No response" });
        });
      } catch (error) {
        resolve({ ok: false, enabled: false, error: error.message || "Runtime message failed" });
      }
    });

  const refreshApiRooms = async (force = false) => {
    clearTimeout(apiRefreshTimer);

    if (!settings.apiAssistEnabled) {
      apiRoomsById = new Map();
      apiSyncState = { enabled: false, status: "disabled", error: "", fetchedAt: 0 };
      render();
      return;
    }

    if (
      !force &&
      apiSyncState.fetchedAt &&
      Date.now() - apiSyncState.fetchedAt < API_REFRESH_MIN_INTERVAL
    ) {
      return;
    }

    if (apiRefreshInFlight) {
      return;
    }

    apiRefreshInFlight = true;
    apiSyncState = { ...apiSyncState, enabled: true, status: "loading", error: "" };
    const response = await sendRuntimeMessage({ type: "api:getRooms" });

    if (!settings.apiAssistEnabled) {
      apiRoomsById = new Map();
      apiSyncState = { enabled: false, status: "disabled", error: "", fetchedAt: 0 };
      apiRefreshInFlight = false;
      render();
      return;
    }

    if (response?.ok && response.enabled) {
      apiRoomsById = new Map((response.rooms || []).map((room) => [String(room.room_id), room]));
      apiSyncState = { enabled: true, status: "ready", error: "", fetchedAt: response.fetchedAt || Date.now() };
      apiRefreshInFlight = false;
      render();
      return;
    }

    if (response?.ok && !response.enabled) {
      apiRoomsById = new Map();
      apiSyncState = { enabled: false, status: "disabled", error: "", fetchedAt: 0 };
      apiRefreshInFlight = false;
      render();
      return;
    }

    apiSyncState = {
      enabled: true,
      status: "error",
      error: response?.error || "Chatwork APIに接続できませんでした",
      fetchedAt: 0,
    };
    apiRefreshInFlight = false;
    render();
  };

  const scheduleApiRefresh = (delay = 0, force = false) => {
    if (
      !force &&
      apiSyncState.fetchedAt &&
      Date.now() - apiSyncState.fetchedAt < API_REFRESH_MIN_INTERVAL
    ) {
      return;
    }

    clearTimeout(apiRefreshTimer);
    apiRefreshTimer = window.setTimeout(() => refreshApiRooms(force), delay);
  };

  const scheduleInteractiveApiRefresh = (delay = 0) => {
    if (!settings.apiAssistEnabled) {
      return;
    }

    if (apiSyncState.fetchedAt && Date.now() - apiSyncState.fetchedAt < API_REFRESH_INTERACTIVE_INTERVAL) {
      return;
    }

    clearTimeout(apiRefreshTimer);
    apiRefreshTimer = window.setTimeout(() => refreshApiRooms(true), delay);
  };

  const scheduleWorkspaceStatePersist = (delay = 600) => {
    clearTimeout(workspaceStatePersistTimer);
    workspaceStatePersistTimer = window.setTimeout(() => {
      storage.setWorkspaceState(workspaceState);
    }, delay);
  };

  const applyStateClasses = () => {
    document.documentElement.classList.toggle("silroom-enabled", settings.enabled);
    document.documentElement.classList.toggle(
      "silroom-overview-collapsed",
      settings.enabled && settings.overviewCollapsed
    );
    document.documentElement.classList.toggle("silroom-panel-collapsed", settings.enabled && settings.panelCollapsed);
    document.documentElement.classList.toggle("silroom-density-compact", settings.density === "compact");
    const panelWidth = settings.panelCollapsed ? PANEL_WIDTH.collapsed : getPanelWidthValue();
    document.documentElement.style.setProperty("--silroom-panel-current-width", `${panelWidth}px`);
    document.documentElement.style.setProperty("--silroom-panel-expanded-width", `${getPanelWidthValue()}px`);
    document.documentElement.style.setProperty(
      "--silroom-shell-width",
      `calc(var(--silroom-rail-width) + ${panelWidth}px)`
    );
  };

  const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const cleanCategoryName = (value) =>
    normalizeText(value)
      .replace(/^カテゴリー\s*[-ー:：]?\s*/, "")
      .replace(/\s*[.・…]{2,}\s*$/, "")
      .trim();

  const isUnclassifiedCategoryText = (value) => normalizeText(value).includes("カテゴリー未分類のチャット");

  const isNativeCategoryButton = (node) => {
    if (!node?.matches?.('[role="button"]')) {
      return false;
    }

    const text = cleanCategoryName(node.getAttribute("aria-label") || node.innerText || node.textContent);
    if (!text || text.length > 36) {
      return false;
    }

    return (
      text !== "リサイズハンドル" &&
      text !== "+" &&
      !text.includes("すべてのチャット") &&
      !text.includes("カテゴリー未分類") &&
      !text.includes("チャットを追加") &&
      !text.includes("作成")
    );
  };

  const extractDomWorkspaceMap = (listArea) => {
    const map = new Map();
    let currentWorkspace = "";

    const visit = (node) => {
      Array.from(node.children || []).forEach((child) => {
        if (child.matches?.('li[role="tab"][id]')) {
          map.set(child.id, currentWorkspace || "");
          return;
        }

        const text = normalizeText(child.getAttribute?.("aria-label") || child.innerText || child.textContent);
        if (isUnclassifiedCategoryText(text)) {
          currentWorkspace = "unclassified";
        } else if (isNativeCategoryButton(child)) {
          currentWorkspace = cleanCategoryName(text);
        }

        visit(child);
      });
    };

    visit(listArea);
    return map;
  };

  const numberFromText = (value) => {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const getPanelWidthValue = () => {
    const width = toNumber(settings.panelWidth) || PANEL_WIDTH.default;
    return clamp(width, PANEL_WIDTH.min, PANEL_WIDTH.max);
  };

  const getCurrentRid = () => {
    const match = location.hash.match(/rid(\d+)/);
    return match ? match[1] : "";
  };

  const looksLikePersonName = (name) => {
    const cleaned = normalizeText(name).replace(/[()（）0-9０-９+\-ー/]/g, "");

    if (!cleaned || cleaned === "マイチャット") {
      return false;
    }

    if (GROUPISH_WORDS.some((word) => name.includes(word))) {
      return false;
    }

    if (/^[ぁ-んァ-ヶ一-龠々A-Za-z]+ [ぁ-んァ-ヶ一-龠々A-Za-z]+$/.test(cleaned)) {
      return true;
    }

    return /^[ぁ-んァ-ヶ一-龠々]{2,8}$/.test(cleaned);
  };

  const inferRoomType = (room) => {
    const manual = settings.manualTypes?.[room.id];

    if (manual === "dm" || manual === "room") {
      return manual;
    }

    if (room.apiType === "direct") {
      return "dm";
    }

    if (room.apiType === "my") {
      return "self";
    }

    if (room.apiType === "group") {
      return "room";
    }

    if (room.name === "マイチャット") {
      return "self";
    }

    if (room.avatarSrc.includes("ico_group")) {
      return "room";
    }

    if (looksLikePersonName(room.name)) {
      return "dm";
    }

    return "room";
  };

  const getLearnedWorkspace = (roomId) => {
    const entry = workspaceState.roomWorkspace?.[String(roomId)];
    if (!entry?.workspace || Date.now() - toNumber(entry.observedAt) > WORKSPACE_STATE_TTL) {
      return "";
    }

    return entry.workspace;
  };

  const inferWorkspace = (room) => {
    if (room.type === "dm") {
      return "dm";
    }

    if (room.domWorkspace) {
      return room.domWorkspace;
    }

    const learnedWorkspace = getLearnedWorkspace(room.id);
    if (learnedWorkspace) {
      return learnedWorkspace;
    }

    return "unclassified";
  };

  const parseRgb = (value) => {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };

  const isGreenDominant = (color) => {
    const rgb = parseRgb(color);
    return Boolean(rgb && rgb[1] > rgb[0] + 24 && rgb[1] > rgb[2] + 8);
  };

  const classifyBadge = (element) => {
    const text = normalizeText(element.innerText || element.textContent);
    const value = numberFromText(text);

    if (!value) {
      return null;
    }

    const style = getComputedStyle(element);
    const colorLine = `${style.backgroundColor} ${style.color} ${element.className || ""}`.toLowerCase();
    const isMention =
      isGreenDominant(style.backgroundColor) ||
      colorLine.includes("rgb(0, 153") ||
      colorLine.includes("rgb(0, 170") ||
      colorLine.includes("rgb(0, 180") ||
      colorLine.includes("green") ||
      colorLine.includes("mention");

    return {
      value,
      kind: isMention ? "mention" : "unread",
    };
  };

  const extractBadges = (row) => {
    const candidates = Array.from(row.querySelectorAll("*")).filter((element) => {
      const rect = element.getBoundingClientRect();
      const text = normalizeText(element.innerText || element.textContent);
      return rect.width <= 42 && rect.height <= 28 && /^\d+$/.test(text);
    });

    const totals = { mention: 0, unread: 0 };

    candidates.forEach((element) => {
      const badge = classifyBadge(element);
      if (!badge) {
        return;
      }
      totals[badge.kind] += badge.value;
    });

    return totals;
  };

  const extractPinState = (row) => {
    const pinNode = Array.from(row.querySelectorAll("[aria-label], svg, use, span, div")).find((element) => {
      const aria = element.getAttribute("aria-label") || "";
      const className = typeof element.className === "string" ? element.className : "";
      return aria.includes("ピン") || className.toLowerCase().includes("pin");
    });

    if (!pinNode) {
      return false;
    }

    const className = typeof pinNode.className === "string" ? pinNode.className : "";
    const aria = pinNode.getAttribute("aria-label") || "";

    return (
      className.includes("--active") ||
      className.includes("active") ||
      aria.includes("固定されています") ||
      aria.includes("ピン留めを解除")
    );
  };

  const extractRooms = () => {
    const listArea = document.querySelector(SELECTORS.roomListArea);
    const currentRid = getCurrentRid();

    if (!listArea) {
      return extractApiOnlyRooms(currentRid);
    }

    const domWorkspaceMap = extractDomWorkspaceMap(listArea);

    const domRooms = Array.from(listArea.querySelectorAll('li[role="tab"][id]'))
      .map((row, index) => {
        const apiRoom = apiRoomsById.get(String(row.id));
        const name = normalizeText(row.getAttribute("aria-label") || row.innerText || row.textContent || apiRoom?.name);
        const img = row.querySelector("img");
        const avatarSrc = apiRoom?.icon_path || img?.getAttribute("src") || "";
        const active = row.id === currentRid || row.getAttribute("aria-selected") === "true";
        const badges = extractBadges(row);
        const mentionCount = active ? 0 : badges.mention;
        const unreadCount = active ? 0 : badges.unread;
        const room = {
          id: row.id,
          name,
          avatarSrc,
          mentionCount,
          unreadCount,
          pinned: apiRoom ? Boolean(apiRoom.sticky) : extractPinState(row),
          active,
          sourceIndex: index,
          nativeRow: row,
          domWorkspace: domWorkspaceMap.get(row.id) || "",
          apiType: apiRoom?.type || "",
          lastUpdateTime: toNumber(apiRoom?.last_update_time),
        };

        room.type = inferRoomType(room);
        room.workspace = inferWorkspace(room);
        room.priority = getPriority(room);
        return room;
      })
      .filter((room) => room.id && room.name);

    rememberWorkspaceObservations(domRooms);

    const seenIds = new Set(domRooms.map((room) => String(room.id)));
    return [...domRooms, ...extractApiOnlyRooms(currentRid, seenIds, domRooms.length)];
  };

  const extractApiOnlyRooms = (currentRid, seenIds = new Set(), offset = 0) =>
    Array.from(apiRoomsById.values())
      .filter((apiRoom) => apiRoom?.room_id && !seenIds.has(String(apiRoom.room_id)))
      .map((apiRoom, index) => {
        const active = String(apiRoom.room_id) === currentRid;
        const mentionCount = active ? 0 : toNumber(apiRoom.mention_num);
        const unreadCount = active ? 0 : Math.max(0, toNumber(apiRoom.unread_num) - mentionCount);
        const room = {
          id: String(apiRoom.room_id),
          name: normalizeText(apiRoom.name),
          avatarSrc: apiRoom.icon_path || "",
          mentionCount,
          unreadCount,
          pinned: Boolean(apiRoom.sticky),
          active,
          sourceIndex: offset + index,
          nativeRow: null,
          domWorkspace: "",
          apiType: apiRoom.type || "",
          lastUpdateTime: toNumber(apiRoom.last_update_time),
        };

        room.type = inferRoomType(room);
        room.workspace = inferWorkspace(room);
        room.priority = getPriority(room);
        return room;
      })
      .filter((room) => room.id && room.name);

  const extractCategoryNames = () => {
    const listArea = document.querySelector(SELECTORS.roomListArea);
    if (!listArea) {
      return [];
    }

    const categoryNames = Array.from(listArea.querySelectorAll('[role="button"]'))
      .filter(isNativeCategoryButton)
      .map((node) => cleanCategoryName(node.getAttribute("aria-label") || node.innerText || node.textContent))
      .filter(Boolean);

    return Array.from(new Set(categoryNames));
  };

  const getPriority = (room) => {
    if (room.mentionCount > 0) {
      return 0;
    }
    if (room.unreadCount > 0) {
      return 1;
    }
    if (room.pinned) {
      return 2;
    }
    return 3;
  };

  const snapshotRoom = (room) => ({
    id: String(room.id),
    name: room.name,
    avatarSrc: room.avatarSrc || "",
    mentionCount: toNumber(room.mentionCount),
    unreadCount: toNumber(room.unreadCount),
    pinned: Boolean(room.pinned),
    type: room.type || "room",
    workspace: room.workspace || "",
    apiType: room.apiType || "",
    lastUpdateTime: toNumber(room.lastUpdateTime),
    sourceIndex: toNumber(room.sourceIndex),
    observedAt: Date.now(),
  });

  const removeRoomFromWorkspaceState = (roomId, workspaceLabel) => {
    const entry = workspaceState.workspaceRooms?.[workspaceLabel];
    if (!entry?.roomIds?.length) {
      return;
    }

    entry.roomIds = entry.roomIds.filter((id) => String(id) !== String(roomId));
    entry.updatedAt = Date.now();
  };

  const rememberRoomWorkspace = (room, workspaceLabel) => {
    if (!workspaceLabel || workspaceLabel === "dm" || workspaceLabel === "unclassified" || room.type === "dm") {
      return false;
    }

    const roomId = String(room.id);
    const now = Date.now();
    const previousWorkspace = workspaceState.roomWorkspace?.[roomId]?.workspace;
    let changed = false;

    workspaceState.roomWorkspace = workspaceState.roomWorkspace || {};
    workspaceState.roomSnapshots = workspaceState.roomSnapshots || {};
    workspaceState.workspaceRooms = workspaceState.workspaceRooms || {};

    if (previousWorkspace && previousWorkspace !== workspaceLabel) {
      removeRoomFromWorkspaceState(roomId, previousWorkspace);
      changed = true;
    }

    const previous = workspaceState.roomWorkspace[roomId] || {};
    if (previous.workspace !== workspaceLabel) {
      changed = true;
    }
    if (now - toNumber(previous.observedAt) > WORKSPACE_SYNC_STALE_MS / 2) {
      changed = true;
    }

    workspaceState.roomWorkspace[roomId] = { workspace: workspaceLabel, observedAt: now };
    workspaceState.roomSnapshots[roomId] = snapshotRoom({ ...room, workspace: workspaceLabel });

    const workspaceEntry = workspaceState.workspaceRooms[workspaceLabel] || { roomIds: [], updatedAt: 0 };
    if (now - toNumber(workspaceEntry.updatedAt) > WORKSPACE_SYNC_STALE_MS / 2) {
      changed = true;
    }
    if (!workspaceEntry.roomIds.map(String).includes(roomId)) {
      workspaceEntry.roomIds = [...workspaceEntry.roomIds.map(String), roomId];
      changed = true;
    }
    workspaceEntry.updatedAt = now;
    workspaceState.workspaceRooms[workspaceLabel] = workspaceEntry;
    workspaceState.updatedAt = now;

    return changed;
  };

  const rememberWorkspaceObservations = (observedRooms) => {
    let changed = false;

    observedRooms.forEach((room) => {
      if (!room.domWorkspace) {
        return;
      }

      changed = rememberRoomWorkspace(room, room.domWorkspace) || changed;
    });

    if (changed) {
      scheduleWorkspaceStatePersist();
    }
  };

  const getKnownWorkspaceNames = (categoryNames = []) => {
    const learnedNames = Object.keys(workspaceState.workspaceRooms || {});
    const mappedNames = Object.values(workspaceState.roomWorkspace || {})
      .map((entry) => entry?.workspace)
      .filter(Boolean);

    return Array.from(new Set([...categoryNames, ...learnedNames, ...mappedNames]));
  };

  const buildSpaces = () => {
    const categoryNames = getOrderedWorkspaceNames(getKnownWorkspaceNames(extractCategoryNames()));
    const categorySpaces = categoryNames.map((name) => ({ key: `workspace:${name}`, label: name, short: makeWorkspaceShortName(name), kind: "workspace" }));
    const baseSpaces = [
      { key: "all", label: "全体", short: "全", kind: "smart", icon: SMART_SPACE_ICONS.all },
      { key: "attention", label: "自分宛", short: "宛", kind: "smart", icon: SMART_SPACE_ICONS.attention },
      { key: "fixed", label: "固定", short: "固", kind: "smart", icon: SMART_SPACE_ICONS.fixed },
      { key: "unclassified", label: "未分類", short: "未", kind: "smart", icon: SMART_SPACE_ICONS.unclassified },
      { key: "dm", label: "DM", short: "DM", kind: "smart", icon: SMART_SPACE_ICONS.dm },
    ];

    return [...baseSpaces, ...categorySpaces];
  };

  const getOrderedWorkspaceNames = (categoryNames) => {
    const names = Array.from(new Set(categoryNames));
    const savedOrder = Array.isArray(settings.workspaceOrder) ? settings.workspaceOrder : [];
    const available = new Set(names);
    const orderedSaved = savedOrder.filter((name) => available.has(name));
    const remaining = names.filter((name) => !orderedSaved.includes(name));
    return [...orderedSaved, ...remaining];
  };

  const makeWorkspaceShortName = (name) => {
    if (/^[A-Za-z0-9]+$/.test(name)) {
      return name.slice(0, 2).toUpperCase();
    }

    return Array.from(name).slice(0, 2).join("");
  };

  const reviveStoredRoom = (roomId, workspaceLabel) => {
    const id = String(roomId);
    const snapshot = workspaceState.roomSnapshots?.[id];
    const apiRoom = apiRoomsById.get(id);

    if (!snapshot && !apiRoom) {
      return null;
    }

    const mentionCount = apiRoom ? toNumber(apiRoom.mention_num) : toNumber(snapshot?.mentionCount);
    const unreadCount = apiRoom
      ? Math.max(0, toNumber(apiRoom.unread_num) - mentionCount)
      : toNumber(snapshot?.unreadCount);
    const room = {
      id,
      name: normalizeText(apiRoom?.name || snapshot?.name),
      avatarSrc: apiRoom?.icon_path || snapshot?.avatarSrc || "",
      mentionCount,
      unreadCount,
      pinned: apiRoom ? Boolean(apiRoom.sticky) : Boolean(snapshot?.pinned),
      active: id === getCurrentRid(),
      sourceIndex: toNumber(snapshot?.sourceIndex),
      nativeRow: document.getElementById(id),
      domWorkspace: "",
      apiType: apiRoom?.type || snapshot?.apiType || "",
      lastUpdateTime: toNumber(apiRoom?.last_update_time || snapshot?.lastUpdateTime),
      type: snapshot?.type || "",
      workspace: workspaceLabel,
    };

    if (!room.type) {
      room.type = inferRoomType(room);
    }
    room.priority = getPriority(room);
    return room.name ? room : null;
  };

  const getStoredWorkspaceRoomIds = (workspaceLabel) => {
    const directIds = workspaceState.workspaceRooms?.[workspaceLabel]?.roomIds || [];
    const mappedIds = Object.entries(workspaceState.roomWorkspace || {})
      .filter(([, entry]) => entry?.workspace === workspaceLabel)
      .map(([roomId]) => roomId);

    return Array.from(new Set([...directIds, ...mappedIds].map(String)));
  };

  const getStateRoomsForWorkspace = (spaceKey) => {
    if (!spaceKey?.startsWith("workspace:")) {
      return [];
    }

    const workspaceLabel = spaceKey.replace("workspace:", "");
    const liveById = new Map(rooms.map((room) => [String(room.id), room]));
    return getStoredWorkspaceRoomIds(workspaceLabel)
      .map((roomId) => liveById.get(roomId) || reviveStoredRoom(roomId, workspaceLabel))
      .filter(Boolean);
  };

  const mergeRoomsById = (primaryRooms, fallbackRooms) => {
    const seen = new Set();
    const merged = [];

    [...primaryRooms, ...fallbackRooms].forEach((room) => {
      const id = String(room.id);
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      merged.push(room);
    });

    return merged;
  };

  const roomMatchesSpace = (room, spaceKey) => {
    if (spaceKey === "all") {
      return true;
    }
    if (spaceKey === "attention") {
      return room.mentionCount > 0;
    }
    if (spaceKey === "fixed") {
      return room.pinned;
    }
    if (spaceKey === "unclassified") {
      return room.workspace === "unclassified" && room.type !== "dm";
    }
    if (spaceKey === "dm") {
      return room.type === "dm";
    }
    if (spaceKey.startsWith("workspace:")) {
      return room.workspace === spaceKey.replace("workspace:", "") && room.type !== "dm";
    }
    return true;
  };

  const isWorkspaceSpace = (spaceKey) => spaceKey?.startsWith("workspace:");
  const isAttentionSpace = (spaceKey) => spaceKey === "attention";
  const usesQuickFilter = (spaceKey) => !isAttentionSpace(spaceKey);

  const getRoomsForSpace = (spaceKey) => {
    const liveRooms = rooms.filter((room) => roomMatchesSpace(room, spaceKey));

    if (!isWorkspaceSpace(spaceKey)) {
      return liveRooms;
    }

    return mergeRoomsById(liveRooms, getStateRoomsForWorkspace(spaceKey));
  };

  const applyQuickFilter = (room) => {
    if (!usesQuickFilter(settings.selectedSpace)) {
      return true;
    }

    if (settings.quickFilter === "mention") {
      return room.mentionCount > 0;
    }
    if (settings.quickFilter === "unread") {
      return room.mentionCount > 0 || room.unreadCount > 0;
    }
    if (settings.quickFilter === "fixed") {
      return room.pinned;
    }
    return true;
  };

  const updateSpaceRoomCache = () => {
    const nextCache = new Map(spaceRoomCache);

    spaces.forEach((space) => {
      if (isWorkspaceSpace(space.key) && space.key !== settings.selectedSpace) {
        return;
      }

      const targetRooms = getRoomsForSpace(space.key);
      if (targetRooms.length > 0) {
        const roomsSnapshot = targetRooms.map((room) => ({ ...room, nativeRow: null }));

        if (isWorkspaceSpace(space.key)) {
          const previous = nextCache.get(space.key) || {};
          const signature = roomsSnapshot.map((room) => room.id).join("|");
          const candidateSeen = previous.candidateSignature === signature ? (previous.candidateSeen || 1) + 1 : 1;
          const nextEntry = {
            ...previous,
            candidateRooms: roomsSnapshot,
            candidateSeen,
            candidateSignature: signature,
            candidateUpdatedAt: Date.now(),
          };

          if (candidateSeen >= 2) {
            nextEntry.rooms = roomsSnapshot;
            nextEntry.updatedAt = Date.now();
          }

          nextCache.set(space.key, nextEntry);
          return;
        }

        nextCache.set(space.key, {
          rooms: roomsSnapshot,
          updatedAt: Date.now(),
        });
      }
    });

    spaceRoomCache = nextCache;
  };

  const getVisibleRooms = () => {
    const selectedRooms = getRoomsForSpace(settings.selectedSpace);
    const fallback = spaceRoomCache.get(settings.selectedSpace);
    const pendingCurrentWorkspace =
      pendingWorkspaceLoad.key === settings.selectedSpace && Date.now() - pendingWorkspaceLoad.startedAt < 2600;
    const sourceRooms = isWorkspaceSpace(settings.selectedSpace)
      ? fallback?.rooms || (pendingCurrentWorkspace ? [] : fallback?.candidateRooms || [])
      : selectedRooms;

    return sourceRooms
      .filter(applyQuickFilter)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        if (b.mentionCount !== a.mentionCount) {
          return b.mentionCount - a.mentionCount;
        }
        if (b.unreadCount !== a.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        if (b.lastUpdateTime !== a.lastUpdateTime) {
          return b.lastUpdateTime - a.lastUpdateTime;
        }
        return a.sourceIndex - b.sourceIndex;
      });
  };

  const getSpaceStats = (spaceKey) => {
    const liveRooms = getRoomsForSpace(spaceKey);
    const cachedEntry = spaceRoomCache.get(spaceKey);
    const cachedRooms = cachedEntry?.rooms || cachedEntry?.candidateRooms || [];
    const targetRooms = isWorkspaceSpace(spaceKey) ? cachedRooms : liveRooms;

    return {
      total: targetRooms.length,
      mention: targetRooms.reduce((sum, room) => sum + room.mentionCount, 0),
      unread: targetRooms.reduce((sum, room) => sum + room.unreadCount, 0),
    };
  };

  const getRailBadge = (space, stats) => {
    if (BADGELESS_SPACE_KEYS.has(space.key)) {
      return null;
    }

    if (space.key === "attention") {
      return stats.mention > 0 ? { kind: "mention", value: stats.mention } : null;
    }

    if (stats.mention > 0) {
      return { kind: "mention", value: stats.mention };
    }

    if (stats.unread > 0) {
      return { kind: "unread", value: stats.unread };
    }

    return null;
  };

  const renderRailBadge = (space, stats) => {
    const badge = getRailBadge(space, stats);

    if (!badge) {
      return null;
    }

    return h("span", {
      class: `silroom-railBadge is-${badge.kind}`,
      text: badge.value > 99 ? "99+" : badge.value,
    });
  };

  const getCurrentSpace = () => spaces.find((space) => space.key === settings.selectedSpace) || spaces[0];

  const getWorkspaceIcon = (space) => {
    if (space.kind !== "workspace") {
      return "";
    }

    return settings.workspaceIcons?.[space.label] || "";
  };

  const renderSpaceIcon = (space) => {
    const workspaceIcon = getWorkspaceIcon(space);

    if (workspaceIcon) {
      return h("img", { class: "silroom-railIconImage", src: workspaceIcon, alt: "" });
    }

    if (space.icon) {
      return h("img", { class: "silroom-railIconImage", src: assetUrl(`assets/icons/${space.icon}`), alt: "" });
    }

    return h("span", { class: "silroom-railIconText", text: space.short });
  };

  const renderWorkspaceLogoButton = (space) => {
    const workspaceIcon = getWorkspaceIcon(space);

    return h(
      "button",
      {
        class: "silroom-spaceLogoButton",
        type: "button",
        title: `${space.label}のロゴを変更`,
        ariaLabel: `${space.label}のロゴを変更`,
        dataAction: "upload-workspace-logo",
        dataWorkspace: space.label,
      },
      [
        workspaceIcon
          ? h("img", { class: "silroom-spaceLogoImage", src: workspaceIcon, alt: "" })
          : h("span", { class: "silroom-spaceLogoText", text: space.short }),
      ]
    );
  };

  const renderRailItem = (space) => {
    const stats = getSpaceStats(space.key);
    const selected = space.key === settings.selectedSpace;
    const draggable = space.kind === "workspace";

    return h(
      "button",
      {
        class: `silroom-railItem${selected ? " is-selected" : ""}${draggable ? " is-draggable" : ""}${draggingWorkspaceLabel === space.label ? " is-dragging" : ""}`,
        type: "button",
        draggable,
        title: space.label,
        ariaLabel: space.label,
        dataAction: "select-space",
        dataSpace: space.key,
        dataWorkspace: draggable ? space.label : null,
      },
      [
        h("span", { class: `silroom-railIcon${space.kind === "workspace" ? " is-workspace" : " is-smart"}` }, [renderSpaceIcon(space)]),
        renderRailBadge(space, stats),
      ]
    );
  };

  const renderRail = () => {
    const smart = spaces.filter((space) => SPACE_ORDER.includes(space.key));
    const workspaces = spaces.filter((space) => space.kind === "workspace");
    const renderWorkspaceDropZone = (position) =>
      h("div", {
        class: "silroom-workspaceDropZone",
        dataDropPosition: position,
        ariaHidden: "true",
      });

    return h("aside", { class: "silroom-rail", ariaLabel: "SILroom spaces" }, [
      h("div", { class: "silroom-railGroup" }, smart.map(renderRailItem)),
      h("div", { class: "silroom-railDivider" }),
      h("div", { class: "silroom-railGroup silroom-railGroupWorkspaces" }, [
        renderWorkspaceDropZone("top"),
        ...workspaces.map(renderRailItem),
        renderWorkspaceDropZone("bottom"),
      ]),
      h("div", { class: "silroom-railFooter" }, [
        h(
          "button",
          {
            class: "silroom-iconButton",
            type: "button",
            title: settings.enabled ? "SILroomを一時停止" : "SILroomを再開",
            ariaLabel: settings.enabled ? "SILroomを一時停止" : "SILroomを再開",
            dataAction: "toggle-enabled",
          },
          [h("img", { class: "silroom-powerIcon", src: assetUrl("assets/icons/power.svg"), alt: "" })]
        ),
      ]),
      h("div", { class: "silroom-railHoverLabel", ariaHidden: "true" }),
    ]);
  };

  const renderQuickFilter = (key, label) =>
    h(
      "button",
      {
        class: `silroom-filterButton${settings.quickFilter === key ? " is-selected" : ""}`,
        type: "button",
        dataAction: "quick-filter",
        dataFilter: key,
      },
      [label]
    );

  const renderRoomAvatar = (room) => {
    if (room.avatarSrc) {
      return h("img", { class: "silroom-roomAvatar", src: room.avatarSrc, alt: "" });
    }

    return h("span", { class: "silroom-roomAvatar silroom-roomAvatarFallback", text: room.name.slice(0, 1) || "?" });
  };

  const getRoomMetaText = (room, manual) => {
    const parts = [];

    if (room.type === "dm") {
      parts.push("DM");
    } else if (room.type === "self") {
      parts.push("マイチャット");
    } else if (room.workspace === "unclassified") {
      parts.push("未分類");
    } else if (room.workspace) {
      parts.push(room.workspace);
    }

    if (manual) {
      parts.push("手動設定");
    }

    return parts.join(" / ");
  };

  const renderRoomRow = (room) => {
    const manual = settings.manualTypes?.[room.id] || "";
    const metaText = getRoomMetaText(room, manual);

    return h(
      "div",
      {
        class: `silroom-roomRow${room.active ? " is-active" : ""}${room.mentionCount ? " has-mention" : ""}${room.unreadCount ? " has-unread" : ""}`,
        role: "button",
        tabindex: "0",
        title: room.name,
        dataAction: "select-room",
        dataRoomId: room.id,
      },
      [
        renderRoomAvatar(room),
        h("div", { class: "silroom-roomMain" }, [
          h("div", { class: "silroom-roomTitleLine" }, [
            h("span", { class: "silroom-roomTitle", text: room.name }),
            room.pinned ? h("span", { class: "silroom-pin", title: "固定", text: "固定" }) : null,
          ]),
          h("div", { class: "silroom-roomMeta" }, [
            metaText ? h("span", { class: "silroom-roomMetaText", text: metaText }) : null,
          ]),
        ]),
        h("div", { class: "silroom-roomBadges" }, [
          room.mentionCount > 0 ? h("span", { class: "silroom-badge is-mention", text: room.mentionCount }) : null,
          room.unreadCount > 0 ? h("span", { class: "silroom-badge is-unread", text: room.unreadCount }) : null,
          h(
            "button",
            {
              class: `silroom-dmToggle${room.type === "dm" ? " is-dm" : ""}`,
              type: "button",
              title: room.type === "dm" ? "通常チャット扱いにする" : "DM扱いにする",
              ariaLabel: room.type === "dm" ? "通常チャット扱いにする" : "DM扱いにする",
              dataAction: "toggle-dm-type",
              dataRoomId: room.id,
            },
            ["分類"]
          ),
        ]),
      ]
    );
  };

  const renderRoomRailItem = (room) =>
    h(
      "button",
      {
        class: `silroom-roomRailItem${room.active ? " is-active" : ""}${room.mentionCount ? " has-mention" : ""}${room.unreadCount ? " has-unread" : ""}`,
        type: "button",
        title: room.name,
        ariaLabel: room.name,
        dataAction: "select-room",
        dataRoomId: room.id,
      },
      [
        renderRoomAvatar(room),
        room.mentionCount > 0
          ? h("span", { class: "silroom-roomRailBadge is-mention", text: room.mentionCount > 99 ? "99+" : room.mentionCount })
          : null,
        room.mentionCount === 0 && room.unreadCount > 0
          ? h("span", { class: "silroom-roomRailBadge is-unread", text: room.unreadCount > 99 ? "99+" : room.unreadCount })
          : null,
      ]
    );

  const renderRoomRail = (visibleRooms, currentSpace) =>
    h("div", { class: "silroom-roomRail", ariaLabel: "SILroom compact room list" }, [
      h("div", { class: "silroom-roomRailHeader" }, [
        h(
          "button",
          {
            class: "silroom-iconButton silroom-panelExpandButton",
            type: "button",
            title: "チャット一覧を固定表示",
            ariaLabel: "チャット一覧を固定表示",
            dataAction: "toggle-panel-collapsed",
          },
          ["›"]
        ),
        currentSpace
          ? h("div", { class: "silroom-roomRailSpace", title: currentSpace.label, ariaHidden: "true" }, [
              renderSpaceIcon(currentSpace),
            ])
          : null,
      ]),
      h("div", { class: "silroom-roomRailList", role: "list" }, visibleRooms.map(renderRoomRailItem)),
    ]);

  const getEmptyCopy = (spaceKey, isPendingWorkspace) => {
    if (isPendingWorkspace) {
      return {
        title: "読み込み中です",
        body: "Chatwork側のカテゴリを読み直しています。",
      };
    }

    if (isAttentionSpace(spaceKey)) {
      return {
        title: "自分宛の未読はありません",
        body: "自分宛メッセージを読むと、この一覧とバッジから消えます。",
      };
    }

    return {
      title: "該当するチャットはありません",
      body: "別のスペースかフィルターを選ぶと表示されます。",
    };
  };

  const renderPanel = () => {
    const visibleRooms = getVisibleRooms();
    const currentSpace = getCurrentSpace();
    const isPendingWorkspace =
      pendingWorkspaceLoad.key === settings.selectedSpace && Date.now() - pendingWorkspaceLoad.startedAt < 2600;
    const showQuickFilter = usesQuickFilter(settings.selectedSpace);
    const emptyCopy = getEmptyCopy(settings.selectedSpace, isPendingWorkspace);
    const panelToggleTitle = settings.panelCollapsed ? "チャット一覧を固定表示" : "チャット一覧を細バー化";

    return h("section", { class: "silroom-panel", ariaLabel: "SILroom room list" }, [
      settings.panelCollapsed ? renderRoomRail(visibleRooms, currentSpace) : null,
      h("div", { class: "silroom-panelBody" }, [
        h("header", { class: "silroom-panelHeader" }, [
          currentSpace?.kind === "workspace" ? renderWorkspaceLogoButton(currentSpace) : null,
          h("div", { class: "silroom-panelTitleBlock" }, [
            h("h2", { class: "silroom-panelTitle", text: currentSpace?.label || "全体" }),
          ]),
          currentSpace?.kind === "workspace" && getWorkspaceIcon(currentSpace)
            ? h(
                "button",
                {
                  class: "silroom-iconButton silroom-logoResetButton",
                  type: "button",
                  title: `${currentSpace.label}のロゴを解除`,
                  ariaLabel: `${currentSpace.label}のロゴを解除`,
                  dataAction: "reset-workspace-logo",
                  dataWorkspace: currentSpace.label,
                },
                ["解除"]
              )
            : null,
          h(
            "button",
            {
              class: "silroom-iconButton silroom-panelCollapseButton",
              type: "button",
              title: panelToggleTitle,
              ariaLabel: panelToggleTitle,
              dataAction: "toggle-panel-collapsed",
            },
            [settings.panelCollapsed ? "›" : "‹"]
          ),
        ]),
        showQuickFilter
          ? h("div", { class: "silroom-filterBar" }, [
              renderQuickFilter("all", "すべて"),
              renderQuickFilter("mention", "自分宛"),
              renderQuickFilter("unread", "未読"),
              renderQuickFilter("fixed", "固定"),
            ])
          : null,
        h("div", { class: "silroom-roomList", role: "list" }, [
          ...visibleRooms.map(renderRoomRow),
          visibleRooms.length === 0
            ? h("div", { class: "silroom-empty" }, [
                h("div", { class: "silroom-emptyTitle", text: emptyCopy.title }),
                h("div", { class: "silroom-emptyBody", text: emptyCopy.body }),
              ])
            : null,
        ]),
        h("input", {
          class: "silroom-hiddenFile",
          type: "file",
          accept: "image/png,image/jpeg,image/webp",
          dataAction: "workspace-logo-file",
        }),
      ]),
    ]);
  };

  const renderOverviewTab = () =>
    h(
      "button",
      {
        id: "silroom-overview-tab",
        class: `silroom-overviewTab${settings.overviewCollapsed ? " is-collapsed" : ""}`,
        type: "button",
        title: settings.overviewCollapsed ? "概要欄を開く" : "概要欄を閉じる",
        ariaLabel: settings.overviewCollapsed ? "概要欄を開く" : "概要欄を閉じる",
        dataAction: "toggle-overview",
      },
      [
        h("span", { class: "silroom-overviewTabText", text: settings.overviewCollapsed ? "概要" : "閉" }),
      ]
    );

  const escapeSelector = (value) =>
    globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");

  const getListRenderKey = () => `${settings.selectedSpace}|${settings.quickFilter}|${settings.panelCollapsed}`;

  const captureRenderState = () => {
    const root = document.getElementById(APP.rootId);
    const active = document.activeElement;
    const actionNode = active && root?.contains(active) ? active.closest?.("[data-action]") : null;

    return {
      key: lastRenderedListKey,
      roomListScrollTop: root?.querySelector(".silroom-roomList")?.scrollTop || 0,
      roomRailScrollTop: root?.querySelector(".silroom-roomRailList")?.scrollTop || 0,
      focusSelector:
        actionNode && root.contains(actionNode)
          ? [
              actionNode.dataset.action ? `[data-action="${escapeSelector(actionNode.dataset.action)}"]` : "",
              actionNode.dataset.roomId ? `[data-room-id="${escapeSelector(actionNode.dataset.roomId)}"]` : "",
              actionNode.dataset.space ? `[data-space="${escapeSelector(actionNode.dataset.space)}"]` : "",
              actionNode.dataset.filter ? `[data-filter="${escapeSelector(actionNode.dataset.filter)}"]` : "",
            ].join("")
          : "",
    };
  };

  const restoreRenderState = (state, nextKey) => {
    if (!state || state.key !== nextKey) {
      return;
    }

    const root = getRoot();
    const roomList = root.querySelector(".silroom-roomList");
    const roomRailList = root.querySelector(".silroom-roomRailList");
    if (roomList) {
      roomList.scrollTop = state.roomListScrollTop;
    }
    if (roomRailList) {
      roomRailList.scrollTop = state.roomRailScrollTop;
    }
    if (state.focusSelector) {
      root.querySelector(state.focusSelector)?.focus?.({ preventScroll: true });
    }
  };

  const render = () => {
    if (!initialized || !isChatworkPage()) {
      return;
    }

    applyStateClasses();
    rooms = extractRooms();
    spaces = buildSpaces();

    if (!spaces.some((space) => space.key === settings.selectedSpace)) {
      settings.selectedSpace = "all";
    }

    updateSpaceRoomCache();

    const nextListKey = getListRenderKey();
    const renderState = captureRenderState();
    const root = getRoot();
    root.replaceChildren(
      h("div", { id: APP.shellId, class: settings.enabled ? "" : "is-paused", dataVersion: APP.version }, [
        renderRail(),
        renderPanel(),
        settings.panelCollapsed
          ? null
          : h("div", {
              class: "silroom-panelResizer",
              title: "チャット一覧の幅を変更",
              dataAction: "resize-panel",
            }),
      ]),
      renderOverviewTab()
    );
    restoreRenderState(renderState, nextListKey);
    lastRenderedListKey = nextListKey;
  };

  const selectRoom = (roomId) => {
    const nativeRow = document.getElementById(roomId);

    if (nativeRow) {
      nativeRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return;
    }

    location.hash = `#!rid${roomId}`;
  };

  const findNativeCategoryButton = (workspaceLabel) => {
    const listArea = document.querySelector(SELECTORS.roomListArea);
    if (!listArea || !workspaceLabel) {
      return null;
    }

    const buttons = Array.from(listArea.querySelectorAll('[role="button"]')).filter(isNativeCategoryButton);
    return (
      buttons.find(
        (node) =>
          cleanCategoryName(node.getAttribute("aria-label") || node.innerText || node.textContent) === workspaceLabel
      ) ||
      buttons.find((node) => {
        const name = cleanCategoryName(node.getAttribute("aria-label") || node.innerText || node.textContent);
        return name.includes(workspaceLabel) || workspaceLabel.includes(name);
      }) ||
      null
    );
  };

  const selectNativeWorkspace = (spaceKey) => {
    if (!spaceKey?.startsWith("workspace:")) {
      return false;
    }

    const workspaceLabel = spaceKey.replace("workspace:", "");
    const nativeButton = findNativeCategoryButton(workspaceLabel);
    if (!nativeButton) {
      return false;
    }

    nativeButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  };

  const hasFreshWorkspaceState = (spaceKey) => {
    if (!isWorkspaceSpace(spaceKey)) {
      return false;
    }

    const workspaceLabel = spaceKey.replace("workspace:", "");
    const entry = workspaceState.workspaceRooms?.[workspaceLabel];
    return Boolean(entry?.roomIds?.length && Date.now() - toNumber(entry.updatedAt) < WORKSPACE_SYNC_STALE_MS);
  };

  const syncNativeWorkspaceIfNeeded = (spaceKey, force = false) => {
    if (!isWorkspaceSpace(spaceKey)) {
      pendingWorkspaceLoad = { key: "", startedAt: 0 };
      return false;
    }

    if (!force && hasFreshWorkspaceState(spaceKey)) {
      pendingWorkspaceLoad = { key: "", startedAt: 0 };
      return false;
    }

    const selected = selectNativeWorkspace(spaceKey);
    if (selected) {
      scheduleWorkspaceReadback(spaceKey);
    }

    return selected;
  };

  const scheduleWorkspaceSettledRender = (spaceKey, delay = 220) => {
    clearTimeout(workspaceSettleTimer);
    workspaceSettleTimer = window.setTimeout(() => {
      if (settings.selectedSpace !== spaceKey) {
        return;
      }

      render();
    }, delay);
  };

  const scheduleWorkspaceReadback = (spaceKey) => {
    if (!isWorkspaceSpace(spaceKey)) {
      pendingWorkspaceLoad = { key: "", startedAt: 0 };
      return;
    }

    pendingWorkspaceLoad = { key: spaceKey, startedAt: Date.now() };
    scheduleWorkspaceSettledRender(spaceKey, 260);
    window.setTimeout(() => {
      if (settings.selectedSpace !== spaceKey) {
        return;
      }

      pendingWorkspaceLoad = { key: "", startedAt: 0 };
      render();
    }, 3200);
  };

  const toggleManualType = async (roomId) => {
    const target = rooms.find((room) => room.id === roomId);
    const manualTypes = { ...(settings.manualTypes || {}) };

    if (!target) {
      return;
    }

    if (target.type === "dm") {
      manualTypes[roomId] = "room";
    } else {
      manualTypes[roomId] = "dm";
    }

    await storage.set({ manualTypes });
    render();
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });

  const resizeLogoFile = async (file) => {
    const dataUrl = await readFileAsDataUrl(file);

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => {
        const scale = Math.min(1, LOGO_SIZE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
        const width = Math.max(1, Math.round((image.naturalWidth || LOGO_SIZE) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || LOGO_SIZE) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("ロゴ画像を処理できませんでした"));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      });
      image.addEventListener("error", () => reject(new Error("ロゴ画像を読み込めませんでした")));
      image.src = dataUrl;
    });
  };

  const uploadWorkspaceLogo = (workspaceLabel) => {
    const input = getRoot().querySelector('[data-action="workspace-logo-file"]');
    if (!input) {
      return;
    }

    input.dataset.workspace = workspaceLabel;
    input.value = "";
    input.click();
  };

  const setWorkspaceLogo = async (workspaceLabel, dataUrl) => {
    const workspaceIcons = { ...(settings.workspaceIcons || {}) };
    workspaceIcons[workspaceLabel] = dataUrl;
    await storage.set({ workspaceIcons });
    render();
  };

  const resetWorkspaceLogo = async (workspaceLabel) => {
    const workspaceIcons = { ...(settings.workspaceIcons || {}) };
    delete workspaceIcons[workspaceLabel];
    await storage.set({ workspaceIcons });
    render();
  };

  const handleClick = async (event) => {
    const actionNode = event.target.closest("[data-action]");

    if (!actionNode || !getRoot().contains(actionNode)) {
      return;
    }

    const { action } = actionNode.dataset;

    if (action === "select-space" && Date.now() < suppressRailClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (action === "select-space") {
      const nextSpace = actionNode.dataset.space;
      await storage.set({ selectedSpace: nextSpace, quickFilter: "all" });
      syncNativeWorkspaceIfNeeded(nextSpace);
      render();
      debounceRender(350);
      return;
    }

    if (action === "quick-filter") {
      await storage.set({ quickFilter: actionNode.dataset.filter });
      render();
      return;
    }

    if (action === "toggle-overview") {
      await storage.set({ overviewCollapsed: !settings.overviewCollapsed });
      render();
      return;
    }

    if (action === "toggle-panel-collapsed") {
      await storage.set({ panelCollapsed: !settings.panelCollapsed });
      render();
      return;
    }

    if (action === "toggle-enabled") {
      await storage.set({ enabled: !settings.enabled });
      render();
      return;
    }

    if (action === "toggle-dm-type") {
      event.stopPropagation();
      await toggleManualType(actionNode.dataset.roomId);
      return;
    }

    if (action === "upload-workspace-logo") {
      uploadWorkspaceLogo(actionNode.dataset.workspace);
      return;
    }

    if (action === "reset-workspace-logo") {
      await resetWorkspaceLogo(actionNode.dataset.workspace);
      return;
    }

    if (action === "select-room") {
      selectRoom(actionNode.dataset.roomId);
    }
  };

  const showRailHoverLabel = (railItem) => {
    const rail = getRoot().querySelector(".silroom-rail");
    const label = getRoot().querySelector(".silroom-railHoverLabel");
    if (!rail || !label) {
      return;
    }

    const text = railItem.getAttribute("aria-label") || railItem.getAttribute("title") || "";
    if (!text) {
      label.classList.remove("is-visible");
      return;
    }

    const itemRect = railItem.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    label.textContent = text;
    label.style.setProperty("--silroom-hover-label-top", `${itemRect.top - railRect.top + itemRect.height / 2}px`);
    label.classList.add("is-visible");
  };

  const hideRailHoverLabel = () => {
    getRoot().querySelector(".silroom-railHoverLabel")?.classList.remove("is-visible");
  };

  const handleRailLabelEvent = (event) => {
    const railItem = event.target.closest?.(".silroom-railItem");
    if (!railItem || !getRoot().contains(railItem)) {
      return;
    }

    if (event.type === "mouseover" || event.type === "focusin") {
      showRailHoverLabel(railItem);
      return;
    }

    if (event.type === "mouseout" || event.type === "focusout") {
      if (!railItem.contains(event.relatedTarget)) {
        hideRailHoverLabel();
      }
    }
  };

  const getWorkspaceRailItem = (target) => {
    const railItem = target.closest?.(".silroom-railItem[data-workspace]");
    return railItem && getRoot().contains(railItem) ? railItem : null;
  };

  const getWorkspaceDropZone = (target) => {
    const dropZone = target.closest?.(".silroom-workspaceDropZone[data-drop-position]");
    return dropZone && getRoot().contains(dropZone) ? dropZone : null;
  };

  const clearRailDropIndicators = () => {
    getRoot()
      .querySelectorAll(".silroom-railItem.is-drop-before, .silroom-railItem.is-drop-after, .silroom-workspaceDropZone.is-active")
      .forEach((node) => {
        node.classList.remove("is-drop-before", "is-drop-after", "is-active");
      });
  };

  const clearRailDragState = () => {
    clearRailDropIndicators();
    getRoot().querySelectorAll(".silroom-railItem.is-dragging").forEach((node) => {
      node.classList.remove("is-dragging");
    });
  };

  const getCurrentWorkspaceOrder = () => spaces.filter((space) => space.kind === "workspace").map((space) => space.label);

  const reorderWorkspace = async (sourceLabel, targetLabel, insertAfter) => {
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) {
      return;
    }

    const currentOrder = getCurrentWorkspaceOrder();
    const withoutSource = currentOrder.filter((label) => label !== sourceLabel);
    const targetIndex = withoutSource.indexOf(targetLabel);
    if (targetIndex < 0) {
      return;
    }

    withoutSource.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceLabel);
    await storage.set({ workspaceOrder: withoutSource });
  };

  const moveWorkspaceToEdge = async (sourceLabel, position) => {
    if (!sourceLabel) {
      return;
    }

    const withoutSource = getCurrentWorkspaceOrder().filter((label) => label !== sourceLabel);
    if (position === "top") {
      withoutSource.unshift(sourceLabel);
    } else {
      withoutSource.push(sourceLabel);
    }
    await storage.set({ workspaceOrder: withoutSource });
  };

  const handleRailDragStart = (event) => {
    const railItem = getWorkspaceRailItem(event.target);
    if (!railItem) {
      return;
    }

    draggingWorkspaceLabel = railItem.dataset.workspace || "";
    hideRailHoverLabel();
    railItem.classList.add("is-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggingWorkspaceLabel);
    }
  };

  const handleRailDragOver = (event) => {
    const dropZone = getWorkspaceDropZone(event.target);
    if (dropZone && draggingWorkspaceLabel) {
      event.preventDefault();
      clearRailDropIndicators();
      dropZone.classList.add("is-active");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      return;
    }

    const railItem = getWorkspaceRailItem(event.target);
    if (!railItem || !draggingWorkspaceLabel || railItem.dataset.workspace === draggingWorkspaceLabel) {
      return;
    }

    event.preventDefault();
    clearRailDropIndicators();

    const rect = railItem.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    railItem.classList.add(insertAfter ? "is-drop-after" : "is-drop-before");

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleRailDrop = async (event) => {
    const dropZone = getWorkspaceDropZone(event.target);
    if (dropZone) {
      event.preventDefault();
      event.stopPropagation();
      const sourceLabel = event.dataTransfer?.getData("text/plain") || draggingWorkspaceLabel;
      const position = dropZone.dataset.dropPosition || "bottom";
      clearRailDragState();
      draggingWorkspaceLabel = "";
      suppressRailClickUntil = Date.now() + 350;
      await moveWorkspaceToEdge(sourceLabel, position);
      render();
      return;
    }

    const railItem = getWorkspaceRailItem(event.target);
    if (!railItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sourceLabel = event.dataTransfer?.getData("text/plain") || draggingWorkspaceLabel;
    const targetLabel = railItem.dataset.workspace || "";
    const rect = railItem.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;

    clearRailDragState();
    draggingWorkspaceLabel = "";
    suppressRailClickUntil = Date.now() + 350;
    await reorderWorkspace(sourceLabel, targetLabel, insertAfter);
    render();
  };

  const handleRailDragEnd = () => {
    clearRailDragState();
    draggingWorkspaceLabel = "";
    suppressRailClickUntil = Date.now() + 250;
  };

  const handlePanelResizeMove = (event) => {
    if (!panelResizeState) {
      return;
    }

    const nextWidth = clamp(
      panelResizeState.startWidth + event.clientX - panelResizeState.startX,
      PANEL_WIDTH.min,
      PANEL_WIDTH.max
    );
    settings.panelWidth = nextWidth;
    applyStateClasses();
  };

  const handlePanelResizeEnd = async () => {
    if (!panelResizeState) {
      return;
    }

    document.removeEventListener("mousemove", handlePanelResizeMove);
    document.removeEventListener("mouseup", handlePanelResizeEnd);
    panelResizeState = null;

    await storage.set({ panelWidth: getPanelWidthValue(), panelCollapsed: false });
    render();
  };

  const handleMouseDown = (event) => {
    const actionNode = event.target.closest("[data-action]");

    if (!actionNode || !getRoot().contains(actionNode)) {
      return;
    }

    if (actionNode.dataset.action !== "resize-panel") {
      return;
    }

    event.preventDefault();
    hideRailHoverLabel();
    panelResizeState = {
      startX: event.clientX,
      startWidth: getPanelWidthValue(),
    };
    document.addEventListener("mousemove", handlePanelResizeMove);
    document.addEventListener("mouseup", handlePanelResizeEnd);
  };

  const handleChange = async (event) => {
    if (!event.target.matches('[data-action="workspace-logo-file"]')) {
      return;
    }

    const [file] = Array.from(event.target.files || []);
    const workspaceLabel = event.target.dataset.workspace;

    if (!file || !workspaceLabel) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return;
    }

    const dataUrl = await resizeLogoFile(file);
    await setWorkspaceLogo(workspaceLabel, dataUrl);
  };

  const handleKeydown = (event) => {
    const row = event.target.closest('[data-action="select-room"]');
    if (!row) {
      return;
    }

    const actionTarget = event.target.closest?.("[data-action]");
    if (actionTarget && actionTarget !== row) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRoom(row.dataset.roomId);
    }
  };

  const setupObserver = () => {
    observer?.disconnect();

    observer = new MutationObserver((records) => {
      const root = document.getElementById(APP.rootId);
      const onlySilroomChanged =
        root &&
        records.every((record) => {
          const target = record.target;
          return target === root || root.contains(target);
        });

      if (onlySilroomChanged) {
        return;
      }

      if (pendingWorkspaceLoad.key === settings.selectedSpace) {
        scheduleWorkspaceSettledRender(settings.selectedSpace);
        return;
      }

      debounceRender();
    });
    observedRoomListArea = document.querySelector(SELECTORS.roomListArea);
    observedSubContent = document.querySelector(SELECTORS.subContent);
    const targets = [
      observedRoomListArea,
      observedSubContent,
    ].filter(Boolean);

    (targets.length ? targets : [document.body]).forEach((target) => {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "aria-label", "aria-selected", "style"],
      });
    });
  };

  const setupStructureObserver = () => {
    structureObserver?.disconnect();

    if (!document.body) {
      return;
    }

    structureObserver = new MutationObserver(() => {
      const nextRoomListArea = document.querySelector(SELECTORS.roomListArea);
      const nextSubContent = document.querySelector(SELECTORS.subContent);

      if (nextRoomListArea === observedRoomListArea && nextSubContent === observedSubContent) {
        return;
      }

      clearTimeout(observerReconnectTimer);
      observerReconnectTimer = window.setTimeout(() => {
        setupObserver();
        debounceRender(80);
      }, 80);
    });

    structureObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };

  const waitForChatwork = async () => {
    for (let count = 0; count < 80; count += 1) {
      if (document.querySelector(SELECTORS.roomListArea) && document.querySelector(SELECTORS.mainContent)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  };

  const init = async () => {
    if (initialized || !isChatworkPage()) {
      return;
    }

    const ready = await waitForChatwork();
    if (!ready) {
      return;
    }

    settings = await storage.get();
    initialized = true;

    getRoot().addEventListener("click", handleClick);
    getRoot().addEventListener("mousedown", handleMouseDown);
    getRoot().addEventListener("change", handleChange);
    getRoot().addEventListener("keydown", handleKeydown);
    getRoot().addEventListener("mouseover", handleRailLabelEvent);
    getRoot().addEventListener("mouseout", handleRailLabelEvent);
    getRoot().addEventListener("focusin", handleRailLabelEvent);
    getRoot().addEventListener("focusout", handleRailLabelEvent);
    getRoot().addEventListener("dragstart", handleRailDragStart);
    getRoot().addEventListener("dragover", handleRailDragOver);
    getRoot().addEventListener("drop", handleRailDrop);
    getRoot().addEventListener("dragend", handleRailDragEnd);
    getRoot().addEventListener("dragleave", (event) => {
      if (!getRoot().contains(event.relatedTarget)) {
        clearRailDropIndicators();
      }
    });
    window.addEventListener("hashchange", () => {
      debounceRender(20);
      scheduleInteractiveApiRefresh(250);
    });
    window.addEventListener("focus", () => scheduleInteractiveApiRefresh(250));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        scheduleInteractiveApiRefresh(250);
      }
    });

    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
          return;
        }

        let shouldRender = false;

        if (changes[APP.storageKey]) {
          const previousSettings = {
            ...DEFAULT_SETTINGS,
            ...stripPrivateSettings(changes[APP.storageKey].oldValue || {}),
          };
          const nextSettings = {
            ...DEFAULT_SETTINGS,
            ...stripPrivateSettings(changes[APP.storageKey].newValue || {}),
            workspaceIcons: settings.workspaceIcons || {},
          };
          const apiChanged =
            previousSettings.apiAssistEnabled !== nextSettings.apiAssistEnabled ||
            previousSettings.apiAssistVersion !== nextSettings.apiAssistVersion;

          settings = nextSettings;
          shouldRender = true;

          if (apiChanged) {
            scheduleApiRefresh(50, true);
          }
        }

        if (changes[APP.iconsKey]) {
          settings = { ...settings, workspaceIcons: changes[APP.iconsKey].newValue || {} };
          shouldRender = true;
        }

        if (shouldRender) {
          render();
        }
      });
    }

    setupObserver();
    setupStructureObserver();
    render();
    syncNativeWorkspaceIfNeeded(settings.selectedSpace);
    scheduleApiRefresh(50, true);
    window.setInterval(() => scheduleApiRefresh(), 120000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
