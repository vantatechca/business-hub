import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/tasks/seed
 *
 * Bulk-insert a large list of tasks with recurrence, goals, and notes.
 * Manager+ only. Resolves assignee names to user IDs.
 */

type TaskSeed = {
  title: string;
  recurrence: "daily" | "weekly" | "one-time";
  status: "todo" | "in-progress";
  assignees?: string[]; // names to resolve
  goal?: number;
  done?: number;
  priority: "high" | "medium" | "low";
  notes?: string;
};

const TASKS: TaskSeed[] = [
  { title: "Posts indexed by Google within 7 days", recurrence: "weekly", status: "todo", priority: "medium", notes: "Track %" },
  { title: "Duplicate content across stores", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "Posts published without SEO review", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "Posts with correct target keyword", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 100%" },
  { title: "Posts with SEO score 70+", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 90%+" },
  { title: "Avg word count per post", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 600–1,000 words" },
  { title: "Stores with 0 posts (backlog)", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 0 — must catch up" },
  { title: "Writer output per person", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 20 posts/day each" },
  { title: "Posts published today", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 171" },
  { title: "Posts written today", recurrence: "daily", status: "todo", priority: "medium", notes: "Goal: 171" },
  { title: "Team Lead", recurrence: "one-time", status: "todo", priority: "medium", notes: "Tracks daily count, quality checks" },
  { title: "Publisher", recurrence: "one-time", status: "todo", priority: "medium", notes: "Schedules/publishes to correct stores" },
  { title: "SEO Reviewer", recurrence: "one-time", status: "todo", priority: "medium", notes: "Reviews all posts before publish" },
  { title: "Blog Writers (AI-assisted)", recurrence: "one-time", status: "todo", priority: "medium", notes: "20 posts each/day" },
  { title: "Avg star rating across listings", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 4.5★+" },
  { title: "Total active profiles in pool", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 1,200–1,500 minimum" },
  { title: "Profile pool health (active vs flagged)", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 90%+ active" },
  { title: "Warmed profiles used today", recurrence: "one-time", status: "todo", priority: "medium", notes: "Track — never reuse too fast" },
  { title: "Reviews posted today", recurrence: "one-time", status: "todo", priority: "medium", notes: "X per day from pool" },
  { title: "Listings suspended", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0 — flag immediately" },
  { title: "Listings verified/active", recurrence: "one-time", status: "todo", priority: "medium", notes: "Track %" },
  { title: "Duplicate addresses used", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "All addresses approved type", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% luxury/new industrial" },
  { title: "GMB listings created today", recurrence: "one-time", status: "todo", priority: "medium", notes: "Match QA-passed stores" },
  { title: "Review Posters", recurrence: "one-time", status: "todo", priority: "medium", notes: "Post reviews using warmed profiles — track usage to avoid over-use" },
  { title: "Reviews Team Lead", recurrence: "one-time", status: "todo", priority: "medium", notes: "Manages the pool of 1,200–1,500 warmed Google profiles" },
  { title: "Address Researcher", recurrence: "one-time", status: "todo", priority: "medium", notes: "Maintains approved address list — luxury highrises + new industrial parks" },
  { title: "GMB Creator", recurrence: "one-time", status: "todo", priority: "medium", notes: "Creates GMB listings, assigns approved addresses, links to stores" },
  { title: "Same issue escalated 3+ times", recurrence: "one-time", status: "todo", priority: "medium", notes: "Training gap — create script" },
  { title: "Refund requests", recurrence: "one-time", status: "todo", priority: "medium", notes: "Under 3%" },
  { title: "Customer satisfaction score", recurrence: "one-time", status: "todo", priority: "medium", notes: "4.5★+" },
  { title: "Tickets escalated", recurrence: "one-time", status: "todo", priority: "medium", notes: "Logged with reason" },
  { title: "Chats resolved same session", recurrence: "one-time", status: "todo", priority: "medium", notes: "80%+" },
  { title: "Total chats handled today", recurrence: "daily", status: "todo", priority: "medium", notes: "Count tracked" },
  { title: "Unanswered chats at shift handover", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "Any response over 15 minutes", recurrence: "one-time", status: "todo", priority: "medium", notes: "Unacceptable — immediate escalation" },
  { title: "Any response over 5 minutes", recurrence: "one-time", status: "todo", priority: "medium", notes: "Flag + log reason + who was on shift" },
  { title: "Avg first response time", recurrence: "one-time", status: "todo", priority: "medium", notes: "Under 2 minutes" },
  { title: "Backup", recurrence: "one-time", status: "todo", priority: "medium", notes: "—" },
  { title: "Night", recurrence: "one-time", status: "todo", priority: "medium", notes: "10:00 PM – 6:00 AM" },
  { title: "Afternoon", recurrence: "one-time", status: "todo", priority: "medium", notes: "2:00 PM – 10:00 PM" },
  { title: "Morning", recurrence: "one-time", status: "todo", priority: "medium", notes: "6:00 AM – 2:00 PM" },
  { title: "Total ad spend today (all accounts)", recurrence: "one-time", status: "todo", priority: "medium", notes: "Logged" },
  { title: "Same credit card on 2+ stores", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0 — never" },
  { title: "ROAS per campaign (after day 3)", recurrence: "daily", status: "todo", priority: "medium", notes: "Tracked" },
  { title: "Budget raised without approval", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0 — never" },
  { title: "Accounts suspended by Google", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "Accounts flagged for manual review", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0" },
  { title: "Campaign QA passed before live", recurrence: "one-time", status: "todo", priority: "medium", notes: "100%" },
  { title: "Campaigns targeting US or Canada", recurrence: "one-time", status: "todo", priority: "medium", notes: "100%" },
  { title: "Unique credit card per campaign", recurrence: "one-time", status: "todo", priority: "medium", notes: "100%" },
  { title: "All campaigns on $10–15/day budget", recurrence: "one-time", status: "todo", priority: "medium", notes: "100%" },
  { title: "Google Ads campaigns created today", recurrence: "one-time", status: "todo", priority: "medium", notes: "Must = GMC approvals" },
  { title: "GMC approvals today (from GMC team)", recurrence: "daily", status: "todo", priority: "medium", notes: "Tracked" },
  { title: "Campaign QA", recurrence: "one-time", status: "todo", priority: "medium", notes: "Verifies settings (budget, targeting, type) before campaign goes live" },
  { title: "Credit Card Handler", recurrence: "one-time", status: "todo", priority: "medium", notes: "Assigns unique virtual card per store — tracks which card is on which account" },
  { title: "Google Ads Manager", recurrence: "one-time", status: "todo", priority: "medium", notes: "Creates campaigns same day as GMC approval, monitors performance, manages budgets" },
  { title: "Cost per submission", recurrence: "one-time", status: "todo", priority: "medium", notes: "Tracked" },
  { title: "Rejection rate above 30%", recurrence: "one-time", status: "todo", priority: "medium", notes: "Trigger feed template audit" },
  { title: "Rejection reason logged", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% of rejections" },
  { title: "Approved → Google Ads NOT created yet", recurrence: "one-time", status: "todo", priority: "medium", notes: "Goal: 0 — act same day" },
  { title: "Accounts pending over 5 days", recurrence: "one-time", status: "todo", priority: "medium", notes: "Flag for review / resubmit" },
  { title: "Avg days from submission to approval", recurrence: "one-time", status: "todo", priority: "medium", notes: "Track & minimize" },
  { title: "Overall approval rate (%)", recurrence: "one-time", status: "todo", priority: "medium", notes: "70%+ target" },
  { title: "Accounts rejected today", recurrence: "one-time", status: "todo", priority: "medium", notes: "Track count + log reason" },
  { title: "Accounts pending review", recurrence: "one-time", status: "todo", priority: "medium", notes: "Track count + days pending" },
  { title: "Accounts approved today", recurrence: "daily", status: "todo", priority: "medium", notes: "Track count" },
  { title: "Feeds submitted today", recurrence: "daily", status: "todo", priority: "medium", notes: "100% of feeds created" },
  { title: "Custom feeds created today", recurrence: "daily", status: "todo", priority: "medium", notes: "Match stores ready" },
  { title: "Stores ready for GMC submission", recurrence: "daily", status: "todo", priority: "medium", notes: "QA-passed stores yesterday" },
  { title: "Submission Specialist", recurrence: "one-time", status: "todo", priority: "medium", notes: "Submits feeds, monitors approval status, flags rejections" },
  { title: "Feed Creator", recurrence: "one-time", status: "todo", priority: "medium", notes: "Builds custom product feed per store as soon as QA is passed" },
  { title: "GMC Team Lead", recurrence: "one-time", status: "todo", priority: "medium", notes: "Tracks all submissions, approvals, pending statuses daily — reports to management" },
  { title: "Revenue split % per processor", recurrence: "one-time", status: "todo", priority: "medium", notes: "Logged daily" },
  { title: "New accounts needed today", recurrence: "one-time", status: "todo", priority: "medium", notes: "Calculated from volume" },
  { title: "Stripe accounts active", recurrence: "one-time", status: "todo", priority: "medium", notes: "Count tracked" },
  { title: "Shopify accounts active", recurrence: "one-time", status: "todo", priority: "medium", notes: "Count tracked" },
  { title: "Daily capacity ceiling", recurrence: "one-time", status: "todo", priority: "medium", notes: "Calculated & visible" },
  { title: "% volume through OnRamp/E-Transfer", recurrence: "one-time", status: "todo", priority: "medium", notes: "Warning if >15%" },
  { title: "Frozen / flagged accounts", recurrence: "one-time", status: "todo", priority: "medium", notes: "—" },
  { title: "Failed transactions", recurrence: "daily", status: "todo", priority: "medium", notes: "Under 2%" },
  { title: "Total daily revenue", recurrence: "daily", status: "todo", priority: "medium", notes: "All processors combined" },
  { title: "E-Transfer revenue", recurrence: "one-time", status: "todo", priority: "medium", notes: "$X tracked" },
  { title: "OnRamp revenue", recurrence: "one-time", status: "todo", priority: "medium", notes: "$X tracked" },
  { title: "Stripe revenue", recurrence: "daily", status: "todo", priority: "medium", notes: "$X tracked per account" },
  { title: "Shopify Payments revenue", recurrence: "daily", status: "todo", priority: "medium", notes: "$X tracked per account" },
  { title: "Reconciliation Person", recurrence: "one-time", status: "todo", priority: "medium", notes: "Matches daily revenue to each processor, logs in tracker" },
  { title: "Account Creator", recurrence: "one-time", status: "todo", priority: "medium", notes: "Creates new Shopify/Stripe accounts when capacity warnings hit" },
  { title: "Payment Router Manager", recurrence: "one-time", status: "todo", priority: "medium", notes: "Monitors all processors daily, flags issues, reports to lead" },
  { title: "Google-readiness check", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% pass before marking done" },
  { title: "Log in master tracker", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% with URL + date" },
  { title: "Confirm store is published", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% live (no password)" },
  { title: "Flag failing stores", recurrence: "one-time", status: "todo", priority: "medium", notes: "Sent back same day" },
  { title: "QA all stores vs checklist", recurrence: "one-time", status: "todo", priority: "medium", notes: "20 stores/day reviewed" },
  { title: "Verify checkout flow", recurrence: "one-time", status: "todo", priority: "medium", notes: "Test order per store" },
  { title: "Connect payment processor", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% connected + tested" },
  { title: "Contact page with Gmail", recurrence: "one-time", status: "todo", priority: "medium", notes: "100% of stores" },
  { title: "Shipping Policy", recurrence: "daily", status: "todo", priority: "medium", notes: "100% of stores" },
  { title: "Terms of Service", recurrence: "daily", status: "todo", priority: "medium", notes: "100% of stores" },
  { title: "Refund / Return Policy", recurrence: "daily", status: "todo", priority: "medium", notes: "100% of stores" },
  { title: "Privacy Policy", recurrence: "daily", status: "todo", priority: "medium", notes: "100% of stores" },
  { title: "NO duplicate banners", recurrence: "daily", status: "todo", priority: "medium", notes: "0 duplicates across stores" },
  { title: "Verify mobile display", recurrence: "daily", status: "todo", priority: "medium", notes: "100% mobile-checked" },
  { title: "Add hero text + CTA", recurrence: "daily", status: "todo", priority: "medium", notes: "All banners have CTA" },
  { title: "Upload + assign in theme", recurrence: "daily", status: "todo", priority: "medium", notes: "100% live on homepage" },
  { title: "Create unique homepage banner", recurrence: "daily", status: "todo", priority: "medium", notes: "20 unique banners/day" },
  { title: "Add product descriptions", recurrence: "daily", status: "todo", priority: "medium", notes: "100% have description" },
  { title: "Organize into collections", recurrence: "daily", status: "todo", priority: "medium", notes: "Per template structure" },
  { title: "Set pricing", recurrence: "daily", status: "todo", priority: "medium", notes: "100% per pricing sheet" },
  { title: "Add optimized images", recurrence: "daily", status: "todo", priority: "medium", notes: "Under 1MB, correct ratio" },
  { title: "Clean product titles", recurrence: "daily", status: "todo", priority: "medium", notes: "0 broken/missing" },
  { title: "Import products per store", recurrence: "daily", status: "todo", priority: "medium", notes: "Min X products/store" },
  { title: "Link Gmail to account", recurrence: "daily", status: "todo", priority: "medium", notes: "100% linked" },
  { title: "Set currency / language / Timezone", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jordan Dave Caparas"], notes: "100% configured" },
  { title: "Connect domain to store", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jerome Mosada", "Launce Joshua Dayao"], notes: "20 connected/day" },
  { title: "Apply daily template", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jordan Dave Caparas", "Carl Concepcion"], notes: "0 errors" },
  { title: "Create Shopify accounts", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jordan Dave Caparas", "Launce Joshua Dayao", "Carl Concepcion", "Silver Dave Ramos"], notes: "20/day" },
  { title: "Verify DNS propagating", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jerome Mosada"], notes: "0 errors EOD" },
  { title: "Log in master sheet", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jerome Mosada"], notes: "100% same day" },
  { title: "Create Gmail accounts", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Francis Fernandez"], goal: 600, done: 320, notes: "20 GMails/day" },
  { title: "Purchase domains", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Jerome Mosada"], goal: 600, done: 226, notes: "20 domains/day" },
  { title: "Monitor Ad Spend / Account / Day + Sales", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Joshua Delos Reyes"], notes: "Report to your gc date + details" },
  { title: "Ask Andrei for new CC and run ads", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Joshua Delos Reyes"], notes: "Report to your gc date + details" },
  { title: "Create Gads and connect GMC within 24h", recurrence: "daily", status: "todo", priority: "medium", assignees: ["Joshua Delos Reyes"], notes: "Report to your gc date + details" },
  { title: "How many news GMC Stores were approved?", recurrence: "daily", status: "in-progress", priority: "high", assignees: ["Joshua Delos Reyes"], notes: "Report to your gc date + details" },
];

export async function POST() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Build a name → id map from users table
    const userRows = await sql`SELECT id, name FROM users WHERE is_active = TRUE`;
    const nameToId = new Map<string, string>();
    for (const u of userRows as { id: string; name: string }[]) {
      nameToId.set(u.name.toLowerCase(), u.id);
    }

    // Check if the extended columns exist
    let hasExtendedCols = true;
    try {
      await sql`SELECT notes, recurrence, goal_value, done_value FROM tasks LIMIT 0`;
    } catch {
      hasExtendedCols = false;
    }

    let ok = 0;
    const errors: string[] = [];

    for (const t of TASKS) {
      try {
        // Resolve first assignee (schema only supports one)
        let assigneeId: string | null = null;
        if (t.assignees?.length) {
          const firstName = t.assignees[0];
          assigneeId = nameToId.get(firstName.toLowerCase()) ?? null;
        }
        // If multiple assignees, append them to notes
        let notes = t.notes ?? "";
        if (t.assignees && t.assignees.length > 1) {
          notes = `Assignees: ${t.assignees.join(", ")} | ${notes}`;
        }

        if (hasExtendedCols) {
          await sql`
            INSERT INTO tasks (title, priority, status, assignee_id, notes, recurrence, goal_value, done_value)
            VALUES (${t.title}, ${t.priority}, ${t.status}, ${assigneeId},
                    ${notes}, ${t.recurrence}, ${t.goal ?? 0}, ${t.done ?? 0})
          `;
        } else {
          await sql`
            INSERT INTO tasks (title, priority, status, assignee_id)
            VALUES (${t.title}, ${t.priority}, ${t.status}, ${assigneeId})
          `;
        }
        ok++;
      } catch (err: unknown) {
        errors.push(`${t.title}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({
      data: {
        added: ok,
        failed: errors.length,
        total: TASKS.length,
        extendedColumns: hasExtendedCols,
        errors: errors.slice(0, 10),
      },
    });
  } catch (e: unknown) {
    console.error("[tasks/seed] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
