import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, isStaffRole } from '@/lib/server/auth';
import { apiErrorResponse, ApiError } from '@/lib/server/http';
import { mysqlPool, queryRows } from '@/lib/server/mysql';
import { isAgreementEligible, loadAgreementRules } from '@/lib/server/agreement';

export const runtime = 'nodejs';

function pdfEscape(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const wrapped: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > width) {
      wrapped.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

function buildSimplePdf(lines: string[]): Buffer {
  const safeLines = lines.slice(0, 45);
  const commands = [
    'BT',
    '/F1 11 Tf',
    '50 790 Td',
    '16 TL',
    ...safeLines.map((line, index) =>
      index === 0
        ? `(${pdfEscape(line)}) Tj`
        : `T* (${pdfEscape(line)}) Tj`,
    ),
    'ET',
  ].join('\n');
  const stream = `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    `5 0 obj\n${stream}\nendobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireSession(request);
    const { orderId } = await context.params;
    if (!orderId) throw new ApiError(400, 'Order reference is invalid.');

    const rows = await queryRows<
      {
        ID: number;
        order_number: string;
        user_id: string | null;
        customer_name: string;
        service_name_snapshot: string;
        paper_size: string | null;
        signage_details_json: string | null;
        quantity: number;
        page_count: number | null;
        total_amount: string | number;
        location_charge: string | number;
        service_location_address: string | null;
        agreement_terms_snapshot: string | null;
        agreement_terms_version_snapshot: string | null;
        status: string;
        created_at: Date;
      } & import('mysql2/promise').RowDataPacket
    >(mysqlPool,
      `SELECT ID, order_number, user_id, customer_name, service_name_snapshot,
              paper_size, signage_details_json, quantity, page_count, total_amount, location_charge,
              service_location_address, agreement_terms_snapshot,
              agreement_terms_version_snapshot, status, created_at
       FROM tbl_print_order WHERE order_number = ? LIMIT 1`,
      [orderId]);
    const order = rows[0];
    if (!order) throw new ApiError(404, 'Order not found.');
    if (!isStaffRole(user.role) && order.user_id !== user.id) {
      throw new ApiError(403, 'You are not allowed to download this agreement.');
    }

    const agreementRules = await loadAgreementRules(mysqlPool);
    const total = Number(order.total_amount);
    // Eligibility rules live in isAgreementEligible (statuses and threshold await client approval).
    if (!isAgreementEligible(
      order.status,
      total,
      agreementRules.threshold,
      agreementRules.statuses,
      Number(order.location_charge),
      agreementRules.includesLocationCharge,
      agreementRules.thresholdInclusive,
    )) {
      throw new ApiError(409, 'This order is not currently eligible for a Service Order Agreement.');
    }

    const paidRows = await queryRows<{ paid: string | number | null } & import('mysql2/promise').RowDataPacket>(
      mysqlPool,
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM tbl_payments WHERE print_order_id = ? AND status = 'verified'",
      [order.ID],
    );
    const paid = Number(paidRows[0]?.paid ?? 0);
    const termRows = await queryRows<
      { setting_key: string; setting_value: string } & import('mysql2/promise').RowDataPacket
    >(
      mysqlPool,
      "SELECT setting_key, setting_value FROM tbl_app_setting WHERE setting_key IN ('agreement_terms', 'agreement_terms_version')",
    );
    const termsText = order.agreement_terms_snapshot?.trim() ||
      termRows.find((row) => row.setting_key === 'agreement_terms')?.setting_value?.trim() ||
      'The parties confirm the saved order specifications and amount. NETSO may proceed only after production authorization.';
    const termsVersion = order.agreement_terms_version_snapshot?.trim() ||
      termRows.find((row) => row.setting_key === 'agreement_terms_version')?.setting_value?.trim() || 'draft';
    const signageDetails = order.signage_details_json
      ? Object.entries(JSON.parse(order.signage_details_json) as Record<string, string>)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')
      : '';
    const created = new Date(order.created_at).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const lines = [
      'SERVICE ORDER AGREEMENT',
      `Order Reference: ${order.order_number}`,
      `Customer: ${order.customer_name}`,
      `Order Date and Time (Philippines): ${created}`,
      `Service: ${order.service_name_snapshot}`,
      `Size: ${order.paper_size || 'As specified'}`,
      ...(signageDetails ? [`Signage Specifications: ${signageDetails}`] : []),
      `Quantity: ${order.quantity}${order.page_count ? `; Pages: ${order.page_count}` : ''}`,
      `Service Location: ${order.service_location_address || 'Stored profile address'}`,
      `Location Charge: PHP ${Number(order.location_charge).toFixed(2)}`,
      `Order Amount: PHP ${total.toFixed(2)}`,
      `Payment Status: PHP ${paid.toFixed(2)} paid; balance PHP ${Math.max(0, total - paid).toFixed(2)}`,
      '',
      `Terms (version ${termsVersion}):`,
      ...wrapText(termsText, 85),
      'Order details above are taken from the saved order record.',
      '',
      'Customer Signature: ____________________    Date: __________',
      'NETSO Signature: ______________________    Date: __________',
      '',
      'Document for signature. This document is not a receipt.',
    ];
    const pdf = buildSimplePdf(lines);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="NETSO-Service-Order-${order.order_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
