export type ConnectorId = "linear" | "notion" | "figma" | "granola" | "posthog";

export type ConnectorDefinition = {
  id: ConnectorId;
  name: string;
  description: string;
  content: string;
  domain: string;
  endpoint: string;
};

export const connectorCatalog: ConnectorDefinition[] = [
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, initiatives, and customer requests.",
    content: "Plans and product decisions",
    domain: "linear.app",
    endpoint: "https://mcp.linear.app/mcp",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Research notes, wikis, project pages, and databases.",
    content: "Notes and team knowledge",
    domain: "notion.so",
    endpoint: "https://mcp.notion.com/mcp",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Design context, frames, prototypes, and annotations.",
    content: "Design evidence",
    domain: "figma.com",
    endpoint: "https://mcp.figma.com/mcp",
  },
  {
    id: "granola",
    name: "Granola",
    description: "Meeting notes, transcripts, attendees, and follow-ups.",
    content: "Conversations and calls",
    domain: "granola.ai",
    endpoint: "https://mcp.granola.ai/mcp",
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Analytics, funnels, experiments, surveys, and product usage.",
    content: "Product behavior and signal",
    domain: "posthog.com",
    endpoint: "https://mcp.posthog.com/mcp?readonly=true",
  },
];

export function getConnectorDefinition(id: string) {
  return connectorCatalog.find((connector) => connector.id === id);
}
