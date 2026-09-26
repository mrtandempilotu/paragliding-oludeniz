export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ---------------------------------------------------------------------------
// Instant Google Calendar sync ("skywalkers" calendar).
//
// This writes the event the moment a booking is created, so it shows up in
// Google Calendar immediately — independent of the hourly PC-based polling
// task (which fetches this same /api/bookings endpoint from Ceyhun's
// computer). Both write the same "[BKG:<id>]" marker in the description, so
// the hourly sync recognizes an instantly-created event as already synced
// and won't duplicate it.
//
// Requires two env vars on Vercel (see project settings):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL     - the service account's email
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - its PEM private key (\n escaped is fine)
// The service account must be shared on the "skywalkers" calendar with
// "Make changes to events" access. If either env var is missing, this is a
// no-op (booking still saves fine; the hourly sync will pick it up later).
// ---------------------------------------------------------------------------

const SKYWALKERS_CALENDAR_ID =
  process.env.GOOGLE_CALENDAR_ID ||
  '16fd11edf8eff8e70a23274eee57e601f8c8c08e956280397ce56a206a0fbe31@group.calendar.google.com'

const CALENDAR_FLIGHT_LABELS: Record<string, string> = {
  standard: 'Standard (1200m)',
  high: 'Yüksek İrtifa (1700m)',
  sunset: 'Gün Batımı Uçuşu',
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function getGoogleCalendarAccessToken(): Promise<string | null> {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!clientEmail || !privateKeyRaw) return null

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const jwt = `${unsigned}.${base64url(signer.sign(privateKey))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    console.error('[Calendar] token exchange failed:', res.status, await res.text())
    return null
  }
  const json = await res.json()
  return (json.access_token as string) || null
}

async function createCalendarEventForBooking(booking: {
  id: string
  first_name: string
  last_name: string
  guests: number
  flight_type: string
  flight_date: string
  phone: string | null
  notes: string | null
  total_price: number
  status: string
}) {
  const accessToken = await getGoogleCalendarAccessToken()
  if (!accessToken) {
    console.warn(
      '[Calendar] GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not set — skipping instant calendar sync (hourly sync will still catch this up)'
    )
    return
  }

  const label = CALENDAR_FLIGHT_LABELS[booking.flight_type] || booking.flight_type
  const startDate = booking.flight_date // 'YYYY-MM-DD'
  const endDateObj = new Date(`${startDate}T00:00:00Z`)
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1)
  const endDate = endDateObj.toISOString().slice(0, 10)

  const descriptionLines = [
    `Telefon: ${booking.phone || 'belirtilmedi'}`,
    `Durum: ${booking.status}`,
    `Toplam: $${booking.total_price}`,
  ]
  if (booking.notes) descriptionLines.push(booking.notes)
  descriptionLines.push('Admin panel: https://www.atmosparagliding.com/admin/bookings')
  descriptionLines.push(`[BKG:${booking.id}]`)

  const event = {
    summary: `🪂 ${booking.first_name} ${booking.last_name} — ${booking.guests} kişi (${label})`,
    description: descriptionLines.join('\n'),
    start: { date: startDate },
    end: { date: endDate },
    colorId: booking.status === 'confirmed' ? '10' : '5',
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(SKYWALKERS_CALENDAR_ID)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )

  if (!res.ok) {
    console.error('[Calendar] event create failed:', res.status, await res.text())
  } else {
    console.log('[Calendar] instant event created for booking', booking.id)
  }
}

// GET (list) and PATCH (update status) expose customer PII / let anyone change
// booking status — only allow the admin panel (cookie) or the calendar-sync
// scheduled task (CALENDAR_SYNC_SECRET bearer token) to call them.
// POST (creating a booking) stays open — that's the public booking form.
function isAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth && process.env.CALENDAR_SYNC_SECRET && auth === `Bearer ${process.env.CALENDAR_SYNC_SECRET}`) {
    return true
  }
  const session = cookies().get('admin_session')
  return !!session && !!process.env.ADMIN_PASSWORD && session.value === process.env.ADMIN_PASSWORD
}

const FLIGHT_PRICES: Record<string, number> = {
  standard: 150,
  high: 150,
  sunset: 150,
}

const FLIGHT_LABELS: Record<string, string> = {
  standard: 'Standard Tandem — 2000m',
  high: 'High Altitude — 2000m',
  sunset: 'Sunset Flight — 2000m',
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    const {
      flight_type,
      flight_date,
      guests,
      first_name,
      last_name,
      email,
      phone,
      notes,
      addon_photo,
      addon_video,
      addon_bundle,
    } = body

    // Validate required fields
    if (!flight_type || !flight_date || !first_name || !last_name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Calculate price — one fixed all-inclusive price per person, no add-ons, no discounts
    const guestCount = parseInt(guests) || 1
    const basePerPerson = FLIGHT_PRICES[flight_type] || 150
    const addonPrice = 0
    const basePrice = basePerPerson * guestCount
    const totalPrice = basePrice

    // Save to Supabase
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        flight_type,
        flight_date,
        guests: guestCount,
        first_name,
        last_name,
        email,
        phone: phone || null,
        notes: notes || null,
        addon_photo: true,
        addon_video: true,
        addon_bundle: true,
        base_price: basePrice,
        addon_price: addonPrice,
        total_price: totalPrice,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('[Bookings] Supabase error:', error)
      return NextResponse.json({ error: 'Failed to save booking' }, { status: 500 })
    }

    // Write instantly to the "skywalkers" Google Calendar — no need to wait
    // for the hourly PC-based sync task anymore.
    try {
      await createCalendarEventForBooking({
        id: booking.id,
        first_name,
        last_name,
        guests: guestCount,
        flight_type,
        flight_date,
        phone: phone || null,
        notes: notes || null,
        total_price: totalPrice,
        status: 'pending',
      })
    } catch (calErr) {
      console.error('[Bookings] Instant calendar sync failed:', calErr)
      // Don't fail the request — booking is saved; hourly sync will catch it up.
    }

    // Send email notification via Gmail SMTP
    try {
      const GMAIL_USER = process.env.GMAIL_USER || 'mrtandempilot@gmail.com'
      const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD

      if (!GMAIL_PASS) {
        console.error('[Bookings] GMAIL_APP_PASSWORD not set — skipping email')
      } else {
        const includedText = 'Flight, professional photo & video, mountain entrance fee, transfer to/from mountain'

        const dateStr = new Date(flight_date).toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: GMAIL_USER, pass: GMAIL_PASS },
        })

        await transporter.sendMail({
          from: `"Atmos Paragliding" <${GMAIL_USER}>`,
          to: GMAIL_USER,
          subject: `New Booking: ${first_name} ${last_name} - ${dateStr} - $${totalPrice}`,
          html: `
            <h2>New Booking Request</h2>
            <table style="border-collapse:collapse; width:100%; font-family:sans-serif; font-size:14px;">
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Flight</td><td style="padding:8px;">${FLIGHT_LABELS[flight_type]}</td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Date</td><td style="padding:8px;">${dateStr}</td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Guests</td><td style="padding:8px;">${guestCount}</td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Includes</td><td style="padding:8px;">${includedText}</td></tr>
              <tr><td colspan="2" style="padding:8px; border-top:2px solid #e9ecef;"></td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Name</td><td style="padding:8px;">${first_name} ${last_name}</td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Phone</td><td style="padding:8px;">${phone || 'Not provided'}</td></tr>
              ${notes ? `<tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Notes</td><td style="padding:8px;">${notes}</td></tr>` : ''}
              <tr><td colspan="2" style="padding:8px; border-top:2px solid #e9ecef;"></td></tr>
              <tr><td style="padding:8px; background:#f8f9fa; font-weight:bold;">Total (all-inclusive)</td><td style="padding:8px; font-size:18px; font-weight:bold; color:#f97316;">$${totalPrice}</td></tr>
            </table>
            <br>
            <a href="https://atmosparagliding.com/admin/bookings" style="display:inline-block; background:#f97316; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">View in Admin Panel</a>
          `,
        })

        console.log('[Bookings] Email sent via Gmail to', GMAIL_USER)
        await supabase
          .from('bookings')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', booking.id)
      }
    } catch (emailErr) {
      console.error('[Bookings] Email send failed:', emailErr)
      // Don't fail the request — booking is saved
    }

    // Send WhatsApp notification to pilot (via Meta WhatsApp Cloud API)
    try {
      const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
      const WA_RECIPIENT = process.env.WHATSAPP_NOTIFY_PHONE
      const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN

      if (!WA_PHONE_NUMBER_ID || !WA_RECIPIENT || !WA_TOKEN) {
        console.error('[Bookings] WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_NOTIFY_PHONE / WHATSAPP_ACCESS_TOKEN not set — skipping WhatsApp notification')
      } else {
        const dateForWa = new Date(flight_date).toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })

        const notifyText =
          `New booking request!\n` +
          `${FLIGHT_LABELS[flight_type]}\n` +
          `Date: ${dateForWa}\n` +
          `Guests: ${guestCount}\n` +
          `Name: ${first_name} ${last_name}\n` +
          `Phone: ${phone || 'not provided'}\n` +
          `Total: $${totalPrice}\n` +
          `https://atmosparagliding.com/admin/bookings`

        const waRes = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WA_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: WA_RECIPIENT,
            type: 'text',
            text: { body: notifyText },
          }),
        })

        if (!waRes.ok) {
          console.error('[Bookings] WhatsApp notify failed:', waRes.status, await waRes.text())
        } else {
          console.log('[Bookings] WhatsApp notification sent to', WA_RECIPIENT)
        }
      }
    } catch (waErr) {
      console.error('[Bookings] WhatsApp notify error:', waErr)
      // Don't fail the request — booking is saved
    }

    // Send Telegram notification to pilot (Telegram Bot API)
    try {
      const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
      const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID

      if (!TG_TOKEN || !TG_CHAT_ID) {
        console.warn('[Bookings] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping Telegram notification')
      } else {
        const dateForTg = new Date(flight_date).toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
        const tgText =
          `🪂 Yeni rezervasyon!\n` +
          `${FLIGHT_LABELS[flight_type]}\n` +
          `Tarih: ${dateForTg}\n` +
          `Misafir: ${guestCount}\n` +
          `İsim: ${first_name} ${last_name}\n` +
          `Telefon: ${phone || 'belirtilmedi'}\n` +
          `Toplam: $${totalPrice}\n` +
          `https://www.atmosparagliding.com/admin/bookings`

        const tgRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TG_CHAT_ID, text: tgText }),
        })

        if (!tgRes.ok) {
          console.warn('[Bookings] Telegram notify failed:', tgRes.status, await tgRes.text())
        } else {
          console.log('[Bookings] Telegram notification sent')
        }
      }
    } catch (tgErr) {
      console.warn('[Bookings] Telegram notify error (non-fatal):', tgErr)
    }

    // Build WhatsApp pre-fill message for customer
    const dateFormatted = new Date(flight_date).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
    const waMessage = encodeURIComponent(
      `Hi! I just submitted a booking request on your website.\n\n` +
      `Flight: ${FLIGHT_LABELS[flight_type]} (all-inclusive: photo & video, mountain fee, transfer)\n` +
      `Date: ${dateFormatted}\n` +
      `Guests: ${guestCount}\n` +
      `Name: ${first_name} ${last_name}\n` +
      `Total: $${totalPrice}\n\n` +
      `Please confirm my booking. Thank you!`
    )

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      total_price: totalPrice,
      whatsapp_url: `https://wa.me/905364616674?text=${waMessage}`,
    })
  } catch (err: any) {
    console.error('[Bookings] Fatal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')
  const from = searchParams.get('from') // flight_date >= from (YYYY-MM-DD)
  const to = searchParams.get('to') // flight_date <= to (YYYY-MM-DD)

  let query = supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (from) query = query.gte('flight_date', from)
  if (to) query = query.lte('flight_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ bookings: data })
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  // Admin: update booking status
  const body = await request.json()
  const { id, status, admin_notes } = body

  const { error } = await supabase
    .from('bookings')
    .update({ status, admin_notes })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
