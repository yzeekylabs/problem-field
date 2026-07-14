export type ConnectorId = "linear" | "notion" | "figma" | "granola" | "slack" | "google-drive";

export type ConnectorDefinition = {
  id: ConnectorId;
  name: string;
  description: string;
  content: string;
  domain: string;
  endpoint?: string;
  availability: "featured" | "setup-required";
  constraint?: string;
};

export const connectorCatalog: ConnectorDefinition[] = [
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, initiatives, and customer requests.",
    content: "Plans and product decisions",
    domain: "linear.app",
    endpoint: "https://mcp.linear.app/mcp",
    availability: "featured",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Research notes, wikis, project pages, and databases.",
    content: "Notes and team knowledge",
    domain: "notion.so",
    endpoint: "https://mcp.notion.com/mcp",
    availability: "featured",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design context, frames, prototypes, and annotations.",
    content: "Design evidence",
    domain: "figma.com",
    endpoint: "https://mcp.figma.com/mcp",
    availability: "featured",
  },
  {
    id: "granola",
    name: "Granola",
    description: "Meeting notes, transcripts, attendees, and follow-ups.",
    content: "Conversations and calls",
    domain: "granola.ai",
    endpoint: "https://mcp.granola.ai/mcp",
    availability: "featured",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Threads, decisions, shared files, and recurring language.",
    content: "Team conversations",
    domain: "slack.com",
    availability: "setup-required",
    constraint: "Slack requires a registered Slack app for custom MCP clients, so it is not a safe one-click connection yet.",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Docs, interview notes, research folders, and shared files.",
    content: "Documents and folders",
    domain: "drive.google.com",
    availability: "setup-required",
    constraint: "Google's official Drive MCP is in developer preview and requires a Google OAuth client ID and secret.",
  },
];

export function getConnectorDefinition(id: string) {
  return connectorCatalog.find((connector) => connector.id === id);
}
