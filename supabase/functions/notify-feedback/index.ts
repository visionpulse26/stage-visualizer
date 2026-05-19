import { createClient } from "npm:@supabase/supabase-js@2";

type FeedbackRecord = {
  id?: string;
  project_id?: string;
  presentation_version_id?: string | null;
  slide_id?: string | null;
  clip_id?: string | null;
  reviewer_name?: string | null;
  comment?: string | null;
  status?: string | null;
  clip_time_seconds?: number | null;
  camera_snapshot_json?: Record<string, unknown> | null;
  annotation_json?: Record<string, unknown> | null;
  created_at?: string | null;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: FeedbackRecord;
  old_record?: FeedbackRecord;
};

type NotificationContext = {
  projectName: string | null;
  clipTitle: string | null;
};

type PresentationSlide = {
  id?: string | null;
  clipId?: string | null;
  title?: string | null;
};

type DiscordField = {
  name: string;
  value: string;
  inline: boolean;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const DISCORD_FIELD_LIMIT = 1024;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const configuredSecret = Deno.env.get("FEEDBACK_WEBHOOK_SECRET") ?? "";
  if (!configuredSecret) {
    return json({ error: "Missing FEEDBACK_WEBHOOK_SECRET secret" }, 500);
  }

  const requestSecret = req.headers.get("x-feedback-secret") ?? "";
  if (requestSecret !== configuredSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const discordWebhookUrl = Deno.env.get("DISCORD_FEEDBACK_WEBHOOK_URL") ?? "";
  if (!discordWebhookUrl) {
    return json({ error: "Missing DISCORD_FEEDBACK_WEBHOOK_URL secret" }, 500);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const record = payload.record;
  if (!record?.project_id) {
    return json({ error: "Missing feedback record/project_id" }, 400);
  }

  const context = await loadNotificationContext(record);
  const discordPayload = buildDiscordPayload(record, context);
  const discordResponse = await fetch(discordWebhookUrl, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(discordPayload),
  });

  if (!discordResponse.ok) {
    const body = await discordResponse.text();
    console.error("Discord feedback notification failed", {
      status: discordResponse.status,
      body,
      feedbackId: record.id,
      projectId: record.project_id,
    });
    return json({ error: "Discord notification failed" }, 502);
  }

  return json({ ok: true });
});

function buildDiscordPayload(record: FeedbackRecord, context: NotificationContext) {
  const adminBaseUrl = trimTrailingSlash(Deno.env.get("ADMIN_BASE_URL") ?? "");
  const projectLabel = context.projectName || record.project_id || "Unknown project";
  const reviewer = clean(record.reviewer_name) || "Anonymous reviewer";
  const comment = clean(record.comment) || "(No comment)";
  const clipTitle = context.clipTitle;
  const snapshotUrl = getSnapshotUrl(record.annotation_json);
  const adminUrl = adminBaseUrl && record.project_id
    ? `${adminBaseUrl}/admin/${encodeURIComponent(record.project_id)}/feedback`
    : "";

  const fields: DiscordField[] = [
    { name: "Project", value: truncate(projectLabel, DISCORD_FIELD_LIMIT), inline: true },
    ...(clipTitle ? [{ name: "Clip", value: truncate(clipTitle, DISCORD_FIELD_LIMIT), inline: true }] : []),
    { name: "Reviewer", value: truncate(reviewer, DISCORD_FIELD_LIMIT), inline: true },
    { name: "Time", value: formatClipTime(record.clip_time_seconds), inline: true },
  ];

  if (adminUrl) {
    fields.push({ name: "Review", value: `[Open admin feedback queue](${adminUrl})`, inline: false });
  }

  const embed: Record<string, unknown> = {
    title: truncate(comment, 256),
    color: 0xf59e0b,
    fields,
    timestamp: record.created_at || new Date().toISOString(),
  };

  if (snapshotUrl) {
    embed.image = { url: snapshotUrl };
  }

  return {
    username: "Stage Visualizer",
    content: `New feedback from ${reviewer} on ${projectLabel}`,
    embeds: [embed],
  };
}

async function loadNotificationContext(record: FeedbackRecord): Promise<NotificationContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !record.project_id) {
    return { projectName: null, clipTitle: null };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const [{ data: project, error: projectError }, { data: version, error: versionError }] = await Promise.all([
    supabase
      .from("projects")
      .select("name")
      .eq("id", record.project_id)
      .maybeSingle(),
    record.presentation_version_id
      ? supabase
        .from("presentation_versions")
        .select("snapshot_json")
        .eq("id", record.presentation_version_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (projectError) {
    console.warn("Could not load project for feedback notification", {
      message: projectError.message,
      projectId: record.project_id,
    });
  }

  if (versionError) {
    console.warn("Could not load presentation version for feedback notification", {
      message: versionError.message,
      versionId: record.presentation_version_id,
    });
  }

  return {
    projectName: typeof project?.name === "string" ? project.name : null,
    clipTitle: getClipTitle(version?.snapshot_json, record),
  };
}

function getClipTitle(snapshot: unknown, record: FeedbackRecord) {
  if (!snapshot || typeof snapshot !== "object") return "";
  const slides = (snapshot as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return "";

  const slide = slides.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const item = candidate as PresentationSlide;
    return String(item.id ?? "") === String(record.slide_id ?? "")
      || String(item.clipId ?? "") === String(record.clip_id ?? "");
  }) as PresentationSlide | undefined;

  return clean(slide?.title) || clean(slide?.clipId);
}

function getSnapshotUrl(annotation: FeedbackRecord["annotation_json"]) {
  const snapshot = annotation?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return "";
  const url = (snapshot as Record<string, unknown>).url;
  return typeof url === "string" ? url : "";
}

function formatClipTime(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds)) return "-";
  const safeSeconds = Math.max(0, Math.floor(seconds as number));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}
