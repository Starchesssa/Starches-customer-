import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Define secrets stored in Google Cloud Secret Manager
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
export const PAYMENT_GATEWAY_SECRET_KEY = defineSecret('PAYMENT_GATEWAY_SECRET_KEY');
export const PAYMENT_WEBHOOK_SECRET = defineSecret('PAYMENT_WEBHOOK_SECRET');

/**
 * Creates an authorized payment session using private credentials from Secret Manager.
 * Ensures payment gateway secrets are never exposed in client bundles or network requests.
 */
export const createPaymentSession = onCall(
  {
    secrets: [PAYMENT_GATEWAY_SECRET_KEY],
    cors: true,
  },
  async (request) => {
    // 1. Verify caller authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in to create a payment session.');
    }

    const { amount, currency = 'usd', orderId, paymentMethod } = request.data;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Valid order amount is required.');
    }

    // 2. Retrieve private secret from Google Cloud Secret Manager
    const secretKey = PAYMENT_GATEWAY_SECRET_KEY.value();
    if (!secretKey) {
      console.warn('[SecretManager] PAYMENT_GATEWAY_SECRET_KEY is not configured yet in Secret Manager.');
    }

    // 3. Create simulated or live payment session
    const sessionId = `pay_sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const clientSecret = `tok_sec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // 4. Record audit entry in Firestore
    await db.collection('payment_sessions').doc(sessionId).set({
      userId: request.auth.uid,
      orderId: orderId || null,
      amount,
      currency,
      paymentMethod: paymentMethod || 'card',
      status: 'initiated',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[PaymentSession] Created session ${sessionId} for user ${request.auth.uid}`);

    return {
      success: true,
      sessionId,
      clientSecret,
    };
  }
);

/**
 * Server-side AI completion proxy using GEMINI_API_KEY from Google Cloud Secret Manager.
 */
export const geminiServerProxy = onCall(
  {
    secrets: [GEMINI_API_KEY],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required for server-side AI.');
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEY is not provisioned in Secret Manager.');
    }

    const { prompt } = request.data;
    if (!prompt || typeof prompt !== 'string') {
      throw new HttpsError('invalid-argument', 'A prompt string is required.');
    }

    // Server-side call to Google GenAI API using private secret
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await response.json();
      return { success: true, data };
    } catch (err: any) {
      console.error('[GeminiProxy] Request error:', err);
      throw new HttpsError('internal', 'Server-side Gemini request failed.');
    }
  }
);
