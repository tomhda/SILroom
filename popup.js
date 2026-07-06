(() => {
  "use strict";

  const STORAGE_KEY = "silroomSettings";
  const SECRETS_KEY = "silroomSecrets";
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
    apiAssistEnabled: false,
    apiAssistVersion: 0,
  };
  const DEFAULT_SECRETS = {
    apiToken: "",
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
    let settings = await getSettings();
    let secrets = await getSecrets();
    const enabled = document.getElementById("enabled");
    const overviewCollapsed = document.getElementById("overviewCollapsed");
    const defaultSpace = document.getElementById("defaultSpace");
    const apiAssistEnabled = document.getElementById("apiAssistEnabled");
    const apiToken = document.getElementById("apiToken");
    const saveApi = document.getElementById("saveApi");
    const testApi = document.getElementById("testApi");
    const clearApi = document.getElementById("clearApi");
    const apiStatus = document.getElementById("apiStatus");

    enabled.checked = settings.enabled;
    overviewCollapsed.checked = settings.overviewCollapsed;
    defaultSpace.value = settings.selectedSpace;
    apiAssistEnabled.checked = settings.apiAssistEnabled;
    apiToken.value = secrets.apiToken || "";
    apiStatus.textContent = secrets.apiToken ? "APIトークン保存済み" : "";

    const persist = async (patch) => {
      settings = { ...(await getSettings()), ...patch };
      await setSettings(settings);
    };

    const bumpApiAssistVersion = () => Date.now();

    enabled.addEventListener("change", () => persist({ enabled: enabled.checked }));
    overviewCollapsed.addEventListener("change", () => persist({ overviewCollapsed: overviewCollapsed.checked }));
    defaultSpace.addEventListener("change", () => persist({ selectedSpace: defaultSpace.value, quickFilter: "all" }));
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
