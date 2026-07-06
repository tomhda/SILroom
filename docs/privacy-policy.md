# SILroom Privacy Policy

Effective date: July 6, 2026

SILroom is a Chrome extension that improves the Chatwork room list by organizing rooms into spaces, separating 1:1 chats as DM-like rooms, prioritizing mentions and unread rooms, and allowing the Chatwork overview panel to be collapsed.

This Privacy Policy explains what information SILroom handles, how it is used, and how it is stored.

## Information SILroom Handles

SILroom may handle the following information to provide its room-list organization features.

### Chatwork Room Information

When used on `https://www.chatwork.com/`, SILroom reads information from the Chatwork page so it can reorganize the room list. This may include:

- room names
- room IDs
- room categories
- room icons or avatar image URLs
- unread counts
- mention counts
- pinned room state
- currently selected room state

This information is used only to display and organize the SILroom room list inside the user's browser.

### Optional Chatwork API Token

SILroom can optionally use a Chatwork API token supplied by the user. This feature is not required for basic use.

If the user saves an API token, SILroom stores it in Chrome local extension storage and uses it only to make read-only requests to the official Chatwork API. The token is used to improve the accuracy of:

- 1:1 chat detection
- unread counts
- mention counts
- pinned room state
- room update order
- room metadata that may not be visible in the current Chatwork page DOM

SILroom does not use the Chatwork API token to send messages, edit messages, delete messages, invite users, create tasks, or perform other write actions.

### SILroom Settings

SILroom stores user settings locally in Chrome extension storage. These settings may include:

- whether SILroom is enabled
- selected space
- room list width
- overview panel open or closed state
- workspace order
- workspace logo images selected by the user
- manual DM or normal-room classification overrides
- cached room-to-workspace mapping used to keep the UI stable

These settings are used only to preserve the user's SILroom experience.

## How Information Is Used

SILroom uses the information above only to provide its stated purpose: organizing the Chatwork room list and making room navigation easier.

SILroom does not use this information for advertising, analytics, profiling, creditworthiness, lending qualification, data brokerage, or any purpose unrelated to the extension's room-list organization features.

## Data Storage

SILroom stores settings and the optional Chatwork API token locally using Chrome extension storage on the user's device.

SILroom does not operate a developer server for collecting, storing, or processing user data.

## Data Sharing

SILroom does not sell, rent, or share user data with advertisers, analytics providers, data brokers, or other third parties.

If the user enables API Assist by saving a Chatwork API token, SILroom sends read-only requests directly from the extension to the official Chatwork API at `https://api.chatwork.com/`. These requests are used only to retrieve Chatwork room metadata needed for SILroom's user-facing features.

SILroom does not send Chatwork data or API tokens to any developer-operated server.

## Remote Code

SILroom does not load or execute remotely hosted code. All executable JavaScript is included in the Chrome extension package.

## User Control and Deletion

Users can remove SILroom's locally stored data by:

1. Opening the SILroom extension popup.
2. Deleting the saved Chatwork API token, if one has been saved.
3. Removing the SILroom extension from Chrome to delete its extension storage.

Users can also revoke or regenerate their Chatwork API token from their Chatwork account settings.

## Permissions

SILroom requests only the permissions needed for its stated purpose.

- `storage`: stores SILroom settings and the optional Chatwork API token in Chrome local extension storage.
- `https://www.chatwork.com/*`: allows SILroom to display its UI on Chatwork and read room-list information from the Chatwork page.
- `https://api.chatwork.com/*`: allows optional read-only Chatwork API requests when the user enables API Assist.

## Changes to This Policy

This Privacy Policy may be updated when SILroom's functionality changes. The effective date at the top of this document will be updated when material changes are made.

## Contact

For questions about this Privacy Policy, please open an issue in this GitHub repository:

https://github.com/tomhda/SILroom-privacy-policy/issues

