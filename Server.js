const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

// Node >=18 required for global fetch

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SERVICE_ACCOUNT_PATH can be provided via env to avoid committing credentials
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, "serviceAccountKey.json");
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("ERROR: service account file not found at", SERVICE_ACCOUNT_PATH);
  console.error("Set SERVICE_ACCOUNT_PATH env var or place serviceAccountKey.json in repo root (not recommended for public repos). If you only want to run without Firebase, set FIREBASE_EMULATOR_MODE=1.");
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://monitoring-panel-77a07-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();
const ref = db.ref(process.env.FIREBASE_DB_REF || "wiring");

// CORS: origins can be set via ALLOW_ORIGINS env (comma-separated)
const allowOrigins = process.env.ALLOW_ORIGINS ? process.env.ALLOW_ORIGINS.split(",") : ["http://localhost:5173"];
app.use(cors({ origin: function(origin, cb) {
  // Allow requests with no origin (curl, server-to-server)
  if (!origin) return cb(null, true);
  if (allowOrigins.indexOf(origin) !== -1) return cb(null, true);
  return cb(new Error("Not allowed by CORS"));
}}));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- 1. ENDPOINT: Ambil Data ---
app.get("/data", async (req, res) => {
  try {
    const snapshot = await ref.once("value");
    const data = snapshot.val();
    const result = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse() : [];
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membaca data" });
  }
});

// --- 2. ENDPOINT: Tambah Data Baru ---
app.post("/add", (req, res) => {
  const newData = { ...req.body, waktu: new Date().toISOString() };
  ref.push(newData, (err) => {
    if (err) return res.status(500).send(err);
    res.send("Saved");
  });
});

// --- 3. ENDPOINT: Update Data ---
app.post("/update-data", (req, res) => {
  const { id, jenis_panel_baru, progres_baru } = req.body;
  const updates = {};
  if (jenis_panel_baru) updates['jenis_panel'] = jenis_panel_baru;
  if (progres_baru) updates['progres'] = progres_baru;

  ref.child(id).update(updates, (err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

// --- 4. ENDPOINT: Hapus Data ---
app.post("/delete-data", (req, res) => {
  ref.child(req.body.id).remove((err) => {
    if (err) return res.json({ success: false });
    res.json({ success: true });
  });
});

// --- 5. ENDPOINT: Export Excel ---
app.get("/export-excel", (req, res) => {
  ref.once("value", async (snapshot) => {
    const data = snapshot.val();
    if (!data) return res.status(404).send("Data kosong");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monitoring WIP');

    // Menata Ukuran Kolom Sesuai Kebutuhan
    worksheet.columns = [
      { header: 'WBS', key: 'nomor_project', width: 25 },
      { header: 'Nama Project', key: 'nama_project', width: 30 },
      { header: 'NO Panel', key: 'panel_id', width: 15 },
      { header: 'Qty Plan start', key: 'qty_plan', width: 15 },
      { header: 'Tanggal Plan Start', key: 'plan_start', width: 18 },
      { header: 'Tanggal Actual Start', key: 'actual_start', width: 18 },
      { header: 'Tanggal Plan Finish', key: 'plan_finish', width: 18 },
      { header: 'Tanggal Actual Finish', key: 'actual_finish', width: 18 },
      { header: 'Qty Actual Delivery', key: 'qty_actual', width: 18 },
      { header: 'Status / Progress', key: 'progres', width: 18 },
      { header: 'Keterangan', key: 'keterangan', width: 40 }
    ];

    // Memasukkan data ke baris Excel
    Object.keys(data).forEach(key => {
      const item = data[key];

      // LOGIKA CERDAS DETEKSI ANGKA/TEKS
      let rawProgress = item.progres ? String(item.progres).trim() : '0';
      let cleanVal = rawProgress.replace('%', '').trim();
      let isNumber = !isNaN(cleanVal) && cleanVal !== '';

      let finalProgress;
      let qtyActual = '';

      if (isNumber) {
          finalProgress = cleanVal + '%'; // Jika angka, paksa tambah %
          if (cleanVal === '100') qtyActual = 1; // Jika 100%, delivery = 1
      } else {
          finalProgress = rawProgress; // Jika teks kalimat, biarkan apa adanya (tanpa %)
      }

      worksheet.addRow({
        nomor_project: item.nomor_project || '-',
        nama_project: item.nama_project || '-',
        panel_id: item.panel_id || '-',
        qty_plan: 1,
        plan_start: item.plan_start || '-',
        actual_start: item.actual_start || '-',
        plan_finish: item.plan_finish || '-',
        actual_finish: item.actual_finish || '-',
        qty_actual: qtyActual,
        progres: finalProgress,
        keterangan: item.keterangan || '-'
      });
    });

    // STYLING EXCEL (WARNA, BORDER, ALIGNMENT)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 30;

    // Kode Warna Hexadecimal
    const fillBlue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
    const fillYellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    const fillGreen = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };

    [1, 2, 3].forEach(col => headerRow.getCell(col).fill = fillBlue);
    [4, 5, 6].forEach(col => headerRow.getCell(col).fill = fillYellow);
    [7, 8, 9].forEach(col => headerRow.getCell(col).fill = fillGreen);

    worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
      row.eachCell({ includeEmpty: true }, function(cell, colNumber) {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (rowNumber > 1) {
          if (colNumber >= 4 && colNumber <= 10) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          }
        }
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Laporan_WIP_Wiring.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  });
});

// --- REALTIME UPDATE TRIGGER ---
ref.on("value", () => {
  io.emit("updateData");
});

// --- PROXY: meneruskan request ke WordPress Headless API ---
const WP_API_BASE = process.env.WP_API_BASE || "https://admin.aryatek.co.id/wp-json/wp/v2";

app.use("/wp", async (req, res) => {
  const targetBase = WP_API_BASE.replace(/\/$/, "");
  const targetUrl = targetBase + req.originalUrl.replace(/^\/wp/, "");
  try {
    const init = {
      method: req.method,
      headers: { ...req.headers, host: new URL(targetBase).host },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
    };
    const wpRes = await fetch(targetUrl, init);
    res.status(wpRes.status);
    wpRes.headers.forEach((value, name) => {
      if (!["transfer-encoding", "content-encoding", "content-length", "connection"].includes(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });
    const buffer = await wpRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).json({ error: "Bad gateway" });
  }
});

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server Berjalan di Port", process.env.PORT || 3000);
});
