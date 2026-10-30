CREATE TABLE "whatsapp_connections" (
 "id" UUID NOT NULL, "clinic_id" UUID NOT NULL, "waba_id" TEXT NOT NULL,
 "phone_number_id" TEXT NOT NULL, "display_number" TEXT NOT NULL, "encrypted_token" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'CONNECTED', "template_name" TEXT NOT NULL,
 "template_language" TEXT NOT NULL, "template_body" TEXT NOT NULL, "template_parameters" INTEGER NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "whatsapp_connections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "whatsapp_connections_clinic_id_key" ON "whatsapp_connections"("clinic_id");
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_key" ON "whatsapp_connections"("phone_number_id");
CREATE TABLE "whatsapp_messages" (
 "id" UUID NOT NULL, "clinic_id" UUID NOT NULL, "appointment_id" UUID,
 "sent_by_user_id" UUID NOT NULL, "connection_id" UUID NOT NULL,
 "request_key" UUID NOT NULL, "request_hash" TEXT NOT NULL, "recipient" TEXT NOT NULL,
 "template_name" TEXT NOT NULL, "template_language" TEXT NOT NULL, "parameters" JSONB NOT NULL,
 "consent_confirmed_at" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "meta_message_id" TEXT, "error_code" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "whatsapp_messages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "whatsapp_messages_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "whatsapp_messages_clinic_id_request_key_key" ON "whatsapp_messages"("clinic_id", "request_key");
CREATE INDEX "whatsapp_messages_clinic_id_created_at_idx" ON "whatsapp_messages"("clinic_id", "created_at");
CREATE INDEX "whatsapp_messages_clinic_id_appointment_id_idx" ON "whatsapp_messages"("clinic_id", "appointment_id");
