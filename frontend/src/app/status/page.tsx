"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  Edit3,
  FileUp,
  RefreshCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthGate } from "../../components/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { absoluteUrl, deleteOrderFile, getOrder, updateOrder, uploadOrderFile } from "../../lib/api";
import { formatBytes, formatDate, formatDateTime, paymentStatusLabel, statusLabel } from "../../lib/format";
import { jalaliDateToUtcIso, jalaliMonthLength, utcIsoToJalaliDate } from "../../lib/jalali";
import {
  academicDetailLabels,
  citationStyleDescriptions,
  citationStyleNotRequiredValue,
  citationStyleOptions,
  degreeOptions,
  languageOptions,
  majorOptions,
  methodologyOptions,
  orderTypeOptions,
  orderTypeFieldConfig,
  quantityLabel,
  type QuantityType,
  universityOptions,
} from "../../lib/order-options";
import type { Order, OrderFile, OrderUpdatePayload } from "../../types/api";

const optionalQuantity = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}, z.number().int().min(1, "حداقل مقدار ۱ است").max(500000, "حداکثر مقدار ۵۰۰۰۰۰ است").optional());

const optionalImageCount = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}, z.number().int().min(0, "حداقل مقدار ۰ است").max(1000, "حداکثر ۱۰۰۰ عکس").optional());

