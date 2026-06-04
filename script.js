const socket = io();
const tableBody = document.getElementById("tableBody");

function loadData() {
  fetch("/data")
    .then(res => res.json())
    .then(data => {
      if (!tableBody) return;
      tableBody.innerHTML = "";
      
      data.forEach((row, index) => {
        const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        
        // --- LOGIKA CERDAS DETEKSI ANGKA ATAU TEKS ---
        let rawProgress = row.progres ? String(row.progres).trim() : '0';
        let cleanVal = rawProgress.replace('%', '').trim();
        let isNumber = !isNaN(cleanVal) && cleanVal !== '';

        let finalProgressDisplay;
        let progressColor = 'text-blue-700'; // Default warna teks: biru

        if (isNumber) {
            finalProgressDisplay = cleanVal + '%'; // Jika angka, tambahkan %
            if (cleanVal === '100') progressColor = 'text-green-600'; // Jika 100%, ubah warna jadi Hijau
        } else {
            finalProgressDisplay = rawProgress; // Jika teks, biarkan apa adanya tanpa %
            
            // Opsional: Jika teksnya "Selesai" atau "Done", warnanya otomatis hijau
            if(rawProgress.toLowerCase() === 'selesai' || rawProgress.toLowerCase() === 'done') {
                progressColor = 'text-green-600';
            }
        }
        // ---------------------------------------------

        const tanggalMulai = row.actual_start || row.plan_start || '-';

        tableBody.innerHTML += `
          <tr class="${rowClass} border-b hover:bg-blue-50 transition duration-150">
            <td class="px-4 py-4 font-medium text-gray-700 text-xs">${row.nomor_project || '-'}</td>
            <td class="px-4 py-4 font-bold text-gray-900">${row.nama_project || '-'}</td>
            <td class="px-4 py-4 font-bold text-blue-800 text-base">${row.panel_id || '-'}</td>
            <td class="px-4 py-4 text-gray-600 uppercase text-xs font-bold">${row.operator || '-'}</td>
            <td class="px-4 py-4 text-center font-bold text-green-700 bg-green-50 bg-opacity-50">${tanggalMulai}</td>
            
            <td class="px-4 py-4 text-center font-black text-2xl ${progressColor}">
                ${finalProgressDisplay}
            </td>
            
            <td class="px-4 py-4 text-red-600 font-semibold text-xs leading-relaxed">${row.keterangan || '-'}</td>
          </tr>
        `;
      });
    })
    .catch(err => console.error("Gagal memuat data tabel display:", err));
}

// Socket listener: Jika ada input/edit baru, langsung segarkan (refresh) tabel
socket.on("updateData", loadData);

// Panggil fungsi saat layar TV pertama kali dibuka
loadData();