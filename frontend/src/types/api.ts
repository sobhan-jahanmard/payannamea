export type OrderStatus =
  | "submitted"
  | "approved"
  | "in_progress"
  | "worker_done_pending_approval"
  | "admin_review"
  | "completed"
  | "failed";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: "customer" | "admin";
  created_at: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
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

export interface Order {
  id: string;
  status: OrderStatus;
  degree: string;
  university: string;
  title: string;
  student_name?: string | null;
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
  deadline?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  customer: User;
  files?: OrderFile[];
  references?: OrderReference[];
  status_logs?: StatusLog[];
  final_outputs?: FinalOutput[];
  review_notes?: ReviewNote[];
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
  degree: string;
  university: string;
  title: string;
  student_name: string;
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
  deadline?: string;
  notes?: string;
  references: ReferenceInput[];
}

export type OrderUpdatePayload = OrderCreatePayload;
