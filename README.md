# TREM-KU Agent Repository

Repositori ini berisi implementasi *Agentic AI* untuk sistem trem otonom Kota Lama Semarang.

## CHANGELOG
### [2026-09-16]
- **feat:** Mengimplementasikan REST API (`api.js`) berbasis kerangka kerja OpenClaw menggunakan Express.js.
- **feat:** Menambahkan 4 profil kepribadian mandiri (SOUL): DINUS, KOMANDO, INGAT, NARA.
- **feat:** Membuat sistem *Tool Calling* / *Skills* terisolasi per agen (`search_heritage_knowledge`, `check_safety_status`, dll).
- **feat:** Mengintegrasikan klien MQTT persisten (`mqtt_service.js`) untuk menarik telemetri trem dan melakukan *publish* instruksi deselerasi darurat ke EMQX.
- **docs:** Menambahkan `design_telemetry.md` sebagai standar struktur JSON untuk PC ROS2 Edge.
