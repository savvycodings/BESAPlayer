/**
 * Send a push notification via Expo Push Service.
 * Used e.g. when a dropoff code is set on a verification order.
 */
export async function sendExpoPush(
  expoPushToken: string | null | undefined,
  params: { title: string; body: string; data?: Record<string, unknown> }
): Promise<{ success: boolean; error?: string }> {
  if (!expoPushToken || typeof expoPushToken !== 'string' || !expoPushToken.startsWith('ExponentPushToken[')) {
    return { success: false, error: 'Invalid or missing Expo push token' }
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoPushToken,
        title: params.title,
        body: params.body,
        ...(params.data && Object.keys(params.data).length > 0 && { data: params.data }),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[Expo Push] Error:', response.status, text)
      return { success: false, error: `Expo API ${response.status}: ${text}` }
    }

    const result = await response.json()
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data
    if (ticket?.status === 'error') {
      console.error('[Expo Push] Ticket error:', ticket.message)
      return { success: false, error: ticket.message }
    }
    return { success: true }
  } catch (err: any) {
    console.error('[Expo Push] Request failed:', err?.message || err)
    return { success: false, error: err?.message || 'Network error' }
  }
}
