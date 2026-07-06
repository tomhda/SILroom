(() => {
  "use strict";

  const STORAGE_KEY = "silroomSettings";
  const SECRETS_KEY = "silroomSecrets";
  const DEFAULT_SETTINGS = {
    apiAssistEnabled: false,
  };
  const DEFAULT_SECRETS = {
    apiToken: "",
  };

  const API_BASE = "https://api.chatwork.com/v2";

  const stripPrivateSettings = (value = {}) => {
    const next = { ...value };
    delete next.apiToken;
    delete next.workspaceIcons;
    return next;
  };

  const getApiState = () =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [STORAGE_KEY]: {}, [SECRETS_KEY]: DEFAULT_SECRETS }, (result) => {
        const rawSettings = result[STORAGE_KEY] || {};
        const settings = { ...DEFAULT_SETTINGS, ...stripPrivateSettings(rawSettings) };
        const secrets = { ...DEFAULT_SECRETS, ...(result[SECRETS_KEY] || {}) };

        if (rawSettings.apiToken && !secrets.apiToken) {
          secrets.apiToken = rawSettings.apiToken;
          chrome.storage.local.set({
            [STORAGE_KEY]: stripPrivateSettings(rawSettings),
            [SECRETS_KEY]: secrets,
          });
        }

        resolve({ settings, secrets });
      });
    });

  const apiGet = async (path, token) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-chatworktoken": token,
      },
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = Array.isArray(body?.errors) ? body.errors.join(" / ") : response.statusText;
      throw new Error(message || `Chatwork API error ${response.status}`);
    }

    return body;
  };

  const normalizeRooms = (rooms) =>
    Array.isArray(rooms)
      ? rooms.map((room) => ({
          room_id: room.room_id,
          name: room.name || "",
          type: room.type || "",
          sticky: Boolean(room.sticky),
          unread_num: Number(room.unread_num || 0),
          mention_num: Number(room.mention_num || 0),
          mytask_num: Number(room.mytask_num || 0),
          icon_path: room.icon_path || "",
          last_update_time: Number(room.last_update_time || 0),
        }))
      : [];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.source !== "silroom") {
      return false;
    }

    if (message.type === "api:getRooms") {
      getApiState()
        .then(async ({ settings, secrets }) => {
          if (!settings.apiAssistEnabled || !secrets.apiToken) {
            return { ok: true, enabled: false, rooms: [] };
          }

          const rooms = await apiGet("/rooms", secrets.apiToken);
          return { ok: true, enabled: true, rooms: normalizeRooms(rooms), fetchedAt: Date.now() };
        })
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ ok: false, enabled: true, error: error.message || "Chatwork API error" });
        });

      return true;
    }

    if (message.type === "api:test") {
      getApiState()
        .then(async ({ secrets }) => {
          if (!secrets.apiToken) {
            return { ok: false, error: "APIトークンが未入力です" };
          }

          const me = await apiGet("/me", secrets.apiToken);
          return { ok: true, accountName: me?.name || "" };
        })
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ ok: false, error: error.message || "Chatwork API error" });
        });

      return true;
    }

    return false;
  });
})();
