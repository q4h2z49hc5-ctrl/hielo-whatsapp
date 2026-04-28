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

const client = new Client({
      authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
      puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu'] }
});

client.on('qr', async (qr) => { qrCodeData = await qrcode.toDataURL(qr); clientReady = false; });
client.on('ready', () => { clientReady = true; qrCodeData = null; console.log('WhatsApp listo'); });
client.on('disconnected', () => { clientReady = false; });
client.initialize();

function auth(req, res, next) {
      if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'API key invalida' });
      next();
}

app.get('/status', (req, res) => {
      res.json({ server: 'online', whatsapp: clientReady ? 'conectado' : 'desconectado', qr_disponible: !!qrCodeData });
});

app.get('/qr', (req, res) => {
      const html = (titulo, cuerpo) => `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f9f0;font-family:sans-serif"><div style="background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)"><h2>${titulo}</h2>${cuerpo}</div></body></html>`;
      if (clientReady) return res.send(html('WhatsApp Conectado', '<p style="color:#25D366;font-size:20px">El servidor ya esta vinculado.</p>'));
      if (!qrCodeData) return res.send(html('Generando QR...','<p>Espera unos segundos y recarga la pagina.</p><script>setTimeout(()=>location.reload(),6000)</script>'));
      res.send(html('Escanea con WhatsApp', `<p style="color:#666;margin-bottom:16px">Abre WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular dispositivo</p><img src="${qrCodeData}" style="width:280px;height:280px;border:3px solid #25D366;border-radius:12px"/><p style="color:#999;font-size:12px;margin-top:12px">El QR expira en ~60s. Si expira recarga la pagina.</p><script>setTimeout(()=>location.reload(),55000)</script>`));
});

app.post('/send', auth, upload.single('pdf'), async (req, res) => {
      if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
      const { chat_id, filename } = req.body;
      if (!chat_id || !req.file) return res.status(400).json({ error: 'chat_id y pdf son requeridos' });
      try {
              const media = new MessageMedia('application/pdf', req.file.buffer.toString('base64'), filename || 'factura.pdf');
              await client.sendMessage(chat_id, media);
              res.json({ success: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/chats', auth, async (req, res) => {
      if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
      try {
              const chats = await client.getChats();
              res.json({ grupos: chats.filter(c=>c.isGroup).map(c=>({id:c.id._serialized,nombre:c.name})), contactos: chats.filter(c=>!c.isGroup).map(c=>({id:c.id._serialized,nombre:c.name})) });
      } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
