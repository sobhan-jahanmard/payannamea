"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  Plus,
  Save,
  Trash2,
  UploadCloud
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { AuthGate, useAuth } from "../../components/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { createOrder, uploadOrderFile } from "../../lib/api";
import { formatBytes } from "../../lib/format";
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
import type { Order, OrderCreatePayload } from "../../types/api";

const referenceSchema = z.object({
  reference_type: z.string().min(1, "نوع منبع را انتخاب کنید"),
  title: z.string().min(1, "عنوان منبع الزامی است"),
  authors: z.string().optional(),
  year: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  required_usage: z.boolean()
});

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
  degree: z.string().min(1, "مقطع الزامی است"),
  university: z.string().min(1, "دانشگاه الزامی است"),
  title: z.string().min(3, "عنوان یا موضوع سفارش را وارد کنید"),
  student_name: z.string().min(2, "نام و نام خانوادگی دانشجو را وارد کنید"),
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
  deadline: z.string().optional(),
  notes: z.string().optional(),
  references: z.array(referenceSchema)
}).superRefine((values, ctx) => {
  const fieldConfig = orderTypeFieldConfig(values.order_type);
  for (const field of orderTypeFieldConfig(values.order_type).required) {
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

const steps = ["نوع سفارش", "مشخصات سفارش", "فایل‌ها", "منابع", "بازبینی"];

const stepDescriptions = [
  "نوع خدمت را مشخص کنید تا فیلدهای بعدی دقیق‌تر شوند.",
  "اطلاعات دانشگاهی، حجم کار و الزامات خروجی را وارد کنید.",
  "شیوه‌نامه، منابع و فایل‌های پشتیبان را بارگذاری کنید.",
  "منابع اجباری یا لینک‌های مهم را جداگانه ثبت کنید.",
  "قبل از ارسال، خلاصه سفارش را بررسی کنید."
];

function compact(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

export default function OrderPage() {
  return (
    <AuthGate>
      <OrderForm />
    </AuthGate>
  );
}

function FileSummary({ files }: { files: File[] }) {
  if (files.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 grid gap-2 text-sm">
      {files.map((file) => (
        <li
          key={`${file.name}-${file.size}`}
          className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2"
        >
          <span className="truncate">{file.name}</span>
          <span className="ltr shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
        </li>
      ))}
    </ul>
  );
}

function OrderForm() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const [guidelineFiles, setGuidelineFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [advancingStep, setAdvancingStep] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      degree: orderTypeFieldConfig(orderTypeOptions[0]).defaultDegree,
      university: universityOptions[0],
      student_name: "",
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
      references: []
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: "references" });
  const watched = watch();
  const selectedFieldConfig = orderTypeFieldConfig(watched.order_type);
  const isDetailVisible = (field: keyof typeof academicDetailLabels) => selectedFieldConfig.visible.includes(field);
  const requiredMark = (field: keyof typeof academicDetailLabels) => selectedFieldConfig.required.includes(field) ? " *" : "";
  const quantityTypes = selectedFieldConfig.quantityTypes;
  const totalFiles = guidelineFiles.length + referenceFiles.length + supportingFiles.length;
  const showCitationStyle = selectedFieldConfig.requiresCitationStyle;

  useEffect(() => {
    if (!quantityTypes.includes(watched.quantity_type as QuantityType)) {
      setValue("quantity_type", selectedFieldConfig.defaultQuantityType);
    }
  }, [quantityTypes, selectedFieldConfig.defaultQuantityType, setValue, watched.quantity_type]);

  useEffect(() => {
    setValue("degree", selectedFieldConfig.defaultDegree, { shouldDirty: true });
  }, [selectedFieldConfig.defaultDegree, setValue]);

  useEffect(() => {
    if (selectedFieldConfig.requiresCitationStyle) {
      if (!compact(watched.academic_style) || watched.academic_style === citationStyleNotRequiredValue) {
        setValue("academic_style", citationStyleOptions[0]);
      }
    } else {
      setValue("academic_style", citationStyleNotRequiredValue);
    }
  }, [selectedFieldConfig.requiresCitationStyle, setValue, watched.academic_style]);

  const stepFields = useMemo<Record<number, (keyof FormValues)[]>>(
    () => ({
      0: ["order_type"],
      1: [
        "degree",
        "university",
        "title",
        "student_name",
        "methodology",
        "language",
        "academic_style",
        "faculty",
        "department",
        "advisor_name",
        "consultant_name",
        "instructor_name",
        "course_name",
        "title_english",
        "keywords",
        "abstract",
        "quantity_type",
        "quantity_value",
        "image_count"
      ],
      3: ["references"]
    }),
    []
  );

  async function goNext() {
    setAdvancingStep(true);
    try {
      const fieldsToValidate = stepFields[step];
      const valid = fieldsToValidate ? await trigger(fieldsToValidate) : true;
      if (valid) {
        const next = Math.min(step + 1, steps.length - 1);
        setMaxVisitedStep((visited) => Math.max(visited, next));
        setStep(next);
      }
    } finally {
      setAdvancingStep(false);
    }
  }

  function goToStep(index: number) {
    if (index <= maxVisitedStep) {
      setStep(index);
    }
  }

  function goPrevious() {
    setStep((current) => Math.max(current - 1, 0));
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    setCreatedOrder(null);

    const payload: OrderCreatePayload = {
      degree: values.degree,
      university: values.university,
      title: values.title.trim(),
      student_name: values.student_name.trim(),
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
      deadline: compact(values.deadline),
      notes: compact(values.notes),
      references: values.references.map((reference) => ({
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
      const order = await createOrder(payload);
      for (const file of guidelineFiles) {
        await uploadOrderFile(order.id, "university_guideline", file);
      }
      for (const file of referenceFiles) {
        await uploadOrderFile(order.id, "reference_file", file);
      }
      for (const file of supportingFiles) {
        await uploadOrderFile(order.id, "supporting_material", file);
      }
      setCreatedOrder(order);
      router.push("/orders");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "ثبت سفارش ناموفق بود");
    }
  }

  const submitOrder = handleSubmit(onSubmit);

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 lg:px-8">
      <form onSubmit={(event) => event.preventDefault()} className="grid gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">ثبت سفارش خدمات دانشگاهی</h1>
            <p className="mt-1 text-sm text-muted-foreground">ابتدا نوع سفارش را انتخاب کنید، سپس مشخصات دانشگاهی، فایل‌ها و منابع لازم را وارد کنید تا سفارش برای بررسی مدیر ارسال شود.</p>
            {user ? (
              <p className="mt-2 text-xs text-muted-foreground">
                سفارش به نام {user.full_name} ثبت می‌شود. <span className="ltr inline-block">{user.email}</span>
              </p>
            ) : null}
          </div>
          {createdOrder ? (
            <Button asChild variant="outline">
              <Link href={`/status?order=${createdOrder.id}`}>
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                مشاهده وضعیت
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="tool-surface p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">
              مرحله {Number(step + 1).toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")}: {steps[step]}
            </p>
            <p className="text-xs text-muted-foreground">{stepDescriptions[step]}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => goToStep(index)}
                disabled={index > maxVisitedStep}
                className={`flex h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                  step === index
                    ? "border-primary bg-teal-50 text-teal-900"
                    : index < step
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      : "border-border bg-white text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                }`}
              >
                {index < step ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="text-xs">{Number(index + 1).toLocaleString("fa-IR")}</span>
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <section className="tool-surface p-5">
          {step === 0 ? (
            <div className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold">نوع سفارش را انتخاب کنید</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  انتخاب نوع سفارش، فیلدهای اجباری و واحد حجم کار را در مرحله بعد تنظیم می‌کند.
                </p>
              </div>
              <Field label="نوع سفارش" error={errors.order_type?.message}>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {orderTypeOptions.map((option) => (
                    <label
                      key={option}
                      className={`flex min-h-12 cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium transition ${
                        watched.order_type === option ? "border-primary bg-teal-50 text-teal-900 shadow-sm" : "border-border bg-white hover:bg-muted"
                      }`}
                    >
                      <input type="radio" className="sr-only" value={option} {...register("order_type")} />
                      {option}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          ) : null}

          {step > 0 ? (
            <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span className="font-semibold">نوع سفارش:</span> {watched.order_type}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-6">
              <div className="grid gap-4 border-b border-border pb-5 lg:grid-cols-2">
                <h2 className="text-base font-semibold lg:col-span-2">موضوع و دانشگاه</h2>
                <Field label="عنوان یا موضوع پیشنهادی" error={errors.title?.message}>
                  <Input {...register("title")} />
                </Field>
                <Field label="نام و نام خانوادگی دانشجو *" error={errors.student_name?.message}>
                  <Input autoComplete="name" {...register("student_name")} />
                </Field>
                <SearchableField id="majors" label="رشته یا گرایش تحصیلی" error={errors.field_of_study?.message} options={majorOptions} inputProps={register("field_of_study")} />
                <Field label="مقطع تحصیلی" error={errors.degree?.message}>
                  <Select {...register("degree")}>{degreeOptions.map((option) => <option key={option}>{option}</option>)}</Select>
                </Field>
                <SearchableField id="universities" label="دانشگاه یا مؤسسه آموزشی" error={errors.university?.message} options={universityOptions} inputProps={register("university")} />
              </div>

              <div className="grid gap-4 border-b border-border pb-5 lg:grid-cols-2">
                <h2 className="text-base font-semibold lg:col-span-2">اطلاعات آموزشی</h2>
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
                <h2 className="text-base font-semibold lg:col-span-2">الزامات خروجی</h2>
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
                <JalaliDateField
                  label="مهلت موردنظر برای تحویل"
                  error={errors.deadline?.message}
                  value={watched.deadline}
                  onChange={(value) => setValue("deadline", value ?? "", { shouldDirty: true, shouldValidate: true })}
                />
                <div className="lg:col-span-2">
                  <Field label="توضیحات تکمیلی، خواسته‌های استاد یا نکات ضروری" error={errors.notes?.message}>
                    <Textarea {...register("notes")} placeholder="مثلاً: دانشگاه فرمت خاصی دارد، استاد روی مدل خاصی تأکید کرده، داده‌ها آماده هستند، یا فقط اصلاح فصل‌ها لازم است." />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold">فایل‌های سفارش</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  شیوه‌نامه و فایل‌های منبع بیشترین اثر را روی بررسی سریع و خروجی درست دارند.
                </p>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="rounded-md border border-border bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium">
                    <FileUp className="h-4 w-4 text-primary" aria-hidden="true" />
                    شیوه‌نامه، دستورالعمل یا قالب موردنیاز
                  </div>
                  <Input type="file" multiple onChange={(event) => setGuidelineFiles(Array.from(event.target.files ?? []))} />
                  <FileSummary files={guidelineFiles} />
                </div>
                <div className="rounded-md border border-border bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium">
                    <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
                    منابع، مقالات، کتاب‌ها یا داده‌ها
                  </div>
                  <Input type="file" multiple onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))} />
                  <FileSummary files={referenceFiles} />
                </div>
                <div className="rounded-md border border-border bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium">
                    <UploadCloud className="h-4 w-4 text-primary" aria-hidden="true" />
                    فایل‌های تکمیلی
                  </div>
                  <Input type="file" multiple onChange={(event) => setSupportingFiles(Array.from(event.target.files ?? []))} />
                  <FileSummary files={supportingFiles} />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">منابع و اطلاعات اولیه</h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ reference_type: "article", title: "", authors: "", year: "", url: "", notes: "", required_usage: true })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  افزودن منبع
                </Button>
              </div>
              {fields.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
                  اگر منبع، لینک، کتاب، مقاله یا توضیح اولیه دارید وارد کنید. در غیر این صورت می‌توانید این مرحله را خالی بگذارید.
                </div>
              ) : null}
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border border-border bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">منبع {Number(index + 1).toLocaleString("fa-IR")}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} title="حذف منبع">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="نوع منبع" error={errors.references?.[index]?.reference_type?.message}>
                      <Select {...register(`references.${index}.reference_type` as const)}>
                        <option value="article">مقاله</option>
                        <option value="book">کتاب</option>
                        <option value="thesis">پایان‌نامه یا رساله</option>
                        <option value="website">وب‌سایت</option>
                        <option value="dataset">مجموعه داده</option>
                      </Select>
                    </Field>
                    <div className="lg:col-span-2">
                      <Field label="عنوان منبع" error={errors.references?.[index]?.title?.message}>
                        <Input {...register(`references.${index}.title` as const)} />
                      </Field>
                    </div>
                    <Field label="نویسندگان" error={errors.references?.[index]?.authors?.message}>
                      <Input {...register(`references.${index}.authors` as const)} />
                    </Field>
                    <Field label="سال" error={errors.references?.[index]?.year?.message}>
                      <Input className="ltr text-left" {...register(`references.${index}.year` as const)} />
                    </Field>
                    <Field label="لینک (URL)" error={errors.references?.[index]?.url?.message}>
                      <Input className="ltr text-left" {...register(`references.${index}.url` as const)} />
                    </Field>
                    <div className="lg:col-span-3">
                      <Field label="توضیحات منبع" error={errors.references?.[index]?.notes?.message}>
                        <Textarea {...register(`references.${index}.notes` as const)} />
                      </Field>
                    </div>
                    <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="h-4 w-4 rounded border-input accent-teal-700" {...register(`references.${index}.required_usage` as const)} />
                      استفاده از این منبع الزامی است
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-md border border-border bg-white p-4">
                <h2 className="mb-4 text-lg font-semibold">خلاصه سفارش</h2>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">مقطع تحصیلی</dt>
                    <dd className="font-medium">{watched.degree}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">دانشگاه</dt>
                    <dd className="font-medium">{watched.university}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">عنوان یا موضوع</dt>
                    <dd className="font-medium">{watched.title || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">نوع سفارش</dt>
                    <dd className="font-medium">{watched.order_type || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">روش یا رویکرد انجام</dt>
                    <dd className="font-medium">{watched.methodology}</dd>
                  </div>
                  {showCitationStyle ? (
                    <div>
                      <dt className="text-muted-foreground">شیوه ارجاع‌دهی</dt>
                      <dd className="font-medium">{watched.academic_style || "-"}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">حجم موردنیاز</dt>
                    <dd className="font-medium">
                      {watched.quantity_value ? `${watched.quantity_value.toLocaleString("fa-IR")} ${quantityLabel(watched.quantity_type)}` : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">تعداد عکس</dt>
                    <dd className="font-medium">{watched.image_count || watched.image_count === 0 ? watched.image_count.toLocaleString("fa-IR") : "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">منابع الزامی</dt>
                    <dd className="font-medium">{(watched.references?.length ?? 0).toLocaleString("fa-IR")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">فایل‌ها</dt>
                    <dd className="font-medium">{totalFiles.toLocaleString("fa-IR")}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-md border border-border bg-white p-4">
                <h2 className="mb-4 text-lg font-semibold">وضعیت اولیه</h2>
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between rounded-md bg-sky-50 px-3 py-2 text-sky-900">
                    <span>ارسال برای بررسی مدیر</span>
                    <span className="font-semibold">در انتظار تأیید</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-teal-50 px-3 py-2 text-teal-900">
                    <span>شروع انجام پس از تأیید</span>
                    <span className="font-semibold">بله</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {submitError ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{submitError}</div> : null}
        {createdOrder ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="font-semibold">شناسه سفارش:</span> <span className="ltr inline-block">{createdOrder.id}</span>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={goPrevious} disabled={step <= 0 || isSubmitting}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            مرحله قبل
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={goNext} loading={advancingStep} disabled={isSubmitting}>
              مرحله بعد
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={() => void submitOrder()} loading={isSubmitting}>
              <Save className="h-4 w-4" aria-hidden="true" />
              ثبت سفارش
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
