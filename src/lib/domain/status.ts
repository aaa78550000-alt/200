import type { AppointmentStatus, ContractStatus, NotificationStatus, PaymentStatus, Role } from "./types";

/** Legal appointment transitions. Mirrors app.allowed_transition() in the DB; the DB is the final judge. */
export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_service", "cancelled"],
  in_service: ["ready_pickup"],
  ready_pickup: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses that occupy the groomer's time (pending does NOT hold a slot). */
export const OCCUPYING: AppointmentStatus[] = ["confirmed", "checked_in", "in_service", "ready_pickup"];
export const IN_SHOP: AppointmentStatus[] = ["checked_in", "in_service", "ready_pickup"];
export const TERMINAL: AppointmentStatus[] = ["completed", "cancelled", "no_show"];

export const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  pending: "待確認",
  confirmed: "已確認",
  checked_in: "已報到",
  in_service: "服務中",
  ready_pickup: "待接回",
  completed: "已完成",
  cancelled: "已取消",
  no_show: "未到店",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "未付款",
  partially_paid: "部分付款",
  paid: "已付清",
  partially_refunded: "部分退款",
  refunded: "已退款",
};

export const CONTRACT_LABEL: Record<ContractStatus, string> = {
  not_required: "不需簽約",
  pending: "待簽署",
  signed: "已簽署",
  superseded: "已被新版取代",
};

export const NOTIFICATION_LABEL: Record<NotificationStatus, string> = {
  queued: "排隊中",
  sent: "已送出",
  failed: "送出失敗",
  not_applicable: "未傳 LINE",
};

/** Progress rail shown in the appointment detail (cancel/no-show are off-rail). */
export const PROGRESS: AppointmentStatus[] = ["pending", "confirmed", "checked_in", "in_service", "ready_pickup", "completed"];

export type Capability =
  | "appointment.confirm"
  | "appointment.create"
  | "appointment.cancel"
  | "appointment.reschedule"
  | "service.progress"
  | "payment.record"
  | "payment.refund"
  | "handover.unpaid_authorize"
  | "finance.view"
  | "settings.manage";

const CAPS: Record<Role, Capability[]> = {
  owner: [
    "appointment.confirm", "appointment.create", "appointment.cancel", "appointment.reschedule",
    "service.progress", "payment.record", "payment.refund", "handover.unpaid_authorize", "finance.view", "settings.manage",
  ],
  manager: [
    "appointment.confirm", "appointment.create", "appointment.cancel", "appointment.reschedule",
    "service.progress", "payment.record", "payment.refund", "handover.unpaid_authorize", "finance.view", "settings.manage",
  ],
  receptionist: [
    "appointment.confirm", "appointment.create", "appointment.cancel", "appointment.reschedule",
    "service.progress", "payment.record", "finance.view",
  ],
  groomer: ["service.progress"],
};

export function can(role: Role, cap: Capability): boolean {
  return CAPS[role].includes(cap);
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "店主",
  manager: "店長",
  groomer: "美容師",
  receptionist: "櫃檯",
};
