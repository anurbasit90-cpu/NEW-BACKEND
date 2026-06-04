const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// INISIALISASI FIREBASE
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://monitoring-panel-77a07-default-rtdb.asia-southeast1.firebasedatabase.app/" 
});

const db = admin.database();
const ref = db.ref("wiring");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- 1. ENDPOINT: Ambil Data ---
app.get("/data", (req, res) => {
  ref.once("value", (snapshot) => {
    const data = snapshot.val();
    const result = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).reverse() : [];
    res.json(result);
  });
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

server.listen(3000, "0.0.0.0", () => {
  console.log("Server Berjalan di Port 3000");
});