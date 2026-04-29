const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const qrcode = require('qrcode');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'hielo-key';
const AUTH_PATH = '/app/wa_auth';

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

let sock = null;
let clientReady = false;
let qrCodeData = null;

async function connectWhatsApp() {
  if (!fs.existsSync(AUTH_PATH)) fs.mkdirSync(AUTH_PATH, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  const pino = require('pino');
  sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) { qrCodeData = await qrcode.toDataURL(qr); clientReady = false; console.log('QR generado'); }
    if (connection === 'open') { clientReady = true; qrCodeData = null; console.log('WhatsApp conectado'); }
    if (connection === 'close') {
      clientReady = false;
      const shouldReconnect = (lastDisconnect?.error instanceof Boom) && lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(connectWhatsApp, 3000);
    }
  });
}
connectWhatsApp().catch(console.error);

function auth(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'API key invalida' });
  next();
}

const html = (t, b) => '<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f9f0;font-family:sans-serif"><div style="background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)"><h2>' + t + '</h2>' + b + '</div></body></html>';

app.get('/status', (req, res) => res.json({ server: 'online', whatsapp: clientReady ? 'conectado' : 'desconectado', qr_disponible: !!qrCodeData }));

app.get('/qr', (req, res) => {
  if (clientReady) return res.send(html('WhatsApp Conectado', '<p style="color:#25D366;font-size:20px">El servidor ya esta vinculado.</p>'));
  if (!qrCodeData) return res.send(html('Generando QR...', '<p>Espera unos segundos y recarga.</p><script>setTimeout(()=>location.reload(),5000)<\/script>'));
  res.send(html('Escanea con WhatsApp', '<p style="color:#666;margin-bottom:16px">WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular</p><img src="' + qrCodeData + '" style="width:280px;height:280px;border:3px solid #25D366;border-radius:12px"/><p style="color:#999;font-size:12px;margin-top:12px">Expira en ~60s. Recarga si caduca.</p><script>setTimeout(()=>location.reload(),55000)<\/script>'));
});

app.post('/send', auth, upload.single('pdf'), async (req, res) => {
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
  const { chat_id, filename } = req.body;
  if (!chat_id || !req.file) return res.status(400).json({ error: 'chat_id y pdf requeridos' });
  try {
    const jid = chat_id.includes('@') ? chat_id : chat_id + '@c.us';
    await sock.sendMessage(jid, { document: req.file.buffer, mimetype: 'application/pdf', fileName: filename || 'factura.pdf' });
    console.log('PDF enviado a ' + jid);
    res.json({ success: true });
  } catch (e) { console.error('Error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/chats', auth, async (req, res) => {
  res.json({ connected: clientReady, message: 'Baileys activo. Usa chat_id directo ej: 56912345678@c.us o grupo@g.us' });
});

app.listen(PORT, () => console.log('Servidor Baileys en puerto ' + PORT));