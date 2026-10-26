/** Registers an order and verifies the stored input; never starts a worker or sends email. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import { getDataSource } from "../db/data-source";
import { OrderSchema } from "../db/entities";
import { createCustomerOrder, getOrderOr404, setOrderStatus } from "../orders";
import { readStoredUpload } from "../files";

const { values } = parseArgs({ options: { parent: { type: "string" }, source: { type: "string" }, slides: { type: "string", default: "20" } } });
if (!values.parent || !values.source) throw new Error("Usage: tsx src/server/scripts/create-presentation-from-source.ts --parent <order-id> --source <final.docx> [--slides 20]");
if (existsSync(".env.local")) {
  for (const [key, value] of Object.entries(parseEnv(await readFile(".env.local", "utf8")))) process.env[key] ??= value;
}
const dataSource = await getDataSource();
try {
  const parent = await getOrderOr404(values.parent);
  if (!parent.customer) throw new Error("Source order customer missing");
  const bytes = await readFile(path.resolve(values.source));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const marker = `Source order: ${parent.id}; SHA256: ${sha256}`;
  // Safe to retry after an interrupted registration without creating a duplicate.
  const previous = await dataSource.getRepository(OrderSchema).createQueryBuilder("order")
    .where("order.user_id = :userId AND order.order_type = :type AND order.notes LIKE :marker", {
      userId: parent.user_id, type: "ارائه و پاورپوینت", marker: `%${marker}%`
    }).getOne();
  const source = new File([bytes], "bachelor-thesis-final.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const order = previous ? await getOrderOr404(previous.id) : await createCustomerOrder(parent.customer, {
    correspondence_email: parent.correspondence_email,
    degree: parent.degree, university: parent.university,
    title: `ارائه دفاع: ${parent.title}`, student_name: parent.student_name, student_number: parent.student_number,
    order_type: "ارائه و پاورپوینت", methodology: "ارائه و تلخیص مستند بر پایه پایان‌نامه نهایی", language: parent.language,
    field_of_study: parent.field_of_study, faculty: parent.faculty, department: parent.department,
    instructor_name: parent.advisor_name, course_name: "ارائه پروژه کارشناسی مهندسی صنایع",
    quantity_type: "slides", quantity_value: Number(values.slides), requires_charts: true,
    notes: `لطفاً یک ارائه فارسی رسمی و خوانا برای جلسه دفاع پروژه کارشناسی آماده کنید. مخاطب استاد و دانشجویان مهندسی صنایع هستند. ارائه حدود ۱۵ تا ۲۰ دقیقه و ${values.slides} اسلاید شامل جلد، منابع و جمع‌بندی باشد. فقط از فایل پایان‌نامه نهایی پیوست استفاده کنید. مسئله بازیافت PET، محصول، فرایند تولید، مفروضات فنی و مالی، یافته‌های واقعی و محدودیت‌ها را با اولویت پیام اصلی ارائه کنید. نمودار قابل ویرایش صرفاً با اعداد همان فایل و واحد روشن رسم شود. نتیجه یا آزمایش تازه نسازید. یادداشت سخنران و نسخه PDF هم لازم است.\n\n${marker}`,
    references: []
  }, undefined, source, { notify: false });
  const uploaded = order.files?.find(file => file.file_type === "information_source");
  if (!uploaded) throw new Error("Registered order has no information source");
  const stored = await readStoredUpload(uploaded.storage_path);
  if (!stored || createHash("sha256").update(stored.body).digest("hex") !== sha256) throw new Error("Stored source hash verification failed");
  // The order is ready for a manual run; this does not invoke any worker.
  if (order.status === "submitted") await dataSource.transaction(manager => setOrderStatus(manager, order, "approved", "admin", "منبع اطلاعات متصل و صحت فایل کنترل شد؛ اجرای سفارش به‌صورت دستی انجام می‌شود."));
  const receipt = { order_id: order.id, source_order_id: parent.id, status: order.status, title: order.title,
    source: { file_id: uploaded.id, original_name: uploaded.original_name, size_bytes: uploaded.size_bytes, sha256 },
    slide_count: order.quantity_value, worker_started: false };
  const directory = path.resolve("../worker_plus/workspace", `order_${order.id}`);
  await mkdir(path.join(directory, "input/files"), { recursive: true });
  await writeFile(path.join(directory, "input/files/information_source__bachelor-thesis-final.docx"), bytes);
  await writeFile(path.join(directory, "registration_receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
  process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
} finally {
  await dataSource.destroy();
}
