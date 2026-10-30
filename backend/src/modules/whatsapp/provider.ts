import { HttpError } from '../../common/utils/httpError';
export class MetaSendError extends Error {
  constructor(
    public readonly code: string,
    public readonly uncertain: boolean,
  ) {
    super('WhatsApp submission failed');
  }
}
export async function graphRequest(
  path: string,
  token: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid WHATSAPP_GRAPH_VERSION');
  let response: Response;
  try {
    response = await fetcher(`https://graph.facebook.com/${version}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new MetaSendError('NETWORK_OR_TIMEOUT', true);
  }
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new MetaSendError('INVALID_RESPONSE', true);
  }
  if (!response.ok || data.error) {
    const error = data.error as { code?: number } | undefined;
    // Never forward raw Meta errors: they may include recipient or credential details.
    throw new MetaSendError(String(error?.code ?? response.status), response.status >= 500);
  }
  return data;
}
export interface ApprovedTemplate {
  name: string;
  language: string;
  status: string;
  parameter_format?: string;
  components: { type: string; text?: string; format?: string }[];
}
export function templateDetails(template: ApprovedTemplate): {
  body: string;
  parameterCount: number;
} {
  if (template.status !== 'APPROVED' || template.parameter_format === 'NAMED')
    throw new HttpError(400, 'Select an approved template with positional body parameters');
  const body = template.components.find((c) => c.type === 'BODY')?.text;
  if (
    !body ||
    template.components.some(
      (c) =>
        !['BODY', 'HEADER', 'FOOTER'].includes(c.type) ||
        (c.type === 'HEADER' && (c.format !== 'TEXT' || /{{/.test(c.text ?? ''))),
    )
  ) {
    throw new HttpError(
      400,
      'Phase 1 supports body templates with optional static text header/footer; media and buttons are not supported',
    );
  }
  const numbers = [...new Set([...body.matchAll(/{{(\d+)}}/g)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
  if (
    numbers.length > 10 ||
    numbers.some((n, i) => n !== i + 1) ||
    /{{/.test(body.replace(/{{\d+}}/g, ''))
  ) {
    throw new HttpError(
      400,
      'Template must use consecutive positional parameters {{1}} through {{10}}',
    );
  }
  return { body, parameterCount: numbers.length };
}
export async function verifyConnection(input: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
}) {
  let after: string | undefined;
  let displayNumber: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await graphRequest(
      `${input.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100${after ? '&after=' + encodeURIComponent(after) : ''}`,
      input.accessToken,
    );
    const phone = (result.data as { id: string; display_phone_number: string }[] | undefined)?.find(
      (p) => p.id === input.phoneNumberId,
    );
    if (phone) {
      displayNumber = phone.display_phone_number;
      break;
    }
    const paging = result.paging as { next?: string; cursors?: { after?: string } } | undefined;
    if (!paging?.next || !paging.cursors?.after) break;
    after = paging.cursors.after;
  }
  if (!displayNumber)
    throw new HttpError(400, 'Phone number is not accessible under this WhatsApp Business Account');
  const result = await graphRequest(
    `${input.wabaId}/message_templates?name=${encodeURIComponent(input.templateName)}&fields=name,language,status,components,parameter_format&limit=100`,
    input.accessToken,
  );
  const template = (result.data as ApprovedTemplate[] | undefined)?.find(
    (t) => t.name === input.templateName && t.language === input.templateLanguage,
  );
  if (!template) throw new HttpError(400, 'Template language/name was not found in this account');
  return { displayNumber, ...templateDetails(template) };
}
export async function sendTemplate(
  connection: { phoneNumberId: string; templateName: string; templateLanguage: string },
  token: string,
  recipient: string,
  parameters: string[],
) {
  const data = await graphRequest(`${connection.phoneNumberId}/messages`, token, {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: connection.templateName,
      language: { code: connection.templateLanguage },
      ...(parameters.length
        ? {
            components: [
              { type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) },
            ],
          }
        : {}),
    },
  });
  const id = (data.messages as { id?: string }[] | undefined)?.[0]?.id;
  if (!id) throw new MetaSendError('MISSING_MESSAGE_ID', true);
  return id;
}
