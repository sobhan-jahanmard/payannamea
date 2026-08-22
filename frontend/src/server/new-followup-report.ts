import { getDataSource } from "./db/data-source";
import { email } from "./email";

type UserCandidateRow = {
  id: string;
  phone: string | null;
  created_at: Date | string;
};

type ConsultationCandidateRow = {
  id: string;
  phone: string | null;
  status: string;
  request_count: number;
  last_requested_at: Date | string;
};

type ReportCandidate = {
  phone: string;
  source: "users" | "consultation_leads" | "users + consultation_leads";
  arrivedAt: Date | string;
};

function normalizePhone(phone: string | null | undefined): string | null {
  const value = phone?.trim();

  return value || null;
}

export function formatIranDate(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return "نامشخص";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    numberingSystem: "latn",
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildNewFollowupReport(
  userRows: UserCandidateRow[],
  consultationRows: ConsultationCandidateRow[],
) {
  const candidatesByPhone = new Map<string, ReportCandidate>();

  // Add all users with admin_followup_status = 'new'
  for (const user of userRows) {
    const phone = normalizePhone(user.phone);

    if (!phone) {
      continue;
    }

    candidatesByPhone.set(phone, {
      phone,
      source: "users",
      arrivedAt: user.created_at,
    });
  }

  // Add consultation leads and merge duplicate phone numbers
  for (const lead of consultationRows) {
    const phone = normalizePhone(lead.phone);

    if (!phone) {
      continue;
    }

    const existing = candidatesByPhone.get(phone);

    if (!existing) {
      candidatesByPhone.set(phone, {
        phone,
        source: "consultation_leads",
        arrivedAt: lead.last_requested_at,
      });

      continue;
    }

    // The phone exists in both tables.
    // Keep one row and merge the sources.
    existing.source = "users + consultation_leads";

    // Use the latest date as "Came at".
    const existingTime = new Date(existing.arrivedAt).getTime();

    const consultationTime = new Date(lead.last_requested_at).getTime();

    if (
      !Number.isNaN(consultationTime) &&
      (Number.isNaN(existingTime) || consultationTime > existingTime)
    ) {
      existing.arrivedAt = lead.last_requested_at;
    }
  }

  const candidates = [...candidatesByPhone.values()];

  // Newest first
  candidates.sort((left, right) => {
    const leftTime = new Date(left.arrivedAt).getTime();

    const rightTime = new Date(right.arrivedAt).getTime();

    return rightTime - leftTime;
  });

  const generatedAt = formatIranDate(new Date());

  const rows = candidates
    .map(
      (candidate, index) => `
        <tr>
          <td style="
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            text-align: center;
          ">
            ${index + 1}
          </td>

          <td style="
            padding: 10px 12px;
            border: 1px solid #d1d5db;
          ">
            ${escapeHtml(candidate.phone)}
          </td>

          <td style="
            padding: 10px 12px;
            border: 1px solid #d1d5db;
          ">
            ${escapeHtml(candidate.source)}
          </td>

          <td style="
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            white-space: nowrap;
          ">
            ${escapeHtml(formatIranDate(candidate.arrivedAt))}
          </td>
        </tr>
      `,
    )
    .join("");

  const body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>New Follow-up Candidates Report</title>
</head>

<body style="
  margin: 0;
  padding: 24px;
  background-color: #f5f7fa;
  font-family: Arial, Helvetica, sans-serif;
  color: #1f2937;
">

  <div style="
    max-width: 900px;
    margin: 0 auto;
    background: #ffffff;
    padding: 24px;
    border-radius: 8px;
  ">

    <h2 style="
      margin: 0 0 8px;
      color: #111827;
    ">
      New follow-up candidates report
    </h2>

    <p style="
      margin: 0 0 20px;
      color: #6b7280;
    ">
      Generated at: ${escapeHtml(generatedAt)}
    </p>

    <table style="
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    ">
      <thead>
        <tr>
          <th style="
            padding: 12px;
            border: 1px solid #d1d5db;
            background-color: #f3f4f6;
            text-align: center;
          ">
            #
          </th>

          <th style="
            padding: 12px;
            border: 1px solid #d1d5db;
            background-color: #f3f4f6;
            text-align: left;
          ">
            Phone
          </th>

          <th style="
            padding: 12px;
            border: 1px solid #d1d5db;
            background-color: #f3f4f6;
            text-align: left;
          ">
            Source
          </th>

          <th style="
            padding: 12px;
            border: 1px solid #d1d5db;
            background-color: #f3f4f6;
            text-align: left;
          ">
            Came at
          </th>
        </tr>
      </thead>

      <tbody>
        ${
          rows ||
          `
            <tr>
              <td
                colspan="4"
                style="
                  padding: 24px;
                  text-align: center;
                  border: 1px solid #d1d5db;
                  color: #6b7280;
                "
              >
                No candidates found.
              </td>
            </tr>
          `
        }
      </tbody>
    </table>

    <p style="
      margin-top: 16px;
      color: #6b7280;
      font-size: 13px;
    ">
      Total: ${candidates.length}
    </p>

  </div>

</body>
</html>
`;

  return {
    body,
    candidates,
  };
}

export async function sendNewFollowupCandidatesReport() {
  const dataSource = await getDataSource();

  const [users, consultationLeads] = (await Promise.all([
    // Fetch users independently.
    // No orders join and no order-count restriction.
    dataSource.query(
      `select
        u.id,
        u.phone,
        u.created_at
       from users u
       where u.admin_followup_status = 'new'
       and u.role = 'customer'
       order by u.created_at desc`,
    ),

    // Fetch consultation leads independently.
    dataSource.query(
      `select
        id,
        phone,
        status,
        request_count,
        last_requested_at
       from consultation_leads
       where status = 'new'
         and request_count = 1
       order by last_requested_at desc`,
    ),
  ])) as [UserCandidateRow[], ConsultationCandidateRow[]];

  // Merge both independent lists by phone.
  const report = buildNewFollowupReport(users, consultationLeads);

  const sent = await email.sendNewFollowupCandidatesReport(
    "",
    report.body,
    report.candidates.length,
  );

  return {
    ...report,
    sent,
  };
}
