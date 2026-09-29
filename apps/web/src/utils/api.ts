import { sanitizeJob } from "@/lib/sanitizeJob";
import {
  ActivitySummary,
  ApiResponse,
  AuthResponse,
  ChatConversationDetail,
  ChatConversationSummary,
  ChatMessage,
  Company,
  CompanyDetail,
  DataDeletionRequest,
  ExternalJobPosting,
  ExternalJobSource,
  ForgotPasswordData,
  Job,
  JobApplication,
  Notification,
  LoginCredentials,
  NotificationPreferences,
  Payment,
  RemoteJobListing,
  ResetPasswordData,
  ResumeFitAnalysis,
  ResumeFitRewrite,
  SessionInfo,
  SslCommerzInitData,
  User,
} from "@/types";
import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  return "http://127.0.0.1:5000/api";
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem("token");
  if (!t || t === "undefined" || t === "null") return null;
  return t;
}

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.client = axios.create({
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      config.baseURL = resolveApiBaseUrl();
      const token = readStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle token expiration
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (!axios.isAxiosError(error)) return Promise.reject(error);
        const original = error.config as
          | (InternalAxiosRequestConfig & { _retry?: boolean })
          | undefined;
        const status = error.response?.status;
        const url = original?.url || "";
        const isAuthRoute = /^\/auth\/(login|register|forgot-password|reset-password|refresh|verify-email)/.test(
          url,
        );

        if (status === 401 && original && !original._retry && !isAuthRoute) {
          original._retry = true;
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            const latest = readStoredToken();
            if (latest) {
              original.headers.Authorization = `Bearer ${latest}`;
            }
            return this.client(original);
          }
          this.handleAuthExpired();
        }
        return Promise.reject(error);
      },
    );
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const response = await this.client.post("/auth/refresh");
        const normalized =
          this.normalizeResponse<AuthResponse>(response.data);
        if (!normalized.success || !normalized.data?.token || !normalized.data?.user) {
          return false;
        }
        setAuthToken(normalized.data.token);
        setUser(normalized.data.user);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private handleAuthExpired() {
    if (typeof window === "undefined") return;
    removeAuthToken();
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    const current = `${window.location.pathname}${window.location.search}`;
    const redirect =
      current && current !== "/login" ? `?redirect=${encodeURIComponent(current)}` : "";
    window.location.href = `/login${redirect}`;
  }

  private normalizeResponse<T>(payload: unknown): ApiResponse<T> {
    const data = payload as
      | ApiResponse<T>
      | {
          error?: string;
          message?: string;
          code?: string;
          details?: unknown;
          requestId?: string;
          token?: string;
          user?: unknown;
        };

    if (typeof data === "object" && data !== null && "success" in data) {
      return data as ApiResponse<T>;
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "token" in data &&
      "user" in data
    ) {
      return {
        success: true,
        message: "Request successful",
        data: data as T,
      };
    }

    if (typeof data === "object" && data !== null && "error" in data) {
      return {
        success: false,
        code: data.code,
        message: (data.error as string) || "Request failed",
        details: data.details,
        requestId: data.requestId,
      };
    }

    return {
      success: true,
      message: "Request successful",
      data: data as T,
    };
  }

  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data as
        | {
            error?: string;
            message?: string;
            code?: string;
            requestId?: string;
          }
        | undefined;
      return (
        payload?.message || payload?.error || error.message || "Request failed"
      );
    }
    if (error instanceof Error) return error.message;
    return "Request failed";
  }

  // Auth endpoints
  async register(data: FormData): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.client.post("/auth/register", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return this.normalizeResponse<AuthResponse>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async login(
    credentials: LoginCredentials,
  ): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.client.post("/auth/login", credentials);
      return this.normalizeResponse<AuthResponse>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/auth/logout");
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async logoutAll(): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/auth/logout-all");
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async forgotPassword(data: ForgotPasswordData): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/auth/forgot-password", data);
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async resetPassword(data: ResetPasswordData): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/auth/reset-password", data);
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async verifyEmail(token: string): Promise<ApiResponse> {
    try {
      const response = await this.client.get(
        `/auth/verify-email?token=${token}`,
      );
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async uploadProfilePhoto(
    photo: File,
  ): Promise<ApiResponse<{ photo: string; user: User }>> {
    const formData = new FormData();
    formData.append("photo", photo);

    try {
      const response = await this.client.post("/auth/upload-photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return this.normalizeResponse<{ photo: string; user: User }>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getProfile(): Promise<ApiResponse<User>> {
    try {
      const response = await this.client.get("/profile");
      return this.normalizeResponse<User>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getSessions(): Promise<ApiResponse<SessionInfo[]>> {
    try {
      const response = await this.client.get("/profile/sessions");
      return this.normalizeResponse<SessionInfo[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async revokeSession(sessionId: string): Promise<ApiResponse<{ sessionId: string }>> {
    try {
      const response = await this.client.delete(`/profile/sessions/${sessionId}`);
      return this.normalizeResponse<{ sessionId: string }>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateProfile(payload: {
    name?: string;
    profile?: Record<string, unknown>;
  }): Promise<ApiResponse<User>> {
    try {
      const response = await this.client.patch("/profile", payload);
      return this.normalizeResponse<User>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async uploadProfileResume(
    file: File,
  ): Promise<ApiResponse<{ resumeUrl: string; user: User }>> {
    const formData = new FormData();
    formData.append("resume", file);
    try {
      const response = await this.client.post("/profile/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return this.normalizeResponse<{ resumeUrl: string; user: User }>(
        response.data,
      );
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async requestDataDeletion(reason?: string): Promise<ApiResponse<DataDeletionRequest>> {
    try {
      const response = await this.client.post("/profile/data-deletion-request", { reason });
      return this.normalizeResponse<DataDeletionRequest>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  // User endpoints (same as getProfile; kept for backward compatibility)
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.getProfile();
  }

  // Job endpoints (to be implemented when backend adds them)
  async getJobs(params?: Record<string, unknown>): Promise<ApiResponse<Job[]>> {
    try {
      const response = await this.client.get("/jobs", { params });
      const out = this.normalizeResponse<Job[]>(response.data);
      if (out.success && out.data) {
        out.data = out.data.map((j) => sanitizeJob(j));
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getMyJobs(): Promise<ApiResponse<Job[]>> {
    try {
      const response = await this.client.get("/jobs/mine");
      const out = this.normalizeResponse<Job[]>(response.data);
      if (out.success && out.data) {
        out.data = out.data.map((j) => sanitizeJob(j));
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getJob(id: string): Promise<ApiResponse<Job>> {
    try {
      const response = await this.client.get(`/jobs/${id}`);
      const out = this.normalizeResponse<Job>(response.data);
      if (out.success && out.data) {
        out.data = sanitizeJob(out.data);
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async createJob(jobData: Partial<Job>): Promise<ApiResponse<Job>> {
    try {
      const response = await this.client.post("/jobs", jobData);
      const out = this.normalizeResponse<Job>(response.data);
      if (out.success && out.data) {
        out.data = sanitizeJob(out.data);
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateJob(
    id: string,
    jobData: Partial<Job>,
  ): Promise<ApiResponse<Job>> {
    try {
      const response = await this.client.put(`/jobs/${id}`, jobData);
      const out = this.normalizeResponse<Job>(response.data);
      if (out.success && out.data) {
        out.data = sanitizeJob(out.data);
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateJobStatus(
    id: string,
    status: "draft" | "active" | "closed" | "published",
  ): Promise<ApiResponse<Job>> {
    try {
      const response = await this.client.patch(`/jobs/${id}/status`, { status });
      const out = this.normalizeResponse<Job>(response.data);
      if (out.success && out.data) {
        out.data = sanitizeJob(out.data);
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async deleteJob(id: string): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`/jobs/${id}`);
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  // Job Application endpoints
  async applyForJob(
    jobId: string,
    applicationData: FormData,
  ): Promise<ApiResponse<JobApplication>> {
    try {
      const response = await this.client.post(
        `/jobs/${jobId}/apply`,
        applicationData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return this.normalizeResponse<JobApplication>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getMyApplications(): Promise<ApiResponse<JobApplication[]>> {
    try {
      const response = await this.client.get("/applications");
      return this.normalizeResponse<JobApplication[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getJobApplications(
    jobId: string,
  ): Promise<ApiResponse<JobApplication[]>> {
    try {
      const response = await this.client.get(`/jobs/${jobId}/applications`);
      return this.normalizeResponse<JobApplication[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateApplicationStatus(
    applicationId: string,
    status: string,
  ): Promise<ApiResponse<JobApplication>> {
    try {
      const response = await this.client.patch(
        `/applications/${applicationId}`,
        {
          status,
        },
      );
      return this.normalizeResponse<JobApplication>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getSavedJobs(): Promise<ApiResponse<Job[]>> {
    try {
      const response = await this.client.get("/saved-jobs");
      return this.normalizeResponse<Job[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async saveJob(jobId: string): Promise<ApiResponse<{ jobId: string }>> {
    try {
      const response = await this.client.post("/saved-jobs", { jobId });
      return this.normalizeResponse<{ jobId: string }>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async unsaveJob(jobId: string): Promise<ApiResponse<{ jobId: string }>> {
    try {
      const response = await this.client.delete(`/saved-jobs/${jobId}`);
      return this.normalizeResponse<{ jobId: string }>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getNotifications(params?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<ApiResponse<Notification[]>> {
    try {
      const response = await this.client.get("/notifications", { params });
      return this.normalizeResponse<Notification[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async markNotificationRead(
    notificationId: string,
  ): Promise<ApiResponse<Notification>> {
    try {
      const response = await this.client.patch(
        `/notifications/${notificationId}/read`,
      );
      return this.normalizeResponse<Notification>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async markAllNotificationsRead(): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/notifications/read-all");
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getNotificationPreferences(): Promise<ApiResponse<NotificationPreferences>> {
    try {
      const response = await this.client.get("/notifications/preferences");
      return this.normalizeResponse<NotificationPreferences>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateNotificationPreferences(payload: {
    inApp?: Partial<NotificationPreferences["inApp"]>;
    email?: Partial<NotificationPreferences["email"]>;
  }): Promise<ApiResponse<NotificationPreferences>> {
    try {
      const response = await this.client.patch("/notifications/preferences", payload);
      return this.normalizeResponse<NotificationPreferences>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async initSslCommerzPayment(
    amount: number,
  ): Promise<ApiResponse<SslCommerzInitData>> {
    try {
      const response = await this.client.post("/payments/sslcommerz/init", {
        amount,
      });
      return this.normalizeResponse<SslCommerzInitData>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async initJobBoostPayment(
    jobId: string,
    boostDays: number,
  ): Promise<ApiResponse<SslCommerzInitData>> {
    try {
      const response = await this.client.post("/payments/sslcommerz/init", {
        purpose: "job_boost",
        jobId,
        boostDays,
      });
      return this.normalizeResponse<SslCommerzInitData>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getMyPayments(): Promise<ApiResponse<Payment[]>> {
    try {
      const response = await this.client.get("/payments/me");
      return this.normalizeResponse<Payment[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async analyzeResumeFit(formData: FormData): Promise<ApiResponse<ResumeFitAnalysis>> {
    try {
      const response = await this.client.post("/resume-fit/analyze", formData, {
        transformRequest: [
          (data, headers) => {
            if (data instanceof FormData) {
              delete headers["Content-Type"];
            }
            return data;
          },
        ],
      });
      return this.normalizeResponse<ResumeFitAnalysis>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async rewriteResumeFit(payload: {
    resumeText: string;
    jobDescription?: string;
    jobId?: string;
  }): Promise<ApiResponse<ResumeFitRewrite>> {
    try {
      const response = await this.client.post("/resume-fit/rewrite", payload);
      return this.normalizeResponse<ResumeFitRewrite>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminListUsers(): Promise<ApiResponse<User[]>> {
    try {
      const response = await this.client.get("/admin/users");
      return this.normalizeResponse<User[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminModerateUser(
    id: string,
    action: "suspend" | "unsuspend" | "soft_delete" | "promote_to_admin",
  ): Promise<ApiResponse<User>> {
    try {
      const response = await this.client.patch(`/admin/users/${id}`, { action });
      return this.normalizeResponse<User>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminListJobs(): Promise<ApiResponse<Job[]>> {
    try {
      const response = await this.client.get("/admin/jobs");
      const out = this.normalizeResponse<Job[]>(response.data);
      if (out.success && out.data) {
        out.data = out.data.map((j) => sanitizeJob(j));
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminModerateJob(
    id: string,
    action: "close" | "soft_delete" | "restore",
  ): Promise<ApiResponse<Job>> {
    try {
      const response = await this.client.patch(`/admin/jobs/${id}`, { action });
      const out = this.normalizeResponse<Job>(response.data);
      if (out.success && out.data) {
        out.data = sanitizeJob(out.data);
      }
      return out;
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminListDeletionRequests(): Promise<ApiResponse<DataDeletionRequest[]>> {
    try {
      const response = await this.client.get("/admin/deletion-requests");
      return this.normalizeResponse<DataDeletionRequest[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminReviewDeletionRequest(
    id: string,
    status: "approved" | "rejected" | "processed",
  ): Promise<ApiResponse<DataDeletionRequest>> {
    try {
      const response = await this.client.patch(`/admin/deletion-requests/${id}`, { status });
      return this.normalizeResponse<DataDeletionRequest>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getActivitySummary(params?: {
    userId?: string;
    role?: "jobseeker" | "employer" | "admin";
  }): Promise<ApiResponse<ActivitySummary>> {
    try {
      const response = await this.client.get("/monitoring/activity", { params });
      return this.normalizeResponse<ActivitySummary>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getExternalJobs(params?: {
    companyKey?: string;
    includeInactive?: boolean;
  }): Promise<ApiResponse<ExternalJobPosting[]>> {
    try {
      const response = await this.client.get("/external-jobs/jobs", { params });
      return this.normalizeResponse<ExternalJobPosting[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getExternalSources(): Promise<ApiResponse<ExternalJobSource[]>> {
    try {
      const response = await this.client.get("/external-jobs/sources");
      return this.normalizeResponse<ExternalJobSource[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async adminSyncExternalJobs(companyKey?: string): Promise<
    ApiResponse<
      Array<{
        source: string;
        fetched: number;
        upserted: number;
        deactivated: number;
        error?: string;
      }>
    >
  > {
    try {
      const response = await this.client.post("/external-jobs/sources/sync", {
        ...(companyKey ? { companyKey } : {}),
      });
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getRemoteJobs(params?: {
    search?: string;
    source?: "remotive" | "arbeitnow" | "remoteok" | "themuse";
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<RemoteJobListing[]>> {
    try {
      const response = await this.client.get("/remote-jobs", { params });
      return this.normalizeResponse<RemoteJobListing[]>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  // Chat endpoints — history/search are REST; sending/typing/presence are socket-based
  // (see @/lib/socket). Responses use a raw {conversations:[...]} / {error:"..."} shape
  // rather than the app-wide {success,data} envelope; normalizeResponse absorbs both.
  async getConversations(): Promise<ApiResponse<{ conversations: ChatConversationSummary[] }>> {
    try {
      const response = await this.client.get("/chat/conversations");
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getConversationWithUser(userId: string): Promise<ApiResponse<ChatConversationDetail>> {
    try {
      const response = await this.client.get(`/chat/conversation/${userId}`);
      return this.normalizeResponse<ChatConversationDetail>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async deleteChatMessage(messageId: string): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`/chat/message/${messageId}`);
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async editChatMessage(
    messageId: string,
    newMessage: string,
  ): Promise<ApiResponse<{ editedMessage: ChatMessage }>> {
    try {
      const response = await this.client.put(`/chat/message/${messageId}`, { newMessage });
      return this.normalizeResponse(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  // Company endpoints
  async createCompany(data: {
    name: string;
    description: string;
    industry: string;
    size?: string;
    website?: string;
    location?: string;
    logoUrl?: string;
  }): Promise<ApiResponse<Company>> {
    try {
      const response = await this.client.post("/companies", data);
      return this.normalizeResponse<Company>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getCompany(idOrSlug: string): Promise<ApiResponse<CompanyDetail>> {
    try {
      const response = await this.client.get(`/companies/${idOrSlug}`);
      return this.normalizeResponse<CompanyDetail>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async getMyCompany(): Promise<ApiResponse<Company>> {
    try {
      const response = await this.client.get("/companies/mine");
      return this.normalizeResponse<Company>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async updateCompany(
    companyId: string,
    data: Partial<
      Pick<Company, "description" | "industry" | "size" | "website" | "location" | "logoUrl">
    >,
  ): Promise<ApiResponse<Company>> {
    try {
      const response = await this.client.patch(`/companies/${companyId}`, data);
      return this.normalizeResponse<Company>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }

  async addCompanyMember(companyId: string, email: string): Promise<ApiResponse<Company>> {
    try {
      const response = await this.client.post(`/companies/${companyId}/members`, { email });
      return this.normalizeResponse<Company>(response.data);
    } catch (error) {
      return { success: false, message: this.extractErrorMessage(error) };
    }
  }
}

export const apiClient = new ApiClient();

/**
 * Components like AppSidebar read auth state once via `getUser()` on mount and
 * hold it in local state — they have no way to know when a *different* part of
 * the app (login page, axios's silent token refresh, another tab) changes
 * localStorage afterward. Every mutator below fires this so any mounted listener
 * can resync immediately instead of showing stale "signed out" UI indefinitely.
 */
export const AUTH_CHANGED_EVENT = "auth:changed";

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

// Helper functions
export const setAuthToken = (token: string) => {
  if (!token || token === "undefined") {
    localStorage.removeItem("token");
    notifyAuthChanged();
    return;
  }
  localStorage.setItem("token", token);
  notifyAuthChanged();
};

export const getAuthToken = () => {
  return readStoredToken();
};

export const removeAuthToken = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  notifyAuthChanged();
};

export const setUser = (user: User) => {
  try {
    const s = JSON.stringify(user);
    if (!s || s === "undefined") {
      localStorage.removeItem("user");
      return;
    }
    localStorage.setItem("user", s);
  } catch {
    localStorage.removeItem("user");
  } finally {
    notifyAuthChanged();
  }
};

export const getUser = (): User | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw || raw === "undefined" || raw === "null") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("_id" in parsed) ||
      !("email" in parsed) ||
      !("role" in parsed)
    ) {
      localStorage.removeItem("user");
      return null;
    }
    return parsed as User;
  } catch {
    localStorage.removeItem("user");
    return null;
  }
};

export const removeUser = () => {
  localStorage.removeItem("user");
  notifyAuthChanged();
};
