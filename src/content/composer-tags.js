(() => {
  "use strict";

  const STORAGE_KEY = "silroomSettings";
  const TOOLBAR_ID_CHAT = "silroom-composer-tags";
  const TOOLBAR_ID_OVERVIEW = "silroom-composer-tags-overview";
  // SILHack ships the same buttons; when it is active on this page, stay out of its way.
  const SILHACK_TOOLBAR_SELECTOR = ".silhack-chatwork-tags";
  const CHAT_EDITABLE_SELECTORS = ["textarea#_chatText", "textarea#_message", 'textarea[name="message"]'].join(",");
  const NATIVE_TOOLBAR_BUTTON_IDS = ["_emoticon", "_to", "_file", "_groupCall"];

  const TAGS = [
    { label: "Info", title: "[info] で囲む", prefix: "[info]\n", suffix: "\n[/info]" },
    { label: "Title", title: "[title] で囲む", prefix: "[title]", suffix: "[/title]", placeholder: "title" },
    {
      label: "Code",
      title: "[code] で囲む",
      prefix: "[code]\n",
      suffix: "\n[/code]",
      placeholder: "code",
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    },
    {
      label: "Hr",
      title: "[hr] 区切り線を入れる",
      prefix: "[hr]",
      suffix: "",
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="2" y1="12" x2="22" y2="12"/></svg>',
    },
  ];

  let enabled = !globalThis.chrome?.storage?.local;
  let currentEditable = null;
  let rafId = 0;

  const isEnabled = (storedSettings) => storedSettings?.composerTags !== false;

  const removeToolbars = () => {
    document.getElementById(TOOLBAR_ID_CHAT)?.remove();
    document.getElementById(TOOLBAR_ID_OVERVIEW)?.remove();
  };

  const setNativeTextAreaValue = (editable, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(editable, value);
      return;
    }
    editable.value = value;
  };

  const applyTag = (editable, tag) => {
    if (!editable || editable.tagName !== "TEXTAREA") {
      return;
    }

    const value = editable.value || "";
    const start = Number.isInteger(editable.selectionStart) ? editable.selectionStart : value.length;
    const end = Number.isInteger(editable.selectionEnd) ? editable.selectionEnd : value.length;
    const body = value.slice(start, end) || tag.placeholder || "";
    const insert = `${tag.prefix}${body}${tag.suffix}`;

    setNativeTextAreaValue(editable, value.slice(0, start) + insert + value.slice(end));
    const cursorStart = start + tag.prefix.length;
    editable.selectionStart = cursorStart;
    editable.selectionEnd = cursorStart + body.length;
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    editable.focus();
  };

  const buildToolbar = (id, getEditable) => {
    const toolbar = document.createElement("div");
    toolbar.id = id;
    toolbar.className = "silroom-composer-tags";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Chatwork記法");

    for (const tag of TAGS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "silroom-composer-tags__button";
      button.title = tag.title;
      button.setAttribute("aria-label", tag.title);
      if (tag.icon) {
        button.innerHTML = tag.icon;
      } else {
        button.textContent = tag.label;
      }
      button.addEventListener("click", () => applyTag(getEditable(), tag));
      toolbar.appendChild(button);
    }

    return toolbar;
  };

  const findToolbarContainer = (editable) => {
    for (const id of NATIVE_TOOLBAR_BUTTON_IDS) {
      const list = document.getElementById(id)?.closest("ul");
      if (list) {
        return list;
      }
    }
    return editable.closest("form") || editable.closest('[role="form"]') || editable.parentElement;
  };

  const attachChatToolbar = () => {
    const editable = document.querySelector(CHAT_EDITABLE_SELECTORS);
    if (!editable) {
      return;
    }
    currentEditable = editable;

    const container = findToolbarContainer(editable);
    if (!container) {
      return;
    }

    const toolbar =
      document.getElementById(TOOLBAR_ID_CHAT) ||
      buildToolbar(TOOLBAR_ID_CHAT, () => currentEditable || document.querySelector(CHAT_EDITABLE_SELECTORS));
    if (toolbar.parentElement !== container) {
      container.appendChild(toolbar);
    }
  };

  const findOverviewContext = () => {
    const roomInfoTextarea = document.querySelector("textarea#_roomInfoDescription");
    const roomInfoLabel = document.querySelector('label[for="_roomInfoDescription"]');
    if (roomInfoTextarea && roomInfoLabel) {
      return {
        textarea: roomInfoTextarea,
        container: roomInfoLabel.parentElement || roomInfoLabel,
        insertAfter: roomInfoLabel,
        marginLeft: "8px",
      };
    }

    const header = Array.from(document.querySelectorAll("h1")).find((h) => h.textContent.trim() === "概要の編集");
    const dialog = header?.closest("div[class]");
    const textarea = dialog?.parentElement?.querySelector("textarea");
    if (!textarea) {
      return null;
    }

    return {
      textarea,
      container: header.parentElement || dialog,
      insertAfter: header,
      marginLeft: "12px",
    };
  };

  const attachOverviewToolbar = () => {
    const context = findOverviewContext();
    if (!context) {
      return;
    }
    const { textarea, container, insertAfter, marginLeft } = context;

    let toolbar = document.getElementById(TOOLBAR_ID_OVERVIEW);
    if (!toolbar) {
      toolbar = buildToolbar(TOOLBAR_ID_OVERVIEW, () => toolbar._silroomTargetEditable);
    }
    toolbar._silroomTargetEditable = textarea;
    toolbar.style.marginLeft = marginLeft;

    if (insertAfter.parentElement === container) {
      if (insertAfter.nextSibling !== toolbar) {
        container.insertBefore(toolbar, insertAfter.nextSibling);
      }
      return;
    }

    if (toolbar.parentElement !== container) {
      container.appendChild(toolbar);
    }
  };

  const scheduleAttach = () => {
    if (rafId) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!enabled || document.querySelector(SILHACK_TOOLBAR_SELECTOR)) {
        removeToolbars();
        return;
      }
      attachChatToolbar();
      attachOverviewToolbar();
    });
  };

  const boot = () => {
    if (globalThis.chrome?.storage?.local) {
      chrome.storage.local.get({ [STORAGE_KEY]: {} }, (result) => {
        enabled = isEnabled(result[STORAGE_KEY]);
        scheduleAttach();
      });
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[STORAGE_KEY]) {
          return;
        }
        enabled = isEnabled(changes[STORAGE_KEY].newValue);
        scheduleAttach();
      });
    }

    new MutationObserver(scheduleAttach).observe(document.body, { childList: true, subtree: true });
    scheduleAttach();
  };

  boot();
})();
