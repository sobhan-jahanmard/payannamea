import { getDataSource } from "./db/data-source";
import { email } from "./email";
import catalog from "../lib/service-catalog.json";
import { getServicePricing, type ServicePricing } from "./service-pricing";

const depositPercentage = "20%";

type UserCandidateRow = {
  id: string;
  phone: string | null;
  is_verified: boolean;
  created_at: Date | string;
  admin_note: string | null;
};

type ReportCandidate = {
  phone: string;
  source: "ثبت‌نام با تأیید قبلی" | "ثبت‌نام با شماره موبایل";
  arrivedAt: Date | string;
  adminNote: string | null;
};

function normalizePhone(phone: string | null | undefined): string | null {
  const value = phone?.trim();

  return value || null;
}

function normalizeAdminNote(
  adminNote: string | null | undefined,
): string | null {
  const value = adminNote?.trim();

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

function buildFollowupReport(userRows: UserCandidateRow[], title: string, rates: ServicePricing[]) {
  const candidatesByPhone = new Map<string, ReportCandidate>();

  // Include all phone registrations, preserving historical verification information.
  for (const user of userRows) {
    const phone = normalizePhone(user.phone);

    if (!phone) {
      continue;
    }

    candidatesByPhone.set(phone, {
      phone,
      source: user.is_verified
        ? "ثبت‌نام با تأیید قبلی"
        : "ثبت‌نام با شماره موبایل",
      arrivedAt: user.created_at,
      adminNote: normalizeAdminNote(user.admin_note),
    });
  }

  const candidates = [...candidatesByPhone.values()];

  // Newest first
  candidates.sort((left, right) => {
    const leftTime = new Date(left.arrivedAt).getTime();
    const rightTime = new Date(right.arrivedAt).getTime();

    return rightTime - leftTime;
  });

  const generatedAt = formatIranDate(new Date());

  const ratesByType = new Map(rates.map(rate => [rate.order_type, rate]));
  const priceItems = catalog.map(({ label, order_type }) => {
    const rate = ratesByType.get(order_type);
    const price = rate ? `هر ${rate.unit === "slide" ? "اسلاید" : "صفحه"} ${rate.price_per_unit_toman.toLocaleString("fa-IR")} تومان` : "تعرفه در دسترس نیست";
    return `
        <li style="margin: 0 0 6px;">
          ${escapeHtml(label)}: <strong>${escapeHtml(price)}</strong>
        </li>
      `;
  }).join("");

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

          <td style="
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            white-space: pre-wrap;
            word-break: break-word;
            max-width: 400px;
          ">
            ${candidate.adminNote ? escapeHtml(candidate.adminNote) : "-"}
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
    max-width: 1100px;
    margin: 0 auto;
    background: #ffffff;
    padding: 24px;
    border-radius: 8px;
  ">

    <h2 style="
      margin: 0 0 8px;
      color: #111827;
    ">
      ${escapeHtml(title)}
    </h2>

    <p style="
      margin: 0 0 20px;
      color: #6b7280;
    ">
      Generated at: ${escapeHtml(generatedAt)}
    </p>

    <section dir="rtl" style="
      margin: 0 0 20px;
      padding: 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background-color: #f9fafb;
      text-align: right;
    ">
      <h3 style="margin: 0 0 10px; color: #111827;">تعرفهٔ خدمات</h3>
      <ul style="margin: 0; padding-right: 20px; color: #374151;">
        ${priceItems}
      </ul>
      <p style="margin: 12px 0 0; color: #374151;">
        درصد بیعانه: <strong>${escapeHtml(depositPercentage)}</strong>
      </p>
    </section>

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

          <th style="
            padding: 12px;
            border: 1px solid #d1d5db;
            background-color: #f3f4f6;
            text-align: left;
          ">
            Admin Note
          </th>
        </tr>
      </thead>

      <tbody>
        ${
          rows ||
          `
            <tr>
              <td
                colspan="5"
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

  const users = (await dataSource.query(
    `select
        u.id,
        u.phone,
        u.is_verified,
        u.created_at,
        u.admin_note
       from users u
       where u.admin_followup_status = 'new'
       and u.role = 'customer'
       order by u.created_at desc`,
  )) as UserCandidateRow[];

  const report = buildFollowupReport(users, "New follow-up candidates report", await getServicePricing());

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

export async function sendContactedFollowupCandidatesReport() {
  const dataSource = await getDataSource();

  const users = (await dataSource.query(
    `select
        u.id,
        u.phone,
        u.is_verified,
        u.created_at,
        u.admin_note
       from users u
       where u.admin_followup_status = 'contacted'
       and u.role = 'customer'
       order by u.created_at desc`,
  )) as UserCandidateRow[];

  const report = buildFollowupReport(
    users,
    "Contacted follow-up candidates report",
    await getServicePricing(),
  );

  const sent = await email.sendContactedFollowupCandidatesReport(
    "",
    report.body,
    report.candidates.length,
  );

  return {
    ...report,
    sent,
  };
}
