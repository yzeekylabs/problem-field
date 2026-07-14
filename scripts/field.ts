#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { getActiveDecisionFrame, operationSetSchema, type Workspace } from "../src/shared/workspace.ts";
import { readWorkspace, writeOperations } from "../server/store.ts";

function printHelp() {
  console.log(`Problem Field CLI

Usage:
  npm run field -- context [request-id]
  npm run field -- requests
  npm run field -- snapshot
  npm run field -- apply <file|->
`);
}

function formatContext(workspace: Workspace, requestId?: string) {
  const decisionFrame = getActiveDecisionFrame(workspace);
  const lines = [
    `# ${workspace.project.name}`,
    "",
    `Revision: ${workspace.revision}`,
    `Status: ${workspace.project.status}`,
    `Active loop stage: ${workspace.project.activeStage}`,
    `Guiding question: ${workspace.project.question}`,
    ...(workspace.project.display
      ? [`Visual heading: ${workspace.project.display.title} — ${workspace.project.display.summary}`]
      : []),
    "",
    "## Human-owned decision frame",
    ...(decisionFrame
      ? [
          `Version: ${decisionFrame.version}`,
          `Decision: ${decisionFrame.decision}`,
          `Working hypothesis: ${decisionFrame.hypothesis}`,
          ...decisionFrame.criteria.map((criterion) => `- [${criterion.id}] ${criterion.polarity.toUpperCase()} IF — ${criterion.statement}`),
        ]
      : ["- Not set. The agent may critique a draft in its response, but only the user can agree this frame."]),
    "",
    "## Sources",
  ];

  for (const source of workspace.sources) {
    const extraction = source.extraction ? ` | extraction=${source.extraction.status}` : "";
    const asset = source.asset ? ` | asset=data/local/assets/${source.asset.fileName}` : "";
    const external = source.externalRef
      ? ` | connector=${source.externalRef.connectorId} | resource=${source.externalRef.resourceId} | retrieved=${source.externalRef.retrievedAt}`
      : "";
    const quality = source.researchQuality
      ? ` | human-context=transcript:${source.researchQuality.transcriptFidelity ?? "unassessed"},session:${source.researchQuality.sessionEvidence ?? "unassessed"}${source.researchQuality.note ? `,note:${source.researchQuality.note.replaceAll("\n", " ")}` : ""}`
      : "";
    lines.push(`- [${source.id}] ${source.title} (${source.kind})${source.origin ? ` — ${source.origin}` : ""}${extraction}${asset}${external}${quality}`);
  }

  lines.push("", "## Cards");
  for (const card of workspace.cards) {
    const source = card.sourceRef
      ? ` | source=${card.sourceRef.sourceId}${card.sourceRef.locator ? ` @ ${card.sourceRef.locator}` : ""}`
      : "";
    lines.push(
      `- [${card.id}] ${card.kind.toUpperCase()} — ${card.title} | position=(${card.position.x}, ${card.position.y}) | by=${card.createdBy}${source}`,
    );
    if (card.body) lines.push(`  ${card.body.replaceAll("\n", " ")}`);
    if (card.display) lines.push(`  Visual copy: ${card.display.title} — ${card.display.summary}`);
    if (card.sourceRef?.quote) lines.push(`  Exact quote: “${card.sourceRef.quote.replaceAll("\n", " ")}”`);
  }

  lines.push("", "## Connections");
  for (const connection of workspace.connections) {
    lines.push(
      `- ${connection.from} --${connection.kind}${connection.label ? `:${connection.label}` : ""}--> ${connection.to}`,
    );
  }

  lines.push("", "## Human-accepted decision evidence links");
  if (workspace.criterionLinks.length === 0) lines.push("- None");
  for (const link of workspace.criterionLinks) {
    lines.push(`- card=${link.cardId} --${link.stance}--> criterion=${link.criterionId}`);
  }

  const activeRequests = workspace.agentRequests.filter((request) => request.status === "queued" || request.status === "running");
  lines.push("", "## Active agent requests");
  if (activeRequests.length === 0) lines.push("- None");
  for (const request of activeRequests) {
    lines.push(
      `- [${request.id}] status=${request.status}${request.provider ? ` provider=${request.provider}` : ""} | ${request.prompt}${request.scopeCardIds.length ? ` | scope=${request.scopeCardIds.join(",")}` : " | scope=whole field"}`,
    );
  }

  const pendingProposals = workspace.agentProposals.filter((proposal) => proposal.status === "pending");
  lines.push("", "## Pending agent proposals");
  if (pendingProposals.length === 0) lines.push("- None");
  for (const proposal of pendingProposals) {
    lines.push(
      `- [${proposal.id}] ${proposal.kind.toUpperCase()} — ${proposal.title} | scope=${proposal.scopeCardIds.join(",")}`,
    );
    lines.push(`  ${proposal.rationale.replaceAll("\n", " ")}`);
  }

  if (requestId) {
    const request = workspace.agentRequests.find((item) => item.id === requestId);
    if (!request) throw new Error(`Agent request '${requestId}' does not exist.`);
    lines.push("", "## Active request", request.prompt);
  }

  lines.push(
    "",
    "## Write protocol",
    `Create an operation set with baseRevision ${workspace.revision}, then apply it through the CLI. Never edit workspace JSON directly. Use addAgentProposal for new interpretations. Keep full content intact; add display copy (title <= 60 characters, summary <= 120 characters) for concise visual surfaces. The agent may inspect and critique the decision frame, source research context, and accepted criterion links, but must never write setDecisionFrame, setSourceResearchQuality, or setCriterionLinksForCard operations.`,
  );

  return lines.join("\n");
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const [, , command, argument] = process.argv;
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "snapshot") {
    console.log(JSON.stringify(await readWorkspace(), null, 2));
    return;
  }

  if (command === "context") {
    console.log(formatContext(await readWorkspace(), argument));
    return;
  }

  if (command === "requests") {
    const workspace = await readWorkspace();
    console.log(
      JSON.stringify(
        { revision: workspace.revision, requests: workspace.agentRequests.filter((item) => item.status === "queued" || item.status === "running") },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "apply") {
    if (!argument) throw new Error("apply requires a JSON file path or '-' for stdin.");
    const contents = argument === "-" ? await readStdin() : await readFile(argument, "utf8");
    const input = operationSetSchema.parse(JSON.parse(contents));
    const workspace = await writeOperations(input);
    console.log(`Applied ${input.operations.length} operation(s). Workspace revision is now ${workspace.revision}.`);
    return;
  }

  throw new Error(`Unknown command '${command}'. Run 'npm run field -- help'.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
