const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'hielo-key';

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

let clientReady = false;
let qrCodeData = null;
let wClient = null;

function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu'] }
  });
  client.on('qr', async (qr) => { qrCodeData = await qrcode.toDataURL(qr); clientReady = false; console.log('QR generado'); });
  client.on('ready', () => { clientReady = true; qrCodeData = null; console.log('WhatsApp listo'); });
  client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
    clientReady = false;
    setTimeout(() => { console.log('Reconectando...'); wClient = createClient(); }, 5000);
  });
  client.initialize().catch(err => {
    console.error('Error init:', err.message);
    clientReady = false;
    setTimeout(() => { wClient = createClient(); }, 10000);
  });
  return client;
}
wClient = createClient();

function auth(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'API key invalida' });
  next();
}

const html = (t, b) => '<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f9f0;font-family:sans-serif"><div style="background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)"><h2>' + t + '</h2>' + b + '</div></body></html>';

app.get('/status', (req, res) => res.json({ server: 'online', whatsapp: clientReady ? 'conectado' : 'desconectado', qr_disponible: !!qrCodeData }));

app.get('/qr', (req, res) => {
  if (clientReady) return res.send(html('WhatsApp Conectado', '<p style="color:#25D366;font-size:20px">El servidor ya esta vinculado.</p>'));
  if (!qrCodeData) return res.send(html('Generando QR...', '<p>Espera unos segundos y recarga.</p><script>setTimeout(()=>location.reload(),6000)<\/script>'));
  res.send(html('Escanea con WhatsApp', '<p style="color:#666;margin-bottom:16px">WhatsApp -> Dispositivos vinculados -> Vincular</p><img src="' + qrCodeData + '" style="width:280px;height:280px;border:3px solid #25D366;border-radius:12px"/><p style="color:#999;font-size:12px;margin-top:12px">Expira en ~60s</p><script>setTimeout(()=>location.reload(),55000)<\/script>'));
});

app.post('/send', auth, upload.single('pdf'), async (req, res) => {
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
  const { chat_id, filename } = req.body;
  if (!chat_id || !req.file) return res.status(400).json({ error: 'chat_id y pdf requeridos' });
  try {
    const media = new MessageMedia('application/pdf', req.file.buffer.toString('base64'), filename || 'factura.pdf');
    await wClient.sendMessage(chat_id, media);
    console.log('PDF enviado a ' + chat_id);
    res.json({ success: true });
  } catch (e) {
    console.error('Error send:', e.message);
    if (e.message.includes('detached') || e.message.includes('Session')) {
      clientReady = false;
      wClient = createClient();
      return res.status(503).json({ error: 'Reconectando, intenta en 30s' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.get('/chats', auth, async (req, res) => {
  if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
  try {
    const chats = await wClient.getChats();
    res.json({ grupos: chats.filter(c=>c.isGroup).map(c=>({id:c.id._serialized,nombre:c.name})), contactos: chats.filter(c=>!c.isGroup).map(c=>({id:c.id._serialized,nombre:c.name})) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));