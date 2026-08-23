import type {
  AuthResponse,
  AdminUser,
  AdminUsersResponse,
  AnalyticsDashboard,
  ConsultationLead,
  ConsultationLeadsResponse,
  ConsultationLeadStatus,
  ForgotPasswordResponse,
  LoginPayload,
  OtpRequestPayload,
  OtpRequestResponse,
  OtpVerifyPayload,
  Order,
  OrderCreatePayload,
  PaymentNoteType,
  PaymentStatus,
  OrderStatus,
  OrderUpdatePayload,
  ReferenceInput,
  ReviewNote,
  User,
  UserFollowupStatus,
  PhoneFollowupResponse
} from "../types/api";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOKEN_KEY = "payanname_auth_token";
const USER_KEY = "payanname_auth_user";
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function storeAuthSession(session: AuthResponse): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, session.access_token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.document.cookie = `${TOKEN_KEY}=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${AUTH_SESSION_TTL_SECONDS}; SameSite=Lax`;
}

export function storeAuthUser(user: User): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  const isForm = typeof FormData !== "undefined" && options?.body instanceof FormData;
  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  for (const [key, value] of Object.entries(authHeaders())) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      message = response.statusText;
    }
    throw new Error(Array.isArray(message) ? JSON.stringify(message) : message);
  }

  return response.json() as Promise<T>;
}

export async function requestLoginOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse> {
  return request<OtpRequestResponse>("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function verifyLoginOtp(payload: OtpVerifyPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loginAccount(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getMe(): Promise<User> {
  return request<User>("/api/auth/me");
}

export async function findPhoneFollowup(phone: string): Promise<PhoneFollowupResponse> {
  return request<PhoneFollowupResponse>(`/api/follow-up?phone=${encodeURIComponent(phone)}`);
}

export async function updatePhoneFollowup(payload:
  | { target: "user"; id: string; admin_followup_status?: UserFollowupStatus; admin_note?: string }
  | { target: "lead"; id: string; status?: ConsultationLeadStatus; admin_note?: string }
): Promise<void> {
  await request("/api/follow-up", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return request<ForgotPasswordResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword })
  });
}

export async function createOrder(payload: OrderCreatePayload): Promise<Order> {
  return request<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadOrderFile(orderId: string, fileType: string, file: File): Promise<Order> {
  const form = new FormData();
  form.append("file_type", fileType);
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/files`, {
    method: "POST",
    headers: authHeaders(),
    body: form
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? response.statusText);
  }

  return response.json() as Promise<Order>;
}

export async function deleteOrderFile(orderId: string, fileId: string): Promise<Order> {
  return request<Order>(`/api/orders/${orderId}/files?file_id=${encodeURIComponent(fileId)}`, {
    method: "DELETE"
  });
}

export async function listMyOrders(): Promise<Order[]> {
  return request<Order[]>("/api/orders");
}

export async function addReference(orderId: string, payload: ReferenceInput) {
  return request(`/api/orders/${orderId}/references`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getOrder(orderId: string): Promise<Order> {
  return request<Order>(`/api/orders/${orderId}`);
}

export async function updateOrder(orderId: string, payload: OrderUpdatePayload): Promise<Order> {
  return request<Order>(`/api/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function listAdminOrders(statusFilter?: string): Promise<Order[]> {
  const params = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return request<Order[]>(`/api/admin/orders${params}`);
}

export async function getAdminAnalytics(params: {
  from?: string;
  to?: string;
  event?: string;
  path?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AnalyticsDashboard> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<AnalyticsDashboard>(`/api/admin/analytics?${query.toString()}`);
}

export async function getAdminConsultationLeads(params: {
  search?: string;
  status?: ConsultationLeadStatus;
  page?: number;
  limit?: number;
}): Promise<ConsultationLeadsResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<ConsultationLeadsResponse>(`/api/admin/leads?${query.toString()}`);
}

export async function getAdminUsers(params: {
  search?: string;
  status?: UserFollowupStatus;
  page?: number;
  limit?: number;
}): Promise<AdminUsersResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<AdminUsersResponse>(`/api/admin/users?${query.toString()}`);
}

export async function updateAdminUser(
  id: string,
  changes: { full_name?: string | null; email?: string | null; admin_followup_status?: UserFollowupStatus; admin_note?: string }
): Promise<AdminUser> {
  return request<AdminUser>("/api/admin/users", {
    method: "PATCH",
    body: JSON.stringify({ id, ...changes })
  });
}

export async function updateConsultationLead(
  id: string,
  changes: { status?: ConsultationLeadStatus; admin_note?: string }
): Promise<ConsultationLead> {
  return request<ConsultationLead>("/api/admin/leads", {
    method: "PATCH",
    body: JSON.stringify({ id, ...changes })
  });
}

export async function getAdminOrder(orderId: string): Promise<Order> {
  return request<Order>(`/api/admin/orders/${orderId}`);
}

export async function updateAdminStatus(
  orderId: string,
  status: OrderStatus,
  notes?: string
): Promise<Order> {
  return request<Order>(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes })
  });
}

export async function addReviewNote(orderId: string, author: string, note: string): Promise<ReviewNote> {
  return request<ReviewNote>(`/api/admin/orders/${orderId}/review-notes`, {
    method: "POST",
    body: JSON.stringify({ author, note })
  });
}

export async function addPaymentNote(
  orderId: string,
  noteType: PaymentNoteType,
  paymentStatus: PaymentStatus,
  note: string,
  receipt?: File | null
): Promise<Order> {
  const form = new FormData();
  form.append("note_type", noteType);
  form.append("payment_status", paymentStatus);
  form.append("note", note);
  if (receipt) {
    form.append("receipt", receipt);
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/orders/${orderId}/payment-notes`, {
    method: "POST",
    headers: authHeaders(),
    body: form
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? response.statusText);
  }

  return response.json() as Promise<Order>;
}

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}
