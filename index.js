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
    puppeteer: {
          headless: true,
          args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-accelerated-2d-canvas','--no-first-run','--no-zygote','--single-process','--disable-gpu']
    }
});

client.on('qr', async (qr) => {
    console.log('QR generado');
    qrCodeData = await qrcode.toDataURL(qr);
    clientReady = false;
});

client.on('ready', () => {
    console.log('WhatsApp conectado y listo');
    clientReady = true;
    qrCodeData = null;
});

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
    if (clientReady) return res.json({ status: 'ya_conectado' });
    if (!qrCodeData) return res.json({ status: 'generando', message: 'Espera 10 segundos e intenta de nuevo' });
    res.json({ status: 'ok', qr: qrCodeData });
});

app.post('/send', auth, upload.single('pdf'), async (req, res) => {
    if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
    const { chat_id, filename } = req.body;
    if (!chat_id || !req.file) return res.status(400).json({ error: 'chat_id y pdf son requeridos' });
    try {
          const media = new MessageMedia('application/pdf', req.file.buffer.toString('base64'), filename || 'factura.pdf');
          await client.sendMessage(chat_id, media);
          console.log(`PDF enviado a ${chat_id}: ${filename}`);
          res.json({ success: true });
    } catch (error) {
          console.error('Error:', error);
          res.status(500).json({ error: error.message });
    }
});

app.get('/chats', auth, async (req, res) => {
    if (!clientReady) return res.status(503).json({ error: 'WhatsApp no conectado' });
    try {
          const chats = await client.getChats();
          const grupos = chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, nombre: c.name }));
          const contactos = chats.filter(c => !c.isGroup).map(c => ({ id: c.id._serialized, nombre: c.name }));
          res.json({ grupos, contactos });
    } catch (error) {
          res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
