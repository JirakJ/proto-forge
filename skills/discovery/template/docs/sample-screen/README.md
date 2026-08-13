---
id: sample-screen
kind: screen
status: open
gapsOpen: 2
gapsTotal: 3
sources:
  - type: figma
    fileKey: SAMPLEFILEKEY123
    nodeId: "1:2"
    fileVersion: "2000000000"
  - type: brief
    path: .inputs/brief.md
    sha256: d5809352fe7cbba41792440ca9809e9c1a8a7365fa0b8b09b4bc455aa56040a0
---

# sample-screen

This is the shipped sample document — the worked example of
`references/document-template.md`, kept so `discovery:lint` can verify the template
against itself. The intake step (D0) deletes it before a real run writes anything.

## Situation

The brief states "a list screen where users add items" and the pinned Figma frame
(node 1:2, file version 2000000000) shows a list region with an add action and an
empty-state variant. That is the whole evidence base: one sentence and one frame —
everything below is either established by it, or a gap with a default.

## Problem

Neither source shows what the list does when loading fails, and the brief does not
say whether adding an item needs confirmation or produces an immediately editable
row. Two of the three questions the walk raised are open.

## Implication

Gap 2 leaves the failure path undefined — built as-is, a failed load would render a
blank region and the first person to see it would be a customer. Gap 3 leaves the
add interaction ambiguous — two developers would build two different screens, and
one of them would be rework.

## Need-payoff

Answering the two open gaps makes the screen buildable without a single guess: the
customer gets the list they sketched, a failure state they chose, and an add
interaction that was decided once, on the record, instead of twice in code review.

## DAPA

### Definition

A single-list screen: items render in a list region, a primary action adds an item,
and an empty variant shows before the first item exists — exactly what the pinned
frame draws and the brief's one sentence states.

### Acceptance criteria

The list renders items and its designed empty variant; the add action creates an
item; every gap row below carries an answer (sign-off happens by filling the Answer
column, D9).

### Prerequisites

A source of items to render — a domain entity and a persistence intent — which this
sample deliberately leaves to the brief that replaces it.

### Assumptions

Until the Answer column overrides them, the open defaults stand: a failed load shows
an inline error with a retry action (Gap 2), and adding an item creates it
immediately with an undo affordance, without a confirmation dialog (Gap 3).

## Elements

| Element | Testid | Figma node | Image | Notes |
| --- | --- | --- | --- | --- |
| Item list | sample-screen-item-list | 1:5 | ![Item list](images/sample-list.png) | The primary content region. |
| Add button | sample-screen-add-button | 1:6 | — <!-- no-image: the button is visible inside the item-list capture above --> | The primary action the empty state also names. |
| Empty state | sample-screen-empty-state | 1:7 | — <!-- no-image: the empty variant is not exported in the sample capture --> | Shown before the first item exists. |

## Gap table

| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Q2 | sample-screen-empty-state | What does the screen show when the list has no items? | The frame contains a designed empty variant naming the add action (node 1:7). | Ship the empty variant as designed. | The designed empty variant ships, copy from the catalogue. | answered |
| 2 | Q1 | sample-screen-item-list | What does the list show when loading fails, and what can the user do next? | Neither the brief nor the frame shows any failure state. | Inline error state with a retry action; never a blank region. | | open |
| 3 | Q6 | sample-screen-add-button | Does adding an item require confirmation, or is the item created immediately? | The brief says "users add items" without stating the interaction. | Create immediately with an undo affordance; no dialog for a non-destructive action. | | open |
