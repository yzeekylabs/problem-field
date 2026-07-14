# Connector selection

The first connector library optimizes for a narrow promise: a normal user can add an official remote MCP endpoint to the selected coding-agent host and complete OAuth in a browser. The app does not ask for client IDs, secrets, workspace URLs, or copied tokens.

## Featured

- **Linear** — official remote endpoint `https://mcp.linear.app/mcp`, OAuth through the MCP client.
- **Notion** — official hosted endpoint `https://mcp.notion.com/mcp`, with no integration infrastructure required.
- **Granola** — official remote endpoint `https://mcp.granola.ai/mcp`, browser authentication.
- **Figma** — official remote endpoint `https://mcp.figma.com/mcp`. Figma limits the server to catalogued MCP clients, but its current setup guide explicitly supports Codex and documents the same `codex mcp add` route used here. This is different from becoming a verified partner connector inside Figma Make.

## Omitted for now

- **Slack** has an official remote MCP server, but a custom client must use a registered Slack app with a fixed client ID and secret. It is intentionally absent from the library rather than shown as an unavailable promise.
- **Google Drive / Docs** has an official Drive MCP server in developer preview. Current setup requires a Google OAuth client ID and secret, so it is also intentionally absent from the library.

## Runtime rule

The library reads the selected host's MCP inventory and authentication state. Codex exposes structured inventory through `codex mcp list --json`; Claude Code currently requires checking known catalog entries with `claude mcp get`. Already connected featured sources are collapsed into an “available to the agent” summary; the primary grid shows what is missing or still needs sign-in. A spawned `codex exec` or `claude -p` process inherits the selected host's MCP configuration and credentials, so the app does not keep a parallel auth registry.

Inventory is cheap and local. Content discovery is different: learning what a source contains requires MCP tool calls, network access, permissions, and source-specific search behavior. The app therefore does not crawl every connection when the modal opens. A user request launches a bounded agent pass, and only selected material enters the field as a provenance-stamped source snapshot.

Official references: [Linear MCP](https://linear.app/docs/mcp), [Notion MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp), [Granola MCP](https://help.granola.ai/article/granola-mcp), [Figma remote setup](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/), [Slack MCP](https://docs.slack.dev/ai/slack-mcp-server/), and [Google Workspace MCP configuration](https://developers.google.com/workspace/guides/configure-mcp-servers).
