const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const WhatsAppSession = require('../models/WhatsAppSession');

let sock = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'
let qrCodeDataURL = null;
let connectedUser = null;
let socketIo = null;

function setSocketIo(io) {
  socketIo = io;
}

function broadcastStatus() {
  if (socketIo) {
    socketIo.emit('WHATSAPP_STATUS_UPDATE', {
      status: connectionStatus,
      qr: qrCodeDataURL,
      user: connectedUser
    });
  }
}

// Custom authentication state manager to store creds in MongoDB
async function useMongoAuthState() {
  const writeData = async (data, key) => {
    try {
      const jsonStr = JSON.stringify(data, BufferJSON.replacer);
      await WhatsAppSession.findOneAndUpdate(
        { key },
        { value: jsonStr },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('[WhatsApp] Mongo Auth Write Error:', err.message);
    }
  };

  const readData = async (key) => {
    try {
      const doc = await WhatsAppSession.findOne({ key });
      if (!doc) return null;
      return JSON.parse(doc.value, BufferJSON.reviver);
    } catch (err) {
      console.error('[WhatsApp] Mongo Auth Read Error:', err.message);
      return null;
    }
  };

  const removeData = async (key) => {
    try {
      await WhatsAppSession.deleteOne({ key });
    } catch (err) {
      console.error('[WhatsApp] Mongo Auth Remove Error:', err.message);
    }
  };

  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeData(creds, 'creds');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                const { proto } = require('@whiskeysockets/baileys');
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, key));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData(creds, 'creds');
    }
  };
}

async function connectToWhatsApp() {
  if (connectionStatus === 'CONNECTED' && sock) {
    return;
  }

  // Prevent multiple connection loops running concurrently
  if (connectionStatus === 'CONNECTING' && sock) {
    return;
  }

  connectionStatus = 'CONNECTING';
  qrCodeDataURL = null;
  broadcastStatus();

  try {
    const { state, saveCreds } = await useMongoAuthState();
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Connecting WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
      version,
      printQRInTerminal: true,
      auth: state,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'CONNECTING';
        try {
          qrCodeDataURL = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('[WhatsApp] QR DataURL Conversion Error:', err);
        }
        broadcastStatus();
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode || error?.output?.payload?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Connection closed. Reason: ${error?.message || error}. Reconnecting: ${shouldReconnect}`);

        connectionStatus = 'DISCONNECTED';
        qrCodeDataURL = null;
        connectedUser = null;
        broadcastStatus();

        if (shouldReconnect) {
          await delay(5000);
          connectToWhatsApp();
        } else {
          console.log('[WhatsApp] Logged out, clearing database session keys...');
          await WhatsAppSession.deleteMany({});
        }
      } else if (connection === 'open') {
        console.log('[WhatsApp] Connection successfully established!');
        connectionStatus = 'CONNECTED';
        qrCodeDataURL = null;
        const user = sock.user;
        connectedUser = user ? (user.id || user.name) : 'Connected Account';
        // Clean phone number from connected ID (e.g. 919876543210:45@s.whatsapp.net -> 919876543210)
        if (connectedUser && connectedUser.includes('@')) {
          connectedUser = connectedUser.split('@')[0].split(':')[0];
        }
        broadcastStatus();
      }
    });
  } catch (err) {
    console.error('[WhatsApp] Socket setup failed:', err.message);
    connectionStatus = 'DISCONNECTED';
    broadcastStatus();
  }
}

async function disconnectFromWhatsApp() {
  connectionStatus = 'DISCONNECTED';
  qrCodeDataURL = null;
  connectedUser = null;

  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      console.warn('[WhatsApp] Logout error (ignoring):', e.message);
    }
    try {
      sock.end();
    } catch (e) {
      console.warn('[WhatsApp] End error (ignoring):', e.message);
    }
    sock = null;
  }

  // Clear credentials in MongoDB
  await WhatsAppSession.deleteMany({});
  broadcastStatus();
}

function getStatus() {
  return {
    status: connectionStatus,
    qr: qrCodeDataURL,
    user: connectedUser
  };
}

async function sendWhatsAppMessage(phone, text) {
  if (!sock || connectionStatus !== 'CONNECTED') {
    throw new Error('WhatsApp connection is not active');
  }

  // Format phone number
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone; // default to India (+91)
  }

  const recipientJid = `${cleanPhone}@s.whatsapp.net`;
  console.log(`[WhatsApp] Sending message to ${recipientJid}`);
  const result = await sock.sendMessage(recipientJid, { text });
  return result;
}

async function sendThankYouMessage(order, settings) {
  if (!settings || !settings.whatsappEnabled) {
    return;
  }

  const phone = order.customerPhone;
  if (!phone) {
    return;
  }

  try {
    let message = settings.whatsappTemplate;
    if (!message) return;

    // Replace template variables
    message = message.replace(/{customerName}/g, order.customerName || 'Customer');
    message = message.replace(/{billNo}/g, order.billNo || '');
    message = message.replace(/{grandTotal}/g, `${settings.currency || '₹'}${order.grandTotal}`);
    message = message.replace(/{googleReviewLink}/g, settings.googleReviewLink || '');
    message = message.replace(/{instagramLink}/g, settings.instagramLink || '');
    message = message.replace(/{facebookLink}/g, settings.facebookLink || '');

    await sendWhatsAppMessage(phone, message);
    console.log(`[WhatsApp] Auto thank-you message sent for Bill: ${order.billNo}`);
  } catch (err) {
    console.error('[WhatsApp] Failed to send auto thank-you message:', err.message);
  }
}

// Auto-connect on init if credentials exist
async function init(io) {
  setSocketIo(io);
  const existingSession = await WhatsAppSession.findOne({ key: 'creds' });
  if (existingSession) {
    console.log('[WhatsApp] Found saved credentials, auto-connecting...');
    connectToWhatsApp();
  }
}

module.exports = {
  init,
  connect: connectToWhatsApp,
  disconnect: disconnectFromWhatsApp,
  getStatus,
  sendWhatsAppMessage,
  sendThankYouMessage,
  setSocketIo
};
