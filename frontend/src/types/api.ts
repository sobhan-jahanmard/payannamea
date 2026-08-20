export type OrderStatus =
  | "submitted"
  | "approved"
  | "in_progress"
  | "worker_done_pending_approval"
  | "admin_review"
  | "completed"
  | "failed";

export type PaymentStatus = "fully_paid" | "partially_paid" | "not_paid" | "refunded";
export type PaymentNoteType = "payment" | "moarref_payment";
export type UserFollowupStatus = "new" | "contacted" | "closed";

export interface User {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone: string | null;
  role: "customer" | "admin";
  created_at: string;
}

export interface AdminUser extends User {
  full_name: string | null;
  email: string | null;
  admin_followup_status: UserFollowupStatus;
  admin_note: string;
  order_count: number;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  counts: Partial<Record<UserFollowupStatus, number>>;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface OtpRequestPayload {
  phone: string;
}

export interface OtpRequestResponse {
  challenge_id: string;
  expires_in: number;
  dev_code?: string;
}

export interface OtpVerifyPayload extends OtpRequestPayload {
  challenge_id: string;
  code: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface ForgotPasswordResponse {
  message: string;
  reset_token?: string | null;
}

export interface OrderReference {
  id: string;
  order_id: string;
  reference_type: string;
  title: string;
  authors?: string | null;
  year?: string | null;
  url?: string | null;
  notes?: string | null;
  required_usage: boolean;
  created_at: string;
}

export interface OrderFile {
  id: string;
  order_id: string;
  file_type: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type?: string | null;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  url: string;
}

export interface StatusLog {
  id: string;
  order_id: string;
  from_status?: string | null;
  to_status: OrderStatus;
  actor: string;
  notes?: string | null;
  created_at: string;
}

export interface FinalOutput {
  id: string;
  order_id: string;
  worker_submission_id?: string | null;
  output_type: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  content_type?: string | null;
  size_bytes: number;
  notes?: string | null;
  created_at: string;
  url: string;
}

export interface ReviewNote {
  id: string;
  order_id: string;
  author: string;
  note: string;
  created_at: string;
}

export interface PaymentNote {
  id: string;
  order_id: string;
  note_type: PaymentNoteType;
  payment_status: PaymentStatus;
  note?: string | null;
  original_name?: string | null;
  stored_name?: string | null;
  storage_path?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
  url?: string | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  moarref_payment_status: PaymentStatus;
  correspondence_email: string;
  degree: string;
  university: string;
  title: string;
  student_name?: string | null;
  student_number?: string | null;
  order_type?: string | null;
  methodology: string;
  language: string;
  academic_style: string;
  field_of_study?: string | null;
  faculty?: string | null;
  department?: string | null;
  advisor_name?: string | null;
  consultant_name?: string | null;
  instructor_name?: string | null;
  course_name?: string | null;
  title_english?: string | null;
  keywords?: string | null;
  abstract?: string | null;
  quantity_type?: string | null;
  quantity_value?: number | null;
  image_count?: number | null;
  requires_charts: boolean;
  deadline?: string | null;
  notes?: string | null;
  moarref_code?: string | null;
  created_at: string;
  updated_at: string;
  customer: User;
  files?: OrderFile[];
  references?: OrderReference[];
  status_logs?: StatusLog[];
  final_outputs?: FinalOutput[];
  review_notes?: ReviewNote[];
  payment_notes?: PaymentNote[];
}

export interface ReferenceInput {
  reference_type: string;
  title: string;
  authors?: string;
  year?: string;
  url?: string;
  notes?: string;
  required_usage: boolean;
}

export interface OrderCreatePayload {
  correspondence_email: string;
  degree: string;
  university: string;
  title: string;
  student_name: string;
  student_number: string;
  order_type: string;
  methodology: string;
  language: string;
  academic_style: string;
  field_of_study?: string;
  faculty?: string;
  department?: string;
  advisor_name?: string;
  consultant_name?: string;
  instructor_name?: string;
  course_name?: string;
  title_english?: string;
  keywords?: string;
  abstract?: string;
  quantity_type?: string;
  quantity_value?: number;
  image_count?: number;
  requires_charts: boolean;
  deadline?: string;
  notes?: string;
  moarref_code?: string;
  references: ReferenceInput[];
}

export type OrderUpdatePayload = OrderCreatePayload;

export interface AnalyticsEventRecord {
  id: string;
  visitor_id: string;
  session_id: string;
  event_name: string;
  path: string;
  properties: Record<string, string | number | boolean>;
  created_at: string;
}

export interface AnalyticsDashboard {
  range: { from: string; to: string };
  summary: {
    total_events: number;
    unique_visitors: number;
    sessions: number;
    page_views: number;
    avg_engaged_seconds: number;
  };
  top_events: Array<{ event_name: string; count: number; visitors: number }>;
  top_pages: Array<{ path: string; views: number; visitors: number; sessions: number }>;
  daily: Array<{ date: string; events: number; page_views: number; visitors: number; sessions: number }>;
  events: AnalyticsEventRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export type ConsultationLeadStatus = "new" | "contacted" | "closed";

export interface ConsultationLead {
  id: string;
  phone: string;
  source: string;
  status: ConsultationLeadStatus;
  admin_note: string;
  request_count: number;
  last_requested_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConsultationLeadsResponse {
  leads: ConsultationLead[];
  counts: Partial<Record<ConsultationLeadStatus, number>>;
  pagination: { page: number; limit: number; total: number; pages: number };
}
