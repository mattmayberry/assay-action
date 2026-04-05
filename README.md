# Assay — AI Contribution Detection

Scores GitHub issues, pull requests, and comments for AI agent probability. Posts a finding comment and adds a label when a submission looks machine-generated.

Free for public repositories. No configuration required.

---

## What it does

When an issue, PR, or comment is opened, Assay scores the text across 13 signals — linguistic patterns, temporal behavior, identity fingerprinting, and structural templates. If the score clears a threshold, it posts a comment and adds a label so your team can make an informed decision.

Scores below the threshold pass silently. Assay never blocks submissions or closes issues automatically.

**Score tiers:**

| Score | Label | Action |
|-------|-------|--------|
| 0–39 | — | Passes silently |
| 40–60 | `possibly-ai-generated` | Comment + label |
| 61–100 | `ai-generated` | Comment + label |

---

## Quickstart

Add this file to your repo at `.github/workflows/assay.yml`:

```yaml
name: Assay
on:
  issues:
    types: [opened, edited]
  pull_request:
    types: [opened, edited]
  issue_comment:
    types: [created]

jobs:
  score:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - uses: mattmayberry/assay-action@v1
```

That's it. No API keys. No signup required for public repositories.

---

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `threshold` | Score (0–100) above which Assay flags a submission | `60` |
| `post-comment` | Post a comment on flagged submissions | `true` |
| `add-label` | Add a label to flagged submissions | `true` |
| `github-token` | Token for posting comments and labels | `${{ github.token }}` |
| `api-url` | API base URL (override only if self-hosting) | `https://assay.themeridianlab.com` |

### Raise the threshold

If you want Assay to comment only on high-confidence detections:

```yaml
- uses: mattmayberry/assay-action@v1
  with:
    threshold: '80'
```

### Labels only, no comments

```yaml
- uses: mattmayberry/assay-action@v1
  with:
    post-comment: 'false'
```

### Use the score in a downstream step

```yaml
- uses: mattmayberry/assay-action@v1
  id: assay

- name: Close high-confidence agent issues
  if: ${{ fromJson(steps.assay.outputs.score) >= 90 }}
  run: gh issue close ${{ github.event.issue.number }} --comment "Closed by Assay."
  env:
    GH_TOKEN: ${{ github.token }}
```

---

## Outputs

| Output | Description |
|--------|-------------|
| `score` | AI agent probability score, 0–100 |
| `tier` | `human`, `uncertain`, or `agent` |
| `signals` | JSON array of signal IDs that fired |

---

## How the scoring works

Assay uses a tiered signal architecture designed to keep false positives rare:

**Tier 1 — Zero false positive.** Any single signal firing produces a score of 90+. Examples: unfilled template tokens (`{{first_name}}`), honeypot probe responses, agent metadata in headers.

**Tier 2 — Low false positive.** Requires two or more signals before raising the score above 40. Examples: machine-consistent submission timing, ghost sender identity patterns, superhuman response speed.

**Tier 3 — Medium false positive.** Score boosters only — never sufficient to flag a submission on their own. Examples: LLM vocabulary patterns, sentence length uniformity, AI opener formula.

A submission with perfect AI vocabulary but no Tier 1 or Tier 2 signals will score at most in the 40–60 range — flagged as "uncertain," not "agent."

Full signal reference: [assay.themeridianlab.com/how-it-works](https://assay.themeridianlab.com/how-it-works)

---

## Privacy

Assay processes the text of submissions to compute a score. Submission text is not stored after scoring. Author usernames are not retained. No submission data is used for model training or shared with third parties.

[Full privacy policy](https://assay.themeridianlab.com/privacy)

---

## False positives

Scores are probabilistic, not definitive. A high score means the submission has characteristics consistent with AI-generated content — it does not prove machine authorship.

If Assay incorrectly flags a human contributor, remove the label manually. To report a false positive: [support@themeridianlab.com](mailto:support@themeridianlab.com)

---

## Also available as a GitHub App

If you prefer a zero-configuration install with no workflow file required, [install the Assay GitHub App](https://github.com/apps/assay-by-the-meridian-lab). It scores every new issue, PR, and comment automatically.

---

A [Meridian Lab](https://themeridianlab.com) product.
