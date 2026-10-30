export interface Connection {
  id: string;
  clinicId: string;
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string;
  encryptedToken: string;
  status: string;
  templateName: string;
  templateLanguage: string;
  templateBody: string;
  templateParameters: number;
}
export interface AppointmentContact {
  id: string;
  contactPhone: string | null;
  patient: { phone: string | null; clinicId: string } | null;
}
export interface MessageRecord {
  id: string;
  requestKey: string;
  requestHash: string;
  appointmentId: string | null;
  status: string;
  metaMessageId: string | null;
  errorCode: string | null;
  createdAt: Date;
}
export interface NewMessage {
  clinicId: string;
  appointmentId: string;
  sentByUserId: string;
  connectionId: string;
  requestKey: string;
  requestHash: string;
  recipient: string;
  templateName: string;
  templateLanguage: string;
  parameters: string[];
  consentConfirmedAt: Date;
}
export interface WhatsAppStore {
  usageEnabled(clinicId: string): Promise<boolean>;
  connection(clinicId: string): Promise<Connection | null>;
  appointment(clinicId: string, id: string, branchId?: string): Promise<AppointmentContact | null>;
  actorAllowed(userId: string, clinicId: string): Promise<boolean>;
  recent(clinicId: string, appointmentId: string): Promise<MessageRecord[]>;
  reserve(data: NewMessage): Promise<{ created: boolean; message: MessageRecord }>;
  finish(
    clinicId: string,
    id: string,
    status: string,
    metaMessageId?: string,
    errorCode?: string,
  ): Promise<void>;
}
