# QA Notes

## Static Checks

Passed:

- `node --check src/content/main.js`
- `node --check popup.js`
- `tests/verify-static.mjs`

## Fixture Check

Fixture:

`tests/fixtures/chatwork-like.html`

Verified behavior:

- SILroom shell appears on a Chatwork-like page
- Left space rail appears
- Brand `S` mark is removed
- Basic spaces use SVG icon image elements
- Workspace selection shows a clickable workspace logo frame
- Hidden logo file input is present
- My Chat space can be selected
- DM space can be selected
- Overview drawer opens and closes
- Search field is removed
- DM marker is rendered as small metadata text under the room name
- Rail width stays fixed and labels are horizontal absolute overlays
- Workspace logo is changed by clicking the logo frame, not a text `ロゴ` button
- Optional API assist files are registered and syntax-check clean

Screenshots:

- `tests/silroom-fixture.png`
- `tests/silroom-icons-fixture.png`

Latest manual preview:

- `検索` input count: 0
- `ON` text count: 0
- old DM/type pill count: 0
- マイチャット space: 1 room in fixture
- rail width: 58px
- rail label position: absolute
- rail label writing mode: horizontal
- サンプルB workspace: 2 rooms in fixture

## Live Chatwork Check

Verified on:

`https://www.chatwork.com/`

Observed before the latest icon pass:

- `#silroom-root`: present
- `#silroom-shell`: present
- SILroom enabled class: present
- Room rows extracted: 84
- Overview collapsed state hides `#_subContent`
- Overview open state shows `#_subContent`
- Chat area width:
  - closed: 1176px
  - open: 876px

## Safety

- Message input was not filled
- Send button was not clicked
- Task creation was not touched
- Invite/settings actions were not touched

## Known Limits

- Chatwork does not expose a clean DM room type in the observed list DOM
- DM detection is heuristic and should stay manually overridable
- Mention badge precision depends on what Chatwork exposes in the list DOM
- Chrome requires extension reload after local file edits
