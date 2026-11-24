import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireSession, isStaffRole } from '@/lib/server/auth';
import { apiErrorResponse, ApiError } from '@/lib/server/http';
import { mysqlPool, queryRows } from '@/lib/server/mysql';

export const runtime = 'nodejs';

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
        quantity: number;
        page_count: number | null;
        total_amount: string | number;
        location_charge: string | number;
        service_location_address: string | null;
        status: string;
        created_at: Date;
      } & import('mysql2/promise').RowDataPacket
    >(mysqlPool,
      `SELECT ID, order_number, user_id, customer_name, service_name_snapshot,
              paper_size, quantity, page_count, total_amount, location_charge,
              service_location_address, status, created_at
       FROM tbl_print_order WHERE order_number = ? LIMIT 1`,
      [orderId]);
    const order = rows[0];
    if (!order) throw new ApiError(404, 'Order not found.');
    if (!isStaffRole(user.role) && order.user_id !== user.id) {
      throw new ApiError(403, 'You are not allowed to download this agreement.');
    }

    const settingRows = await queryRows<{ setting_value: string } & import('mysql2/promise').RowDataPacket>(
      mysqlPool,
      'SELECT setting_value FROM tbl_app_setting WHERE setting_key = ? LIMIT 1',
      ['agreement_threshold'],
    );
    const threshold = Number(settingRows[0]?.setting_value ?? 5000);
    const total = Number(order.total_amount);
    const eligibleStatuses = new Set(['In Pre-Press', 'In Production', 'Ready for Pickup', 'Completed']);
    if (!eligibleStatuses.has(order.status) || total < threshold) {
      throw new ApiError(409, 'This order is not currently eligible for a Service Order Agreement.');
    }

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
      `Quantity: ${order.quantity}${order.page_count ? `; Pages: ${order.page_count}` : ''}`,
      `Service Location: ${order.service_location_address || 'Stored profile address'}`,
      `Location Charge: PHP ${Number(order.location_charge).toFixed(2)}`,
      `Order Amount: PHP ${total.toFixed(2)}`,
      '',
      'Terms: The parties confirm the saved order specifications and amount.',
      'NETSO may proceed only after production authorization.',
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
