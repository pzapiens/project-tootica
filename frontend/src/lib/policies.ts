/**
 * Terms & Conditions and Privacy Policy content for Tootica, shown on first
 * login (see {@link ResetPasswordPopup}) before the user accepts them.
 *
 * These are written for the **staff** who use the platform — clinic admins,
 * doctors and receptionists — since patients never log in. They are tailored to
 * what Tootica actually does (multi-tenant dental practice management: patient
 * records, appointments, email + WhatsApp communication) and are drafted for an
 * India-based deployment.
 *
 * NOTE: This is a sensible starting draft, not legal advice. Before go-live,
 * have it reviewed by a qualified lawyer and fill in the real operating entity,
 * address and grievance-officer contact in the `Contact` sections below.
 */

export type PolicySection = { heading: string; body: string[] };

/** Shown at the top of both policies. Update when the text materially changes. */
export const POLICY_EFFECTIVE_DATE = "17 October 2026";

export const TERMS_SECTIONS: PolicySection[] = [
  {
    heading: "1. Acceptance of these Terms",
    body: [
      "These Terms & Conditions (“Terms”) govern your access to and use of Tootica, a dental practice management platform (the “Service”). By ticking the acceptance box, logging in, or otherwise using the Service, you confirm that you have read, understood, and agree to be bound by these Terms and by our Privacy Policy. If you do not agree, you must not use the Service.",
      "You are accepting these Terms on your own behalf and, where applicable, on behalf of the clinic that authorised your account.",
    ],
  },
  {
    heading: "2. About the Service",
    body: [
      "Tootica is a multi-tenant platform that helps dental clinics manage branches, staff, patients, appointments and related records. Access is role-based: clinic administrators, doctors and receptionists each see only the information appropriate to their role and branch.",
      "The Service is a management and administrative tool only. It does not provide medical or dental advice, diagnosis or treatment, and must not be relied upon as a substitute for professional clinical judgement.",
    ],
  },
  {
    heading: "3. Your account",
    body: [
      "Your account is created for you by your clinic administrator or a platform administrator. On first login you are required to set a new password and accept these Terms. Your account is personal to you and may not be shared, transferred or used by anyone else.",
      "You are responsible for keeping your login credentials confidential and for all activity that occurs under your account. You must notify your administrator immediately if you suspect any unauthorised access or use.",
    ],
  },
  {
    heading: "4. Acceptable use",
    body: [
      "You agree to use the Service only for legitimate clinic operations and only for the purposes permitted by your role. You must provide accurate, complete and up-to-date information whenever required, and keep patient and clinic records accurate to the best of your knowledge.",
      "You must not: access or attempt to access data outside your authorised role or branch; copy, extract or export data except as needed for your clinic’s legitimate purposes; interfere with, disrupt, probe or attempt to circumvent the security or operation of the Service; or use the Service in any way that is unlawful, misleading, or that infringes the rights of others.",
    ],
  },
  {
    heading: "5. Patient data and confidentiality",
    body: [
      "Through the Service you may access sensitive personal and health information about patients. You must treat all such information as strictly confidential, access it only when you have a genuine clinical or administrative need, and handle it in accordance with applicable laws, professional obligations and your clinic’s policies.",
      "You must not disclose patient information to any person who is not authorised to receive it, and you must not use patient information for any purpose unrelated to the care and administration provided by your clinic.",
    ],
  },
  {
    heading: "6. Communications",
    body: [
      "The Service may send messages on your clinic’s behalf — for example appointment-related emails and WhatsApp messages to patients, and one-time passwords for account security. You are responsible for ensuring that any content you create or trigger through these channels is accurate and appropriate, and that the clinic has a lawful basis to contact the recipient.",
    ],
  },
  {
    heading: "7. Intellectual property",
    body: [
      "The Service, including its software, design, text and branding, is owned by Tootica or its licensors and is protected by applicable intellectual-property laws. You are granted a limited, non-exclusive, non-transferable right to use the Service for your clinic’s internal operations for as long as your account remains active. Patient and clinic records that your clinic enters remain the responsibility and property of the clinic.",
    ],
  },
  {
    heading: "8. Availability and changes",
    body: [
      "We aim to keep the Service available and reliable, but we do not guarantee uninterrupted or error-free operation. We may update, modify, suspend or discontinue features of the Service, and we may perform maintenance that temporarily limits access, with reasonable notice where practicable.",
    ],
  },
  {
    heading: "9. Suspension and termination",
    body: [
      "Your clinic administrator or a platform administrator may suspend or delete your account — for example when you change roles or leave the clinic. We may also suspend or restrict access where we reasonably believe these Terms have been breached or where necessary to protect patients, the clinic or the Service. On termination your right to use the Service ends, though records within the clinic’s account may be retained as described in the Privacy Policy.",
    ],
  },
  {
    heading: "10. Disclaimers and limitation of liability",
    body: [
      "The Service is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, we disclaim all implied warranties and are not liable for clinical decisions, for the accuracy of information entered by users, or for indirect or consequential loss. Nothing in these Terms limits any liability that cannot be excluded under applicable law.",
    ],
  },
  {
    heading: "11. Governing law",
    body: [
      "These Terms are governed by the laws of India, and the courts having jurisdiction at the operator’s registered place of business will have exclusive jurisdiction over any disputes, subject to applicable law.",
    ],
  },
  {
    heading: "12. Changes to these Terms",
    body: [
      "We may update these Terms from time to time. When we make material changes we will update the effective date shown above and, where appropriate, ask you to accept the updated Terms. Your continued use of the Service after an update means you accept the revised Terms.",
    ],
  },
  {
    heading: "13. Contact",
    body: [
      "For questions about these Terms, contact the Tootica team at support@tootica.com. (Replace with your operating entity, registered address and support contact before go-live.)",
    ],
  },
];

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: "1. Introduction",
    body: [
      "This Privacy Policy explains how Tootica (“we”, “us”) collects, uses, shares and protects personal information when you use the Service as a staff member of a clinic. We are committed to protecting your information and the information of the patients your clinic serves, and to handling it in accordance with applicable data-protection laws, including India’s Digital Personal Data Protection Act, 2023.",
      "Your clinic decides what patient information is collected and why, and so acts as the controller (data fiduciary) of that information. Tootica processes it on the clinic’s behalf to provide the Service.",
    ],
  },
  {
    heading: "2. Information we collect",
    body: [
      "Account information: your name, email address, role, and the clinic and branch you belong to, together with your password (stored only in encrypted/hashed form) and security codes used for login and password reset.",
      "Clinic and patient information entered into the Service: patient names and contact details, appointment details, medical and dental history, treatment notes, and related records that staff record as part of running the clinic.",
      "Communications data: appointment-related messages sent by email or WhatsApp, including inbound WhatsApp booking requests and the phone numbers involved.",
      "Technical data: session cookies and basic log information (such as the time of access and actions taken) that are needed to keep you logged in securely and to operate and safeguard the Service.",
    ],
  },
  {
    heading: "3. How we use information",
    body: [
      "We use the information to authenticate and secure your account; to provide the practice-management features you and your clinic use (managing branches, staff, patients, appointments and records); to send appointment and account-related communications; to maintain the security, integrity and availability of the Service; and to comply with legal obligations.",
      "We do not sell personal information, and we do not use patient information for advertising.",
    ],
  },
  {
    heading: "4. Legal basis and consent",
    body: [
      "We process your account information to provide the Service you have been given access to and to meet our legitimate operational and legal obligations. Patient information is processed on the instructions of, and under the lawful basis established by, your clinic. By accepting this Policy you consent to the processing of your own account information as described here.",
    ],
  },
  {
    heading: "5. Sharing and disclosure",
    body: [
      "Within the Service, information is visible only to authorised users according to their role and branch. We share information with trusted service providers who help us run the Service — for example hosting, email delivery, and messaging providers used to send WhatsApp and one-time-password messages — and only to the extent needed to perform those services.",
      "We may disclose information where required by law, regulation or valid legal process, or to protect the rights, safety and security of patients, clinics, our users or the Service.",
    ],
  },
  {
    heading: "6. Data security",
    body: [
      "We take reasonable technical and organisational measures to protect information against unauthorised access, loss or misuse. These include encrypted storage of passwords, access controls that limit data to authorised roles, secure session handling, and transmission over secure connections. No system is completely secure, so we also rely on you to keep your credentials confidential and to report any suspected incident promptly.",
    ],
  },
  {
    heading: "7. Data retention",
    body: [
      "We retain information for as long as your clinic’s account is active and as needed to provide the Service, and thereafter only as required to meet legal, regulatory, accounting or legitimate record-keeping obligations. Patient records are retained according to the clinic’s instructions and applicable medical record-keeping requirements. When information is no longer needed it is deleted or anonymised.",
    ],
  },
  {
    heading: "8. Your rights",
    body: [
      "Subject to applicable law, you have the right to access the personal information we hold about you, to request correction of inaccurate information, to withdraw consent, and to raise a grievance about how your information is handled. Requests relating to patient information should be directed to the clinic that controls that information. To exercise your rights, use the contact details below.",
    ],
  },
  {
    heading: "9. Cookies and sessions",
    body: [
      "The Service uses strictly necessary cookies to keep you securely signed in and to operate core functionality. These are essential to the Service and are not used for advertising or cross-site tracking.",
    ],
  },
  {
    heading: "10. Patients and minors",
    body: [
      "Patients, including minors, do not log in to the Service; their information is entered and managed by clinic staff. Where patient information relates to a minor, the clinic is responsible for ensuring the appropriate consent of a parent or lawful guardian under applicable law.",
    ],
  },
  {
    heading: "11. Changes to this Policy",
    body: [
      "We may update this Privacy Policy from time to time. When we make material changes we will update the effective date shown above and, where appropriate, ask you to review the updated Policy. Please check this Policy periodically.",
    ],
  },
  {
    heading: "12. Contact and grievances",
    body: [
      "For questions, requests or complaints about this Privacy Policy or your information, contact us at privacy@tootica.com. (Replace with your operating entity, registered address and the name and contact of your designated grievance officer before go-live.)",
    ],
  },
];
