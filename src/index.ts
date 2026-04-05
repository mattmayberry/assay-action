// ============================================================
// Assay GitHub Action
// Scores issues, PRs, and comments for AI agent probability
// ============================================================

import * as core from "@actions/core";
import * as github from "@actions/github";

interface AssaySignal {
  signalId: string;
  fired: boolean;
  confidence: number;
}

interface AssayResponse {
  score: number;
  tier: "human" | "uncertain" | "agent";
  signals: AssaySignal[];
}

const TIER_LABELS: Record<string, string> = {
  uncertain: "possibly-ai-generated",
  agent: "ai-generated",
};

const SCORE_COMMENT_HEADER = "<!-- assay-finding -->";

async function run(): Promise<void> {
  const apiUrl = core.getInput("api-url");
  const threshold = parseInt(core.getInput("threshold"), 10);
  const postComment = core.getInput("post-comment") !== "false";
  const addLabel = core.getInput("add-label") !== "false";
  const token = core.getInput("github-token");

  const ctx = github.context;
  const octokit = github.getOctokit(token);

  // Extract submission text from the event payload
  const { body, submissionType, number } = extractSubmission(ctx);

  if (!body) {
    core.info("No submission text found in this event — skipping.");
    return;
  }

  if (body.length < 20) {
    core.info("Submission too short to score reliably — skipping.");
    return;
  }

  core.info(`Scoring ${submissionType} #${number} (${body.length} chars)…`);

  // Call Assay API
  let result: AssayResponse;
  try {
    const res = await fetch(`${apiUrl}/api/sdk/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: body,
        source: "github-action",
        repo: `${ctx.repo.owner}/${ctx.repo.repo}`,
      }),
    });

    if (!res.ok) {
      core.warning(`Assay API returned ${res.status} — skipping this submission.`);
      return;
    }

    result = (await res.json()) as AssayResponse;
  } catch (err) {
    core.warning(`Assay API request failed: ${err}. Skipping.`);
    return;
  }

  const { score, tier, signals } = result;
  const firedSignals = signals.filter((s) => s.fired).map((s) => s.signalId);

  core.setOutput("score", String(score));
  core.setOutput("tier", tier);
  core.setOutput("signals", JSON.stringify(firedSignals));

  core.info(`Score: ${score}/100 — tier: ${tier} — signals: ${firedSignals.join(", ") || "none"}`);

  if (score < threshold) {
    core.info(`Score ${score} is below threshold ${threshold} — no action taken.`);
    return;
  }

  const isCertain = tier === "agent";
  const labelName = isCertain ? "ai-generated" : "possibly-ai-generated";
  const finding = isCertain ? "Likely AI-generated" : "Possibly AI-generated";
  const { owner, repo } = ctx.repo;

  // Add label
  if (addLabel && number) {
    const labelColor = isCertain ? "C34F2A" : "D68B38";
    await ensureLabel(octokit, owner, repo, labelName, labelColor);
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: number,
        labels: [labelName],
      });
      core.info(`Added label "${labelName}"`);
    } catch (err) {
      core.warning(`Could not add label: ${err}`);
    }
  }

  // Post comment
  if (postComment && number) {
    const signalList = firedSignals.length > 0
      ? firedSignals.map((id) => `- \`${id}\``).join("\n")
      : "- No specific signals — score based on absence of human writing markers";

    const comment = `${SCORE_COMMENT_HEADER}
### Assay finding: ${finding}

**Score:** ${score}/100 &nbsp;|&nbsp; **Tier:** ${tier}

This ${submissionType} has characteristics consistent with AI-generated content. Assay uses a tiered signal engine — scores above 60 trigger this notice, scores above 80 indicate high confidence.

**Signals that fired:**
${signalList}

Scores are probabilistic, not definitive. A high score means the submission resembles AI-generated content — it does not prove machine authorship. Maintainers should use their own judgment.

<sub>[Assay](https://assay.themeridianlab.com) · [How it works](https://assay.themeridianlab.com/how-it-works) · [False positive?](mailto:support@themeridianlab.com)</sub>`;

    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: comment,
      });
      core.info("Posted finding comment.");
    } catch (err) {
      core.warning(`Could not post comment: ${err}`);
    }
  }
}

function extractSubmission(ctx: typeof github.context): {
  body: string;
  submissionType: string;
  number: number | null;
} {
  const { eventName, payload } = ctx;

  if (eventName === "issues") {
    return {
      body: payload.issue?.body ?? "",
      submissionType: "issue",
      number: payload.issue?.number ?? null,
    };
  }

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    return {
      body: payload.pull_request?.body ?? "",
      submissionType: "pull request",
      number: payload.pull_request?.number ?? null,
    };
  }

  if (eventName === "issue_comment") {
    // Skip Assay's own comments to avoid infinite loop
    const body: string = payload.comment?.body ?? "";
    if (body.includes(SCORE_COMMENT_HEADER)) {
      return { body: "", submissionType: "comment", number: null };
    }
    return {
      body,
      submissionType: "comment",
      number: payload.issue?.number ?? null,
    };
  }

  return { body: "", submissionType: "submission", number: null };
}

async function ensureLabel(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  name: string,
  color: string
): Promise<void> {
  try {
    await octokit.rest.issues.getLabel({ owner, repo, name });
  } catch {
    // Label doesn't exist — create it
    try {
      await octokit.rest.issues.createLabel({ owner, repo, name, color });
    } catch {
      // Already exists (race condition) or no permission — ignore
    }
  }
}

run().catch((err) => {
  core.setFailed(`Assay action failed: ${err.message}`);
});