const formSchema = z.object({
  correspondence_email: z.string().trim().email("ایمیل معتبر برای مکاتبات سفارش وارد کنید"),
  degree: z.string().min(1, "مقطع الزامی است"),
  university: z.string().min(1, "دانشگاه الزامی است"),
  title: z.string().min(3, "عنوان یا موضوع سفارش را وارد کنید"),
  student_name: z.string().min(2, "نام و نام خانوادگی دانشجو را وارد کنید"),
  student_number: z.string().trim().min(1, "شماره دانشجویی الزامی است").max(80, "شماره دانشجویی باید کوتاه‌تر باشد"),
  order_type: z.enum(orderTypeOptions as [string, ...string[]], { message: "نوع سفارش معتبر نیست" }),
  methodology: z.string().min(1, "روش یا رویکرد انجام الزامی است"),
  language: z.string().min(1, "زبان الزامی است"),
  academic_style: z.string().optional(),
  field_of_study: z.string().optional(),
  faculty: z.string().optional(),
  department: z.string().optional(),
  advisor_name: z.string().optional(),
  consultant_name: z.string().optional(),
  instructor_name: z.string().optional(),
  course_name: z.string().optional(),
  title_english: z.string().optional(),
  keywords: z.string().optional(),
  abstract: z.string().optional(),
  quantity_type: z.string().min(1, "واحد حجم را انتخاب کنید"),
  quantity_value: optionalQuantity,
  image_count: optionalImageCount,
  requires_charts: z.boolean(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
  moarref_code: z.string().max(120, "کد معرف باید کوتاه‌تر باشد").optional()
}).superRefine((values, ctx) => {
  const fieldConfig = orderTypeFieldConfig(values.order_type);
  for (const field of fieldConfig.required) {
    const value = values[field];
    const isMissing = typeof value === "number" ? value < 1 : !compact(value);
    if (isMissing) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${academicDetailLabels[field]} الزامی است`
      });
    }
  }

  if (!fieldConfig.quantityTypes.includes(values.quantity_type as QuantityType)) {
    ctx.addIssue({
      code: "custom",
      path: ["quantity_type"],
      message: "واحد حجم با نوع سفارش هم‌خوان نیست"
    });
  }

  if (fieldConfig.requiresCitationStyle && !compact(values.academic_style)) {
    ctx.addIssue({
      code: "custom",
      path: ["academic_style"],
      message: "شیوه ارجاع برای این نوع سفارش الزامی است"
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

const fileTypeOptions = [
  { value: "university_guideline", label: "شیوه‌نامه دانشگاه" },
  { value: "reference_file", label: "منابع و مقالات" },
  { value: "supporting_material", label: "فایل تکمیلی" }
];

function compact(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function display(value?: string | number | null) {
  return value || value === 0 ? String(value) : "-";
}

function fileTypeLabel(type: string) {
  return fileTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function valuesFromOrder(order: Order): FormValues {
  return {
    correspondence_email: order.correspondence_email,
    degree: order.degree,
    university: order.university,
    title: order.title,
    student_name: order.student_name ?? "",
    student_number: order.student_number ?? "",
    order_type: order.order_type ?? orderTypeOptions[0],
    methodology: order.methodology,
    language: order.language,
    academic_style: order.academic_style,
    field_of_study: order.field_of_study ?? "",
    faculty: order.faculty ?? "",
    department: order.department ?? "",
    advisor_name: order.advisor_name ?? "",
    consultant_name: order.consultant_name ?? "",
    instructor_name: order.instructor_name ?? "",
    course_name: order.course_name ?? "",
    title_english: order.title_english ?? "",
    keywords: order.keywords ?? "",
    abstract: order.abstract ?? "",
    quantity_type: order.quantity_type ?? orderTypeFieldConfig(order.order_type).defaultQuantityType,
    quantity_value: order.quantity_value ?? undefined,
    image_count: order.image_count ?? undefined,
    requires_charts: order.requires_charts,
    deadline: order.deadline ?? "",
    notes: order.notes ?? "",
    moarref_code: order.moarref_code ?? ""
  };
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

function SearchableField({
  id,
  label,
  error,
  options,
  inputProps
}: {
  id: string;
  label: string;
  error?: string;
  options: string[];
  inputProps: InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <Field label={label} error={error}>
      <Input list={id} {...inputProps} />
      <datalist id={id}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </Field>
  );
}

function JalaliDateField({
  label,
  error,
  value,
  onChange
}: {
  label: string;
  error?: string;
  value?: string;
  onChange: (value?: string) => void;
}) {
  const currentYear = utcIsoToJalaliDate(new Date().toISOString())?.year ?? 1405;
  const selected = utcIsoToJalaliDate(value);
  const year = selected?.year;
  const month = selected?.month;
  const day = selected?.day;
  const years = Array.from({ length: 8 }, (_, index) => currentYear + index);
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const days = Array.from({ length: month ? jalaliMonthLength(year ?? currentYear, month) : 31 }, (_, index) => index + 1);

  function update(nextYear?: number, nextMonth?: number, nextDay?: number) {
    if (!nextYear || !nextMonth || !nextDay) {
      onChange(undefined);
      return;
    }
    const maxDay = jalaliMonthLength(nextYear, nextMonth);
    onChange(jalaliDateToUtcIso(nextYear, nextMonth, Math.min(nextDay, maxDay)));
  }

  return (
    <Field label={label} error={error}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select value={year ?? ""} onChange={(event) => update(Number(event.target.value) || undefined, month, day)}>
          <option value="">سال</option>
          {years.map((option) => <option key={option} value={option}>{option.toLocaleString("fa-IR", { useGrouping: false })}</option>)}
        </Select>
        <Select value={month ?? ""} onChange={(event) => update(year, Number(event.target.value) || undefined, day)}>
          <option value="">ماه</option>
          {months.map((option) => <option key={option} value={option}>{option.toLocaleString("fa-IR", { useGrouping: false })}</option>)}
        </Select>
        <Select value={day ?? ""} onChange={(event) => update(year, month, Number(event.target.value) || undefined)}>
          <option value="">روز</option>
          {days.map((option) => <option key={option} value={option}>{option.toLocaleString("fa-IR", { useGrouping: false })}</option>)}
        </Select>
      </div>
    </Field>
  );
}

function DetailItem({ label, value, className = "" }: { label: string; value?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap font-medium">{value || "-"}</dd>
    </div>
  );
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function appendFiles(current: File[], selected: File[]) {
  return [...current, ...selected];
}

function FileList({ files, onDelete, deletingId }: { files?: OrderFile[]; onDelete?: (file: OrderFile) => void; deletingId?: string | null }) {
  if (!files?.length) {
    return <div className="rounded-md border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">فایلی ثبت نشده است.</div>;
  }

  return (
    <div className="grid gap-3">
      {files.map((file) => (
        <div
          key={file.id}
          className="grid gap-2 rounded-md border border-border bg-white p-3 text-sm transition hover:bg-muted sm:grid-cols-[1fr_auto]"
        >
          <a href={absoluteUrl(file.url)} className="min-w-0">
            <span className="block truncate font-medium">{file.original_name}</span>
            <span className="ltr block text-left text-xs text-muted-foreground">{file.content_type ?? "file"} · {formatBytes(file.size_bytes)}</span>
          </a>
          <span className="flex items-center justify-end gap-2">
            <a href={absoluteUrl(file.url)} className="flex items-center gap-2 text-primary">
              {fileTypeLabel(file.file_type)}
              <Download className="h-4 w-4" aria-hidden="true" />
            </a>
            {onDelete ? (
              <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(file)} disabled={deletingId === file.id} title="حذف فایل">
                <Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" />
              </Button>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fileType, setFileType] = useState(fileTypeOptions[0].value);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const orderId = params?.get("order")?.trim() ?? "";

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      correspondence_email: "",
      degree: orderTypeFieldConfig(orderTypeOptions[0]).defaultDegree,
      university: universityOptions[0],
      student_name: "",
      student_number: "",
      order_type: orderTypeOptions[0],
      methodology: methodologyOptions[0],
      language: languageOptions[0],
      academic_style: citationStyleOptions[0],
      field_of_study: "",
      faculty: "",
      department: "",
      advisor_name: "",
      consultant_name: "",
      instructor_name: "",
      course_name: "",
      title_english: "",
      keywords: "",
      abstract: "",
      quantity_type: orderTypeFieldConfig(orderTypeOptions[0]).defaultQuantityType,
      deadline: "",
      requires_charts: false,
      moarref_code: ""
    }
  });
  const watched = watch();
  const selectedFieldConfig = orderTypeFieldConfig(watched.order_type);
  const isDetailVisible = (field: keyof typeof academicDetailLabels) => selectedFieldConfig.visible.includes(field);
  const requiredMark = (field: keyof typeof academicDetailLabels) => selectedFieldConfig.required.includes(field) ? " *" : "";
  const quantityTypes = selectedFieldConfig.quantityTypes;
  const showCitationStyle = selectedFieldConfig.requiresCitationStyle;

  useEffect(() => {
    if (!quantityTypes.includes(watched.quantity_type as QuantityType)) {
      setValue("quantity_type", selectedFieldConfig.defaultQuantityType);
    }
  }, [quantityTypes, selectedFieldConfig.defaultQuantityType, setValue, watched.quantity_type]);

  useEffect(() => {
    if (selectedFieldConfig.requiresCitationStyle) {
      if (!compact(watched.academic_style) || watched.academic_style === citationStyleNotRequiredValue) {
        setValue("academic_style", citationStyleOptions[0]);
      }
    } else {
      setValue("academic_style", citationStyleNotRequiredValue);
    }
  }, [selectedFieldConfig.requiresCitationStyle, setValue, watched.academic_style]);

  function setLoadedOrder(nextOrder: Order) {
    setOrder(nextOrder);
    reset(valuesFromOrder(nextOrder));
  }

  async function loadOrder(id: string) {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      setLoadedOrder(await getOrder(trimmed));
    } catch (loadError) {
      setOrder(null);
      setError(loadError instanceof Error ? loadError.message : "سفارش پیدا نشد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOrder(null);
    setEditing(false);
    setError(null);
    setSuccess(null);
    if (orderId) {
      void loadOrder(orderId);
    } else {
      router.replace("/orders");
      setLoading(false);
    }
  }, [orderId, router]);

  async function onSubmit(values: FormValues) {
    if (!order) {
      return;
    }

    setError(null);
    setSuccess(null);
    const payload: OrderUpdatePayload = {
      correspondence_email: values.correspondence_email.trim(),
      degree: values.degree,
      university: values.university,
      title: values.title.trim(),
      student_name: values.student_name.trim(),
      student_number: values.student_number.trim(),
      order_type: values.order_type,
      methodology: values.methodology,
      language: values.language,
      academic_style: selectedFieldConfig.requiresCitationStyle ? compact(values.academic_style) || citationStyleOptions[0] : citationStyleNotRequiredValue,
      field_of_study: compact(values.field_of_study),
      faculty: compact(values.faculty),
      department: compact(values.department),
      advisor_name: compact(values.advisor_name),
      consultant_name: compact(values.consultant_name),
      instructor_name: compact(values.instructor_name),
      course_name: compact(values.course_name),
      title_english: compact(values.title_english),
      keywords: compact(values.keywords),
      abstract: compact(values.abstract),
      quantity_type: values.quantity_type,
      quantity_value: values.quantity_value,
      image_count: values.image_count,
      requires_charts: values.requires_charts,
      deadline: compact(values.deadline),
      notes: compact(values.notes),
      moarref_code: compact(values.moarref_code),
      references: (order.references ?? []).map((reference) => ({
        reference_type: reference.reference_type,
        title: reference.title.trim(),
        authors: compact(reference.authors),
        year: compact(reference.year),
        url: compact(reference.url),
        notes: compact(reference.notes),
        required_usage: reference.required_usage
      }))
    };

    try {
      let updated = await updateOrder(order.id, payload);
      for (const file of newFiles) {
        updated = await uploadOrderFile(order.id, fileType, file);
      }
      setLoadedOrder(updated);
      setNewFiles([]);
      setEditing(false);
      setSuccess("تغییرات سفارش ذخیره شد.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "ذخیره تغییرات ناموفق بود");
    }
  }

  const canEdit = order?.status === "submitted";

  async function removeStoredFile(file: OrderFile) {
    if (!order) return;
    setDeletingFileId(file.id);
    setError(null);
    try {
      setLoadedOrder(await deleteOrderFile(order.id, file.id));
      setSuccess("فایل حذف شد.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "حذف فایل ناموفق بود");
    } finally {
      setDeletingFileId(null);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">پیگیری سفارش</h1>
          <p className="mt-1 text-sm text-muted-foreground">جزئیات سفارش، فایل‌ها، وضعیت بررسی و خروجی‌ها در این صفحه نمایش داده می‌شود.</p>
        </div>
        {order ? (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} />
            {canEdit ? (
              <Button type="button" variant={editing ? "outline" : "default"} onClick={() => setEditing((current) => !current)}>
                {editing ? <X className="h-4 w-4" aria-hidden="true" /> : <Edit3 className="h-4 w-4" aria-hidden="true" />}
                {editing ? "بستن ویرایش" : "ویرایش سفارش"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? <section className="tool-surface p-5 text-sm text-muted-foreground">در حال بارگذاری سفارش...</section> : null}
      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}
      {success ? <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{success}</div> : null}
      {!orderId ? <section className="tool-surface p-5 text-sm text-muted-foreground">در حال انتقال به سفارش‌های من...</section> : null}

      {order ? (
        <div className="grid gap-5">
          {canEdit ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              سفارش هنوز توسط مدیر تأیید نشده است؛ تا پیش از تأیید می‌توانید اطلاعات آن را ویرایش کنید.
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              ویرایش فقط تا پیش از تأیید مدیر امکان‌پذیر است. وضعیت فعلی: {statusLabel(order.status)}
            </div>
          )}

          <section className="rounded-md border-2 border-primary/40 bg-teal-50 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-teal-950">خروجی‌های نهایی</h2>
              {order.final_outputs?.length ? (
                <span className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">
                  آماده دانلود
                </span>
              ) : null}
            </div>
            {order.final_outputs?.length ? (
              <div className="grid gap-3">
                {order.final_outputs.map((output) => (
                  <a
                    key={output.id}
                    href={absoluteUrl(output.url)}
                    className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-white px-4 py-4 text-sm shadow-sm transition hover:border-primary hover:bg-teal-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold text-foreground">{output.original_name}</span>
                      <span className="ltr block text-left text-xs font-medium text-muted-foreground">{output.output_type} · {formatBytes(output.size_bytes)}</span>
                    </span>
                    <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-primary/30 bg-white p-6 text-sm font-medium text-teal-900">
                هنوز خروجی نهایی بارگذاری نشده است.
              </div>
            )}
          </section>

          {editing && canEdit ? (
            <form onSubmit={handleSubmit(onSubmit)} className="tool-surface grid gap-5 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">ویرایش جزئیات سفارش</h2>
                <Button type="submit" loading={isSubmitting}>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  ذخیره تغییرات
                </Button>
              </div>
              <div className="grid gap-6">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span className="font-semibold">نوع سفارش:</span> {order.order_type ?? "-"}
                </div>

                <div className="grid gap-4 border-b border-border pb-5 lg:grid-cols-2">
                  <h3 className="text-base font-semibold lg:col-span-2">موضوع و دانشگاه</h3>
                  <Field label="عنوان یا موضوع پیشنهادی *" error={errors.title?.message}>
                    <Input {...register("title")} />
                  </Field>
                  <Field label="نام و نام خانوادگی دانشجو *" error={errors.student_name?.message}>
                    <Input autoComplete="name" {...register("student_name")} />
                  </Field>
                  <Field label="شماره دانشجویی *" error={errors.student_number?.message}>
                    <Input className="ltr text-left" inputMode="numeric" {...register("student_number")} />
                  </Field>
                  <SearchableField id="edit-majors" label="رشته یا گرایش تحصیلی" error={errors.field_of_study?.message} options={majorOptions} inputProps={register("field_of_study")} />
                  <Field label="مقطع تحصیلی" error={errors.degree?.message}>
                    <Select {...register("degree")}>{degreeOptions.map((option) => <option key={option}>{option}</option>)}</Select>
                  </Field>
                  <SearchableField id="edit-universities" label="دانشگاه یا مؤسسه آموزشی" error={errors.university?.message} options={universityOptions} inputProps={register("university")} />
                  <Field label="کد معرف" error={errors.moarref_code?.message}>
                    <Input className="ltr text-left" {...register("moarref_code")} />
                  </Field>
                  <Field label="ایمیل مکاتبات سفارش" error={errors.correspondence_email?.message}>
                    <Input className="ltr text-left" type="email" autoComplete="email" {...register("correspondence_email")} />
                  </Field>
                </div>

                <div className="grid gap-4 border-b border-border pb-5 lg:grid-cols-2">
                  <h3 className="text-base font-semibold lg:col-span-2">اطلاعات آموزشی</h3>
                  {isDetailVisible("faculty") ? (
                    <Field label={`${academicDetailLabels.faculty}${requiredMark("faculty")}`} error={errors.faculty?.message}>
                      <Input {...register("faculty")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("department") ? (
                    <Field label={`${academicDetailLabels.department}${requiredMark("department")}`} error={errors.department?.message}>
                      <Input {...register("department")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("advisor_name") ? (
                    <Field label={`${academicDetailLabels.advisor_name}${requiredMark("advisor_name")}`} error={errors.advisor_name?.message}>
                      <Input {...register("advisor_name")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("consultant_name") ? (
                    <Field label={`${academicDetailLabels.consultant_name}${requiredMark("consultant_name")}`} error={errors.consultant_name?.message}>
                      <Input {...register("consultant_name")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("instructor_name") ? (
                    <Field label={`${academicDetailLabels.instructor_name}${requiredMark("instructor_name")}`} error={errors.instructor_name?.message}>
                      <Input {...register("instructor_name")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("course_name") ? (
                    <Field label={`${academicDetailLabels.course_name}${requiredMark("course_name")}`} error={errors.course_name?.message}>
                      <Input {...register("course_name")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("title_english") ? (
                    <Field label={`${academicDetailLabels.title_english}${requiredMark("title_english")}`} error={errors.title_english?.message}>
                      <Input className="ltr text-left" {...register("title_english")} />
                    </Field>
                  ) : null}
                  {isDetailVisible("keywords") ? (
                    <Field label={`${academicDetailLabels.keywords}${requiredMark("keywords")}`} error={errors.keywords?.message}>
                      <Input {...register("keywords")} placeholder="واژه‌ها را با ویرگول جدا کنید" />
                    </Field>
                  ) : null}
                  {isDetailVisible("abstract") ? (
                    <div className="lg:col-span-2">
                      <Field label={`${academicDetailLabels.abstract}${requiredMark("abstract")}`} error={errors.abstract?.message}>
                        <Textarea {...register("abstract")} />
                      </Field>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <h3 className="text-base font-semibold lg:col-span-2">الزامات خروجی</h3>
                  <Field label="روش یا رویکرد انجام" error={errors.methodology?.message}>
                    <Select {...register("methodology")}>{methodologyOptions.map((option) => <option key={option}>{option}</option>)}</Select>
                  </Field>
                  {showCitationStyle ? (
                    <Field label="شیوه ارجاع‌دهی" error={errors.academic_style?.message}>
                      <Select {...register("academic_style")}>
                        {citationStyleOptions.map((option) => <option key={option} value={option}>{option} — {citationStyleDescriptions[option]}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  <Field label="زبان" error={errors.language?.message}>
                    <Select {...register("language")}>
                      {languageOptions.map((option) => <option key={option}>{option}</option>)}
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                    <Field label="حجم موردنیاز" error={errors.quantity_value?.message}>
                      <Input className="ltr text-left" {...register("quantity_value")} type="number" min={1} placeholder="بعداً مشخص می‌شود" />
                    </Field>
                    <Field label="واحد" error={errors.quantity_type?.message}>
                      <Select {...register("quantity_type")}>
                        {quantityTypes.map((type) => <option key={type} value={type}>{quantityLabel(type)}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="تعداد عکس موردنیاز در فایل نهایی" error={errors.image_count?.message}>
                    <Input className="ltr text-left" {...register("image_count")} type="number" min={0} max={1000} placeholder="مثلاً ۵" />
                  </Field>
                  <label className="flex min-h-10 items-center gap-2 self-end rounded-md border border-border bg-white px-3 py-2 text-sm font-medium">
                    <input type="checkbox" className="h-4 w-4 rounded border-input accent-teal-700" {...register("requires_charts")} />
                    افزودن گراف و چارت در صورت نیاز
                  </label>
                  <JalaliDateField
                    label="مهلت موردنظر برای تحویل"
                    error={errors.deadline?.message}
                    value={watched.deadline}
                    onChange={(value) => setValue("deadline", value ?? "", { shouldDirty: true, shouldValidate: true })}
                  />
                  <div className="lg:col-span-2">
                    <Field label="توضیحات تکمیلی، خواسته‌های استاد یا نکات ضروری" error={errors.notes?.message}>
                      <Textarea {...register("notes")} />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-md border border-border bg-white p-4">
                <div className="flex items-center gap-2 font-medium">
                  <FileUp className="h-4 w-4 text-primary" aria-hidden="true" />
                  افزودن فایل جدید
                </div>
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <Select value={fileType} onChange={(event) => setFileType(event.target.value)}>
                    {fileTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                  <Input type="file" multiple onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); setNewFiles((current) => appendFiles(current, selected)); event.currentTarget.value = ""; }} />
                </div>
                {newFiles.length ? (
                  <ul className="grid gap-2 text-sm">
                    {newFiles.map((file, index) => (
                      <li key={`${fileKey(file)}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
                        <span className="truncate">{file.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="ltr text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                          <button type="button" onClick={() => setNewFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-1 text-red-700 hover:bg-red-50" title="حذف فایل">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </form>
          ) : null}

          <section className="tool-surface p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{order.title}</h2>
                <p className="ltr mt-1 text-left text-sm text-muted-foreground">{order.correspondence_email}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadOrder(order.id)} loading={loading}>
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                تازه‌سازی
              </Button>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="شناسه سفارش" value={<span className="ltr inline-block">{order.id}</span>} />
              <DetailItem label="وضعیت فعلی" value={statusLabel(order.status)} />
              <DetailItem label="وضعیت پرداخت" value={paymentStatusLabel(order.payment_status)} />
              <DetailItem label="وضعیت پرداخت معرف" value={paymentStatusLabel(order.moarref_payment_status)} />
              <DetailItem label="نوع سفارش" value={display(order.order_type)} />
              <DetailItem label="کد معرف" value={display(order.moarref_code)} />
              <DetailItem label="نام دانشجو" value={display(order.student_name)} />
              <DetailItem label="شماره دانشجویی" value={<span className="ltr inline-block">{display(order.student_number)}</span>} />
              <DetailItem label="ایمیل مکاتبات" value={<span className="ltr inline-block">{order.correspondence_email}</span>} />
              <DetailItem label="تاریخ ثبت" value={formatDateTime(order.created_at)} />
              <DetailItem label="آخرین به‌روزرسانی" value={formatDateTime(order.updated_at)} />
              <DetailItem label="مقطع تحصیلی" value={order.degree} />
              <DetailItem label="دانشگاه یا مؤسسه آموزشی" value={order.university} />
              <DetailItem label="رشته یا گرایش" value={display(order.field_of_study)} />
              <DetailItem label="دانشکده" value={display(order.faculty)} />
              <DetailItem label="گروه آموزشی" value={display(order.department)} />
              <DetailItem label="استاد راهنما" value={display(order.advisor_name)} />
              <DetailItem label="استاد مشاور" value={display(order.consultant_name)} />
              <DetailItem label="استاد درس" value={display(order.instructor_name)} />
              <DetailItem label="نام درس" value={display(order.course_name)} />
              <DetailItem label="عنوان انگلیسی" value={display(order.title_english)} />
              <DetailItem label="کلیدواژه‌ها" value={display(order.keywords)} />
              <DetailItem
                label="حجم موردنیاز"
                value={order.quantity_value ? `${order.quantity_value.toLocaleString("fa-IR")} ${quantityLabel(order.quantity_type)}` : "-"}
              />
              <DetailItem label="تعداد عکس" value={order.image_count || order.image_count === 0 ? order.image_count.toLocaleString("fa-IR") : "-"} />
              <DetailItem label="گراف و چارت" value={order.requires_charts ? "نیاز است" : "نیاز نیست"} />
              <DetailItem label="روش یا رویکرد انجام" value={order.methodology} />
              <DetailItem label="زبان" value={order.language} />
              {orderTypeFieldConfig(order.order_type).requiresCitationStyle ? <DetailItem label="شیوه ارجاع‌دهی" value={order.academic_style} /> : null}
              <DetailItem label="مهلت تحویل" value={formatDate(order.deadline)} />
              <DetailItem className="sm:col-span-2 lg:col-span-3" label="چکیده یا شرح مسئله" value={display(order.abstract)} />
              <DetailItem className="sm:col-span-2 lg:col-span-3" label="توضیحات کاربر" value={display(order.notes)} />
            </dl>
          </section>

          <section className="tool-surface p-5">
            <h2 className="mb-4 text-lg font-semibold">فایل‌های ثبت‌شده</h2>
            <FileList files={order.files} onDelete={canEdit ? (file) => void removeStoredFile(file) : undefined} deletingId={deletingFileId} />
          </section>

        </div>
      ) : null}
    </main>
  );
}

export default function StatusPage() {
  return (
    <AuthGate>
      <Suspense fallback={<main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">در حال بارگذاری...</main>}>
        <StatusContent />
      </Suspense>
    </AuthGate>
  );
}
