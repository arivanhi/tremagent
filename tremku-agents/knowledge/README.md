# Template Knowledge RAG Lokal

Folder ini menyimpan sumber pengetahuan lokal TREM-KU. Data dapat berisi destinasi wisata, rute perjalanan, atau informasi kampus UDINUS. Seluruh record menggunakan Bahasa Indonesia dan disimpan sebagai array JSON.

## Pengisian melalui Web

Buka `http://127.0.0.1:3100/knowledge-admin` atau hostname Cloudflare yang diarahkan ke Agent API. Masukkan `KNOWLEDGE_ADMIN_KEY`, pilih jenis knowledge, lalu isi topik, narasi, sumber, dan metadata review.

Jika `KNOWLEDGE_ADMIN_KEY` tidak ditentukan pada `.env`, service membuat key acak pada `data/knowledge_admin.key`. Lihat key lokal dengan `docker compose exec -T agent-api sh -c 'cat /app/data/knowledge_admin.key'`. Jangan membagikan key ini kepada pengguna Agent API biasa.

- Destinasi wajib memiliki satu pasangan latitude dan longitude.
- Rute wajib memiliki minimal titik awal dan titik akhir beserta koordinat masing-masing.
- Informasi kampus dapat menyertakan koordinat gedung secara opsional.
- Status `approved` langsung membuat embedding dan melakukan upsert ke Qdrant.
- Status `draft` atau `archived` tidak aktif di indeks RAG.

Data dari form disimpan pada `data/web-entries.json` dan tetap dapat ditinjau atau dicadangkan sebagai JSON.

## Alur Pembaruan

1. Pilih template dari folder `templates`.
2. Salin template ke folder `data` dengan nama yang menjelaskan isinya, misalnya `destinations-kota-lama-2026.json`.
3. Ganti seluruh placeholder dan cantumkan sumber resmi atau sumber yang dapat diverifikasi.
4. Gunakan `review_status: "draft"` selama penyusunan.
5. Jalankan `npm run validate:knowledge`.
6. Setelah diperiksa penanggung jawab, ubah status menjadi `approved` dan isi `reviewed_by`.
7. Jalankan `npm run seed:knowledge` untuk membuat embedding dan melakukan upsert ke Qdrant.

Perintah Docker:

```powershell
Set-Location D:\serverAI
docker compose exec -T agent-api npm run validate:knowledge
docker compose exec -T agent-api npm run seed:knowledge
```

Perintah lokal:

```powershell
Set-Location D:\tremagent\tremku-agents
npm run validate:knowledge
npm run seed:knowledge
```

## Status Review

- `draft`: masih disusun dan tidak diindeks.
- `needs_review`: menunggu pemeriksaan dan tidak diindeks.
- `needs_curator_review`: data demo lama; dapat diindeks dengan peringatan.
- `approved`: disetujui untuk digunakan.
- `approved_for_demo`: hanya disetujui untuk demonstrasi.
- `archived`: tidak digunakan dan point lama akan dihapus saat proses seed.

## Prinsip Pengisian

- Satu record membahas satu objek utama agar hasil retrieval tetap tepat.
- `content` harus berupa narasi mandiri yang tetap dapat dipahami tanpa membaca field lain.
- Jadwal, harga, nomor kontak, akses jalan, dan informasi operasional harus memiliki tanggal pembaruan serta masa berlaku.
- Informasi keselamatan rute harus berasal dari pengelola atau tim operasional, bukan perkiraan model AI.
- Hindari data pribadi mahasiswa, staf, pengunjung, atau penumpang.
- Gunakan `id` yang stabil. Pembaruan record menggunakan ID yang sama dan menaikkan `version`.
- Jika fakta belum pasti, tetap gunakan status `draft` atau `needs_review`.

## Sumber Data

Prioritaskan sumber resmi seperti pengelola destinasi, Pemerintah Kota Semarang, Dinas Pariwisata, tim operasi TREM-KU, serta situs dan unit resmi Universitas Dian Nuswantoro. URL, penerbit, dan tanggal akses harus dicatat jika tersedia.
