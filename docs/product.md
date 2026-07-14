# Product thesis

## The job

Help someone turn a messy body of calls, transcripts, notes, screenshots, and recordings into a legible problem field without flattening the evidence or outsourcing judgment to an AI summary.

## The loop

1. Bring in source material.
2. Pull out exact evidence with provenance.
3. Place evidence spatially and add human observations.
4. Ask the field a question in context.
5. Let an agent propose patterns, contradictions, gaps, or better arrangements.
6. Accept, change, or reject those proposals on the same surface.

## The important distinction

- **Evidence** is something present in a source.
- **Observation** is a human or agent interpretation of evidence.
- **Pattern** is an interpretation that relates multiple observations or evidence points.
- **Question** marks uncertainty or a gap.

The product should never silently promote one layer into another. That boundary protects fidelity and makes AI output inspectable.

## First-session test

The prototype succeeds if a user can spend 20 minutes with a small set of real material and say:

> I can see the shape of the problem more clearly, I know what supports that shape, and I know what I am still uncertain about.

## Explicit non-goals for v0.1

- A feature-complete FigJam or Miro replacement.
- Fully automatic research synthesis.
- A team knowledge base.
- Hosted collaboration or permissions.
- Model-provider abstraction inside the app.

The CLI boundary keeps model choice outside the data model. Codex and Claude Code can both operate on the same validated protocol without the workspace depending on either provider.
