export type AgreementDownloadResult = { ok: true } | { ok: false; error: string };

export async function downloadAgreement(orderId: string): Promise<AgreementDownloadResult> {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/agreement`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      let message = 'The agreement could not be generated.';
      try {
        const body = await response.json();
        if (body?.error) message = String(body.error);
      } catch {
        // Keep the default message.
      }
      return { ok: false, error: message };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NETSO-Service-Order-${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, error: 'The agreement could not be downloaded. Check your connection.' };
  }
}