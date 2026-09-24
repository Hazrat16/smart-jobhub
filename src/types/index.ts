export interface ExperienceItem {
  _id?: string;
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

export interface EducationItem {
  _id?: string;
  school: string;
  degree: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  current?: boolean;
  description?: string;
}

export interface ProfileCompleteness {
  percent: number;
  sections: {
    basics: boolean;
    summary: boolean;
    skills: boolean;
    experience: boolean;
    education: boolean;
    resume: boolean;
    links: boolean;
  };
  missingTips: string[];
}

export interface UserProfile {
  headline?: string;
  bio?: string;
  phone?: string;
  location?: string;
  skills?: string[];
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  resumeUrl?: string;
  experience?: ExperienceItem[];
  education?: EducationItem[];
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: "jobseeker" | "employer" | "admin";
  isVerified: boolean;
  photo?: string;
  profile?: UserProfile;
  /** Present when role is jobseeker; computed on the server from profile fields. */
  profileCompleteness?: ProfileCompleteness | null;
  createdAt?: string;
  updatedAt?: string;
  isSuspended?: boolean;
  suspendedAt?: string;
  deletedAt?: string;
}

export interface Job {
  _id: string;
  title: string;
  company: string;
  location: string;
  type: "full-time" | "part-time" | "contract" | "internship";
  salary: {
    min: number;
    max: number;
    currency: string;
  };
  description: string;
  skills?: string[];
  requirements: string[];
  benefits: string[];
  employer: User;
  applications: JobApplication[];
  /** Set on employer “my jobs” list from the server. */
  applicationCount?: number;
  status: "active" | "closed" | "draft";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface DataDeletionRequest {
  _id: string;
  userId: string | Pick<User, "_id" | "name" | "email" | "role">;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "processed";
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string | Pick<User, "_id" | "name" | "email">;
  createdAt: string;
  updatedAt: string;
}

export interface JobApplication {
  _id: string;
  job: Pick<Job, "_id" | "title" | "company" | "status"> & { employer?: string };
  applicant: User;
  resume: string;
  coverLetter?: string;
  status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
  statusHistory?: Array<{
    status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
    changedAt: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  /** Set via account-type UI before submit */
  role?: "jobseeker" | "employer";
  photo?: File;
}

/** Register form fields handled by react-hook-form (role is separate state). */
export type RegisterFormFields = Pick<
  RegisterCredentials,
  "name" | "email" | "password" | "confirmPassword"
>;

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
  confirmPassword: string;
}

export type NotificationType =
  | "application_received"
  | "application_status"
  | "job_closing_soon";
export type NotificationPreferenceKey =
  | "applicationReceived"
  | "applicationStatus"
  | "jobClosingSoon";

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  href?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  _id: string;
  userId: string;
  inApp: Record<NotificationPreferenceKey, boolean>;
  email: Record<NotificationPreferenceKey, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  id: string;
  isCurrent: boolean;
  userAgent: string;
  ipAddress: string;
  lastUsedAt: string | null;
  createdAt: string | null;
  expiresAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
  error?: string;
  details?: unknown;
  requestId?: string;
  meta?: {
    unreadCount?: number;
    [key: string]: unknown;
  };
}

export type PaymentStatus = "pending" | "completed" | "failed" | "cancelled";

export interface Payment {
  _id: string;
  user: string;
  tranId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  purpose?: string;
  valId?: string;
  sessionKey?: string;
  bankTranId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SslCommerzInitData {
  gatewayUrl: string;
  tranId: string;
}

export interface ResumeFitBilingualText {
  en: string;
  bn: string;
}

export interface ResumeFitBilingualLists {
  en: string[];
  bn: string[];
}

export interface ResumeFitAnalysis {
  matchPercent: number;
  atsScore: {
    overall: number;
    keywordAlignment: number;
    structureClarity: number;
    roleFitSummary: ResumeFitBilingualText;
  };
  missingSkills: ResumeFitBilingualLists;
  suggestions: ResumeFitBilingualLists;
  summary: ResumeFitBilingualText;
  rejectionLikelyReasons: ResumeFitBilingualLists;
}

export interface ResumeFitRewrite {
  improvedCv: ResumeFitBilingualText;
  changeHighlights: ResumeFitBilingualLists;
}

export interface ActivitySummaryEntry {
  key: string;
  count: number;
}

export interface ActivityEventRecord {
  event: string;
  timestamp: number;
  path: string;
  href?: string;
  role?: string;
  userId?: string | null;
  properties?: Record<string, unknown>;
}

export interface ActivityTrendPoint {
  label: string;
  timestamp: number;
  count: number;
}

export interface ActivitySummary {
  totals: {
    events: number;
    uniquePaths: number;
    uniqueRoles: number;
  };
  byEvent: ActivitySummaryEntry[];
  byPath: ActivitySummaryEntry[];
  byRole: ActivitySummaryEntry[];
  trend24h: ActivityTrendPoint[];
  recent: ActivityEventRecord[];
}

export interface ExternalJobPosting {
  _id: string;
  sourceCompanyKey: string;
  companyName: string;
  title: string;
  location: string;
  employmentType?: string;
  applyUrl: string;
  sourceUrl: string;
  descriptionSnippet?: string;
  datePosted?: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalJobSource {
  _id: string;
  companyKey: string;
  companyName: string;
  careersUrl: string;
  phase: number;
  enabled: boolean;
  parserType: "json_ld";
  crawlIntervalMinutes: number;
  lastCrawledAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RemoteJobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "remotive" | "arbeitnow" | "remoteok" | "themuse";
  tags: string[];
  publishedAt?: string;
  salary?: string;
}

export interface ChatUserRef {
  _id?: string;
  id?: string;
  name?: string;
  photo?: string;
  email?: string;
}

export interface ChatMessage {
  _id: string;
  senderId: ChatUserRef | string;
  receiverId: ChatUserRef | string;
  message: string;
  messageType: "text" | "image" | "file" | "audio" | "video";
  timestamp: string;
  isRead: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  attachments?: string[];
}

export interface ChatConversationSummary {
  id: string;
  otherParticipant: ChatUserRef;
  lastMessage?: { message?: string; timestamp?: string } | null;
  lastMessageAt?: string;
  unreadCount: number;
  isGroupChat: boolean;
}

export interface ChatConversationDetail {
  conversation: {
    id: string;
    participants: string[];
    lastMessageAt?: string;
    unreadCount: number;
  };
  messages: ChatMessage[];
}

/** Live event payload pushed over the socket when a new message arrives (see
 * WebSocketService.handleSendMessage on the backend). */
export interface LiveChatMessage {
  clientMessageId: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: ChatMessage["messageType"];
  timestamp: string;
}
