(() => {
  "use strict";

  const STORAGE_KEY = "silroomSettings";
  const SECRETS_KEY = "silroomSecrets";
  const DEFAULT_MENTION_COLOR = "#19e58f";
  const DEFAULT_UNREAD_COLOR = "#7aa2ff";
  const DARK_BADGE_TEXT_COLOR = "#04111d";
  const LIGHT_BADGE_TEXT_COLOR = "#ffffff";
  const DEFAULT_SETTINGS = {
    enabled: true,
    selectedSpace: "all",
    quickFilter: "all",
    overviewCollapsed: true,
    panelCollapsed: false,
    panelWidth: 302,
    density: "comfortable",
    manualTypes: {},
    workspaceOrder: [],
    mentionColor: DEFAULT_MENTION_COLOR,
    unreadColor: DEFAULT_UNREAD_COLOR,
    apiAssistEnabled: false,
    apiAssistVersion: 0,
  };
  const DEFAULT_SECRETS = {
    apiToken: "",
  };

  const normalizeHexColor = (value, fallback) =>
    /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;

  const getRelativeLuminance = (hexColor) => {
    const channels = hexColor
      .slice(1)
      .match(/.{2}/g)
      .map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };

  const getBadgeTextColor = (backgroundColor) => {
    const backgroundLuminance = getRelativeLuminance(backgroundColor);
    const darkLuminance = getRelativeLuminance(DARK_BADGE_TEXT_COLOR);
    const lightContrast = 1.05 / (backgroundLuminance + 0.05);
    const darkContrast =
      (Math.max(backgroundLuminance, darkLuminance) + 0.05) /
      (Math.min(backgroundLuminance, darkLuminance) + 0.05);
    return lightContrast >= darkContrast ? LIGHT_BADGE_TEXT_COLOR : DARK_BADGE_TEXT_COLOR;
  };

  const stripPrivateSettings = (value = {}) => {
    const next = { ...value };
    delete next.apiToken;
    delete next.workspaceIcons;
    return next;
  };

  const getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...stripPrivateSettings(result[STORAGE_KEY] || {}) });
      });
    });

  const setSettings = (settings) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: stripPrivateSettings(settings) }, resolve);
    });

  const getSecrets = () =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [SECRETS_KEY]: DEFAULT_SECRETS, [STORAGE_KEY]: {} }, (result) => {
        const rawSettings = result[STORAGE_KEY] || {};
        const secrets = { ...DEFAULT_SECRETS, ...(result[SECRETS_KEY] || {}) };

        if (rawSettings.apiToken && !secrets.apiToken) {
          secrets.apiToken = rawSettings.apiToken;
          chrome.storage.local.set({
            [STORAGE_KEY]: stripPrivateSettings(rawSettings),
            [SECRETS_KEY]: secrets,
          });
        }

        resolve(secrets);
      });
    });

  const setSecrets = (secrets) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [SECRETS_KEY]: { ...DEFAULT_SECRETS, ...secrets } }, resolve);
    });

  const sendMessage = (message) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ source: "silroom", ...message }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "No response" });
      });
    });

  const bind = async () => {
    const extensionName = chrome.runtime.getManifest().name || "SILroom";
    document.title = extensionName;
    document.getElementById("extensionName").textContent = extensionName;

    let settings = await getSettings();
    let secrets = await getSecrets();
    const enabled = document.getElementById("enabled");
    const overviewCollapsed = document.getElementById("overviewCollapsed");
    const defaultSpace = document.getElementById("defaultSpace");
    const mentionColor = document.getElementById("mentionColor");
    const mentionColorValue = document.getElementById("mentionColorValue");
    const mentionColorPreview = document.getElementById("mentionColorPreview");
    const resetMentionColor = document.getElementById("resetMentionColor");
    const unreadColor = document.getElementById("unreadColor");
    const unreadColorValue = document.getElementById("unreadColorValue");
    const unreadColorPreview = document.getElementById("unreadColorPreview");
    const resetUnreadColor = document.getElementById("resetUnreadColor");
    const apiAssistEnabled = document.getElementById("apiAssistEnabled");
    const apiToken = document.getElementById("apiToken");
    const saveApi = document.getElementById("saveApi");
    const testApi = document.getElementById("testApi");
    const clearApi = document.getElementById("clearApi");
    const apiStatus = document.getElementById("apiStatus");

    enabled.checked = settings.enabled;
    overviewCollapsed.checked = settings.overviewCollapsed;
    defaultSpace.value = settings.selectedSpace;
    mentionColor.value = normalizeHexColor(settings.mentionColor, DEFAULT_MENTION_COLOR);
    unreadColor.value = normalizeHexColor(settings.unreadColor, DEFAULT_UNREAD_COLOR);
    apiAssistEnabled.checked = settings.apiAssistEnabled;
    apiToken.value = secrets.apiToken || "";
    apiStatus.textContent = secrets.apiToken ? "APIトークン保存済み" : "";

    const persist = async (patch) => {
      settings = { ...(await getSettings()), ...patch };
      await setSettings(settings);
    };

    const syncMentionColorPreview = () => {
      const color = normalizeHexColor(mentionColor.value, DEFAULT_MENTION_COLOR);
      mentionColorValue.textContent = color.toUpperCase();
      mentionColorPreview.style.backgroundColor = color;
      mentionColorPreview.style.color = getBadgeTextColor(color);
    };

    const syncUnreadColorPreview = () => {
      const color = normalizeHexColor(unreadColor.value, DEFAULT_UNREAD_COLOR);
      unreadColorValue.textContent = color.toUpperCase();
      unreadColorPreview.style.backgroundColor = color;
    };

    syncMentionColorPreview();
    syncUnreadColorPreview();

    const bumpApiAssistVersion = () => Date.now();

    enabled.addEventListener("change", () => persist({ enabled: enabled.checked }));
    overviewCollapsed.addEventListener("change", () => persist({ overviewCollapsed: overviewCollapsed.checked }));
    defaultSpace.addEventListener("change", () => persist({ selectedSpace: defaultSpace.value, quickFilter: "all" }));
    mentionColor.addEventListener("input", syncMentionColorPreview);
    mentionColor.addEventListener("change", () =>
      persist({ mentionColor: normalizeHexColor(mentionColor.value, DEFAULT_MENTION_COLOR) })
    );
    resetMentionColor.addEventListener("click", async () => {
      mentionColor.value = DEFAULT_MENTION_COLOR;
      syncMentionColorPreview();
      await persist({ mentionColor: DEFAULT_MENTION_COLOR });
    });
    unreadColor.addEventListener("input", () => {
      syncUnreadColorPreview();
    });
    unreadColor.addEventListener("change", () =>
      persist({ unreadColor: normalizeHexColor(unreadColor.value, DEFAULT_UNREAD_COLOR) })
    );
    resetUnreadColor.addEventListener("click", async () => {
      unreadColor.value = DEFAULT_UNREAD_COLOR;
      syncUnreadColorPreview();
      await persist({ unreadColor: DEFAULT_UNREAD_COLOR });
    });
    apiAssistEnabled.addEventListener("change", () => persist({ apiAssistEnabled: apiAssistEnabled.checked }));
    saveApi.addEventListener("click", async () => {
      const token = apiToken.value.trim();
      apiAssistEnabled.checked = Boolean(token);
      secrets = { apiToken: token };
      await setSecrets(secrets);
      await persist({ apiAssistEnabled: Boolean(token), apiAssistVersion: bumpApiAssistVersion() });
      apiStatus.textContent = token ? "API補助をONにしました" : "APIトークンが未入力です";
    });
    clearApi.addEventListener("click", async () => {
      apiToken.value = "";
      apiAssistEnabled.checked = false;
      secrets = { apiToken: "" };
      await setSecrets(secrets);
      await persist({ apiAssistEnabled: false, apiAssistVersion: bumpApiAssistVersion() });
      apiStatus.textContent = "APIトークンを削除しました";
    });
    testApi.addEventListener("click", async () => {
      const token = apiToken.value.trim();
      if (token) {
        apiAssistEnabled.checked = true;
      }
      secrets = { apiToken: token };
      await setSecrets(secrets);
      await persist({
        apiAssistEnabled: apiAssistEnabled.checked,
        apiAssistVersion: bumpApiAssistVersion(),
      });
      apiStatus.textContent = "接続確認中...";
      const result = await sendMessage({ type: "api:test" });
      apiStatus.textContent = result.ok
        ? `接続OK${result.accountName ? `: ${result.accountName}` : ""}`
        : `接続NG: ${result.error || "確認できませんでした"}`;
    });
    apiToken.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveApi.click();
      }
    });
  };

  bind();
})();
